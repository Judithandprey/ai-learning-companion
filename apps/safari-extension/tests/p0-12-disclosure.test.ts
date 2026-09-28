// P0-12 test-only checks of the planned disclosure gate: named traces for
// A32–A34/A40 and cross-device cases, plus seeded random sequences that check
// invariants across events. Placeholder names; not a contract or runtime code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  apply,
  attemptKey,
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
  type RequestInput,
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
  const current = { problemId: ctx.problemId, problemVersion: ctx.problemVersion, attemptId: ctx.attemptId };
  // Remote events are usually for the current attempt, sometimes for another (possibly visited) one.
  const visited = Object.keys(ctx.saved).map((k) => {
    const [problemId, rest] = k.split('@') as [string, string];
    const [version, attemptId] = rest.split('/') as [string, string];
    return { problemId, problemVersion: Number(version), attemptId };
  });
  const binding = r() < 0.8 ? current : visited.length && r() < 0.5 ? pick(visited) : { problemId: pick(['p1', 'p2']), problemVersion: pick([1, 2]), attemptId: `a${n - 1}` };
  // This device's pending requests, so the server can accept or echo them (causal acknowledgement).
  const mine = ctx.pending.flatMap((i) => (i.kind === 'request' ? [i.id] : []));
  const accepted = mine.length && r() < 0.4 ? [pick(mine)] : [];
  const echo = ctx.activeRequest?.origin === 'this_device' && r() < 0.3 ? { id: ctx.activeRequest.id, level: ctx.activeRequest.level, scope: ctx.activeRequest.scope, origin: 'this_device' as const } : null;
  switch (Math.floor(r() * 16)) {
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
      return { type: 'remote_policy', binding, policyVersion: ctx.policyVersion + pick([-1, 0, 1, 2]), teaching: 'help', request: echo ?? { ...request, origin: 'other_device' }, acknowledgedClose: r() < 0.3, acceptedRequests: accepted };
    case 9:
      return { type: 'remote_policy', binding, policyVersion: ctx.policyVersion + pick([-1, 1]), teaching: 'explore', request: null, acknowledgedClose: r() < 0.3, acceptedRequests: accepted };
    case 10:
      return { type: 'disconnect' };
    case 11:
      return {
        type: 'reconnect',
        binding,
        policyVersion: ctx.policyVersion + pick([-1, 0, 1]),
        teaching: 'help',
        request: r() < 0.4 ? null : echo ?? { ...request, origin: pick(['this_device', 'other_device'] as const) },
        acceptedProvisional: accepted,
        acknowledgedClose: r() < 0.5,
      };
    case 12:
      return { type: 'voice_mode', mode: pick(['silent', 'discussion'] as const) };
    case 13:
      return { type: 'backfilled_request', request: { ...request, origin: 'this_device' }, spokenAt: Math.floor(r() * n) };
    case 14:
      // An old (not newer) snapshot carrying acknowledgements must not count.
      return { type: 'remote_policy', binding: current, policyVersion: ctx.policyVersion - pick([0, 1]), teaching: 'help', request: { ...request, origin: 'other_device' }, acknowledgedClose: true, acceptedRequests: mine };
    default:
      return r() < 0.5 ? { type: 'temporary_language', language: pick(['zh', 'en']) } : { type: 'preference', version: ctx.preference.version + 1, language: pick(['en', 'zh']) };
  }
}

const sameAttempt = (b: { problemId: string; problemVersion: number; attemptId: string }, ctx: Context): boolean =>
  b.problemId === ctx.problemId && b.problemVersion === ctx.problemVersion && b.attemptId === ctx.attemptId;

type OracleIntent = { readonly at: number; readonly kind: 'close' | 'request'; readonly id: string; readonly level: Level; readonly madeAt: number; readonly offline: boolean; dropped: boolean };
type OracleSnapshot = { readonly at: number; readonly v: number; readonly request: RequestInput | null; readonly ackClose: boolean; readonly accepted: ReadonlyArray<string> };

