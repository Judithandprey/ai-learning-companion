import Foundation
import FoundationNetworking
import Glibc

// Bounded Linux/corelibs probes. Actual CaptureLink logic, normalized imports; no child, socket, database or display.
final class FakeHost: CaptureHostHandle, @unchecked Sendable {
    var ended = false
    var hasExited: Bool { ended }
    func onExit(_ handler: @escaping @Sendable () -> Void) {}
    func end() async -> Bool { ended = true; return true }
}
final class World: CaptureHostLauncher, MacIngressTransport, @unchecked Sendable {
    let dir: URL
    let faultOnRegistration: Bool
    var stream: [String:Any] = [:]
    var user = "probe-user"
    var stopped = false
    var requests: [[String:Any]] = []
    var starts: [Bool] = []
    var link: CaptureLink?
    init(_ dir: URL, fault: Bool = false) { self.dir=dir;faultOnRegistration=fault }
    func launch(_ config: CaptureHostConfig, record: Data) async -> Result<(any CaptureHostHandle,HostReady),HostLaunchFailure> {
        let r = try! JSONSerialization.jsonObject(with: record) as! [String:Any]
        stream = r["registration"] as! [String:Any]; user=r["user_id"] as! String
        let fresh=r["fresh_consent"] as! Bool; starts.append(fresh)
        return .success((FakeHost(),HostReady(origin:"http://127.0.0.1:9",startStatus:fresh ? "pending":"consumed")))
    }
    func send(_ request: URLRequest,responseLimit:Int) async throws -> MacHTTPReply {
        let p=request.url!.path, method=request.httpMethod!, status=await link?.currentStatus()
        requests.append(["method":method,"path":p,"key":request.value(forHTTPHeaderField:"Idempotency-Key") ?? "",
                         "status_before_send":status?.state.rawValue ?? "nil","detail_before_send":status?.detail ?? "",
                         "body":request.httpBody.map{String(decoding:$0,as:UTF8.self)} ?? ""])
        var answer:[String:Any]
        if p.hasPrefix("/v2/process/display-sources/") {
            let b=try JSONSerialization.jsonObject(with:request.httpBody!) as! [String:Any]
            answer=["contract_version":"0.2.3","user_id":user,"source_id":b["source_id"]!,"source_version":1,
                    "type":"shared_display","device_id":stream["device_id"]!,"session_id":stream["session_id"]!,
                    "stream_id":stream["stream_id"]!,"project_id":NSNull(),"created_at":"2026-09-30T00:00:00Z","source_timezone":b["source_timezone"]!]
        } else {
            if p.hasSuffix(":control") { stopped=true }
            answer=stream;answer["contract_version"]="0.2.1";answer["user_id"]=user
            answer["revision"]=stopped ? 2:1;answer["state"]=stopped ? "stopped":"live";answer["pre_stop_sequence"]=NSNull()
            if faultOnRegistration && p=="/v2/process/streams" && method=="POST" {
                try FileManager.default.setAttributes([.posixPermissions:0o500],ofItemAtPath:dir.path)
            }
        }
        return MacHTTPReply(status:200,body:try JSONSerialization.data(withJSONObject:answer),url:request.url)
    }
}
func ensure(_ condition:Bool,_ why:String) throws { if !condition {throw NSError(domain:"probe",code:1,userInfo:[NSLocalizedDescriptionKey:why])} }
func waitFor(_ why:String,_ predicate:() async -> Bool) async throws {
    for _ in 0..<400 { if await predicate() {return};try await Task.sleep(nanoseconds:10_000_000) }
    throw NSError(domain:"probe",code:2,userInfo:[NSLocalizedDescriptionKey:"timeout: "+why])
}
func config(_ root:URL) throws -> CaptureHostConfig {
    try FileManager.default.createDirectory(at:root,withIntermediateDirectories:true)
    let dsn=root.appending(path:"dsn");try Data("unused-synthetic-dsn\n".utf8).write(to:dsn)
    try FileManager.default.setAttributes([.posixPermissions:0o600],ofItemAtPath:dsn.path)
    return CaptureHostConfig(python:root.appending(path:"never-launched"),repository:root,dsnFile:dsn,userID:"probe-user",deviceID:"probe-device",sessionID:"probe-session",producerID:"probe-producer")
}
func run() async throws {
    let root=URL(fileURLWithPath:"/tmp/macos-parent-link-f625-probes/cases-"+UUID().uuidString,isDirectory:true)
    var results:[[String:Any]]=[]
    for fault in [false,true] {
        let base=root.appending(path:fault ? "save-failure":"positive-control",directoryHint:.isDirectory),cfg=try config(base)
        let dir=base.appending(path:"journal",directoryHint:.isDirectory),w=World(dir,fault:fault)
        let link=CaptureLink(config:.success(cfg),directory:dir,launcher:w,transport:{w},stopWait:0.05);w.link=link
        let gate=LiveGate();await link.begin(gate:gate,session:base.appending(path:"empty-session",directoryHint:.isDirectory)){_ in}
        try await waitFor("source request") { w.requests.contains{$0["method"] as? String == "PUT"} }
        let put=try { () throws -> [String:Any] in guard let r=w.requests.first(where:{$0["method"] as? String == "PUT"}) else {throw NSError(domain:"probe",code:3)};return r }()
        if fault {try ensure((put["detail_before_send"] as? String)?.contains("nothing more is sent") == true,"source PUT must reproduce after sticky fault")}
        else {try ensure((put["detail_before_send"] as? String)=="","positive control no fault")}
        gate.close("user_stop");await link.stop()
        try FileManager.default.setAttributes([.posixPermissions:0o700],ofItemAtPath:dir.path)
        results.append(["case":fault ? "sticky_save_fault_still_PUTs_source":"positive_control_registration_source_Stop",
                        "bug_reproduced":fault,"requests":w.requests,"fresh_starts":w.starts])
    }
    do {
        let base=root.appending(path:"unknown-stop-reopen",directoryHint:.isDirectory),cfg=try config(base)
        let dir=base.appending(path:"journal",directoryHint:.isDirectory)
        try FileManager.default.createDirectory(at:dir,withIntermediateDirectories:true)
        let registration=StreamRegistration(deviceID:cfg.deviceID,sessionID:cfg.sessionID,streamID:"probe-stream",previousStreamID:nil)
        let oldBody=try DesktopJSON.encode(registration.stopBody(expectedRevision:1))
        var stream=LinkStream(userID:cfg.userID,producerID:cfg.producerID,registration:registration,registrationKey:"probe-stream.register",sourceID:"probe-source",sourceTimezone:"UTC",captureSession:"old-session",grant:"consumed")
        stream.delivered=true;stream.registrationSent=true;stream.registered=true;stream.state=StreamStateValue(state:"live",revision:1)
        stream.stops=[LinkStop(key:"probe-stream.stop.1",body:String(decoding:oldBody,as:UTF8.self),outcome:"unknown")]
        var journal=LinkJournal();journal.streams=[stream];try ensure(journal.problem==nil,"seed accepted")
        try JSONEncoder().encode(journal).write(to:dir.appending(path:"journal.json"))
        let w=World(dir);let link=CaptureLink(config:.success(cfg),directory:dir,launcher:w,transport:{w});w.link=link
        await link.reconcile()
        let posts=w.requests.filter{$0["method"] as? String == "POST"}
        try ensure(posts.count==1,"one Stop sent")
        try ensure(posts[0]["key"] as? String == "probe-stream.stop.2","unknown Stop assigned a different key")
        try ensure(posts[0]["body"] as? String == String(decoding:oldBody,as:UTF8.self),"same body and revision")
        results.append(["case":"unknown_Stop_reopen_changes_key_same_revision_body","bug_reproduced":true,
                        "persisted_key":"probe-stream.stop.1","sent_key":posts[0]["key"]!,"same_body":true,
                        "requests":w.requests,"fresh_starts":w.starts])
    }
    let report:[String:Any]=["commit":"f625b480e591682be75dd6a7617c08eee4cf7bd6","scope":"Linux Swift interpreter with pre-existing Apple stubs, actual candidate CaptureLink logic, fake launcher and in-memory transport; no child/socket/database/GUI/provider. Not macOS compile or native test evidence.","cases":results.count,"results":results,"temp_directory":root.path]
    let bytes=try JSONSerialization.data(withJSONObject:report,options:[.prettyPrinted,.sortedKeys]);try bytes.write(to:URL(fileURLWithPath:"/tmp/macos-parent-link-f625-probes/results.json"));print(String(decoding:bytes,as:UTF8.self))
}
Task { do {try await run();exit(0)}catch {print("PROBE ERROR: \(error)");exit(1)} }
dispatchMain()
