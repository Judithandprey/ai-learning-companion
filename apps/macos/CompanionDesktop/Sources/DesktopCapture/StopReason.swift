import Foundation
import ScreenCaptureKit

/// Why a stream stopped or could not start: a stable kind, plus the error's own domain, code and
/// message, unchanged.
public struct StopReason: Codable, Equatable, Sendable {
    public var kind: String
    public var domain: String
    public var code: Int
    public var message: String

    private static let kinds: [SCStreamError.Code: String] = [
        .userDeclined: "permission_declined",
        .missingEntitlements: "missing_entitlements",
        .failedToStart: "failed_to_start",
        .noDisplayList: "no_display_list",
        .noCaptureSource: "capture_source_unavailable",
        .userStopped: "stopped_in_system_ui",
        .systemStoppedStream: "stopped_by_system",
    ]

    public init(_ error: Error) {
        let error = error as NSError
        domain = error.domain
        code = error.code
        message = error.localizedDescription
        if error.domain == SCStreamErrorDomain {
            kind = SCStreamError.Code(rawValue: error.code).flatMap { Self.kinds[$0] } ?? "stream_error"
        } else {
            kind = "error"
        }
    }

    public var summary: String { "\(kind) (\(domain) \(code)): \(message)" }
}
