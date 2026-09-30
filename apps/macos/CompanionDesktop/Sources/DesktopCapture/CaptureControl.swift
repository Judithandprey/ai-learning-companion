import Foundation

// The released control 0.2.1 stream routes and the 0.2.4 display-source route, as the trusted
// parent calls them through the local capture host. Nothing is believed except an exactly
// corresponding 200 (a StreamState for exactly this registration and owner; a
// DisplaySourceSnapshot for exactly this source and stream) or a closed typed error of the
// route's own family whose code is released for its status. Everything else, and every lost
// answer, is unknown: it may have taken effect. Retries resend the same bytes and key.

/// One stream incarnation as registered: exact identities, predecessor and pins.
public struct StreamRegistration: Equatable, Sendable, Codable {
    public let deviceID: String
    public let sessionID: String
    public let streamID: String
    /// The last registered stream of this device, session and producer; nil for the first.
    public let previousStreamID: String?
    /// Pins of a host-provisioned actor (1 and 1): there is no route to read later values.
    public let authorizationGeneration: Int
    public let membershipRevision: Int

    public init(deviceID: String, sessionID: String, streamID: String, previousStreamID: String?,
                authorizationGeneration: Int = 1, membershipRevision: Int = 1) {
        self.deviceID = deviceID
        self.sessionID = sessionID
        self.streamID = streamID
        self.previousStreamID = previousStreamID
        self.authorizationGeneration = authorizationGeneration
        self.membershipRevision = membershipRevision
    }

    var continuity: JSONValue {
        guard let previous = previousStreamID else { return .object(["kind": .string("initial")]) }
        return .object(["kind": .string("restart"), "previous_stream_id": .string(previous), "gap": .string("unknown")])
    }

    /// StreamRegistration 0.2.1.
    var json: JSONValue {
        .object([
            "contract_version": .string("0.2.1"), "device_id": .string(deviceID), "session_id": .string(sessionID),
            "stream_id": .string(streamID), "authorization_generation": .integer(authorizationGeneration),
            "membership_revision": .integer(membershipRevision), "continuity": continuity,
        ])
    }

    /// StreamCommand 0.2.1 Stop with an unknown boundary: the only Stop this host can record.
    func stopBody(expectedRevision: Int) -> JSONValue {
        .object([
            "contract_version": .string("0.2.1"), "device_id": .string(deviceID), "session_id": .string(sessionID),
            "stream_id": .string(streamID), "expected_revision": .integer(expectedRevision),
            "action": .object(["kind": .string("stop"), "pre_stop_sequence": .null]),
        ])
    }
}

/// The stream's server state as read: live, stopped or withdrawn, at a revision.
public struct StreamStateValue: Equatable, Sendable, Codable {
    public let state: String
    public let revision: Int
}

/// How one control or source call settled.
public enum ControlOutcome<Value: Sendable>: Sendable {
    case ok(Value)
    /// A believed typed refusal: known not taken.
    case refused(status: Int, code: String)
    /// Not known whether it took effect.
    case unknown(String)
    /// The caller stopped before any attempt was sent: known not taken.
    case notSent
}

/// Calls the host's control and display-source routes with one child's authority.
struct CaptureControl {
    static let controlCodes: [Int: Set<String>] = [
        401: ["unauthenticated"], 403: ["forbidden", "capability_required"], 404: ["not_found"],
        409: ["invalid_transition", "stream_conflict", "idempotency_conflict", "stale_revision"],
        422: ["invalid_request", "unsupported_version"], 503: ["unavailable"],
    ]
    static let replyLimit = 64 * 1024

    let authority: MacIngressAuthority
    let transport: MacIngressTransport
    /// Engineering defaults: attempts per call and the pause between them.
    var attempts = 3
    var pause: Double = 0.5

    /// `shouldStop` (the capture gate) is checked before every attempt: no registration is sent
    /// after Stop.
    func register(_ registration: StreamRegistration, key: String,
                  shouldStop: @escaping @Sendable () -> Bool) async -> ControlOutcome<StreamStateValue> {
        guard let body = try? DesktopJSON.encode(registration.json) else { return .unknown("the registration cannot be encoded") }
        return await send(request("POST", "/v2/process/streams", body: body, key: key), family: .control,
                          shouldStop: shouldStop) {
            Self.state($0, registration: registration, userID: authority.userID)
        }
    }

