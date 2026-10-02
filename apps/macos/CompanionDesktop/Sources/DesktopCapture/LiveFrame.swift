import CoreGraphics
import CryptoKit
import Foundation
import ImageIO

// From a retained frame and the ink over it to the one whole-display picture a live request is
// sent with. The picture is always the entire kept frame, never a crop: a selection is a separate
// focus rectangle inside it (`LiveFocus`).
// - What is frozen: the retained frame's reference, the display's facts, the editable ink document
//   as exact bytes with their SHA-256, and the strokes visible at one ink revision.
// - What is made: when this capture keeps its frames ink-free and strokes are visible, they are
//   drawn over the frame and the result is kept once under `<capture session>/live/pictures/`.
//   Otherwise the picture is the retained frame's own bytes, and no new file is made.
// - The raw frame and the ink file are only read. Nothing kept is replaced or deleted.
// Making a picture sends nothing (`LiveLink`).

/// What the app holds for one picture, frozen on the main thread: for an unattended look and a
/// follow-up this is the newest kept frame with the ink as it is now; for a selection it is the
/// frame the selection was pinned to, with the ink visible when its region was drawn.
public struct LiveFrameInput: Sendable {
    public var frame: FrameReference
    /// The capture session directory holding the frame's retained original.
    public var captureSession: URL
    public var captureSessionID: String
    public var display: DisplayFacts
    /// The ink revision the strokes are of; nil when no ink document is open.
    public var inkRevision: Int?
    /// The whole editable document as exact JSON bytes, and their SHA-256.
    public var documentBytes: Data?
    public var documentSHA256: String?
    /// The strokes visible at that revision, in drawing order.
    public var strokes: [InkStroke]
    /// Why this capture's frames no longer map to display points (its size or rotation changed);
    /// the ink is then not drawn, and whether the pixels hold it is said as not known.
    public var geometryProblem: String?
    /// Local dispatch authority, never part of the public wire. Current inputs recheck the
    /// recorder's source state; pinned selections need only their still-open capture gate.
    public var currentSourceProblem: (@Sendable () -> String?)? = nil
    public var captureGate: LiveGate? = nil
    public var dispatchGate: LiveGate? = nil

    public var dispatchProblem: String? {
        if captureGate?.isOpen == false { return "this capture has stopped" }
        if dispatchGate?.isOpen == false { return "this AI session has stopped" }
        return currentSourceProblem?()
    }

    /// Freezes `document` now, at `revision` (its current one when nil). A document that cannot be
    /// encoded is treated as no document: nothing is drawn, and no ink is claimed.
    public static func freeze(frame: FrameReference, document: InkDocument?, revision: Int? = nil, captureSession: URL,
                              captureSessionID: String, display: DisplayFacts, geometryProblem: String? = nil) -> LiveFrameInput {
        var input = LiveFrameInput(frame: frame, captureSession: captureSession, captureSessionID: captureSessionID, display: display,
                                   inkRevision: nil, documentBytes: nil, documentSHA256: nil, strokes: [],
                                   geometryProblem: geometryProblem)
        guard let document, let bytes = try? CaptureFiles.encoder.encode(document) else { return input }
        let at = revision ?? document.revision
        input.inkRevision = at
        input.documentBytes = bytes
        input.documentSHA256 = SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined()
        input.strokes = document.visibleStrokes(atRevision: at) ?? []
        return input
    }
}

/// One picture made ready: the exact bytes, what they are, and where they are kept.
public struct LiveRendered: Equatable, Sendable {
    public var picture: LivePicture
    /// The retained frame the picture is of.
    public var frame: FrameReference
    /// Where the exact bytes sent are kept, relative to the capture session: the retained frame's
    /// own file, or a new file under `live/pictures/`.
    public var file: String
    /// Whether the ink is in the picture: drawn over it, none visible, or not known.
    public var ink: PreparedSelection.Ink
    /// Where the frozen editable ink is kept, relative to the capture session, or nil.
    public var inkFile: String?
    /// How the picture was made, in fixed words, kept with each request.
    public var composition: String
}

