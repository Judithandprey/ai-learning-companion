import Foundation

// Commits one kept frame's metadata as a process record through `POST /v2/process/raw-frames:batch`
// (raw_capture_ingress 0.2.6), after the frame's original bytes were committed through
// OriginalUploader. A batch counts as committed only after a complete, verified ProcessBatchAck
// 0.2.0.
//
// This is a bounded, opt-in seam in the app target. Nothing calls it yet, and neither the UI nor
// the broadcast extension includes it. There is no default endpoint or token and no automatic
// retry. It reuses the uploader's state file, lock, witness, Stop, transport, authorization and
// token handling. The batch's own record is separate from the original's receipt only because
// bytes_committed is not a ProcessBatchAck.
//
// The record profile is fixed, because a kept frame is a sampled pixel image, not an
// understanding of what happened on screen:
// - one framed `provisional_session` record;
// - surface `external_app` (whatever was on screen), method `visual`;
// - coverage evidence `observed_samples`, limited by `sample_only` and `unsupported_history`, with
//   unknown (null) interval bounds, no missing sequences and no causal parents;
// - `observed_at` and `media_position` null. The clock is the raw callback clock, or null when it
//   is unknown.
// Nothing is inferred about actors, reasons, edits, causality or continuous coverage. The caller
// supplies every identity, including the process record's sequence, which is never the
// video-buffer sequence. Nothing here registers a source or grants permission.

/// The caller-supplied process identity of one kept frame's record and batch.
struct RawFrameRecordProfile {
    let recordID: String
    /// The process-stream sequence the caller's authority assigns, never the buffer sequence.
    let sequence: Int
    let batchID: String
    let idempotencyKey: String
    /// "live" or "historical", as the caller's authority states.
    let deliveryMode: String
}

enum RawFrameIngress {
    static let contractVersion = "0.2.6"
    /// The 0.2.6 bound on the raw request body.
    static let maxRequestBytes = 4 * 1024 * 1024

    enum Failure: Error, Equatable {
        case originalNotCommitted
        case otherIdentity(String)
        case profile(String)
        case frame(String)
        case tooLarge
    }

    // MARK: - Request

