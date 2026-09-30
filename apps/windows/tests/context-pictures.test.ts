// Context pictures of saved ink (userData/ink/context/<sha256>.png): an address already taken is trusted only if it
// holds exactly the picture's bytes in a regular file. Otherwise nothing is overwritten, the good bytes are kept, the
// ink stays recoverable and the state is said.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { forkDesktopInk, parseDesktopInk, type DesktopInk } from '../src/shared/desktop-ink.ts';
import * as crypto from 'node:crypto';
import { harness, plain, PNG_BYTES, PNG_SHA, running, withStroke, type FakeWindow } from './main-harness.ts';

type S = { overlay: FakeWindow; doc: DesktopInk };
const sender = (s: S) => ({ sender: s.overlay.webContents });
const save = (h: ReturnType<typeof harness>, s: S, doc: DesktopInk, pictures = [{ sha256: PNG_SHA, bytes: PNG_BYTES }]) =>
  plain(h.handlers['lc:save-ink']!(sender(s), JSON.parse(JSON.stringify(doc)), pictures)) as { ok: boolean; reason?: string; pictures_received: string[] };
const picturePath = (h: ReturnType<typeof harness>): string => path.join(h.userData, 'ink', 'context', `${PNG_SHA}.png`);
const states = (h: ReturnType<typeof harness>, id: string): string[] => ((plain(h.inkContexts(id)) as { items: Array<{ picture_state: string }> }).items ?? []).map((i) => i.picture_state);
const other = Uint8Array.from(PNG_BYTES, (b, i) => (i === PNG_BYTES.length - 6 ? b ^ 1 : b)); // same length, other bytes

test('an unchanged picture is written once, reused without being rewritten, and read back', async () => {
  const h = harness();
  const s = (await running(h)) as unknown as S;
  const doc = withStroke(s.doc);
  assert.equal(save(h, s, doc).ok, true);
  const before = fs.statSync(picturePath(h));
  assert.equal(save(h, s, { ...doc }).ok, true);
  const after = fs.statSync(picturePath(h));
  assert.deepEqual([after.ino, after.mtimeMs], [before.ino, before.mtimeMs]);
  assert.deepEqual(states(h, doc.id), ['shown']);
});

test('an address taken by other bytes, a short file or a directory is left untouched; the save is refused and the ink kept with the good picture, exported and written once the address is free', async () => {
  for (const [what, make] of [
    ['other bytes', (p: string) => fs.writeFileSync(p, other)],
    ['a short file', (p: string) => fs.writeFileSync(p, PNG_BYTES.subarray(0, 20))],
    ['a directory', (p: string) => fs.mkdirSync(p)],
  ] as const) {
    const h = harness();
    const s = (await running(h)) as unknown as S;
    const doc = withStroke(s.doc);
    fs.mkdirSync(path.dirname(picturePath(h)), { recursive: true });
    make(picturePath(h));
    const snapshot = fs.lstatSync(picturePath(h));
    const answer = save(h, s, doc);
    assert.equal(answer.ok, false, what);
    assert.match(answer.reason!, /context picture already stored as .*ink[\\/]context[\\/][0-9a-f]{64}\.png is not its bytes .* left untouched\. Move it away, then Retry; or export this ink; the ink is kept in this app/);
    assert.ok(answer.reason!.includes(picturePath(h)), 'where it is, so the user can move it');
    assert.deepEqual(answer.pictures_received, [PNG_SHA], 'the good picture was received and is held');
    const now = fs.lstatSync(picturePath(h));
    assert.deepEqual([now.ino, now.mtimeMs, now.size], [snapshot.ino, snapshot.mtimeMs, snapshot.size], `${what}: untouched`);
    assert.equal(fs.existsSync(path.join(h.userData, 'ink', `${doc.id}.json`)), false, 'the ink is not written with a picture it cannot keep');
    // Recoverable: exported with the good picture, not the bytes found at the address.
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lc-export-')), 'ink.json');
    assert.deepEqual(plain(h.exportRecovery(doc.id, out)), { ok: true, missing: 0 });
    const exported = JSON.parse(fs.readFileSync(out, 'utf8')) as { context_pictures_png_base64: Record<string, string> };
    assert.equal(exported.context_pictures_png_base64[PNG_SHA], Buffer.from(PNG_BYTES).toString('base64'));
    // Once the address is free, Retry writes the ink and the good picture; the original strokes are all there.
    fs.rmSync(picturePath(h), { recursive: true });
    assert.equal((plain(h.retryRecovery(doc.id)) as { ok: boolean }).ok, true);
    assert.deepEqual(new Uint8Array(fs.readFileSync(picturePath(h))), new Uint8Array(PNG_BYTES));
    const saved = parseDesktopInk(JSON.parse(fs.readFileSync(path.join(h.userData, 'ink', `${doc.id}.json`), 'utf8')), doc.ink.page.address_sha256);
    assert.ok(saved.ok && saved.doc.ink.visible.length === 1 && saved.doc.ink.history.length === 1);
    assert.deepEqual(states(h, doc.id), ['shown']);
  }
});

