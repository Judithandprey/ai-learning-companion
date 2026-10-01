// node --test tests/e2e/windows/sub_changed_app.test.mjs   (no Windows, no display, no account, no network, no Codex; about 3 s)
// The changed paths QA-SUB-01 (a frame replaced while a selection's picture is encoded), QA-SUB-04 (a question that is
// not valid Unicode) and QA-SUB-08 (an answer that may have been seen), on the released source and, as the negative
// control of each, on the candidate they were found on. Every check says what was observed, old -> new.
//
// THREE COMMITS (sub_tree.mjs):
//   RELEASED       c44e620  the source under test.
//   FIRST_RELEASE  8eac9fc  the first combined correction. RELEASED is it plus the Windows lifecycle follow-up.
//   BEFORE         3e4b406  the candidate QA-SUB-01 to 08 were found on: the negative control of every correction.
// Between FIRST_RELEASE and RELEASED, of everything this file runs, ONE file differs: src/main/subscription.ts.
// main.ts, overlay.ts, src/shared/*.ts, the owner's harness files and the two sibling files are the same blobs on both
// (the first test compares every blob id of the app and names the three files that differ; the other two are the
// owner's own tests app-ask.test.ts and subscription.test.ts, which are not run here). Of what changed in
// subscription.ts, one path is reached from a card: a question the connector ends as "cancelled" by itself. That one
// is shown on all three commits (before / first_release / released). Everything else here is shown on RELEASED, with
// BEFORE as its control and no third column; that it is the same on FIRST_RELEASE rests on the equal blobs, and on no
// other step of this file observing a behaviour those lines changed (the lines themselves do run: the status is built
// at every notification and each connector is ended at the end). That is read, not asserted here; it was
// checked once outside this file, by running it with FIRST_RELEASE's source in RELEASED's place: the first test and the
// three-commit test failed, the other 19 passed.
//
// WHAT IS REAL. The product source of the commits, as committed and run as written (Node strips the types):
// apps/windows/src/renderer/overlay.ts, src/main/main.ts, src/main/subscription.ts (with capture-host.ts, which starts
// and ends its connector; the owner's harness also loads capture-link.ts) and src/shared/*.ts, with the two
// files they import from the sibling app (apps/safari-extension/src/ink.ts and mode.ts). The first test compares every
// file that is run with the commit's own blob id.
//
// WHAT IS A STAND-IN. Everything around that source is the OWNER's offline test double, taken from the same commit
// (apps/windows/tests/main-harness.ts, overlay-page.ts, subscription-fakes.ts, png.ts, source.ts):
//   - Electron is fake: main.ts runs in a node:vm with fake windows, a fake ipcMain and a fake app; its timers are
//     collected and run only when a test fires them (so the 10 s Stop bound is never waited in real time). overlay.ts
//     runs in a second vm with fake DOM nodes; its start-up lines are cut out and its sampler runs only when a test
//     asks for a sample.
//   - There is no IPC and no preload: the page's `lc` calls main.ts's handlers directly. What the owner's page double
//     copies on the way, of the ASK calls: a selection's facts and each answer of the main process go through JSON, the
//     PNG and ink bytes are copied as bytes, and what the main process sends to the overlay (lc:ask-result) goes
//     through JSON. The QUESTION handed to lc:ask-submit is passed as it is, not copied: whether a lone surrogate would
//     cross Electron's real IPC unchanged is not shown by this. Where a test hands a report or a question to a handler
//     of main.ts itself, as from the overlay, it says so.
//   - Canvas and bitmaps are fake: a "frame" is a small object with a size and a shade whose close() sets its size
//     to 0, and a "PNG" is a real PNG file of one flat shade. `encoding.gate` holds every PNG encoding until a test
//     lets it go; that is how a frame is replaced "during" an encoding here, and (rejected) how an encoding "fails".
//   - The connector is fake (FakeConnector): no Codex, no ChatGPT, no sign-in; every "answer" is text of this file.
//   - The user's presses are calls: a card button's click handler, a pointer event handed to the ink canvas, and the
//     control window's lc:sub-check, lc:session-state and lc:stop handlers called as from the control window (Stop is
//     the app's own lc:stop, so its reason reads "stopped by the user"). A lost renderer is the event
//     render-process-gone emitted on the fake overlay window.
//   - One check (a PNG encoding that fails) runs in a child process of this file: plain `node`, the same tree, the same
//     owner's harness. Its outcome is a promise rejection nothing handles, which is counted there.
//
// FOUR TREES, each a copy made for this run under the system's temporary folder and removed when the process ends
// (also when a tree could not be loaded):
//   released       the whole of RELEASED: its source in its own harness.
//   first_release  the whole of FIRST_RELEASE: its source in its own harness (the three-commit check only).
//   before         the whole of BEFORE: its source in its own harness (QA-SUB-04 and QA-SUB-08 controls, QA-SUB-01 again).
//   mixed          RELEASED with only src/renderer/overlay.ts taken from BEFORE (the QA-SUB-01 control): the old
//                  overlay against the released main.ts in the released harness, whose bitmaps cannot be drawn once closed.
// sub_tree.mjs exports the commit's apps/windows, services, packages and pyproject.toml. The owner's harness also
// imports two files of apps/safari-extension/src, which that export does not hold: those two are read from the same
// commit with `git show`.
//
// NOT SHOWN by this file:
//   - Chromium: ImageBitmap and OffscreenCanvas, a real PNG encoder (and whether it ever fails), real IPC and the
//     preload, a real window, a real display, anything a user sees. overlay.html and control.ts are not run: the card
//     is read as the text and the hidden flags of fake nodes, the control window as what lc:session-state returns.
//   - The real connector, Codex, ChatGPT, a sign-in, a network. Whether the released connector ever answers a question
//     as "cancelled" by itself is not shown: the stand-in is told to.
//   - The rest of the lifecycle follow-up in subscription.ts: the 10 s default bound of a connector's end (this file
//     passes its own 500 ms bound and its stand-in ends at once), a connector kept as "did not end by itself in
//     time", and the two changed wordings of a sign-in. No step of this file reaches them.
//   - FIRST_RELEASE outside the three-commit check (see above), and QA-SUB-02, 03, 05, 06 and 07 (other files).
//   - Time: no bound is waited for in real time; a Stop "at the app's bound" is main.ts's own timer run by the test.
//
// QA_EVIDENCE=<existing folder> writes sub_changed_app.json there (sub_tree.mjs: nothing of a run with a failed test).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, afterEach, test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { BEFORE, FIRST_RELEASE, RELEASED, REPO, evidence, exportTree } from './sub_tree.mjs';

const WIN = 'apps/windows';
const SIBLINGS = ['apps/safari-extension/src/ink.ts', 'apps/safari-extension/src/mode.ts'];
const OVERLAY = `${WIN}/src/renderer/overlay.ts`;
const COMMITS = { released: RELEASED, first_release: FIRST_RELEASE, before: BEFORE };
/** A time limit for every test: a regression fails instead of hanging (the whole file takes about 3 s). */
const LIMIT = { timeout: 30_000 };
const ROOT = mkdtempSync(join(tmpdir(), 'lc-qa-sub-app-'));
const git = (...args) => execFileSync('git', ['-C', REPO, ...args], { maxBuffer: 1 << 28 });
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** As plain data of this file (values that come out of the harness's vm have that vm's prototypes). */
const plain = (v) => JSON.parse(JSON.stringify(v));

// What each test saw, for the evidence file (QA_EVIDENCE): recorded before it is asserted.
const observed = {};
const see = (key, value) => (observed[key] = value);
const ev = evidence('sub_changed_app', ['sub_changed_app.test.mjs', 'sub_tree.mjs'], COMMITS);
afterEach((t) => ev.seen(t));

const trees = [];
// This run's copies and config folders are removed when the process ends, whatever happened before: a tree that could
// not be loaded (see below), a failed test, a time limit. (The app data folders are removed the same way by the owner's
// harness, the exports by sub_tree.mjs.)
process.on('exit', () => {
  for (const t of trees) t.removeConfigs();
  rmSync(ROOT, { recursive: true, force: true });
});
// (The hook has its own time limit: a connector end that never comes fails the file instead of ending it silently
// without evidence.)
after(async () => {
  for (const t of trees) await t.quitLinks();                             // every stand-in connector is ended
  ev.write(observed);
}, { timeout: 15_000 });

