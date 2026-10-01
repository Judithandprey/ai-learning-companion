#!/usr/bin/env python3
"""Mutation check for the ASK tests on the Linux harness. Each mutant changes one place of a
harness copy of the sources (never the worktree), runs the one test meant to catch it, and is
'caught' when that test fails in a full run. Baseline: the same tests pass unmutated."""
import subprocess, sys, os, re, signal
H='/tmp/lc-link-run'
T={'wire':'testAskEnvelopeAndStrictAnswers','sel':'testAskSelectionIsFrozenWithItsImageInkAndFacts',
   'conn':'testAskConnectionAndSignInStatus','chg':'testAskConnectionChangesRefusalsAndSilenceAreShownAsTheyAre',
   'submit':'testAskSendsOnlyOnSubmitAndShowsTheAnswerOnItsCard','local':'testAskRefusesLocallyWithoutSendingAnything',
   'cancel':'testAskCancelNewSelectionAndStopSuppressLaterAnswers','late':'testAskLateAnswersCloseAndQuitWithAQuestionOnItsWay',
   'loss':'testAskConnectorLossAndTimeoutAreUnknownAndNeverRetried','child':'testAskConnectorChildGetsAPrivatePipeAndAMinimalEnvironment',
   'held':'testAskTakesBackARequestThatHasNotReachedTheConnector','pipe':'testAskRealChildNeverGetsARequestTakenBackInThePipe'}
