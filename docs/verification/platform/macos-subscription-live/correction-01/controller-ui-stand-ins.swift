import Foundation

// Linux replay only. This substitutes native publication/window names, not controller logic.
@MainActor enum ControllerUITrace {
    static var scenario = "unset"
    static var publications: [LiveStatus] = []
    static var panelsVisible = true
    static func reset(_ name: String) {
        scenario = name
        publications = []
        panelsVisible = true
    }
    static func record(_ status: LiveStatus) {
        publications.append(status)
        let event: [String: Any] = ["event": "published", "scenario": scenario,
            "answer": status.card?.answer ?? NSNull(), "request": status.card?.requestID ?? NSNull(),
            "phase": status.card?.phase.rawValue ?? NSNull(), "session": String(describing: status.session.state),
            "panel_visibility_control": panelsVisible]
        if let data = try? JSONSerialization.data(withJSONObject: event, options: [.sortedKeys]),
           let line = String(data: data, encoding: .utf8) { print("CONTROLLER_TRACE " + line) }
    }
    static var answers: [String] { publications.compactMap { $0.card?.answer } }
}

@MainActor @propertyWrapper struct Published<Value> {
    private var value: Value
    init(wrappedValue: Value) { value = wrappedValue }
    var wrappedValue: Value {
        get { value }
        set {
            if let status = newValue as? LiveStatus { ControllerUITrace.record(status) }
            value = newValue
        }
    }
}
protocol ObservableObject: AnyObject {}
protocol View {}
extension View { func environmentObject<T: ObservableObject>(_ object: T) -> some View { self } }
@MainActor class NSView {}
@MainActor final class NSHostingView<Content: View>: NSView { init(rootView: Content) {} }
@MainActor class NSWindow {
    struct StyleMask: OptionSet, Sendable {
        let rawValue: Int
        static let titled = StyleMask(rawValue: 1), utilityWindow = StyleMask(rawValue: 2),
            resizable = StyleMask(rawValue: 4), nonactivatingPanel = StyleMask(rawValue: 8)
    }
    struct CollectionBehavior: OptionSet, Sendable {
        let rawValue: Int
        static let canJoinAllSpaces = CollectionBehavior(rawValue: 1),
            fullScreenAuxiliary = CollectionBehavior(rawValue: 2), ignoresCycle = CollectionBehavior(rawValue: 4)
    }
    struct Level: Sendable { let rawValue: Int; static let floating = Level(rawValue: 3) }
    enum SharingType: Sendable { case none }
    enum BackingStoreType: Sendable { case buffered }
    init(contentRect: NSRect, styleMask: StyleMask, backing: BackingStoreType, defer flag: Bool) {}
    var title = ""
    var collectionBehavior: CollectionBehavior = []
    var level = Level.floating
    var sharingType = SharingType.none
    var isReleasedWhenClosed = false
    var hidesOnDeactivate = false
    var contentView: NSView?
    private var orderedFront = false
    var isVisible: Bool { orderedFront && ControllerUITrace.panelsVisible }
    func orderOut(_ sender: Any?) { orderedFront = false }
    func orderFrontRegardless() { orderedFront = true }
}
@MainActor final class NSPanel: NSWindow {
    var becomesKeyOnlyIfNeeded = false
    var isFloatingPanel = false
}
@MainActor final class NSScreen {
    static var main: NSScreen? { nil }
    var visibleFrame: NSRect { .zero }
}
final class NSWorkspace: @unchecked Sendable {
    static let shared = NSWorkspace()
    @discardableResult func open(_ url: URL) -> Bool { true }
}