/** A commit's app, with the two sibling files its harness imports, in a folder of this run; `overlayFrom`: overlay.ts of another commit. */
async function tree(name, commit, overlayFrom = commit) {
  const dir = join(ROOT, name);
  cpSync(join(exportTree(commit), WIN), join(dir, WIN), { recursive: true });
  for (const file of SIBLINGS) { mkdirSync(dirname(join(dir, file)), { recursive: true }); writeFileSync(join(dir, file), git('show', `${commit}:${file}`)); }
  if (overlayFrom !== commit) copyFileSync(join(exportTree(overlayFrom), OVERLAY), join(dir, OVERLAY));
  const load = (file) => import(pathToFileURL(join(dir, WIN, file)).href);
  const [main, page, fakes, { png }, rule, { DEFAULT_RETENTION_POLICY }] = await Promise.all(['tests/main-harness.ts', 'tests/overlay-page.ts', 'tests/subscription-fakes.ts', 'tests/png.ts', 'src/shared/subscription-ask.ts', 'src/shared/retention.ts'].map(load));
  const t = { name, dir, commit, overlayFrom, ...main, ...page, ...fakes, png, rule, policy: { ...DEFAULT_RETENTION_POLICY, min_interval_ms: 0 } };
  trees.push(t);
  return t;
}
let REL, FIRST, BEF, MIX;
try {
  REL = await tree('released', RELEASED);
  FIRST = await tree('first_release', FIRST_RELEASE);
  BEF = await tree('before', BEFORE);
  MIX = await tree('mixed', RELEASED, BEFORE);
} catch (error) {
  // A tree could not be exported or loaded. Thrown from here, the error would end this process without its 'exit'
  // handlers (the test runner rethrows it), and this run's copies would stay behind. So it is said, and the process is
  // ended in the way that runs them: the file fails (exit code 1), no test runs and no evidence is written.
  console.error(error);
  process.exit(1);
}

/**
 * The app of tree `t`, started, with the subscription configured and a stand-in connector (checked: signed in), and its
 * overlay page. As the owner's own tests drive it (apps/windows/tests/app-ask.test.ts), plus three things read here:
 * `wire` (every byte the app wrote to its connector), `facts` (what the overlay handed to the main process with each
 * selection) and `stall()` (from then on the overlay gets no message of the main process: a renderer that stopped).
 */
async function app(t, { check = true, configure } = {}) {
  const wire = [];
  const fakes = t.fakeConnectors((c) => { c.stdin.on('data', (b) => wire.push(Buffer.from(b))); configure?.(c); });
  const h = t.harness({ env: { LC_SUBSCRIPTION_CONNECTOR: t.connectorConfig() }, subscription: { spawn: fakes.spawn, request_ms: 500, ask_ms: 20_000, end_ms: 500 } });
  const s = await t.running(h);
  const press = (channel, ...args) => h.handlers[channel]({ sender: h.control().webContents }, ...args);   // as from the control window
  const sub = () => t.plain(press('lc:sub-state'));
  if (check) { press('lc:sub-check'); await t.until('signed in', () => sub().state === 'signed_in'); }
  const page = await t.overlayPage(h, s, t.policy);
  page.scene.exactPng = true;                                             // a selection's PNG has the selection's own size
  const facts = [];
  const retain = h.handlers['lc:ask-selection'];
  h.handlers['lc:ask-selection'] = (e, f, ...rest) => { facts.push(t.plain(f)); return retain(e, f, ...rest); };
  const captures = join(h.userData, 'captures');
  /** Every selection record on the device, each with the capture folder it lies in. */
  const records = () => (existsSync(captures) ? readdirSync(captures) : []).flatMap((d) => (existsSync(join(captures, d, 'asks')) ? readdirSync(join(captures, d, 'asks')).filter((f) => f.endsWith('.json')).map((f) => ({ ...JSON.parse(readFileSync(join(captures, d, 'asks', f), 'utf8')), folder: join(captures, d) })) : []));
  const known = new Set();
  /** The records written since the last call. */
  const fresh = () => records().filter((r) => !known.has(r.selection_id) && known.add(r.selection_id));
  /** An ASK circle of the pen around (x, 95)-(x+width, 125). */
  const circle = (x = 190, width = 210) => {
    page.press('ASK');
    page.pointer('pointerdown', 2, x, 95);
    for (const [px, py] of [[x + width, 95], [x + width, 125], [x, 125]]) page.pointer('pointermove', 2, px, py);
    page.pointer('pointerup', 2, x + 2, 97);
  };
  /** A circle, awaited until its own card shows its form or the reason it has none. */
  const select = async (x = 190, width = 210) => { circle(x, width); await t.until('the ASK card', () => page.review.card()?.text.includes(`Region ${x - 8},87 `) === true && (page.ask().form || /cannot be asked/.test(page.ask().status ?? ''))); };
  const from = { sender: s.overlay.webContents };                         // as from the overlay
  const stall = () => { const tried = []; s.overlay.webContents.send = (...a) => void tried.push(a[0]); return tried; };
  /** Whether any file of the app's data folder holds `text`. */
  const onDevice = (text) => readdirSync(h.userData, { recursive: true, withFileTypes: true }).some((e) => e.isFile() && readFileSync(join(e.parentPath, e.name)).includes(text));
  // `ended`: what the control window is told of the session's end. `last`: the connector. `entry`: the newest question in the (one) record.
  return { t, h, s, fakes, page, press, sub, records, fresh, circle, select, facts, wire, from, stall, onDevice, ended: () => t.plain(press('lc:session-state')).ended ?? null,
    last: () => fakes.last(), entry: () => records()[0].requests.at(-1), status: () => (page.ask().status ?? '').replace(/^Asked at .*? \(/, 'Asked at <time> (') || null };
}

// ---- the source that is run ---------------------------------------------------------------------------------------------
test('the source under test: every file that is run is its commit\'s own blob; the mixed tree is RELEASED with only overlay.ts of BEFORE; between FIRST_RELEASE and RELEASED the app differs in subscription.ts and two of the owner\'s test files, nothing else', LIMIT, () => {
  const blobs = (commit) => new Map(git('ls-tree', '-r', commit, '--', WIN, ...SIBLINGS).toString('utf8').trim().split('\n').map((line) => [line.split('\t')[1], line.split('\t')[0].split(' ')[2]]));
  const committed = Object.fromEntries(Object.entries(COMMITS).map(([name, commit]) => [name, blobs(commit)]));
  const nameOf = (commit) => Object.keys(COMMITS).find((name) => COMMITS[name] === commit);
  const blobOf = (file) => { const b = readFileSync(file); return createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex'); };
  const counted = {};
  assert.deepEqual([REL, FIRST, BEF, MIX].map((t) => [t.commit, t.overlayFrom]), [[RELEASED, RELEASED], [FIRST_RELEASE, FIRST_RELEASE], [BEFORE, BEFORE], [RELEASED, BEFORE]]);
  for (const t of [REL, FIRST, BEF, MIX]) {
    const want = new Map(committed[nameOf(t.commit)]);
    if (t.overlayFrom !== t.commit) want.set(OVERLAY, committed.before.get(OVERLAY));
    const files = readdirSync(t.dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name).slice(t.dir.length + 1));
    assert.deepEqual(files.filter((f) => blobOf(join(t.dir, f)) !== want.get(f)), [], `${t.name}: a file that is not the commit's`);
    assert.equal(files.length, want.size, `${t.name}: every file of the commit's app is there`);
    counted[t.name] = files.length;
  }
  // The files of the app (and the two siblings) whose blob is not the same on two commits, either one missing included.
  const differing = (a, b) => [...new Set([...a.keys(), ...b.keys()])].filter((f) => a.get(f) !== b.get(f)).sort();
  const SUBSCRIPTION = `${WIN}/src/main/subscription.ts`;
  const run = [OVERLAY, `${WIN}/src/main/main.ts`, SUBSCRIPTION, `${WIN}/src/shared/subscription-ask.ts`, `${WIN}/tests/overlay-page.ts`, `${WIN}/tests/main-harness.ts`, `${WIN}/tests/subscription-fakes.ts`, ...SIBLINGS];
  const named = (m) => Object.fromEntries(run.map((f) => [f, m.get(f)]));
  const followUp = differing(committed.first_release, committed.released);
  see('source', { files_compared_with_their_blob: counted, released: named(committed.released), first_release: named(committed.first_release), before: named(committed.before),
    differing_between_first_release_and_released: followUp, files_differing_between_before_and_first_release: differing(committed.before, committed.first_release).length });
  // FIRST_RELEASE -> RELEASED: one file that is run here, and two of the owner's own tests (not run here).
  assert.deepEqual(followUp, [SUBSCRIPTION, `${WIN}/tests/app-ask.test.ts`, `${WIN}/tests/subscription.test.ts`]);
  // BEFORE -> RELEASED: the three files of the corrections changed, the siblings did not.
  for (const f of [OVERLAY, `${WIN}/src/main/main.ts`, `${WIN}/src/shared/subscription-ask.ts`]) assert.notEqual(committed.released.get(f), committed.before.get(f), `${f} changed`);
  for (const f of SIBLINGS) assert.equal(committed.released.get(f), committed.before.get(f), `${f} did not change`);
});

// ---- QA-SUB-01: a frame replaced, and its bitmap closed, while the selection's picture is encoded -----------------------
const FRAME_AT = '2026-09-30T12:00:05.000Z';
const REGION = { x: 182, y: 87, width: 226, height: 46 };
const NOT_SENT = 'Selection · not sent to any AI';
const MALFORMED = 'This selection cannot be asked about: the selection facts are malformed. It was not sent to any AI.';
const when = (time) => (time === FRAME_AT ? FRAME_AT : 'the time of a later sample');
const cardLine = (w) => w.page.review.card()?.text.split('\n')[1]?.replace(/\(captured [^)]*\)/, '(captured <time>)') ?? null;
const handed = (f) => ({ frame: [f.frame_seq, when(f.frame_captured_at), f.frame_width, f.frame_height], ink: [f.ink_revision, f.visible_strokes], region_dip: f.region_dip });
const card = (w) => ({ form: w.page.ask().form, status: w.page.ask().status, badge: w.page.ask().badge, says: cardLine(w) });

