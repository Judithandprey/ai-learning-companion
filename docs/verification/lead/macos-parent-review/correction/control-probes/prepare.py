from pathlib import Path
import hashlib, json
root=Path('/tmp/lc-macos-parent-fb891d6/apps/macos/CompanionDesktop/Sources/DesktopCapture')
out=Path('/tmp/mac-control-fb891-probes')
c=(root/'CaptureControl.swift').read_text(); u=(root/'MacIngressUpload.swift').read_text()
def fn(src, signature):
    start=src.index(signature)
    end=src.index('\n    }\n', start)+len('\n    }')
    return src[start:end]

# Only the exact generic control send/typed-error functions and their actual JSON/redaction
# helpers are compiled. The scripted transport supplies responses; no URLSession or listener.
parts=['import Foundation\nimport FoundationNetworking\nimport CoreFoundation\n']
parts += [c[c.index('public enum ControlOutcome'):c.index('/// Calls the host')]]
parts += [u[u.index('public struct MacHTTPReply'):u.index('public enum MacIngressUpload')]]
parts += ['enum MacIngressUpload {\nstatic let errorLimit = 4096\n']
parts += [u[u.index('    static let codes:'):u.index('\n    public static func',u.index('    static let codes:'))].split('\n    ///')[0]]
for sig in ['static func object(', 'static func closed(', 'static func text(', 'static func boolean(', 'static func same(', 'static func typedError(', 'static func unbelieved(', 'static func errorName(']:
    parts += [fn(u,sig)]
parts += ['}\nstruct ControlHarness {\nlet transport: any MacIngressTransport\nvar attempts = 2\nvar pause = 0.0\nstatic let replyLimit = 64 * 1024\nenum Family { case control, ingress }\n']
parts += [c[c.index('    static let controlCodes:'):c.index('    static let replyLimit')]]
parts += [fn(c,'private func send<').replace('private func send<','func send<',1),fn(c,'static func typedError('), '}\n']
parts += [r'''
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
    let code = status == 401 ? "unauthenticated" : status == 403 ? "forbidden" : status == 404 ? "not_found" : "unavailable"
    return .reply(status, "{\"contract_version\":\"0.2.1\",\"error\":\"\(code)\",\"retryable\":\(status == 503 ? "true" : "false")}")
}
let cases: [(String,[ScriptedTransport.Step], Bool, String)] = [
    ("lost_then_401", [.lost, typed(401)], false, "unknown"),
    ("503_then_403", [typed(503), typed(403)], false, "unknown"),
    ("malformed_200_then_403", [.reply(200, "{}"), typed(403)], false, "unknown"),
    ("first_refusal", [typed(403)], false, "refused"),
    ("lost_then_exact_success", [.lost, .reply(200, "exact-accepted-state")], false, "ok"),
    ("stop_before_send", [], true, "notSent"),
    ("lost_then_404_write", [.lost, typed(404)], false, "unknown"),
    ("source_lost_then_404", [.lost, .reply(404, "{\"contract_version\":\"0.2.4\",\"error\":\"not_found\",\"retryable\":false}")], false, "unknown"),
    ("read_lost_then_403", [.lost, typed(403)], false, "refused")
]
Task {
    var rows: [[String: Any]] = []
    for (name, steps, stopped, expected) in cases {
        let t = ScriptedTransport(steps)
        let control = ControlHarness(transport: t)
        var request = URLRequest(url: URL(string:"http://127.0.0.1:49111/v2/process/streams/s:control")!)
        request.httpMethod = name == "read_lost_then_403" ? "GET" : name == "source_lost_then_404" ? "PUT" : "POST"
        request.httpBody = Data("exact frozen Stop bytes".utf8)
        request.setValue("synthetic-key", forHTTPHeaderField: "Idempotency-Key")
        let result: ControlOutcome<String> = await control.send(request, family: name == "source_lost_then_404" ? .ingress : .control, shouldStop: { stopped }) {
            $0 == Data("exact-accepted-state".utf8) ? "accepted" : nil
        }
        let actual: String
        switch result { case .ok: actual="ok"; case .refused: actual="refused"; case .unknown: actual="unknown"; case .notSent: actual="notSent" }
        var laterStatus: Int? = nil
        var laterCode: String? = nil
        if case .unknown(_, let later) = result { laterStatus = later?.status; laterCode = later?.code }
        let expectedLater = ["lost_then_401":401,"503_then_403":403,"malformed_200_then_403":403,"lost_then_404_write":404,"source_lost_then_404":404][name]
        let codeForStatus = [401:"unauthenticated",403:"forbidden",404:"not_found"]
        let count = await t.count()
        let exact = await t.exact()
        let expectedAttempts = stopped ? 0 : name == "first_refusal" ? 1 : 2
        let pass = actual == expected && laterStatus == expectedLater && laterCode == expectedLater.flatMap { codeForStatus[$0] } && count == expectedAttempts && exact
        rows.append(["case":name,"expected":expected,"actual":actual,"pass":pass,
                     "attempts":count,"same_request_bytes_headers_url":exact,
                     "method":request.httpMethod!,"family":name == "source_lost_then_404" ? "0.2.4" : "0.2.1",
                     "later_status":laterStatus as Any? ?? NSNull(),"later_code":laterCode as Any? ?? NSNull()])
    }
    let data = try! JSONSerialization.data(withJSONObject: ["execution":"Linux Swift exact send function; scripted transport; not native execution", "checks":rows], options:[.prettyPrinted,.sortedKeys])
    print(String(decoding:data,as:UTF8.self))
    exit(rows.allSatisfy { $0["pass"] as? Bool == true } ? 0 : 1)
}
dispatchMain()
''']
(out/'probe.swift').write_text('\n'.join(parts))
(out/'source.json').write_text(json.dumps({'candidate':'fb891d699cc33cde10c2a1fa25928f3c87346b3f','files':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [root/'CaptureControl.swift',root/'CaptureHost.swift',root/'MacIngressUpload.swift']},'extraction':'CaptureControl.send/typedError and actual helpers; private removed only from send; scripted transport and acceptance callback'},indent=2)+'\n')
