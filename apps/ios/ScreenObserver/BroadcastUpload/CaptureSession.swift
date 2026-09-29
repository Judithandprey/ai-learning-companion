import CoreImage
import CoreMedia
import CoreVideo
import Foundation
import QuartzCore
import ReplayKit

/// The local record of one broadcast session.
///
/// The bounds below are adjustable engineering defaults, to be measured on the device. They are
/// not accepted coverage:
/// - at most one keyframe attempt, successful or not, per `minimumKeyframeInterval`;
/// - at most `byteCap` of kept frames per session, checked with each candidate's real size
///   before it is published (`FrameStore`); the first frame that does not fit ends retention
///   for the session with a gap;
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
    private let lumaChangeThreshold = 24

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
    private let frames: FrameStore
    private var lastKeptGrid: [UInt8]?
    private var lastAttemptTime: Double?
    private var capReached = false
    private var lastVideoTime: Double?
    private var lastStatusWrite = 0.0
    private var notRetained: NotRetainedRun?

    init(root: URL) throws {
        let now = Date()
        let host = CACurrentMediaTime()
        let id = Self.sessionID(now)
        directory = root.appending(path: id, directoryHint: .isDirectory)
        let framesDirectory = directory.appending(path: "frames", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: framesDirectory, withIntermediateDirectories: true)
        frames = FrameStore(directory: framesDirectory, byteCap: byteCap)
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
        if capReached {
            status.notRetainedAfterCap += 1
            notRetain("retention_cap_reached", sequence: sequence, time: time)
            return
        }
        if frames.stoppedReason != nil {
            status.notRetainedAfterStop += 1
            notRetain("stopped_after_cleanup_failure", sequence: sequence, time: time)
            return
        }
        let grid = LumaGrid.sample(pixelBuffer)
        if let lastKeptGrid, !LumaGrid.differ(lastKeptGrid, grid, threshold: lumaChangeThreshold) {
            status.notRetainedByHeuristic += 1
            notRetain("luma_grid_equal_heuristic", sequence: sequence, time: time)
            return
        }
        if let lastAttemptTime, time - lastAttemptTime < minimumKeyframeInterval {
            status.notRetainedWithinInterval += 1
            notRetain("within_minimum_interval", sequence: sequence, time: time)
            return
        }
        // The interval bounds attempts, so failures cannot repeat at the callback rate.
        lastAttemptTime = time
        keep(pixelBuffer, of: sampleBuffer, sequence: sequence, time: time, host: host, grid: grid)
    }

    // MARK: - Keeping and not keeping frames

    private func keep(_ pixelBuffer: CVPixelBuffer, of sampleBuffer: CMSampleBuffer, sequence: Int,
                      time: Double, host: Double, grid: [UInt8]) {
        flushNotRetained()
        // The delivered buffer, unrotated; its orientation is recorded, not applied.
        let outcome = frames.keep(CIImage(cvPixelBuffer: pixelBuffer), name: String(format: "%08ld.png", sequence))
        guard case .kept(let name, let byteLength, let sha256) = outcome else {
            if case .notKept(let reason, let detail) = outcome {
                notKept(reason: reason, detail: detail, sequence: sequence, time: time, host: host)
            }
            return
        }
        let orientation = CMGetAttachment(sampleBuffer, key: RPVideoSampleOrientationKey as CFString,
                                          attachmentModeOut: nil) as? NSNumber
        let record = KeyframeRecord(
            file: "frames/" + name, sequence: sequence, presentationTime: time, hostTime: host,
            width: CVPixelBufferGetWidth(pixelBuffer), height: CVPixelBufferGetHeight(pixelBuffer),
            orientation: orientation?.intValue,
            pixelFormat: Self.fourCC(CVPixelBufferGetPixelFormatType(pixelBuffer)),
            mediaType: "image/png", encoding: FrameStore.encoding,
            byteLength: byteLength, sha256: sha256)
        status.keyframesKept += 1
        status.bytesKept = frames.bytesKept
        status.lastKeyframe = record
        lastKeptGrid = grid
        append(CaptureEvent(event: "keyframe", hostTime: host, keyframe: record))
    }

    /// Records a frame that was attempted but not kept. The first frame that does not fit the
    /// budget ends retention for the session; a store that stopped attempts nothing more.
    private func notKept(reason: String, detail: String, sequence: Int, time: Double, host: Double) {
        let facts = ["sequence": String(sequence), "time": String(time), "detail": detail]
        if reason == "over_budget" {
            capReached = true
            gap("retention_cap_reached", host: host, detail: facts.merging([
                "note": "this frame does not fit the remaining budget; later frames are not retained in this session",
            ]) { current, _ in current })
        } else {
            status.keyframeWriteFailures += 1
            gap("keyframe_write_failed", host: host, detail: facts.merging(["reason": reason]) { current, _ in current })
        }
        status.stoppedReason = frames.stoppedReason
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