M=[
 ('M01 late answer shown on a later question (inFlight guard removed)','AskLink.swift','guard inFlight?.requestID == request.requestID, var waitingCard','guard var waitingCard','late'),
 ('M02 request record not kept before sending','AskLink.swift','guard AskFiles.writeNew(record, to: prepared.directory.appending(path: request.requestID + ".request.json")) else {','guard true else {','submit'),
 ('M03 quit does not fence the question on its way','AskLink.swift','if let fenced = fenceLocally(detail: "the app is closing") {','if let fenced = Optional<Fenced>.none {','late'),
 ('M04 closing the card does not fence','AskLink.swift','let fenced = fenceLocally(detail: "the card was closed")','let fenced: Fenced? = nil','late'),
 ('M05 Cancel on an idle card does not close it','AskLink.swift','        guard card.phase == .sending else {\n            status.card = nil\n            prepared = nil','        guard card.phase == .sending else {','late'),
 ('M06 all strokes frozen, hidden ones included','AskSelection.swift','strokes: document.visibleStrokes(atRevision: selection.inkRevision) ?? [])','strokes: document.strokes)','sel'),
 ('M07 login host matched by contains','AskWire.swift','host == $0 || host.hasSuffix("." + $0)','host == $0 || host.contains("." + $0)','wire'),
 ('M08 unanswered cancel recorded as certain','AskLink.swift','        var uncertain = true\n        let reply = await call("ask/cancel"','        var uncertain = false\n        let reply = await call("ask/cancel"','late'),
 ('M09 Submit starts a connector by itself','AskLink.swift','        guard var card = status.card, card.canSubmit, inFlight == nil, let prepared, prepared.cardID == card.cardID else { return }','        if case .success = config, child == nil { await connect() }\n        guard var card = status.card, card.canSubmit, inFlight == nil, let prepared, prepared.cardID == card.cardID else { return }','submit'),
 ('M10 completion of another sign-in accepted','AskLink.swift','let pending = login, MacIngressUpload.same(params["login_id"], pending.id),','let pending = login, pending.id.isEmpty == false,','conn'),
 ('M11 no 8 MiB bound on the request image','AskWire.swift','guard (1...Self.maxImageBytes).contains(image.count) else {','guard image.count >= 1 else {','wire'),
 ('M12 no 12 MiB bound on a request line','AskWire.swift','line.count < maxRequestLine else { return nil }','line.count < Int.max else { return nil }','wire'),
 ('M13 identifiers up to 100000 code points','AskWire.swift','!text.isEmpty && text.unicodeScalars.count <= 128','!text.isEmpty && text.unicodeScalars.count <= 100_000','wire'),
 ('M14 image models not default-first','AskLink.swift','models.filter(\\.imageInput).sorted { $0.isDefault && !$1.isDefault }','models.filter(\\.imageInput)','submit'),
 ('M15 child ignoring EOF is never terminated or killed','AskChild.swift','if !bySelf, process.isRunning {','if !bySelf, process.isRunning, endGrace < 0 {','child'),
 ('M16 connector sign-in error text shown','AskLink.swift',': "the sign-in did not complete"\n',': "the sign-in did not complete (" + ((params["error"] as? String) ?? "") + ")"\n','conn'),
 ('M17 ask/cancel believed from uncertain alone','AskLink.swift','uncertain = !(wasCancelled && !reported)','uncertain = reported','late'),
 ('M18 over-long line does not stop later lines','AskChild.swift','            violated = true\n            buffer = Data()\n            report = !reported\n            reported = true\n            return true','            return true','child'),
 ('M19 question limit counted in grapheme clusters','AskWire.swift','guard question.unicodeScalars.count <= Self.maxQuestionCharacters else {','guard question.count <= Self.maxQuestionCharacters else {','wire'),
 ('M20 new card waits for the connector cancel answer','AskLink.swift','        let fenced = fenceLocally(detail: "a new selection was made")\n','        let fenced = fenceLocally(detail: "a new selection was made")\n        if let fenced { await settle(fenced) }\n','late'),
 ('M21 quit does not wait for fences still settling','AskLink.swift','        while fencing > 0 { await Task.yield() }\n','','late'),
 ('M22 second sign-in click starts another sign-in','AskLink.swift','        if let pending = login { return pending.url }\n        guard !loginStarting else { return nil }\n','','conn'),
 ('M23 a refused question does not re-read the connection','AskLink.swift','reread = ["unauthenticated", "quota", "failed", "unavailable"].contains(code)','reread = false','submit'),
 ('M24 local refusal drops the answered state','AskLink.swift','card.phase = card.answer == nil ? .failed : .answered','card.phase = .failed','submit'),
 ('M25 unkept outcome not said on the card','AskLink.swift','\n        if !AskFiles.writeNew(.object(outcome), to:','\n        if false, !AskFiles.writeNew(.object(outcome), to:','submit'),
 ('M26 ink hash bound although ink in pixels is unknown','AskSelection.swift','inkSHA256: ink == .unknown ? nil : input.documentSHA256)','inkSHA256: input.documentSHA256)','sel'),
 ('M27 answer accepted without kind generated_assistance','AskWire.swift','MacIngressUpload.same(result["kind"], "generated_assistance"),','','wire'),
 ('M28 connection reads not coalesced','AskLink.swift','        guard !reading else {\n            readAgain = true\n            return\n        }\n','','chg'),
 ('M29 unconfirmed session/stop not said','AskLink.swift','timeout: callTimeout)\n        if case .result(_, let result)? = reply, result.isEmpty { return }\n        // Not confirmed by the connector: said so. This app\'s own fence','timeout: callTimeout)\n        if reply != nil || reply == nil { return }\n        // Not confirmed by the connector: said so. This app\'s own fence','cancel'),
 ('M30 unavailable replaced by "ended" when the connector exits','AskLink.swift','keepsRefusal: !cutOff)','keepsRefusal: false)','chg'),
 ('M31 connection/changed ignored','AskLink.swift','if method == "connection/changed", params.isEmpty {','if method == "connection/changed", !params.isEmpty {','chg'),
 ('M32 connector unavailable shown as unknown','AskLink.swift','status.connection = code == "unavailable" ? .refused : .unknown','status.connection = .unknown','chg'),
 ('M33 login URL length unbounded','AskWire.swift','text.utf8.count <= 16_384','text.utf8.count <= 16_000_000','wire'),
 ('M34 answer length counted in grapheme clusters','AskWire.swift','text.unicodeScalars.count <= maxTextCharacters','text.count <= maxTextCharacters','wire'),
 ('M35 question sent while a sign-in is pending','AskLink.swift','guard login == nil, !loginStarting else {','guard login == nil || login != nil else {','local'),
 ('M36 fence leaves the old request counted','AskLink.swift','        inFlight = nil\n        inFlightLine = nil\n        card.phase = .cancelled','        inFlightLine = nil\n        card.phase = .cancelled','late'),
 ('M37 connector cancel answer not recorded','AskLink.swift','"connector_cancelled": cancelled.map(JSONValue.bool) ?? .null,','"connector_cancelled": .null,','cancel'),
 ('M38 ink wording says drawn when unknown','AskLink.swift','card.ink = ready.ink','card.ink = .drawn','submit'),
 ('M39 answered record lacks the presentation limit','AskLink.swift','outcome["presentation"] = .string("put on the card of this selection; display on screen is not recorded")','','submit'),
 ('M40 stopped capture can still submit','AskLink.swift','        guard !stopped.contains(prepared.captureSessionID) else {','        guard !stopped.contains(prepared.captureSessionID) || true else {','cancel'),
 ('M41 unkept outcome: write tried but nothing said on the card','AskLink.swift','\n            waitingCard.detail = (waitingCard.detail.map { $0 + "; " } ?? "") + "this outcome could not be kept on this Mac"\n','\n            waitingCard.detail = waitingCard.detail.map { $0 }\n','submit'),
 ('M42 display id sent as a number','AskWire.swift','"id": .string(String(self.context.displayID))','"id": .integer(Int(self.context.displayID))','wire'),
 ('M43 region start rounded to nearest instead of down','AskSelection.swift','let low = max(0, (origin * scale).rounded(.down))','let low = max(0, (origin * scale).rounded())','sel'),
 ('M44 an answer through another sign-in mode is accepted','AskWire.swift','MacIngressUpload.same(result["request_id"], request.requestID), MacIngressUpload.same(result["auth_mode"], "chatgpt"),','MacIngressUpload.same(result["request_id"], request.requestID),','wire'),
 ('M45 completion right behind the sign-in start is dropped','AskLink.swift','        if login == nil, loginStarting {\n            earlyCompletions.append(params)\n            return\n        }\n','','conn'),
 ('M46 a connector that keeps a failure is never replaced','AskLink.swift','[.refused, .unknown].contains(status.connection),','[AskStatus.Connection.notConfigured].contains(status.connection),','chg'),
 ('M47 a card opens without a connector configuration','AskLink.swift','        guard case .success = config else { return }\n        let fenced = fenceLocally(detail: "a new selection was made")','        let fenced = fenceLocally(detail: "a new selection was made")','conn'),
 ('M48 only unauthenticated re-reads the connection','AskLink.swift','reread = ["unauthenticated", "quota", "failed", "unavailable"].contains(code)','reread = code == "unauthenticated"','chg'),
 ('M49 quota refusal worded as a sign-in problem','AskWire.swift','case "quota": return "the subscription\'s quota does not allow it now"','case "quota": return "ChatGPT is not signed in"','wire'),
 ('M50 connector replaced while a question is on its way','AskLink.swift','           inFlight == nil, fencing == 0, !loginStarting,','           fencing == 0, !loginStarting,','chg'),
 ('M51 region end rounded down instead of up','AskSelection.swift','let high = min(Double(frame), ((origin + size) * scale).rounded(.up))','let high = min(Double(frame), ((origin + size) * scale).rounded(.down))','sel'),
 ('M52 exit of an earlier launch taken as the new connector\'s','AskLink.swift','guard child != nil, serial == launch else { return }','guard child != nil, serial <= launch else { return }','child'),
 ('M53 a pending sign-in keeps a failed connector from being replaced','AskLink.swift','inFlight == nil, fencing == 0, !loginStarting, !reading, replacing == nil {','inFlight == nil, fencing == 0, login == nil, !loginStarting, !reading, replacing == nil {','chg'),
 ('M54 a connector is started while the app closes','AskLink.swift','guard case .success(let config) = config, !closed else { return false }','guard case .success(let config) = config else { return false }','chg'),
 ('M55 sign-in page handed out for a connector that has ended','AskLink.swift','guard let current = child, current === running, !current.hasExited else { return nil }','guard let current = child, current === running else { return nil }','conn'),
 ('M56 Quit does not wait for the connector being replaced','AskLink.swift','        await replacing?.end()\n','','chg'),
 ('M57 one read for every connection/changed event','AskLink.swift','let wait = changeInterval - Date().timeIntervalSince(lastChangeRead)','let wait = -1.0 - Date().timeIntervalSince(lastChangeRead)','chg'),
 ('M58 an unconfirmed sign-in cancel is not said','AskLink.swift','        await unconfirmed("the connector did not confirm that the sign-in was cancelled")\n','','chg'),
 ('M59 a refused sign-in start worded with a question\'s words','AskLink.swift','await unconfirmed("the sign-in could not be started"\n                    + (code == "busy" ? ": the connector is busy with a question or another sign-in" : ""))','status.detail = "the sign-in could not be started: " + AskWire.words(for: code)','chg'),
 ('M60 a fence does not take the undelivered request back','AskLink.swift','let taken = inFlightLine?.revoke() ?? false','let taken = false','held'),
 ('M61 the writer goes on after the line was taken back','AskChild.swift','                    guard let count = revocation.attempt(remaining: buffer.count - offset, started: offset > 0, step) else {\n                        return (false, offset)\n                    }\n                    written = count','                    written = revocation.attempt(remaining: buffer.count - offset, started: offset > 0, step) ?? step()','pipe'),
 ('M62 a line is appended behind a part that was cut off','AskChild.swift','            if !result.delivered, result.written > 0 { self.lock.withLock { self.cutOff = true } }\n','','pipe'),
 ('M63 a delivered request is treated as taken back','AskLink.swift','detail: detail, delivered: !taken)','detail: detail, delivered: false)','cancel'),
 ('M64 an untaken request is said as an unknown outcome','AskLink.swift','        guard delivered else {\n            // The line never reached','        guard delivered || reply == nil else {\n            // The line never reached','held'),
 ('M65 a line delivered whole can still be taken back','AskChild.swift','            guard !delivered else { return false }\n            revoked = true','            guard !delivered || delivered else { return false }\n            revoked = true','cancel'),
 ('M66 ending the child waits for a write that cannot finish','AskChild.swift','                guard !stopped() else { return (false, offset) }\n','','pipe'),
 ('M67 a taken-back request is still interrupted at the connector','AskLink.swift','        guard fenced.delivered else {\n            record(fenced, cancelled: nil, uncertain: false)\n            return\n        }\n','','held'),
 ('M68 the last byte is written without the take-back check','AskChild.swift','            if written == remaining { delivered = true }','            if written == remaining + 1 { delivered = true }','cancel'),
 ('M69 a connector ended for a cut-off request is not explained','AskLink.swift','        takenBack?.wasWrittenInPart == true\n    }','        false\n    }','held'),
 ('M70 the real writer does not mark a line written in several steps as delivered','AskChild.swift','revocation.attempt(remaining: buffer.count - offset, started: offset > 0, step)','revocation.attempt(remaining: buffer.count + 1, started: offset > 0, step)','pipe'),
 ('M71 the last byte is written outside the take-back lock','AskChild.swift','        lock.withLock {\n            guard !revoked else {\n                inPart = inPart || started\n                return nil\n            }\n            let written = write()\n            if written == remaining { delivered = true }\n            return written\n        }','        let taken: Bool = lock.withLock {\n            if revoked { inPart = inPart || started }\n            return revoked\n        }\n        if taken { return nil }\n        let written = write()\n        lock.withLock { if written == remaining { delivered = true } }\n        return written','held'),
 ('M72 a Submit goes out while the app is closing','AskLink.swift','        guard !closed else { return }\n        // Submit starts no connector','        // Submit starts no connector','held'),
 ('M73 what was taken back is kept across connectors','AskLink.swift','        // What was taken back belonged to an earlier connector.\n        takenBack = nil\n','','held'),
]
def run(only):
    env=dict(os.environ, LC_TESTS='ask', LC_ONLY=only)
    # Its own process group, so a test that does not end is stopped with everything it started.
    p=subprocess.Popen(['./run.sh'],cwd=H,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,start_new_session=True)
    try:
        out,_=p.communicate(timeout=200)
    except subprocess.TimeoutExpired:
        os.killpg(p.pid,signal.SIGKILL)
        out,_=p.communicate()
        out='error: THE TEST DID NOT END WITHIN 200 s\n'+(out or '')
    ran=re.search(r'Executed (\d+) tests?, with (\d+) failures?',out)
    return ran, out
