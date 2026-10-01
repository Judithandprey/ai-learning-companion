import Foundation
import XCTest
typealias Entry = (String, (DesktopCaptureTests) -> () throws -> Void)
let tests: [Entry] = [
("testReviewRealChildQuitJoinsPartialCancelCleanup", asyncTest(DesktopCaptureTests.testReviewRealChildQuitJoinsPartialCancelCleanup)),
]
XCTMain([testCase(tests)])
