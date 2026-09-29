import UIKit
import XCTest

/// QA-IOS-01: independent Simulator acceptance of the CompanionInk owned-page ink slice.
///
/// It drives the installed app by bundle ID and never edits the app. Each test is one phase.
/// tests/e2e/ios/qa_ios_01/run.sh runs the phases in order, checks the saved files between them,
/// and prepares the file conditions some phases need.
///
/// Touches are finger touches synthesized by XCUITest, with "Finger ink" turned on. No Apple
/// Pencil is exercised, and nothing here is physical-device evidence.
final class QAIOS01UITests: XCTestCase {
    private let app = XCUIApplication(bundleIdentifier: "org.example.learningcompanion.ink")

    private let title = "Practice: solve a linear equation"
    private let noInk = "No saved ink for this page yet."
    private let navHint = "NAV: read and scroll the page. Ink is off."
    private let askHint = "ASK: AI help is not connected in this build. Nothing was selected or sent."
    private let fingerWriteHint = "WRITE: Apple Pencil and fingers both write (finger ink is on)."
    private let sideFilePrefix = "fixture.practice.linear-equation.user_original."

    /// Fractions of differing pixels in the 680 x 860 pt page crop. One 320 pt stroke is about 0.2 %.
    private let unchangedBelow = 0.0002
    private let drawnAbove = 0.0004

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    // MARK: - Phases (run.sh calls them in this order)

    /// Fresh install. With finger ink already on (so only the mode gate can stop drawing), NAV and
    /// ASK drags must not draw or save; ASK is honest about no AI.
    func test_1a_launch_nav_and_ask_do_not_draw() throws {
        app.launch()
        expectLaunchState(status: noInk)
        enterWriteWithFingerInk()
        select("NAV")
        expectText(navHint)
        let before = pageShot("1a-before")

        dragAcrossPage(row: 1)
        XCTAssertLessThan(difference(before, pageShot("1a-after-nav-drag")), unchangedBelow, "a NAV drag changed the page")
        expectStatus(noInk)

        select("ASK")
        expectText(askHint)
        XCTAssertFalse(app.segmentedControls.buttons["Pen"].exists, "pen/eraser tools are offered outside WRITE")
        XCTAssertFalse(app.switches["Finger ink"].exists, "the finger-ink switch is offered outside WRITE")
        dragAcrossPage(row: 1)
        XCTAssertLessThan(difference(before, pageShot("1a-after-ask-drag")), unchangedBelow, "an ASK drag changed the page")
        expectStatus(noInk)
        app.terminate()
    }

    /// WRITE with finger ink: three strokes are saved one by one; the eraser removes one.
    func test_1b_write_three_strokes_and_erase_one() throws {
        app.launch()
        expectLaunchState(status: noInk)
        enterWriteWithFingerInk()
        let empty = pageShot("1b-empty")

        for row in 1...3 {
            drawStroke(row: row)
            expectStatus("Saved \(row) strokes at ")
        }
        XCTAssertGreaterThan(difference(empty, pageShot("1b-three-strokes")), drawnAbove, "the strokes are not visible")

        select("Eraser")
        eraseStroke(row: 2)
        expectStatus("Saved 2 strokes at ")
        XCTAssertGreaterThan(difference(empty, pageShot("p1-final")), drawnAbove, "the two remaining strokes are not visible")
        assertNoAnswerShown()
        app.terminate()
    }

    /// Relaunch: the saved strokes come back in NAV, and loading them is not a save.
    func test_2_relaunch_restores_without_saving() throws {
        app.launch()
        expectLaunchState(status: "Restored 2 strokes saved ")
        stablePageShot("p2-restored")
        app.terminate()
    }

    /// Restored ink stays editable: add a stroke, then erase one of the restored strokes.
    func test_3_continue_editing_restored_ink() throws {
        app.launch()
        expectStatus("Restored 2 strokes saved ")
        enterWriteWithFingerInk()
        drawStroke(row: 4)
        expectMainFileSave("Saved 3 strokes at ")
        select("Eraser")
        eraseStroke(row: 1)
        expectMainFileSave("Saved 2 strokes at ")
        pageShot("p3-final")
        app.terminate()
    }

