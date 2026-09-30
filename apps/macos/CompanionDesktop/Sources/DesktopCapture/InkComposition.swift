import CoreGraphics
import Foundation

// A composed image of a kept frame: its raw original, captured with this app's windows excluded by
// the configured filter, with the user's committed ink drawn over it at the revision in force when
// the pixels were on screen. The raw original is never changed; the composed PNG is a separate file
// with its own hash. Nothing is sent anywhere.

/// How ink is drawn, on the overlay and in composed images.
public enum InkStyle {
    /// sRGB (255, 59, 48): AppKit's systemRed in the light appearance, fixed so both match.
    public static let red = 255.0 / 255
    public static let green = 59.0 / 255
    public static let blue = 48.0 / 255
    public static let summary = "sRGB (255, 59, 48); each stroke's own width in points, scaled like the point-to-pixel mapping; "
        + "round caps and joins; antialiased; strokes in creation order; a one-point stroke as a dot"
}

/// One ink document as it was open during a capture, from `opened` until `closed` (host seconds).
/// While it is open, `document` is kept current.
public struct InkSpan: Sendable {
    public var document: InkDocument
    /// `<capture session>/ink/<file name>`.
    public var file: String
    public var opened: Double
    public var closed: Double?
    /// Why its last save failed, if it did.
    public var saveProblem: String?

    public init(document: InkDocument, file: String, opened: Double, closed: Double? = nil, saveProblem: String? = nil) {
        self.document = document
        self.file = file
        self.opened = opened
        self.closed = closed
        self.saveProblem = saveProblem
    }
}

/// The user-original document a composed image draws from.
public struct InkDocumentReference: Codable, Equatable, Sendable {
    public var createdInSession: String
    /// `<capture session>/ink/<file name>`: ink.json or a conflict copy.
    public var file: String
    public var displayID: UInt32
}

/// The ink paired with one kept frame.
public struct PairedInk: Codable, Equatable, Sendable {
    /// The time the ink is paired at, in host seconds, and what it is: `source_time` (the pixels'
    /// validated displayTime) or `callback_admission` (their source time is unknown).
    public var pixelsHost: Double
    public var pixelsTime: String
    /// The document open at that time; nil when none was, so nothing is drawn.
    public var document: InkDocumentReference?
    /// Its committed content revision at that time, and when that revision was committed (nil for
    /// revision 0 or without a document).
    public var revision: Int?
    public var revisionHost: Double?
    /// The strokes visible at that revision, drawn in this order.
    public var strokes: [String]
    public var mapping: String
    public var rendering: String
    public var limits: [String]
}

/// A kept frame's composed image, beside its untouched raw original.
public struct ComposedFrame: Codable, Equatable, Sendable {
    /// The raw original, re-checked against these facts before it was read.
    public var rawSequence: Int
    public var rawFile: String
    public var rawSHA256: String
    public var rawByteLength: Int
    /// The composed PNG, relative to the session directory. When no stroke is drawn it is the raw
    /// original itself (the same file, SHA-256 and length): one file, two references.
    public var file: String
    public var sha256: String
    public var byteLength: Int
    public var width: Int
    public var height: Int
    public var mediaType: String
    public var encoding: String
    public var ink: PairedInk
    /// When it was composed (host seconds); not a capture or live time.
    public var composedHost: Double
}

/// What to compose one kept frame with, or why it must not be composed.
public struct CompositionRequest: Sendable {
    public var frame: KeptFrame
    /// Nil exactly when `problem` is set.
    public var ink: PairedInk?
    /// The strokes to draw, in order; their IDs are `ink.strokes`.
    public var strokes: [InkStroke]
    public var scaleX: Double
    public var scaleY: Double
    public var problem: String?

    /// A frame that must not be composed, and why.
    public static func refused(_ frame: KeptFrame, _ problem: String) -> CompositionRequest {
        CompositionRequest(frame: frame, ink: nil, strokes: [], scaleX: 0, scaleY: 0, problem: problem)
    }
}

public enum InkComposer {
    /// The limitations every paired ink states, in this order, and the ones stated when they apply.
    /// Released 0.2.11 pins these exact texts.
    public static let baseLimits = [
        "strokes still being drawn at that time are not committed in any revision and are not drawn",
        "the raw frame excludes this app's windows by the configured filter; that it held for these pixels is unverified on a Mac",
        "ink changes are known when committed on the main thread; a change within moments of the pixels' time may be paired either way",
    ]
    public static let unknownTimeLimit = "the pixels' own time is unknown; the ink is paired at the callback's admission, which may be later than the pixels"
    public static let noDocumentLimit = "no ink document was open at that time, so nothing is drawn"
    public static let rawAliasLimit = "no stroke is drawn, so the composed image is the raw original itself: one file, two references"

    public static func reopenedLimit(_ revision: Int) -> String {
        "revision \(revision) was committed before this document was last reopened; its commit time may be on another session's or boot's clock and is not given"
    }

    /// The point-to-pixel mapping text for these scales.
    public static func mapping(scaleX: Double, scaleY: Double) -> String {
        "display-local points scaled by frame size / display size in points (\(scaleX) × \(scaleY)); contentRect and scaleFactor are not applied; unverified on a Mac"
    }

