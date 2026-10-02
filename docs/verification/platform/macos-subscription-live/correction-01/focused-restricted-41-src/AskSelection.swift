import Foundation
import FoundationNetworking
import Glibc
import Foundation

// From a confirmed ASK region to the one image and the captured facts a question may be sent
// with. Everything is fixed when the region is confirmed, before any question exists:
// - the editable ink document is frozen as exact bytes, with their SHA-256;
// - the image is the region of the retained frame the selection was pinned to, with the ink
//   visible when the region was drawn drawn over it (when this capture keeps its frames ink-free);
//   its pixel rectangle follows the shared rule of ADR 0003, so the connector's own check of the
//   region against the frame gives the same rectangle;
// - both are written once under `<capture session>/asks/`, beside the originals, and never
//   replaced. The raw frame and the ink file are only read.
// Preparing sends nothing. A request leaves only on the user's explicit Submit (`AskLink`).

/// What the app holds when Finish confirms a region, frozen on the main thread at that moment.
public struct AskSelectionInput: Sendable {
    public var selection: InkSelection
    /// The capture session directory holding the pinned frame's retained original.
    public var captureSession: URL
    public var display: DisplayFacts
    /// The whole editable document as exact JSON bytes, and their SHA-256.
    public var documentBytes: Data
    public var documentSHA256: String
    /// The strokes visible at the selection's revision, in drawing order.
    public var strokes: [InkStroke]

    /// Freezes `document` now. Nil when it cannot be encoded.
    public static func freeze(selection: InkSelection, document: InkDocument, captureSession: URL,
                              display: DisplayFacts) -> AskSelectionInput? {
        guard let bytes = try? CaptureFiles.encoder.encode(document) else { return nil }
        return AskSelectionInput(selection: selection, captureSession: captureSession, display: display, documentBytes: bytes,
                                 documentSHA256: SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined(),
                                 strokes: document.visibleStrokes(atRevision: selection.inkRevision) ?? [])
    }
}

/// One selection made ready: its exact image and context. A question and Submit are still needed.
public struct PreparedSelection: Equatable, Sendable {
    /// Whether the image holds the ink of the selection's revision.
    public enum Ink: String, Equatable, Sendable {
        /// The visible strokes were drawn over an ink-free frame.
        case drawn
        /// The frame is ink-free and no stroke was visible.
        case noneVisible = "none_visible"
        /// The capture did not exclude this app: the pixels may or may not hold ink.
        case unknown
    }

    /// Names this selection's files and requests.
    public var cardID: String
    public var selectionID: String
    public var captureSessionID: String
    /// `<capture session>/asks/`.
    public var directory: URL
    public var image: Data
    public var imageSHA256: String
    public var imageWidth: Int
    public var imageHeight: Int
    public var context: AskRequest.Context
    public var ink: Ink
    /// How the image was made, in fixed words, kept with the request.
    public var composition: String

    func request(id: String, question: String, assistance: AskAssistance) -> AskRequest {
        AskRequest(requestID: id, question: question, assistance: assistance, image: image, imageSHA256: imageSHA256,
                   imageWidth: imageWidth, imageHeight: imageHeight, context: context)
    }
}

