import Foundation
import Glibc
import XCTest

// Linux harness only: Darwin's production pipe guard remains separately compiled/verified.
signal(SIGPIPE, SIG_IGN)
let desktopTests: [(String, (DesktopCaptureTests) -> () throws -> Void)] = [
    ("testLiveQueuedUnshownAnswerCannotAcquireReceiptAfterStop", asyncTest(DesktopCaptureTests.testLiveQueuedUnshownAnswerCannotAcquireReceiptAfterStop)),
    ("testLiveClosingAnUnshownAnswerRevokesItsQueuedDisplay", asyncTest(DesktopCaptureTests.testLiveClosingAnUnshownAnswerRevokesItsQueuedDisplay)),
    ("testLiveNewSelectionRejectsTheOldQueuedAnswerAndDisplaysItsOwn", asyncTest(DesktopCaptureTests.testLiveNewSelectionRejectsTheOldQueuedAnswerAndDisplaysItsOwn)),
    ("testLiveFollowUpRevokesAnUnshownAnswerOnTheSameCard", asyncTest(DesktopCaptureTests.testLiveFollowUpRevokesAnUnshownAnswerOnTheSameCard)),
    ("testLiveExplicitRestartDoesNotAuthorizeAnEarlierUnshownAnswer", asyncTest(DesktopCaptureTests.testLiveExplicitRestartDoesNotAuthorizeAnEarlierUnshownAnswer)),
    ("testLiveCaptureEndRevokesAnUnshownAnswerWithoutDiscardingItsOriginal", asyncTest(DesktopCaptureTests.testLiveCaptureEndRevokesAnUnshownAnswerWithoutDiscardingItsOriginal)),
    ("testLiveActuallyShownAnswerKeepsItsOriginalReceiptAfterStopAndClose", asyncTest(DesktopCaptureTests.testLiveActuallyShownAnswerKeepsItsOriginalReceiptAfterStopAndClose)),
    ("testLiveFinalUsedUpAnswerStillHasFirstDisplayAuthority", asyncTest(DesktopCaptureTests.testLiveFinalUsedUpAnswerStillHasFirstDisplayAuthority)),
    ("testLiveHiddenPanelDoesNotBecomeShownAndCanBeDisplayedLater", asyncTest(DesktopCaptureTests.testLiveHiddenPanelDoesNotBecomeShownAndCanBeDisplayedLater)),
    ("testLiveCaptureGateCloseBlocksDisplayBeforeItsActorNotification", asyncTest(DesktopCaptureTests.testLiveCaptureGateCloseBlocksDisplayBeforeItsActorNotification)),
    ("testLiveLocalGenerationCloseBlocksDisplayBeforeTheStopTask", asyncTest(DesktopCaptureTests.testLiveLocalGenerationCloseBlocksDisplayBeforeTheStopTask)),
    ("testRecoveredSourceRefusalDoesNotBecomeTransportFailure", asyncTest(DesktopCaptureTests.testRecoveredSourceRefusalDoesNotBecomeTransportFailure)),
    ("testOldOrReplacementDispatchGateCannotAuthorizeTheActiveSession", asyncTest(DesktopCaptureTests.testOldOrReplacementDispatchGateCannotAuthorizeTheActiveSession)),
    ("testSameFrameRecoveryClearsSourceLossWithoutAnotherSubmission", asyncTest(DesktopCaptureTests.testSameFrameRecoveryClearsSourceLossWithoutAnotherSubmission)),
    ("testClosedCaptureRefusesStartBeforeAndAfterConnectorAwait", asyncTest(DesktopCaptureTests.testClosedCaptureRefusesStartBeforeAndAfterConnectorAwait)),
    ("testPermanentGateClosureAndFinalByteAreAtomicallyOrdered", DesktopCaptureTests.testPermanentGateClosureAndFinalByteAreAtomicallyOrdered),
    ("testCurrentSourceLossDuringRenderRefusesThenRecoversWithoutRestart", asyncTest(DesktopCaptureTests.testCurrentSourceLossDuringRenderRefusesThenRecoversWithoutRestart)),
    ("testCurrentSourceLossWhileFollowupWaitsInWriterDropsTheLine", asyncTest(DesktopCaptureTests.testCurrentSourceLossWhileFollowupWaitsInWriterDropsTheLine)),
    ("testSourceAdmissionRechecksFinalByteAndPermanentSessionStop", DesktopCaptureTests.testSourceAdmissionRechecksFinalByteAndPermanentSessionStop),
    ("testLeadQueuedAnswerIsNotAcceptedAsShownAfterStop", asyncTest(DesktopCaptureTests.testLeadQueuedAnswerIsNotAcceptedAsShownAfterStop)),
    ("testLiveGateKeepsTheFirstClosureAndAdmitsNothingAfterIt", DesktopCaptureTests.testLiveGateKeepsTheFirstClosureAndAdmitsNothingAfterIt),
    ("testFrameAdmittedBeforeStopIsKeptAndNothingAfter", DesktopCaptureTests.testFrameAdmittedBeforeStopIsKeptAndNothingAfter),
    ("testStopWhileListingDisplaysCreatesNothing", asyncTest(DesktopCaptureTests.testStopWhileListingDisplaysCreatesNothing)),
    ("testStopWhileTheStreamStartsStopsIt", asyncTest(DesktopCaptureTests.testStopWhileTheStreamStartsStopsIt)),
    ("testLiveStartRefusalsAndAStartThatIsStoppedOrNotConfirmed", asyncTest(DesktopCaptureTests.testLiveStartRefusalsAndAStartThatIsStoppedOrNotConfirmed)),
    ("testLiveLooksWaitForTheirTurnAndStopAtTheRequestsKeptForTheUser", asyncTest(DesktopCaptureTests.testLiveLooksWaitForTheirTurnAndStopAtTheRequestsKeptForTheUser)),
    ("testLiveSelectionIsSentAtOnceAsAFocusAndAFollowUpKeepsOrNamesIt", asyncTest(DesktopCaptureTests.testLiveSelectionIsSentAtOnceAsAFocusAndAFollowUpKeepsOrNamesIt)),
    ("testLiveSelectionMadeBeforeStartKeepsItsOwnPictureAsFocusWhenAsked", asyncTest(DesktopCaptureTests.testLiveSelectionMadeBeforeStartKeepsItsOwnPictureAsFocusWhenAsked)),
    ("testLiveMissingCurrentPictureDropsWaitingLooksAndSurvivesLateResults", asyncTest(DesktopCaptureTests.testLiveMissingCurrentPictureDropsWaitingLooksAndSurvivesLateResults)),
    ("testLiveExplicitFocusJoinsAnInterruptedObservationBeforeSending", asyncTest(DesktopCaptureTests.testLiveExplicitFocusJoinsAnInterruptedObservationBeforeSending)),
    ("testLiveFocusAndStopCannotBeOvertakenByAnOlderRenderingLook", asyncTest(DesktopCaptureTests.testLiveFocusAndStopCannotBeOvertakenByAnOlderRenderingLook)),
    ("testLiveCancelNewSelectionStopAndQuitFenceARequestOnItsWay", asyncTest(DesktopCaptureTests.testLiveCancelNewSelectionStopAndQuitFenceARequestOnItsWay)),
    ("testAskRealChildNeverGetsARequestTakenBackInThePipe", asyncTest(DesktopCaptureTests.testAskRealChildNeverGetsARequestTakenBackInThePipe)),
]
let freshnessTests: [(String, (LiveFreshnessTests) -> () throws -> Void)] = [
    ("testHealthyIdleConfirmsOldPixelsWithoutChangingTheirSequence", LiveFreshnessTests.testHealthyIdleConfirmsOldPixelsWithoutChangingTheirSequence),
    ("testCallbackSilenceLosesCurrentInputAndValidIdleRestoresTheSameFrame", LiveFreshnessTests.testCallbackSilenceLosesCurrentInputAndValidIdleRestoresTheSameFrame),
    ("testBlankSuspendedAndMissingImageNeedNewPixelsToRecover", LiveFreshnessTests.testBlankSuspendedAndMissingImageNeedNewPixelsToRecover),
    ("testMissingCallbackStatusCannotReuseTheRetainedFrame", LiveFreshnessTests.testMissingCallbackStatusCannotReuseTheRetainedFrame),
    ("testMissingZeroAndInvalidFutureSourceTimeRefuseThenIdleCanConfirmPixels", LiveFreshnessTests.testMissingZeroAndInvalidFutureSourceTimeRefuseThenIdleCanConfirmPixels),
    ("testRecentCallbackDoesNotMakeStaleSourcePixelsCurrent", LiveFreshnessTests.testRecentCallbackDoesNotMakeStaleSourcePixelsCurrent),
    ("testStopGateRefusesBeforeEndingAndLaterCallbacksCannotRestoreIt", LiveFreshnessTests.testStopGateRefusesBeforeEndingAndLaterCallbacksCannotRestoreIt),
    ("testFreshnessAloneCannotAuthorizeAMismatchedRetainedSequence", LiveFreshnessTests.testFreshnessAloneCannotAuthorizeAMismatchedRetainedSequence),
]
XCTMain([testCase(desktopTests), testCase(freshnessTests)])
