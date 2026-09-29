// swift-tools-version: 5.9

// Swift Playgrounds app project. Swift Playgrounds may rewrite this file when
// app settings are changed on the iPad; keep edits minimal.

import PackageDescription
import AppleProductTypes

let package = Package(
    name: "CompanionInk",
    platforms: [
        .iOS("17.0")
    ],
    products: [
        .iOSApplication(
            name: "CompanionInk",
            targets: ["AppModule"],
            bundleIdentifier: "org.example.learningcompanion.ink",
            displayVersion: "0.1",
            bundleVersion: "1",
            supportedDeviceFamilies: [
                .pad,
                .phone
            ],
            supportedInterfaceOrientations: [
                .portrait,
                .landscapeRight,
                .landscapeLeft,
                .portraitUpsideDown(.when(deviceFamilies: [.pad]))
            ]
        )
    ],
    targets: [
        .executableTarget(
            name: "AppModule",
            path: "."
        )
    ]
)