/** A frame this test owns, put in place as the frame the overlay holds (number 41): once closed, its size reads 0. */
function ownFrame(w) {
  const bitmap = { width: 1280, height: 800, shade: 20, close() { this.width = this.height = 0; } };
  w.page.review.frame({ bitmap, seq: 41, at: FRAME_AT, presented: 41, presentedAt: performance.now() });
  return bitmap;
}
/** One pen stroke in WRITE, saved: the ink document is then revision 1 with one visible stroke. */
async function stroke(w) {
  w.page.pointer('pointerdown', 1, 200, 105);
  for (const x of [240, 280]) w.page.pointer('pointermove', 1, x, 105);
  w.page.pointer('pointerup', 1, 280, 105);
  await w.page.review.pending();
}
/**
 * What the device holds of a selection: the frame it names, its picture as stored, and the ink document kept with it.
 * `shade`: which screen of this test the stored PNG is (20: the frame number 41; 90 and 120: the screens after it).
 * The RELEASED harness encodes the shade of the frame that was drawn, not of the screen at the time of encoding.
 */
function kept(w, r) {
  const png = readFileSync(join(r.folder, r.image.file));
  const ink = JSON.parse(readFileSync(join(r.folder, r.ink_original.file), 'utf8')).ink;
  return plain({ frame: [r.context.frame_seq, when(r.context.frame_captured_at), r.context.frame_width, r.context.frame_height], region_px: r.context.region_px,
    picture: { recorded_size: [r.image.width, r.image.height], png_size: [png.readUInt32BE(16), png.readUInt32BE(20)], png_is_the_recorded_sha256: sha(png) === r.image.sha256,
      shade: [20, 90, 120].find((shade) => sha(w.t.png(r.image.width, r.image.height, shade)) === r.image.sha256) ?? null },
    ink: { revision: r.context.ink_revision, document: [ink.revision, ink.visible.length] } });
}
/**
 * A stroke; a selection with nothing happening (the control); then the same circle whose picture is held in encoding
 * while the ink is undone (`undo`) and the app's own sampler takes `samples` new frames (each of another shade),
 * closing the frame the selection was made from. Returns what was seen, and the app.
 */
async function selectWhileEncoding(t, { samples = 0, undo = false } = {}) {
  const w = await app(t);
  await stroke(w);
  const bitmap = ownFrame(w);
  await w.select();
  const [control] = w.fresh();
  let release;
  w.page.encoding.gate = new Promise((r) => (release = r));
  w.circle();
  await t.settle();
  if (undo) w.page.click('undo');
  for (let i = 0; i < samples; i++) {
    w.page.scene.shade = 90 + 30 * i;                                     // the screen changes, so the sampler's next frame is a new one
    void w.page.review.sample();                                          // not awaited to its end: its own encoding waits at the gate too
    await t.until('the app\'s own sampler reported its sample, the frame of the selection closed', () => bitmap.width === 0 && w.page.review.samples().at(-1)?.seq === 42 + i);
  }
  const doc = w.page.review.state().doc.ink;
  // `sample_numbers_reported`: the numbers of the samples the overlay has reported (its sampler runs only when this
  // test asks, so these are the samples of this encoding). It is NOT a list of frames taken: the page double does not
  // show which frame the overlay holds. That the first sample took a new frame is the closed bitmap of frame 41 (its
  // size reads 0). That the second one did too is shown only afterwards: the next selection names frame 43 and has the
  // newest screen's shade (asserted by the test of two replacements).
  const during = { held_frame_size: [bitmap.width, bitmap.height], sample_numbers_reported: w.page.review.samples().map((x) => x.seq), ink_now: [doc.revision, doc.visible.length], selections_handed_to_main: w.facts.length };
  w.page.encoding.gate = null;
  release();
  await t.until('the card says how the selection ended', () => w.facts.length === 2 && (/cannot be asked/.test(w.page.ask().status ?? '') || (w.records().length === 2 && w.page.ask().form)));
  const [held] = w.fresh();
  const seen = plain({ during, handed: handed(w.facts[1]), card: card(w), records: w.records().length,
    kept: held ? { ...kept(w, held), as_the_control: { context: same(held.context, control.context), picture: held.image.sha256 === control.image.sha256, ink: held.ink_original.sha256 === control.ink_original.sha256 } } : null });
  return { w, seen, control, held };
}
const SAYS_41 = 'Region 182,87 226×46 DIP on Display 1 = 226×46 px of frame 41 (captured <time>), with your ink revision 1 drawn over it.';
const during = (samples, undo = false) => ({ held_frame_size: samples ? [0, 0] : [1280, 800], sample_numbers_reported: [42, 43].slice(0, samples), ink_now: undo ? [2, 0] : [1, 1], selections_handed_to_main: 1 });
/** Kept: the facts, the card and the record are those of frame 41 as it was at pen-up, whatever happened during the encoding. */
const KEPT = (samples, undo = false) => ({ during: during(samples, undo), handed: { frame: [41, FRAME_AT, 1280, 800], ink: [1, 1], region_dip: REGION },
  card: { form: true, status: null, badge: NOT_SENT, says: SAYS_41 }, records: 2,
  kept: { frame: [41, FRAME_AT, 1280, 800], region_px: REGION, picture: { recorded_size: [226, 46], png_size: [226, 46], png_is_the_recorded_sha256: true, shade: 20 }, ink: { revision: 1, document: [1, 1] }, as_the_control: { context: true, picture: true, ink: true } } });
/** Refused: the old overlay read the frame's size after the encoding, when it was 0; the main process refused the facts. */
const REFUSED = (samples, undo = false) => ({ during: during(samples, undo), handed: { frame: [41, FRAME_AT, 0, 0], ink: [1, 1], region_dip: REGION },
  card: { form: false, status: MALFORMED, badge: NOT_SENT, says: SAYS_41 }, records: 1, kept: null });

test('QA-SUB-01 RELEASED: the frame is replaced and its bitmap closed while the selection\'s picture is encoded: the selection is kept (form ready, no "malformed" status), recorded with frame 41\'s number, time, 1280×800 size and 226×46 region, its PNG the pixels of that frame; it can be asked about; the next selection is made from the new frame', LIMIT, async () => {
  const { w, seen, control } = await selectWhileEncoding(REL, { samples: 1 });
  see('QA-SUB-01.replaced_once.released', seen);
  assert.deepEqual(seen, KEPT(1));
  // It can be asked about, and what goes to the connector is that picture with those facts (the default question).
  w.page.click('askSubmit');
  await REL.until('sent', () => w.last().asks().length === 1);
  const sent = w.last().asks()[0].params.request;
  const asked = { question: sent.question, picture_is_the_control_s: sent.image.sha256 === control.image.sha256, picture_size: [sent.image.width, sent.image.height], frame: [sent.context.frame_seq, sent.context.frame_captured_at, sent.context.frame_width, sent.context.frame_height], region_px: sent.context.region_px };
  see('QA-SUB-01.replaced_once.released.asked', asked);
  assert.deepEqual(asked, { question: 'Explain what is selected.', picture_is_the_control_s: true, picture_size: [226, 46], frame: [41, FRAME_AT, 1280, 800], region_px: REGION });
  w.last().answer('SYNTHETIC answer.');
  await REL.until('answered', () => w.page.ask().answer !== null);
  // A selection after that: the frame the sampler took meanwhile (42), the screen as it is now (shade 90).
  await w.page.review.pending();
  await w.select(600, 120);
  const later = kept(w, w.fresh()[0]);
  see('QA-SUB-01.replaced_once.released.next_selection', later);
  assert.deepEqual([later.frame, later.picture.shade], [[42, 'the time of a later sample', 1280, 800], 90]);
});

test('QA-SUB-01 NEGATIVE CONTROL (overlay.ts of BEFORE in the RELEASED harness, and BEFORE whole): the same steps hand the main process a frame of size 0×0 and the card says "the selection facts are malformed"; no form, no record; without a replacement the old overlay keeps a selection', LIMIT, async () => {
  const { w, seen } = await selectWhileEncoding(MIX, { samples: 1 });
  see('QA-SUB-01.replaced_once.before_overlay', seen);
  assert.deepEqual(seen, REFUSED(1));
  assert.equal(w.last().asks().length, 0);
  // The old overlay is not broken as such: the next selection, with no frame replaced during its encoding, is kept.
  await w.page.review.pending();
  await w.select(600, 120);
  const later = { card: [w.page.ask().form, w.page.ask().status], frame: kept(w, w.fresh()[0]).frame, records: w.records().length };
  see('QA-SUB-01.replaced_once.before_overlay.next_selection', later);
  assert.deepEqual(later, { card: [true, null], frame: [42, 'the time of a later sample', 1280, 800], records: 2 });
  // BEFORE whole (its own main.ts and its own harness) refuses the same way. The frame held is this test's own, whose
  // close() zeroes its size; the frames BEFORE's harness makes by itself never close, so only this one shows it there.
  const whole = (await selectWhileEncoding(BEF, { samples: 1 })).seen;
  see('QA-SUB-01.replaced_once.before_whole', whole);
  assert.deepEqual(whole, REFUSED(1));
});

