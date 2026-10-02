import Foundation
import FoundationNetworking
import Glibc
import Foundation

/// The actual selected pixels of an ASK region: a crop of the exact retained original, written
/// as its own PNG. It is a frozen region of that frame, not a live observation, and the frame's
/// pixels may or may not contain this app's ink or controls.
public struct SelectionCrop: Codable, Equatable, Sendable {
    /// Relative to the ink document's directory.
    public var file: String
    public var sha256: String
    public var byteLength: Int
    public var mediaType: String
    /// The whole-pixel rectangle actually cropped: the region rounded outward and clamped to the
    /// frame, in the frame's pixels (origin top-left).
    public var pixelRect: RecordedRect
    public var width: Int
    public var height: Int
    /// How the pixels were obtained.
    public var source: String
}

public enum SelectionCropper {
    /// Crops `pixelRect` from the retained original of `frame` in `captureSession`, and writes it
    /// as a new PNG in `<inkDirectory>/selections/`.
    /// - The original is re-read under the retained-file policy (`RetainedOriginal`) and must still
    ///   match its recorded SHA-256 and length.
    /// - The original is only read. The crop gets a new, unique file name, so nothing existing is
    ///   replaced.
    public static func crop(_ frame: FrameReference, pixelRect: RecordedRect, captureSession: URL,
                            inkDirectory: URL, name: String) -> Result<SelectionCrop, MappingRefusal> {
        let data: Data
        switch RetainedOriginal.read(file: frame.file, sequence: frame.sequence, sha256: frame.sha256,
                                     byteLength: frame.byteLength, in: captureSession) {
        case .success(let bytes): data = bytes
        case .failure(let refusal): return .failure(refusal)
        }
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
            return .failure(MappingRefusal("\(frame.file) cannot be decoded as an image"))
        }
        guard image.width == frame.width, image.height == frame.height else {
            return .failure(MappingRefusal("\(frame.file) is \(image.width)×\(image.height), not the recorded \(frame.width)×\(frame.height)"))
        }
        guard [pixelRect.x, pixelRect.y, pixelRect.width, pixelRect.height].allSatisfy(\.isFinite) else {
            return .failure(MappingRefusal("the region is not a finite rectangle"))
        }
        // Clamped to the frame before converting, so no value can overflow Int.
        func clamp(_ value: Double, _ limit: Int) -> Double { min(max(value, 0), Double(limit)) }
        let minX = Int(clamp(pixelRect.x, image.width).rounded(.down))
        let minY = Int(clamp(pixelRect.y, image.height).rounded(.down))
        let maxX = Int(clamp(pixelRect.x + pixelRect.width, image.width).rounded(.up))
        let maxY = Int(clamp(pixelRect.y + pixelRect.height, image.height).rounded(.up))
        guard maxX > minX, maxY > minY else {
            return .failure(MappingRefusal("the region lies outside the frame"))
        }
        let integral = CGRect(x: minX, y: minY, width: maxX - minX, height: maxY - minY)
        guard let cropped = image.cropping(to: integral) else {
            return .failure(MappingRefusal("the region could not be cropped from \(frame.file)"))
        }
        let directory = inkDirectory.appending(path: "selections", directoryHint: .isDirectory)
        let fileName = "\(name)-\(UUID().uuidString.prefix(8)).png"
        let url = directory.appending(path: fileName)
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        } catch {
            return .failure(MappingRefusal("the selections directory cannot be created: \(error.localizedDescription)"))
        }
        guard let destination = CGImageDestinationCreateWithURL(url as CFURL, "public.png" as CFString, 1, nil) else {
            return .failure(MappingRefusal("a PNG crop cannot be created"))
        }
        CGImageDestinationAddImage(destination, cropped, nil)
        guard CGImageDestinationFinalize(destination) else {
            return .failure(MappingRefusal("the PNG crop could not be written"))
        }
        do {
            let written = try FrameStore.digest(of: url)
            return .success(SelectionCrop(
                file: "selections/" + fileName, sha256: written.sha256, byteLength: written.byteLength,
                mediaType: "image/png", pixelRect: RecordedRect(integral), width: cropped.width, height: cropped.height,
                source: "the exact retained original \(frame.file) (SHA-256 \(frame.sha256), re-checked), decoded and cropped without scaling or rotation, then written losslessly as PNG"))
        } catch {
            return .failure(MappingRefusal("the PNG crop cannot be read back: \(error.localizedDescription)"))
        }
    }
}
