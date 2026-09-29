import CoreVideo

/// Sparse luma samples for the change heuristic.
///
/// Samples are read only from layouts checked here, after a successful lock and after checking
/// dimensions and row stride:
/// - 8-bit 4:2:0 bi-planar buffers ('420v', '420f'), where plane 0 has one luma byte per pixel;
/// - 32-bit BGRA, where the green byte is used as a luma proxy.
///
/// Any other layout, including 10-bit or 2-byte packed formats, or a buffer that cannot be
/// locked, gives an empty grid. An empty grid never justifies skipping a frame. Core Image can
/// still encode such a frame.
///
/// Foundation/CoreVideo only, so it can also be checked on a Mac (apps/ios/checks/ScreenObserverCheck).
enum LumaGrid {
    static let columns = 256
    static let rows = 192

    static func sample(_ buffer: CVPixelBuffer, columns: Int = columns, rows: Int = rows) -> [UInt8] {
        let planeIndex: Int?
        let bytesPerPixel: Int
        let channel: Int
        switch CVPixelBufferGetPixelFormatType(buffer) {
        case kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange, kCVPixelFormatType_420YpCbCr8BiPlanarFullRange:
            planeIndex = 0
            bytesPerPixel = 1
            channel = 0
        case kCVPixelFormatType_32BGRA:
            planeIndex = nil
            bytesPerPixel = 4
            channel = 1
        default:
            return []
        }
        guard columns > 0, rows > 0,
              CVPixelBufferLockBaseAddress(buffer, .readOnly) == kCVReturnSuccess else { return [] }
        defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }

        let base: UnsafeMutableRawPointer?
        let width: Int
        let height: Int
        let rowBytes: Int
        if let planeIndex {
            guard CVPixelBufferIsPlanar(buffer), CVPixelBufferGetPlaneCount(buffer) == 2 else { return [] }
            base = CVPixelBufferGetBaseAddressOfPlane(buffer, planeIndex)
            width = CVPixelBufferGetWidthOfPlane(buffer, planeIndex)
            height = CVPixelBufferGetHeightOfPlane(buffer, planeIndex)
            rowBytes = CVPixelBufferGetBytesPerRowOfPlane(buffer, planeIndex)
        } else {
            guard !CVPixelBufferIsPlanar(buffer) else { return [] }
            base = CVPixelBufferGetBaseAddress(buffer)
            width = CVPixelBufferGetWidth(buffer)
            height = CVPixelBufferGetHeight(buffer)
            rowBytes = CVPixelBufferGetBytesPerRow(buffer)
            guard rowBytes * height <= CVPixelBufferGetDataSize(buffer) else { return [] }
        }
        guard let base, width > 0, height > 0, rowBytes >= width * bytesPerPixel else { return [] }

        // With the checks above every sample lies inside the plane:
        // y < height, and x * bytesPerPixel + channel < width * bytesPerPixel <= rowBytes.
        let bytes = base.assumingMemoryBound(to: UInt8.self)
        var grid = [UInt8]()
        grid.reserveCapacity(columns * rows)
        for row in 0..<rows {
            let y = (2 * row + 1) * height / (2 * rows)
            for column in 0..<columns {
                let x = (2 * column + 1) * width / (2 * columns)
                grid.append(bytes[y * rowBytes + x * bytesPerPixel + channel])
            }
        }
        return grid
    }

    /// Whether two grids differ by more than `threshold` at any sample. An empty or mismatched
    /// grid always counts as different, so it can never justify skipping a frame.
    static func differ(_ a: [UInt8], _ b: [UInt8], threshold: Int) -> Bool {
        a.isEmpty || b.isEmpty || a.count != b.count
            || zip(a, b).contains { abs(Int($0) - Int($1)) > threshold }
    }
}
