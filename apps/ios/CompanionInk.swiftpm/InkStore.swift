import Foundation
import PencilKit

/// What is saved: the user's own ink as native PencilKit data, with the page it belongs to.
/// A file like this only ever holds the user's layer. Future AI additions belong in a
/// separate layer and never edit this file.
struct UserInkFile: Codable {
    static let userLayer = "user_original"

    var schemaVersion = 1
    var layer = UserInkFile.userLayer
    var authorship = "user"
    let page: PageContext
    let savedAt: Date
    /// `PKDrawing.dataRepresentation()`: the editable original strokes.
    let drawing: Data
}

/// Loads and saves the user's ink for one page, on this device only.
///
/// Data-loss rules:
/// - saving writes the whole file atomically, so a crash leaves the old or the new file;
/// - a file that cannot be read, or belongs to another page, is moved aside unchanged and is
///   never overwritten or shown on this page;
/// - if the file changed on disk since this store last read or wrote it (for example,
///   another window of the app), it is not overwritten: this store saves beside it instead;
/// - a failed save is reported and the ink stays on screen; the next change tries again.
@MainActor
final class InkStore: ObservableObject {
    @Published private(set) var status = ""
    /// The drawing to show when a canvas is created.
    private(set) var drawing = PKDrawing()

    private let page: PageContext
    private let directory: URL
    private let baseName: String
    private var fileURL: URL
    private var lastKnownBytes: Data?

    init(page: PageContext,
         directory: URL = URL.applicationSupportDirectory.appending(path: "Ink", directoryHint: .isDirectory)) {
        let safeID = String(page.pageID.map { character -> Character in
            character.isLetter || character.isNumber || character == "." || character == "-" ? character : "_"
        })
        let base = safeID + "." + UserInkFile.userLayer
        self.page = page
        self.directory = directory
        baseName = base
        fileURL = directory.appending(path: base + ".json")
        load()
    }

    func save(_ newDrawing: PKDrawing) {
        drawing = newDrawing
        let file = UserInkFile(page: page, savedAt: Date(), drawing: newDrawing.dataRepresentation())
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            if (try? Data(contentsOf: fileURL)) != lastKnownBytes {
                fileURL = sibling("conflict")
                lastKnownBytes = nil
            }
            let bytes = try Self.encoder().encode(file)
            try bytes.write(to: fileURL, options: .atomic)
            lastKnownBytes = bytes
            status = "Saved \(newDrawing.strokes.count) strokes at "
                + file.savedAt.formatted(date: .omitted, time: .standard) + " (your original ink, on this device)."
            if fileURL.lastPathComponent != baseName + ".json" {
                status += " Saved separately as \(fileURL.lastPathComponent) so that other saved ink for this page"
                    + " is not overwritten; this copy does not reopen automatically in this build."
            }
        } catch {
            status = "Not saved: \(error.localizedDescription). Your ink is still on screen; the next change will try again."
        }
    }

    private func load() {
        guard FileManager.default.fileExists(atPath: fileURL.path(percentEncoded: false)) else {
            status = "No saved ink for this page yet."
            return
        }
        do {
            let bytes = try Data(contentsOf: fileURL)
            let file = try Self.decoder().decode(UserInkFile.self, from: bytes)
            guard file.layer == UserInkFile.userLayer, file.page == page else {
                setAside(label: "other-page", reason: "it belongs to a different page or layer")
                return
            }
            drawing = try PKDrawing(data: file.drawing)
            lastKnownBytes = bytes
            status = "Restored \(drawing.strokes.count) strokes saved "
                + file.savedAt.formatted(date: .abbreviated, time: .standard) + "."
        } catch {
            setAside(label: "unreadable", reason: "it could not be read (\(error.localizedDescription))")
        }
    }

    /// Keeps an existing file unchanged under a new name, so this page starts empty
    /// without losing it.
    private func setAside(label: String, reason: String) {
        let kept = sibling(label)
        do {
            try FileManager.default.moveItem(at: fileURL, to: kept)
            status = "Earlier ink was kept unchanged as \(kept.lastPathComponent) because \(reason). This page starts empty."
        } catch {
            fileURL = sibling("new")
            status = "Earlier ink was left untouched because \(reason). New ink will be saved separately as"
                + " \(fileURL.lastPathComponent); it does not reopen automatically in this build."
        }
    }

    /// A new, unused file name beside the main file. The random suffix keeps names unique even
    /// when two are made in the same second or the clock goes back.
    private func sibling(_ label: String) -> URL {
        let stamp = Int(Date().timeIntervalSince1970)
        return directory.appending(path: "\(baseName).\(label)-\(stamp)-\(UUID().uuidString.prefix(8)).json")
    }

    private static func encoder() -> JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return encoder
    }

    private static func decoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }
}
