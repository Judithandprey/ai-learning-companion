import Foundation
import Glibc
import XCTest
extension DesktopCaptureTests {
    func testReviewRealChildQuitJoinsPartialCancelCleanup() async throws {
        let dir = root.appending(path: "review-real-partial-quit", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let script = dir.appending(path: "stub.py")
        let release = dir.appending(path: "release")
        let pidFile = dir.appending(path: "pid")
        let bytesFile = dir.appending(path: "bytes")
        try Data("""
        import sys, json, os, time, signal
        from pathlib import Path
        root = Path(__file__).parent
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        (root/'pid').write_text(str(os.getpid()))
        request = json.loads(sys.stdin.buffer.readline())
        print(json.dumps({'id':request['id'],'result':{'auth':{'state':'signed_in','mode':'chatgpt','plan':None},'rate_limits':None,'models':[{'id':'synthetic-vision','label':'Synthetic vision','image_input':True,'default':True}]}}),flush=True)
        deadline = time.monotonic() + 12
        while not (root/'release').exists():
            if time.monotonic() > deadline: sys.exit(0)
            time.sleep(.01)
        raw = sys.stdin.buffer.readline()
        (root/'bytes').write_text(str(len(raw)) + ':' + str(raw.endswith(b'\\n')))
        print(json.dumps({'id':None,'error':{'code':'invalid_request','message':'synthetic partial-line refusal'}}),flush=True)
        time.sleep(6)
        """.utf8).write(to: script)
        let wrapper = dir.appending(path: "python-stub")
        try Data("#!/bin/sh\nexec /usr/bin/python3 '\(script.path(percentEncoded: false))'\n".utf8).write(to: wrapper)
        try FileManager.default.setAttributes([.posixPermissions:0o755], ofItemAtPath: wrapper.path(percentEncoded: false))
        let config = AskConnectorConfig(python: wrapper, repository: dir)
        let link = AskLink(config: .success(config), launcher: ProcessAskLauncher(sendTimeout: 20, endGrace: 0.2), callTimeout: 3, askTimeout: 3)
        await link.connect()
        let fixture = try askFixture("review-real-partial-quit", large: true)
        await link.open(fixture.input)
        let asking = Task { await link.submit(question:"Why?", assistance:.hint) }
        let sending = await until(5) { await link.currentStatus().card?.phase == .sending }
        XCTAssertTrue(sending)
        try await Task.sleep(nanoseconds:300_000_000)
        await link.cancelCard()
        try Data().write(to: release)
        let disconnected = await until(5) { await link.currentStatus().connection == .disconnected }
        XCTAssertTrue(disconnected)
        let pid = try XCTUnwrap(Int32(String(contentsOf: pidFile, encoding:.utf8)))
        let began = Date()
        await link.shutdown()
        let stillAlive = kill(pid, 0) == 0
        print("REVIEW real partial-cancel Quit returned in \(Date().timeIntervalSince(began))s; child alive=\(stillAlive); partial bytes=\((try? String(contentsOf: bytesFile, encoding:.utf8)) ?? "missing")")
        await asking.value
        let ended = await until(10) { kill(pid, 0) != 0 }
        print("REVIEW host-kept-alive cleanup completed=\(ended) after \(Date().timeIntervalSince(began))s")
        XCTAssertTrue(ended, "owned child must be cleaned before probe returns")
        XCTAssertFalse(stillAlive, "Quit returned while its owned real connector remained alive; app termination loses its pending escalation")
    }
}
