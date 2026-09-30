import Foundation
import XCTest
// LINUX-HARNESS-ONLY PROBE (not committed): CaptureLink with the actual desktop_local child and real
// released handlers over MemoryStore, on Linux URLSession. Not PostgreSQL, not a Mac.
extension DesktopCaptureTests {
    func testProbeMemoryHost() async throws {
        let repo = URL(fileURLWithPath: "/home/agentsdock/Projects/learning-companion/wt-platform")
        let dsnFile = root.appending(path: "probe-dsn")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        try Data("memory-store-probe-unused\n".utf8).write(to: dsnFile)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: dsnFile.path(percentEncoded: false))
        let config = CaptureHostConfig(python: URL(fileURLWithPath: "/tmp/lc-link-run/memhost/python"), repository: repo,
                                       dsnFile: dsnFile, userID: "synthetic-user", deviceID: "synthetic-mac-device",
                                       sessionID: "synthetic-learning-session", producerID: "synthetic-mac-producer")
        let session = try writeMacSession(root: root.appending(path: "probe-session", directoryHint: .isDirectory))
        let directory = root.appending(path: "probe-link", directoryHint: .isDirectory)
        let link = CaptureLink(config: .success(config), directory: directory,
                               launcher: ProcessHostLauncher(readyTimeout: 30, endGrace: 8), stopWait: 5)
        let gate = LiveGate()
        await link.begin(gate: gate, session: session) { print("PROBE endCapture \($0)") }
        let stored = await until(60) { let s = await link.currentStatus(); return s.stored == 7 || s.state == .notConnected || s.state == .endedByService }
        let during = await link.currentStatus()
        print("PROBE during state=\(during.state) stored=\(during.stored) unknown=\(during.unknown) refused=\(during.refused) notSent=\(during.notSent) detail=\(during.detail ?? "nil")")
        XCTAssertTrue(stored)
        gate.close("user_stop")
        await link.stop()
        let final = await link.currentStatus()
        print("PROBE final state=\(final.state) stored=\(final.stored) unknown=\(final.unknown) refused=\(final.refused) notSent=\(final.notSent) detail=\(final.detail ?? "nil")")
        let journal = try String(contentsOf: directory.appending(path: "journal.json"), encoding: .utf8)
        print("PROBE journal \(journal.prefix(3000))")
        XCTAssertEqual(final.state, .stopped)
        XCTAssertEqual(final.stored, 7)
        XCTAssertEqual(final.detail, "the stream is stopped")
    }
}
