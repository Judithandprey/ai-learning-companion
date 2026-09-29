import Foundation

// File rules for the user's saved ink. Foundation only, so they can also be checked on a Mac
// without the app (apps/ios/checks/InkFileCheck).

/// What is saved: the user's own ink as native PencilKit data, with the page it belongs to.
/// A file like this only ever holds the user's layer. Future AI additions belong in a
/// separate layer and never edit this file.
struct UserInkFile: Codable {
    static let currentSchemaVersion = 1
    static let userLayer = "user_original"
    static let userAuthorship = "user"

    var schemaVersion = UserInkFile.currentSchemaVersion
    var layer = UserInkFile.userLayer
    var authorship = UserInkFile.userAuthorship
    let page: PageContext
    let savedAt: Date
    /// `PKDrawing.dataRepresentation()`: the editable original strokes.
    let drawing: Data
}

/// Whether a save may replace the file at `url`, which this store last read or wrote as
/// `lastKnown` (nil if it has not read or written that file).
///
/// Only an absent file, or one whose bytes are exactly `lastKnown`, may be replaced. A file
/// that exists but cannot be read counts as changed, so an original is never replaced
/// because it could not be read.
func mayReplaceInkFile(at url: URL, lastKnown: Data?) -> Bool {
    guard FileManager.default.fileExists(atPath: url.path(percentEncoded: false)) else { return true }
    guard let onDisk = try? Data(contentsOf: url) else { return false }
    return onDisk == lastKnown
}

/// Why a decoded file must not be shown as the user's original ink on `page`, with the label
/// used when it is kept aside; nil if it may be shown.
func rejection(of file: UserInkFile, for page: PageContext) -> (label: String, reason: String)? {
    if file.schemaVersion != UserInkFile.currentSchemaVersion {
        return ("unsupported", "it uses unsupported schema version \(file.schemaVersion)")
    }
    if file.layer != UserInkFile.userLayer || file.authorship != UserInkFile.userAuthorship {
        return ("unsupported", "it is not the user's original ink layer")
    }
    if file.page != page {
        return ("other-page", "it belongs to a different page")
    }
    return nil
}
