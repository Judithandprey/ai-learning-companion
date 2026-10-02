@_exported import Foundation
@_exported import FoundationNetworking
@_exported import Glibc

// ===== CoreFoundation (Linux stand-ins; CFString = String etc.) =====
public typealias CFString = String
public typealias CFData = Data
public typealias CFDictionary = NSDictionary
public typealias CFArray = NSArray
public typealias CFURL = URL
public typealias CFNumber = NSNumber
public typealias CFTypeID = UInt
public typealias CFTypeRef = AnyObject
public typealias CFAllocator = AnyObject
public func CFGetTypeID(_ cf: CFTypeRef!) -> CFTypeID { if let n = cf as? NSNumber, String(cString: n.objCType) == "c" { return 1 }; return 2 }
public func CFBooleanGetTypeID() -> CFTypeID { 1 }
public func CFNumberIsFloatType(_ number: CFNumber!) -> Bool { let t = String(cString: number.objCType); return t == "d" || t == "f" }
public typealias OSType = UInt32
public typealias OSStatus = Int32
public let noErr: OSStatus = 0

// ===== CFNetwork =====
public let kCFNetworkProxiesHTTPEnable: CFString = "HTTPEnable"
public let kCFNetworkProxiesHTTPSEnable: CFString = "HTTPSEnable"
public let kCFNetworkProxiesSOCKSEnable: CFString = "SOCKSEnable"
public let kCFNetworkProxiesProxyAutoConfigEnable: CFString = "ProxyAutoConfigEnable"

// ===== CoreGraphics (functional fake: RGBA pixels + a drawing transcript) =====
public final class CGColorSpace { public static let sRGB: CFString = "sRGB"; public init?(name: CFString) {} }
public final class CGColor { let rgba: [Double]; public init(srgbRed: CGFloat, green: CGFloat, blue: CGFloat, alpha: CGFloat) { rgba = [Double(srgbRed), Double(green), Double(blue), Double(alpha)] }
    public init(gray: CGFloat, alpha: CGFloat) { rgba = [Double(gray), Double(gray), Double(gray), Double(alpha)] } }
