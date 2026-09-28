// P0-12 test-only checks of the planned disclosure gate: named traces for
// A32–A34/A40 and cross-device cases, plus seeded random sequences that check
// invariants across events. Placeholder names; not a contract or runtime code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  apply,
  cacheHit,
  decide,
  initialContext,
  LEVELS,
  preferenceKey,
  rank,
  revalidate,
  type Channel,
  type Context,
  type Event,
  type Item,
  type Level,
  type Surfaces,
} from './p0-12/disclosure-model.ts';

type Gen = { id: string; channel: Channel; level: Level; requestId?: string | null; scope?: string | null; attemptIndependent?: boolean; derivedFrom?: Level[]; show?: boolean; queueVoice?: boolean; cache?: boolean };
type Step =
  | { event: Event }
  | { generate: Gen }
  | { present: string; expect: boolean; reason: string }
  | { cache: string; expect: string | null }
  | { surfaces: { withdrawn: string[]; flushed: string[] } }
  | { expectPreferenceKey: string };
type Trace = { id: string; covers: string[]; steps: Step[] };

const fixture = JSON.parse(readFileSync(new URL('./p0-12/disclosure-traces.json', import.meta.url), 'utf8')) as { traces: Trace[] };

function snapshot(ctx: Context, g: Gen): Item {
  return {
    id: g.id,
    channel: g.channel,
    problemId: ctx.problemId,
    problemVersion: ctx.problemVersion,
    attemptId: ctx.attemptId,
    basisRevision: g.attemptIndependent ? null : ctx.attemptRevision,
    requestId: g.requestId === undefined ? (ctx.activeRequest?.id ?? null) : g.requestId,
    level: g.level,
    scope: g.scope ?? null,
    preferenceKey: preferenceKey(ctx),
    derivedFrom: g.derivedFrom ?? [],
  };
}

function runTrace(trace: Trace): void {
  let ctx = initialContext('none', 1, 'none');
  const items = new Map<string, Item>();
  let surfaces: Surfaces = { shown: [], voiceQueue: [], cache: [] };
  let withdrawn: string[] = [];
  let flushed: string[] = [];
  const settle = (): void => {
    const r = revalidate(ctx, surfaces);
    surfaces = r.surfaces;
    withdrawn.push(...r.withdrawn);
    flushed.push(...r.flushed);
  };
  trace.steps.forEach((step, i) => {
    const at = `${trace.id} step ${i + 1}`;
    if ('event' in step) {
      ctx = apply(ctx, step.event);
      settle(); // every event re-checks what is visible or queued
    } else if ('generate' in step) {
      const item = snapshot(ctx, step.generate);
      items.set(item.id, item);
      if (step.generate.show) {
        assert.equal(decide(ctx, item).present, true, `${at}: item marked show must pass the gate at generation`);
        surfaces = { ...surfaces, shown: [...surfaces.shown, item] };
      }
      if (step.generate.queueVoice) surfaces = { ...surfaces, voiceQueue: [...surfaces.voiceQueue, item] };
      if (step.generate.cache) surfaces = { ...surfaces, cache: [...surfaces.cache, item] };
    } else if ('present' in step) {
      const item = items.get(step.present);
      assert.ok(item, `${at}: unknown item ${step.present}`);
      assert.deepEqual(decide(ctx, item), { present: step.expect, reason: step.reason }, at);
    } else if ('cache' in step) {
      assert.ok(ctx.activeRequest && ctx.activeRequest.id === step.cache, `${at}: cache lookup needs the active request`);
      const hit = cacheHit(ctx, ctx.activeRequest, surfaces.cache);
      assert.equal(hit ? hit.id : null, step.expect, at);
      if (hit) {
        assert.equal(hit.requestId, step.cache, `${at}: a reused cache entry is rebound to the new request`);
        assert.equal(decide(ctx, hit).present, true, `${at}: a cache hit must pass the gate`);
      }
    } else if ('surfaces' in step) {
      assert.deepEqual({ withdrawn: [...withdrawn].sort(), flushed: [...flushed].sort() }, { withdrawn: [...step.surfaces.withdrawn].sort(), flushed: [...step.surfaces.flushed].sort() }, at);
      withdrawn = [];
      flushed = [];
    } else {
      assert.equal(preferenceKey(ctx), step.expectPreferenceKey, at);
    }
  });
}

test('P0-12 traces: each named trace matches the planned gate decisions', () => {
  assert.ok(fixture.traces.length >= 12);
  const covered = new Set(fixture.traces.flatMap((t) => t.covers));
  for (const a of ['A32', 'A33', 'A34', 'A40', 'R53', 'R57']) assert.ok(covered.has(a), `traces cover ${a}`);
  for (const trace of fixture.traces) runTrace(trace);
});

// ---- seeded random sequences --------------------------------------------------

function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CHANNELS: Channel[] = ['card', 'title', 'diagram', 'notification', 'review_summary', 'supplement', 'voice'];

