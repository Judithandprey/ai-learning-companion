import Foundation
import XCTest
import Glibc
signal(SIGPIPE, SIG_IGN)
XCTMain([testCase([("testLeadSubmittedFollowupSurvivesHealthyFrameAdvanceButNotSourceLoss", asyncTest(DesktopCaptureTests.testLeadSubmittedFollowupSurvivesHealthyFrameAdvanceButNotSourceLoss))])])
