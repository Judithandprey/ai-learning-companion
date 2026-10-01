import Foundation
import FoundationNetworking
import CoreFoundation

public enum ControlOutcome<Value: Sendable>: Sendable {
    case ok(Value)
    /// A believed typed refusal: known not taken.
    case refused(status: Int, code: String)
    /// Not known whether it took effect.
    case unknown(String)
    /// The caller stopped before any attempt was sent: known not taken.
    case notSent
}


public struct MacHTTPReply: Sendable {
    public let status: Int
    public let body: Data?
    public let url: URL?

    public init(status: Int, body: Data?, url: URL?) {
        self.status = status
        self.body = body
        self.url = url
    }
}

/// Sends one request without following redirects and reads at most `responseLimit` bytes of a 200
/// reply (a reply with another status may be read to less; see `LoopbackHTTPTransport`).
public protocol MacIngressTransport: Sendable {
    func send(_ request: URLRequest, responseLimit: Int) async throws -> MacHTTPReply
}


enum MacIngressUpload {
static let errorLimit = 4096

    static let codes: [Int: Set<String>] = [
        400: ["invalid_json"], 401: ["unauthenticated"], 403: ["forbidden", "capability_required"], 404: ["not_found"],
        409: ["source_identity_conflict", "record_conflict", "idempotency_conflict", "dependency_missing", "stale_scope",
              "capture_stopped", "unsupported_source"],
        413: ["payload_too_large"], 415: ["unsupported_media_type"], 422: ["unsupported_version", "invalid_request"],
        503: ["unavailable"],
    ]

static func object(_ data: Data) -> [String: Any]? {
        guard data.first == UInt8(ascii: "{"), !data.contains(0),
              let value = try? JSONSerialization.jsonObject(with: data, options: []) else { return nil }
        return value as? [String: Any]
    }
static func closed(_ value: Any?, _ keys: Set<String>) -> [String: Any]? {
        guard let object = value as? [String: Any], Set(object.keys) == keys else { return nil }
        return object
    }
static func text(_ value: Any?) -> String? {
        value as? String
    }
static func boolean(_ value: Any?) -> Bool? {
        guard let number = value as? NSNumber, CFGetTypeID(number) == CFBooleanGetTypeID() else { return nil }
        return number.boolValue
    }
static func same(_ value: Any?, _ expected: String) -> Bool {
        guard let string = value as? String else { return false }
        return string.utf8.elementsEqual(expected.utf8)
    }
static func typedError(status: Int, body: Data?, version: String) -> String? {
        guard let body, body.count <= errorLimit,
              let error = closed(object(body), ["contract_version", "error", "retryable"]),
              same(error["contract_version"], version), let code = text(error["error"]),
              codes[status]?.contains(code) == true, let retryable = boolean(error["retryable"]),
              retryable == (code == "unavailable" || code == "dependency_missing") else {
            return nil
        }
        return code
    }
static func unbelieved(_ what: String, status: Int, body: Data?) -> String {
        if (300...399).contains(status) { return "\(what) was answered with redirect \(status), which is not followed" }
        if body == nil { return "\(what) was answered \(status) with more than the expected reply length" }
        if status == 200 { return "\(what) was answered 200 with a reply that does not correspond to it" }
        if status == 503 { return "\(what) was answered 503: the service is unavailable" }
        return "\(what) was answered \(status) with a reply that is not a released error for it"
    }
static func errorName(_ error: Error) -> String {
        if let url = error as? URLError { return "URLError \(url.code.rawValue)" }
        if error is CancellationError { return "cancelled" }
        return "other error"
    }
}
struct ControlHarness {
let transport: any MacIngressTransport
var attempts = 2
var pause = 0.0
static let replyLimit = 64 * 1024
enum Family { case control, ingress }

    static let controlCodes: [Int: Set<String>] = [
        401: ["unauthenticated"], 403: ["forbidden", "capability_required"], 404: ["not_found"],
        409: ["invalid_transition", "stream_conflict", "idempotency_conflict", "stale_revision"],
        422: ["invalid_request", "unsupported_version"], 503: ["unavailable"],
    ]

func send<Value: Sendable>(_ request: URLRequest, family: Family,
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
}


actor ScriptedTransport: MacIngressTransport {
    enum Step: Sendable { case lost; case reply(Int, String) }
    let steps: [Step]
    var seen: [URLRequest] = []
    init(_ steps: [Step]) { self.steps = steps }
    func send(_ request: URLRequest, responseLimit: Int) async throws -> MacHTTPReply {
        let step = steps[seen.count]; seen.append(request)
        switch step {
        case .lost: throw URLError(.networkConnectionLost)
        case .reply(let status, let text): return MacHTTPReply(status: status, body: Data(text.utf8), url: request.url)
        }
    }
    func count() -> Int { seen.count }
    func exact() -> Bool {
        seen.allSatisfy { $0.httpBody == seen.first?.httpBody && $0.allHTTPHeaderFields == seen.first?.allHTTPHeaderFields && $0.url == seen.first?.url }
    }
}
func typed(_ status: Int) -> ScriptedTransport.Step {
    let code = status == 401 ? "unauthenticated" : status == 403 ? "forbidden" : "unavailable"
    return .reply(status, "{\"contract_version\":\"0.2.1\",\"error\":\"\(code)\",\"retryable\":\(status == 503 ? "true" : "false")}")
}
let cases: [(String,[ScriptedTransport.Step], Bool, String)] = [
    ("lost_then_401", [.lost, typed(401)], false, "unknown"),
    ("503_then_403", [typed(503), typed(403)], false, "unknown"),
    ("malformed_200_then_403", [.reply(200, "{}"), typed(403)], false, "unknown"),
    ("first_refusal", [typed(403)], false, "refused"),
    ("lost_then_exact_success", [.lost, .reply(200, "exact-accepted-state")], false, "ok"),
    ("stop_before_send", [], true, "notSent")
]
Task {
    var rows: [[String: Any]] = []
    for (name, steps, stopped, expected) in cases {
        let t = ScriptedTransport(steps)
        let control = ControlHarness(transport: t)
        var request = URLRequest(url: URL(string:"http://127.0.0.1:49111/v2/process/streams/s:control")!)
        request.httpMethod = "POST"
        request.httpBody = Data("exact frozen Stop bytes".utf8)
        request.setValue("synthetic-key", forHTTPHeaderField: "Idempotency-Key")
        let result: ControlOutcome<String> = await control.send(request, family: .control, shouldStop: { stopped }) {
            $0 == Data("exact-accepted-state".utf8) ? "accepted" : nil
        }
        let actual: String
        switch result { case .ok: actual="ok"; case .refused: actual="refused"; case .unknown: actual="unknown"; case .notSent: actual="notSent" }
        rows.append(["case":name,"expected":expected,"actual":actual,"pass":actual==expected,
                     "attempts":await t.count(),"same_request_bytes_headers_url":await t.exact()])
    }
    let data = try! JSONSerialization.data(withJSONObject: ["execution":"Linux Swift exact send function; scripted transport; not native execution", "checks":rows], options:[.prettyPrinted,.sortedKeys])
    print(String(decoding:data,as:UTF8.self))
    exit(0)
}
dispatchMain()
