import re,glob
T='/home/agentsdock/Projects/learning-companion/wt-platform/apps/macos/CompanionDesktop/Tests/DesktopCaptureTests/'
def entries(files):
    out=[]
    for f in files:
        for m in re.finditer(r'func (test\w+)\(\)\s*(async)?', open(f).read()):
            name,a=m.group(1),m.group(2)
            ref=f"DesktopCaptureTests.{name}"
            out.append(f'    ("{name}", {"asyncTest("+ref+")" if a else ref}),')
    return out
link=entries([T+'CaptureLinkTests.swift']); ask=entries([T+'AskLinkTests.swift']); upload=entries([T+'MacIngressUploadTests.swift']); live=entries([T+'LiveLinkTests.swift']); allt=entries(sorted(glob.glob(T+'*.swift')))
main=f'''import Foundation
import XCTest

// Linux harness only: a dead child's pipe must not kill the interpreter (Darwin uses F_SETNOSIGPIPE/SO_NOSIGPIPE).
signal(SIGPIPE, SIG_IGN)
let selected = ProcessInfo.processInfo.environment["LC_TESTS"] ?? "link"
typealias Entry = (String, (DesktopCaptureTests) -> () throws -> Void)
let linkTests: [Entry] = [
{chr(10).join(link)}
]
let askTests: [Entry] = [
{chr(10).join(ask)}
]
let upload: [Entry] = [
{chr(10).join(upload)}
]
let liveTests: [Entry] = [
{chr(10).join(live)}
]
let everything: [Entry] = [
{chr(10).join(allt)}
]
var chosen: [Entry] = []
if selected.contains("link") {{ chosen += linkTests }}
if selected.contains("upload") {{ chosen += upload }}
if selected.contains("ask") {{ chosen += askTests }}
if selected.contains("live") {{ chosen += liveTests }}
if selected.contains("all") {{ chosen += everything }}
if selected.contains("rlconn") {{ chosen += [("testProbeRealLiveConnector", asyncTest(DesktopCaptureTests.testProbeRealLiveConnector))] }}
if let only = ProcessInfo.processInfo.environment["LC_ONLY"] {{ chosen = chosen.filter {{ only.split(separator: ",").map(String.init).contains($0.0) }} }}
XCTMain([testCase(chosen)])
'''
open('/tmp/lc-link-run/src/main.swift','w').write(main)
print(len(link),len(upload),len(live),len(allt))