public enum CGImageAlphaInfo: UInt32 { case premultipliedLast = 1, noneSkipLast = 5 }
public final class CGImage {
    public let width: Int
    public let height: Int
    let pixels: [UInt8]      // RGBA, top row first
    let transcript: [UInt8]  // drawing operations applied over the pixels
    init(width: Int, height: Int, pixels: [UInt8], transcript: [UInt8] = []) { self.width = width; self.height = height; self.pixels = pixels; self.transcript = transcript }
    public func cropping(to rect: CGRect) -> CGImage? {
        let r = rect.integral
        let x0 = max(0, Int(r.minX)), y0 = max(0, Int(r.minY)), x1 = min(width, Int(r.maxX)), y1 = min(height, Int(r.maxY))
        guard x1 > x0, y1 > y0 else { return nil }
        var out: [UInt8] = []
        for y in y0..<y1 { out.append(contentsOf: pixels[(y * width + x0) * 4 ..< (y * width + x1) * 4]) }
        return CGImage(width: x1 - x0, height: y1 - y0, pixels: out, transcript: transcript)
    }
}
public enum CGLineCap: Int32 { case butt, round, square }
public enum CGLineJoin: Int32 { case miter, round, bevel }
public final class CGContext {
    let width: Int, height: Int
    let data: UnsafeMutableRawPointer?
    var pixels: [UInt8]
    var hash: UInt64 = 0xcbf29ce484222325
    var transcript: [UInt8] { (0..<8).map { UInt8(truncatingIfNeeded: hash >> (8 * UInt64($0))) } }
    func log(_ s: String) { for b in (s + ";").utf8 { hash = (hash ^ UInt64(b)) &* 0x100000001b3 } }
    public init?(data: UnsafeMutableRawPointer?, width: Int, height: Int, bitsPerComponent: Int, bytesPerRow: Int, space: CGColorSpace, bitmapInfo: UInt32) {
        guard width > 0, height > 0 else { return nil }
        self.width = width; self.height = height; self.data = data
        pixels = [UInt8](repeating: 0, count: width * height * 4)
    }
    public func draw(_ image: CGImage, in rect: CGRect) {
        if image.width == width && image.height == height { pixels = image.pixels; log(image.transcript.map { String($0) }.joined(separator: ",")) }
        log("draw \(rect)")
        if let data { pixels.withUnsafeBytes { data.copyMemory(from: $0.baseAddress!, byteCount: $0.count) } }
    }
    public func translateBy(x: CGFloat, y: CGFloat) { log("t \(x) \(y)") }
    public func scaleBy(x: CGFloat, y: CGFloat) { log("s \(x) \(y)") }
    public func setStrokeColor(_ c: CGColor) { log("c \(c.rgba)") }
    public func setLineWidth(_ w: CGFloat) { log("w \(w)") }
    public func setLineCap(_ c: CGLineCap) { log("cap \(c.rawValue)") }
    public func setLineJoin(_ c: CGLineJoin) { log("join \(c.rawValue)") }
    public func move(to p: CGPoint) { log("m \(p.x) \(p.y)") }
    public func addLine(to p: CGPoint) { log("l \(p.x) \(p.y)") }
    public func strokePath() { log("stroke") }
    public func setFillColor(_ c: CGColor) { log("fc \(c.rgba)") }
    public func fill(_ r: CGRect) { log("fill \(r)") }
    public func beginPath() { log("begin") }
    public func makeImage() -> CGImage? { CGImage(width: width, height: height, pixels: pixels, transcript: transcript) }
}
extension CGRect {
    public init?(dictionaryRepresentation: CFDictionary) {
        guard let x = (dictionaryRepresentation["X"] as? NSNumber)?.doubleValue, let y = (dictionaryRepresentation["Y"] as? NSNumber)?.doubleValue,
              let w = (dictionaryRepresentation["Width"] as? NSNumber)?.doubleValue, let h = (dictionaryRepresentation["Height"] as? NSNumber)?.doubleValue else { return nil }
        self.init(x: x, y: y, width: w, height: h)
    }
    public var dictionaryRepresentation: CFDictionary {
        ["X": NSNumber(value: Double(origin.x)), "Y": NSNumber(value: Double(origin.y)), "Width": NSNumber(value: Double(size.width)), "Height": NSNumber(value: Double(size.height))] as NSDictionary
    }
}

