import CoreImage
import CoreMedia
import CoreVideo
import Foundation
import ImageIO
import QuartzCore
import ReplayKit

/// The local record of one broadcast session.
///
/// The bounds below are adjustable engineering defaults, to be measured on the device. They are
/// not accepted coverage:
/// - at most one kept keyframe per `minimumKeyframeInterval`;
/// - at most `byteCap` of kept frames per session;
/// - any silence longer than `noFramesGap` is recorded as a gap.
///
/// Whether a frame changed is judged from a sparse luma grid. Equal grids do not prove equal
/// pixels, so such frames are "not retained by heuristic", never "unchanged". Every run of
/// frames that is not retained is written as one or more consecutive events with its sequence
/// and time range; an open run is written at least with every status write, so a killed
/// extension cannot leave counted frames without events. The kept frames are therefore never a
/// complete history of the screen.
final class CaptureSession {
    private let minimumKeyframeInterval = 2.0
    private let noFramesGap = 2.0
    private let byteCap = 512 * 1024 * 1024
    private let gridColumns = 256
    private let gridRows = 192
    private let lumaChangeThreshold = 24
    private let jpegQuality = 0.85

    private struct NotRetainedRun {
        let reason: String
        let firstSequence: Int
        var lastSequence: Int
        let firstTime: Double
        var lastTime: Double
    }

    private let directory: URL
    private let events: FileHandle
    private var status: CaptureStatus
    private let context = CIContext(options: [.cacheIntermediates: false])
    private var lastKeptGrid: [UInt8]?
    private var lastKeptTime: Double?
    private var lastVideoTime: Double?
    private var lastStatusWrite = 0.0
    private var notRetained: NotRetainedRun?

    init(root: URL) throws {
        let now = Date()
        let host = CACurrentMediaTime()
        let id = Self.sessionID(now)
        directory = root.appending(path: id, directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: directory.appending(path: "frames", directoryHint: .isDirectory),
                                                withIntermediateDirectories: true)
        let eventsURL = directory.appending(path: "events.jsonl")
        guard FileManager.default.createFile(atPath: eventsURL.path(percentEncoded: false), contents: nil) else {
            throw CaptureError.cannotStart("events file could not be created")
        }
        events = try FileHandle(forWritingTo: eventsURL)
        status = CaptureStatus(session: id, state: "started", startedWallTime: now, startedHostTime: host,
                               updatedWallTime: now)
        append(CaptureEvent(event: "started", hostTime: host, wallTime: now))
        writeStatus(force: true)
    }

    func lifecycle(_ state: String) {
        let host = CACurrentMediaTime()
        flushNotRetained()
        status.state = state
        append(CaptureEvent(event: state, hostTime: host, wallTime: Date()))
        writeStatus(force: true)
        if state == "finished" {
            try? events.close()
        }
    }

    func audioNotCaptured() {
        if status.audioBuffersNotCaptured == 0 {
            append(CaptureEvent(event: "audio_not_captured", hostTime: CACurrentMediaTime(),
                                detail: ["note": "audio buffers arrive but are not captured in this slice"]))
        }
        status.audioBuffersNotCaptured += 1
    }

    func video(_ sampleBuffer: CMSampleBuffer) {
        status.videoBuffers += 1
        let sequence = status.videoBuffers
        let time = CMSampleBufferGetPresentationTimeStamp(sampleBuffer).seconds
        let host = CACurrentMediaTime()
        defer { writeStatus(force: false) }

        if let lastVideoTime, time - lastVideoTime > noFramesGap {
            gap("no_new_frames", host: host, detail: [
                "from_time": String(lastVideoTime), "to_time": String(time),
                "before_sequence": String(sequence),
                "note": "the screen may not have changed, or frames were not delivered; unknown",
            ])
        }
        lastVideoTime = time

        guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else {
            status.notRetainedWithoutImage += 1
            notRetain("no_image_buffer", sequence: sequence, time: time)
            return
        }
        let grid = lumaGrid(pixelBuffer)
        if let lastKeptGrid, !differs(lastKeptGrid, grid) {
            status.notRetainedByHeuristic += 1
            notRetain("luma_grid_equal_heuristic", sequence: sequence, time: time)
            return
        }
        if let lastKeptTime, time - lastKeptTime < minimumKeyframeInterval {
            status.notRetainedWithinInterval += 1
            notRetain("within_minimum_interval", sequence: sequence, time: time)
            return
        }
        if status.bytesKept >= byteCap {
            status.notRetainedAfterCap += 1
            notRetain("retention_cap_reached", sequence: sequence, time: time)
            return
        }
        keep(pixelBuffer, of: sampleBuffer, sequence: sequence, time: time, host: host, grid: grid)
    }

    // MARK: - Keeping and not keeping frames

