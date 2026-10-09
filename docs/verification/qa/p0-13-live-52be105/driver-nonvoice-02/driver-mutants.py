import subprocess, shutil, os, tempfile, re, sys
from concurrent.futures import ThreadPoolExecutor
WT=os.environ.get('LC_QA_WT', os.getcwd()); NODE=os.environ.get('LC_QA_NODE','node')
L='tests/e2e/windows/qa_live_ledger.mjs'; W='tests/e2e/windows/qa_run_live_candidate.mjs'; G='tests/e2e/windows/qa_live_candidate.mjs'
M=[
 ('transport: not-submitted counted as at provider', L, "verdict: !inputs ? 'official image input: not shown' : !submitted ?", "verdict: !inputs ? 'official image input: not shown' : false ?"),
 ('transport: text input not required', L, "types.includes('text') && types.includes('image')", "types.includes('image')"),
 ('transport: tools not flagged', L, "const tools = items.filter(t => !PLAIN_ITEMS.has(t));", "const tools = [];"),
 ('fence: later requests ignored', L, "if (!notShown || !noLater) return", "if (!notShown) return"),
 ('fence: out at Stop not required', L, "if (!stopped || !recorded || !outAtStop || !settledAfterStop)", "if (!stopped || !recorded || !settledAfterStop)"),
 ('fence: settling after Stop not required', L, "if (!stopped || !recorded || !outAtStop || !settledAfterStop)", "if (!stopped || !recorded || !outAtStop)"),
 ('fence: actual card ignored', L, "const notShown = slot.shown !== true && slot.presentation !== 'shown' && cardClean;", "const notShown = slot.shown !== true && slot.presentation !== 'shown';"),
 ('fence: user Stop not required', L, "const stopped = !!ended && ended.reason === 'stopped by you';", "const stopped = !!ended;"),
 ('ledger: extra focus not detected', L, "...focus.slice(1).map(q => q.request_id), ", ""),
 ('ledger: extra typed not detected', L, ", ...typed.slice(2).map(q => q.request_id)]", "]"),
 ('ledger: slot 1 from a failed live_policy', L, "starts > 0 || policy?.ok === true", "starts > 0 || !!policy"),
 ('ledger: failed trigger not named', L, "const failed = triggers[k] && triggers[k].ok === false;", "const failed = false;"),
 ('ledger: app count not cross-checked', L, "used <= 4 && unwritten === 0 && (appUsed < 0 || appUsed <= submittedSlots + extra.length)", "used <= 4"),
 ('ledger: spoken requests pass as silent', L, "all_silent: slots.every(s => !s.asked_as || (s.asked_as === 'silent' && !s.spoken)),", "all_silent: true,"),
 ('ledger: restart via not_started ignored', L, "restarted: starts + refusedStarts.length > 1,", "restarted: starts > 1,"),
 ('evidence: earlier AI text not excluded in action 3', L, "pixelEvidence(a3, { now: after, before, earlierText: [...lookText, a2] })", "pixelEvidence(a3, { now: after })"),
 ('evidence: formatted numbers not read', L, ".replace(/(?<!\\d)(\\d)[,\\u00a0\\u202f ](\\d{3})(?!\\d)/g, '$1$2')", ""),
 ('wrapper: connector admission skipped', W, "  const connector = connectorAdmission(io, checks);\n", "  const connector = null;\n"),
 ('wrapper: connector release not required', W, "    connector_released: (report.connector_left_running ?? ['?']).length === 0 && report.connector_watch?.state === 'released',", "    connector_released: true,"),
 ('wrapper: whole picture not required', W, "    whole_picture_at_provider: slots.slice(0, 3).every(s => s.transport?.verdict === 'whole picture at the provider boundary' && s.transport.non_plain_items.length === 0),", "    whole_picture_at_provider: true,"),
 ('wrapper: question leaks not required', W, "    no_value_in_questions: (report.evidence?.leaks_in_questions ?? ['?']).length === 0,", "    no_value_in_questions: true,"),
 ('wrapper: exclusive display not required', W, "|| record.exclusive_display !== true", ""),
 ('wrapper: script permission not required', W, "      || typeof record.script_permission_ref !== 'string' || record.script_permission_ref.length < 8 || AI_DISABLED_APPROVALS.includes(record.script_permission_ref)", ""),
 ('wrapper: AI-disabled approvals accepted', W, "record.command_approval_ref.length < 8 || AI_DISABLED_APPROVALS.includes(record.command_approval_ref)", "record.command_approval_ref.length < 8"),
 ('wrapper: any native bound accepted (D6)', W, "|| record.native_bound_ms !== candidate.native_bound_ms ", "|| false "),
 ('L1: included-use veto restored', G, "if (windows.some(b => b.spend_control_reached === true))", "if (windows.some(b => b.spend_control_reached === true || b.rate_limit_reached_type) || (q && q.ordinary_usage_allowed === false))"),
 ('L1: spend control ignored', G, "if (windows.some(b => b.spend_control_reached === true))", "if (false)"),
 ('L2: a reached Start not counted', L, "const startReached = !!start && !startNeverRan && refusedStarts.length === 0;", "const startReached = false;"),
 ('L2: refused admission counted as reached', L, "const startNeverRan = admissions.some(v => v.phase === 'before_capture_start' && v.accepted === false);", "const startNeverRan = false;"),
 ('L2: not_started counted as reached', L, "const startReached = !!start && !startNeverRan && refusedStarts.length === 0;", "const startReached = !!start && !startNeverRan;"),
 ('D8: thread id kept in sanitized receipts', W, "const RECEIPT_FIELDS = ['request_id',", "const RECEIPT_FIELDS = ['thread_id', 'request_id',"),
 ('D8: raw receipts inside the repository', W, "export const rawReceiptsRoot = '/home/agentsdock/.local/state/lc-qa-live';", "export const rawReceiptsRoot = '/home/agentsdock/Projects/learning-companion/wt-review/docs/verification/qa/raw';"),
 ('D8: allowlist admits everything', W, "if (io.statSync(full).isDirectory()) walk(full, r);\n    else if (", "if (io.statSync(full).isDirectory()) walk(full, r);\n    else if (true || "),
 ('wrapper: missing watch end counted released', W, "if (!end) return { state: 'unknown', appeared, note: 'the watch did not record its end' };", "if (!end) return { state: 'released', appeared };"),
 ('wrapper: askPathCheck refusal dropped', W, "if (!ask.ok || !livePath.ok)", "if (!livePath.ok)"),
]
def run(m):
    name,f,a,b=m
    d=tempfile.mkdtemp(prefix='qa-livemut-')
    for sub in ['tests/e2e/windows','docs/verification/qa/p0-13-tts-52be105','docs/verification/qa/p0-13-live-1755153','docs/verification/qa/p0-13-live-52be105']:
        shutil.copytree(os.path.join(WT,sub),os.path.join(d,sub),ignore=shutil.ignore_patterns('execution-*'))
    p=os.path.join(d,f); s=open(p).read()
    if s.count(a)!=1: shutil.rmtree(d); return (name,f'BAD MUTANT ({s.count(a)})',[])
    open(p,'w').write(s.replace(a,b))
    g=subprocess.run([NODE,'--permission','--allow-fs-read='+d,'--allow-fs-read=/mnt/c/Users/ROG/AppData/Local/Temp/lc-qa-live-nonvoice-*','tests/e2e/windows/test_qa_live_candidate.mjs'],capture_output=True,text=True,cwd=d)
    fails=sorted({re.sub(r' \([\d.]+ms\)$','',l[2:]) for l in g.stdout.splitlines() if l.startswith('✖') and 'failing tests' not in l})
    pinned = f in (L, G)   # the candidate pins the ledger and generator, so its pinned-candidate checks fail on any change; the wrapper is pinned by the allocation instead
    beyond=[x for x in fails if not pinned or ('still refuses at the connector checks' not in x and 'the candidate is offline-only' not in x)]
    shutil.rmtree(d)
    return (name,'CAUGHT' if beyond else ('PIN ONLY' if fails else 'SURVIVED'),beyond)
with ThreadPoolExecutor(6) as ex: res=list(ex.map(run,M))
for n,v,b in res:
    print(f'{n}: {v}')
    for x in b[:2]: print('    -',x[:140])
print(f"\n{sum(v=='CAUGHT' for _,v,_ in res)}/{len(res)} caught by a test other than the pinned-candidate checks")
