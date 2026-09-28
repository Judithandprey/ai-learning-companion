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
  assert.ok(fixture.traces.length >= 18);
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
  switch (Math.floor(r() * 15)) {
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
      return { type: 'remote_policy', binding, policyVersion: ctx.policyVersion + pick([-1, 1, 2]), teaching: 'help', request: { ...request, origin: 'other_device' }, acknowledgedClose: r() < 0.3 };
    case 9:
      return { type: 'remote_policy', binding, policyVersion: ctx.policyVersion + 1, teaching: 'explore', request: null, acknowledgedClose: r() < 0.3 };
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
    case 13:
      return { type: 'backfilled_request', request: { ...request, origin: 'this_device' }, spokenAt: Math.floor(r() * n) };
    default:
      return r() < 0.5 ? { type: 'temporary_language', language: pick(['zh', 'en']) } : { type: 'preference', version: ctx.preference.version + 1, language: pick(['en', 'zh']) };
  }
}

const sameAttempt = (b: { problemId: string; problemVersion: number; attemptId: string }, ctx: Context): boolean =>
  b.problemId === ctx.problemId && b.problemVersion === ctx.problemVersion && b.attemptId === ctx.attemptId;

/**
 * Independent oracle for "may the current attempt disclose anything?", written from the
 * plan's rules (§1 rules 7 and 9) with its own state. It never reads the model's context:
 * its own per-attempt server versions, unacknowledged offline closes, current request
 * origin and provisional request.
 */
class Oracle {
  cur = { problemId: 'p1', problemVersion: 1, attemptId: 'a0' };
  sync: 'fresh' | 'disconnected' = 'fresh';
  open = false;
  /** Id of the active request when it was made on this device, otherwise null. */
  localRequest: string | null = null;
  provisional: string | null = null;
  readonly ver = new Map<string, number>();
  readonly unacked = new Set<string>();
  key(b = this.cur): string {
    return `${b.problemId}@${b.problemVersion}/${b.attemptId}`;
  }
  private reset(): void {
    this.open = false;
    this.localRequest = null;
    this.provisional = null;
  }
  private snapshot(v: number, hasRequest: boolean, ack: boolean): void {
    const k = this.key();
    this.ver.set(k, v);
    if (this.unacked.has(k) && !ack) {
      // Restrictive only: a snapshot may close help but never reopen it.
      if (!hasRequest) this.reset();
      return;
    }
    this.unacked.delete(k);
    this.open = hasRequest;
    this.localRequest = null;
  }
  step(e: Event): void {
    const k = this.key();
    switch (e.type) {
      case 'enter_problem':
        this.cur = { problemId: e.problemId, problemVersion: e.problemVersion, attemptId: e.attemptId };
        this.reset();
        return;
      case 'new_attempt':
        this.cur = { ...this.cur, attemptId: e.attemptId };
        this.reset();
        return;
      case 'let_me_try':
      case 'stop_telling':
        this.reset();
        if (this.sync === 'disconnected') this.unacked.add(k);
        return;
      case 'request':
        this.open = true;
        this.localRequest = e.request.id;
        this.provisional = this.sync === 'disconnected' ? e.request.id : null;
        return;
      case 'disconnect':
        this.sync = 'disconnected';
        return;
      case 'backfilled_request':
        // AUDIO-14: late transcript/backfill is history; it never opens help or resolves a close.
        return;
      case 'remote_policy':
        if (this.sync !== 'fresh' || this.key(e.binding) !== k || e.policyVersion <= (this.ver.get(k) ?? 0)) return;
        this.snapshot(e.policyVersion, e.request !== null, e.acknowledgedClose === true);
        return;
      case 'reconnect': {
        const matches = this.key(e.binding) === k;
        if (this.sync === 'fresh') {
          if (matches && e.policyVersion > (this.ver.get(k) ?? 0)) this.snapshot(e.policyVersion, e.request !== null, e.acknowledgedClose);
          return;
        }
        this.sync = 'fresh';
        if (this.provisional !== null && matches && e.acceptedProvisional.includes(this.provisional)) {
          this.unacked.delete(k);
          this.ver.set(k, Math.max(this.ver.get(k) ?? 0, e.policyVersion));
          this.provisional = null;
          return;
        }
        if (this.provisional !== null) this.reset();
        if (!matches || e.policyVersion < (this.ver.get(k) ?? 0)) return;
        this.snapshot(e.policyVersion, e.request !== null, e.acknowledgedClose);
        return;
      }
      default:
        return;
    }
  }
}

test('P0-12 invariants hold over 3,000 seeded random sequences', () => {
  let checks = 0;
  const reached = { reconnectWithRequest: 0, staleReconnect: 0, snapshotWhileUnacked: 0, localRequestWhileUnacked: 0, ackResolvedClose: 0, foreignRemote: 0, scopedPresented: 0, cacheHits: 0, backfillWhileClosed: 0, backfillWhileUnacked: 0 };
  for (let seed = 1; seed <= 3000; seed++) {
    const r = prng(seed);
    let ctx = apply(initialContext('p0', 1, 'a0'), { type: 'enter_problem', problemId: 'p1', problemVersion: 1, attemptId: 'a0' });
    const generated: Item[] = [];
    const oracle = new Oracle();
    for (let n = 0; n < 40; n++) {
      const before = ctx;
      const e = randomEvent(r, ctx, n);
      const unackedBefore = oracle.unacked.has(oracle.key());
      if ((e.type === 'remote_policy' || e.type === 'reconnect') && unackedBefore) reached.snapshotWhileUnacked++;
      if (e.type === 'request' && unackedBefore) reached.localRequestWhileUnacked++;
      if (e.type === 'backfilled_request' && !oracle.open) reached.backfillWhileClosed++;
      if (e.type === 'backfilled_request' && unackedBefore) reached.backfillWhileUnacked++;
      if ((e.type === 'remote_policy' || e.type === 'reconnect') && e.type === 'reconnect' && e.request) reached.reconnectWithRequest++;
      if (e.type === 'reconnect' && e.policyVersion < before.policyVersion) reached.staleReconnect++;
      if (e.type === 'remote_policy' && !sameAttempt(e.binding, before)) reached.foreignRemote++;
      ctx = apply(ctx, e);
      oracle.step(e);
      if (unackedBefore && !oracle.unacked.has(oracle.key())) reached.ackResolvedClose++;
      // I4: observations never change permission or teaching state.
      // I4 also covers AUDIO-14: a backfilled transcript request is history, not a live request.
      if (e.type === 'pause' || e.type === 'erase' || e.type === 'wrong_step' || e.type === 'time_passes' || e.type === 'backfilled_request') assert.equal(ctx, before, `seed ${seed}: ${e.type} changed the context`);
      // I13: the model and the oracle agree on the current attempt.
      assert.equal(`${ctx.problemId}@${ctx.problemVersion}/${ctx.attemptId}`, oracle.key(), `seed ${seed}: attempt mismatch`);
      // I15 (liveness as well as safety): the model has an active request exactly when the oracle says help is open.
      assert.equal(ctx.activeRequest !== null, oracle.open, `seed ${seed}: model and oracle disagree on open help after ${e.type}`);
      // I14: while a close is unacknowledged, only this device's own later request can be active.
      if (oracle.unacked.has(oracle.key()) && ctx.activeRequest) {
        assert.equal(ctx.activeRequest.id, oracle.localRequest, `seed ${seed}: a server snapshot reopened help over an unacknowledged close`);
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
        if (!oracle.open) assert.equal(rank(it.level), 0, `seed ${seed}: disclosed while the oracle says closed (${it.id})`);
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
