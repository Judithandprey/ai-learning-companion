// Executed boundary checks for ScreenObserver's frame retention (FrameStore) and change
// heuristic sampling (LumaGrid). Builds without the app, on any Mac with Xcode (for example the
// hosted macos-26 runner):
//
//   xcrun swiftc -target arm64-apple-macos14 \
//     apps/ios/ScreenObserver/BroadcastUpload/LumaGrid.swift \
//     apps/ios/ScreenObserver/BroadcastUpload/FrameStore.swift \
//     apps/ios/checks/ScreenObserverCheck/main.swift -o screen-observer-check && ./screen-observer-check
//
// It uses real CoreVideo buffers, Core Image PNG encoding and a temporary directory, and exits
// non-zero on any failure. It is not ReplayKit or device evidence.

import CoreImage
import CoreVideo
import Foundation

var failures = 0

func expect(_ condition: Bool, _ name: String) {
    print((condition ? "PASS " : "FAIL ") + name)
    if !condition { failures += 1 }
}

// MARK: - LumaGrid: only checked layouts are read

func makeBuffer(_ format: OSType, width: Int, height: Int) -> CVPixelBuffer? {
    var buffer: CVPixelBuffer?
    let attributes = [kCVPixelBufferIOSurfacePropertiesKey as String: [String: Any]()] as CFDictionary
    guard CVPixelBufferCreate(nil, width, height, format, attributes, &buffer) == kCVReturnSuccess else { return nil }
    return buffer
}

/// Fills plane `plane` (or the packed buffer) so byte `channel` of pixel (x, y) is (x + 3y) % 251.
func fill(_ buffer: CVPixelBuffer, plane: Int?, bytesPerPixel: Int, channel: Int) {
    CVPixelBufferLockBaseAddress(buffer, [])
    defer { CVPixelBufferUnlockBaseAddress(buffer, []) }
    let base = plane.map { CVPixelBufferGetBaseAddressOfPlane(buffer, $0)! } ?? CVPixelBufferGetBaseAddress(buffer)!
    let width = plane.map { CVPixelBufferGetWidthOfPlane(buffer, $0) } ?? CVPixelBufferGetWidth(buffer)
    let height = plane.map { CVPixelBufferGetHeightOfPlane(buffer, $0) } ?? CVPixelBufferGetHeight(buffer)
    let rowBytes = plane.map { CVPixelBufferGetBytesPerRowOfPlane(buffer, $0) } ?? CVPixelBufferGetBytesPerRow(buffer)
    let bytes = base.assumingMemoryBound(to: UInt8.self)
    for y in 0..<height {
        for x in 0..<width {
            bytes[y * rowBytes + x * bytesPerPixel + channel] = UInt8((x + 3 * y) % 251)
        }
    }
}

func expected(width: Int, height: Int, columns: Int, rows: Int) -> [UInt8] {
    (0..<rows).flatMap { row in
        (0..<columns).map { column in
            UInt8(((2 * column + 1) * width / (2 * columns) + 3 * ((2 * row + 1) * height / (2 * rows))) % 251)
        }
    }
}

if let packed16 = makeBuffer(kCVPixelFormatType_422YpCbCr8, width: 16, height: 16) {
    // The reviewer's case: 2-byte packed pixels, rowBytes 32. It must not be read at all.
    expect(LumaGrid.sample(packed16, columns: 256, rows: 192).isEmpty,
           "2-byte packed 16x16 ('2vuy') gives an empty grid, with no out-of-bounds read")
} else {
    print("SKIP '2vuy' buffer could not be created here")
}
if let tenBit = makeBuffer(kCVPixelFormatType_420YpCbCr10BiPlanarVideoRange, width: 64, height: 48) {
    expect(LumaGrid.sample(tenBit).isEmpty, "10-bit bi-planar ('x420') gives an empty grid")
} else {
    print("SKIP 'x420' buffer could not be created here")
}
if let yuv = makeBuffer(kCVPixelFormatType_420YpCbCr8BiPlanarFullRange, width: 64, height: 48) {
    fill(yuv, plane: 0, bytesPerPixel: 1, channel: 0)
    expect(LumaGrid.sample(yuv, columns: 16, rows: 12) == expected(width: 64, height: 48, columns: 16, rows: 12),
           "8-bit 4:2:0 ('420f') samples luma plane 0 at the expected points")
    expect(LumaGrid.sample(yuv, columns: 256, rows: 192).count == 256 * 192,
           "a grid larger than the image still stays inside the plane")
} else {
    print("FAIL '420f' buffer could not be created")
    failures += 1
}
if let bgra = makeBuffer(kCVPixelFormatType_32BGRA, width: 64, height: 48) {
    fill(bgra, plane: nil, bytesPerPixel: 4, channel: 1)
    expect(LumaGrid.sample(bgra, columns: 16, rows: 12) == expected(width: 64, height: 48, columns: 16, rows: 12),
           "32-bit BGRA samples the green byte at the expected points")
} else {
    print("FAIL 'BGRA' buffer could not be created")
    failures += 1
}
if let tiny = makeBuffer(kCVPixelFormatType_32BGRA, width: 1, height: 1) {
    expect(LumaGrid.sample(tiny, columns: 4, rows: 4).count == 16, "a 1x1 buffer samples only its one pixel")
}
expect(LumaGrid.differ([], [1], threshold: 24) && LumaGrid.differ([1], [], threshold: 24),
       "an empty grid always counts as different, so it can never justify a skip")