test('QA-SUB-01 two replacements during one encoding: RELEASED keeps the selection as frame 41 (shade 20, neither of the two later screens), and the next selection names frame 43 with the newest screen (the proof that the second sample replaced the frame again); the overlay of BEFORE refuses it as malformed', LIMIT, async () => {
  const { w, seen } = await selectWhileEncoding(REL, { samples: 2 });
  see('QA-SUB-01.replaced_twice.released', seen);
  assert.deepEqual(seen, KEPT(2));
  await w.page.review.pending();
  await w.select(600, 120);
  const later = kept(w, w.fresh()[0]);
  see('QA-SUB-01.replaced_twice.released.next_selection', later);
  // Frame 43, shade 120: the frame of the SECOND sample is the one held now, so the frame was replaced twice.
  assert.deepEqual([later.frame, later.picture.shade], [[43, 'the time of a later sample', 1280, 800], 120]);
  const old = (await selectWhileEncoding(MIX, { samples: 2 })).seen;
  see('QA-SUB-01.replaced_twice.before_overlay', old);
  assert.deepEqual(old, REFUSED(2));
});

test('QA-SUB-01 the ink changes during the encoding. Alone (unchanged between the two commits): both keep the selection with the ink as it was at pen-up (revision 1, one stroke), not as it is now (revision 2, none). With the frame replaced too: RELEASED keeps it the same way, the overlay of BEFORE refuses it', LIMIT, async () => {
  const [alone, aloneOld] = [(await selectWhileEncoding(REL, { undo: true })).seen, (await selectWhileEncoding(MIX, { undo: true })).seen];
  see('QA-SUB-01.ink_changed.released', alone);
  see('QA-SUB-01.ink_changed.before_overlay', aloneOld);
  assert.deepEqual(alone, KEPT(0, true));
  assert.deepEqual(aloneOld, alone, 'unchanged: the same on both');
  const [both, bothOld] = [(await selectWhileEncoding(REL, { samples: 1, undo: true })).seen, (await selectWhileEncoding(MIX, { samples: 1, undo: true })).seen];
  see('QA-SUB-01.ink_changed_and_replaced.released', both);
  see('QA-SUB-01.ink_changed_and_replaced.before_overlay', bothOld);
  assert.deepEqual(both, KEPT(1, true));
  assert.deepEqual(bothOld, REFUSED(1, true));
});

test('QA-SUB-01 STILL OPEN BY DESIGN, an observed fact and not a pass (unchanged between the two commits): a frame taken between pen-down and pen-up is the one selected: the circle began on frame 41 (shade 20), the record and the card name frame 42 and the picture is the later screen (shade 90)', LIMIT, async () => {
  // QA NOTE: an ASK circle neither pins the frame it began on nor takes a fresh sample. The selection is made from
  // whatever frame is held at pen-up, so its pixels can be newer than what was on screen when the circle began. The
  // card names the frame it used. This is the behaviour of both commits; the correction did not touch it.
  const penUp = async (t) => {
    const w = await app(t);
    const bitmap = ownFrame(w);
    w.page.press('ASK');
    w.page.pointer('pointerdown', 2, 190, 95);
    w.page.pointer('pointermove', 2, 400, 95);
    w.page.scene.shade = 90;
    await w.page.review.sample();                                         // the sampler's next frame, mid-gesture
    const midGesture = [bitmap.width, bitmap.height];
    for (const [px, py] of [[400, 125], [190, 125]]) w.page.pointer('pointermove', 2, px, py);
    w.page.pointer('pointerup', 2, 192, 97);
    await t.until('the card', () => w.page.ask().form || /cannot be asked/.test(w.page.ask().status ?? ''));
    return plain({ frame_at_pen_down: 41, its_size_mid_gesture: midGesture, handed: handed(w.facts[0]), card: card(w), kept: kept(w, w.fresh()[0]) });
  };
  const [now, old] = [await penUp(REL), await penUp(MIX)];
  see('QA-SUB-01.frame_at_pen_up.released', now);
  see('QA-SUB-01.frame_at_pen_up.before_overlay', old);
  assert.deepEqual(now, { frame_at_pen_down: 41, its_size_mid_gesture: [0, 0], handed: { frame: [42, 'the time of a later sample', 1280, 800], ink: [0, 0], region_dip: REGION },
    card: { form: true, status: null, badge: NOT_SENT, says: 'Region 182,87 226×46 DIP on Display 1 = 226×46 px of frame 42 (captured <time>), with your ink revision 0 drawn over it.' },
    kept: { frame: [42, 'the time of a later sample', 1280, 800], region_px: REGION, picture: { recorded_size: [226, 46], png_size: [226, 46], png_is_the_recorded_sha256: true, shade: 90 }, ink: { revision: 0, document: [0, 0] } } });
  assert.deepEqual(old, now, 'unchanged: the same on both');
});

// ---- a candidate finding beside QA-SUB-01: a selection whose PNG encoding fails ---------------------------------------
const ENCODING_ERROR = 'EncodingError: the picture could not be encoded (injected by QA)';
/**
 * Run as a CHILD process, with a tree's folder as its argument. What it shows ends in a promise rejection that nothing
 * handles; in this file's own process the test runner would count that as a failure of whatever test is running, so
 * it is taken where it can be counted: the child listens for `unhandledRejection` and prints what it saw as one line.
 * The same owner's harness as `app()` above, started the same way; `encoding.gate` is a rejected promise for the
 * first circle (the page double's convertToBlob awaits it, so that call rejects), and is taken away for the second.
 */
const ENCODING_PROBE = String.raw`
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const [dir, message] = process.argv.slice(2);
const load = (file) => import(pathToFileURL(join(dir, 'apps/windows', file)).href);
const [main, page, fakes, { DEFAULT_RETENTION_POLICY }] = await Promise.all(['tests/main-harness.ts', 'tests/overlay-page.ts', 'tests/subscription-fakes.ts', 'src/shared/retention.ts'].map(load));
const rejections = [];
process.on('unhandledRejection', (error) => rejections.push(String(error && error.message)));
const connectors = fakes.fakeConnectors();
process.on('exit', () => fakes.removeConfigs());   // (the app data folder is removed the same way by the owner's harness)
const h = main.harness({ env: { LC_SUBSCRIPTION_CONNECTOR: fakes.connectorConfig() }, subscription: { spawn: connectors.spawn, request_ms: 500, ask_ms: 20000, end_ms: 500 } });
const s = await main.running(h);
const control = { sender: h.control().webContents };
h.handlers['lc:sub-check'](control);
await page.until('signed in', () => main.plain(h.handlers['lc:sub-state'](control)).state === 'signed_in');
const p = await page.overlayPage(h, s, { ...DEFAULT_RETENTION_POLICY, min_interval_ms: 0 });
p.scene.exactPng = true;
let handed = 0;
const retain = h.handlers['lc:ask-selection'];
h.handlers['lc:ask-selection'] = (...args) => { handed += 1; return retain(...args); };
const circle = () => { p.pointer('pointerdown', 2, 190, 95); for (const [x, y] of [[400, 95], [400, 125], [190, 125]]) p.pointer('pointermove', 2, x, y); p.pointer('pointerup', 2, 192, 97); };
const look = () => ({ card: p.review.card() === null ? null : p.review.card().text.split('\n')[1].replace(/\(captured [^)]*\)/, '(captured <time>)'), form: p.ask().form, status: p.ask().status, badge: p.ask().badge,
  hint: p.hint(), selections_handed_to_main: handed, unhandled_rejections: [...rejections] });
const atStart = look();
const failing = Promise.reject(new Error(message));
failing.catch(() => undefined);                 // this promise itself is handled; what finishAsk makes of it is the product's
p.press('ASK');
p.encoding.gate = failing;
circle();
await page.until('a rejection nothing handled', () => rejections.length === 1);
await new Promise((r) => setTimeout(r, 100));   // time for a card or a message that would still come
const afterTheFailure = look();
p.encoding.gate = null;
circle();                                       // the overlay is still in ASK: the same circle again, the encoding working
await page.until('the card', () => p.ask().form);
const again = look();
await main.quitLinks();
console.log(JSON.stringify({ at_start: atStart, after_the_failed_encoding: afterTheFailure, the_same_circle_again_with_the_encoding_working: again }));
`;
const encodingFails = (t) => {
  const script = join(ROOT, 'encoding_probe.mjs');
  writeFileSync(script, ENCODING_PROBE);
  const { NODE_TEST_CONTEXT: _, ...env } = process.env;                   // the child is a plain script, not a test file of the runner
  const TMPDIR = join(ROOT, 'child-tmp');                                 // inside this run's folder: removed with it even if the child is killed at its limit
  mkdirSync(TMPDIR, { recursive: true });
  return JSON.parse(execFileSync(process.execPath, [script, t.dir, ENCODING_ERROR], { encoding: 'utf8', timeout: 20_000, env: { ...env, TMPDIR }, stdio: ['ignore', 'pipe', 'pipe'] }).trim().split('\n').at(-1));
};
const WRITE_HINT = 'Pen writes; mouse writing off; new ink fixed on the screen. Starting the capture of this display… No AI watches this screen: ChatGPT gets only a selection you send with Ask. Ink is saved on this device at every change.';
const ASK_HINT = 'Circle a region. Esc or Cancel returns. Starting the capture of this display… No AI watches this screen: ChatGPT gets only a selection you send with Ask. Ink is saved on this device at every change.';
const NOTHING = { card: null, form: false, status: null, badge: '' };