    /// The exact `RawFrameBatchRequest` 0.2.6 body: canonical JSON (sorted keys, no whitespace)
    /// with `frameJSON`, the mapper's canonical `RawCaptureFrame`, embedded unchanged.
    static func requestBody(frameJSON: Data, profile: RawFrameRecordProfile, identity: RawFrameIdentity,
                            artifact: OriginalArtifactReference) throws -> Data {
        for (name, value) in [("record ID", profile.recordID), ("batch ID", profile.batchID),
                              ("Idempotency-Key", profile.idempotencyKey)] where !OriginalUpload.isIdentifier(value) {
            throw Failure.profile("the \(name) is not a contract Identifier")
        }
        guard (1...OriginalUpload.maxSafeInteger).contains(profile.sequence) else {
            throw Failure.profile("the process sequence is not a positive safe integer")
        }
        guard ["live", "historical"].contains(profile.deliveryMode) else {
            throw Failure.profile("the delivery mode is neither live nor historical")
        }
        guard let frame = (try? JSONSerialization.jsonObject(with: frameJSON)) as? [String: Any],
              let frameID = frame["frame_id"] as? String, frameID.utf8.elementsEqual(identity.frameID.utf8),
              let timing = frame["timing"] as? [String: Any] else {
            throw Failure.frame("the mapped frame is not this identity's descriptor")
        }
        let clock: String
        if timing["callback_clock"] is NSNull {
            clock = "null"
        } else if let callback = timing["callback_clock"] as? [String: Any],
                  let domain = callback["domain_id"] as? String, OriginalUpload.isIdentifier(domain),
                  let elapsed = callback["elapsed_ms"] as? NSNumber, CFGetTypeID(elapsed) != CFBooleanGetTypeID(),
                  (0...OriginalUpload.maxSafeInteger).contains(elapsed.intValue), elapsed.stringValue == String(elapsed.intValue) {
            clock = #"{"domain_id":"\#(domain)","elapsed_ms":\#(elapsed.intValue),"uncertainty_ms":null}"#
        } else {
            throw Failure.frame("the mapped frame has no readable callback clock")
        }
        let source = identity.source
        let artifactJSON = #"{"artifact_id":"\#(artifact.artifactID)","byte_length":\#(artifact.byteLength),"media_type":"\#(artifact.mediaType)","sha256":"\#(artifact.sha256)"}"#
        let evidence = #"{"coverage":"observed_samples","from_clock_ms":null,"kind":"coverage","limitations":["sample_only","unsupported_history"],"missing_sequences":[],"through_clock_ms":null}"#
        let record = #"{"artifacts":[\#(artifactJSON)],"causal_parents":[],"clock":\#(clock),"evidence":\#(evidence),"frame_id":"\#(identity.frameID)","media_position":null,"method":"visual","observed_at":null,"record_id":"\#(profile.recordID)","scope":{"kind":"provisional_session"},"sequence":\#(profile.sequence),"source":{"source_id":"\#(source.sourceID)","source_version":\#(source.sourceVersion),"user_id":"\#(source.userID)"},"surface":"external_app"}"#
        let batch = #"{"batch_id":"\#(profile.batchID)","contract_version":"0.2.0","delivery_mode":"\#(profile.deliveryMode)","device_id":"\#(identity.deviceID)","records":[\#(record)],"session_id":"\#(identity.sessionID)","stream_id":"\#(identity.streamID)"}"#
        var body = Data(#"{"batch":\#(batch),"contract_version":"\#(contractVersion)","frames":["#.utf8)
        body.append(frameJSON)
        body.append(Data("]}".utf8))
        guard body.count <= maxRequestBytes else { throw Failure.tooLarge }
        return body
    }
}

// MARK: - Uploader extension

extension OriginalUploader {
    /// Records the process batch for one kept frame whose original is committed, before anything
    /// can be sent. The frame comes from the RawCaptureFrame mapper, with the original's own
    /// committed binding. Enqueueing the same frame again with the same identity returns its record;
    /// a different identity or envelope for it is refused.
    func enqueueFrameBatch(_ record: KeyframeRecord, identity: RawFrameIdentity,
                           profile: RawFrameRecordProfile) throws -> RawFrameBatchItem {
        if let reason = localStopReason { throw Failure.stopped(reason) }
        let original = try withLockedState { state -> OriginalUploadItem in
            if let reason = state.stoppedReason { throw Failure.stopped(reason) }
            guard let item = state.items.first(where: { $0.file == record.file }), item.state == "committed" else {
                throw RawFrameIngress.Failure.originalNotCommitted
            }
            return item
        }
        let status = try? CaptureStore.decoder.decode(
            CaptureStatus.self, from: Data(contentsOf: session.appending(path: "status.json")))
        let frame = try RawCaptureFrame.json(record: record, localSession: session.lastPathComponent, status: status,
                                             identity: identity, binding: original.binding)
        let body = try RawFrameIngress.requestBody(frameJSON: frame, profile: profile, identity: identity,
                                                   artifact: original.binding.artifact)
        let item = RawFrameBatchItem(file: record.file, idempotencyKey: profile.idempotencyKey, batchID: profile.batchID,
                                     recordID: profile.recordID, sequence: profile.sequence,
                                     request: String(decoding: body, as: UTF8.self),
                                     requestSHA256: OriginalUpload.sha256Hex(body), state: "pending", attempts: 0)
        return try withLockedState { state in
            if let reason = state.stoppedReason { throw Failure.stopped(reason) }
            var batches = state.frameBatches ?? []
            if let existing = batches.first(where: { $0.file == record.file }) {
                guard existing.idempotencyKey.utf8.elementsEqual(item.idempotencyKey.utf8),
                      existing.request.utf8.elementsEqual(item.request.utf8) else {
                    throw RawFrameIngress.Failure.otherIdentity("this frame already has a process batch with another key or envelope")
                }
                return existing
            }
            guard !batches.contains(where: { $0.idempotencyKey == item.idempotencyKey || $0.batchID == item.batchID
                    || $0.recordID == item.recordID || $0.sequence == item.sequence }) else {
                throw RawFrameIngress.Failure.otherIdentity("the key, batch, record or sequence already belongs to another frame")
            }
            batches.append(item)
            state.frameBatches = batches
            return item
        }
    }