function randomEvent(r: () => number, ctx: Context, n: number): Event {
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
  const level = pick(LEVELS);
  const request = { id: `r${n}`, level, scope: level === 'step_check' ? pick(['s1', 's2']) : null };
  // Remote events are usually for the current attempt, sometimes for another one.
  const binding = r() < 0.8 ? { problemId: ctx.problemId, problemVersion: ctx.problemVersion, attemptId: ctx.attemptId } : { problemId: pick(['p1', 'p2']), problemVersion: pick([1, 2]), attemptId: `a${n - 1}` };
  switch (Math.floor(r() * 14)) {
    case 0:
      // Sometimes the statement changes (new version) while the attempt id stays the same.
      return { type: 'enter_problem', problemId: pick(['p1', 'p2']), problemVersion: pick([1, 2]), attemptId: r() < 0.3 ? ctx.attemptId : `a${n}` };
    case 1:
      return { type: 'new_attempt', attemptId: `a${n}` };
    case 2:
      return { type: 'attempt_revised', revision: ctx.attemptRevision + 1 };
    case 3:
      return { type: pick(['pause', 'erase', 'wrong_step', 'time_passes'] as const) };
    case 4:
      return { type: 'let_me_try' };
    case 5:
      return { type: 'stop_telling' };
    case 6:
    case 7:
      return { type: 'request', request: { ...request, origin: 'this_device' } };
    case 8:
      return { type: 'remote_policy', binding, policyVersion: ctx.policyVersion + pick([-1, 1, 2]), teaching: 'help', request: { ...request, origin: 'other_device' } };
    case 9:
      return { type: 'remote_policy', binding, policyVersion: ctx.policyVersion + 1, teaching: 'explore', request: null };
    case 10:
      return { type: 'disconnect' };
    case 11:
      return {
        type: 'reconnect',
        binding,
        policyVersion: ctx.policyVersion + pick([-1, 0, 1]),
        teaching: 'help',
        request: r() < 0.5 ? null : { ...request, origin: pick(['this_device', 'other_device'] as const) },
        acceptedProvisional: r() < 0.5 && ctx.activeRequest ? [ctx.activeRequest.id] : [],
        acknowledgedClose: r() < 0.5,
      };
    case 12:
      return { type: 'voice_mode', mode: pick(['silent', 'discussion'] as const) };
    default:
      return r() < 0.5 ? { type: 'temporary_language', language: pick(['zh', 'en']) } : { type: 'preference', version: ctx.preference.version + 1, language: pick(['en', 'zh']) };
  }
}

const sameAttempt = (b: { problemId: string; problemVersion: number; attemptId: string }, ctx: Context): boolean =>
  b.problemId === ctx.problemId && b.problemVersion === ctx.problemVersion && b.attemptId === ctx.attemptId;

