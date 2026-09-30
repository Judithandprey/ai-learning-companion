// swift-tools-version: 5.7
import PackageDescription
import AppleProductTypes

let package = Package(
    name: "GlassPlaygroundR3",
    platforms: [.iOS("16.0")],
    products: [
        .iOSApplication(
            name: "GlassPlayground R3",
            targets: ["AppModule"],
            bundleIdentifier: "local.learningcompanion.GlassPlaygroundR3",
            displayVersion: "1.2",
            bundleVersion: "3",
            appIcon: .placeholder(icon: .pencil),
            accentColor: .presetColor(.blue),
            supportedDeviceFamilies: [.pad],
            supportedInterfaceOrientations: [
                .portrait, .landscapeLeft, .landscapeRight,
                .portraitUpsideDown(.when(deviceFamilies: [.pad]))
            ]
        )
    ],
    targets: [.executableTarget(name: "AppModule", path: "Sources")],
    swiftLanguageVersions: [.v5]
)