    /// Tries each pending process batch once, in order, while the session is live and nothing has
    /// failed. The attempt is recorded under the lock before sending, which orders it against a
    /// Stop. Nothing is sent after a saved Stop.
    func sendFrameBatches(_ authorization: IngressAuthorization) async -> PassResult {
        guard !passRunning else { return .halted("another pass is already running") }
        if let reason = localStopReason { return .stopped(reason) }
        passRunning = true
        defer { passRunning = false }
        let keys: [String]
        do {
            keys = try withLockedState { state in (state.frameBatches ?? []).filter { $0.state == "pending" }.map(\.idempotencyKey) }
        } catch {
            return .halted(Self.describe(error))
        }
        for key in keys {
            if let reason = localStopReason { return .stopped(reason) }
            if let reason = disabledReason { return endOfPass(reason) }
            if Task.isCancelled { return endOfPass("cancelled") }
            switch liveness() {
            case .finished:
                stop("the broadcast finished")
                return .stopped(localStopReason ?? "the broadcast finished")
            case .notLive(let reason):
                return endOfPass(reason)
            case .live:
                break
            }

            let current: (stop: String?, item: RawFrameBatchItem?, originalCommitted: Bool)
            do {
                current = try withLockedState { state in
                    let item = state.frameBatches?.first { $0.idempotencyKey == key }
                    let original = state.items.first { $0.file == item?.file }
                    return (state.stoppedReason, item, original?.state == "committed")
                }
            } catch {
                return .halted(Self.describe(error))
            }
            if let reason = current.stop {
                localStopReason = reason
                return .stopped(reason)
            }
            guard let item = current.item, item.state == "pending" else { continue } // Done by another uploader.
            let body = Data(item.request.utf8)
            guard current.originalCommitted, body.count <= RawFrameIngress.maxRequestBytes,
                  OriginalUpload.sha256Hex(body) == item.requestSHA256 else {
                guard updateFrameBatch(key, {
                    $0.state = "refused"
                    $0.lastOutcome = "not sent: its original is not committed, or the recorded request is damaged; nothing different is sent under this key"
                }) else { return endOfPass("the upload state could not be read or saved") }
                continue
            }
            guard let request = authorization.rawFrameBatchRequest(body: body, idempotencyKey: item.idempotencyKey) else {
                updateFrameBatch(key) { $0.lastOutcome = "not sent: no request could be built; still pending" }
                return endOfPass("no request could be built")
            }
            if Task.isCancelled {
                updateFrameBatch(key) { $0.lastOutcome = "cancelled before sending; still pending" }
                return endOfPass("cancelled")
            }

            let gate: AttemptGate
            do {
                gate = try withLockedState { state in
                    if let reason = state.stoppedReason { return .stopped(reason) }
                    guard let index = state.frameBatches?.firstIndex(where: { $0.idempotencyKey == key }),
                          state.frameBatches?[index].state == "pending" else { return .notPending }
                    state.frameBatches?[index].attempts += 1
                    state.frameBatches?[index].lastAttemptWallTime = Date()
                    state.frameBatches?[index].lastOutcome = "sent; no response recorded"
                    return .send
                }
            } catch {
                return .halted(Self.describe(error) + ", so nothing was sent")
            }
            switch gate {
            case .stopped(let reason):
                localStopReason = reason
                return .stopped(reason)
            case .notPending:
                continue
            case .send:
                break
            }

            let response: (Data, URLResponse)
            do {
                response = try await transport.send(request)
            } catch {
                // The service may or may not have committed; the same request and key are sent next time.
                let cancelled = Task.isCancelled || error is CancellationError || (error as? URLError)?.code == .cancelled
                let outcome = cancelled ? "cancelled while waiting for the response"
                                        : "no response (\(OriginalUpload.errorCategory(error)))"
                pendingFrameBatch(key, outcome + "; outcome unknown, still pending")
                return endOfPass(cancelled ? "cancelled" : "no response; outcome unknown")
            }
            if let end = handleFrameBatch(response, to: request, item: item) { return end }
        }
        return currentStop().map { PassResult.stopped($0) } ?? .finished
    }

