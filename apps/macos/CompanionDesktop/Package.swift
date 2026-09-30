// swift-tools-version: 6.0
import PackageDescription

// Companion Desktop for macOS: the first capture-only slice (not AI connected).
// macOS 15 is an engineering floor for ScreenCaptureKit's current API, not selected user hardware.
let package = Package(
    name: "CompanionDesktop",
    platforms: [.macOS(.v15)],
    products: [
        .executable(name: "CompanionDesktop", targets: ["CompanionDesktop"]),
    ],
    targets: [
        // Local capture storage, frame facts, gaps and freshness; no UI, testable without a display.
        .target(name: "DesktopCapture"),
        // The SwiftUI/AppKit app: display choice, permission, Start/Stop and ScreenCaptureKit.
        .executableTarget(name: "CompanionDesktop", dependencies: ["DesktopCapture"]),
        .testTarget(name: "DesktopCaptureTests", dependencies: ["DesktopCapture"]),
    ],
    swiftLanguageModes: [.v5]
)
