import CoreGraphics
import CoreMedia
import Foundation
import ScreenCaptureKit

/// A rectangle as its source reports it. The unit (points or pixels) is stated where it is used.
public struct RecordedRect: Codable, Equatable, Sendable {
    public var x: Double
    public var y: Double
    public var width: Double
    public var height: Double

    public init(_ rect: CGRect) {
        x = Double(rect.origin.x)
        y = Double(rect.origin.y)
        width = Double(rect.size.width)
        height = Double(rect.size.height)
    }
}

/// What ScreenCaptureKit reported with one screen callback: the sample buffer's presentation time
/// and its `SCStreamFrameInfo` status, displayTime, contentRect, contentScale, scaleFactor and
/// dirtyRects attachments, copied without interpretation. Other keys (screenRect, boundingRect,
/// presenterOverlayContentRect) are not read. A value that is absent or unreadable stays nil;
/// nothing is filled in.
public struct FrameFacts: Codable, Equatable, Sendable {
    /// `SCFrameStatus`: complete, idle, blank, suspended, started or stopped. Another raw value
    /// is `unknown_<raw>`; an absent status attachment is `missing`.
    public var status: String
    /// `SCStreamFrameInfo.displayTime`, in mach ticks.
    public var displayTimeTicks: UInt64?
    /// `displayTimeTicks` converted with this Mac's mach timebase (see `HostClock`).
    public var displayTimeSeconds: Double?
    /// The sample buffer's presentation time in seconds; nil when it is not numeric. It is not a
    /// wall-clock time and not a course playhead.
    public var presentationTime: Double?
    /// `SCStreamFrameInfo.contentRect`, `contentScale` and `scaleFactor`, as reported.
    public var contentRect: RecordedRect?
    public var contentScale: Double?
    public var scaleFactor: Double?
    /// `SCStreamFrameInfo.dirtyRects`, as reported. Nil when absent or unreadable.
    public var dirtyRects: [RecordedRect]?

    public init(sampleBuffer: CMSampleBuffer) {
        self.init(attachments: Self.attachments(of: sampleBuffer),
                  presentationTime: CMSampleBufferGetPresentationTimeStamp(sampleBuffer))
    }

    public init(attachments: [SCStreamFrameInfo: Any]?, presentationTime: CMTime) {
        status = (attachments?[.status] as? NSNumber).map { Self.statusName($0.intValue) } ?? "missing"
        displayTimeTicks = (attachments?[.displayTime] as? NSNumber)?.uint64Value
        displayTimeSeconds = displayTimeTicks.map { HostClock.seconds(ticks: $0) }
        self.presentationTime = presentationTime.isNumeric ? presentationTime.seconds : nil
        contentRect = Self.rect(attachments?[.contentRect])
        contentScale = (attachments?[.contentScale] as? NSNumber)?.doubleValue
        scaleFactor = (attachments?[.scaleFactor] as? NSNumber)?.doubleValue
        if let values = attachments?[.dirtyRects] as? [Any] {
            let rects = values.map { Self.rect($0) }
            dirtyRects = rects.contains { $0 == nil } ? nil : rects.compactMap { $0 }
        } else {
            dirtyRects = nil
        }
    }

    /// The first sample's attachments, as ScreenCaptureKit attaches them.
    static func attachments(of sampleBuffer: CMSampleBuffer) -> [SCStreamFrameInfo: Any]? {
        guard let array = CMSampleBufferGetSampleAttachmentsArray(sampleBuffer, createIfNecessary: false)
                as? [[SCStreamFrameInfo: Any]] else { return nil }
        return array.first
    }

    static func statusName(_ raw: Int) -> String {
        guard let status = SCFrameStatus(rawValue: raw) else { return "unknown_\(raw)" }
        switch status {
        case .complete: return "complete"
        case .idle: return "idle"
        case .blank: return "blank"
        case .suspended: return "suspended"
        case .started: return "started"
        case .stopped: return "stopped"
        @unknown default: return "unknown_\(raw)"
        }
    }

    private static func rect(_ value: Any?) -> RecordedRect? {
        guard let dictionary = value as? NSDictionary,
              let rect = CGRect(dictionaryRepresentation: dictionary as CFDictionary) else { return nil }
        return RecordedRect(rect)
    }
}