    private func keep(_ pixelBuffer: CVPixelBuffer, of sampleBuffer: CMSampleBuffer, sequence: Int,
                      time: Double, host: Double, grid: [UInt8]) {
        flushNotRetained()
        let file = String(format: "frames/%08ld.jpg", sequence)
        let url = directory.appending(path: file)
        do {
            // The stored pixels are the delivered buffer, unrotated; orientation is recorded.
            try context.writeJPEGRepresentation(
                of: CIImage(cvPixelBuffer: pixelBuffer), to: url,
                colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!,
                options: [CIImageRepresentationOption(rawValue: kCGImageDestinationLossyCompressionQuality as String): jpegQuality])
        } catch {
            status.keyframeWriteFailures += 1
            gap("keyframe_write_failed", host: host, detail: [
                "sequence": String(sequence), "time": String(time), "error": error.localizedDescription,
            ])
            return
        }
        let orientation = CMGetAttachment(sampleBuffer, key: RPVideoSampleOrientationKey as CFString,
                                          attachmentModeOut: nil) as? NSNumber
        let record = KeyframeRecord(
            file: file, sequence: sequence, presentationTime: time, hostTime: host,
            width: CVPixelBufferGetWidth(pixelBuffer), height: CVPixelBufferGetHeight(pixelBuffer),
            orientation: orientation?.intValue,
            pixelFormat: Self.fourCC(CVPixelBufferGetPixelFormatType(pixelBuffer)))
        let bytes = (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
        status.keyframesKept += 1
        status.bytesKept += bytes
        status.lastKeyframe = record
        lastKeptGrid = grid
        lastKeptTime = time
        append(CaptureEvent(event: "keyframe", hostTime: host, keyframe: record))
        if status.bytesKept >= byteCap {
            gap("retention_cap_reached", host: host, detail: [
                "after_sequence": String(sequence), "after_time": String(time),
                "note": "later frames are not retained in this session",
            ])
        }
    }

    /// Extends the current run of frames not retained for the same reason, or starts a new one.
    private func notRetain(_ reason: String, sequence: Int, time: Double) {
        if var run = notRetained, run.reason == reason, run.lastSequence == sequence - 1 {
            run.lastSequence = sequence
            run.lastTime = time
            notRetained = run
            return
        }
        flushNotRetained()
        notRetained = NotRetainedRun(reason: reason, firstSequence: sequence, lastSequence: sequence,
                                     firstTime: time, lastTime: time)
    }

    private func flushNotRetained() {
        guard let run = notRetained else { return }
        notRetained = nil
        append(CaptureEvent(event: "not_retained", hostTime: CACurrentMediaTime(), detail: [
            "reason": run.reason,
            "first_sequence": String(run.firstSequence), "last_sequence": String(run.lastSequence),
            "count": String(run.lastSequence - run.firstSequence + 1),
            "first_time": String(run.firstTime), "last_time": String(run.lastTime),
        ]))
    }

    private func gap(_ kind: String, host: Double, detail: [String: String]) {
        flushNotRetained()
        status.gaps += 1
        append(CaptureEvent(event: "gap", hostTime: host, detail: detail.merging(["kind": kind]) { current, _ in current }))
    }

    // MARK: - Change heuristic

    /// Samples a sparse grid of luma values straight from the buffer, without copying it.
    /// Planar buffers (the usual 4:2:0 formats) use plane 0; packed 32-bit buffers use one channel.
    private func lumaGrid(_ buffer: CVPixelBuffer) -> [UInt8] {
        CVPixelBufferLockBaseAddress(buffer, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }
        let planar = CVPixelBufferIsPlanar(buffer)
        guard let base = planar ? CVPixelBufferGetBaseAddressOfPlane(buffer, 0) : CVPixelBufferGetBaseAddress(buffer) else {
            return []
        }
        let rowBytes = planar ? CVPixelBufferGetBytesPerRowOfPlane(buffer, 0) : CVPixelBufferGetBytesPerRow(buffer)
        let width = planar ? CVPixelBufferGetWidthOfPlane(buffer, 0) : CVPixelBufferGetWidth(buffer)
        let height = planar ? CVPixelBufferGetHeightOfPlane(buffer, 0) : CVPixelBufferGetHeight(buffer)
        let pixelStep = planar ? 1 : 4
        let channel = planar ? 0 : 1
        let bytes = base.assumingMemoryBound(to: UInt8.self)
        var grid = [UInt8]()
        grid.reserveCapacity(gridColumns * gridRows)
        for row in 0..<gridRows {
            let y = (2 * row + 1) * height / (2 * gridRows)
            for column in 0..<gridColumns {
                let x = (2 * column + 1) * width / (2 * gridColumns)
                grid.append(bytes[y * rowBytes + x * pixelStep + channel])
            }
        }
        return grid
    }

    /// An empty grid (unreadable buffer) always counts as different, so it is never skipped.
    private func differs(_ a: [UInt8], _ b: [UInt8]) -> Bool {
        a.isEmpty || b.isEmpty || a.count != b.count
            || zip(a, b).contains { abs(Int($0) - Int($1)) > lumaChangeThreshold }
    }

    // MARK: - Files

    /// A failed append is counted, so a nonzero count shows that events.jsonl is incomplete.
    private func append(_ event: CaptureEvent) {
        do {
            var line = try CaptureStore.encoder.encode(event)
            line.append(0x0A)
            try events.seekToEnd()
            try events.write(contentsOf: line)
        } catch {
            status.eventWriteFailures += 1
        }
    }

    private func writeStatus(force: Bool) {
        let host = CACurrentMediaTime()
        guard force || host - lastStatusWrite >= 1 else { return }
        lastStatusWrite = host
        // The status counts frames not retained; their events must exist before it is saved.
        flushNotRetained()
        status.updatedWallTime = Date()
        guard let data = try? CaptureStore.encoder.encode(status) else { return }
        try? data.write(to: directory.appending(path: "status.json"), options: .atomic)
    }

    private static func sessionID(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateFormat = "yyyyMMdd'T'HHmmss'Z'"
        return formatter.string(from: date) + "-" + UUID().uuidString.prefix(8)
    }

    private static func fourCC(_ code: OSType) -> String {
        let characters = [24, 16, 8, 0].map { Character(UnicodeScalar(UInt8((code >> $0) & 0xFF))) }
        return String(characters)
    }
}
