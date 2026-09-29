import CoreGraphics
import CryptoKit
import Foundation

/// The one page this slice opens. It is a practice page written for this project and
/// compiled into the app. It is not a captured course page and claims no course context.
struct PracticePage {
    static let current = PracticePage(
        id: "fixture.practice.linear-equation",
        version: 1,
        title: "Practice: solve a linear equation",
        body: """
            Solve for x and show every step:

                3x + 5 = 20

            Then check your answer by putting it back into the equation.
            """
    )

    /// Ink is stored in this fixed page coordinate space (points, origin at the top left).
    /// The page is always laid out at this size, so saved strokes stay on the same words.
    static let size = CGSize(width: 680, height: 860)

    let id: String
    let version: Int
    let title: String
    let body: String

    var context: PageContext {
        PageContext(
            pageID: id,
            pageVersion: version,
            title: title,
            sourceKind: "owned_bundled_fixture",
            contentSHA256: Self.sha256Hex("\(id)\n\(version)\n\(title)\n\(body)"),
            pageWidth: Double(Self.size.width),
            pageHeight: Double(Self.size.height)
        )
    }

    private static func sha256Hex(_ text: String) -> String {
        SHA256.hash(data: Data(text.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}

/// Identity of the page the ink was written on. It is saved with the ink, and saved ink is
/// only shown on a page with exactly the same identity.
struct PageContext: Codable, Equatable {
    let pageID: String
    let pageVersion: Int
    let title: String
    let sourceKind: String
    let contentSHA256: String
    let pageWidth: Double
    let pageHeight: Double
}