    /// run.sh replaced the Ink directory with a plain file, so saving must fail visibly while the
    /// ink stays on screen.
    func test_4_failed_save_keeps_ink_on_screen() throws {
        app.launch()
        expectStatus(noInk)
        enterWriteWithFingerInk()
        let before = pageShot("4-before")
        drawStroke(row: 2)
        let status = expectStatus("Not saved: ")
        XCTAssertTrue(status.label.contains("Your ink is still on screen"), "failed-save status: \(status.label)")
        let afterFirst = pageShot("4-after-failed-save")
        XCTAssertGreaterThan(difference(before, afterFirst), drawnAbove, "the unsaved stroke is not visible")
        // The failure text has no timestamp, so a retry is not observable from the status; only
        // that the next stroke is also drawn and the status still reports the failure.
        drawStroke(row: 3)
        XCTAssertGreaterThan(difference(afterFirst, pageShot("4-after-second-stroke")), drawnAbove, "the second unsaved stroke is not visible")
        expectStatus("Not saved: ")
        app.terminate()
    }

    /// run.sh wrote invalid bytes into the saved file: the app keeps them aside and starts empty.
    func test_5_unreadable_file_is_kept_aside() throws {
        app.launch()
        let status = expectStatus("Earlier ink was kept unchanged as \(sideFilePrefix)unreadable-")
        XCTAssertTrue(status.label.contains("This page starts empty"), "unreadable-file status: \(status.label)")
        stablePageShot("p5-empty")
        app.terminate()
    }

    /// run.sh launched the app, which read the saved file, and then made that file unreadable
    /// (mode 000). This test attaches to the running app without relaunching it. The next save must
    /// go beside the original, never over it.
    func test_6_unreadable_at_save_writes_beside() throws {
        app.activate()
        expectStatus("Restored 2 strokes saved ")
        enterWriteWithFingerInk()
        drawStroke(row: 3)
        let status = expectStatus("Saved 3 strokes at ")
        XCTAssertTrue(status.label.contains("Saved separately as \(sideFilePrefix)conflict-"),
                      "the save did not go to a conflict file: \(status.label)")
        app.terminate()
    }

    // MARK: - Helpers

