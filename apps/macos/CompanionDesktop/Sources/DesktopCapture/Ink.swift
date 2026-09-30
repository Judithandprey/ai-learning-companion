import Foundation

// The user's original ink over one selected display. Only the local, screen-fixed loop exists:
// - NAV/WRITE/ASK routing;
// - pen strokes, partial erase and undo/redo;
// - ASK region selections against retained frames;
// - atomic save and reopen.
// Every stroke ever made stays in the document; erase and undo change only what is visible, and
// every change is an ordered, timed operation. Content-anchored display is not implemented:
// strokes keep their screen position and their original anchor. Nothing is sent to a provider or
// the network.

/// Input routing only, separate from any teaching state. Only WRITE makes ink; ASK only selects;
/// NAV leaves the original app operable.
public enum InputMode: String, Codable, Sendable {
    case nav = "NAV"
    case write = "WRITE"
    case ask = "ASK"
}

public enum InkTool: String, Codable, Sendable {
    case pen
    case eraser
}

/// Where a gesture came from, as AppKit reported it. Pen hardware is untested.
public enum InkDevice: String, Codable, Sendable {
    case mouse
    case tabletPen = "tablet_pen"
    case tabletEraser = "tablet_eraser"
    case tabletOther = "tablet_other"
}

/// One input point with its native facts.
public struct InkPoint: Codable, Equatable, Sendable {
    /// Display-local points: origin at the selected display's top-left corner, y down.
    public var x: Double
    public var y: Double
    /// `NSEvent.timestamp`, in seconds since system start-up, as AppKit reports it.
    public var eventTime: Double
    /// `NSEvent.pressure` and `.tilt` for tablet points; nil for a plain mouse.
    public var pressure: Double?
    public var tiltX: Double?
    public var tiltY: Double?

    public init(x: Double, y: Double, eventTime: Double, pressure: Double? = nil, tiltX: Double? = nil,
                tiltY: Double? = nil) {
        self.x = x
        self.y = y
        self.eventTime = eventTime
        self.pressure = pressure
        self.tiltX = tiltX
        self.tiltY = tiltY
    }
}

/// One retained kept frame, by its recorded facts.
public struct FrameReference: Codable, Equatable, Sendable {
    public var sequence: Int
    public var file: String
    public var sha256: String
    public var byteLength: Int
    public var width: Int
    public var height: Int
    public var callbackHost: Double
    public var sourceHost: Double?

    public init(_ kept: KeptFrame) {
        sequence = kept.sequence
        file = kept.file
        sha256 = kept.sha256
        byteLength = kept.byteLength
        width = kept.width
        height = kept.height
        callbackHost = kept.callbackHost
        sourceHost = kept.sourceHost
    }
}

/// The capture context when a stroke began: its original anchor, kept even though screen-fixed
/// ink does not move with content.
public struct InkAnchor: Codable, Equatable, Sendable {
    public var nativeSession: String?
    /// The latest retained frame at that moment; nil when none had been kept yet.
    public var frame: FrameReference?
    /// `HostClock` seconds.
    public var host: Double

    public init(nativeSession: String?, frame: FrameReference?, host: Double) {
        self.nativeSession = nativeSession
        self.frame = frame
        self.host = host
    }
}

public struct InkStroke: Codable, Equatable, Sendable {
    public var id: String
    /// Creation order; drawing order follows it.
    public var number: Int
    public var device: InkDevice
    public var width: Double
    public var points: [InkPoint]
    public var anchor: InkAnchor
    /// The stroke this piece was cut from by a partial erase; nil for a stroke as written.
    public var parent: String?
    /// Input closed (Stop, error or quit) while this stroke was being drawn; kept as observed.
    public var interrupted: Bool
}

/// One change, in order. Content changes raise the revision; the others record what happened.
public struct InkOperation: Codable, Equatable, Sendable {
    public var sequence: Int
    /// stroke, erase, undo, redo, mode, ask_finished, ask_cancelled, erase_interrupted,
    /// input_closed, reopened or display_changed.
    public var kind: String
    /// `HostClock` seconds.
    public var host: Double
    /// The content revision after this operation.
    public var revision: Int
    public var added: [String]
    public var removed: [String]
    /// For undo and redo: the operation they reverse or repeat.
    public var target: Int?
    public var detail: [String: String]
}

