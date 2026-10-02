// LINUX-HARNESS-ONLY stand-ins for the few AppKit/SwiftUI names LiveController's class uses, so its
// non-view part can be type-checked against the DesktopCapture module's PUBLIC interface.
@_exported import Foundation
@propertyWrapper public struct Published<Value> {
    public var wrappedValue: Value
    public init(wrappedValue: Value) { self.wrappedValue = wrappedValue }
}
public protocol ObservableObject: AnyObject {}
public protocol View {}
extension View { public func environmentObject<T: ObservableObject>(_ object: T) -> some View { self } }
@MainActor open class NSView {}
@MainActor public final class NSHostingView<Content: View>: NSView { public init(rootView: Content) {} }
@MainActor open class NSWindow {
    public struct StyleMask: OptionSet, Sendable { public let rawValue: Int; public init(rawValue: Int) { self.rawValue = rawValue }
        public static let titled = StyleMask(rawValue: 1), utilityWindow = StyleMask(rawValue: 2), resizable = StyleMask(rawValue: 4), nonactivatingPanel = StyleMask(rawValue: 8) }
    public struct CollectionBehavior: OptionSet, Sendable { public let rawValue: Int; public init(rawValue: Int) { self.rawValue = rawValue }
        public static let canJoinAllSpaces = CollectionBehavior(rawValue: 1), fullScreenAuxiliary = CollectionBehavior(rawValue: 2), ignoresCycle = CollectionBehavior(rawValue: 4) }
    public struct Level: Sendable { public let rawValue: Int; public init(rawValue: Int) { self.rawValue = rawValue }; public static let floating = Level(rawValue: 3) }
    public enum SharingType: Sendable { case none }
    public enum BackingStoreType: Sendable { case buffered }
    public init(contentRect: NSRect, styleMask: StyleMask, backing: BackingStoreType, defer flag: Bool) {}
    public var title = ""; public var collectionBehavior: CollectionBehavior = []; public var level = Level.floating
    public var sharingType = SharingType.none; public var isReleasedWhenClosed = false; public var hidesOnDeactivate = false
    public var contentView: NSView?; public var isVisible: Bool { true }
    public func orderOut(_ sender: Any?) {}; public func orderFrontRegardless() {}
}
@MainActor public final class NSPanel: NSWindow { public var becomesKeyOnlyIfNeeded = false; public var isFloatingPanel = false }
@MainActor public final class NSScreen { public static var main: NSScreen? { nil }; public var visibleFrame: NSRect { .zero } }
public final class NSWorkspace: @unchecked Sendable { public static let shared = NSWorkspace(); @discardableResult public func open(_ url: URL) -> Bool { true } }
