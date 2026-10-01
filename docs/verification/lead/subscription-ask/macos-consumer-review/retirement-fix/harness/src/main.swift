import Foundation
import XCTest
typealias Entry = (String, (DesktopCaptureTests) -> () throws -> Void)
let tests: [Entry] = [
("testReviewQuitWaitsForPartialCancelCleanup", asyncTest(DesktopCaptureTests.testReviewQuitWaitsForPartialCancelCleanup)),
("testReviewRealChildQuitJoinsPartialCancelCleanup", asyncTest(DesktopCaptureTests.testReviewRealChildQuitJoinsPartialCancelCleanup)),
("testAskQuitAndConnectWaitForAConnectorThatIsStillEnding", asyncTest(DesktopCaptureTests.testAskQuitAndConnectWaitForAConnectorThatIsStillEnding)),
("testAskQuitWaitsForARealConnectorThatIsStillEnding", asyncTest(DesktopCaptureTests.testAskQuitWaitsForARealConnectorThatIsStillEnding)),
]
XCTMain([testCase(tests)])