test('P0-12 invariants hold over 3,000 seeded random sequences', () => {
  let checks = 0;
  const reached = { reconnectWithRequest: 0, staleReconnect: 0, offlineCloseThenReconnect: 0, foreignRemote: 0, scopedPresented: 0, cacheHits: 0 };
  for (let seed = 1; seed <= 3000; seed++) {
    const r = prng(seed);
    let ctx = apply(initialContext('p0', 1, 'a0'), { type: 'enter_problem', problemId: 'p1', problemVersion: 1, attemptId: 'a0' });
    const generated: Item[] = [];
    // Independent oracle for "nothing disclosing after a close until a new explicit, applicable request".
    let closedByUser = true;
    let offlineClose = false;
    for (let n = 0; n < 40; n++) {
      const before = ctx;
      const e = randomEvent(r, ctx, n);
      ctx = apply(ctx, e);
      // I4: observations never change permission or teaching state.
      if (e.type === 'pause' || e.type === 'erase' || e.type === 'wrong_step' || e.type === 'time_passes') assert.equal(ctx, before, `seed ${seed}: ${e.type} changed the context`);
      switch (e.type) {
        case 'let_me_try':
        case 'stop_telling':
          closedByUser = true;
          if (before.sync !== 'fresh') offlineClose = true;
          break;
        case 'enter_problem':
        case 'new_attempt':
          closedByUser = true;
          offlineClose = false;
          break;
        case 'request':
          closedByUser = false;
          offlineClose = false;
          break;
        case 'remote_policy':
          if (!sameAttempt(e.binding, before)) reached.foreignRemote++;
          if (before.sync === 'fresh' && sameAttempt(e.binding, before) && e.policyVersion > before.policyVersion) closedByUser = e.request === null;
          break;
        case 'reconnect':
          if (before.sync === 'fresh') {
            // resync while connected: same ordering as a remote policy
            if (sameAttempt(e.binding, before) && e.policyVersion > before.policyVersion) closedByUser = e.request === null;
            break;
          }
          if (e.request) reached.reconnectWithRequest++;
          if (e.policyVersion < before.policyVersion) reached.staleReconnect++;
          if (offlineClose) reached.offlineCloseThenReconnect++;
          {
            const acceptedLocal = before.activeRequest?.provisional === true && sameAttempt(e.binding, before) && e.acceptedProvisional.includes(before.activeRequest.id);
            if (acceptedLocal) closedByUser = false;
            else if (before.activeRequest?.provisional) closedByUser = true;
            if (!acceptedLocal && sameAttempt(e.binding, before) && e.policyVersion >= before.policyVersion && !(offlineClose && !e.acknowledgedClose)) closedByUser = e.request === null;
            offlineClose = false;
          }
          break;
        default:
          break;
      }
      // I10: the active request always belongs to the current attempt; fresh state never keeps a provisional request.
      if (ctx.activeRequest) assert.ok(sameAttempt(ctx.activeRequest, ctx), `seed ${seed}: request for another attempt is active`);
      if (ctx.sync === 'fresh') assert.notEqual(ctx.activeRequest?.provisional, true, `seed ${seed}: provisional request survived reconnect`);
      const level = LEVELS[Math.floor(r() * LEVELS.length)]!;
      const req = ctx.activeRequest;
      generated.push({
        id: `i${seed}-${n}`,
        channel: CHANNELS[Math.floor(r() * CHANNELS.length)]!,
        problemId: ctx.problemId,
        problemVersion: ctx.problemVersion,
        attemptId: ctx.attemptId,
        basisRevision: r() < 0.1 ? null : ctx.attemptRevision,
        requestId: r() < 0.15 ? null : (req?.id ?? null),
        level,
        scope: level === 'step_check' || (req?.scope && r() < 0.5) ? (r() < 0.5 ? 's1' : 's2') : null,
        preferenceKey: preferenceKey(ctx),
        derivedFrom: r() < 0.3 ? [LEVELS[Math.floor(r() * LEVELS.length)]!] : [],
      });
      for (const it of generated) {
        const d = decide(ctx, it);
        checks++;
        if (!d.present) continue;
        const disclosing = rank(it.level) > 0;
        // I1: never above the current permission.
        assert.ok(!disclosing || rank(it.level) <= rank(ctx.permission.level), `seed ${seed}: ${it.id} exceeds permission`);
        // I2: never for another problem, version, attempt or revision; only status may be revision-independent.
        assert.ok(sameAttempt(it, ctx));
        if (it.basisRevision !== null) assert.equal(it.basisRevision, ctx.attemptRevision);
        else assert.equal(rank(it.level), 0);
        // I3 (independent oracle): after a close, nothing disclosing until a new explicit applicable request.
        if (closedByUser) assert.equal(rank(it.level), 0, `seed ${seed}: disclosed after a close (${it.id})`);
        // I6: derivatives are never labeled below their sources.
        for (const src of it.derivedFrom) assert.ok(rank(src) <= rank(it.level));
        // I7: stale state never authorizes another device's permission or disclosing voice.
        if (ctx.sync !== 'fresh' && disclosing) {
          assert.equal(ctx.activeRequest?.origin, 'this_device');
          if (it.channel === 'voice') assert.ok(rank(it.level) < rank('local_next_step'));
        }
        // I11: previews are generic.
        if (it.channel === 'notification') assert.equal(rank(it.level), 0);
        // I12: a step check discloses nothing outside the pointed step.
        if (disclosing && ctx.activeRequest?.scope) {
          reached.scopedPresented++;
          assert.equal(it.scope, ctx.activeRequest.scope, `seed ${seed}: disclosed outside the checked step`);
        }
        // I5: voice only in an explicit voice discussion.
        if (it.channel === 'voice') assert.equal(ctx.voiceMode, 'discussion');
        // I9: presented content matches the current language/preference key.
        assert.equal(it.preferenceKey, preferenceKey(ctx));
      }
      // I8: a cache hit matches every binding field of the request and context.
      if (ctx.activeRequest) {
        const hit = cacheHit(ctx, ctx.activeRequest, generated);
        if (hit) {
          reached.cacheHits++;
          assert.equal(hit.level, ctx.activeRequest.level);
          assert.equal(hit.scope, ctx.activeRequest.scope);
          assert.ok(sameAttempt(hit, ctx));
          assert.ok(hit.basisRevision === ctx.attemptRevision || (hit.basisRevision === null && rank(hit.level) === 0));
          assert.equal(hit.preferenceKey, preferenceKey(ctx));
        }
      }
    }
  }
  assert.ok(checks > 150000, `ran ${checks} gate checks`);
  // The generator must actually reach the paths the invariants are about.
  for (const [k, v] of Object.entries(reached)) assert.ok(v > 50, `path ${k} reached only ${v} times`);
});

test('temporary language override is scoped to its problem', () => {
  let ctx = initialContext('p1', 1, 'a1');
  ctx = apply(ctx, { type: 'temporary_language', language: 'zh' });
  assert.equal(preferenceKey(ctx), 'pref1:zh:override');
  ctx = apply(ctx, { type: 'enter_problem', problemId: 'p2', problemVersion: 1, attemptId: 'a2' });
  assert.equal(preferenceKey(ctx), 'pref1:en');
  assert.equal(ctx.preference.language, 'en', 'the persistent default is unchanged by a temporary override');
});