// ===== ImageIO (a real PNG: IHDR, a private ancillary lcFk chunk with the drawing transcript, IDAT, IEND) =====
// The pixels are written as a real 8-bit RGBA, non-interlaced PNG whose zlib stream uses stored
// (uncompressed) blocks, so any PNG decoder and the project's own PNG validator read it. Only this
// stand-in's own output is decoded here. Drawing is still not rasterized: strokes are a transcript.
let pngSig: [UInt8] = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]
func be32(_ v: Int) -> [UInt8] { [UInt8((v >> 24) & 0xff), UInt8((v >> 16) & 0xff), UInt8((v >> 8) & 0xff), UInt8(v & 0xff)] }
let crcTable: [UInt32] = (0..<256).map { n -> UInt32 in
    var c = UInt32(n)
    for _ in 0..<8 { c = (c & 1) != 0 ? (c >> 1) ^ 0xEDB8_8320 : c >> 1 }
    return c
}
func crc32(_ bytes: [UInt8]) -> Int {
    var c: UInt32 = 0xFFFF_FFFF
    bytes.withUnsafeBufferPointer { buffer in
        for b in buffer { c = crcTable[Int((c ^ UInt32(b)) & 0xFF)] ^ (c >> 8) }
    }
    return Int(c ^ 0xFFFF_FFFF)
}
func chunk(_ type: String, _ data: [UInt8]) -> [UInt8] { let t = Array(type.utf8); return be32(data.count) + t + data + be32(crc32(t + data)) }
func encodeFakePNG(_ image: CGImage) -> Data {
    let ihdr = be32(image.width) + be32(image.height) + [8, 6, 0, 0, 0]
    // One filter byte (0, none) before each row.
    var raw = [UInt8]()
    raw.reserveCapacity(image.height * (1 + image.width * 4))
    for y in 0..<image.height {
        raw.append(0)
        raw.append(contentsOf: image.pixels[(y * image.width * 4) ..< ((y + 1) * image.width * 4)])
    }
    // zlib with stored blocks, then Adler-32.
    var z: [UInt8] = [0x78, 0x01]
    z.reserveCapacity(raw.count + raw.count / 65535 * 5 + 16)
    var offset = 0
    repeat {
        let n = min(65535, raw.count - offset)
        z.append(offset + n >= raw.count ? 1 : 0)
        z.append(UInt8(n & 0xff)); z.append(UInt8(n >> 8)); z.append(UInt8(~n & 0xff)); z.append(UInt8((~n >> 8) & 0xff))
        z.append(contentsOf: raw[offset ..< offset + n])
        offset += n
    } while offset < raw.count
    var a: UInt32 = 1, b: UInt32 = 0
    raw.withUnsafeBufferPointer { buffer in
        for byte in buffer { a = (a + UInt32(byte)) % 65521; b = (b + a) % 65521 }
    }
    z.append(contentsOf: be32(Int((b << 16) | a)))
    return Data(pngSig + chunk("IHDR", ihdr) + chunk("lcFk", image.transcript) + chunk("IDAT", z) + chunk("IEND", []))
}
func decodeFakePNG(_ data: Data) -> CGImage? {
    let b = [UInt8](data)
    func rd(_ o: Int) -> Int { (Int(b[o]) << 24) | (Int(b[o+1]) << 16) | (Int(b[o+2]) << 8) | Int(b[o+3]) }
    guard b.count >= 45, Array(b[0..<8]) == pngSig, Array(b[12..<16]) == Array("IHDR".utf8) else { return nil }
    let w = rd(16), h = rd(20)
    guard w > 0, h > 0, b[24] == 8, b[25] == 6 else { return nil }
    var transcript: [UInt8] = []
    var z: [UInt8] = []
    var offset = 33
    while offset + 12 <= b.count {
        let length = rd(offset), kind = Array(b[offset + 4 ..< offset + 8])
        guard offset + 12 + length <= b.count else { return nil }
        let body = Array(b[offset + 8 ..< offset + 8 + length])
        if kind == Array("lcFk".utf8) { transcript = body } else if kind == Array("IDAT".utf8) { z.append(contentsOf: body) }
        offset += 12 + length
    }
    guard z.count > 6, z[0] == 0x78 else { return nil }
    var raw: [UInt8] = []
    raw.reserveCapacity(h * (1 + w * 4))
    var at = 2
    while at + 5 <= z.count {
        let last = z[at] & 1, n = Int(z[at + 1]) | (Int(z[at + 2]) << 8)
        guard z[at] & 6 == 0, at + 5 + n <= z.count else { return nil }
        raw.append(contentsOf: z[at + 5 ..< at + 5 + n])
        at += 5 + n
        if last == 1 { break }
    }
    guard raw.count == h * (1 + w * 4) else { return nil }
    var pixels = [UInt8]()
    pixels.reserveCapacity(w * h * 4)
    for y in 0..<h {
        guard raw[y * (1 + w * 4)] == 0 else { return nil }
        pixels.append(contentsOf: raw[y * (1 + w * 4) + 1 ..< (y + 1) * (1 + w * 4)])
    }
    return CGImage(width: w, height: h, pixels: pixels, transcript: transcript)
}
public final class CGImageSource { let image: CGImage?; let isPNG: Bool; init(image: CGImage?, isPNG: Bool) { self.image = image; self.isPNG = isPNG } }
public final class CGImageDestination { let url: URL?; let data: NSMutableData?; let type: String; var image: CGImage?; init(url: URL?, data: NSMutableData? = nil, type: String = "public.png") { self.url = url; self.data = data; self.type = type } }
public func CGImageSourceCreateWithData(_ data: CFData, _ options: CFDictionary?) -> CGImageSource? {
    guard data.count >= 8 else { return nil }
    let img = decodeFakePNG(data)
    return CGImageSource(image: img, isPNG: img != nil)
}
public func CGImageSourceCreateWithURL(_ url: CFURL, _ options: CFDictionary?) -> CGImageSource? {
    guard let d = try? Data(contentsOf: url) else { return nil }
    return CGImageSourceCreateWithData(d, options)
}
public func CGImageSourceCreateImageAtIndex(_ s: CGImageSource, _ i: Int, _ o: CFDictionary?) -> CGImage? { i == 0 ? s.image : nil }
public func CGImageSourceGetType(_ s: CGImageSource) -> CFString? { s.isPNG ? "public.png" : nil }
public func CGImageSourceCopyPropertiesAtIndex(_ s: CGImageSource, _ i: Int, _ o: CFDictionary?) -> CFDictionary? {
    guard i == 0, let img = s.image else { return nil }
    return [kCGImagePropertyPixelWidth: img.width, kCGImagePropertyPixelHeight: img.height] as NSDictionary
}
public let kCGImagePropertyPixelWidth: CFString = "PixelWidth"
public let kCGImagePropertyPixelHeight: CFString = "PixelHeight"
public func CGImageDestinationCreateWithURL(_ url: CFURL, _ type: CFString, _ count: Int, _ options: CFDictionary?) -> CGImageDestination? { CGImageDestination(url: url, type: type) }
public func CGImageDestinationAddImage(_ d: CGImageDestination, _ i: CGImage, _ o: CFDictionary?) { d.image = i }
public func CGImageDestinationCreateWithData(_ data: NSMutableData, _ type: CFString, _ count: Int, _ options: CFDictionary?) -> CGImageDestination? { CGImageDestination(url: nil, data: data, type: type) }
public func CGImageDestinationFinalize(_ d: CGImageDestination) -> Bool {
    guard let i = d.image else { return false }
    var bytes = encodeFakePNG(i)
    if d.type != "public.png" { bytes = Data([0xFF, 0xD8, 0xFF, 0xE0]) + bytes.dropFirst(8) }
    if let data = d.data { data.append(bytes); return true }
    guard let url = d.url else { return false }
    return (try? bytes.write(to: url)) != nil
}

