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
  // Sometimes a snapshot names an id already known in the attempt (possibly one this device superseded).
  const id = ctx.seen.length && r() < 0.2 ? pick(ctx.seen) : `r${n}`;
  const request = { id, level, scope: level === 'step_check' ? pick(['s1', 's2']) : null };
  const current = { problemId: ctx.problemId, problemVersion: ctx.problemVersion, attemptId: ctx.attemptId };
  // Remote events are usually for the current attempt, sometimes for another (possibly visited) one.
  const visited = Object.keys(ctx.saved).map((k) => {
    const [problemId, rest] = k.split('@') as [string, string];
    const [version, attemptId] = rest.split('/') as [string, string];
    return { problemId, problemVersion: Number(version), attemptId };
  });
  const binding = r() < 0.75 ? current : visited.length && r() < 0.7 ? pick(visited) : { problemId: pick(['p1', 'p2']), problemVersion: pick([1, 2]), attemptId: `a${n - 1}` };
  // Versions of snapshots for a visited attempt are relative to what this device recorded for it.
  const base = ctx.saved[attemptKey(binding)]?.policyVersion ?? ctx.policyVersion;
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
      return { type: 'remote_policy', binding, policyVersion: base + pick([-1, 0, 1, 2]), teaching: 'help', request: echo ?? { ...request, origin: 'other_device' }, acknowledgedClose: r() < 0.3, acceptedRequests: accepted };
    case 9:
      return { type: 'remote_policy', binding, policyVersion: base + pick([-1, 0, 1]), teaching: 'explore', request: null, acknowledgedClose: r() < 0.4, acceptedRequests: accepted };
    case 10:
      return { type: 'disconnect' };
    case 11:
      return {
        type: 'reconnect',
        binding,
        policyVersion: base + pick([-1, 0, 1]),
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

type OracleIntent = {
  readonly at: number;
  readonly kind: 'close' | 'request';
  readonly id: string;
  readonly level: Level;
  readonly scope: string | null;
  readonly madeAt: number;
  readonly offline: boolean;
  /** Request ids known in the attempt when the intent was made: rule 7 retires them. */
  readonly retires: ReadonlySet<string>;
  dropped: boolean;
};
type OracleSnapshot = { readonly at: number; readonly v: number; readonly request: RequestInput | null; readonly ackClose: boolean; readonly accepted: ReadonlyArray<string> };
type Cap =
  | { readonly kind: 'close' }
  | { readonly kind: 'own'; readonly intent: OracleIntent }
  | { readonly kind: 'dropped'; readonly intents: ReadonlyArray<OracleIntent> };

const fitsScope = (r: { level: Level; scope: string | null }, scope: string | null): boolean => scope === null || r.scope === scope || rank(r.level) === 0;

/**
 * Independent, history-based specification of what the current attempt may show (R53; plan
 * §1 rules 7 and 9; ADR 0002 §6 and §8). It never reads the model's context. For each attempt
 * it keeps the raw history: this device's intents (with the version it had applied and the
 * request ids known when it made them) and the snapshots that count, in order. From that
 * history alone:
 * - acknowledged: a snapshot strictly newer than every snapshot applied before it, and newer
 *   than the intent's version, proves a request by acceptance or echo (and every earlier
 *   intent), and proves closes by the flag only up to the next request it does not prove;
 * - cap(): with an unacknowledged latest intent, "let me try" allows nothing, the user's own
 *   request allows its level and step scope, and a dropped offline request allows only what
 *   every unacknowledged intent allows;
 * - expected(): with no cap, the request of the latest snapshot applied since the attempt
 *   was (re-)entered (or since a reconnect for another attempt made it stale), unless rule 7
 *   retired it.
 */
class Oracle {
  cur = 'p1@1/a0';
  private sync: 'fresh' | 'disconnected' = 'fresh';
  private t = 0;
  private readonly ver = new Map<string, number>();
  private readonly visited = new Set<string>(['p1@1/a0']);
  private readonly intents = new Map<string, OracleIntent[]>();
  private readonly proofs = new Map<string, OracleSnapshot[]>();
  private readonly applied = new Map<string, OracleSnapshot[]>();
  private readonly current = new Map<string, OracleSnapshot | null>();
  private readonly known = new Map<string, Set<string>>();
  /** The request made by the last event, for the liveness check. */
  justRequested: RequestInput | null = null;

  private key(b: { problemId: string; problemVersion: number; attemptId: string }): string {
    return `${b.problemId}@${b.problemVersion}/${b.attemptId}`;
  }
  private of<T>(m: Map<string, T[]>, k: string): T[] {
    if (!m.has(k)) m.set(k, []);
    return m.get(k)!;
  }
  private knownOf(k: string): Set<string> {
    if (!this.known.has(k)) this.known.set(k, new Set());
    return this.known.get(k)!;
  }
  retired(k = this.cur): Set<string> {
    return new Set(this.of(this.intents, k).flatMap((i) => [...i.retires]));
  }
  live(r: RequestInput | null, k = this.cur): RequestInput | null {
    return r && !this.retired(k).has(r.id) ? r : null;
  }
  /** Index of the last acknowledged intent of attempt k (-1: none). */
  private ackedThrough(k: string): number {
    const list = this.of(this.intents, k);
    let through = -1;
    for (const s of this.of(this.proofs, k)) {
      const before = list.filter((i) => i.at < s.at);
      before.forEach((i, idx) => {
        if (i.kind === 'request' && s.v > i.madeAt && (s.accepted.includes(i.id) || s.request?.id === i.id)) through = Math.max(through, idx);
      });
      if (s.ackClose) for (let j = through + 1; j < before.length && before[j]!.kind === 'close' && s.v > before[j]!.madeAt; j++) through = j;
    }
    return through;
  }
  unacknowledged(k = this.cur): OracleIntent[] {
    return this.of(this.intents, k).slice(this.ackedThrough(k) + 1);
  }
  latestIntent(): OracleIntent | undefined {
    return this.of(this.intents, this.cur).at(-1);
  }
  cap(): Cap | null {
    const open = this.unacknowledged();
    const last = open.at(-1);
    if (!last) return null;
    if (last.kind === 'close') return { kind: 'close' };
    return last.dropped ? { kind: 'dropped', intents: open } : { kind: 'own', intent: last };
  }
  /** Whether content at this level and scope may be shown under the cap. */
  allows(cap: Cap, x: { level: Level; scope: string | null }): boolean {
    if (cap.kind === 'close') return rank(x.level) === 0;
    const bounds = cap.kind === 'own' ? [cap.intent] : cap.intents;
    return bounds.every((i) => (i.kind === 'close' ? rank(x.level) === 0 : rank(x.level) <= rank(i.level) && fitsScope(x, i.scope)));
  }
  expected(): RequestInput | null {
    return this.live(this.current.get(this.cur)?.request ?? null);
  }
  latestApplied(): OracleSnapshot | null {
    return this.current.get(this.cur) ?? null;
  }
  /** Requests of snapshots applied for the current attempt after its latest intent. */
  appliedSinceLatestIntent(): RequestInput[] {
    const at = this.latestIntent()?.at ?? -1;
    return this.of(this.applied, this.cur).filter((s) => s.at > at && s.request).map((s) => s.request!);
  }
  private enter(k: string): void {
    this.cur = k;
    this.visited.add(k);
    this.current.set(k, null); // help never carries over into a (re-)entered attempt
  }
  private receive(k: string, e: { policyVersion: number; request: RequestInput | null; acknowledgedClose?: boolean }, accepted: ReadonlyArray<string>, applies: boolean): void {
    const prev = this.ver.get(k) ?? 0;
    const s: OracleSnapshot = { at: this.t, v: e.policyVersion, request: e.request, ackClose: e.acknowledgedClose === true, accepted };
    if (e.policyVersion > prev) this.of(this.proofs, k).push(s); // only a strictly newer snapshot acknowledges
    if (!applies) return;
    this.ver.set(k, Math.max(prev, e.policyVersion));
    if (k === this.cur) {
      this.current.set(k, s);
      this.of(this.applied, k).push(s);
      if (e.request) this.knownOf(k).add(e.request.id);
    }
  }
  private intent(kind: 'close' | 'request', r: RequestInput | null): void {
    const k = this.cur;
    const retires = new Set([...this.knownOf(k)].filter((id) => id !== r?.id));
    this.of(this.intents, k).push({ at: this.t, kind, id: r?.id ?? '', level: r?.level ?? 'none', scope: r?.scope ?? null, madeAt: this.ver.get(k) ?? 0, offline: this.sync === 'disconnected', retires, dropped: false });
    if (r) this.knownOf(k).add(r.id);
  }
  step(e: Event): void {
    this.t++;
    this.justRequested = null;
    const k = this.cur;
    switch (e.type) {
      case 'enter_problem':
        return this.enter(this.key(e));
      case 'new_attempt': {
        const [p] = k.split('/') as [string];
        return this.enter(`${p}/${e.attemptId}`);
      }
      case 'let_me_try':
      case 'stop_telling':
        return this.intent('close', null);
      case 'request':
        this.intent('request', e.request);
        this.justRequested = e.request;
        return;
      case 'disconnect':
        this.sync = 'disconnected';
        return;
      case 'remote_policy': {
        if (this.sync !== 'fresh') return;
        const target = this.key(e.binding);
        if (target !== k && !this.visited.has(target)) return;
        const newer = e.policyVersion > (this.ver.get(target) ?? 0);
        this.receive(target, e, e.acceptedRequests ?? [], newer);
        return;
      }
      case 'reconnect': {
        const target = this.key(e.binding);
        const wasFresh = this.sync === 'fresh';
        this.sync = 'fresh';
        const tv = this.ver.get(target) ?? 0;
        if (target === k) this.receive(target, e, e.acceptedProvisional, wasFresh ? e.policyVersion > tv : e.policyVersion >= tv);
        else {
          if (this.visited.has(target)) this.receive(target, e, e.acceptedProvisional, e.policyVersion > tv);
          // After a disconnection, a snapshot for another attempt leaves this attempt's server state stale.
          if (!wasFresh) this.current.set(k, null);
        }
        if (!wasFresh) {
          // Offline requests still unacknowledged are no longer answered, in every attempt.
          for (const a of this.visited) for (const i of this.unacknowledged(a)) if (i.kind === 'request' && i.offline) i.dropped = true;
        }
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
    loweringRequestThenHigherSnapshot: 0,
    ackedByEcho: 0,
    ackedByAcceptance: 0,
    ackedByCloseFlag: 0,
    staleAckIgnored: 0,
    equalVersionReconnectAckIgnored: 0,
    foreignAckKept: 0,
    droppedStillCaps: 0,
    loweredByNewerSnapshot: 0,
    stepCheckClosedBySnapshot: 0,
    retiredRequestIgnored: 0,
    foreignReconnectStale: 0,
    identityChecked: 0,
    staleReconnect: 0,
    scopedPresented: 0,
    cacheHits: 0,
    backfillWhileCapped: 0,
  };
  const view = (x: { id: string; level: Level; scope: string | null } | null): string => (x ? `${x.id}@${x.level}/${x.scope}` : 'none');
  for (let seed = 1; seed <= 3000; seed++) {
    const r = prng(seed);
    let ctx = apply(initialContext('p0', 1, 'a0'), { type: 'enter_problem', problemId: 'p1', problemVersion: 1, attemptId: 'a0' });
    const generated: Item[] = [];
    const oracle = new Oracle();
    const lowering = new Set<string>(); // requests that lowered the help shown before them
    for (let n = 0; n < 40; n++) {
      const before = ctx;
      const e = randomEvent(r, ctx, n);
      const capBefore = oracle.cap();
      const lastBefore = oracle.latestIntent();
      const retiredBefore = oracle.retired();
      if (e.type === 'reconnect' && e.policyVersion < before.policyVersion) reached.staleReconnect++;
      if (e.type === 'backfilled_request' && capBefore !== null) reached.backfillWhileCapped++;
      if (e.type === 'request' && before.activeRequest && rank(before.activeRequest.level) > rank(e.request.level)) lowering.add(e.request.id);
      ctx = apply(ctx, e);
      oracle.step(e);
      const cap = oracle.cap();
      const snapshotHere = (e.type === 'remote_policy' || e.type === 'reconnect') && sameAttempt(e.binding, before);
      if (snapshotHere && capBefore !== null && lastBefore) {
        const acks = e.type === 'remote_policy' ? e.acceptedRequests ?? [] : e.acceptedProvisional;
        if (lastBefore.kind === 'close' && !lastBefore.offline) reached.connectedCloseThenSnapshot++;
        if (cap === null) {
          if (lastBefore.kind === 'request' && e.request?.id === lastBefore.id) reached.ackedByEcho++;
          else if (lastBefore.kind === 'request' && acks.includes(lastBefore.id)) reached.ackedByAcceptance++;
          else if (lastBefore.kind === 'close' && e.acknowledgedClose) reached.ackedByCloseFlag++;
        } else if ((e.acknowledgedClose || acks.length) && e.policyVersion < before.policyVersion) reached.staleAckIgnored++;
        else if (e.type === 'reconnect' && before.sync !== 'fresh' && e.policyVersion === before.policyVersion && (e.acknowledgedClose || acks.length)) reached.equalVersionReconnectAckIgnored++;
        if (e.request && retiredBefore.has(e.request.id)) reached.retiredRequestIgnored++;
      }
      if (e.type === 'reconnect' && before.sync !== 'fresh' && !sameAttempt(e.binding, before)) reached.foreignReconnectStale++;
      if ((e.type === 'remote_policy' || e.type === 'reconnect') && !sameAttempt(e.binding, before)) {
        const key = attemptKey(e.binding);
        if ((before.saved[key]?.pending.length ?? 0) > (ctx.saved[key]?.pending.length ?? 0)) reached.foreignAckKept++;
      }
      // I4: observations never change permission or teaching state.
      // I4 also covers AUDIO-14: a backfilled transcript request is history, not a live request.
      if (e.type === 'pause' || e.type === 'erase' || e.type === 'wrong_step' || e.type === 'time_passes' || e.type === 'backfilled_request') assert.equal(ctx, before, `seed ${seed}: ${e.type} changed the context`);
      // I13: the model and the oracle agree on the current attempt.
      assert.equal(`${ctx.problemId}@${ctx.problemVersion}/${ctx.attemptId}`, oracle.cur, `seed ${seed}: attempt mismatch`);
      const active = ctx.activeRequest;
      if (cap !== null) {
        // I16 (history cap, R53): nothing above, or outside the step of, what this device's unacknowledged intents allow.
        assert.ok(!active || oracle.allows(cap, active), `seed ${seed}: ${view(active)} exceeds the ${cap.kind} cap after ${e.type}`);
        if (cap.kind === 'close') assert.ok(!active || rank(active.level) === 0, `seed ${seed}: help open over an unacknowledged close after ${e.type}`);
        else if (cap.kind === 'own') {
          const own = cap.intent;
          // The user's own request, or a strictly lower, unretired request of a snapshot applied after it, within its step.
          const fromSnapshot = oracle.appliedSinceLatestIntent().some((x) => x.id === active?.id);
          assert.ok(!active || active.id === own.id || (fromSnapshot && !oracle.retired().has(active.id) && rank(active.level) < rank(own.level) && fitsScope(active, own.scope)), `seed ${seed}: ${view(active)} replaced own request ${own.id} after ${e.type}`);
          if (active && active.id !== own.id) reached.loweredByNewerSnapshot++;
          if (!active && own.scope && snapshotHere) reached.stepCheckClosedBySnapshot++;
          if (snapshotHere && own === lastBefore && lowering.has(own.id) && e.request && rank(e.request.level) > rank(own.level)) reached.loweringRequestThenHigherSnapshot++;
        } else {
          reached.droppedStillCaps++;
          // Only the latest applied snapshot's request, if every unacknowledged intent allows it; never this device's own.
          assert.ok(!active || (view(active) === view(oracle.expected()) && !cap.intents.some((i) => i.id === active.id)), `seed ${seed}: dropped request state shows ${view(active)}`);
        }
      } else {
        // I15 (identity, liveness as well as safety): with nothing pending the latest applied, unretired server request decides.
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
        // I16 on presentation: never above or outside the history cap; with no cap, only for the server's current request.
        if (disclosing && cap !== null) assert.ok(oracle.allows(cap, it), `seed ${seed}: ${it.id} (${it.level}/${it.scope}) outside the ${cap.kind} cap`);
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
      // I8: a cache hit matches every binding field of the request and context, and is never a derivative of higher content.
      if (ctx.activeRequest) {
        const hit = cacheHit(ctx, ctx.activeRequest, generated);
        if (hit) {
          reached.cacheHits++;
          assert.equal(hit.level, ctx.activeRequest.level);
          assert.equal(hit.scope, ctx.activeRequest.scope);
          assert.ok(sameAttempt(hit, ctx));
          assert.ok(hit.basisRevision === ctx.attemptRevision || (hit.basisRevision === null && rank(hit.level) === 0));
          assert.equal(hit.preferenceKey, preferenceKey(ctx));
          assert.ok(hit.derivedFrom.every((l) => rank(l) <= rank(hit.level)));
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
