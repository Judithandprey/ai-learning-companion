import Foundation
import Glibc
import XCTest
signal(SIGPIPE, SIG_IGN)
XCTMain([testCase([
    ("testLiveSessionLinesForTheReleasedValidator", asyncTest(DesktopCaptureTests.testLiveSessionLinesForTheReleasedValidator))
])])
