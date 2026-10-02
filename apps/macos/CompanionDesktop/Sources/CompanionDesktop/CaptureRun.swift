import CoreMedia
import DesktopCapture
import Foundation
import ScreenCaptureKit

/// One Start…Stop capture: its stream, live gate (created at the Start click) and recorder.
/// ScreenCaptureKit calls the output on `queue`, and only `queue` touches the recorder. `scStream`, `streamStarted` and
/// `stopRequested` are used on the main thread only.
final class CaptureRun: NSObject, SCStreamOutput, SCStreamDelegate {
    let displayID: CGDirectDisplayID
    let gate: LiveGate
    let queue = DispatchQueue(label: "CompanionDesktop.capture")
    private let recorderQueueKey = DispatchSpecificKey<Bool>()
    let recorder: CaptureRecorder
    weak var controller: CaptureController?
    var scStream: SCStream?
    var streamStarted = false
    var stopRequested = false
    /// Whether this session composes kept frames with ink, and the last kept frame whose
    /// composition was requested; main thread only.
    let composesInk: Bool
    var lastCompositionRequested = 0
    /// The last current frame frozen for an AI request or observation; main thread only.
    var lastOfferedToAI = 0
    /// A temporary current-picture loss; main thread only. Recovery may reuse the same pixels
    /// when a valid idle callback confirms that they are still displayed.
    var lastAIProblem: String?
    /// The detail of an ending that is waiting for `settleCompositions`, so a Quit meanwhile keeps
    /// it; main thread only.
    var pendingEndingDetail: String?

    init(displayID: CGDirectDisplayID, gate: LiveGate, recorder: CaptureRecorder, composesInk: Bool,
         controller: CaptureController) {
        self.displayID = displayID
        self.gate = gate
        self.recorder = recorder
        self.composesInk = composesInk
        self.controller = controller
        super.init()
        queue.setSpecific(key: recorderQueueKey, value: true)
    }

    /// The current capture authority at input/dispatch time. The recorder is read only on its
    /// owning queue, including when a caller is already there. A pinned historical selection
    /// (`sequence == nil`) needs the open capture gate but makes no current-pixel claim.
    func currentSourceProblem(sequence: Int?) -> String? {
        guard gate.isOpen else { return "the capture has stopped; nothing more is sent from it" }
        guard let sequence else { return nil }
        let read = {
            Freshness.currentFrameProblem(self.recorder.status, capturing: self.gate.isOpen,
                                          sequence: sequence, now: HostClock.now())
        }
        return DispatchQueue.getSpecific(key: recorderQueueKey) == true ? read() : queue.sync(execute: read)
    }

    // MARK: - ScreenCaptureKit (on `queue` or a system queue)

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .screen else { return }
        let facts = FrameFacts(sampleBuffer: sampleBuffer)
        // Admission and its time are read under the gate's lock: an admitted frame is kept even if
        // its encoding ends after Stop, and nothing is admitted once the gate has closed.
        if let host = gate.admit() {
            recorder.frame(facts, image: sampleBuffer.imageBuffer, host: host, accepted: true)
        } else {
            recorder.frame(facts, image: nil, host: HostClock.now(), accepted: false)
        }
        report(recorder.status, ended: false)
    }

    /// Permission loss, a disconnected display or a system stop. Live claims end here, on this
    /// thread, before anything else happens.
    func stream(_ stream: SCStream, didStopWithError error: Error) {
        let reason = StopReason(error)
        let closedHere = gate.close(reason.kind)
        DispatchQueue.main.async {
            MainActor.assumeIsolated {
                self.controller?.streamStopped(self, reason: reason, closedHere: closedHere)
            }
        }
    }

    // MARK: - Recorder steps, each on `queue`

    /// `host` and `wall` are read when `startCapture` returned, not when the queue gets here.
    func started(host: Double, wall: Date) {
        queue.async {
            self.recorder.streamStarted(host: host, wall: wall)
            self.report(self.recorder.status, ended: false)
        }
    }

    func note(_ event: String, detail: [String: String]) {
        queue.async {
            self.recorder.note(event, host: HostClock.now(), detail: detail)
            self.report(self.recorder.status, ended: false)
        }
    }

    /// Composes a kept frame on the queue, after the frames and notes already queued; a request that
    /// comes after the ending is only noted.
    func compose(_ request: CompositionRequest) {
        queue.async {
            self.recorder.compose(request, host: HostClock.now())
            self.report(self.recorder.status, ended: false)
        }
    }

    /// Returns once every frame kept so far has been reported to the main thread, so its
    /// composition request is queued before an ending that follows. Main actor only.
    func settleCompositions() async {
        await withCheckedContinuation { (done: CheckedContinuation<Void, Never>) in
            queue.async {
                DispatchQueue.main.async { done.resume() }
            }
        }
    }

    /// Writes the ending after the gate has closed. `wait` is for app termination, where nothing
    /// can be awaited.
    func finish(detail: String?, wait: Bool = false) {
        let closure = gate.closure
        let work = {
            let now = HostClock.now()
            self.recorder.finish(reason: closure?.reason ?? "unknown", detail: detail,
                                 liveEndedHost: closure?.host ?? now, host: now, wall: Date())
            self.report(self.recorder.status, ended: true)
        }
        if wait {
            queue.sync(execute: work)
        } else {
            queue.async(execute: work)
        }
    }

    private func report(_ status: SessionStatus, ended: Bool) {
        DispatchQueue.main.async {
            MainActor.assumeIsolated {
                self.controller?.receive(status, from: self, ended: ended)
            }
        }
    }
}