test('CANDIDATE FINDING, an observed fact and not a pass (the same on RELEASED and BEFORE): the PNG encoding of a selection fails: no card, no status and no word in the hint (it still says "Circle a region."), nothing is handed to the main process, and the failure is a promise rejection nothing handles; the same circle again, the encoding working, gives the card', LIMIT, () => {
  // QA NOTE: overlay.ts finishAsk awaits convertToBlob with no catch, and the pen-up handler drops finishAsk's promise
  // (`void finishAsk(...)`). A selection whose picture cannot be encoded therefore ends with nothing on screen: the
  // user circled a region and sees no card and no reason, the overlay stays in ASK as if nothing had been circled.
  // Expected: the card (or the hint) says that the selection could not be made and why, and that nothing was sent.
  // How often Chromium's encoder fails is NOT shown here: the failure is injected into the owner's page double.
  const [now, old] = [encodingFails(REL), encodingFails(BEF)];
  see('CANDIDATE.encoding_fails.released', now);
  see('CANDIDATE.encoding_fails.before', old);
  assert.deepEqual(now, {
    at_start: { ...NOTHING, hint: WRITE_HINT, selections_handed_to_main: 0, unhandled_rejections: [] },
    after_the_failed_encoding: { ...NOTHING, hint: ASK_HINT, selections_handed_to_main: 0, unhandled_rejections: [ENCODING_ERROR] },
    the_same_circle_again_with_the_encoding_working: { card: 'Region 182,87 226×46 DIP on Display 1 = 226×46 px of frame 1 (captured <time>), with your ink revision 0 drawn over it.', form: true, status: null, badge: NOT_SENT,
      hint: WRITE_HINT, selections_handed_to_main: 1, unhandled_rejections: [ENCODING_ERROR] } });
  assert.deepEqual(old, now, 'unchanged: the same on both');
});

// ---- QA-SUB-04: a question that is not valid Unicode --------------------------------------------------------------------
const [HIGH, LOW] = ['\ud83d', '\ude00'];                                  // the two halves of U+1F600
const DAMAGED = 'the question holds a damaged character (half of a pair), so it cannot be sent as it is; type that part again';
const EMPTY_OR_LONG = 'the question is empty or too long';
const NO_EXPORT = '(questionProblem is not exported)';
const AS_TYPED = 'the text as typed, trimmed';
const DAMAGED_TEXTS = { 'a lone high half': `What is ${HIGH} this?`, 'a lone low half': `What is ${LOW} this?`, 'the two halves swapped': `a${LOW}${HIGH}b`, 'a lone half inside spaces': `   ${HIGH}   `,
  'a high half at the end': `abc${HIGH}`, 'a low half at the start': `${LOW}abc`, 'a high half before a whole pair': `${HIGH}${HIGH}${LOW}`, 'a whole pair, then a low half': `${HIGH}${LOW}${LOW}` };
const VALID_TEXTS = { Chinese: '这道题怎么做？', 'an emoji (one pair)': '\u{1F600}', 'combining marks': 'é ạ̈ क्षि', 'U+10FFFF': '\u{10FFFF}',
  'Chinese, an emoji and accents, padded with spaces': '  这个 \u{1F600} 是什么? é \u{1F9EE}  ' };
const LIMIT_TEXTS = { '3998 x and an emoji: 4000 units': 'x'.repeat(3998) + '\u{1F600}', '3999 x and an emoji: 4001 units': 'x'.repeat(3999) + '\u{1F600}', '4000 x': 'x'.repeat(4000), '4001 x': 'x'.repeat(4001),
  '3999 x and a lone half: 4000 units': 'x'.repeat(3999) + HIGH, '4001 x and a lone half': 'x'.repeat(4001) + HIGH, 'nothing': '', 'spaces only': '   ', 'a number, not text': 7 };
/** The pure rule on one text: what questionOf returns (null, or the text as typed), its length in UTF-16 units, and what is said of a refusal. */
const ruled = (t, text) => { const q = t.rule.questionOf(text); return { returned: q === null ? null : q === text.trim() ? AS_TYPED : `CHANGED: ${JSON.stringify(q)}`, units: q?.length ?? null, said: q === null ? (t.rule.questionProblem?.(text) ?? NO_EXPORT) : null }; };
const table = (t, texts) => Object.fromEntries(Object.entries(texts).map(([name, text]) => [name, ruled(t, text)]));
const refusedAs = (said) => ({ returned: null, units: null, said });
const keptWith = (units) => ({ returned: AS_TYPED, units, said: null });
const VALID_KEPT = { Chinese: keptWith(7), 'an emoji (one pair)': keptWith(2), 'combining marks': keptWith(11), 'U+10FFFF': keptWith(2), 'Chinese, an emoji and accents, padded with spaces': keptWith(15) };

test('QA-SUB-04 RELEASED, the pure rule (questionOf / questionProblem): a lone high half, a lone low half, a swapped pair and a lone half inside spaces are refused with the damaged-character text; Chinese, an emoji pair, combining marks and U+10FFFF are returned exactly; the limit is 4000 UTF-16 units and an emoji at its edge is never cut', LIMIT, () => {
  const seen = { limit: REL.rule.QUESTION_MAX, damaged: table(REL, DAMAGED_TEXTS), valid: table(REL, VALID_TEXTS), limits: table(REL, LIMIT_TEXTS) };
  see('QA-SUB-04.rule.released', seen);
  assert.equal(seen.limit, 4000);
  assert.deepEqual(seen.damaged, Object.fromEntries(Object.keys(DAMAGED_TEXTS).map((name) => [name, refusedAs(DAMAGED)])));
  assert.deepEqual(seen.valid, VALID_KEPT);
  // QA NOTE: a text that is both damaged and too long is said to be damaged (the README does not say which is said).
  assert.deepEqual(seen.limits, { '3998 x and an emoji: 4000 units': keptWith(4000), '3999 x and an emoji: 4001 units': refusedAs(EMPTY_OR_LONG), '4000 x': keptWith(4000), '4001 x': refusedAs(EMPTY_OR_LONG),
    '3999 x and a lone half: 4000 units': refusedAs(DAMAGED), '4001 x and a lone half': refusedAs(DAMAGED), 'nothing': refusedAs(EMPTY_OR_LONG), 'spaces only': refusedAs(EMPTY_OR_LONG), 'a number, not text': refusedAs(EMPTY_OR_LONG) });
});

test('QA-SUB-04 NEGATIVE CONTROL (BEFORE), the pure rule: every damaged text is returned as a question to send; questionProblem does not exist; valid text and the 4000-unit limit are the same as RELEASED', LIMIT, () => {
  const seen = { limit: BEF.rule.QUESTION_MAX, damaged: table(BEF, DAMAGED_TEXTS), valid: table(BEF, VALID_TEXTS), limits: table(BEF, LIMIT_TEXTS) };
  see('QA-SUB-04.rule.before', seen);
  assert.equal(typeof BEF.rule.questionProblem, 'undefined');
  assert.deepEqual(seen.damaged, { 'a lone high half': keptWith(15), 'a lone low half': keptWith(15), 'the two halves swapped': keptWith(4), 'a lone half inside spaces': keptWith(1),
    'a high half at the end': keptWith(4), 'a low half at the start': keptWith(4), 'a high half before a whole pair': keptWith(3), 'a whole pair, then a low half': keptWith(3) });
  assert.deepEqual([seen.limit, seen.valid], [4000, VALID_KEPT], 'unchanged: valid text is returned exactly on both');
  assert.deepEqual(seen.limits, { '3998 x and an emoji: 4000 units': keptWith(4000), '3999 x and an emoji: 4001 units': refusedAs(NO_EXPORT), '4000 x': keptWith(4000), '4001 x': refusedAs(NO_EXPORT),
    '3999 x and a lone half: 4000 units': keptWith(4000), '4001 x and a lone half': refusedAs(NO_EXPORT), 'nothing': refusedAs(NO_EXPORT), 'spaces only': refusedAs(NO_EXPORT), 'a number, not text': refusedAs(NO_EXPORT) });
});

const LONE = DAMAGED_TEXTS['a lone high half'];
const VALID = '这个 \u{1F600} 是什么? é é \u{1F9EE} \u{10FFFF}';   // Chinese, an emoji pair, a precomposed and a combining accent, U+1F9EE, U+10FFFF
/**
 * On one card: Ask with a lone-surrogate question, Ask again without retyping, the other damaged texts handed to the
 * main process as the overlay would, then a valid non-ASCII question typed with spaces around it. A question that
 * goes out is answered by the stand-in, so that the card can ask again.
 */
