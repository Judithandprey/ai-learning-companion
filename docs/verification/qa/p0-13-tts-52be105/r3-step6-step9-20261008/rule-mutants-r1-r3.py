import subprocess, shutil, os, tempfile, re, sys
from concurrent.futures import ThreadPoolExecutor
WT=os.environ.get('LC_QA_WT', os.getcwd())
NODE=os.environ.get('LC_QA_NODE', 'node')
G='tests/e2e/windows/qa_tts_output_candidate.mjs'
M=[
 # R1
 ('R1 lookup: page check before scan dropped', "  if ($null -eq $script:qaEdgeIdentity) { throw 'owned Edge surface identity is not established' }\n  [void](Assert-QaEdgeSurfacePage $script:qaEdgeIdentity)\n", "  if ($null -eq $script:qaEdgeIdentity) { throw 'owned Edge surface identity is not established' }\n"),
 ('R1 lookup: page check after scan dropped', "  [void](Assert-QaEdgeSurfacePage $script:qaEdgeIdentity)     # and still the same page after the window scan\n", ""),
 ('R1 page: token-in-title check dropped', " && document.title.endsWith(' ' + '\" + [string]$identity.token + \"')", ""),
 ('R1 page: truth-function check dropped', " && typeof window.__qaSurfaceTruth === 'function' && document.title", " && document.title"),
 ('R1 page: re-tags a page that lost the token', "  if (-not ($same -is [bool] -and $same)) { throw 'generated surface page changed, navigated or lost its identity' }\n", "  if (-not ($same -is [bool] -and $same)) { [void](Eval 'edge' (\"document.title = document.title + ' ' + '\" + [string]$identity.token + \"'\")) }\n"),
 ('R1 page: non-bool result accepted', "  if (-not ($same -is [bool] -and $same)) {", "  if (-not $same) {"),
 ('R1 page: trailing target re-check dropped', "  [void](Get-QaEdgeSocket)                                   # still the same single target after the read (it refuses otherwise)\n", ""),
 ('R1 page: ended-Edge check dropped', "  $p = $started['edge']\n  if (-not $p -or $p.HasExited) { throw 'owned Edge has ended' }\n  $socket = Get-QaEdgeSocket", "  $socket = Get-QaEdgeSocket"),
 ('R1 fullscreen: page check before write dropped', "const edgeFullscreenGuarded = String.raw`    $socket = Assert-QaEdgeSurfacePage $script:qaEdgeIdentity   # the bound page, freshly, right before each window change\n", "const edgeFullscreenGuarded = String.raw`"),
 ('R1 fullscreen: window re-lookup dropped', "    if ((Window-Handle 'edge') -ne $window) { throw 'owned Edge window changed before placement' }\n", ""),
 ('R1 fullscreen: CDP window id check dropped', "    if ($null -eq $cdpNow -or $cdpNow.error -or $cdpNow.result.windowId -ne $id) { throw 'owned Edge CDP window identity changed before placement' }\n", ""),
 ('R1 bind: page check before publish dropped', "  [void](Assert-QaEdgeSurfacePage $identity)\n  $identity.handle = $found[0]", "  $identity.handle = $found[0]"),
 ('R1 socket: redirect removed', "  if ($target -eq 'edge') { return Get-QaEdgeSocket }\n", ""),
 # R2
 ('R2 Find: unknown caption counted as nonmatch', "      else if (c == -1) unknown.Add(h);\n", ""),
 ('R2 lookup: unknown refusal dropped', "  $scan = Find-QaEdgeSurface $script:qaEdgeIdentity\n  if (@($scan.Unknown).Count -gt 0) { throw 'an owned Edge window caption could not be read: the surface window is unresolved' }\n", "  $scan = Find-QaEdgeSurface $script:qaEdgeIdentity\n"),
 ('R2 bind: unknown refusal dropped', "  try { $entry.surface_identity.owned_windows = Get-QaEdgeWindowReceipt $identity } catch { $entry.surface_identity.owned_windows_error = $_.Exception.Message }\n  if (@($scan.Unknown).Count -gt 0) { throw 'an owned Edge window caption could not be read: the surface window is unresolved' }\n", "  try { $entry.surface_identity.owned_windows = Get-QaEdgeWindowReceipt $identity } catch { $entry.surface_identity.owned_windows_error = $_.Exception.Message }\n"),
 ('R2 bind: poll stops on a match beside unknown', "    if (@($scan.Matches).Count -gt 0 -and @($scan.Unknown).Count -eq 0) { break }", "    if (@($scan.Matches).Count -gt 0) { break }"),
 ('R2 Caption: over-limit read as no-token', "    if (n < 0 || n > 4096) return IsOwned(h, pids) ? -1 : -2;", "    if (n < 0 || n > 4096) return 2;"),
 ('R2 Caption: failed length read as empty', "    if (n == 0) return Marshal.GetLastWin32Error() == 0 ? 0 : (IsOwned(h, pids) ? -1 : -2);", "    if (n == 0) return 0;"),
 ('R2 Caption: changed-while-read accepted', "    if (r != n || GetWindowTextLength(h) != n) return -1;\n", ""),
 ('R2 Caption: unread owned window reported foreign', "    if (n < 0 || n > 4096) return IsOwned(h, pids) ? -1 : -2;", "    if (n < 0 || n > 4096) return -2;"),
 # R3
 ('R3 Caption: ownership check before read dropped', "  public static int Caption(IntPtr h, uint[] pids, string token) {\n    if (!IsOwned(h, pids)) return -2;\n", "  public static int Caption(IntPtr h, uint[] pids, string token) {\n"),
 ('R3 Caption: ownership re-check after read dropped', "    if (!IsOwned(h, pids)) return -2;\n    if (r != n", "    if (r != n"),
 ('R3 Find: ownership filter dropped', "      if (!IsWindowVisible(h) || !IsOwned(h, pids)) return true;", "      if (!IsWindowVisible(h)) return true;"),
 ('R3 receipt: owner-changed short-circuit dropped', "      if ($caption -eq -2) { $row.status = 'owner_changed' }\n      else {", "      if ($false) { }\n      else {"),
 ('R3 receipt: re-check after metadata dropped', "        if (-not [QaEdgeSurface]::IsOwned($h, $ids)) { $row.status = 'owner_changed' }\n        else {", "        if ($false) { }\n        else {"),
 ('R3 receipt: widened by observed owner', "        $g = [QaDisplayAdmissionNative]::ReadWindow($h); $m = [QaPlacementNative]::Read($h)\n", "        $g = [QaDisplayAdmissionNative]::ReadWindow($h); $m = [QaPlacementNative]::Read($h)\n        if ($ids -notcontains [uint32]$g.Owner) { $ids = [uint32[]](@($ids) + [uint32]$g.Owner) }\n"),
 ('R3 OwnedWindows: ownership filter dropped', "      if (IsWindowVisible(h) && IsOwned(h, pids)) found.Add(h);", "      if (IsWindowVisible(h)) found.Add(h);"),
]
def run(m):
    name,a,b=m
    d=tempfile.mkdtemp(prefix='qa-mutr2-')
    for sub in ['tests/e2e/windows','docs/verification/qa/p0-13-tts-52be105','docs/verification/qa/p0-13-live-1755153']:
        shutil.copytree(os.path.join(WT,sub),os.path.join(d,sub),ignore=shutil.ignore_patterns('execution-*'))   # attempt evidence is never copied
    p=os.path.join(d,G); s=open(p).read()
    if s.count(a)!=1: shutil.rmtree(d); return (name,'BAD MUTANT %d'%s.count(a),[])
    open(p,'w').write(s.replace(a,b))
    g=subprocess.run([NODE,'--test','tests/e2e/windows/test_qa_tts_output_candidate.mjs'],capture_output=True,text=True,cwd=d,env=dict(os.environ,LC_QA_TTS_STATIC_RECEIPT=os.path.join(d,'docs/verification/qa/p0-13-tts-52be105/stage-identity.json')))
    fails=sorted({re.sub(r' \([\d.]+ms\)$','',l[2:]) for l in g.stdout.splitlines() if l.startswith('✖') and 'failing tests' not in l})
    beyond=[f for f in fails if 'pinned by their reviewed hashes' not in f]
    shutil.rmtree(d)
    return (name, 'CAUGHT' if beyond else ('HASH-PIN ONLY' if fails else 'SURVIVED'), beyond)
with ThreadPoolExecutor(6) as ex:
    res=list(ex.map(run,M))
for name,verdict,beyond in res:
    print(f"{name}: {verdict}")
    for f in beyond: print(f"    - {f[:150]}")
print(f"\n{sum(v=='CAUGHT' for _,v,_ in res)}/{len(res)} caught by behaviour, line or order assertions (beyond the block hash pin)")