/// A confirmed ASK region. Nothing is sent or explained.
public struct InkSelection: Codable, Equatable, Sendable {
    public var id: String
    public var host: Double
    public var displayID: UInt32
    /// Display-local points.
    public var rect: RecordedRect
    public var nativeSession: String?
    /// The retained frame the region refers to, and the freshness verdict at confirmation.
    public var frame: FrameReference?
    public var freshness: String
    /// The region in that frame's pixels: rect scaled by frame size / display size in points.
    public var framePixelRect: RecordedRect?
    public var pixelMapping: String
    /// The actual pixels: a crop of the exact retained original, written as its own PNG. Nil,
    /// with the reason, when there is no crop.
    public var crop: SelectionCrop?
    public var cropProblem: String?
    /// The content revision when the selection was confirmed, and the committed revision at the
    /// frame's admission time (`InkDocument.revision(at:)`); nil when unknown.
    public var inkRevision: Int
    public var inkRevisionAtFrame: Int?
    /// How the selected pixels are obtained, and whether an ink composite exists.
    public var composition: String
}

/// The user's original layer. AI additions never go in this file.
public struct InkDocument: Codable, Equatable, Sendable {
    public static let currentSchemaVersion = 1
    public static let userLayer = "user_original"

    public var schemaVersion = InkDocument.currentSchemaVersion
    public var layer = InkDocument.userLayer
    public var authorship = "user"
    public var displayMode = "screen_fixed"
    public var contentAnchored = "not implemented: strokes stay at their screen position and keep their original anchor"
    public var coordinates = "display-local points; origin at the selected display's top-left corner; y down"
    public var overlay = "drawn in overlay windows with sharingType none; whether ScreenCaptureKit omits them is unverified, so a kept frame may or may not contain this ink or the controls"
    public var displayID: UInt32
    /// The capture session it was created in; each stroke keeps its own anchor.
    public var createdInSession: String
    public var createdWall: Date
    /// Every stroke ever made, including erased and undone ones.
    public var strokes: [InkStroke] = []
    public var visible: [String] = []
    public var operations: [InkOperation] = []
    public var undoStack: [Int] = []
    public var redoStack: [Int] = []
    public var selections: [InkSelection] = []
    public var revision = 0
    public var nextStrokeNumber = 1

    public init(displayID: UInt32, createdInSession: String, createdWall: Date) {
        self.displayID = displayID
        self.createdInSession = createdInSession
        self.createdWall = createdWall
    }

    public var visibleStrokes: [InkStroke] {
        let shown = Set(visible)
        return strokes.filter { shown.contains($0.id) }
    }

    /// The committed content revision at `host`: that of the last operation at or before it. Only
    /// operations since the last reopening count, because earlier ones belong to another session
    /// (possibly another boot's host clock); a time before that reopening is unknown (nil). A
    /// gesture in progress is not a revision, and this does not say what any pixels show.
    public func revision(at host: Double) -> Int? {
        let start = operations.lastIndex { $0.kind == "reopened" }
        let scoped = start.map { operations[$0...] } ?? operations[...]
        if let start, host < operations[start].host { return nil }
        return scoped.last { $0.host <= host }?.revision ?? 0
    }
}

/// What the app knows when an ASK region is confirmed.
public struct SelectionContext: Sendable {
    public var nativeSession: String?
    public var display: DisplayFacts?
    public var frame: FrameReference?
    public var freshness: String
    /// The crop made for this region (see `SelectionCropper`), or why there is none.
    public var crop: SelectionCrop?
    public var cropProblem: String?

    public init(nativeSession: String?, display: DisplayFacts?, frame: FrameReference?, freshness: String,
                crop: SelectionCrop? = nil, cropProblem: String? = nil) {
        self.nativeSession = nativeSession
        self.display = display
        self.frame = frame
        self.freshness = freshness
        self.crop = crop
        self.cropProblem = cropProblem
    }
}

/// Routing, strokes, erase, undo/redo and ASK for one document. Not thread-safe: the app uses it
/// on the main thread.
public final class InkSession {
    public enum Outcome: Equatable, Sendable {
        case accepted
        case refused(String)
    }

    public static let penWidth = 3.0
    public static let eraserRadius = 8.0

