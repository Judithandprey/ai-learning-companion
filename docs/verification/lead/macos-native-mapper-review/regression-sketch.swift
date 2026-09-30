// Proposed focused XCTest additions for the native owner/hosted runner.
// Source review artifact only: NOT compiled or executed by this reviewer.
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers
import XCTest
@testable import DesktopCapture

final class MacRetainedBoundaryReviewTests: XCTestCase {
    func testJPEGIsNotAcceptedAsRetainedPNG() throws {
        let context = try XCTUnwrap(CGContext(data: nil, width: 1, height: 1,
            bitsPerComponent: 8, bytesPerRow: 4, space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue))
        let image = try XCTUnwrap(context.makeImage())
        let bytes = NSMutableData()
        let destination = try XCTUnwrap(CGImageDestinationCreateWithData(bytes, UTType.jpeg.identifier as CFString, 1, nil))
        CGImageDestinationAddImage(destination, image, nil)
        XCTAssertTrue(CGImageDestinationFinalize(destination))
        // Current checkSize only reads ImageIO dimensions, and has no PNG type/signature check.
        XCTAssertThrowsError(try MacRetainedFrames.checkSize(bytes as Data,
            width: 1, height: 1, file: "frames/00000001.png"))
    }
}

// Session-level regression using the existing test fixture helpers in MacRetainedFramesTests:
// 1. Finish a synthetic retained session normally so status.ending and the ended event both exist.
// 2. Edit only the JSON ended event's detail.reason, detail.detail and detail.live_ended_host to
//    different, clearly synthetic values; preserve kept/composed bytes and supplied bindings.
// 3. RetainedSession.read must retain both records (or refuse the inconsistent session).
// 4. MacRetainedFrames.map(...).unrepresented must expose both competing recorded facts and/or
//    an explicit disagreement. Present code at lines522-532 emits only status.ending when both
//    are present, so the edited event values cannot be found in the returned mapping.
