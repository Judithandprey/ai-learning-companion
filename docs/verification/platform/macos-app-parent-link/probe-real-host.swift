import Foundation
import XCTest
// LINUX-HARNESS-ONLY PROBE (not committed): the actual services.api.desktop_local child, launched by
// the Swift ProcessHostLauncher with the Swift startup record. No database exists at the DSN.
extension DesktopCaptureTests {
    func testProbeRealHost() async throws {
        let repo = URL(fileURLWithPath: "/home/agentsdock/Projects/learning-companion/wt-platform")
        let python = URL(fileURLWithPath: "/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python")
        let dsnFile = root.appending(path: "probe-dsn")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        try Data("host=/nonexistent-lc-probe-socket dbname=lc_probe_none connect_timeout=2\n".utf8).write(to: dsnFile)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: dsnFile.path(percentEncoded: false))
        let config = CaptureHostConfig(python: python, repository: repo, dsnFile: dsnFile, userID: "synthetic-user",
                                       deviceID: "synthetic-mac-device", sessionID: "synthetic-learning-session",
                                       producerID: "synthetic-mac-producer")
        guard case .success(let dsn) = config.readDSN() else { return XCTFail("dsn") }
        for (fresh, previous) in [(true, nil), (false, "stream-earlier")] as [(Bool, String?)] {
            let registration = StreamRegistration(deviceID: config.deviceID, sessionID: config.sessionID,
                                                  streamID: "stream-" + CaptureLink.randomHex(12), previousStreamID: previous)
            let record = try XCTUnwrap(CaptureLink.startupRecord(dsn: dsn, userID: config.userID, producerID: config.producerID, registration: registration,
                                                                  token: CaptureLink.randomHex(32),
                                                                  expires: Date(timeIntervalSinceNow: 3600), fresh: fresh))
            let result = await ProcessHostLauncher(readyTimeout: 30, endGrace: 8).launch(config, record: record)
            guard case .failure(let failure) = result else { return XCTFail("a host without a database was ready") }
            print("PROBE fresh=\(fresh) previous=\(previous ?? "nil") reason=\(failure.reason) code=\(failure.code ?? "nil") delivered=\(failure.delivered)")
            XCTAssertEqual(failure.code, "unavailable")
        }
        // Control: the same record without one key is refused by the real parser.
        let registration = StreamRegistration(deviceID: config.deviceID, sessionID: config.sessionID, streamID: "stream-x",
                                              previousStreamID: nil)
        var record = try XCTUnwrap(CaptureLink.startupRecord(dsn: dsn, userID: config.userID, producerID: config.producerID, registration: registration,
                                                              token: CaptureLink.randomHex(32),
                                                              expires: Date(timeIntervalSinceNow: 3600), fresh: true))
        var object = try decodedObject(Data(record.dropLast()))
        object["enable_raw_ingress"] = nil
        record = try JSONSerialization.data(withJSONObject: object) + Data([0x0A])
        let control = await ProcessHostLauncher(readyTimeout: 30, endGrace: 8).launch(config, record: record)
        guard case .failure(let refused) = control else { return XCTFail("control was ready") }
        print("PROBE control reason=\(refused.reason) code=\(refused.code ?? "nil")")
        XCTAssertEqual(refused.code, "invalid_startup")
    }
}
