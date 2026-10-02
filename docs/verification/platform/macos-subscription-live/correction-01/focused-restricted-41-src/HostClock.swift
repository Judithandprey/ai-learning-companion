import Foundation
import FoundationNetworking
import Glibc

/// The host's monotonic clock: `mach_absolute_time`, which does not advance while the Mac
/// sleeps. It is the clock of `CACurrentMediaTime()` and, per Apple's documentation, of
/// `SCStreamFrameInfo.displayTime`. It is not a wall clock and not a course playhead.
public enum HostClock {
    private static let timebase: mach_timebase_info_data_t = {
        var info = mach_timebase_info_data_t()
        mach_timebase_info(&info)
        return info
    }()

    /// Mach ticks in seconds, with this Mac's timebase.
    public static func seconds(ticks: UInt64) -> Double {
        Double(ticks) * Double(timebase.numer) / Double(timebase.denom) / 1_000_000_000
    }

    public static func now() -> Double {
        seconds(ticks: mach_absolute_time())
    }

    /// Seconds in mach ticks, rounded: the inverse of `seconds(ticks:)`.
    static func ticks(seconds: Double) -> UInt64 {
        UInt64((seconds * 1_000_000_000 * Double(timebase.denom) / Double(timebase.numer)).rounded())
    }
}
