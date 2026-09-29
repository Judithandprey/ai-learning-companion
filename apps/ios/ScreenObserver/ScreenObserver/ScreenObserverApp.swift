import ReplayKit
import SwiftUI

@main
struct ScreenObserverApp: App {
    var body: some Scene {
        WindowGroup {
            StatusView()
        }
    }
}

/// The system broadcast picker, limited to this app's broadcast upload extension and without
/// the microphone button: this slice captures screen frames only.
struct BroadcastPicker: UIViewRepresentable {
    func makeUIView(context: Context) -> RPSystemBroadcastPickerView {
        let picker = RPSystemBroadcastPickerView(frame: CGRect(x: 0, y: 0, width: 60, height: 60))
        picker.preferredExtension = embeddedExtensionIdentifier
        picker.showsMicrophoneButton = false
        return picker
    }

    func updateUIView(_ picker: RPSystemBroadcastPickerView, context: Context) {}

    /// Bundle identifier of the broadcast upload extension embedded in this app, read from the
    /// built app rather than assumed.
    private var embeddedExtensionIdentifier: String? {
        guard let plugIns = Bundle.main.builtInPlugInsURL,
              let contents = try? FileManager.default.contentsOfDirectory(at: plugIns, includingPropertiesForKeys: nil),
              let appex = contents.first(where: { $0.pathExtension == "appex" }) else { return nil }
        return Bundle(url: appex)?.bundleIdentifier
    }
}
