from pathlib import Path
import hashlib, json
root=Path('/tmp/lc-macos-parent-f625b48/apps/macos/CompanionDesktop/Sources/DesktopCapture')
out=Path('/tmp/macos-parent-f625-host-control-probes')
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
''']
(out/'probe.swift').write_text('\n'.join(parts))
(out/'source.json').write_text(json.dumps({'candidate':'f625b480e591682be75dd6a7617c08eee4cf7bd6','files':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [root/'CaptureControl.swift',root/'CaptureHost.swift',root/'MacIngressUpload.swift']},'extraction':'CaptureControl.send/typedError and actual helpers; private removed only from send; scripted transport and acceptance callback'},indent=2)+'\n')