    private enum Gesture {
        case stroke(device: InkDevice, anchor: InkAnchor, points: [InkPoint])
        case erase(points: [InkPoint])
        case select(points: [InkPoint])
    }

    public private(set) var document: InkDocument
    public private(set) var mode: InputMode = .nav
    public private(set) var modeBeforeAsk: InputMode?
    public var tool: InkTool = .pen
    /// Mouse input writes only when the user turns this on.
    public var mouseWritingEnabled = false
    public private(set) var inputClosed = false
    /// The ASK region waiting for Finish or Cancel.
    public private(set) var pendingSelection: RecordedRect?
    private var gesture: Gesture?

    public init(document: InkDocument) {
        self.document = document
    }

    /// Points of the gesture in progress, for drawing it.
    public var gesturePoints: [InkPoint] {
        switch gesture {
        case .stroke(_, _, let points), .erase(let points), .select(let points): return points
        case nil: return []
        }
    }

    public var isErasing: Bool {
        if case .erase = gesture { return true }
        return false
    }

    public var canUndo: Bool { !inputClosed && mode == .write && !document.undoStack.isEmpty }
    public var canRedo: Bool { !inputClosed && mode == .write && !document.redoStack.isEmpty }

    // MARK: - Modes

    @discardableResult
    public func setMode(_ newMode: InputMode, host: Double) -> Outcome {
        guard !inputClosed || newMode == .nav else { return .refused("input is closed") }
        guard newMode != mode else { return .accepted }
        if gesture != nil { _ = end(host: host) }
        let previous = mode
        if newMode == .ask {
            modeBeforeAsk = previous
        } else {
            modeBeforeAsk = nil
        }
        pendingSelection = nil
        mode = newMode
        record("mode", host: host, detail: ["from": previous.rawValue, "to": newMode.rawValue])
        return .accepted
    }

    // MARK: - Gestures

    /// Starts a gesture. NAV takes none; WRITE takes pen input, and mouse input only when mouse
    /// writing is on; ASK takes a region drag.
    public func begin(at point: InkPoint, device: InkDevice, anchor: InkAnchor) -> Outcome {
        guard !inputClosed else { return .refused("input is closed") }
        // A gesture that never saw its end is committed first, so none of its points are lost.
        if gesture != nil { end(host: anchor.host) }
        switch mode {
        case .nav:
            return .refused("NAV: input belongs to the original app")
        case .write:
            if device == .mouse && !mouseWritingEnabled {
                return .refused("mouse writing is off; turn it on or use a pen")
            }
            gesture = tool == .eraser || device == .tabletEraser
                ? .erase(points: [point])
                : .stroke(device: device, anchor: anchor, points: [point])
        case .ask:
            gesture = .select(points: [point])
        }
        return .accepted
    }

    public func extend(to point: InkPoint) {
        switch gesture {
        case .stroke(let device, let anchor, var points):
            points.append(point)
            gesture = .stroke(device: device, anchor: anchor, points: points)
        case .erase(var points):
            points.append(point)
            gesture = .erase(points: points)
        case .select(var points):
            points.append(point)
            gesture = .select(points: points)
        case nil:
            break
        }
    }

    /// Ends the gesture: a stroke is committed, an erase is applied, a drag becomes the pending
    /// ASK region.
    @discardableResult
    public func end(host: Double) -> Outcome {
        guard let current = gesture else { return .refused("no gesture in progress") }
        gesture = nil
        switch current {
        case .stroke(let device, let anchor, let points):
            commitStroke(device: device, anchor: anchor, points: points, interrupted: false, host: host)
            return .accepted
        case .erase(let points):
            return applyErase(along: points, host: host)
        case .select(let points):
            let xs = points.map(\.x), ys = points.map(\.y)
            guard let minX = xs.min(), let maxX = xs.max(), let minY = ys.min(), let maxY = ys.max(),
                  maxX > minX, maxY > minY else {
                return .refused("a selection needs an area; drag across the region")
            }
            pendingSelection = RecordedRect(CGRect(x: minX, y: minY, width: maxX - minX, height: maxY - minY))
            return .accepted
        }
    }

    // MARK: - Undo and redo