public enum AskSelectionBuilder {
    /// Makes the image and context of `input`'s selection and writes `asks/<cardID>.png` and
    /// `asks/<cardID>.ink.json`. Refuses a selection without pixels, with the reason.
    public static func prepare(_ input: AskSelectionInput, cardID: String) -> Result<PreparedSelection, MappingRefusal> {
        let selection = input.selection
        guard DesktopIngress.isIdentifier(cardID) else { return .failure(MappingRefusal("the card ID is not an identifier")) }
        guard let frame = selection.frame, selection.crop != nil, let session = selection.nativeSession else {
            return .failure(MappingRefusal("this selection has no pixels (" + (selection.cropProblem ?? "no retained frame") + ")"))
        }
        let display = input.display
        guard display.frame.width > 0, display.frame.height > 0, display.pointPixelScale.isFinite, display.pointPixelScale > 0,
              frame.width > 0, frame.height > 0 else {
            return .failure(MappingRefusal("no display size was recorded for this selection"))
        }
        // The region in display-local points, clamped to the display, and its pixels in the frame.
        guard let across = span(selection.rect.x, selection.rect.width, display: display.frame.width, frame: frame.width),
              let down = span(selection.rect.y, selection.rect.height, display: display.frame.height, frame: frame.height) else {
            return .failure(MappingRefusal("the selected region lies outside its display"))
        }
        let regionDip = RecordedRect(CGRect(x: across.origin, y: down.origin, width: across.size, height: down.size))
        let rect = RecordedRect(CGRect(x: across.pixel, y: down.pixel, width: across.pixels, height: down.pixels))
        guard rect.width <= Double(AskRequest.maxImagePixels) / rect.height else {
            return .failure(MappingRefusal("the selected region is larger than 16 million pixels"))
        }
        // The retained original, re-checked against its recorded SHA-256 and length; only read.
        let raw: Data
        switch RetainedOriginal.read(file: frame.file, sequence: frame.sequence, sha256: frame.sha256,
                                     byteLength: frame.byteLength, in: input.captureSession) {
        case .success(let bytes): raw = bytes
        case .failure(let refusal): return .failure(refusal)
        }
        guard let source = CGImageSourceCreateWithData(raw as CFData, nil),
              let whole = CGImageSourceCreateImageAtIndex(source, 0, nil), whole.width == frame.width, whole.height == frame.height,
              let region = whole.cropping(to: CGRect(x: rect.x, y: rect.y, width: rect.width, height: rect.height)) else {
            return .failure(MappingRefusal("\(frame.file) cannot be decoded and cropped at its recorded size"))
        }
        // Frames of a capture that excludes this app hold no ink: the ink visible when the region was
        // drawn is drawn over them. Otherwise the pixels may already hold it, and nothing is drawn.
        let excluded = display.scope.hasPrefix(DisplayFacts.appExcludedScopePrefix)
        var image = region
        var ink = PreparedSelection.Ink.unknown
        var composition = "the region of the retained frame \(frame.file) (SHA-256 \(frame.sha256), re-checked), cropped without "
            + "scaling; "
        if excluded, !input.strokes.isEmpty {
            let scaleX = Double(frame.width) / display.frame.width
            let scaleY = Double(frame.height) / display.frame.height
            guard let drawn = InkComposer.render(region: region, originX: Int(rect.x), originY: Int(rect.y), strokes: input.strokes,
                                                 scaleX: scaleX, scaleY: scaleY) else {
                return .failure(MappingRefusal("the ink could not be drawn over the selected region"))
            }
            image = drawn
            ink = .drawn
            composition += "the \(input.strokes.count) stroke(s) visible at ink revision \(selection.inkRevision), when the region was "
                + "drawn, are drawn over it (\(InkStyle.summary)); the frame itself excludes this app's windows by the configured filter"
        } else if excluded {
            ink = .noneVisible
            composition += "no stroke was visible at ink revision \(selection.inkRevision), when the region was drawn, so nothing is "
                + "drawn over it"
        } else {
            composition += "this capture did not exclude this app's windows, so whether these pixels already hold the ink is "
                + "unknown and nothing is drawn over them"
        }
        composition += ". It is a frozen region of that frame, not a live observation."

        let directory = input.captureSession.appending(path: "asks", directoryHint: .isDirectory)
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        } catch {
            return .failure(MappingRefusal("the asks directory cannot be created"))
        }
        let imageFile = directory.appending(path: cardID + ".png")
        let inkFile = directory.appending(path: cardID + ".ink.json")
        guard RetainedOriginal.entryType(imageFile) == nil, RetainedOriginal.entryType(inkFile) == nil else {
            return .failure(MappingRefusal("this card's files already exist; nothing is replaced"))
        }
        guard let destination = CGImageDestinationCreateWithURL(imageFile as CFURL, "public.png" as CFString, 1, nil) else {
            return .failure(MappingRefusal("the selected image cannot be created"))
        }
        CGImageDestinationAddImage(destination, image, nil)
        guard CGImageDestinationFinalize(destination), let bytes = try? Data(contentsOf: imageFile),
              (1...AskRequest.maxImageBytes).contains(bytes.count) else {
            try? FileManager.default.removeItem(at: imageFile)
            return .failure(MappingRefusal("the selected image could not be written, or is larger than 8 MiB"))
        }
        guard AskFiles.writeNew(input.documentBytes, to: inkFile) else {
            // This card's image just written here: no image stays without its ink.
            try? FileManager.default.removeItem(at: imageFile)
            return .failure(MappingRefusal("the editable ink of this selection could not be kept"))
        }
        let context = AskRequest.Context(
            captureSessionID: session, frameSequence: frame.sequence,
            // The retained records keep host-clock times and one wall anchor; a wall time for this
            // frame would be an estimate, so it is not given.
            frameCapturedAt: nil, frameWidth: frame.width, frameHeight: frame.height, displayID: display.displayID,
            displayBounds: display.frame, scaleFactor: display.pointPixelScale,
            regionDip: regionDip, regionPx: rect,
            // A known revision with no hash records that the editable original is not bound to these
            // pixels: whether they hold that ink is not known.
            inkRevision: selection.inkRevision, inkSHA256: ink == .unknown ? nil : input.documentSHA256)
        return .success(PreparedSelection(
            cardID: cardID, selectionID: selection.id, captureSessionID: session, directory: directory, image: bytes,
            imageSHA256: SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined(),
            imageWidth: image.width, imageHeight: image.height, context: context, ink: ink, composition: composition))
    }
}

