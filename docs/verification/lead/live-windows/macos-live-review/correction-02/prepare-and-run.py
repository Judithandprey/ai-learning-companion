#!/usr/bin/env python3
"""Exact-source independent MAC-LIVE-03 replay. Existing toolchain; no network/native execution."""
from pathlib import Path
import hashlib,json,os,re,subprocess,sys
base=Path(__file__).resolve().parent
repo=Path(sys.argv[1]) if len(sys.argv)>1 else Path('/home/agentsdock/Projects/learning-companion/repo')
src=base/'src';src.mkdir(exist_ok=True)
commit='29bdeb4de9c926148262098ed6b4015ed62ee404'
evidence='docs/verification/platform/macos-subscription-live/correction-01/'
sources={}
def read(path):
    raw=subprocess.check_output(['git','-C',str(repo),'show',f'{commit}:{path}'])
    sources[path]=hashlib.sha256(raw).hexdigest()
    return raw
paths=subprocess.check_output(['git','-C',str(repo),'ls-tree','-r','--name-only',commit,'apps/macos/CompanionDesktop/Sources/DesktopCapture','apps/macos/CompanionDesktop/Tests/DesktopCaptureTests'],text=True).splitlines()
for path in paths:
    if not path.endswith('.swift'):continue
    text=re.sub(r'^(import (CoreGraphics|CoreImage|CoreMedia|CoreVideo|CryptoKit|ImageIO|ScreenCaptureKit|CFNetwork|Darwin)|@testable import DesktopCapture)\n','',read(path).decode(),flags=re.M)
    text='import Foundation\nimport FoundationNetworking\nimport Glibc\n'+text
    if path.endswith('/MacIngressUpload.swift'):
        text=re.sub(r'^(\s*)configuration.waitsForConnectivity = false',r'\1// LINUX-ONLY-PATCH configuration.waitsForConnectivity = false',text,flags=re.M)
    (src/Path(path).name).write_text(text)
for path,name in [('docs/verification/platform/macos-subscription-live/linux-apple-stand-ins.swift','AppleShim.swift'),(evidence+'controller-probe.swift','ControllerProbe.swift'),(evidence+'controller-ui-stand-ins.swift','UIStandIn.swift'),(evidence+'lead-queued-presentation-probe.swift','ZLeadLifecycleProbe.swift')]:
    (src/name).write_bytes(read(path))
controller=read('apps/macos/CompanionDesktop/Sources/CompanionDesktop/LiveController.swift').decode().split("/// The connection to the user's ChatGPT subscription and the AI's session, in the main window.")[0]
controller=re.sub(r'^import (AppKit|DesktopCapture|SwiftUI)\n','',controller,flags=re.M)
(src/'ActualLiveController.swift').write_text('import Foundation\n'+controller+'\nstruct LiveCardView: View {}\n')
original=(src/'ControllerProbe.swift').read_text();assert original.endswith('}\n')
(src/'ControllerProbe.swift').write_text(original[:-2]+(base/'controller-frame-advance-method.swift.txt').read_text()+'}\n')
probe=(base/'lead-frame-advance-probe.swift').read_bytes()
assert hashlib.sha256(probe).hexdigest()==json.loads((base/'before-frame-advance-manifest.json').read_text())['harness_files']['ZLeadFrameAdvancementProbe.swift']
(src/'ZLeadFrameAdvancementProbe.swift').write_bytes(probe)
names=['testLeadSubmittedFollowupSurvivesHealthyFrameAdvanceButNotSourceLoss',
       'testControllerAnsweredFollowupSurvivesHealthyFrameBeforeQueuedFirstDisplayButNotSourceLoss',
       'testHealthyAdvanceRefusesOldCurrentInputWithoutRevokingItsSubmittedAnswer',
       'testHealthyAdvanceDuringRenderingDrainsTheNewestWaitingFrame',
       'testHealthyAdvanceBeforeWriterCompletionStillRefusesTheOldCurrentLine',
       'testNewestUnretainedPixelsStillBlockFirstDisplayOfAnEarlierAnswer',
       'testSourceLossAfterHealthyAdvancePermanentlyRevokesUnshownAnswer',
       'testLeadQueuedAnswerIsNotAcceptedAsShownAfterStop',
       'testControllerDeferredAnswerCannotAppearAfterSynchronousStop']
entries=[]
for name in names:
    matched=[p.read_text() for p in src.glob('*.swift') if re.search(r'\bfunc '+name+r'\(',p.read_text())]
    assert len(matched)==1,name
    method='DesktopCaptureTests.'+name
    reference='asyncTest('+method+')' if re.search(r'\bfunc '+name+r'\(\)\s+async',matched[0]) else method
    entries.append(f'("{name}", {reference}),')
(src/'main.swift').write_text('import Foundation\nimport XCTest\nimport Glibc\nsignal(SIGPIPE, SIG_IGN)\ntypealias Entry=(String,(DesktopCaptureTests)->() throws->Void)\nlet tests: [Entry]=[\n'+'\n'.join(entries)+'\n]\nXCTMain([testCase(tests)])\n')
files=[p for p in sorted(src.glob('*.swift')) if p.name!='main.swift']
command=['/tmp/lc-review-0212/tc/usr/bin/swift-frontend','-interpret','-sdk','/tmp/lc-review-0212/sysroot','-swift-version','5','-module-name','LCLeadMacLive03','-lXCTest','src/main.swift']+['src/'+p.name for p in files]
manifest={'commit':commit,'parent':'4f6c327018d46604b21c57ab4ebf2b0e45278f70','source_files':sources,'harness_files':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(src.glob('*.swift'))},'selected_tests':names,'command':command,'cwd':str(base),'environment':{'LD_LIBRARY_PATH':'/tmp/lc-review-0212/libs'},'transformations':'Retained Apple/UI stand-ins; import/corelibs substitutions; exact actual LiveController class before view declarations; unchanged lead paired probe and owner post-response queued-display probe','native_or_provider_execution':False}
(base/'source-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
with (base/'focused.log').open('wb') as log:
    result=subprocess.run(command,cwd=base,env=dict(os.environ,LD_LIBRARY_PATH='/tmp/lc-review-0212/libs'),stdout=log,stderr=subprocess.STDOUT)
(base/'result.json').write_text(json.dumps({'exit_code':result.returncode,'selected_methods':len(names),'log_sha256':hashlib.sha256((base/'focused.log').read_bytes()).hexdigest()},indent=2)+'\n')
print(f'Selected {len(names)} focused methods; exit={result.returncode}; rawlog={base/"focused.log"}')
sys.exit(result.returncode)