    /// Pairs a kept frame with the ink committed when its pixels were on screen: the document open
    /// at that time among `spans`, at its revision then (`InkDocument.revision(at:)`). A frame is
    /// not composed when this capture could not exclude this app's windows (the raw frame may then
    /// hold the ink already), when the display changed before its pixels, or when the revision at
    /// that time is unknown.
    public static func request(for frame: KeptFrame, display: DisplayFacts, spans: [InkSpan],
                               geometry: DisplayGeometry?) -> CompositionRequest {
        func refused(_ problem: String) -> CompositionRequest { .refused(frame, problem) }
        guard display.scope.hasPrefix(DisplayFacts.appExcludedScopePrefix) else {
            return refused("this capture did not exclude this app's windows, so the raw frame may already hold the ink; drawing it again could duplicate it")
        }
        let pixelsHost = frame.sourceHost ?? frame.callbackHost
        guard let geometry else { return refused("no display geometry was recorded for this capture") }
        if let changed = geometry.changedHost, pixelsHost >= changed {
            return refused("before these pixels, " + (geometry.problem ?? "the display's size or rotation changed"))
        }
        guard display.frame.width > 0, display.frame.height > 0, frame.width > 0, frame.height > 0 else {
            return refused("no display or frame size to map points to pixels")
        }
        let scaleX = Double(frame.width) / display.frame.width
        let scaleY = Double(frame.height) / display.frame.height
        var limits = baseLimits
        if frame.sourceHost == nil {
            limits.append(unknownTimeLimit)
        }
        var ink = PairedInk(
            pixelsHost: pixelsHost, pixelsTime: frame.sourceHost == nil ? "callback_admission" : "source_time",
            document: nil, revision: nil, revisionHost: nil, strokes: [],
            mapping: Self.mapping(scaleX: scaleX, scaleY: scaleY),
            rendering: InkStyle.summary, limits: limits)
        guard let span = spans.last(where: { $0.opened <= pixelsHost && $0.closed.map { pixelsHost < $0 } ?? true }) else {
            ink.limits.append(noDocumentLimit)
            return CompositionRequest(frame: frame, ink: ink, strokes: [], scaleX: scaleX, scaleY: scaleY, problem: nil)
        }
        let document = span.document
        guard let revision = document.revision(at: pixelsHost), let strokes = document.visibleStrokes(atRevision: revision) else {
            return refused("the ink revision at the pixels' time is unknown in \(span.file)")
        }
        ink.document = InkDocumentReference(createdInSession: document.createdInSession, file: span.file,
                                            displayID: document.displayID)
        ink.revision = revision
        ink.revisionHost = document.committedHost(ofRevision: revision)
        if revision > 0, ink.revisionHost == nil {
            ink.limits.append(reopenedLimit(revision))
        }
        ink.strokes = strokes.map(\.id)
        if let saveProblem = span.saveProblem {
            ink.limits.append("the document's last save failed (\(saveProblem)); revision \(revision) may not be on disk yet")
        }
        return CompositionRequest(frame: frame, ink: ink, strokes: strokes, scaleX: scaleX, scaleY: scaleY, problem: nil)
    }

    /// The raw image with the strokes drawn over it, at its own size; nil if drawing fails.
    /// Display-local points (origin top-left, y down) are scaled by `scaleX` × `scaleY`.
    public static func render(_ raw: CGImage, strokes: [InkStroke], scaleX: Double, scaleY: Double) -> CGImage? {
        guard let space = CGColorSpace(name: CGColorSpace.sRGB),
              let context = CGContext(data: nil, width: raw.width, height: raw.height, bitsPerComponent: 8, bytesPerRow: 0,
                                      space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        context.draw(raw, in: CGRect(x: 0, y: 0, width: raw.width, height: raw.height))
        // The context's origin is bottom-left; display points run top-down.
        context.translateBy(x: 0, y: CGFloat(raw.height))
        context.scaleBy(x: CGFloat(scaleX), y: CGFloat(-scaleY))
        // An sRGB colour in the sRGB context, so no colour matching changes it.
        context.setStrokeColor(CGColor(srgbRed: CGFloat(InkStyle.red), green: CGFloat(InkStyle.green), blue: CGFloat(InkStyle.blue), alpha: 1))
        context.setLineCap(.round)
        context.setLineJoin(.round)
        for stroke in strokes {
            guard let first = stroke.points.first else { continue }
            context.setLineWidth(CGFloat(stroke.width))
            context.beginPath()
            context.move(to: CGPoint(x: first.x, y: first.y))
            if stroke.points.count == 1 {
                context.addLine(to: CGPoint(x: first.x + 0.01, y: first.y))
            }
            for point in stroke.points.dropFirst() {
                context.addLine(to: CGPoint(x: point.x, y: point.y))
            }
            context.strokePath()
        }
        return context.makeImage()
    }
}

extension InkDocument {
    static let contentKinds: Set<String> = ["stroke", "erase", "undo", "redo"]

    /// The strokes visible at a committed content revision, replayed from the operation history:
    /// each content operation hides its removed strokes and shows its added ones. Nil for a
    /// revision this document never had.
    public func visibleStrokes(atRevision target: Int) -> [InkStroke]? {
        guard (0...revision).contains(target) else { return nil }
        var shown = Set<String>()
        for operation in operations where Self.contentKinds.contains(operation.kind) && operation.revision <= target {
            shown.subtract(operation.removed)
            shown.formUnion(operation.added)
        }
        return strokes.filter { shown.contains($0.id) }
    }

    /// When a content revision was committed (host seconds), by the operations since the last
    /// reopening, as `revision(at:)` counts them: earlier ones may be on another boot's clock. Nil
    /// for revision 0, or for a revision committed before that reopening.
    public func committedHost(ofRevision target: Int) -> Double? {
        let start = operations.lastIndex { $0.kind == "reopened" } ?? operations.startIndex
        return operations[start...].last { Self.contentKinds.contains($0.kind) && $0.revision == target }?.host
    }
}