public enum LiveFrameBuilder {
    /// Makes the whole-display picture of `input`. Refuses, with the reason, a frame that cannot be
    /// read, drawn or kept, and one the connector's request check would not take.
    public static func render(_ input: LiveFrameInput) -> Result<LiveRendered, MappingRefusal> {
        let frame = input.frame, display = input.display
        guard AskWire.isIdentifier(input.captureSessionID) else { return .failure(MappingRefusal("the capture session has no valid name")) }
        guard display.frame.width > 0, display.frame.height > 0, display.pointPixelScale.isFinite, display.pointPixelScale > 0,
              frame.width > 0, frame.height > 0 else {
            return .failure(MappingRefusal("no display size was recorded for this frame"))
        }
        guard frame.width <= LiveTurn.maxImageSide, frame.height <= LiveTurn.maxImageSide,
              frame.width <= LiveTurn.maxImagePixels / frame.height else {
            return .failure(MappingRefusal("the display has more pixels (\(frame.width)×\(frame.height)) than the connector takes (16 million)"))
        }
        // The retained original, re-checked against its recorded SHA-256 and length; only read.
        let raw: Data
        switch RetainedOriginal.read(file: frame.file, sequence: frame.sequence, sha256: frame.sha256,
                                     byteLength: frame.byteLength, in: input.captureSession) {
        case .success(let bytes): raw = bytes
        case .failure(let refusal): return .failure(refusal)
        }
        let live = input.captureSession.appending(path: "live", directoryHint: .isDirectory)
        // Frames of a capture that excludes this app hold no ink: the visible strokes are drawn over
        // them. Otherwise the pixels may already hold ink, and nothing is drawn.
        let excluded = display.scope.hasPrefix(DisplayFacts.appExcludedScopePrefix) && input.geometryProblem == nil
        var png = raw
        var file = frame.file
        var ink = PreparedSelection.Ink.unknown
        var composition = "the whole retained frame \(frame.file) (SHA-256 \(frame.sha256), re-checked), not cropped or scaled; "
        if excluded, !input.strokes.isEmpty, let revision = input.inkRevision {
            guard let source = CGImageSourceCreateWithData(raw as CFData, nil),
                  let whole = CGImageSourceCreateImageAtIndex(source, 0, nil), whole.width == frame.width, whole.height == frame.height else {
                return .failure(MappingRefusal("\(frame.file) cannot be decoded at its recorded size"))
            }
            guard let drawn = InkComposer.render(whole, strokes: input.strokes, scaleX: Double(frame.width) / display.frame.width,
                                                 scaleY: Double(frame.height) / display.frame.height) else {
                return .failure(MappingRefusal("the ink could not be drawn over the frame"))
            }
            let encoded = NSMutableData()
            guard let destination = CGImageDestinationCreateWithData(encoded, "public.png" as CFString, 1, nil) else {
                return .failure(MappingRefusal("the picture cannot be encoded"))
            }
            CGImageDestinationAddImage(destination, drawn, nil)
            guard CGImageDestinationFinalize(destination), encoded.length > 0 else {
                return .failure(MappingRefusal("the picture could not be encoded"))
            }
            png = encoded as Data
            ink = .drawn
            composition += "the \(input.strokes.count) stroke(s) visible at ink revision \(revision) are drawn over it "
                + "(\(InkStyle.summary)); the frame itself excludes this app's windows by the configured filter"
        } else if excluded {
            ink = .noneVisible
            composition += input.inkRevision.map { "no stroke was visible at ink revision \($0), so nothing is drawn over it" }
                ?? "no ink document was open, so nothing is drawn over it"
        } else if let problem = input.geometryProblem {
            composition += "the ink is not drawn (\(problem)), so whether these pixels show it is unknown"
        } else {
            composition += "this capture did not exclude this app's windows, so whether these pixels already hold the ink is "
                + "unknown and nothing is drawn over them"
        }
        guard (1...LiveTurn.maxImageBytes).contains(png.count) else {
            return .failure(MappingRefusal("the picture of the whole display is \(png.count) bytes as a PNG, more than the connector takes (8 MiB)"))
        }
        let sha256 = SHA256.hash(data: png).map { String(format: "%02x", $0) }.joined()
        if ink == .drawn {
            file = "live/pictures/" + sha256 + ".png"
            guard AskFiles.keepOnce(png, at: live.appending(path: "pictures/" + sha256 + ".png")) else {
                return .failure(MappingRefusal("the picture could not be kept on this Mac"))
            }
        }
        var inkFile: String?
        if let bytes = input.documentBytes, let hash = input.documentSHA256 {
            guard AskFiles.keepOnce(bytes, at: live.appending(path: "ink/" + hash + ".json")) else {
                return .failure(MappingRefusal("the editable ink of this picture could not be kept"))
            }
            inkFile = "live/ink/" + hash + ".json"
        }
        let picture = LivePicture(
            png: png, sha256: sha256, width: frame.width, height: frame.height, captureSessionID: input.captureSessionID,
            displayID: display.displayID, displayBounds: display.frame, scaleFactor: display.pointPixelScale,
            // A known revision with no hash records that the editable original is not bound to
            // these pixels: whether they hold that ink is not known.
            inkRevision: input.inkRevision, inkSHA256: ink == .unknown ? nil : input.documentSHA256)
        return .success(LiveRendered(picture: picture, frame: frame, file: file, ink: ink, inkFile: inkFile,
                                     composition: composition + ". It is that kept frame, not a live observation."))
    }
}

extension AskFiles {
    /// Keeps `data` at `url`, whose name is made from its content: written once, or already there
    /// with exactly these bytes. False for anything else at that place, which is left untouched.
    static func keepOnce(_ data: Data, at url: URL) -> Bool {
        do {
            try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        } catch {
            return false
        }
        if writeNew(data, to: url) { return true }
        return RetainedOriginal.entryType(url) == .typeRegular && (try? Data(contentsOf: url)) == data
    }
}

extension LiveFrameInput {
    /// The frame a confirmed selection was pinned to, with the ink visible when its region was
    /// drawn, as it was frozen at Finish. Nil when no frame of a capture was pinned to it.
    public init?(selection input: AskSelectionInput, geometryProblem: String? = nil) {
        guard let frame = input.selection.frame, let session = input.selection.nativeSession else { return nil }
        self.init(frame: frame, captureSession: input.captureSession, captureSessionID: session, display: input.display,
                  inkRevision: input.selection.inkRevision, documentBytes: input.documentBytes,
                  documentSHA256: input.documentSHA256, strokes: input.strokes, geometryProblem: geometryProblem)
    }
}
