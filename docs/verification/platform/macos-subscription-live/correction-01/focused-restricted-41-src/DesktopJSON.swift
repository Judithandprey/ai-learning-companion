import Foundation
import FoundationNetworking
import Glibc
import Foundation

/// A JSON value tree with explicit nulls, and integers kept apart from doubles, so each contract
/// field is encoded as the kind it requires. Encoding is Foundation's own.
public indirect enum JSONValue: Equatable, Sendable, Encodable {
    case object([String: JSONValue])
    case array([JSONValue])
    case string(String)
    case integer(Int)
    case number(Double)
    case bool(Bool)
    case null

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .object(let members): try container.encode(members)
        case .array(let items): try container.encode(items)
        case .string(let string): try container.encode(string)
        case .integer(let number): try container.encode(number)
        case .number(let number): try container.encode(number)
        case .bool(let flag): try container.encode(flag)
        case .null: try container.encodeNil()
        }
    }
}

/// Request bodies as standard Foundation JSON: sorted keys, unescaped slashes, finite numbers only.
/// The bytes are kept as produced, for exact retries. The service compares requests after strict
/// decoding, not by byte equality with another language's output.
public enum DesktopJSON {
    public enum Problem: Error, Equatable {
        /// JSONEncoder refused the value: a non-finite number.
        case notEncodable(String)
        /// The encoded text holds an integer token outside the JavaScript safe range, which a
        /// strict reader rejects. For example, a large integral Double written without a fraction.
        case unsafeInteger(String)
    }

    public static func encode(_ value: JSONValue) throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        let data: Data
        do {
            data = try encoder.encode(value)
        } catch {
            throw Problem.notEncodable(String(describing: error))
        }
        if let token = unsafeIntegerToken(in: data) {
            throw Problem.unsafeInteger(token)
        }
        return data
    }

    /// The first number token without a fraction or exponent whose magnitude exceeds 2^53 − 1.
    static func unsafeIntegerToken(in data: Data) -> String? {
        var inString = false
        var escaped = false
        var token: [UInt8] = []

        func finish() -> String? {
            defer { token.removeAll() }
            guard let first = token.first, first == UInt8(ascii: "-") || (0x30...0x39).contains(first),
                  !token.contains(where: { [UInt8(ascii: "."), UInt8(ascii: "e"), UInt8(ascii: "E")].contains($0) }) else {
                return nil
            }
            let digits = token.drop { $0 == UInt8(ascii: "-") }
            let limit = Array("9007199254740991".utf8)
            let unsafe = digits.count > limit.count
                || (digits.count == limit.count && limit.lexicographicallyPrecedes(digits))
            return unsafe ? String(decoding: token, as: UTF8.self) : nil
        }

        for byte in data {
            if inString {
                if escaped {
                    escaped = false
                } else if byte == UInt8(ascii: "\\") {
                    escaped = true
                } else if byte == UInt8(ascii: "\"") {
                    inString = false
                }
                continue
            }
            if byte == UInt8(ascii: "\"") {
                if let unsafe = finish() { return unsafe }
                inString = true
            } else if (0x30...0x39).contains(byte) || [UInt8(ascii: "-"), UInt8(ascii: "+"), UInt8(ascii: "."),
                                                        UInt8(ascii: "e"), UInt8(ascii: "E")].contains(byte) {
                token.append(byte)
            } else if let unsafe = finish() {
                return unsafe
            }
        }
        return finish()
    }
}