    @discardableResult
    public func undo(host: Double) -> Outcome {
        guard canUndo, let target = document.undoStack.popLast(),
              let operation = document.operations.first(where: { $0.sequence == target }) else {
            return .refused("nothing to undo")
        }
        document.redoStack.append(target)
        change(kind: "undo", added: operation.removed, removed: operation.added, target: target, host: host)
        return .accepted
    }

    @discardableResult
    public func redo(host: Double) -> Outcome {
        guard canRedo, let target = document.redoStack.popLast(),
              let operation = document.operations.first(where: { $0.sequence == target }) else {
            return .refused("nothing to redo")
        }
        document.undoStack.append(target)
        change(kind: "redo", added: operation.added, removed: operation.removed, target: target, host: host)
        return .accepted
    }

    // MARK: - ASK

    /// Confirms the pending region and restores the mode that was active before ASK.
    public func finishAsk(_ context: SelectionContext, host: Double) -> InkSelection? {
        guard mode == .ask, let rect = pendingSelection else { return nil }
        let (pixelRect, mapping) = Self.pixelRect(for: rect, frame: context.frame, display: context.display)
        let atFrame = context.frame.flatMap { document.revision(at: $0.callbackHost) }
        let committed = atFrame.map { "the committed ink revision at that frame's admission was \($0)" }
            ?? "the ink revision at that frame's admission is unknown (the frame precedes this document's reopening)"
        let composition: String
        if let frame = context.frame {
            let pixels = context.crop == nil
                ? "No crop was made (\(context.cropProblem ?? "no reason recorded")); the frame \(frame.file) (callback \(frame.callbackHost) s) is referenced only."
                : "The crop is a frozen region of the retained frame \(frame.file) (callback \(frame.callbackHost) s), not a live observation."
            composition = pixels + " Whether that frame's pixels contain this ink or the controls is unverified; \(committed)."
                + " No ink composite is rendered: over pixels that may already hold this ink it could duplicate it. The ink is kept as strokes at revision \(document.revision)."
        } else {
            composition = "no retained frame; only the region and the ink revision are recorded, and no pixels are selected"
        }
        let selection = InkSelection(
            id: nextSelectionID, host: host, displayID: document.displayID, rect: rect,
            nativeSession: context.nativeSession, frame: context.frame, freshness: context.freshness,
            framePixelRect: pixelRect, pixelMapping: mapping, crop: context.crop,
            cropProblem: context.crop == nil ? (context.cropProblem ?? "no crop was made") : nil,
            inkRevision: document.revision, inkRevisionAtFrame: atFrame, composition: composition)
        document.selections.append(selection)
        let restored = modeBeforeAsk ?? .nav
        record("ask_finished", host: host, detail: ["selection": selection.id, "restored_mode": restored.rawValue])
        leaveAsk(to: restored)
        return selection
    }

    /// The identifier the next confirmed selection gets.
    public var nextSelectionID: String { "a\(document.selections.count + 1)" }

    /// A display-local rectangle in a frame's pixels: scaled by frame size / display size in points.
    public static func pixelRect(for rect: RecordedRect, frame: FrameReference?, display: DisplayFacts?)
        -> (rect: RecordedRect?, mapping: String) {
        guard let frame else { return (nil, "no retained frame yet; no pixels are selected") }
        guard let display, display.frame.width > 0, display.frame.height > 0 else {
            return (nil, "no display size to map points to pixels")
        }
        let sx = Double(frame.width) / display.frame.width
        let sy = Double(frame.height) / display.frame.height
        return (RecordedRect(CGRect(x: rect.x * sx, y: rect.y * sy, width: rect.width * sx, height: rect.height * sy)),
                "display-local points scaled by frame size / display size in points (\(sx) × \(sy)); contentRect and scaleFactor are not applied; unverified on a Mac")
    }

    /// Drops the pending region and restores the mode that was active before ASK.
    @discardableResult
    public func cancelAsk(host: Double) -> Outcome {
        guard mode == .ask else { return .refused("not in ASK") }
        let restored = modeBeforeAsk ?? .nav
        record("ask_cancelled", host: host, detail: ["restored_mode": restored.rawValue])
        leaveAsk(to: restored)
        return .accepted
    }

    private func leaveAsk(to restored: InputMode) {
        gesture = nil
        pendingSelection = nil
        modeBeforeAsk = nil
        mode = restored
    }

    // MARK: - Closing and reopening