/**
 * Independent, history-based specification of what the current attempt may show (R53; plan
 * §1 rules 7 and 9; ADR 0002 §6 and §8). It never reads the model's context. It keeps the raw
 * history of each attempt: this device's intents with the server version it had applied when
 * making them, and the snapshots it received in order. From that history alone:
 * - cap(): the most that may be shown now. It is set by this device's latest intent unless a
 *   snapshot received after it, newer than it and than every snapshot already applied, proves
 *   the server has it or a later intent ("let me try" allows nothing; the user's own request
 *   allows at most its level).
 * - expected(): with no cap, exactly the request of the latest snapshot applied since the
 *   attempt was (re-)entered, or none.
 */
class Oracle {
  cur = 'p1@1/a0';
  private sync: 'fresh' | 'disconnected' = 'fresh';
  private t = 0;
  private readonly ver = new Map<string, number>();
  private readonly visited = new Set<string>(['p1@1/a0']);
  private readonly intents = new Map<string, OracleIntent[]>();
  private readonly proofs = new Map<string, OracleSnapshot[]>();
  private readonly current = new Map<string, OracleSnapshot | null>();
  /** The request made by the last event, for the liveness check. */
  justRequested: RequestInput | null = null;

  private key(b: { problemId: string; problemVersion: number; attemptId: string }): string {
    return `${b.problemId}@${b.problemVersion}/${b.attemptId}`;
  }
  private of<T>(m: Map<string, T[]>, k: string): T[] {
    if (!m.has(k)) m.set(k, []);
    return m.get(k)!;
  }
  private proves(s: OracleSnapshot, j: OracleIntent): boolean {
    return s.at > j.at && s.v > j.madeAt && (j.kind === 'close' ? s.ackClose : s.accepted.includes(j.id) || s.request?.id === j.id);
  }
  /** Acknowledged if some counted snapshot proves it or any later intent of the same attempt (intents are sent in order). */
  acknowledged(k: string, i: OracleIntent): boolean {
    const later = this.of(this.intents, k).filter((j) => j.at >= i.at);
    return this.of(this.proofs, k).some((s) => later.some((j) => this.proves(s, j)));
  }
  latestIntent(): OracleIntent | undefined {
    return this.of(this.intents, this.cur).at(-1);
  }
  cap(): Level | null {
    const last = this.latestIntent();
    if (!last || this.acknowledged(this.cur, last)) return null;
    return last.kind === 'close' ? 'none' : last.level;
  }
  expected(): RequestInput | null {
    return this.current.get(this.cur)?.request ?? null;
  }
  private enter(k: string): void {
    this.cur = k;
    this.visited.add(k);
    this.current.set(k, null); // help never carries over into a (re-)entered attempt
  }
  private receive(k: string, e: { policyVersion: number; request: RequestInput | null; acknowledgedClose?: boolean }, accepted: ReadonlyArray<string>, counts: boolean): void {
    if (!counts) return;
    const s: OracleSnapshot = { at: this.t, v: e.policyVersion, request: e.request, ackClose: e.acknowledgedClose === true, accepted };
    this.ver.set(k, e.policyVersion);
    this.of(this.proofs, k).push(s);
    if (k === this.cur) this.current.set(k, s);
  }
  step(e: Event): void {
    this.t++;
    this.justRequested = null;
    const k = this.cur;
    const v = this.ver.get(k) ?? 0;
    switch (e.type) {
      case 'enter_problem':
        return this.enter(this.key(e));
      case 'new_attempt': {
        const [p] = k.split('/') as [string];
        return this.enter(`${p}/${e.attemptId}`);
      }
      case 'let_me_try':
      case 'stop_telling':
        this.of(this.intents, k).push({ at: this.t, kind: 'close', id: '', level: 'none', madeAt: v, offline: this.sync === 'disconnected', dropped: false });
        return;
      case 'request':
        this.of(this.intents, k).push({ at: this.t, kind: 'request', id: e.request.id, level: e.request.level, madeAt: v, offline: this.sync === 'disconnected', dropped: false });
        this.justRequested = e.request;
        return;
      case 'disconnect':
        this.sync = 'disconnected';
        return;
      case 'remote_policy': {
        if (this.sync !== 'fresh') return;
        const target = this.key(e.binding);
        if (target !== k && !this.visited.has(target)) return;
        this.receive(target, e, e.acceptedRequests ?? [], e.policyVersion > (this.ver.get(target) ?? 0));
        return;
      }
      case 'reconnect': {
        const target = this.key(e.binding);
        const wasFresh = this.sync === 'fresh';
        this.sync = 'fresh';
        const known = target === k || this.visited.has(target);
        const tv = this.ver.get(target) ?? 0;
        if (known) this.receive(target, e, e.acceptedProvisional, target === k && !wasFresh ? e.policyVersion >= tv : e.policyVersion > tv);
        // Offline requests the server did not acknowledge are no longer answered at reconnect.
        if (!wasFresh) for (const i of this.of(this.intents, k)) if (i.kind === 'request' && i.offline && !this.acknowledged(k, i)) i.dropped = true;
        return;
      }
      default:
        return;
    }
  }
}