sel=sys.argv[1:]
subprocess.run(['./sync.sh'],cwd=H,check=True)
if sel==['BASE']:
    for k,name in T.items():
        ran,out=run(name)
        print(f'BASELINE {name}: ' + (f'executed {ran.group(1)}, failures {ran.group(2)}' if ran else 'DID NOT RUN'), flush=True)
    sys.exit(0)
caught=0; total=0
for label,file,old,new,key in M:
    if sel and not any(label.startswith(x) for x in sel): continue
    total+=1
    subprocess.run(['./sync.sh'],cwd=H,check=True)
    p=f'{H}/src/{file}'; s=open(p).read()
    if s.count(old)!=1:
        print(f'{label}: PATTERN COUNT {s.count(old)} (not applied)', flush=True); continue
    open(p,'w').write(s.replace(old,new))
    ran,out=run(T[key])
    if not ran:
        errs=[l for l in out.splitlines() if 'error:' in l][:2]
        print(f'{label}: DID NOT COMPILE/RUN {errs}', flush=True)
    elif int(ran.group(1))==1 and int(ran.group(2))>0:
        first=[l.split('error: ')[-1][:150] for l in out.splitlines() if 'error:' in l][:1]
        caught+=1
        print(f'{label}: CAUGHT by {T[key]} ({ran.group(2)} failed assertion(s)) e.g. {first}', flush=True)
    else:
        print(f'{label}: SURVIVED in {T[key]} (executed {ran.group(1)}, failures {ran.group(2)})', flush=True)
subprocess.run(['./sync.sh'],cwd=H,check=True)
print(f'CAUGHT {caught} of {total}')