test('a picture changed on disk after it was saved is said when read back, never exported as that picture, and not replaced', async () => {
  const h = harness();
  const s = (await running(h)) as unknown as S;
  const doc = withStroke(s.doc);
  assert.equal(save(h, s, doc).ok, true);
  fs.writeFileSync(picturePath(h), other);
  assert.deepEqual(states(h, doc.id), ['changed on disk']);
  // The next change cannot be written (the ink folder is failing): it is kept, and its export lists that picture as
  // not matching instead of carrying the changed bytes.
  h.failWrites.on = true;
  const next = { ...doc, created_at: doc.created_at }; // same document, saved again while writing fails
  assert.equal(save(h, s, next, []).ok, false);
  h.failWrites.on = false;
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lc-export-')), 'ink.json');
  assert.deepEqual(plain(h.exportRecovery(doc.id, out)), { ok: true, missing: 1 });
  const exported = JSON.parse(fs.readFileSync(out, 'utf8')) as { context_pictures_png_base64: Record<string, string>; context_pictures_missing: string[]; context_pictures_not_matching: Array<{ sha256: string; reason: string }> };
  assert.equal(exported.context_pictures_png_base64[PNG_SHA], undefined);
  assert.deepEqual(exported.context_pictures_missing, [PNG_SHA]);
  assert.match(exported.context_pictures_not_matching[0]!.reason, /the file there has other bytes/);
  assert.deepEqual(new Uint8Array(fs.readFileSync(picturePath(h))), other, 'left untouched');
  // A link in place of the picture is not the picture, even to a true copy.
  const copy = path.join(h.userData, 'copy.png');
  fs.writeFileSync(copy, PNG_BYTES);
  fs.rmSync(picturePath(h));
  fs.symlinkSync(copy, picturePath(h));
  assert.deepEqual(states(h, doc.id), ['not a file']);
});

test('a failed write keeps the ink and the picture; Retry writes both', async () => {
  const h = harness();
  const s = (await running(h)) as unknown as S;
  const doc = withStroke(s.doc);
  h.failWrites.on = true;
  assert.equal(save(h, s, doc).ok, false);
  h.failWrites.on = false;
  assert.equal((plain(h.retryRecovery(doc.id)) as { ok: boolean }).ok, true);
  assert.deepEqual(new Uint8Array(fs.readFileSync(picturePath(h))), new Uint8Array(PNG_BYTES));
  assert.deepEqual(states(h, doc.id), ['shown']);
});

test('while a picture cannot be kept at its address, its good bytes stay held through other saves, so the kept ink still exports them', async () => {
  const h = harness();
  const s = (await running(h)) as unknown as S;
  const doc = withStroke(s.doc);
  fs.mkdirSync(path.dirname(picturePath(h)), { recursive: true });
  fs.writeFileSync(picturePath(h), other);
  assert.equal(save(h, s, doc).ok, false);
  // A separate copy (with no pictures) saves: held pictures are pruned then, but not this one.
  const copyId = 'fedcba9876543210';
  const copy = forkDesktopInk(s.doc, copyId, crypto.createHash('sha256').update(copyId).digest('hex'), '2026-09-30T12:00:00.000Z');
  assert.equal(save(h, s, copy, []).ok, true);
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lc-export-')), 'ink.json');
  assert.deepEqual(plain(h.exportRecovery(doc.id, out)), { ok: true, missing: 0 });
  const exported = JSON.parse(fs.readFileSync(out, 'utf8')) as { context_pictures_png_base64: Record<string, string> };
  assert.equal(exported.context_pictures_png_base64[PNG_SHA], Buffer.from(PNG_BYTES).toString('base64'));
});