    /// Stop, a stream error or quit: input closes first. A stroke in progress is kept as
    /// interrupted; an unfinished erase or selection changes nothing and is recorded as such.
    public func closeInput(reason: String, host: Double) {
        guard !inputClosed else { return }
        switch gesture {
        case .stroke(let device, let anchor, let points):
            commitStroke(device: device, anchor: anchor, points: points, interrupted: true, host: host)
        case .erase(let points):
            record("erase_interrupted", host: host, detail: ["points": String(points.count)])
        case .select, nil:
            break
        }
        gesture = nil
        if mode == .ask {
            record("ask_cancelled", host: host, detail: ["restored_mode": InputMode.nav.rawValue, "reason": reason])
        }
        pendingSelection = nil
        modeBeforeAsk = nil
        mode = .nav
        inputClosed = true
        record("input_closed", host: host, detail: ["reason": reason])
    }

    /// Records that the display's geometry changed; strokes keep their recorded coordinates.
    public func displayChanged(widthPoints: Double, heightPoints: Double, host: Double) {
        record("display_changed", host: host, detail: ["width_points": String(widthPoints), "height_points": String(heightPoints)])
    }

    /// Records that a saved document was opened again for editing, in `nativeSession`.
    public func reopened(nativeSession: String?, host: Double) {
        record("reopened", host: host, detail: ["session": nativeSession ?? "none"])
    }

    // MARK: - Changes

    private func commitStroke(device: InkDevice, anchor: InkAnchor, points: [InkPoint], interrupted: Bool,
                              host: Double) {
        let stroke = InkStroke(id: "s\(document.nextStrokeNumber)", number: document.nextStrokeNumber, device: device,
                               width: Self.penWidth, points: points, anchor: anchor, parent: nil, interrupted: interrupted)
        document.nextStrokeNumber += 1
        document.strokes.append(stroke)
        let sequence = change(kind: "stroke", added: [stroke.id], removed: [], target: nil, host: host,
                              detail: interrupted ? ["interrupted": "true"] : [:])
        document.undoStack.append(sequence)
        document.redoStack.removeAll()
    }

    /// Removes the points of visible strokes within the eraser radius of its path. A stroke that
    /// loses some points is replaced by its remaining runs, as new pieces; the original is kept.
    private func applyErase(along path: [InkPoint], host: Double) -> Outcome {
        var removed: [String] = []
        var pieces: [InkStroke] = []
        for stroke in document.visibleStrokes {
            let hit = stroke.points.map { point in Self.distance(from: point, to: path) <= Self.eraserRadius }
            guard hit.contains(true) else { continue }
            removed.append(stroke.id)
            var run: [InkPoint] = []
            for (point, erased) in zip(stroke.points, hit) {
                if erased {
                    if !run.isEmpty { pieces.append(piece(of: stroke, run)) }
                    run = []
                } else {
                    run.append(point)
                }
            }
            if !run.isEmpty { pieces.append(piece(of: stroke, run)) }
        }
        guard !removed.isEmpty else { return .refused("nothing under the eraser") }
        document.strokes.append(contentsOf: pieces)
        let sequence = change(kind: "erase", added: pieces.map(\.id), removed: removed, target: nil, host: host,
                              detail: ["eraser_points": String(path.count)])
        document.undoStack.append(sequence)
        document.redoStack.removeAll()
        return .accepted
    }

    private func piece(of stroke: InkStroke, _ points: [InkPoint]) -> InkStroke {
        defer { document.nextStrokeNumber += 1 }
        return InkStroke(id: "s\(document.nextStrokeNumber)", number: document.nextStrokeNumber, device: stroke.device,
                         width: stroke.width, points: points, anchor: stroke.anchor, parent: stroke.id,
                         interrupted: stroke.interrupted)
    }

    /// Applies a content change and records it; returns its operation sequence.
    @discardableResult
    private func change(kind: String, added: [String], removed: [String], target: Int?, host: Double,
                        detail: [String: String] = [:]) -> Int {
        let hidden = Set(removed)
        let shown = Set(document.visible).subtracting(hidden).union(added)
        document.visible = document.strokes.filter { shown.contains($0.id) }.map(\.id)
        document.revision += 1
        return record(kind, host: host, added: added, removed: removed, target: target, detail: detail)
    }

