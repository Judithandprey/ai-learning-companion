import Foundation
import FoundationNetworking
import Glibc

// Independent bounded controls over actual candidate CaptureLink; no child/socket/DB/display.
final class FakeHost: CaptureHostHandle, @unchecked Sendable {
    var ended=false
    var hasExited:Bool { ended }
    func onExit(_ handler:@escaping @Sendable ()->Void) {}
    func end() async ->Bool { ended=true;return true }
}
final class World: CaptureHostLauncher, MacIngressTransport, @unchecked Sendable {
    let dir:URL
    var fault:String?
    var stream:[String:Any]=[:]
    var user="probe-user", state="live", revision=1
    var refuseStop=false
    var requests:[[String:Any]]=[], starts:[Bool]=[], hosts:[FakeHost]=[]
    var link:CaptureLink?
    init(_ dir:URL,fault:String?=nil){self.dir=dir;self.fault=fault}
    func makeFault() throws {try FileManager.default.setAttributes([.posixPermissions:0o500],ofItemAtPath:dir.path)}
    func launch(_ config:CaptureHostConfig,record:Data) async ->Result<(any CaptureHostHandle,HostReady),HostLaunchFailure> {
        let r=try! JSONSerialization.jsonObject(with:record) as! [String:Any]
        stream=r["registration"] as! [String:Any];user=r["user_id"] as! String
        let fresh=r["fresh_consent"] as! Bool;starts.append(fresh)
        let h=FakeHost();hosts.append(h)
        if fault=="launch" {try! makeFault()}
        return .success((h,HostReady(origin:"http://127.0.0.1:9",startStatus:fresh ? "pending":"consumed")))
    }
    func send(_ request:URLRequest,responseLimit:Int) async throws ->MacHTTPReply {
        let path=request.url!.path,method=request.httpMethod!
        let shown=await link?.currentStatus()
        requests.append(["method":method,"path":path,"key":request.value(forHTTPHeaderField:"Idempotency-Key") ?? "", "body":request.httpBody.map{String(decoding:$0,as:UTF8.self)} ?? "", "detail":shown?.detail ?? ""])
        if path.hasSuffix(":control"),refuseStop {
            return MacHTTPReply(status:403,body:Data("{\"contract_version\":\"0.2.1\",\"error\":\"forbidden\",\"retryable\":false}".utf8),url:request.url)
        }
        var answer:[String:Any]
        if path.hasPrefix("/v2/process/display-sources/") {
            let b=try JSONSerialization.jsonObject(with:request.httpBody!) as! [String:Any]
            answer=["contract_version":"0.2.3","user_id":user,"source_id":b["source_id"]!,"source_version":1,"type":"shared_display","device_id":stream["device_id"]!,"session_id":stream["session_id"]!,"stream_id":stream["stream_id"]!,"project_id":NSNull(),"created_at":"2026-09-30T00:00:00Z","source_timezone":b["source_timezone"]!]
        } else {
            if path.hasSuffix(":control") {state="stopped";revision += 1}
            answer=stream;answer["contract_version"]="0.2.1";answer["user_id"]=user
            answer["revision"]=revision;answer["state"]=state;answer["pre_stop_sequence"]=NSNull()
            if (fault=="registration" && path=="/v2/process/streams" && method=="POST") || (fault=="read" && method=="GET") {try makeFault()}
        }
        return MacHTTPReply(status:200,body:try JSONSerialization.data(withJSONObject:answer),url:request.url)
    }
}
func ensure(_ b:Bool,_ why:String)throws {if !b{throw NSError(domain:"probe",code:1,userInfo:[NSLocalizedDescriptionKey:why])}}
func until(_ predicate:() async ->Bool) async throws {for _ in 0..<400{if await predicate(){return};try await Task.sleep(nanoseconds:10_000_000)};throw NSError(domain:"timeout",code:2)}
func config(_ root:URL)throws ->CaptureHostConfig {
    try FileManager.default.createDirectory(at:root,withIntermediateDirectories:true)
    let dsn=root.appending(path:"dsn");try Data("synthetic-unused\n".utf8).write(to:dsn)
    try FileManager.default.setAttributes([.posixPermissions:0o600],ofItemAtPath:dsn.path)
    return CaptureHostConfig(python:root.appending(path:"never-launched"),repository:root,dsnFile:dsn,userID:"probe-user",deviceID:"probe-device",sessionID:"probe-session",producerID:"probe-producer")
}
func journal(_ dir:URL)throws ->LinkJournal {try JSONDecoder().decode(LinkJournal.self,from:Data(contentsOf:dir.appending(path:"journal.json")))}
func run() async throws {
    let root=URL(fileURLWithPath:"/tmp/mac-parent-fb891-review.probes/cases-"+UUID().uuidString,isDirectory:true)
    var results:[[String:Any]]=[]
    for mode in ["healthy","launch","registration","read","server_end","unwritten_Stop"] {
        let base=root.appending(path:mode,directoryHint:.isDirectory),cfg=try config(base),dir=base.appending(path:"journal",directoryHint:.isDirectory)
        let fault=mode=="server_end" ? "registration" : (["healthy","unwritten_Stop"].contains(mode) ? nil : mode)
        let w=World(dir,fault:fault)
        if mode=="server_end" {w.state="withdrawn";w.revision=2}
        let link=CaptureLink(config:.success(cfg),directory:dir,launcher:w,transport:{w},stopWait:0.05);w.link=link
        let gate=LiveGate()
        await link.begin(gate:gate,session:base.appending(path:"empty-session",directoryHint:.isDirectory)){reason in gate.close(reason)}
        if fault != nil {try await until{w.hosts.first?.ended==true}}
        else {try await until{await link.currentStatus().state == .storing}}
        let expected=mode=="launch" ? 0 : (mode=="registration" || mode=="server_end" ? 1 : mode=="read" ? 2 : 3)
        try ensure(w.requests.count==expected,"request fence: "+mode)
        try ensure(gate.isOpen == (mode != "server_end"),"local capture preserved or known end honored: "+mode)
        if fault != nil {try ensure(w.hosts.count==1 && w.hosts[0].ended,"owned child teardown")}
        if mode=="unwritten_Stop" {try w.makeFault()}
        gate.close("user_stop");await link.stop()
        if mode != "healthy" {try ensure(w.requests.count==expected,"no unwritten Stop or post-fault request")}
        else {try ensure(w.requests.filter{($0["path"] as? String)?.hasSuffix(":control")==true}.count==1,"healthy Stop")}
        try ensure(w.hosts.allSatisfy{$0.ended},"owned hosts ended")
        try FileManager.default.setAttributes([.posixPermissions:0o700],ofItemAtPath:dir.path)
        let before=w.requests.count
        if mode=="registration" || mode=="read" {
            let retained=try journal(dir).streams[0]
            try ensure(retained.registrationSent && retained.final==nil,"old durable uncertainty retained")
            w.fault=nil
            let reopened=CaptureLink(config:.success(cfg),directory:dir,launcher:w,transport:{w});w.link=reopened
            await reopened.reconcile()
            try ensure(w.starts==[true,false],"reopen has no fresh consent")
            try ensure(w.requests.dropFirst(before).map{$0["method"] as! String}==["GET","POST","GET"],"reopen read/Stop/read only")
            try ensure(try journal(dir).streams[0].final=="stopped","reopen settled")
        }
        results.append(["case":mode,"pass":true,"requests_before_reopen":before,"requests":w.requests,"fresh_starts":w.starts,"hosts_ended":w.hosts.allSatisfy{$0.ended}])
    }
    for mode in ["same_revision_unknown","changed_revision","recorded_unknown_then_refused","recorded_written","recorded_refused_then_refused"] {
        let base=root.appending(path:mode,directoryHint:.isDirectory),cfg=try config(base),dir=base.appending(path:"journal",directoryHint:.isDirectory)
        try FileManager.default.createDirectory(at:dir,withIntermediateDirectories:true)
        let reg=StreamRegistration(deviceID:cfg.deviceID,sessionID:cfg.sessionID,streamID:"probe-stream",previousStreamID:nil)
        let oldBody=try DesktopJSON.encode(reg.stopBody(expectedRevision:1))
        var stream=LinkStream(userID:cfg.userID,producerID:cfg.producerID,registration:reg,registrationKey:"probe-stream.register",sourceID:"probe-source",sourceTimezone:"UTC",captureSession:"old-session",grant:"consumed")
        stream.delivered=true;stream.registrationSent=true;stream.registered=true;stream.state=StreamStateValue(state:"live",revision:1)
        let earlier=mode=="recorded_written" ? "written" : mode=="recorded_refused_then_refused" ? "refused" : "unknown"
        stream.stops=[LinkStop(key:"probe-stream.stop.1",body:String(decoding:oldBody,as:UTF8.self),outcome:earlier)]
        var seed=LinkJournal();seed.streams=[stream];try ensure(seed.problem==nil,"seed valid")
        try JSONEncoder().encode(seed).write(to:dir.appending(path:"journal.json"))
        let w=World(dir);w.revision=mode=="changed_revision" ? 2 : 1;w.refuseStop=mode.hasSuffix("then_refused")
        let link=CaptureLink(config:.success(cfg),directory:dir,launcher:w,transport:{w});w.link=link
        await link.reconcile()
        let posts=w.requests.filter{$0["method"] as? String == "POST"};try ensure(posts.count==1,"one Stop")
        let changed=mode=="changed_revision",expected=try DesktopJSON.encode(reg.stopBody(expectedRevision:changed ? 2 : 1))
        try ensure(posts[0]["key"] as? String == (changed ? "probe-stream.stop.2":"probe-stream.stop.1"),"correct Stop key")
        try ensure(posts[0]["body"] as? String == String(decoding:expected,as:UTF8.self),"exact Stop bytes")
        let retained=try journal(dir).streams[0],last=retained.stops.last!
        try ensure(retained.stops.count==(changed ? 2:1),"no duplicate command for same revision")
        if changed {try ensure(retained.stops[0].body==String(decoding:oldBody,as:UTF8.self) && retained.stops[0].outcome=="unknown","old witness preserved")}
        else {try ensure(last.replays==1 && !retained.notes.isEmpty,"prior witness represented in notes")}
        let outcome=w.refuseStop ? (earlier=="refused" ? "refused":"unknown") : "stopped"
        try ensure(last.outcome==outcome,"cross-restart uncertainty retained")
        try ensure(w.starts==[false] && w.hosts.allSatisfy{$0.ended},"no new consent; own child ended")
        results.append(["case":mode,"pass":true,"requests":w.requests,"outcome":last.outcome,"retained_stop_count":retained.stops.count,"fresh_starts":w.starts])
    }
    let result:[String:Any]=["candidate":"fb891d699cc33cde10c2a1fa25928f3c87346b3f","scope":"Linux exact candidate logic with Apple stubs, fake host/HTTP; actual chmod failure; no native, socket, DB or GUI","cases":results.count,"results":results,"temporary_directory":root.path]
    let raw=try JSONSerialization.data(withJSONObject:result,options:[.prettyPrinted,.sortedKeys]);try raw.write(to:URL(fileURLWithPath:"/tmp/mac-parent-fb891-review.probes/results.json"));print(String(decoding:raw,as:UTF8.self))
}
Task{do{try await run();exit(0)}catch{print("PROBE ERROR: \(error)");exit(1)}}
dispatchMain()