    /// Records one response. Returns how the pass ends, or nil to continue with the next batch.
    private func handleFrameBatch(_ response: (Data, URLResponse), to request: URLRequest,
                                  item: RawFrameBatchItem) -> PassResult? {
        let (data, urlResponse) = response
        let key = item.idempotencyKey
        guard let http = urlResponse as? HTTPURLResponse else {
            pendingFrameBatch(key, "not an HTTP response; still pending")
            return endOfPass("not an HTTP response")
        }
        guard http.url == request.url else {
            let reason = "the response came from another URL (a redirect was followed); outcome unknown"
            disabledReason = reason
            pendingFrameBatch(key, reason + "; still pending")
            return endOfPass(reason)
        }
        if http.statusCode == 200 {
            switch OriginalUpload.acceptedFrameBatchAck(data, request: Data(item.request.utf8)) {
            case .failure(let problem):
                let reason = "the service returned an acknowledgement that does not match: \(problem.reason)"
                disabledReason = reason
                pendingFrameBatch(key, "HTTP 200 refused: \(problem.reason); still pending")
                return endOfPass(reason)
            case .success(let ack):
                let suffix = afterStop()
                guard updateFrameBatch(key, {
                    $0.state = "committed"
                    $0.ack = ack
                    $0.lastOutcome = "committed" + suffix
                }) else {
                    // The service committed; the same request and key are sent again next time.
                    return endOfPass("the acknowledgement could not be saved")
                }
                return currentStop().map { PassResult.stopped($0) }
            }
        }
        let code = OriginalUpload.ingressErrorCode(data, version: RawFrameIngress.contractVersion, status: http.statusCode)
        let outcome = "HTTP \(http.statusCode) \(code ?? "without a valid RawIngressError")"
        switch (http.statusCode, code) {
        case (409, "capture_stopped"?):
            pendingFrameBatch(key, outcome + "; still pending and not sent again")
            stop("the service reported capture_stopped")
            return .stopped(localStopReason ?? "the service reported capture_stopped")
        case (409, "idempotency_conflict"?), (409, "record_conflict"?), (413, "payload_too_large"?):
            let suffix = afterStop()
            guard updateFrameBatch(key, {
                $0.state = "refused"
                $0.lastOutcome = outcome + "; the service cannot accept this batch as recorded; no new key or envelope is made" + suffix
            }) else { return endOfPass("the upload state could not be read or saved") }
            return currentStop().map { PassResult.stopped($0) }
        case (401, _), (403, _), (404, _), (409, "stale_scope"?), (409, "unsupported_source"?):
            disabledReason = outcome + "; a new, current authorization or source is needed"
            pendingFrameBatch(key, outcome + "; still pending")
            return endOfPass(outcome)
        default:
            pendingFrameBatch(key, outcome + "; still pending")
            return endOfPass(outcome)
        }
    }

    /// Changes one pending process batch in the saved state. A committed or refused batch is final.
    /// Returns false if the state could not be read or saved.
    @discardableResult
    private func updateFrameBatch(_ key: String, _ change: (inout RawFrameBatchItem) -> Void) -> Bool {
        do {
            try withLockedState { state in
                guard let index = state.frameBatches?.firstIndex(where: { $0.idempotencyKey == key }),
                      state.frameBatches?[index].state == "pending" else { return }
                change(&state.frameBatches![index])
            }
            return true
        } catch {
            return false
        }
    }

    private func pendingFrameBatch(_ key: String, _ outcome: String) {
        let suffix = afterStop()
        updateFrameBatch(key) { $0.lastOutcome = outcome + suffix }
    }
}