async function damagedThenValid(t) {
  const w = await app(t);
  await w.select();
  const id = w.records()[0].selection_id;
  const askLines = () => Buffer.concat(w.wire).toString('latin1').split('\n').filter((line) => line.includes('"method":"ask/start"'));   // latin1: the bytes, one to one
  const answerIt = async () => { w.last().answer('SYNTHETIC answer.'); await t.until('its end is recorded', () => w.entry().outcome !== null); };
  const press = async () => { w.page.click('askSubmit'); await t.until('the card says whether it was sent', () => /^(Not sent:|Asked at )/.test(w.page.ask().status ?? '')); };
  w.page.question(LONE);
  await press();
  const first = { status: w.status(), badge: w.page.ask().badge, ask_enabled: w.page.ask().submit, cancel_shown: w.page.ask().cancel, recorded: w.records()[0].requests.map((e) => e.question), connector_got: w.last().asks().map((c) => c.params.request.question),
    sent_as_the_json_escape: askLines().some((line) => line.includes(String.raw`"question":"What is \ud83d this?"`)), record_file_has_the_escape: readFileSync(join(w.records()[0].folder, 'asks', `${id}.json`)).includes(String.raw`"question":"What is \ud83d this?"`) };
  if (w.last().asks().length) await answerIt();
  else await press();                                                     // pressed again as it is: the text is still in the box
  const again = { status: w.status(), connector_got: w.last().asks().length };
  const others = {};
  for (const [name, text] of Object.entries(DAMAGED_TEXTS).slice(1)) {
    const said = t.plain(await w.h.handlers['lc:ask-submit'](w.from, id, text, 'hint'));
    others[name] = said.ok ? 'sent' : said.reason;
    if (said.ok) { await t.until('sent', () => w.last().asks().at(-1).params.request.request_id === said.request_id); await answerIt(); }
  }
  const before = w.last().asks().length;
  w.page.question(`  ${VALID}  `);
  await press();
  await t.until('sent', () => w.last().asks().length === before + 1);
  const wire = Buffer.from(askLines().at(-1), 'latin1');
  const valid = { connector_got_it_exactly: w.last().asks().at(-1).params.request.question === VALID, recorded_exactly: w.entry().question === VALID,
    wire_holds_its_utf8_bytes: wire.includes(Buffer.from(`"question":"${VALID}","assistance":"hint"`, 'utf8')), wire_has_a_u_escape: /\\u[0-9a-fA-F]{4}/.test(wire.toString('latin1')),
    utf8_bytes: Buffer.byteLength(VALID, 'utf8'), utf8_sha256: sha(Buffer.from(VALID, 'utf8')) };
  return plain({ first, again, others, valid, asks_before_the_valid_one: before, connector_calls: w.last().calls.map((c) => c.method).join(' '), state: w.sub().state, connectors_started: w.fakes.made.length, connector_ended: w.last().exited });
}
const VALID_SENT = { connector_got_it_exactly: true, recorded_exactly: true, wire_holds_its_utf8_bytes: true, wire_has_a_u_escape: false, utf8_bytes: 39, utf8_sha256: sha(Buffer.from(VALID, 'utf8')) };

test('QA-SUB-04 RELEASED, through the app (submitAsk): a lone-surrogate question gives the card "Not sent: the question holds a damaged character (half of a pair) …", nothing is recorded, nothing reaches the connector; the next valid question on the same card is the first the connector ever gets, byte-exact (Chinese, emoji, combining marks, U+10FFFF as UTF-8, no escape)', LIMIT, async () => {
  const seen = await damagedThenValid(REL);
  see('QA-SUB-04.app.released', seen);
  const refusal = { status: `Not sent: ${DAMAGED}.`, connector_got: 0 };
  assert.deepEqual(seen, {
    first: { status: `Not sent: ${DAMAGED}.`, badge: NOT_SENT, ask_enabled: true, cancel_shown: false, recorded: [], connector_got: [], sent_as_the_json_escape: false, record_file_has_the_escape: false },
    again: refusal,
    others: Object.fromEntries(Object.keys(DAMAGED_TEXTS).slice(1).map((name) => [name, DAMAGED])),
    valid: VALID_SENT, asks_before_the_valid_one: 0,
    connector_calls: 'connection/read ask/start',                         // the account read of Check, then the one valid question: nothing else ever reached it
    state: 'signed_in', connectors_started: 1, connector_ended: false });
});

test('QA-SUB-04 NEGATIVE CONTROL (BEFORE), through the app: the lone-surrogate question is accepted, recorded and sent to the connector (as the JSON escape \\ud83d), and so are the seven other damaged texts; a valid question is sent byte-exact as on RELEASED', LIMIT, async () => {
  const seen = await damagedThenValid(BEF);
  see('QA-SUB-04.app.before', seen);
  assert.deepEqual(seen, {
    first: { status: 'Asked at <time> (vision-model): this picture and your question are being sent to ChatGPT. Waiting for the answer…', badge: 'Selection · asked: being sent to ChatGPT', ask_enabled: false, cancel_shown: true,
      recorded: [LONE], connector_got: [LONE], sent_as_the_json_escape: true, record_file_has_the_escape: true },
    again: { status: 'Answered by ChatGPT (vision-model) in 1.2 s, about the picture above and your question only.', connector_got: 1 },
    others: Object.fromEntries(Object.keys(DAMAGED_TEXTS).slice(1).map((name) => [name, 'sent'])),
    valid: VALID_SENT, asks_before_the_valid_one: 8,
    connector_calls: `connection/read${' ask/start'.repeat(9)}`,
    state: 'signed_in', connectors_started: 1, connector_ended: false });
});

test('QA-SUB-04 the refusal comes before the connection is looked at: with the subscription not yet checked RELEASED says the damaged-character text, BEFORE said "has not been checked yet"; on both nothing is recorded and no connector is started', LIMIT, async () => {
  const unchecked = async (t) => {
    const w = await app(t, { check: false });
    await w.select();
    w.page.question(LONE);
    w.page.click('askSubmit');
    await t.until('refused', () => /^Not sent:/.test(w.page.ask().status ?? ''));
    return plain({ status: w.page.ask().status, recorded: w.records()[0].requests, connectors_started: w.fakes.made.length, state: w.sub().state });
  };
  const [now, old] = [await unchecked(REL), await unchecked(BEF)];
  see('QA-SUB-04.app_not_checked.released', now);
  see('QA-SUB-04.app_not_checked.before', old);
  assert.deepEqual(now, { status: `Not sent: ${DAMAGED}.`, recorded: [], connectors_started: 0, state: 'not_checked' });
  assert.deepEqual(old, { status: 'Not sent: the ChatGPT subscription has not been checked yet (use the control window).', recorded: [], connectors_started: 0, state: 'not_checked' });
});

// ---- QA-SUB-08: an answer that may have been seen -----------------------------------------------------------------------
const NO_KEY = '(no such key)';
const ITS_OWN = '<this request>';
/** An entry of requests[] as the record holds it: how it ended (an answer names its request: said as its own, or not), `shown`, and `presentation` if the key is there. */
const view = (e) => ({ outcome: e.outcome?.answer ? { ...e.outcome, answer: { ...e.outcome.answer, request_id: e.outcome.answer.request_id === e.request_id ? ITS_OWN : 'ANOTHER REQUEST' } } : e.outcome, shown: e.shown, presentation: 'presentation' in e ? e.presentation : NO_KEY });
const answered = (text) => ({ status: 'answered', answer: { request_id: ITS_OWN, text, model: 'vision-model', latency_ms: 1234, thread_id: 'thread-synthetic-1', turn_id: 'turn-synthetic-1' } });
const NOT_SHOWN = { status: 'cancelled', uncertain: true };               // what the record holds of an answer that was not shown: its text is gone

/**
 * One card, eight questions: each way a question can end, as the record holds it once the card has said it. Two of them
 * are answers shown on the card, the first and the sixth entry of the record: what is recorded of a shown answer must
 * not depend on its place in the record.
 */
