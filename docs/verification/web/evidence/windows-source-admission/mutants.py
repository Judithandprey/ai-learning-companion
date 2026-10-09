# Mutation check of the source-admission interlock: each entry is ONE small change to a source file that removes a
# guarantee; the listed tests must notice it (KILLED). Run in a SCRATCH copy of apps/windows (with src, tests,
# package.json, tsconfig.json, node_modules, and ../safari-extension/src beside it):
#   LC_MUT_ROOT=<scratch>/apps/windows python3 mutants.py [from to]
# The scratch sources are rewritten and restored; never point this at a worktree.
import subprocess, sys, signal, os
signal.signal(signal.SIGTERM, lambda *a: sys.exit(1))
os.chdir(os.environ['LC_MUT_ROOT'])
M='src/main/main.ts'; C='src/main/source-admission.ts'; O='src/renderer/overlay.ts'
T='tests/source-admission.test.ts tests/app-admission.test.ts tests/overlay-frames.test.ts'
LAX='[...s.admission.admitted.values()].at(-1) ?? null'
MUT=[
 # ---- main: gating, binding, lifecycle
 ('latest-after-gate', M, [("  live.latest = frame;\n  live.out += 1;\n  notifyLive(s);\n  // (with the test's", "  live.out += 1;\n  notifyLive(s);\n  // (with the test's"), ("  gated();\n  const out = held ?? (await subscription!.turn(t));", "  gated();\n  if (!held) live.latest = frame;\n  const out = held ?? (await subscription!.turn(t));")]),
 ('no-latch-before-cancel', M, [("  if (!d.ok && !d.local && current === s && !s.ending) violate(s, d.reason);\n", "")]),
 ('cool-before-gate', M, [("  const out = await sendTurn(s, live, t, frame, () => true, cool);", "  cool();\n  const out = await sendTurn(s, live, t, frame);")]),
 ('record-unasked', M, [("  if (!d.ok && !d.written) return { ok: false, reason: d.reason, local: false };\n", "")]),
 ('checker-end-always', M, [("(x.spawned || s.admission!.recorded > 0 ? recordAdmission(", "(true ? recordAdmission(")]),
 ('retain-no-source', M, [("  const source = sourceOf(s, f.frame_seq, f.raw['pixels_sha256'], width, height);", "  const source = s.admission ? (" + LAX + ") : 'none';")]),
 ('followup-no-source', M, [("  const source = sourceOf(s, factsValue['frame_seq'], factsValue['raw_sha256'], factsValue['frame_width'], factsValue['frame_height']);", "  const source = s.admission ? (" + LAX + ") : 'none';")]),
 ('followup-circle-source', M, [("  const source = sourceOf(s, factsValue['frame_seq'], factsValue['raw_sha256'], factsValue['frame_width'], factsValue['frame_height']);", "  const source = s.admission ? (s.ask?.frame.source ?? null) : 'none';")]),
 ('circle-no-source', M, [("  const source = sourceOf(s, f['frame_seq'], f['raw_sha256'], f['frame_width'], f['frame_height']);\n  if (source === null) return { ok: false, reason: 'its frame was not admitted", "  const source = s.admission ? (" + LAX + ") : 'none';\n  if (source === null) return { ok: false, reason: 'its frame was not admitted")]),
 ('look-no-source', M, [("  const source = sourceOf(s, f['frame_seq'], f['raw_sha256'], f['frame_width'], f['frame_height']);\n  if (source === null) return { ok: false }; // (the capture ends)", "  const source = s.admission ? (" + LAX + ") : 'none';\n  if (source === null) return { ok: false };")]),
 ('send-no-source-check', M, [("  if (!src || src.capture_id !== s.retention.id) {", "  if (false) {")]),
 ('send-no-recheck', M, [("  if (current !== s || s.ending || !going()) return { status: 'cancelled', uncertain: false, unsettled: false, submission: 'not_submitted' };", "")]),
 ('send-no-wanted', M, [("  void sendTurn(s, live, t, frame, () => mine.state === 'asking').then((out) => {", "  void sendTurn(s, live, t, frame).then((out) => {")]),
 ('admit-ignores-still', M, [("  const holds = (): boolean => current === s && !s.ending && a.violation === null && still();", "  const holds = (): boolean => current === s && !s.ending && a.violation === null;")]),
 ('ticket-after-await', M, [("  const t = a.ticket;\n  a.ticket = null; // one use, whatever comes of it", "  const t = a.ticket;"), ("  a.admitted.set(sampleSeq, taken);", "  a.ticket = null;\n  a.admitted.set(sampleSeq, taken);")]),
 ('ticket-value-ignored', M, [(" || f['ticket'] !== t.ticket", "")]),
 ('ticket-sample-ignored', M, [("  if (!t || t.sample_seq !== sampleSeq || !isObj(f)", "  if (!t || !isObj(f)")]),
 ('post-no-recheck', M, [("  if (current !== s || s.ending) return { ok: false };\n  if (!d.ok) {\n    if (!d.local) violate(s, d.reason);\n    return { ok: false };\n  }\n  a.admitted.set", "  if (!d.ok) {\n    if (!d.local) violate(s, d.reason);\n    return { ok: false };\n  }\n  a.admitted.set")]),
 ('no-violate-post', M, [("  if (!d.ok) {\n    if (!d.local) violate(s, d.reason);\n    return { ok: false };\n  }\n  a.admitted.set", "  if (!d.ok) {\n    return { ok: false };\n  }\n  a.admitted.set")]),
 ('no-violate-arm', M, [("    if (!d.ok) {\n      violate(s, d.reason);\n      return false;\n    }\n    a.armed = true;", "    if (!d.ok) return false;\n    a.armed = true;")]),
 ('violation-ends-ai-only', M, [("  if (current === s && !s.ending) end(`the test's source check ended the capture: ${a.violation}`);", "  if (current === s && !s.ending && s.live) endLive(s, s.live, a.violation);")]),
 ('sourceOf-ignores-width', M, [("got.raw_sha256 === rawSha && got.width === width && got.height === height", "got.raw_sha256 === rawSha && got.height === height")]),
 ('sourceOf-ignores-height', M, [("got.raw_sha256 === rawSha && got.width === width && got.height === height", "got.raw_sha256 === rawSha && got.width === width")]),
 ('sourceOf-ignores-hash', M, [("got.raw_sha256 === rawSha && got.width === width && got.height === height", "got.width === width && got.height === height")]),
 ('arm-without-overlay', M, [(", overlay: a.overlay })) : { ok: false as const", " })) : { ok: false as const")]),
 ('info-active-while-ending', M, [("active: current === s && !s.ending && a.armed && a.violation === null", "active: current === s && a.armed && a.violation === null")]),
 ('quit-not-waiting', M, [("  if ((!link && !subscription && !voice && openCheckers.size === 0) || linkQuitDone) return;", "  if ((!link && !subscription && !voice) || linkQuitDone) return;"), (", endVoice(), ...[...openCheckers].map((c) => c.close())])", ", endVoice()])")]),
 ('finish-not-closing', M, [("  if (s.admission) void s.admission.checker.close().then(", "  if (false) void s.admission.checker.close().then(")]),
 ('torn-record-kept', M, [("    if (size > a.recordBytes) truncateSync(file, a.recordBytes); // a torn line: only whole lines are kept\n", "")]),
 ('start-not-refused', M, [("  if (admissionSetting && 'error' in admissionSetting) return { ok: false, reason: `${admissionSetting.error}, so nothing is captured` };\n", "")]),
 # ---- the checker client
 ('echo-order-sensitive', C, [("canonical(v[k]) !== canonical(w.request[k])", "JSON.stringify(v[k]) !== JSON.stringify(w.request[k])")]),
 ('echo-overlay-unchecked', C, [("'display', 'overlay', 'sample_seq'", "'display', 'sample_seq'")]),
 ('echo-seq-unchecked', C, [("const ECHOED = ['format', 'id', 'seq', 'phase',", "const ECHOED = ['format', 'id', 'phase',")]),
 ('utf8-lenient', C, [("new TextDecoder('utf-8', { fatal: true })", "new TextDecoder('utf-8')")]),
 ('enoent-waited', C, [("if (!proc || !exited || proc.pid === undefined) return", "if (!proc || !exited) return")]),
 ('open-after-close', C, [("this.opened ??= this.closing ? Promise.resolve(this.failedWith) : this.start();", "this.opened ??= this.start();")]),
 ('exit-not-failure', C, [("    void this.exited.then(() => this.fail('the source check ended'));\n", "")]),
 ('eof-not-failure', C, [("    proc.stdout.once('end', () => this.fail('the source check closed its output'));\n", "")]),
 ('replay-not-detected', C, [("    if (typeof v['id'] === 'string' && this.answered.has(v['id'])) return this.fail('the source check answered a request again');\n", "")]),
 ('ready-not-required', C, [("      if (!isObj(v) || !sameKeys(v, ['format', 'ready']) || v['format'] !== ADMISSION_FORMAT || v['ready'] !== true) return this.fail('the source check did not begin with its ready line');\n      return this.readied(null);", "      return this.readied(null);")]),
 ('no-decision-bound', C, [("      const timer = setTimeout(() => this.fail(`the source check did not answer within ${this.o.config.decision_ms} ms`), this.o.config.decision_ms);", "      const timer = setTimeout(() => undefined, this.o.config.decision_ms);")]),
 ('queue-unbounded', C, [("    if (this.queued >= QUEUED_MAX) {", "    if (false) {")]),
 ('told-after-close', C, [("      if (!this.closing) this.onFailure?.(this.failedWith!);", "      this.onFailure?.(this.failedWith!);"), ("    if (this.told || this.closing) return;", "    if (this.told) return;")]),
 ('killed-without-grace', C, [("    let exit = await within(this.o.endMs ?? END_MS);", "    let exit = null as null | { code: number | null; signal: string | null };")]),
 ('config-relative-command', C, [("|| !isAbsolutePath(c['command'])", "")]),
 ('config-extra-keys', C, [("!sameKeys(v, ['format', 'checker', 'ready_ms', 'decision_ms'])", "!['format', 'checker', 'ready_ms', 'decision_ms'].every((k) => k in v)")]),
 # ---- the overlay
 ('no-pre-check', O, [("    if (admission) {\n      const pre = await lc.admitFrame('pre', mySeq, null)", "    if (false) {\n      const pre = await lc.admitFrame('pre', mySeq, null)")]),
 ('publish-on-denied-post', O, [("      if (!post.ok || ended) return void bitmap.close();", "      if (ended) return void bitmap.close();")]),
 ('no-ended-check-after-post', O, [("      if (!post.ok || ended) return void bitmap.close();", "      if (!post.ok) return void bitmap.close();")]),
 ('hash-of-previous-frame', O, [("        sha = await pixelsSha(bitmap);", "        sha = await pixelsSha(raw?.bitmap ?? bitmap);")]),
 ('stale-presented-facts', O, [("      newFrame ||= presented > presentedNow;\n      presentedNow = presented;\n      presentedAtNow = presentedAt;\n      presentedSeen = presented;\n", "")]),
 ('pen-down-by-sample-number', O, [("    const sampledAfter = admission ? grabbedSeq : seq;", "    const sampledAfter = seq;")]),
 ('hash-failure-leaks', O, [("        bitmap.close(); // (never held: closed here)\n", "")]),
]
only=sys.argv[1:]
lo,hi=(int(only[0]),int(only[1])) if len(only)==2 and only[0].isdigit() else (0,len(MUT))
if only and only[0]=='count': print(len(MUT)); sys.exit(0)
for name,f,pairs in MUT[lo:hi]:
    src=open(f).read(); m=src; bad=False
    for a,b in pairs:
        if m.count(a)!=1: print(name,'PATTERN',m.count(a),a[:70]); bad=True; break
        m=m.replace(a,b)
    if bad: continue
    open(f,'w').write(m)
    try:
        r=subprocess.run(['timeout','120','node','--test']+T.split(),capture_output=True,text=True)
        print(name,'KILLED' if r.returncode else 'SURVIVED', flush=True)
    finally:
        open(f,'w').write(src)
