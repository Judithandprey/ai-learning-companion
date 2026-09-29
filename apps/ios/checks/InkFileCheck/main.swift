// Executed data-loss check for the ink file rules in CompanionInk.swiftpm/InkFile.swift.
// Builds without the app, on any Mac with Xcode (for example the hosted macos-26 runner):
//
//   xcrun swiftc -target arm64-apple-macos14 \
//     apps/ios/CompanionInk.swiftpm/InkFile.swift \
//     apps/ios/CompanionInk.swiftpm/PracticePage.swift \
//     apps/ios/checks/InkFileCheck/main.swift -o ink-file-check && ./ink-file-check
//
// It uses the real file system in a temporary directory and exits non-zero on any failure.

import Foundation

var failures = 0

func expect(_ condition: Bool, _ name: String) {
    print((condition ? "PASS " : "FAIL ") + name)
    if !condition { failures += 1 }
}

func setPermissions(_ mode: Int, _ url: URL) throws {
    try FileManager.default.setAttributes([.posixPermissions: mode], ofItemAtPath: url.path(percentEncoded: false))
}

let fileManager = FileManager.default
let directory = fileManager.temporaryDirectory.appending(path: "ink-file-check-\(UUID().uuidString)",
                                                         directoryHint: .isDirectory)
try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)

// Replace rule used before every save.
let file = directory.appending(path: "page.user_original.json")
let original = Data("original user ink".utf8)

expect(mayReplaceInkFile(at: file, lastKnown: nil), "an absent file may be written")
try original.write(to: file)
expect(!mayReplaceInkFile(at: file, lastKnown: nil), "an existing file this store never read is not replaced")
expect(mayReplaceInkFile(at: file, lastKnown: original), "the file this store last wrote may be replaced")
expect(!mayReplaceInkFile(at: file, lastKnown: Data("older".utf8)), "a file changed on disk is not replaced")

try setPermissions(0o000, file)
if (try? Data(contentsOf: file)) != nil {
    print("SKIP unreadable-file cases: this process can read a mode-000 file (for example, it runs as root)")
} else {
    expect(!mayReplaceInkFile(at: file, lastKnown: nil),
           "an existing but unreadable file is not replaced (reported defect at 5d5d8cb)")
    expect(!mayReplaceInkFile(at: file, lastKnown: original),
           "an unreadable file is not replaced even if this store wrote it earlier")
}
try setPermissions(0o600, file)
expect((try? Data(contentsOf: file)) == original, "the original bytes are unchanged")

// Which decoded files may be shown as the user's original ink.
let page = PracticePage.current.context
let drawing = Data([1, 2, 3])
let savedAt = Date(timeIntervalSince1970: 0)

expect(rejection(of: UserInkFile(page: page, savedAt: savedAt, drawing: drawing), for: page) == nil,
       "a version-1 user-original file for this page is accepted")
expect(rejection(of: UserInkFile(schemaVersion: 2, page: page, savedAt: savedAt, drawing: drawing), for: page)?.label
       == "unsupported", "an unsupported schema version is rejected")
expect(rejection(of: UserInkFile(authorship: "ai", page: page, savedAt: savedAt, drawing: drawing), for: page)?.label
       == "unsupported", "non-user authorship is rejected")
expect(rejection(of: UserInkFile(layer: "ai_supplement", page: page, savedAt: savedAt, drawing: drawing), for: page)?.label
       == "unsupported", "a non-user layer is rejected")
let otherPage = PageContext(pageID: "fixture.other", pageVersion: 1, title: page.title, sourceKind: page.sourceKind,
                            contentSHA256: page.contentSHA256, pageWidth: page.pageWidth, pageHeight: page.pageHeight)
expect(rejection(of: UserInkFile(page: otherPage, savedAt: savedAt, drawing: drawing), for: page)?.label
       == "other-page", "ink saved for another page is rejected")

// The saved envelope round-trips with the same coding settings as the app.
let encoder = JSONEncoder()
encoder.dateEncodingStrategy = .iso8601
let decoder = JSONDecoder()
decoder.dateDecodingStrategy = .iso8601
let decoded = try decoder.decode(UserInkFile.self,
                                 from: encoder.encode(UserInkFile(page: page, savedAt: savedAt, drawing: drawing)))
expect(decoded.page == page && decoded.drawing == drawing && decoded.savedAt == savedAt
       && rejection(of: decoded, for: page) == nil, "the envelope round-trips unchanged")

try? fileManager.removeItem(at: directory)
if failures > 0 {
    print("\(failures) ink file check(s) failed")
    exit(1)
}
print("all ink file checks passed")