expect(!LumaGrid.differ([10, 20], [30, 40], threshold: 24) && LumaGrid.differ([10], [35], threshold: 24),
       "the threshold separates equal-by-heuristic from changed")

// MARK: - FrameStore: bounds hold for what is on disk

let fileManager = FileManager.default
let root = fileManager.temporaryDirectory.appending(path: "screen-observer-check-\(UUID().uuidString)",
                                                    directoryHint: .isDirectory)
func freshDirectory(_ name: String) -> URL {
    let url = root.appending(path: name, directoryHint: .isDirectory)
    try? fileManager.createDirectory(at: url, withIntermediateDirectories: true)
    return url
}
func files(_ url: URL) -> [String] {
    ((try? fileManager.contentsOfDirectory(atPath: url.path(percentEncoded: false))) ?? []).sorted()
}
let image = CIImage(color: CIColor(red: 0.2, green: 0.4, blue: 0.6)).cropped(to: CGRect(x: 0, y: 0, width: 32, height: 24))

let okDirectory = freshDirectory("ok")
let store = FrameStore(directory: okDirectory, byteCap: 10_000_000)
if case .kept(let name, let byteLength, let sha256) = store.keep(image, name: "00000001.png") {
    let digest = try? FrameStore.digest(of: okDirectory.appending(path: name))
    expect(files(okDirectory) == ["00000001.png"], "a kept frame is published under its final name, with no staging file left")
    expect(digest?.byteLength == byteLength && digest?.sha256 == sha256 && store.bytesKept == byteLength,
           "the recorded size and hash are those of the published file, and are counted")
} else {
    expect(false, "a frame that fits is kept")
}

let firstSize = store.bytesKept
let tightDirectory = freshDirectory("tight")
let tight = FrameStore(directory: tightDirectory, byteCap: max(firstSize - 1, 0))
if case .notKept(let reason, _) = tight.keep(image, name: "00000001.png") {
    expect(reason == "over_budget" && files(tightDirectory).isEmpty && tight.bytesKept == 0,
           "a frame one byte over the remaining budget is not kept, and its candidate is removed")
} else {
    expect(false, "a frame over the budget is not kept")
}
let exactDirectory = freshDirectory("exact")
let exact = FrameStore(directory: exactDirectory, byteCap: firstSize)
if case .kept = exact.keep(image, name: "00000001.png") {
    expect(exact.bytesKept == firstSize && exact.bytesKept <= exact.byteCap, "a frame that exactly fits is kept")
} else {
    expect(false, "a frame that exactly fits is kept")
}
if case .notKept(let reason, _) = exact.keep(image, name: "00000002.png") {
    expect(reason == "over_budget" && files(exactDirectory) == ["00000001.png"] && exact.bytesKept <= exact.byteCap,
           "once full, a further frame is refused and the kept original is untouched")
} else {
    expect(false, "a full store refuses further frames")
}

let existingDirectory = freshDirectory("existing")
let original = Data("kept original".utf8)
try original.write(to: existingDirectory.appending(path: "00000001.png"))
let existing = FrameStore(directory: existingDirectory, byteCap: 10_000_000)
if case .notKept(let reason, _) = existing.keep(image, name: "00000001.png") {
    let bytes = try? Data(contentsOf: existingDirectory.appending(path: "00000001.png"))
    expect(reason == "write_failed" && bytes == original && files(existingDirectory) == ["00000001.png"]
           && existing.bytesKept == 0,
           "a kept original is never overwritten, and the new candidate is removed")
} else {
    expect(false, "publishing onto an existing file fails")
}

let missingDirectory = root.appending(path: "missing", directoryHint: .isDirectory)
let missing = FrameStore(directory: missingDirectory, byteCap: 10_000_000)
if case .notKept(let reason, _) = missing.keep(image, name: "00000001.png") {
    expect(reason == "write_failed" && missing.stoppedReason == nil && !fileManager.fileExists(atPath: missingDirectory.path(percentEncoded: false)),
           "an encode failure leaves no file and does not stop the store")
} else {
    expect(false, "encoding into a missing directory fails")
}

try? fileManager.removeItem(at: root)
if failures > 0 {
    print("\(failures) screen observer check(s) failed")
    exit(1)
}
print("all screen observer checks passed")