// ===== CoreVideo (functional BGRA buffers) =====
public typealias CVReturn = Int32
public let kCVReturnSuccess: CVReturn = 0
public let kCVPixelFormatType_32BGRA: OSType = 0x42475241
public let kCVPixelBufferIOSurfacePropertiesKey: CFString = "IOSurfaceProperties"
public struct CVPixelBufferLockFlags: OptionSet { public let rawValue: UInt64; public init(rawValue: UInt64) { self.rawValue = rawValue } }
public final class CVPixelBuffer {
    let width: Int, height: Int, format: OSType, bytesPerRow: Int
    let base: UnsafeMutableRawPointer
    init(width: Int, height: Int, format: OSType) {
        self.width = width; self.height = height; self.format = format; bytesPerRow = width * 4
        base = UnsafeMutableRawPointer.allocate(byteCount: width * height * 4, alignment: 16)
        base.initializeMemory(as: UInt8.self, repeating: 0, count: width * height * 4)
    }
    deinit { base.deallocate() }
}
@discardableResult public func CVPixelBufferCreate(_ allocator: CFAllocator?, _ width: Int, _ height: Int, _ format: OSType, _ attributes: CFDictionary?, _ out: UnsafeMutablePointer<CVPixelBuffer?>) -> CVReturn {
    out.pointee = CVPixelBuffer(width: width, height: height, format: format); return kCVReturnSuccess
}
@discardableResult public func CVPixelBufferLockBaseAddress(_ b: CVPixelBuffer, _ f: CVPixelBufferLockFlags) -> CVReturn { 0 }
@discardableResult public func CVPixelBufferUnlockBaseAddress(_ b: CVPixelBuffer, _ f: CVPixelBufferLockFlags) -> CVReturn { 0 }
public func CVPixelBufferGetBaseAddress(_ b: CVPixelBuffer) -> UnsafeMutableRawPointer? { b.base }
public func CVPixelBufferGetBytesPerRow(_ b: CVPixelBuffer) -> Int { b.bytesPerRow }
public func CVPixelBufferGetWidth(_ b: CVPixelBuffer) -> Int { b.width }
public func CVPixelBufferGetHeight(_ b: CVPixelBuffer) -> Int { b.height }
public func CVPixelBufferGetPixelFormatType(_ b: CVPixelBuffer) -> OSType { b.format }

