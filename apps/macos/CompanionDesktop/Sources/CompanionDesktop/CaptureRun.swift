import CoreMedia
import DesktopCapture
import Foundation
import ScreenCaptureKit

/// One Start…Stop capture: its stream, live gate and recorder. ScreenCaptureKit calls the
/// output on `queue`, and only `queue` touches the recorder. `scStream`, `streamStarted` and
/// `stopRequested` are used on the main thread only.
final class CaptureRun: NSObject, SCStreamOutput, SCStreamDelegate {
    let displayID: CGDirectDisplayID
    let gate = LiveGate()
    let queue = DispatchQueue(label: "CompanionDesktop.capture")
    let recorder: CaptureRecorder
    weak var controller: CaptureController?
    var scStream: SCStream?
    var streamStarted = false
    var stopRequested = false

    init(displayID: CGDirectDisplayID, recorder: CaptureRecorder, controller: CaptureController) {
        self.displayID = displayID
        self.recorder = recorder
        self.controller = controller
    }

    // MARK: - ScreenCaptureKit (on `queue` or a system queue)

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .screen else { return }
        let host = HostClock.now()
        recorder.frame(FrameFacts(sampleBuffer: sampleBuffer), image: sampleBuffer.imageBuffer, host: host,
                       accepted: gate.isOpen)
        report(recorder.status, ended: false)
    }

    /// Permission loss, a disconnected display or a system stop. Live claims end here, on this
    /// thread, before anything else happens.
    func stream(_ stream: SCStream, didStopWithError error: Error) {
        let reason = StopReason(error)
        let closedHere = gate.close(reason.kind, host: HostClock.now())
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
