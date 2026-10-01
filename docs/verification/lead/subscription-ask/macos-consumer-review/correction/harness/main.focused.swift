import Foundation
import XCTest
typealias Entry = (String, (DesktopCaptureTests) -> () throws -> Void)
let tests: [Entry] = [
("testReviewQuitWaitsForPartialCancelCleanup", asyncTest(DesktopCaptureTests.testReviewQuitWaitsForPartialCancelCleanup)),
("testAskCancelNewSelectionAndStopSuppressLaterAnswers", asyncTest(DesktopCaptureTests.testAskCancelNewSelectionAndStopSuppressLaterAnswers)),
("testAskLateAnswersCloseAndQuitWithAQuestionOnItsWay", asyncTest(DesktopCaptureTests.testAskLateAnswersCloseAndQuitWithAQuestionOnItsWay)),
("testAskTakesBackARequestThatHasNotReachedTheConnector", asyncTest(DesktopCaptureTests.testAskTakesBackARequestThatHasNotReachedTheConnector)),
("testAskConnectorLossAndTimeoutAreUnknownAndNeverRetried", asyncTest(DesktopCaptureTests.testAskConnectorLossAndTimeoutAreUnknownAndNeverRetried)),
("testAskRealChildNeverGetsARequestTakenBackInThePipe", asyncTest(DesktopCaptureTests.testAskRealChildNeverGetsARequestTakenBackInThePipe)),
]
XCTMain([testCase(tests)])