// ===== CoreImage =====
public final class CIImage {
    let image: CGImage
    public init(cvPixelBuffer b: CVPixelBuffer) {
        var px = [UInt8](repeating: 0, count: b.width * b.height * 4)
        let src = b.base.assumingMemoryBound(to: UInt8.self)
        for y in 0..<b.height { for x in 0..<b.width {
            let s = y * b.bytesPerRow + x * 4, d = (y * b.width + x) * 4
            px[d] = src[s + 2]; px[d + 1] = src[s + 1]; px[d + 2] = src[s]; px[d + 3] = src[s + 3]
        } }
        image = CGImage(width: b.width, height: b.height, pixels: px)
    }
    public init(cgImage: CGImage) { image = cgImage }
}
public struct CIContextOption: Hashable { public static let cacheIntermediates = CIContextOption() }
public struct CIFormat { public static let RGBA8 = CIFormat() }
public final class CIContext {
    public init(options: [CIContextOption: Any]? = nil) {}
    public func writePNGRepresentation(of image: CIImage, to url: URL, format: CIFormat, colorSpace: CGColorSpace, options: [String: Any] = [:]) throws {
        try encodeFakePNG(image.image).write(to: url, options: .withoutOverwriting)
    }
}

// ===== CoreMedia =====
public typealias CMTimeValue = Int64
public typealias CMTimeScale = Int32
public struct CMTime: Equatable {
    public var value: CMTimeValue; public var timescale: CMTimeScale; var flags: Int
    public init(value: CMTimeValue, timescale: CMTimeScale) { self.value = value; self.timescale = timescale; flags = 1 }
    init(flags: Int) { value = 0; timescale = 0; self.flags = flags }
    public static let invalid = CMTime(flags: 0)
    public static let zero = CMTime(value: 0, timescale: 1)
    public static let positiveInfinity = CMTime(flags: 5)
    public var isNumeric: Bool { flags == 1 }
    public var seconds: Double { isNumeric && timescale != 0 ? Double(value) / Double(timescale) : .nan }
}
public final class CMVideoFormatDescription { }
public struct CMSampleTimingInfo { public var duration: CMTime; public var presentationTimeStamp: CMTime; public var decodeTimeStamp: CMTime
    public init(duration: CMTime, presentationTimeStamp: CMTime, decodeTimeStamp: CMTime) { self.duration = duration; self.presentationTimeStamp = presentationTimeStamp; self.decodeTimeStamp = decodeTimeStamp } }
/// Linux stand-in for the CFArray of attachment dictionaries: `firstObject` is the mutable
/// dictionary (as a test mutates it); `object(at:)` gives the typed Swift dictionary that Darwin
/// bridging would give for `as? [[SCStreamFrameInfo: Any]]`.
public final class AttachmentArray: NSArray {
    let dictionary = NSMutableDictionary()
    public override var count: Int { 1 }
    public override var firstObject: Any? { dictionary }
    public override func object(at index: Int) -> Any {
        var out: [SCStreamFrameInfo: Any] = [:]
        for (k, v) in dictionary { out[SCStreamFrameInfo(rawValue: "\(k)")] = v }
        return out
    }
}
public final class CMSampleBuffer { let image: CVPixelBuffer?; let pts: CMTime; var attachments: AttachmentArray?
    init(image: CVPixelBuffer?, pts: CMTime) { self.image = image; self.pts = pts }
    public var imageBuffer: CVPixelBuffer? { image } }
