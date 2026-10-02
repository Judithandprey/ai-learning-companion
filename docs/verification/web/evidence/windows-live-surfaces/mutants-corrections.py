# Mutation check of the corrections to 9622b51 (WIN-LIVE-01..04 and their review's findings).
# Each entry is ONE small change to a source file; the listed test files must notice it (KILLED).
# Run in a SCRATCH copy of apps/windows (src, tests, package.json, tsconfig.json, node_modules):
#   LC_MUT_ROOT=<scratch>/apps/windows python3 mutants-corrections.py [from to]
# The scratch sources are rewritten and restored; never point this at a worktree.
import subprocess, sys, signal, os
signal.signal(signal.SIGTERM, lambda *a: sys.exit(1))
os.chdir(os.environ['LC_MUT_ROOT'])
M='src/main/main.ts'; O='src/renderer/overlay.ts'; P='src/shared/placement.ts'
T='tests/app-live.test.ts tests/app-ask.test.ts tests/overlay-surfaces.test.ts tests/placement.test.ts tests/overlay-frames.test.ts'
MUT=[
 # ---- WIN-LIVE-01: nothing queued is shown, or sent, after a Stop or a new Start of the AI
 ('gate-always-ok', M, [("  if (reason === null) return { ok: true };\n  if (entry.shown)", "  if (true) return { ok: true };\n  if (entry.shown)")]),
 ('gate-ignores-session', M, [("!s.live || s.live.id !== entry.live_session_id || s.live.ended !== null ? 'the AI was stopped", "!s.live || s.live.ended !== null ? 'the AI was stopped")]),
 ('gate-ignores-ended', M, [("!s.live || s.live.id !== entry.live_session_id || s.live.ended !== null ? 'the AI was stopped", "!s.live || s.live.id !== entry.live_session_id ? 'the AI was stopped")]),
 ('gate-ignores-capture-ending', M, [("  const reason = s.ending ? 'the capture was ending before it was shown'\n    : ", "  const reason = ")]),
 ('gate-ignores-newer-request', M, [("    : sel.request?.id !== requestId ? 'a newer request was made from this card before it was shown' : null;", "    : null;")]),
 ('gate-keeps-text', M, [("  if (entry.shown) return { ok: false, reason }; // (already shown: it stays what it is)\n  notShown(entry);", "  if (entry.shown) return { ok: false, reason }; // (already shown: it stays what it is)")]),
 ('gate-unshows-shown', M, [("  if (entry.shown) return { ok: false, reason }; // (already shown: it stays what it is)\n", "")]),
 ('gate-save-state-dropped', M, [("  return { ok: false, reason, saved: unwritten === null, unsaved: unwritten };", "  return { ok: false, reason };")]),
 ('gate-any-sender', M, [("(fromOverlay(e) && current ? askPresentable(current, selectionId, requestId)", "(current ? askPresentable(current, selectionId, requestId)")]),
 ('page-skips-gate', O, [("  if (answered && a.selection && !a.cancelling && !ended) {\n    const may", "  if (false) {\n    const may")]),
 ('page-ignores-fence', O, [("  const stopped = liveFence !== fence;", "  const stopped = false;")]),
 ('page-fence-on-every-message', O, [("  if (next.state !== 'on' && next.state !== 'used_up') liveFence += 1;", "  liveFence += 1;")]),
 ('page-fence-never', O, [("  if (next.state !== 'on' && next.state !== 'used_up') liveFence += 1;", "")]),
 ('page-says-shown-after-fence', O, [("void lc.askPresented(a.selection, request, !suppressed)", "void lc.askPresented(a.selection, request, true)")]),
 ('page-refused-said-as-cancelled', O, [("    text = unshown !== null ? `Not shown: ${unshown}.", "    text = false ? `Not shown: ${unshown}.")]),
 ('page-ignores-refusal', O, [("    if (!may.ok) {\n      refused = may.reason;", "    if (false) {\n      refused = may.reason;")]),
 ('page-refusal-save-state-ignored', O, [("      if (may.saved !== undefined) record = { saved: may.saved, reason: may.unsaved ?? null };\n", "")]),
 ('page-card-gone-still-shown', O, [("    if (asked !== a) return; // its card went meanwhile: the main process keeps it as not shown\n", "")]),
 ('session-any', M, [("=> (typeof during === 'string' ? during : null) !== (s.live && s.live.ended === null ? s.live.id : null);", "=> false;")]),
 ('circle-asked-in-another-session', M, [("  const request: Submitted = notSendable(s) === null && otherSession(s, during) ? ", "  const request: Submitted = false ? ")]),
 ('followup-sent-in-another-session', M, [("  if (otherSession(s, during)) return { ok: false, reason: 'the AI was started or started again after you pressed Send", "  if (false) return { ok: false, reason: 'the AI was started or started again after you pressed Send")]),
 ('page-circle-session-at-send', O, [("    kept = await lc.askSelection(facts, png, whole.ink, during);", "    kept = await lc.askSelection(facts, png, whole.ink, sessionNow());")]),
 ('page-followup-session-at-send', O, [("whole.facts, png, whole.ink, during);", "whole.facts, png, whole.ink, sessionNow());")]),
 # ---- WIN-LIVE-02: the first look after a Start
 ('look-takes-before-start', M, [("  if (f['live_session_id'] !== live.id || Date.parse(at) < live.since) return { ok: false, retry: true }; // from before the Start: never taken as its first look\n", "")]),
 ('look-ignores-looked', M, [("  if (live.looked || live.paused !== null) return { ok: true };", "  if (live.paused !== null) return { ok: true };")]),
 ('look-owed-by-any-frame', M, [("  if (live.looked || live.paused !== null) return { ok: true };", "  if (live.frames > 0 || live.paused !== null) return { ok: true };")]),
 ('look-ignores-paused', M, [("  if (live.looked || live.paused !== null) return { ok: true };", "  if (live.looked) return { ok: true };")]),
 ('look-never-marked', M, [("  live.looked = true;\n", "")]),
 ('look-any-sender', M, [("(fromOverlay(e) && current ? lookFrame(current, facts, png, ink ?? null)", "(current ? lookFrame(current, facts, png, ink ?? null)")]),
 ('look-after-session-end', M, [("  if (!subscription || !live || live.ended !== null || s.ending) return { ok: false };\n  if (live.looked", "  if (!subscription || !live || s.ending) return { ok: false };\n  if (live.looked")]),
 ('look-stored-elsewhere', M, [("  const file = `frames/${image.sha256}.png`;", "  const file = `asks/${image.sha256}.png`;")]),
 ('look-not-stored', M, [("  if (unstored !== null) return missed(`its first picture could not be kept", "  if (false) return missed(`its first picture could not be kept")]),
 ('look-storage-retried', M, [("  if (unstored !== null) return missed(`its first picture could not be kept", "  if (unstored !== null) return { ok: false, retry: true };\n  if (false) return missed(`its first picture could not be kept")]),
 ('look-not-named-in-record', M, [("  appendLive(s, live, { kind: 'first_picture',", "  if (false) appendLive(s, live, { kind: 'first_picture',")]),
 ('look-stream-facts-optional', M, [(" || typeof f['stream_new_frame'] !== 'boolean' || !(f['stream_frame_age_ms'] === null || isMs(f['stream_frame_age_ms']))", "")]),
 ('look-malformed-silent', M, [("  const missed = (reason: string): { ok: false } => {\n    live.missed = reason;", "  const missed = (reason: string): { ok: false } => {")]),
 ('info-without-since', M, [("since: new Date(l.since).toISOString(), model: l.model,", "model: l.model,")]),
 ('page-never-regrabs', O, [("(newFrame || !raw || (lookOwed() !== null && (raw.liveSession !== sessionNow() || Date.parse(raw.at) < Date.parse(lookOwed()!))))", "(newFrame || !raw)")]),
 ('page-offers-old-picture', O, [("  if (since === null || held.liveSession !== sessionNow() || Date.parse(held.at) < Date.parse(since)) return;", "  if (since === null) return;")]),
 ('page-offers-kept-frame', O, [("  if (kept) return void (lookGiven = session);\n", "")]),
 ('page-offers-every-sample', O, [("      if (!r.retry) lookGiven = session;", "")]),
 ('page-gives-up-on-retry', O, [("      if (!r.retry) lookGiven = session;", "      lookGiven = session;")]),
 ('page-tries-without-end', O, [("    if (lookTries.session !== session || (lookTries.failed += 1) < LOOK_TRIES) return;", "    return;")]),
 ('page-gives-up-at-once', O, [("const LOOK_TRIES = 3;", "const LOOK_TRIES = 1;")]),
 ('page-gives-up-silently', O, [("    lookNote = `Its first picture of this display could not be made (${why(error)}): it looks when the display changes.`;", "    lookNote = '';")]),
 ('page-note-stays', O, [("  const note = lookNote && lookTries.session === live.id && live.seen === null ? ` ${lookNote}` : '';", "  const note = lookNote ? ` ${lookNote}` : '';")]),
 ('page-stream-fact-wrong', O, [("stream_new_frame: newFrame,", "stream_new_frame: true,")]),
 ('page-offer-while-one-is-out', O, [("live.state === 'on' && !lookOut && live.id !== lookGiven ? live.since : null", "live.state === 'on' && live.id !== lookGiven ? live.since : null")]),
 # ---- WIN-LIVE-03/04: the card's room, and the response kept in view
 ('room-is-the-area', P, [("  return usable(upDown) ? upDown : usable(beside) ? beside : area;", "  return area;")]),
 ('room-above-when-equal', P, [("  const upDown = above.height > below.height ? above : below;", "  const upDown = above.height >= below.height ? above : below;")]),
 ('room-no-gap', P, [("export const SURFACE_GAP = 6;", "export const SURFACE_GAP = 0;")]),
 ('room-any-size', P, [("  const usable = (r: Rect): boolean => r.width >= ROOM_MIN.width && r.height >= ROOM_MIN.height;", "  const usable = (r: Rect): boolean => true;")]),
 ('room-beside-first', P, [("  return usable(upDown) ? upDown : usable(beside) ? beside : area;", "  return usable(beside) ? beside : usable(upDown) ? upDown : area;")]),
 ('room-follows-every-line', O, [("  room = steadyRoom(room, roomBeside(area, { x: t.left, y: t.top, width: t.width, height: t.height }));", "  room = roomBeside(area, { x: t.left, y: t.top, width: t.width, height: t.height });")]),
 ('room-slack-small', P, [("export const ROOM_SLACK = 48;", "export const ROOM_SLACK = 8;")]),
 ('room-never-grows-back', P, [("  return grewAtTop || grewAtBottom ? was : next;", "  return next.y + next.height === was.y + was.height && next.y < was.y ? was : grewAtBottom ? was : next;")]),
 ('fit-not-on-toolbar-move', O, [("  if (name === 'toolbar') fitCard();\n", "")]),
 ('fit-not-on-area', O, [("  fitCard(true);\n}\nfunction applyPlace", "}\nfunction applyPlace")]),
 ('fit-not-on-toolbar-size', O, [("new ResizeObserver(() => fitCard()).observe(surfaces.toolbar.el);\n", "")]),
 ('fit-not-on-window-size', O, [("window.addEventListener('resize', () => fitCard(true));\n", "")]),
 ('card-moves-in-the-area', O, [("  const within = name === 'caption' ? room : area;", "  const within = area;")]),
 ('card-place-rewritten-y', O, [("fy: within.height > box.height ? to.fy : s.place.fy };", "fy: to.fy };")]),
 ('card-place-rewritten-x', O, [("  s.place = { fx: within.width > box.width ? to.fx : s.place.fx,", "  s.place = { fx: to.fx,")]),
 ('reveal-when-nothing-changed', O, [("  if (fit === fitted) return;\n", "")]),
 ('reveal-never', O, [("  if (!$('card').hidden && !$('answerBox').hidden && (display || speaking !== null)) $('answerBox').scrollIntoView({ block: 'start' });\n", "")]),
 ('reveal-on-toolbar-change', O, [("&& (display || speaking !== null)) $('answerBox')", "&& true) $('answerBox')")]),
 ('reveal-not-while-read', O, [("&& (display || speaking !== null)) $('answerBox')", "&& display) $('answerBox')")]),
 ('reveal-not-on-display', O, [("&& (display || speaking !== null)) $('answerBox')", "&& speaking !== null) $('answerBox')")]),
 ('reveal-without-answer', O, [("  if (!$('card').hidden && !$('answerBox').hidden && (display", "  if (!$('card').hidden && (display")]),
 ('window-size-not-display', O, [("window.addEventListener('resize', () => fitCard(true));", "window.addEventListener('resize', () => fitCard());")]),
 ('area-not-display', O, [("  fitCard(true);\n}\nfunction applyPlace", "  fitCard();\n}\nfunction applyPlace")]),
 ('tight-never', O, [("  document.documentElement.classList.toggle('tight', area.width < TIGHT.width || area.height < TIGHT.height);\n", "")]),
 ('tight-always', O, [("classList.toggle('tight', area.width < TIGHT.width || area.height < TIGHT.height);", "classList.toggle('tight', true);")]),
 ('unsaved-ink-not-first', O, [("[unsaved !== null ? saveText : '', transientHint || modeText, captureText(), liveText(), talkText, unsaved !== null ? '' : saveText,", "[transientHint || modeText, captureText(), liveText(), talkText, saveText,")]),
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
        r=subprocess.run(['timeout','90','node','--test']+T.split(),capture_output=True,text=True)
        print(name,'KILLED' if r.returncode else 'SURVIVED', flush=True)
    finally:
        open(f,'w').write(src)