test('P0-12 invariants hold over 3,000 seeded random sequences', () => {
  let checks = 0;
  const reached = {
    connectedCloseThenSnapshot: 0,
    downgradeThenSnapshot: 0,
    ackedByEcho: 0,
    ackedByAcceptance: 0,
    ackedByCloseFlag: 0,
    staleAckIgnored: 0,
    foreignAckKept: 0,
    droppedStillCaps: 0,
    loweredByNewerSnapshot: 0,
    identityChecked: 0,
    staleReconnect: 0,
    scopedPresented: 0,
    cacheHits: 0,
    backfillWhileCapped: 0,
  };
  for (let seed = 1; seed <= 3000; seed++) {
    const r = prng(seed);
    let ctx = apply(initialContext('p0', 1, 'a0'), { type: 'enter_problem', problemId: 'p1', problemVersion: 1, attemptId: 'a0' });
    const generated: Item[] = [];
    const oracle = new Oracle();
    for (let n = 0; n < 40; n++) {
      const before = ctx;
      const e = randomEvent(r, ctx, n);
      const capBefore = oracle.cap();
      const lastBefore = oracle.latestIntent();
      if (e.type === 'reconnect' && e.policyVersion < before.policyVersion) reached.staleReconnect++;
      if (e.type === 'backfilled_request' && capBefore !== null) reached.backfillWhileCapped++;
      ctx = apply(ctx, e);
      oracle.step(e);
      const cap = oracle.cap();
      if ((e.type === 'remote_policy' || e.type === 'reconnect') && capBefore !== null && lastBefore && sameAttempt(e.binding, before)) {
        if (lastBefore.kind === 'close' && !lastBefore.offline) reached.connectedCloseThenSnapshot++;
        if (lastBefore.kind === 'request' && rank(lastBefore.level) < rank(e.request?.level ?? 'none')) reached.downgradeThenSnapshot++;
        if (cap === null) {
          if (e.request?.id === lastBefore.id) reached.ackedByEcho++;
          else if ((e.type === 'remote_policy' ? e.acceptedRequests ?? [] : e.acceptedProvisional).length) reached.ackedByAcceptance++;
          else reached.ackedByCloseFlag++;
        } else if (e.acknowledgedClose && e.policyVersion <= before.policyVersion) reached.staleAckIgnored++;
      }
      if (e.type === 'remote_policy' && !sameAttempt(e.binding, before) && e.acknowledgedClose && before.saved[attemptKey(e.binding)]?.pending.length) reached.foreignAckKept++;
      // I4: observations never change permission or teaching state.
      // I4 also covers AUDIO-14: a backfilled transcript request is history, not a live request.
      if (e.type === 'pause' || e.type === 'erase' || e.type === 'wrong_step' || e.type === 'time_passes' || e.type === 'backfilled_request') assert.equal(ctx, before, `seed ${seed}: ${e.type} changed the context`);
      // I13: the model and the oracle agree on the current attempt.
      assert.equal(`${ctx.problemId}@${ctx.problemVersion}/${ctx.attemptId}`, oracle.cur, `seed ${seed}: attempt mismatch`);
      const active = ctx.activeRequest;
      const view = (x: { id: string; level: Level; scope: string | null } | null): string => (x ? `${x.id}@${x.level}/${x.scope}` : 'none');
      // I16 (history cap, R53): nothing above what this device's latest unacknowledged intent allows.
      if (cap !== null) {
        assert.ok(rank(ctx.permission.level) <= rank(cap), `seed ${seed}: permission ${ctx.permission.level} above cap ${cap} after ${e.type}`);
        const last = oracle.latestIntent()!;
        if (last.kind === 'close') assert.ok(!active || rank(active.level) === 0, `seed ${seed}: help open over an unacknowledged close after ${e.type}`);
        else if (!last.dropped) {
          // The user's own request, or a strictly lower server request after a newer unacknowledged snapshot.
          assert.ok(!active || active.id === last.id || rank(active.level) < rank(last.level), `seed ${seed}: ${view(active)} replaced own request ${last.id} after ${e.type}`);
          if (active && active.id !== last.id) reached.loweredByNewerSnapshot++;
        } else {
          reached.droppedStillCaps++;
          assert.ok(!active || (active.id !== last.id && rank(active.level) <= rank(last.level)), `seed ${seed}: dropped request ${last.id} still answered or exceeded`);
        }
      } else {
        // I15 (identity, liveness as well as safety): with nothing pending the latest applied server request decides.
        reached.identityChecked++;
        assert.equal(view(active), view(oracle.expected()), `seed ${seed}: active request differs from the server's after ${e.type}`);
      }
      // I17 (liveness): the user's own request applies at once, exactly.
      if (oracle.justRequested) assert.equal(view(active), view(oracle.justRequested), `seed ${seed}: own request not applied`);
      // I10: the active request always belongs to the current attempt; fresh state never keeps a provisional request.
      if (active) assert.ok(sameAttempt(active, ctx), `seed ${seed}: request for another attempt is active`);
      if (ctx.sync === 'fresh') assert.notEqual(active?.provisional, true, `seed ${seed}: provisional request survived reconnect`);
      const level = LEVELS[Math.floor(r() * LEVELS.length)]!;
      generated.push({
        id: `i${seed}-${n}`,
        channel: CHANNELS[Math.floor(r() * CHANNELS.length)]!,
        problemId: ctx.problemId,
        problemVersion: ctx.problemVersion,
        attemptId: ctx.attemptId,
        basisRevision: r() < 0.1 ? null : ctx.attemptRevision,
        requestId: r() < 0.15 ? null : (active?.id ?? null),
        level,
        scope: level === 'step_check' || (active?.scope && r() < 0.5) ? (r() < 0.5 ? 's1' : 's2') : null,
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
        // I16 on presentation: never above the history cap; with no cap, only for the server's current request.
        if (disclosing && cap !== null) assert.ok(rank(it.level) <= rank(cap), `seed ${seed}: ${it.id} (${it.level}) above cap ${cap}`);
        if (disclosing && cap === null) assert.equal(it.requestId, oracle.expected()?.id, `seed ${seed}: ${it.id} answers a request the server does not hold`);
        // I2: never for another problem, version, attempt or revision; only status may be revision-independent.
        assert.ok(sameAttempt(it, ctx));
        if (it.basisRevision !== null) assert.equal(it.basisRevision, ctx.attemptRevision);
        else assert.equal(rank(it.level), 0);
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
