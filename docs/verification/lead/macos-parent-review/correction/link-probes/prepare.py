from pathlib import Path
import hashlib,json,re,subprocess,shutil
repo=Path('/home/agentsdock/Projects/learning-companion/repo')
root=Path('/tmp/lc-macos-parent-fb891d6')
out=Path('/tmp/mac-parent-fb891-review.probes')
rows=[]
for p in (root/'apps/macos/CompanionDesktop/Sources/DesktopCapture').glob('*.swift'):
    relative=p.relative_to(root)
    raw=p.read_bytes()
    assert raw==subprocess.check_output(['git','show','fb891d699cc33cde10c2a1fa25928f3c87346b3f:'+str(relative)],cwd=repo)
    text=raw.decode()
    text='import Foundation\nimport FoundationNetworking\nimport Glibc\n'+re.sub(r'^import (CoreGraphics|CoreImage|CoreMedia|CoreVideo|CryptoKit|ImageIO|ScreenCaptureKit|CFNetwork|Darwin)\n','',text,flags=re.M)
    text=text.replace('configuration.waitsForConnectivity = false','// Linux-only: configuration.waitsForConnectivity = false')
    (out/'src'/p.name).write_text(text)
    rows.append({'path':str(relative),'exact_git_bytes':True,'sha256':hashlib.sha256(raw).hexdigest(),'normalized_sha256':hashlib.sha256(text.encode()).hexdigest()})
shim=Path('/tmp/macos-parent-link-f625-probes/src/AppleShim.swift')
shutil.copyfile(shim,out/'src/AppleShim.swift')
(out/'source-manifest.json').write_text(json.dumps({'commit':'fb891d699cc33cde10c2a1fa25928f3c87346b3f','adaptations':['Existing Apple/Darwin stubs only','FoundationNetworking/Glibc imports','Unchanged corelibs waitsForConnectivity assignment omitted','No CaptureLink logic changes'],'files':rows,'shim_sha256':hashlib.sha256(shim.read_bytes()).hexdigest()},indent=2)+'\n')
