// swift-tools-version: 5.7
import PackageDescription
import AppleProductTypes

let package = Package(
    name: "GlassPlayground",
    platforms: [.iOS("16.0")],
    products: [
        .iOSApplication(
            name: "GlassPlayground",
            targets: ["AppModule"],
            bundleIdentifier: "local.learningcompanion.GlassPlayground",
            displayVersion: "1.1",
            bundleVersion: "2",
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