async function outcomes(t) {
  const w = await app(t);
  await w.select();
  const rows = {};
  let n = 0;
  const ask = async () => { w.page.click('askSubmit'); n += 1; await t.until('sent', () => w.last().asks().length === n && /^Asked at /.test(w.page.ask().status ?? '')); };
  const said = (start) => t.until('the card says how it ended', () => w.page.ask().status?.startsWith(start) === true && w.entry().outcome !== null);
  const shownOnTheCard = () => ({ answer: w.page.ask().answer, badge: w.page.ask().badge, status: w.page.ask().status });
  await ask();
  rows['asked, no answer yet'] = view(w.entry());
  w.last().answer('Seen on the card.');
  await t.until('shown and reported', () => w.entry().shown === true);
  rows['answered and shown on the card'] = view(w.entry());
  const shownCard = shownOnTheCard();
  await ask();
  w.last().fail(w.last().asks().at(-1).id, 'quota');
  await said('No answer');
  rows['refused by the connector (quota)'] = view(w.entry());
  await ask();
  w.page.click('askCancel');
  await said('Cancelled:');
  rows['cancelled, the interruption confirmed'] = view(w.entry());
  w.last().onCancel = 'unconfirmed';
  await ask();
  w.page.click('askCancel');
  await said('Cancelled:');
  rows['cancelled, the interruption not confirmed'] = view(w.entry());
  await ask();
  w.last().answer('AN ANSWER FOR ANOTHER REQUEST', (result) => void (result.request_id = 'ask-0000000000000000.1'));
  await said('No answer');
  rows['an answer bound to another request (refused)'] = view(w.entry());
  await ask();
  w.last().answer('Seen on the card too.');
  await t.until('shown and reported', () => w.entry().shown === true);
  rows['a second answer on the same card, shown'] = view(w.entry());
  const secondCard = shownOnTheCard();
  await ask();
  w.last().exit(1);                                                       // the connector ends with the question out
  await said('No answer');
  rows['no answer came (uncertain)'] = view(w.entry());
  const [record] = w.records();
  // `record_at_the_end`: every entry of the one record, in order, once all are over (the first answer's included).
  return plain({ rows, shown_card: shownCard, second_shown_card: secondCard, record_at_the_end: record.requests.map(view), format: record.format,
    entry_keys: [...new Set(record.requests.flatMap((e) => Object.keys(e)))].sort().join(' '), other_request_s_text_on_device: w.onDevice('AN ANSWER FOR ANOTHER REQUEST') });
}
const ROWS = (shown) => ({
  'asked, no answer yet': { outcome: null, shown: false, presentation: NO_KEY },
  'answered and shown on the card': { outcome: answered('Seen on the card.'), shown: true, presentation: shown },
  'refused by the connector (quota)': { outcome: { status: 'refused', code: 'quota', reason: 'the subscription\'s usage limit was reached' }, shown: false, presentation: NO_KEY },
  'cancelled, the interruption confirmed': { outcome: { status: 'cancelled', uncertain: false }, shown: false, presentation: NO_KEY },
  'cancelled, the interruption not confirmed': { outcome: { status: 'cancelled', uncertain: true }, shown: false, presentation: NO_KEY },
  'an answer bound to another request (refused)': { outcome: { status: 'refused', code: 'unbound', reason: 'the answer is for another request; it is not shown' }, shown: false, presentation: NO_KEY },
  'a second answer on the same card, shown': { outcome: answered('Seen on the card too.'), shown: true, presentation: shown },
  'no answer came (uncertain)': { outcome: { status: 'uncertain', reason: 'no answer came; whether ChatGPT worked on the question is not known' }, shown: false, presentation: NO_KEY },
});
const ANSWERED_STATUS = 'Answered by ChatGPT (vision-model) in 1.2 s, about the picture above and your question only.';
const SHOWN_BADGE = 'Selection · answered by ChatGPT below';
const SHOWN_CARD = { answer: 'Seen on the card.', badge: SHOWN_BADGE, status: ANSWERED_STATUS };
const SECOND_SHOWN_CARD = { answer: 'Seen on the card too.', badge: SHOWN_BADGE, status: ANSWERED_STATUS };
/** What `outcomes` returns: the eight rows, the two cards, and the record at the end (seven entries: the rows without the one seen in flight). */
const OUTCOMES = (shown, entryKeys) => ({ rows: ROWS(shown), shown_card: SHOWN_CARD, second_shown_card: SECOND_SHOWN_CARD, record_at_the_end: Object.values(ROWS(shown)).slice(1), format: 'lc-windows-ask/v1', entry_keys: entryKeys, other_request_s_text_on_device: false });

test('QA-SUB-08 RELEASED, requests[].presentation: an answer shown on the card is recorded shown:true with presentation "shown", the first of the record and a later one on the same card alike, and both are still so when the record holds seven entries; a question in flight and every refused, cancelled or uncertain end has no presentation key', LIMIT, async () => {
  const seen = await outcomes(REL);
  see('QA-SUB-08.outcomes.released', seen);
  assert.deepEqual(seen, OUTCOMES('shown', 'assistance ended_at model outcome presentation question request_id shown submitted_at'));
});

test('QA-SUB-08 NEGATIVE CONTROL (BEFORE), the same eight ends: no entry has a presentation key; a shown answer, first or later, is recorded as answered with shown:true only; everything else is the same as RELEASED', LIMIT, async () => {
  const seen = await outcomes(BEF);
  see('QA-SUB-08.outcomes.before', seen);
  assert.deepEqual(seen, OUTCOMES(NO_KEY, 'assistance ended_at model outcome question request_id shown submitted_at'));
});

/**
 * An answer is shown on the card and reported "shown"; then a report "not shown" for the same request is handed to the
 * main process, as an overlay would (a late or a repeated report). The record file is read before and after.
 */
async function notShownAfterShown(t) {
  const w = await app(t);
  await w.select();
  const text = 'SHOWN, THEN REPORTED NOT SHOWN';
  w.page.click('askSubmit');
  await t.until('sent', () => w.last().asks().length === 1 && /^Asked at /.test(w.page.ask().status ?? ''));
  w.last().answer(text);
  await t.until('shown and reported', () => w.entry().shown === true);
  const [record] = w.records();
  const file = join(record.folder, 'asks', `${record.selection_id}.json`);
  const bytes = readFileSync(file);
  const reported = view(w.entry());
  const late = t.plain(await w.h.handlers['lc:ask-presented'](w.from, record.selection_id, w.entry().request_id, false));
  return plain({ after_the_report_shown: reported, late_report_not_shown_answered: late, after_the_late_report: view(w.entry()), record_file_unchanged: readFileSync(file).equals(bytes),
    entries: w.records()[0].requests.length, text_on_device: w.onDevice(text), card_answer: w.page.ask().answer });
}
const SHOWN_STAYS = (presentation) => {
  const entry = { outcome: answered('SHOWN, THEN REPORTED NOT SHOWN'), shown: true, presentation };
  return { after_the_report_shown: entry, late_report_not_shown_answered: { saved: true, reason: null }, after_the_late_report: entry, record_file_unchanged: true, entries: 1, text_on_device: true, card_answer: 'SHOWN, THEN REPORTED NOT SHOWN' };
};

test('QA-SUB-08 a report "not shown" that comes AFTER the report "shown" changes nothing (this guard is the same on both commits): the entry stays answered with its text, shown:true, and on RELEASED presentation "shown" (BEFORE: no such key); the bytes of the record file are unchanged', LIMIT, async () => {
  const [now, old] = [await notShownAfterShown(REL), await notShownAfterShown(BEF)];
  see('QA-SUB-08.not_shown_after_shown.released', now);
  see('QA-SUB-08.not_shown_after_shown.before', old);
  assert.deepEqual(now, SHOWN_STAYS('shown'));
  assert.deepEqual(old, SHOWN_STAYS(NO_KEY));
});

/**
 * THE FOLLOW-UP OF RELEASED (subscription.ts, the one changed path a card reaches): the connector ends the question
 * that is out as "cancelled" by itself. Nobody pressed Cancel or Stop, so this app has no acknowledgement of an
 * interruption. What the card says and what the record holds.
 */
async function cancelledByTheConnector(t) {
  const w = await app(t);
  await w.select();
  w.page.click('askSubmit');
  await t.until('sent', () => w.last().asks().length === 1 && /^Asked at /.test(w.page.ask().status ?? ''));
  w.last().fail(w.last().asks()[0].id, 'cancelled');
  await t.until('the card says how it ended', () => w.page.ask().status?.startsWith('Cancelled:') === true && w.entry().outcome !== null);
  return plain({ card: { status: w.page.ask().status, badge: w.page.ask().badge, answer: w.page.ask().answer, ask_enabled: w.page.ask().submit }, recorded: view(w.entry()), entries: w.records()[0].requests.length,
    connector_calls: w.last().calls.map((c) => c.method).join(' '), state: w.sub().state, connectors_started: w.fakes.made.length });
}
const CANCELLED_CERTAIN = 'Cancelled: no answer is shown.';
const CANCELLED_UNCERTAIN = 'Cancelled: no answer is shown. Whether ChatGPT stopped working on it is not confirmed; it may still have counted against your usage.';
const CANCELLED_BY_ITSELF = (uncertain) => ({ card: { status: uncertain ? CANCELLED_UNCERTAIN : CANCELLED_CERTAIN, badge: 'Selection · asked: no answer shown', answer: null, ask_enabled: true },
  recorded: { outcome: { status: 'cancelled', uncertain }, shown: false, presentation: NO_KEY }, entries: 1,
  connector_calls: 'connection/read ask/start',                           // no ask/cancel and no session/stop: this app asked for no interruption
  state: 'signed_in', connectors_started: 1 });

test('FOLLOW-UP, THREE COMMITS: a question the connector ends as "cancelled" by itself (no Cancel, no Stop). before and first_release: the card says "Cancelled: no answer is shown." and the record holds cancelled, uncertain:false, as if the interruption were confirmed; released: the card adds "Whether ChatGPT stopped working on it is not confirmed; it may still have counted against your usage." and the record holds uncertain:true. On all three: no answer, one question sent, no cancel sent, the same connector, still signed in', LIMIT, async () => {
  const [before, first, released] = [await cancelledByTheConnector(BEF), await cancelledByTheConnector(FIRST), await cancelledByTheConnector(REL)];
  see('FOLLOW-UP.cancelled_by_the_connector.before', before);
  see('FOLLOW-UP.cancelled_by_the_connector.first_release', first);
  see('FOLLOW-UP.cancelled_by_the_connector.released', released);
  assert.deepEqual(before, CANCELLED_BY_ITSELF(false));
  assert.deepEqual(first, CANCELLED_BY_ITSELF(false));
  assert.deepEqual(released, CANCELLED_BY_ITSELF(true));
  // (The user's OWN Cancel, confirmed by the connector, is still recorded uncertain:false on RELEASED: the row
  // "cancelled, the interruption confirmed" of the outcomes above.)
});

