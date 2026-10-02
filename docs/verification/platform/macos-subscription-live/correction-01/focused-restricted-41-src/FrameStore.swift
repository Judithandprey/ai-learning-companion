import Foundation
import FoundationNetworking
import Glibc
import Foundation

/// Writes kept keyframes so that the declared bounds hold for what is on disk.
///
/// - Each candidate is encoded to a new, uniquely named staging file in the frames directory,
///   then measured and hashed from disk.
/// - It is published as a kept original, by renaming it to its final name, only if its whole
///   size fits the remaining byte budget. Kept bytes therefore never exceed `byteCap`.
/// - A candidate that fails, or does not fit, is removed. Only that new, unpublished candidate is
///   ever removed. The rename never replaces an existing file, so a kept original is never
///   overwritten or deleted.
/// - If a failed candidate cannot be removed, the store stops (`stoppedReason`) and attempts
///   nothing more. At most one unpublished candidate, of at most one frame's size, is ever left
///   on disk.
///
/// Encoding: lossless PNG, 8-bit RGBA, sRGB, at the image's own size.
///
/// Foundation/CoreImage/CryptoKit only, so it can also be checked on a Mac
/// (apps/ios/checks/ScreenObserverCheck).
final class FrameStore {
    enum Outcome {
        case kept(file: String, byteLength: Int, sha256: String)
        case notKept(reason: String, detail: String)
    }

    static let encoding = "png; 8-bit RGBA; sRGB; lossless; native size; not rotated"

    let directory: URL
    let byteCap: Int
    private(set) var bytesKept = 0
    /// Set when a failed candidate could not be removed; no further frames are attempted.
    private(set) var stoppedReason: String?
    private let context = CIContext(options: [.cacheIntermediates: false])

    init(directory: URL, byteCap: Int) {
        self.directory = directory
        self.byteCap = byteCap
    }

    /// `name` is the final file name inside the frames directory, unique per frame.
    func keep(_ image: CIImage, name: String) -> Outcome {
        if let stoppedReason {
            return .notKept(reason: "stopped", detail: stoppedReason)
        }
        let staging = directory.appending(path: ".staging-\(UUID().uuidString).png")
        let destination = directory.appending(path: name)
        do {
            try context.writePNGRepresentation(of: image, to: staging, format: .RGBA8,
                                               colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!)
            let written = try Self.digest(of: staging)
            guard written.byteLength <= byteCap - bytesKept else {
                return discard(staging, reason: "over_budget",
                               detail: "candidate of \(written.byteLength) bytes; \(byteCap - bytesKept) bytes of the budget remain")
            }
            // moveItem fails if the destination exists, so nothing kept is replaced.
            try FileManager.default.moveItem(at: staging, to: destination)
            bytesKept += written.byteLength
            return .kept(file: name, byteLength: written.byteLength, sha256: written.sha256)
        } catch {
            return discard(staging, reason: "write_failed", detail: error.localizedDescription)
        }
    }

    /// Removes the unpublished candidate, if one was written. If that fails, the store stops.
    private func discard(_ staging: URL, reason: String, detail: String) -> Outcome {
        guard FileManager.default.fileExists(atPath: staging.path(percentEncoded: false)) else {
            return .notKept(reason: reason, detail: detail)
        }
        do {
            try FileManager.default.removeItem(at: staging)
        } catch {
            stoppedReason = "the unpublished candidate \(staging.lastPathComponent) could not be removed "
                + "(\(error.localizedDescription)); no further frames are attempted"
            return .notKept(reason: reason, detail: detail + "; " + stoppedReason!)
        }
        return .notKept(reason: reason, detail: detail)
    }

    /// Size and SHA-256 of a written file, read in 1 MB chunks so a second full copy of a frame
    /// is never held in memory.
    static func digest(of url: URL) throws -> (byteLength: Int, sha256: String) {
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        var hasher = SHA256()
        var length = 0
        while let chunk = try handle.read(upToCount: 1 << 20), !chunk.isEmpty {
            hasher.update(data: chunk)
            length += chunk.count
        }
        guard length > 0 else { throw CocoaError(.fileReadCorruptFile) }
        return (length, hasher.finalize().map { String(format: "%02x", $0) }.joined())
    }
}