    private func expectLaunchState(status: String, file: StaticString = #filePath, line: UInt = #line) {
        expectText(title, file: file, line: line)
        expectSelected("NAV", file: file, line: line)
        expectText(navHint, file: file, line: line)
        expectStatus(status, file: file, line: line)
        let footer = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "a bundled practice page, not a captured course page")).firstMatch
        XCTAssertTrue(footer.waitForExistence(timeout: 5), "the page-source footer is missing; texts: \(texts())", file: file, line: line)
    }

    @discardableResult
    private func expectStatus(_ prefix: String, timeout: TimeInterval = 10, file: StaticString = #filePath, line: UInt = #line) -> XCUIElement {
        let element = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", prefix)).firstMatch
        if !element.waitForExistence(timeout: timeout) {
            XCTFail("no text starts with \"\(prefix)\"; texts: \(texts())", file: file, line: line)
        }
        return element
    }

    private func expectText(_ label: String, file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertTrue(app.staticTexts[label].waitForExistence(timeout: 10), "missing text \"\(label)\"; texts: \(texts())", file: file, line: line)
    }

    private func texts() -> [String] {
        app.staticTexts.allElementsBoundByIndex.map(\.label)
    }

    private func select(_ segment: String, file: StaticString = #filePath, line: UInt = #line) {
        let button = app.segmentedControls.buttons[segment]
        XCTAssertTrue(button.waitForExistence(timeout: 5), "segment \(segment) is missing", file: file, line: line)
        button.tap()
        expectSelected(segment, file: file, line: line)
    }

    private func expectSelected(_ segment: String, file: StaticString = #filePath, line: UInt = #line) {
        let button = app.segmentedControls.buttons[segment]
        let selected = XCTNSPredicateExpectation(predicate: NSPredicate(format: "isSelected == true"), object: button)
        XCTAssertEqual(XCTWaiter.wait(for: [selected], timeout: 5), .completed, "segment \(segment) is not selected", file: file, line: line)
    }

    private func enterWriteWithFingerInk(file: StaticString = #filePath, line: UInt = #line) {
        select("WRITE", file: file, line: line)
        let toggle = app.switches["Finger ink"]
        XCTAssertTrue(toggle.waitForExistence(timeout: 5), "the finger-ink switch is missing in WRITE", file: file, line: line)
        if !isOn(toggle) {
            let inner = toggle.switches.firstMatch
            inner.exists ? inner.tap() : toggle.tap()
        }
        if !isOn(toggle) {
            toggle.coordinate(withNormalizedOffset: CGVector(dx: 0.95, dy: 0.5)).tap()
        }
        XCTAssertTrue(isOn(toggle), "finger ink could not be turned on", file: file, line: line)
        expectText(fingerWriteHint, file: file, line: line)
    }

    private func isOn(_ toggle: XCUIElement) -> Bool {
        (toggle.value as? String) == "1"
    }

    private func heading() -> XCUIElement {
        let heading = app.staticTexts[title]
        XCTAssertTrue(heading.waitForExistence(timeout: 10), "the page title is missing")
        return heading
    }

    /// A point on the fixed 680 x 860 pt page, relative to its title (the page pads the title by 40 pt).
    private func onPage(_ x: CGFloat, _ y: CGFloat) -> XCUICoordinate {
        heading().coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: x - 40, dy: y - 40))
    }

    /// Rows in the empty lower part of the page, 80 pt apart and inside its 860 pt height.
    private func rowY(_ row: Int) -> CGFloat {
        320 + CGFloat(row - 1) * 80
    }

    private func drawStroke(row: Int) {
        onPage(60, rowY(row)).press(forDuration: 0.05, thenDragTo: onPage(380, rowY(row)))
    }

    private func dragAcrossPage(row: Int) {
        drawStroke(row: row)
    }

    private func eraseStroke(row: Int) {
        onPage(220, rowY(row) - 25).press(forDuration: 0.05, thenDragTo: onPage(220, rowY(row) + 25))
    }

    private func assertNoAnswerShown(file: StaticString = #filePath, line: UInt = #line) {
        let answers = texts().filter { $0.contains("x = 5") || $0.localizedCaseInsensitiveContains("explanation") }
        XCTAssertTrue(answers.isEmpty, "writing produced help text: \(answers)", file: file, line: line)
    }

    /// The fixed 680 x 860 pt page cropped from an app screenshot, so its size does not depend on the
    /// controls or on how many lines the status text takes. Kept in the result bundle as PNG.
    @discardableResult
    private func pageShot(_ name: String) -> CGImage? {
        let title = heading().frame
        guard let full = app.screenshot().image.cgImage else {
            XCTFail("no app screenshot")
            return nil
        }
        let scale = CGFloat(full.width) / app.frame.width
        let page = CGRect(x: title.minX - 40 - app.frame.minX, y: title.minY - 40 - app.frame.minY, width: 680, height: 860)
        guard let crop = full.cropping(to: CGRect(x: page.minX * scale, y: page.minY * scale,
                                                  width: page.width * scale, height: page.height * scale).integral),
              let png = UIImage(cgImage: crop).pngData() else {
            XCTFail("the page could not be cropped from the screenshot")
            return nil
        }
        let attachment = XCTAttachment(data: png, uniformTypeIdentifier: "public.png")
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
        return crop
    }

    /// PencilKit renders a restored drawing asynchronously: wait until two page crops agree.
    private func stablePageShot(_ name: String) {
        var previous = pageShot(name + "-probe")
        for _ in 0..<10 {
            Thread.sleep(forTimeInterval: 0.5)
            let next = pageShot(name + "-probe")
            if difference(previous, next) < unchangedBelow { break }
            previous = next
        }
        pageShot(name)
    }

    private func expectMainFileSave(_ prefix: String, file: StaticString = #filePath, line: UInt = #line) {
        let status = expectStatus(prefix, file: file, line: line)
        XCTAssertFalse(status.label.contains("Saved separately"), "the save went to a side file: \(status.label)", file: file, line: line)
    }

    /// Fraction of pixels whose RGB channels differ by more than a small anti-aliasing tolerance.
    private func difference(_ a: CGImage?, _ b: CGImage?) -> Double {
        guard let a, let b, let pa = rgba(a), let pb = rgba(b), pa.width == pb.width, pa.height == pb.height else {
            XCTFail("screenshots could not be compared")
            return 1
        }
        var differing = 0
        for i in stride(from: 0, to: pa.bytes.count, by: 4) {
            let delta = abs(Int(pa.bytes[i]) - Int(pb.bytes[i])) + abs(Int(pa.bytes[i + 1]) - Int(pb.bytes[i + 1]))
                + abs(Int(pa.bytes[i + 2]) - Int(pb.bytes[i + 2]))
            if delta > 24 { differing += 1 }
        }
        return Double(differing) / Double(pa.width * pa.height)
    }

    private func rgba(_ cgImage: CGImage) -> (width: Int, height: Int, bytes: [UInt8])? {
        let width = cgImage.width, height = cgImage.height
        var bytes = [UInt8](repeating: 0, count: width * height * 4)
        let drawn = bytes.withUnsafeMutableBytes { buffer -> Bool in
            guard let context = CGContext(data: buffer.baseAddress, width: width, height: height, bitsPerComponent: 8,
                                          bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(),
                                          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
            context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))
            return true
        }
        return drawn ? (width, height, bytes) : nil
    }
}