    func read(_ registration: StreamRegistration) async -> ControlOutcome<StreamStateValue> {
        await send(request("GET", "/v2/process/streams/" + registration.streamID, body: nil, key: nil), family: .control) {
            Self.state($0, registration: registration, userID: authority.userID)
        }
    }

    /// Sends exactly `body` (a journaled Stop) under `key`.
    func stop(_ registration: StreamRegistration, body: Data, key: String) async -> ControlOutcome<StreamStateValue> {
        await send(request("POST", "/v2/process/streams/" + registration.streamID + ":control", body: body, key: key),
                   family: .control) {
            Self.state($0, registration: registration, userID: authority.userID)
        }
    }

    /// Registers (or replays) the display source; returns its `created_at`. Not sent after Stop.
    func putSource(_ body: Data, sourceID: String, registration: StreamRegistration, timezone: String,
                   createdAt: String?, shouldStop: @escaping @Sendable () -> Bool) async -> ControlOutcome<String> {
        await send(request("PUT", "/v2/process/display-sources/" + sourceID, body: body, key: nil), family: .ingress,
                   shouldStop: shouldStop) {
            Self.snapshot($0, sourceID: sourceID, registration: registration, userID: authority.userID, timezone: timezone,
                          createdAt: createdAt)
        }
    }

    /// DisplaySourceRegistration 0.2.4.
    static func sourceBody(sourceID: String, streamID: String, timezone: String) -> Data? {
        try? DesktopJSON.encode(.object([
            "contract_version": .string("0.2.4"), "source_id": .string(sourceID), "stream_id": .string(streamID),
            "project_id": .null, "source_timezone": .string(timezone),
        ]))
    }

    // MARK: - Sending

    enum Family {
        case control, ingress
    }

    private func request(_ method: String, _ path: String, body: Data?, key: String?) -> URLRequest {
        // The origin was checked to be exactly http://127.0.0.1:<port>, and the path is ASCII.
        var request = URLRequest(url: URL(string: authority.origin + path)!, cachePolicy: .reloadIgnoringLocalAndRemoteCacheData)
        request.httpMethod = method
        request.httpShouldHandleCookies = false
        request.setValue("Bearer " + authority.token, forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            request.setValue("application/json; charset=utf-8", forHTTPHeaderField: "Content-Type")
            request.httpBody = body
        }
        if let key {
            request.setValue(key, forHTTPHeaderField: "Idempotency-Key")
        }
        return request
    }

    private func send<Value: Sendable>(_ request: URLRequest, family: Family,
                                       shouldStop: @Sendable () -> Bool = { false },
                                       accept: (Data) -> Value?) async -> ControlOutcome<Value> {
        var reason = "no attempt was made"
        for attempt in 1...max(attempts, 1) {
            if attempt > 1, pause > 0 {
                try? await Task.sleep(nanoseconds: UInt64(pause * Double(attempt - 1) * 1_000_000_000))
            }
            // Every earlier attempt may have taken effect; with none, nothing was sent.
            if Task.isCancelled || shouldStop() {
                return attempt == 1 ? .notSent : .unknown("stopped while not known whether it took effect")
            }
            let reply: MacHTTPReply
            do {
                reply = try await transport.send(request, responseLimit: Self.replyLimit)
            } catch {
                reason = "no answer (\(MacIngressUpload.errorName(error)))"
                continue
            }
            if reply.url != nil, reply.url != request.url {
                reason = "answered from another URL, which is not believed"
                continue
            }
            if reply.status == 200, let body = reply.body, let value = accept(body) {
                return .ok(value)
            }
            if reply.status != 200, let code = Self.typedError(reply, family: family), code != "unavailable" {
                return .refused(status: reply.status, code: code)
            }
            reason = MacIngressUpload.unbelieved("the request", status: reply.status, body: reply.body)
        }
        return .unknown(reason)
    }