    @discardableResult
    private func record(_ kind: String, host: Double, added: [String] = [], removed: [String] = [], target: Int? = nil,
                        detail: [String: String] = [:]) -> Int {
        let sequence = (document.operations.last?.sequence ?? 0) + 1
        document.operations.append(InkOperation(sequence: sequence, kind: kind, host: host, revision: document.revision,
                                                added: added, removed: removed, target: target, detail: detail))
        return sequence
    }

    /// Distance from a point to the eraser's path (its points joined by segments).
    static func distance(from point: InkPoint, to path: [InkPoint]) -> Double {
        guard let first = path.first else { return .infinity }
        var best = hypot(point.x - first.x, point.y - first.y)
        for (a, b) in zip(path, path.dropFirst()) {
            let dx = b.x - a.x, dy = b.y - a.y
            let lengthSquared = dx * dx + dy * dy
            let t = lengthSquared == 0 ? 0 : max(0, min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared))
            best = min(best, hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy)))
        }
        return best
    }
}

// MARK: - Storage

/// Saves one ink document as `<capture session>/ink/ink.json`, with the iOS ink store's rules:
/// - every save writes the whole file atomically, so a crash leaves the old or the new file;
/// - a file that changed on disk since this store last read or wrote it, or that exists but
///   cannot be read, is never replaced; the document is saved beside it instead, and later saves
///   go there;
/// - nothing is deleted.
public final class InkStore {
    public private(set) var fileURL: URL
    private var lastKnown: Data?

    public init(sessionDirectory: URL) {
        fileURL = sessionDirectory.appending(path: "ink", directoryHint: .isDirectory).appending(path: "ink.json")
    }

    /// Reads the document; refuses another schema or layer. The file is not changed.
    public func load() throws -> InkDocument {
        let bytes = try Data(contentsOf: fileURL)
        let document = try CaptureFiles.decoder.decode(InkDocument.self, from: bytes)
        guard document.schemaVersion == InkDocument.currentSchemaVersion, document.layer == InkDocument.userLayer,
              document.authorship == "user" else {
            throw MappingRefusal("\(fileURL.lastPathComponent) is not a schema-\(InkDocument.currentSchemaVersion) user-original ink file")
        }
        lastKnown = bytes
        return document
    }

    /// Returns the file actually written.
    @discardableResult
    public func save(_ document: InkDocument) throws -> URL {
        try FileManager.default.createDirectory(at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        if FileManager.default.fileExists(atPath: fileURL.path(percentEncoded: false)),
           (try? Data(contentsOf: fileURL)) != lastKnown || lastKnown == nil {
            fileURL = fileURL.deletingLastPathComponent().appending(path: "ink.conflict-\(UUID().uuidString.prefix(8)).json")
            lastKnown = nil
        }
        let bytes = try CaptureFiles.encoder.encode(document)
        try bytes.write(to: fileURL, options: .atomic)
        lastKnown = bytes
        return fileURL
    }

    /// The capture session under `root` whose `ink/ink.json` is a readable user document for
    /// `displayID` with at least one stroke, most recently saved first, other than the `excluded`
    /// sessions. Conflict copies (`ink.conflict-*.json`) are not considered.
    public static func latestDocument(in root: URL, displayID: UInt32, excluding excluded: [URL] = []) -> URL? {
        let skipped = Set(excluded.map(\.lastPathComponent))
        let sessions = (try? FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)) ?? []
        let candidates = sessions.filter { !skipped.contains($0.lastPathComponent) }.compactMap { session -> (URL, Date)? in
            let file = session.appending(path: "ink/ink.json")
            guard let bytes = try? Data(contentsOf: file),
                  let document = try? CaptureFiles.decoder.decode(InkDocument.self, from: bytes),
                  document.schemaVersion == InkDocument.currentSchemaVersion, document.layer == InkDocument.userLayer,
                  document.displayID == displayID, !document.strokes.isEmpty else { return nil }
            let saved = (try? FileManager.default.attributesOfItem(atPath: file.path(percentEncoded: false)))?[.modificationDate] as? Date
            return (session, saved ?? .distantPast)
        }
        return candidates.max { ($0.1, $0.0.lastPathComponent) < ($1.1, $1.0.lastPathComponent) }?.0
    }
}
