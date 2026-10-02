import Foundation
import Glibc
import XCTest

// Same unmodified local-process regression, separated because restricted CFSocket failed.
signal(SIGPIPE, SIG_IGN)
let desktopTests: [(String, (DesktopCaptureTests) -> () throws -> Void)] = [
    ("testAskRealChildNeverGetsARequestTakenBackInThePipe", asyncTest(DesktopCaptureTests.testAskRealChildNeverGetsARequestTakenBackInThePipe)),
]
XCTMain([testCase(desktopTests)])