    static func typedError(_ reply: MacHTTPReply, family: Family) -> String? {
        switch family {
        case .ingress:
            return MacIngressUpload.typedError(status: reply.status, body: reply.body, version: "0.2.4")
        case .control:
            guard let body = reply.body, body.count <= MacIngressUpload.errorLimit,
                  let error = MacIngressUpload.closed(MacIngressUpload.object(body), ["contract_version", "error", "retryable"]),
                  MacIngressUpload.same(error["contract_version"], "0.2.1"), let code = error["error"] as? String,
                  controlCodes[reply.status]?.contains(code) == true, let retryable = MacIngressUpload.boolean(error["retryable"]),
                  retryable == (code == "unavailable") else { return nil }
            return code
        }
    }

    // MARK: - Believed answers

    /// StreamState 0.2.1 for exactly this registration and owner.
    static func state(_ data: Data, registration: StreamRegistration, userID: String) -> StreamStateValue? {
        let keys: Set<String> = ["contract_version", "device_id", "session_id", "stream_id", "user_id", "authorization_generation",
                                 "membership_revision", "revision", "continuity", "state", "pre_stop_sequence"]
        guard let state = MacIngressUpload.closed(MacIngressUpload.object(data), keys),
              MacIngressUpload.same(state["contract_version"], "0.2.1"),
              MacIngressUpload.same(state["device_id"], registration.deviceID),
              MacIngressUpload.same(state["session_id"], registration.sessionID),
              MacIngressUpload.same(state["stream_id"], registration.streamID),
              MacIngressUpload.same(state["user_id"], userID),
              MacIngressUpload.integer(state["authorization_generation"]) == registration.authorizationGeneration,
              MacIngressUpload.integer(state["membership_revision"]) == registration.membershipRevision,
              continuityMatches(state["continuity"], registration),
              let revision = MacIngressUpload.integer(state["revision"]), revision >= 1,
              let value = state["state"] as? String, ["live", "stopped", "withdrawn"].contains(value) else {
            return nil
        }
        let boundary = state["pre_stop_sequence"]
        if boundary is NSNull {
            return StreamStateValue(state: value, revision: revision)
        }
        guard value == "stopped", let sequence = MacIngressUpload.integer(boundary), sequence >= 0 else { return nil }
        return StreamStateValue(state: value, revision: revision)
    }

    static func continuityMatches(_ value: Any?, _ registration: StreamRegistration) -> Bool {
        guard let previous = registration.previousStreamID else {
            guard let object = MacIngressUpload.closed(value, ["kind"]) else { return false }
            return MacIngressUpload.same(object["kind"], "initial")
        }
        guard let object = MacIngressUpload.closed(value, ["kind", "previous_stream_id", "gap"]) else { return false }
        return MacIngressUpload.same(object["kind"], "restart") && MacIngressUpload.same(object["previous_stream_id"], previous)
            && MacIngressUpload.same(object["gap"], "unknown")
    }

    /// DisplaySourceSnapshot 0.2.3 for exactly this source, stream and owner; its `created_at`.
    static func snapshot(_ data: Data, sourceID: String, registration: StreamRegistration, userID: String, timezone: String,
                         createdAt: String?) -> String? {
        let keys: Set<String> = ["contract_version", "user_id", "source_id", "source_version", "type", "device_id", "session_id",
                                 "stream_id", "project_id", "created_at", "source_timezone"]
        guard let snapshot = MacIngressUpload.closed(MacIngressUpload.object(data), keys),
              MacIngressUpload.same(snapshot["contract_version"], "0.2.3"), MacIngressUpload.same(snapshot["user_id"], userID),
              MacIngressUpload.same(snapshot["source_id"], sourceID), MacIngressUpload.integer(snapshot["source_version"]) == 1,
              MacIngressUpload.same(snapshot["type"], "shared_display"),
              MacIngressUpload.same(snapshot["device_id"], registration.deviceID),
              MacIngressUpload.same(snapshot["session_id"], registration.sessionID),
              MacIngressUpload.same(snapshot["stream_id"], registration.streamID), snapshot["project_id"] is NSNull,
              MacIngressUpload.same(snapshot["source_timezone"], timezone),
              let created = snapshot["created_at"] as? String, MacIngressUpload.isUTCTimestamp(created) else {
            return nil
        }
        if let createdAt, !MacIngressUpload.same(created, createdAt) { return nil }
        return created
    }
}
