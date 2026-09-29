import CoreMedia
import Foundation
import ReplayKit

/// Receives the system-wide screen broadcast chosen by the user in the system picker. It keeps
/// a bounded set of changed keyframes and an honest account of what was and was not kept.
/// Capture only: nothing is sent, and audio is not captured in this slice. Which app is on
/// screen is not recorded: the system broadcast does not report it here, so it stays unknown.
///
/// ReplayKit calls these methods one at a time, so the session needs no locking.
final class SampleHandler: RPBroadcastSampleHandler {
    private var session: CaptureSession?

    override func broadcastStarted(withSetupInfo setupInfo: [String: NSObject]?) {
        guard let root = CaptureStore.root else {
            finishBroadcastWithError(CaptureError.noSharedStorage)
            return
        }
        do {
            session = try CaptureSession(root: root)
        } catch {
            finishBroadcastWithError(CaptureError.cannotStart(error.localizedDescription))
        }
    }

    override func broadcastPaused() {
        session?.lifecycle("paused")
    }

    override func broadcastResumed() {
        session?.lifecycle("resumed")
    }

    override func broadcastFinished() {
        session?.lifecycle("finished")
    }

    override func processSampleBuffer(_ sampleBuffer: CMSampleBuffer, with sampleBufferType: RPSampleBufferType) {
        switch sampleBufferType {
        case .video:
            session?.video(sampleBuffer)
        case .audioApp, .audioMic:
            session?.audioNotCaptured()
        @unknown default:
            break
        }
    }
}

enum CaptureError: LocalizedError {
    case noSharedStorage
    case cannotStart(String)

    var errorDescription: String? {
        switch self {
        case .noSharedStorage:
            return "Screen Observer cannot keep frames: this build has no shared App Group storage. Nothing was captured."
        case .cannotStart(let reason):
            return "Screen Observer could not start a capture session (\(reason)). Nothing was captured."
        }
    }
}