/**
 * An answer the main process recorded and sent to an overlay that has not reported what it did with it, and then:
 *   lost            the overlay takes no message any more (stalled); its renderer is then lost.
 *   stop_bound      the same stalled overlay; the user presses Stop (the control window's lc:stop, so the reason reads
 *                   "stopped by the user"); the app ends the session at its own Stop bound (main.ts waits 10 s
 *                   without progress: the harness runs that timer at once).
 *   stop_confirmed  the overlay is alive but has not yet had the acknowledgement of its Ask (the harness holds it), so
 *                   it has not taken the answer; the user presses Stop and the overlay confirms it.
 *   closed          as stop_confirmed, but the user closes the card.
 *   replaced        as stop_confirmed, but the user makes another selection.
 *   said_not_shown  as stop_confirmed, but the user presses Cancel; the overlay then takes the answer and reports that
 *                   it did not show it.
 * After each, a late report "shown" is handed to the main process, as an overlay would: it must change nothing.
 */
async function unreported(t, how) {
  const w = await app(t, { configure: (c) => void (c.onCancel = 'silent') });
  await w.select();
  const text = `TEXT NOBODY REPORTED (${how})`;
  const stalled = how === 'lost' || how === 'stop_bound';
  const release = stalled ? null : w.page.holdSubmitAck();
  w.page.click('askSubmit');
  await t.until('sent', () => w.last().asks().length === 1 && (!stalled || /^Asked at /.test(w.page.ask().status ?? '')));
  if (stalled) w.stall();
  w.last().answer(text);
  await t.until('the answer is recorded', () => w.entry().outcome !== null);
  const inTransit = { ...view(w.entry()), card_shows_an_answer: w.page.ask().answer !== null };
  const { request_id: request } = w.entry();
  const id = w.records()[0].selection_id;
  const first = () => w.records().find((r) => r.selection_id === id).requests[0];
  let stopping = null;
  if (how === 'lost') w.s.overlay.webContents.emit('render-process-gone', {}, { reason: 'crashed' });
  if (how === 'stop_bound') { await w.press('lc:stop'); const said = t.plain(w.press('lc:session-state')); stopping = [said.running, said.ending]; w.h.fire(10_000); }
  if (how === 'stop_confirmed') await w.press('lc:stop');
  if (how === 'closed') w.page.click('close');
  if (how === 'replaced') { w.circle(600, 120); await t.until('the new selection is kept', () => w.records().length === 2 && w.page.ask().form); }
  if (how === 'said_not_shown') { w.page.click('askCancel'); release(); await t.until('the overlay reported', () => first().outcome.status === 'cancelled'); }
  if (how === 'lost' || how.startsWith('stop')) await t.until('the session ended', () => w.ended() !== null);
  const after = view(first());
  const late = t.plain(await w.h.handlers['lc:ask-presented'](w.from, id, request, true));
  return plain({ in_transit: inTransit, ...(stopping ? { while_stopping_running_ending: stopping } : {}), session_ended: w.ended(), after, text_on_device: w.onDevice(text), late_report_answered: late, after_the_late_report: view(first()),
    connector_calls: w.last().calls.map((c) => c.method).join(' ') });
}
const ENDED = { lost: 'the overlay stopped working (crashed). The overlay stopped working (crashed) before confirming that its newest ink was saved',
  stop_bound: 'stopped by the user. The overlay did not confirm that its newest ink was saved', stop_confirmed: 'stopped by the user' };
/** `presentation`: what the released record says of an answer in transit, or NO_KEY for BEFORE. */
const UNREPORTED = (how, presentation) => {
  const text = `TEXT NOBODY REPORTED (${how})`;
  const transit = { outcome: answered(text), shown: false, presentation };
  const dropped = { outcome: NOT_SHOWN, shown: false, presentation: NO_KEY };
  const sessionEnds = how in ENDED;
  return { in_transit: { ...transit, card_shows_an_answer: false }, ...(how === 'stop_bound' ? { while_stopping_running_ending: [true, true] } : {}), session_ended: sessionEnds ? ENDED[how] : null,
    after: sessionEnds ? transit : dropped, text_on_device: sessionEnds, late_report_answered: sessionEnds ? { saved: false, reason: 'refused' } : { saved: true, reason: null }, after_the_late_report: sessionEnds ? transit : dropped,
    connector_calls: `connection/read ask/start${sessionEnds ? ' session/stop' : ''}` };
};

test('QA-SUB-08 RELEASED: an answer sent to an overlay that never reports is recorded with presentation "unconfirmed" from that moment, and when the session then ends (the renderer lost; Stop at the app\'s bound; Stop confirmed) it stays answered with its text kept, shown:false, presentation "unconfirmed"; a late report is refused', LIMIT, async () => {
  for (const how of ['lost', 'stop_bound', 'stop_confirmed']) {
    const seen = await unreported(REL, how);
    see(`QA-SUB-08.unreported.${how}.released`, seen);
    assert.deepEqual(seen, UNREPORTED(how, 'unconfirmed'), how);
  }
});

test('QA-SUB-08 RELEASED: the card is closed, or replaced by a new selection, before any report, or the overlay itself reports "not shown": the entry becomes cancelled (uncertain), its text is on no file of the device, and it has no presentation key', LIMIT, async () => {
  for (const how of ['closed', 'replaced', 'said_not_shown']) {
    const seen = await unreported(REL, how);
    see(`QA-SUB-08.unreported.${how}.released`, seen);
    assert.deepEqual(seen, UNREPORTED(how, 'unconfirmed'), how);
  }
});

test('QA-SUB-08 NEGATIVE CONTROL (BEFORE), the same six: no presentation key at any moment. What BEFORE kept: after a lost renderer or a Stop the entry stayed answered with its text and shown:false, with nothing to tell it from an answer nobody could have seen; closed, replaced or reported "not shown" it became cancelled without its text, as on RELEASED', LIMIT, async () => {
  for (const how of ['lost', 'stop_bound', 'stop_confirmed', 'closed', 'replaced', 'said_not_shown']) {
    const seen = await unreported(BEF, how);
    see(`QA-SUB-08.unreported.${how}.before`, seen);
    assert.deepEqual(seen, UNREPORTED(how, NO_KEY), how);
  }
});

/**
 * The record cannot be written (the harness fails every write) when the answer comes; the overlay never reports and its
 * renderer is lost. What the session's end says, what the file holds meanwhile, and what the next Start writes.
 */
async function unwritten(t) {
  const w = await app(t);
  await w.select();
  w.page.click('askSubmit');
  await t.until('sent', () => w.last().asks().length === 1 && /^Asked at /.test(w.page.ask().status ?? ''));
  const tried = w.stall();
  w.h.failWrites.on = true;
  w.last().answer('UNWRITTEN AND UNREPORTED');
  await t.until('the main process took the answer', () => tried.includes('lc:ask-result'));
  const meanwhile = view(w.entry());
  w.s.overlay.webContents.emit('render-process-gone', {}, { reason: 'crashed' });
  await t.until('the session ended', () => w.ended() !== null);
  const ended = w.ended();
  w.h.failWrites.on = false;
  await t.running(w.h);                                                   // the next Start writes what was held
  return plain({ file_while_unwritten: meanwhile, session_ended: ended, file_after_the_next_start: view(w.entry()) });
}
const NOTICE = (words) => `${ENDED.lost}. How 1 question(s) to ChatGPT ended (an answer included, ${words}) could not be written to this device (Error: EIO: i/o error (injected)); the selections and their pictures are kept, without that outcome, and writing it is tried again at the next Start and when the app closes`;

test('QA-SUB-08 RELEASED, the unwritten-record notice: the session\'s end says "(an answer included, if one was shown or may have been)"; the next Start writes the held entry as answered, text kept, shown:false, presentation "unconfirmed"', LIMIT, async () => {
  const seen = await unwritten(REL);
  see('QA-SUB-08.unwritten_notice.released', seen);
  assert.deepEqual(seen, { file_while_unwritten: { outcome: null, shown: false, presentation: NO_KEY }, session_ended: NOTICE('if one was shown or may have been'),
    file_after_the_next_start: { outcome: answered('UNWRITTEN AND UNREPORTED'), shown: false, presentation: 'unconfirmed' } });
});

test('QA-SUB-08 NEGATIVE CONTROL (BEFORE), the unwritten-record notice: the same steps said "(an answer included, if one was shown)" although this answer was not shown, and the next Start wrote it with no presentation key', LIMIT, async () => {
  const seen = await unwritten(BEF);
  see('QA-SUB-08.unwritten_notice.before', seen);
  assert.deepEqual(seen, { file_while_unwritten: { outcome: null, shown: false, presentation: NO_KEY }, session_ended: NOTICE('if one was shown'),
    file_after_the_next_start: { outcome: answered('UNWRITTEN AND UNREPORTED'), shown: false, presentation: NO_KEY } });
});
