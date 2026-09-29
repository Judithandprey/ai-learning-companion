#!/usr/bin/env node
// P0-07 focused real-API check of the adapter's answer handling (lead review of 096cac1). No
// browser. Against the released local preview API on the dedicated local test database:
//   1. a save whose answer the client drops after the server responded is left pending, and
//      the next list confirms it from the real saved item (pending lookup + binding check);
//   2. reopening that item passes the binding check with both hashes verified;
//   3. the saved item read directly from the API has no binding problems.
// It shows that real server output is accepted by the stricter checks; the refusals of invalid
// answers are covered by tests/p0-07-preview.test.ts. Uses the same API helper as
// preview-check.mjs (BLOCKED, never a pass, when the test database handoff is unavailable).
//
// Usage: node scripts/preview-binding-check.mjs [--out <dir>]

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { API_COMMIT, newToken, prepareApi } from './preview-api.mjs';
import { createApiStore, savedPreviewProblems } from '../preview/src/api-store.ts';
import { readUtf8Document } from '../preview/src/document.ts';
import { buildSave, StoreError, suggestTitle } from '../preview/src/store.ts';
import { freezeSelection, normalizeRect } from '../src/anchor.ts';
import { buildBridgeRequest } from '../src/bridge.ts';
import { buildExplanationRequest, resolveProbeCard } from '../src/explain.ts';
import { freezeDomSnapshot, randomIds, systemClock } from '../src/frame.ts';

const MODULE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
const outDir = resolve(args.out ?? join(MODULE, '..', '..', 'docs', 'verification', 'web', 'evidence'));
const log = [];
let redact = (text) => String(text);
const note = (line) => {
  const safe = redact(line);
  log.push(`${new Date().toISOString()} ${safe}`);
  console.log(safe);
};

const SAMPLE = '﻿# Binding check — 绑定检查\r\n\r\nThen trace(A²) = λ₁² + λ₂² = 13.\nLast line 🙂';
const REQUEST = 'Why 13?  为什么？ ';
const USER_NOTE = 'My note.\nSecond line ';