public func CMVideoFormatDescriptionCreateForImageBuffer(allocator: CFAllocator?, imageBuffer: CVPixelBuffer, formatDescriptionOut: UnsafeMutablePointer<CMVideoFormatDescription?>) -> OSStatus {
    formatDescriptionOut.pointee = CMVideoFormatDescription(); return noErr }
public func CMSampleBufferCreateReadyWithImageBuffer(allocator: CFAllocator?, imageBuffer: CVPixelBuffer, formatDescription: CMVideoFormatDescription, sampleTiming: UnsafePointer<CMSampleTimingInfo>, sampleBufferOut: UnsafeMutablePointer<CMSampleBuffer?>) -> OSStatus {
    sampleBufferOut.pointee = CMSampleBuffer(image: imageBuffer, pts: sampleTiming.pointee.presentationTimeStamp); return noErr }
public func CMSampleBufferGetPresentationTimeStamp(_ b: CMSampleBuffer) -> CMTime { b.pts }
public func CMSampleBufferGetImageBuffer(_ b: CMSampleBuffer) -> CVPixelBuffer? { b.image }
public func CMSampleBufferGetSampleAttachmentsArray(_ b: CMSampleBuffer, createIfNecessary: Bool) -> CFArray? {
    if b.attachments == nil && createIfNecessary { b.attachments = AttachmentArray() }
    return b.attachments
}

// ===== ScreenCaptureKit =====
public struct SCStreamFrameInfo: Hashable, RawRepresentable { public var rawValue: String; public init(rawValue: String) { self.rawValue = rawValue }
    public static let status = SCStreamFrameInfo(rawValue: "SCStreamUpdateFrameStatus"); public static let displayTime = SCStreamFrameInfo(rawValue: "SCStreamUpdateFrameDisplayTime")
    public static let contentRect = SCStreamFrameInfo(rawValue: "SCStreamUpdateFrameContentRect"); public static let contentScale = SCStreamFrameInfo(rawValue: "SCStreamUpdateFrameContentScale")
    public static let scaleFactor = SCStreamFrameInfo(rawValue: "SCStreamUpdateFrameScaleFactor"); public static let dirtyRects = SCStreamFrameInfo(rawValue: "SCStreamUpdateFrameDirtyRects") }
public enum SCFrameStatus: Int { case complete, idle, blank, suspended, started, stopped }
public let SCStreamErrorDomain = "SCStreamErrorDomain"
public struct SCStreamError { public enum Code: Int, Hashable { case userDeclined = -3801, missingEntitlements, failedToStart, noDisplayList, noCaptureSource, userStopped = -3817, systemStoppedStream = -3821 } }

// ===== mach =====
public struct mach_timebase_info_data_t { public var numer: UInt32 = 1; public var denom: UInt32 = 1; public init() {} }
@discardableResult public func mach_timebase_info(_ i: UnsafeMutablePointer<mach_timebase_info_data_t>) -> Int32 { i.pointee.numer = 1; i.pointee.denom = 1; return 0 }
public func mach_absolute_time() -> UInt64 { var t = timespec(); clock_gettime(CLOCK_MONOTONIC, &t); return UInt64(t.tv_sec) * 1_000_000_000 + UInt64(t.tv_nsec) }