extension AskSelectionBuilder {
    /// One axis of the region: `origin` and `size` in points clamped to the display, and the frame
    /// pixels they cover by the shared rule of ADR 0003 (the frame's size over the display's size;
    /// the start rounded down, the end rounded up, clamped to the frame). The connector repeats
    /// exactly this arithmetic on the numbers it is sent. Nil for a region with no extent.
    static func span(_ start: Double, _ extent: Double, display: Double, frame: Int)
        -> (origin: Double, size: Double, pixel: Int, pixels: Int)? {
        guard start.isFinite, extent.isFinite, display.isFinite, display > 0, frame > 0 else { return nil }
        let origin = min(max(start, 0), display)
        var size = min(max(start + extent, 0), display) - origin
        // A rounding step must not put the region's end past the display.
        while size > 0, origin + size > display { size = size.nextDown }
        guard size > 0 else { return nil }
        let scale = Double(frame) / display
        let low = max(0, (origin * scale).rounded(.down))
        let high = min(Double(frame), ((origin + size) * scale).rounded(.up))
        guard high > low else { return nil }
        return (origin, size, Int(low), Int(high - low))
    }
}

/// Files kept beside the originals for each question: written once, owner-only, never replaced.
enum AskFiles {
    /// Writes `data` to a new file; false if the file exists or the write is not complete.
    static func writeNew(_ data: Data, to url: URL) -> Bool {
        let path = url.path(percentEncoded: false)
        let descriptor = open(path, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC, 0o600)
        guard descriptor >= 0 else { return false }
        var complete = data.withUnsafeBytes { (buffer: UnsafeRawBufferPointer) -> Bool in
            guard let base = buffer.baseAddress else { return data.isEmpty }
            var offset = 0
            while offset < buffer.count {
                let written = write(descriptor, base + offset, buffer.count - offset)
                if written < 0, errno == EINTR { continue }
                guard written > 0 else { return false }
                offset += written
            }
            return true
        }
        complete = close(descriptor) == 0 && complete
        if !complete { unlink(path) }
        return complete
    }

    /// One JSON object as sorted-key bytes with a final newline.
    static func writeNew(_ value: JSONValue, to url: URL) -> Bool {
        guard var data = try? DesktopJSON.encode(value) else { return false }
        data.append(0x0A)
        return writeNew(data, to: url)
    }
}
