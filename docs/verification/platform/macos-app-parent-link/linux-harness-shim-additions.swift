
// ===== Link harness additions (Linux stand-ins; not Darwin behavior) =====
public let F_SETNOSIGPIPE: Int32 = 73
public let SO_NOSIGPIPE: Int32 = 0x7fff_0022
public func socket(_ domain: Int32, _ type: __socket_type, _ proto: Int32) -> Int32 { Glibc.socket(domain, Int32(type.rawValue), proto) }