// ===== Darwin-only URLSession async bytes, emulated with data(for:) =====
extension URLSession {
    public struct AsyncBytes: AsyncSequence {
        public typealias Element = UInt8
        let data: Data
        public let task: URLSessionDataTask
        public struct AsyncIterator: AsyncIteratorProtocol { var i: Data.Index; let d: Data
            public mutating func next() async throws -> UInt8? { guard i < d.endIndex else { return nil }; defer { i += 1 }; return d[i] } }
        public func makeAsyncIterator() -> AsyncIterator { AsyncIterator(i: data.startIndex, d: data) }
    }
    public func bytes(for request: URLRequest, delegate: (any URLSessionTaskDelegate)? = nil) async throws -> (URLSession.AsyncBytes, URLResponse) {
        let (d, r) = try await data(for: request, delegate: delegate)
        return (AsyncBytes(data: d, task: dataTask(with: request)), r)
    }
}

// Real SHA-256 (FIPS 180-4) standing in for CryptoKit on Linux.
public struct SHA256Digest: Sequence {
    let bytes: [UInt8]
    public func makeIterator() -> IndexingIterator<[UInt8]> { bytes.makeIterator() }
}
public struct SHA256 {
    public typealias Digest = SHA256Digest
    private var data: [UInt8] = []
    public init() {}
    public static func hash<D: DataProtocol>(data: D) -> SHA256Digest { var h = SHA256(); h.update(data: data); return h.finalize() }
    public mutating func update<D: DataProtocol>(data: D) { self.data.append(contentsOf: data) }
    public func finalize() -> SHA256Digest {
        let k: [UInt32] = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]
        var h: [UInt32] = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]
        var msg = data
        let bitLen = UInt64(data.count) &* 8
        msg.append(0x80)
        while msg.count % 64 != 56 { msg.append(0) }
        for i in (0..<8).reversed() { msg.append(UInt8(truncatingIfNeeded: bitLen >> (UInt64(i) * 8))) }
        func rotr(_ x: UInt32, _ n: UInt32) -> UInt32 { (x >> n) | (x << (32 - n)) }
        var w = [UInt32](repeating: 0, count: 64)
        var chunk = 0
        while chunk < msg.count {
            for i in 0..<16 {
                let b0 = UInt32(msg[chunk + 4 * i]) << 24
                let b1 = UInt32(msg[chunk + 4 * i + 1]) << 16
                let b2 = UInt32(msg[chunk + 4 * i + 2]) << 8
                let b3 = UInt32(msg[chunk + 4 * i + 3])
                w[i] = b0 | b1 | b2 | b3
            }
            for i in 16..<64 {
                let s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >> 3)
                let s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >> 10)
                w[i] = w[i - 16] &+ s0 &+ w[i - 7] &+ s1
            }
            var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7]
            for i in 0..<64 {
                let S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
                let ch = (e & f) ^ (~e & g)
                let t1 = hh &+ S1 &+ ch &+ k[i] &+ w[i]
                let S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
                let maj = (a & b) ^ (a & c) ^ (b & c)
                let t2 = S0 &+ maj
                hh = g; g = f; f = e; e = d &+ t1; d = c; c = b; b = a; a = t1 &+ t2
            }
            h[0] = h[0] &+ a; h[1] = h[1] &+ b; h[2] = h[2] &+ c; h[3] = h[3] &+ d
            h[4] = h[4] &+ e; h[5] = h[5] &+ f; h[6] = h[6] &+ g; h[7] = h[7] &+ hh
            chunk += 64
        }
        var out: [UInt8] = []
        for v in h { for s in stride(from: 24, through: 0, by: -8) { out.append(UInt8(truncatingIfNeeded: v >> UInt32(s))) } }
        return SHA256Digest(bytes: out)
    }
}

// ===== Link harness additions (Linux stand-ins; not Darwin behavior) =====
public let F_SETNOSIGPIPE: Int32 = 73
public let SO_NOSIGPIPE: Int32 = 0x7fff_0022
public func socket(_ domain: Int32, _ type: __socket_type, _ proto: Int32) -> Int32 { Glibc.socket(domain, Int32(type.rawValue), proto) }
