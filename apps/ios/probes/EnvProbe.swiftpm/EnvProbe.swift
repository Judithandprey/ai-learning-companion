import AVFAudio
import SwiftUI
import UIKit

// Read-only environment probe for DT-ENV-01 and the first, read-only step of
// DT-G3-05 variant 2 (availableModes before any setCategory). It never sets a
// category or mode, never activates the audio session, never records and never
// asks for microphone permission; it only reads and shows state as JSON.

@main
struct EnvProbeApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}

struct ContentView: View {
    @State private var json = ""

    var body: some View {
        NavigationStack {
            ScrollView {
                Text(json)
                    .font(.system(.footnote, design: .monospaced))
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding()
            }
            .navigationTitle("EnvProbe 0.1")
            .toolbar {
                Button("Refresh") { json = Snapshot.captureJSON() }
                ShareLink(item: json)
            }
            .onAppear { json = Snapshot.captureJSON() }
        }
    }
}

struct Snapshot: Encodable {
    struct Port: Encodable {
        let type: String
        let name: String
        let uid: String
        let channels: [String]
    }

    struct Audio: Encodable {
        let category: String
        let mode: String
        let availableModes: [String]
        let recordPermission: String
        let currentInputs: [Port]
        let currentOutputs: [Port]
        let availableInputs: [Port]
    }

    let probe = "EnvProbe 0.1 (read-only)"
    let capturedAt: String
    let machine: String
    let systemName: String
    let systemVersion: String
    let model: String
    let idiom: String
    let audio: Audio

    @MainActor
    static func captureJSON() -> String {
        let session = AVAudioSession.sharedInstance()
        let device = UIDevice.current
        let snapshot = Snapshot(
            capturedAt: ISO8601DateFormatter().string(from: Date()),
            machine: machineName(),
            systemName: device.systemName,
            systemVersion: device.systemVersion,
            model: device.model,
            idiom: idiomName(device.userInterfaceIdiom),
            audio: Audio(
                category: session.category.rawValue,
                mode: session.mode.rawValue,
                availableModes: session.availableModes.map(\.rawValue),
                recordPermission: recordPermissionName(),
                currentInputs: ports(session.currentRoute.inputs),
                currentOutputs: ports(session.currentRoute.outputs),
                availableInputs: ports(session.availableInputs ?? [])
            )
        )
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        guard let data = try? encoder.encode(snapshot) else { return "{\"error\": \"encoding failed\"}" }
        return String(decoding: data, as: UTF8.self)
    }

    private static func ports(_ list: [AVAudioSessionPortDescription]) -> [Port] {
        list.map { port in
            Port(
                type: port.portType.rawValue,
                name: port.portName,
                uid: port.uid,
                channels: (port.channels ?? []).map { "\($0.channelNumber): \($0.channelName)" }
            )
        }
    }

    // Reads the current status only; requesting permission would show a prompt.
    private static func recordPermissionName() -> String {
        switch AVAudioApplication.shared.recordPermission {
        case .granted: return "granted"
        case .denied: return "denied"
        case .undetermined: return "undetermined"
        @unknown default: return "unknown"
        }
    }

    private static func idiomName(_ idiom: UIUserInterfaceIdiom) -> String {
        switch idiom {
        case .pad: return "pad"
        case .phone: return "phone"
        default: return "other(\(idiom.rawValue))"
        }
    }

    private static func machineName() -> String {
        var info = utsname()
        uname(&info)
        return withUnsafeBytes(of: &info.machine) { raw in
            String(decoding: raw.prefix(while: { $0 != 0 }), as: UTF8.self)
        }
    }
}
