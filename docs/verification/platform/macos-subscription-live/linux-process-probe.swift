import Foundation
import Glibc
let p = Process()
p.executableURL = URL(fileURLWithPath: "/bin/sh")
p.arguments = ["-c", "trap '' TERM; sleep 5"]
let out = Pipe(); p.standardOutput = out; p.standardError = out
p.terminationHandler = { _ in print("termination handler called") }
try p.run()
let pid = p.processIdentifier
print("owned pid", pid)
print("kill returned", kill(pid, SIGKILL), "errno", errno)
Thread.sleep(forTimeInterval: 0.5)
print("running after kill", p.isRunning, "alive", kill(pid, 0))
p.waitUntilExit()
print("wait returned", p.terminationStatus)