async function run(api) {
  const token = newToken();
  api.addSecret(token);
  await api.start(token);
  // Real fetch; the check can drop one POST answer after the server has answered it.
  let dropNextPostAnswer = false;
  const fetchDropping = async (url, init) => {
    const response = await fetch(url, init);
    if (dropNextPostAnswer && init?.method === 'POST') {
      dropNextPostAnswer = false;
      await response.arrayBuffer();
      throw new TypeError('answer dropped by the check after the server responded');
    }
    return response;
  };
  const store = createApiStore({ fetch: fetchDropping, storage: null, ids: randomIds, clock: systemClock });
  const session = await store.connect(token);
  const opened = await readUtf8Document(new TextEncoder().encode(SAMPLE), 'binding-check.md', null);
  if (!opened.ok) throw new Error(opened.reason);
  const source = await store.importDocument(opened.document, 'UTC');

  // One explicit ASK selection, built with the same functions the page uses.
  const viewport = { width: 1280, height: 900, device_pixel_ratio: 1 };
  const rect = { x: 100, y: 200, width: 80, height: 20 };
  const snapshot = {
    kind: 'dom_snapshot/v1',
    captured_at: systemClock(),
    page: { origin: 'http://127.0.0.1:4173', path: '/preview/', query_omitted: true },
    document_version: 'view-1',
    viewport,
    scroll: { x: 0, y: 0 },
    selection: { text: 'trace(A²)', rect },
    context_text: 'Then trace(A²) = λ₁² + λ₂² = 13.',
    media: null,
    pixels: 'not_captured',
  };
  const createdAt = systemClock();
  const frozen = await freezeDomSnapshot(snapshot, store.identity, { source_id: source.source_id, source_version: source.source_version, source_timezone: 'UTC' }, randomIds);
  const selection = freezeSelection(frozen.frame, { id: randomIds.next('sel'), bbox: normalizeRect(rect, viewport), selectedText: 'trace(A²)', inputMode: 'explicit_text_ask', createdAt });
  const request = buildExplanationRequest(selection, randomIds.next('req'), null, 1);
  const item = buildSave({
    itemId: randomIds.next('note'),
    source,
    frame: frozen.frame,
    frameArtifact: frozen.artifactBytes,
    bridgeRequest: buildBridgeRequest(selection, randomIds.next('brq')),
    request,
    card: resolveProbeCard(request, selection, []),
    title: suggestTitle(selection.selected_text),
    requestText: REQUEST,
    userNote: USER_NOTE,
  });

  dropNextPostAnswer = true;
  let saveOutcome = 'saved';
  try {
    await store.save(item);
  } catch (error) {
    saveOutcome = error instanceof StoreError ? error.kind : String(error);
  }
  const listed = (await store.list()).map((e) => ({ item_id: e.item_id, pending: e.pending, saved_at: e.saved_at }));
  let reopened = null;
  let reopenError = null;
  try {
    reopened = await store.get(item.item_id);
  } catch (error) {
    reopenError = String(error?.message ?? error); // recorded as a failing check below
  }
  const direct = await api.readback(item.item_id, token);
  const directProblems = direct.status === 200 ? savedPreviewProblems(direct.body, item.item_id, session.user_id) : [`HTTP ${direct.status}`];
  const checks = [];
  const c = (id, description, pass, observed) => checks.push({ id, description, pass: Boolean(pass), status: pass ? 'pass' : 'fail', observed });
  c('binding.lost_answer_pending_then_confirmed', 'a save whose answer was dropped after the server committed is unknown, then the next list confirms it from the real saved item',
    saveOutcome === 'unknown' && listed.length === 1 && listed[0].item_id === item.item_id && listed[0].pending === false && typeof listed[0].saved_at === 'string',
    { saveOutcome, listed });
  c('binding.reopen_accepted_verified', 'reopening the real saved item passes the binding check; both hashes verify; the user text is exact',
    reopened?.verified.source && reopened.verified.frame && reopened.item.request_text === REQUEST && reopened.item.user_note === USER_NOTE && reopened.document.text === SAMPLE,
    reopened ? { verified: reopened.verified, note: { authorship: reopened.note?.authorship, revision: reopened.note?.revision } } : { error: reopenError });
  c('binding.direct_item_no_problems', 'the saved item read directly from the API has no binding problems', directProblems.length === 0, { status: direct.status, problems: directProblems });
  return { checks, identity: api.identity };
}

const prepared = await prepareApi({ moduleDir: MODULE, uiOrigin: 'http://127.0.0.1:4173', note });
let report;
if ('blocked' in prepared) {
  report = { kind: 'lc-web-p0-07-binding/v1', status: 'blocked', reason: prepared.blocked, checks: [] };
} else {
  redact = prepared.redact;
  try {
    let checks;
    let identity = prepared.identity;
    try {
      ({ checks, identity } = await run(prepared));
    } catch (error) {
      // Any other failure is still reported, never left as an older passing report.
      checks = [{ id: 'binding.run', description: 'the check ran to completion', pass: false, status: 'fail', observed: { error: String(error?.message ?? error) } }];
    }
    const failed = checks.filter((x) => !x.pass).map((x) => x.id);
    report = {
      kind: 'lc-web-p0-07-binding/v1',
      scope: `Node client (no browser) against the released local preview API (backend ${API_COMMIT}) on the dedicated local test database.`,
      api: { backend_commit: API_COMMIT, identity, database: prepared.database, database_host: prepared.hostKind, dsn: 'not recorded' },
      summary: { total: checks.length, passed: checks.length - failed.length, failed },
      checks,
    };
  } finally {
    await prepared.close();
  }
}
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'p0-07-binding-real.json'), `${redact(JSON.stringify(report, null, 2))}\n`);
writeFileSync(join(outDir, 'p0-07-binding-real.log'), `${log.join('\n')}\n`);
note(report.status === 'blocked' ? `BLOCKED: ${report.reason}` : `binding checks passed ${report.summary.passed}/${report.summary.total}; failed: ${report.summary.failed.join(', ') || 'none'}`);
process.exitCode = report.status !== 'blocked' && report.summary.failed.length === 0 ? 0 : 1;
