// P0-12 TEST-ONLY reference model of the disclosure gate (R53/R57, A32–A34, A40).
// It states the planned rules in executable form so traces and invariants can be
// checked deterministically. It is NOT a runtime implementation and NOT a shared
// contract: all names here are local placeholders until the lead's P0-08 contract
// defines the real fields. Nothing in src/ imports this file.

/** Ordered disclosure levels (engineering default; P0-08/P0-10 may rename them). */
export const LEVELS = ['none', 'clarify_goal', 'key_concept', 'step_check', 'local_next_step', 'full_solution'] as const;
export type Level = (typeof LEVELS)[number];
export const rank = (l: Level): number => LEVELS.indexOf(l);

export type Channel = 'card' | 'title' | 'diagram' | 'notification' | 'review_summary' | 'supplement' | 'voice';
export type Origin = 'this_device' | 'other_device';
export type Sync = 'fresh' | 'disconnected';

/** The problem attempt a request or policy belongs to. */
export type Binding = { readonly problemId: string; readonly problemVersion: number; readonly attemptId: string };

export type Request = Binding & {
  readonly id: string;
  readonly level: Level;
  /** Step the user pointed at for "check this step"; null otherwise. */
  readonly scope: string | null;
  readonly origin: Origin;
  /** Attempt revision the request was made against. */
  readonly basisRevision: number;
  /** Made while this device was disconnected. Whether the server has it is tracked by `Context.pending`. */
  readonly provisional: boolean;
};

export type Context = {
  readonly problemId: string;
  readonly problemVersion: number;
  readonly attemptId: string;
  readonly attemptRevision: number;
  readonly teaching: 'explore' | 'help' | 'review';
  readonly permission: { readonly level: Level; readonly scope: string | null };
  readonly activeRequest: Request | null;
  /** Server-ordered version of this problem attempt's teaching policy; never a wall clock. */
  readonly policyVersion: number;
  /**
   * This device's intents for this attempt that the server has not acknowledged yet, oldest
   * first, whether made while connected or not. While any is pending, the latest one decides
   * what may be shown and server snapshots may only restrict it (see `Intent`).
   */
  readonly pending: ReadonlyArray<Intent>;
  /** What the latest server snapshot applied for this attempt says. */
  readonly server: ServerView;
  /** Policy version and unacknowledged intents of other problem attempts this device has left. */
  readonly saved: Readonly<Record<string, { readonly policyVersion: number; readonly pending: ReadonlyArray<Intent> }>>;
  readonly sync: Sync;
  readonly voiceMode: 'silent' | 'discussion';
  /** R57: persistent preference version plus an optional problem-scoped override. */
  readonly preference: { readonly version: number; readonly language: string; readonly override: { readonly problemId: string; readonly language: string } | null };
};

/**
 * "Let me try"/"stop telling me" (close) or this device's own request, kept until the server
 * acknowledges it. Only causal evidence acknowledges an intent: a snapshot newer than
 * `madeAt` (and than every snapshot already applied) with `acknowledgedClose` (for a close),
 * or with the request id among its accepted requests or as its current request. A newer
 * version alone, reconnecting, or an older or other-attempt snapshot is not evidence. Intents
 * are sent in order, so acknowledging one also acknowledges every earlier one (a causally
 * later accepted request resolves a close).
 *
 * The latest pending intent decides: a close shows nothing; the user's own request is
 * answered at its level, and snapshots newer than it may only restrict it. A request made
 * offline that the server did not accept at reconnect is no longer answered (the user can
 * ask again) but still limits what the server may show to its level.
 */
export type Intent =
  | { readonly kind: 'close'; readonly madeAt: number }
  | {
      readonly kind: 'request';
      readonly id: string;
      readonly level: Level;
      /** Policy version this device had applied when it made the intent; a snapshot at or below it cannot contain the intent. */
      readonly madeAt: number;
      /** Made while disconnected. */
      readonly provisional: boolean;
      /** False once an offline request was not accepted at reconnect. */
      readonly answerable: boolean;
    };

export type ServerView = { readonly request: RequestInput | null; readonly teaching: Context['teaching'] };

export type Item = {
  readonly id: string;
  readonly channel: Channel;
  readonly problemId: string;
  readonly problemVersion: number;
  readonly attemptId: string;
  /** Attempt revision the content was generated from; null only for non-disclosing (level none) content. */
  readonly basisRevision: number | null;
  /** The request this content answers; null = proactive (unrequested). */
  readonly requestId: string | null;
  readonly level: Level;
  readonly scope: string | null;
  readonly preferenceKey: string;
  /** Levels of the content this item was derived from (a title from a card, a preview from a summary...). */
  readonly derivedFrom: ReadonlyArray<Level>;
};

export type Decision = { readonly present: boolean; readonly reason: string };

export function preferenceKey(ctx: Pick<Context, 'preference' | 'problemId'>): string {
  const o = ctx.preference.override;
  const language = o && o.problemId === ctx.problemId ? o.language : ctx.preference.language;
  return `pref${ctx.preference.version}:${language}${o && o.problemId === ctx.problemId ? ':override' : ''}`;
}

const HIGH_VOICE: Level = 'local_next_step';

/**
 * The single gate every final presentation channel must pass at the moment of
 * display or playback (not when generated or queued). Order matters only for the
 * reported reason; any failing rule blocks.
 */
export function decide(ctx: Context, item: Item): Decision {
  const no = (reason: string): Decision => ({ present: false, reason });
  if (item.problemId !== ctx.problemId || item.problemVersion !== ctx.problemVersion) return no('stale_problem');
  if (item.attemptId !== ctx.attemptId) return no('stale_attempt');
  // Only non-disclosing status may be attempt-independent; any help is bound to the revision it saw.
  if (item.basisRevision === null ? rank(item.level) > 0 : item.basisRevision !== ctx.attemptRevision) return no('stale_revision');
  if (item.derivedFrom.some((l) => rank(l) > rank(item.level))) return no('derivative_labeled_below_source');
  if (item.preferenceKey !== preferenceKey(ctx)) return no('stale_preference');
  // R09: nothing is spoken outside an explicit voice discussion, not even status.
  if (item.channel === 'voice' && ctx.voiceMode !== 'discussion') return no('silent_mode');
  // Previews can show on lock screens and other devices and cannot be reliably recalled: they stay generic.
  if (item.channel === 'notification' && rank(item.level) > 0) return no('preview_must_be_generic');
  if (item.requestId === null) {
    // Quiet following: unrequested content may not disclose anything.
    return rank(item.level) === 0 ? { present: true, reason: 'non_disclosing_status' } : no('unrequested_disclosure');
  }
  const req = ctx.activeRequest;
  if (!req || req.id !== item.requestId) return no('request_superseded_or_cancelled');
  if (req.problemId !== ctx.problemId || req.problemVersion !== ctx.problemVersion || req.attemptId !== ctx.attemptId) return no('request_for_another_attempt');
  if (rank(item.level) > rank(req.level) || rank(item.level) > rank(ctx.permission.level)) return no('exceeds_permission');
  // "Check this step" answers that step only: anything disclosing must be about exactly that step.
  if (req.scope !== null && rank(item.level) > 0 && item.scope !== req.scope) return no('outside_checked_step');
  if (item.level === 'step_check' && item.scope !== req.scope) return no('outside_checked_step');
  if (ctx.sync !== 'fresh') {
    // Stale state never authorizes disclosure; only this device's own request may be answered.
    if (req.origin !== 'this_device') return no('stale_remote_permission');
    if (item.channel === 'voice' && rank(item.level) >= rank(HIGH_VOICE)) return no('no_voice_disclosure_while_disconnected');
  }
  return { present: true, reason: 'current' };
}

// ---- state transitions -------------------------------------------------------

export type Event =
  | { readonly type: 'enter_problem'; readonly problemId: string; readonly problemVersion: number; readonly attemptId: string }
  | { readonly type: 'new_attempt'; readonly attemptId: string }
  | { readonly type: 'attempt_revised'; readonly revision: number }
  /** Observations that must never change permission. */
  | { readonly type: 'pause' | 'erase' | 'wrong_step' | 'time_passes' }
  | { readonly type: 'let_me_try' }
  | { readonly type: 'stop_telling' }
  /** A request made on this device is bound to the current problem attempt. */
  | { readonly type: 'request'; readonly request: RequestInput }
  /**
   * AUDIO-14: a request found in a late or backfilled transcript, i.e. one that arrived
   * after its audio source stopped, was revoked or disconnected. The transcript record
   * keeps it with its historical time (not modeled here); it is never a live request.
   */
  | { readonly type: 'backfilled_request'; readonly request: RequestInput; readonly spokenAt: number }
  /** Authoritative policy for one problem attempt, as synced from the server. */
  | {
      readonly type: 'remote_policy';
      readonly binding: Binding;
      readonly policyVersion: number;
      readonly teaching: Context['teaching'];
      readonly request: RequestInput | null;
      /** The server has applied this device's latest pending close (absent = no such evidence). */
      readonly acknowledgedClose?: boolean;
      /** Requests of this device the server has applied, even if no longer current (absent = none). */
      readonly acceptedRequests?: ReadonlyArray<string>;
    }
  | { readonly type: 'disconnect' }
  | {
      readonly type: 'reconnect';
      readonly binding: Binding;
      readonly policyVersion: number;
      readonly teaching: Context['teaching'];
      readonly request: RequestInput | null;
      /** Requests of this device (made offline or not) the server has applied, even if no longer current. */
      readonly acceptedProvisional: ReadonlyArray<string>;
      /** The server has applied this device's latest pending "let me try"/"stop telling me". */
      readonly acknowledgedClose: boolean;
    }
  | { readonly type: 'voice_mode'; readonly mode: Context['voiceMode'] }
  | { readonly type: 'preference'; readonly version: number; readonly language: string }
  | { readonly type: 'temporary_language'; readonly language: string };

export type RequestInput = Omit<Request, 'basisRevision' | 'provisional' | keyof Binding>;

const CLOSED = { level: 'none' as Level, scope: null };

export function initialContext(problemId: string, problemVersion: number, attemptId: string): Context {
  return {
    problemId,
    problemVersion,
    attemptId,
    attemptRevision: 0,
    teaching: 'explore', // problem solving quietly follows by default
    permission: CLOSED,
    activeRequest: null,
    policyVersion: 0,
    pending: [],
    server: { request: null, teaching: 'explore' },
    saved: {},
    sync: 'fresh',
    voiceMode: 'silent',
    preference: { version: 1, language: 'en', override: null },
  };
}

const bindingOf = (ctx: Context): Binding => ({ problemId: ctx.problemId, problemVersion: ctx.problemVersion, attemptId: ctx.attemptId });
const sameBinding = (a: Binding, b: Binding): boolean => a.problemId === b.problemId && a.problemVersion === b.problemVersion && a.attemptId === b.attemptId;
const closed = (ctx: Context): Context => ({ ...ctx, teaching: 'explore', permission: CLOSED, activeRequest: null });
export const attemptKey = (b: Binding): string => `${b.problemId}@${b.problemVersion}/${b.attemptId}`;

/** Leave the current attempt (remembering its version and pending intents) and enter another one. */
function switchAttempt(ctx: Context, to: Binding, base: Context): Context {
  const saved = { ...ctx.saved, [attemptKey(bindingOf(ctx))]: { policyVersion: ctx.policyVersion, pending: ctx.pending } };
  const back = saved[attemptKey(to)];
  return { ...base, ...to, saved, policyVersion: back?.policyVersion ?? 0, pending: back?.pending ?? [], server: { request: null, teaching: 'explore' } };
}

function withRequest(ctx: Context, r: RequestInput, provisional: boolean): Context {
  const request: Request = { ...r, ...bindingOf(ctx), basisRevision: ctx.attemptRevision, provisional };
  return { ...ctx, teaching: rank(r.level) === 0 ? 'explore' : 'help', permission: { level: r.level, scope: r.scope }, activeRequest: request };
}

type Snapshot = ServerView & {
  readonly policyVersion: number;
  readonly acknowledgedClose: boolean;
  readonly accepted: ReadonlyArray<string>;
};

/** The intents a snapshot does not prove the server has applied (acknowledging one covers every earlier one). */
function unacknowledged(pending: ReadonlyArray<Intent>, s: Snapshot): ReadonlyArray<Intent> {
  let through = -1;
  pending.forEach((intent, i) => {
    if (s.policyVersion <= intent.madeAt) return; // this snapshot cannot contain the intent
    const proof = intent.kind === 'close' ? s.acknowledgedClose : s.accepted.includes(intent.id) || s.request?.id === intent.id;
    if (proof) through = i;
  });
  return pending.slice(through + 1);
}

const showServer = (ctx: Context): Context =>
  ctx.server.request ? { ...withRequest(ctx, ctx.server.request, false), teaching: ctx.server.teaching } : { ...closed(ctx), teaching: ctx.server.teaching };

/**
 * Only what the server allows at or below `level`, with no request of this device to answer.
 * A snapshot naming one of this device's still unacknowledged requests is not evidence for it.
 */
function capServer(ctx: Context, level: Level): Context {
  const r = ctx.server.request;
  const mine = ctx.pending.some((i) => i.kind === 'request' && i.id === r?.id);
  return r && !mine && rank(r.level) <= rank(level) ? showServer(ctx) : closed(ctx);
}

/**
 * A snapshot that does not contain this device's pending intents has an unknown order
 * against them: it may restrict what they allow (close help, or answer a lower request),
 * never widen it.
 */
function restrictTo(ctx: Context, s: ServerView): Context {
  if (!s.request) return { ...closed(ctx), teaching: s.teaching };
  const local = ctx.activeRequest;
  return local && rank(s.request.level) < rank(local.level) ? { ...withRequest(ctx, s.request, false), teaching: s.teaching } : ctx;
}

/**
 * Receives a server snapshot for the current attempt, ordered by server version only: a
 * snapshot that is not `newer` is superseded, its acknowledgements included. With nothing
 * pending the server decides. Otherwise a snapshot newer than the latest intent may only
 * restrict it, and one at or below it is known to be older than that intent.
 */
function receive(ctx: Context, s: Snapshot, newer: boolean): Context {
  if (!newer) return ctx;
  const pending = unacknowledged(ctx.pending, s);
  const next: Context = { ...ctx, pending, server: { request: s.request, teaching: s.teaching }, policyVersion: s.policyVersion };
  const last = pending.at(-1);
  if (!last) return showServer(next);
  if (last.kind === 'close') return closed(next);
  if (!last.answerable) return capServer(next, last.level);
  return s.policyVersion > last.madeAt ? restrictTo(next, s) : next;
}

/** At reconnect, offline requests the server has not accepted are no longer answered; they still restrict. */
function dropUnaccepted(ctx: Context): Context {
  const pending = ctx.pending.map((i) => (i.kind === 'request' && i.provisional ? { ...i, answerable: false } : i));
  const last = pending.at(-1);
  const next: Context = { ...ctx, pending };
  return last?.kind === 'request' && !last.answerable ? capServer(next, last.level) : next;
}

/** Acknowledgements for an attempt this device has left are kept for when it comes back (help itself never carries over). */
function acknowledgeSaved(ctx: Context, binding: Binding, s: Snapshot): Context {
  const key = attemptKey(binding);
  const entry = ctx.saved[key];
  if (!entry || s.policyVersion <= entry.policyVersion) return ctx;
  return { ...ctx, saved: { ...ctx.saved, [key]: { policyVersion: s.policyVersion, pending: unacknowledged(entry.pending, s) } } };
}

export function apply(ctx: Context, e: Event): Context {
  switch (e.type) {
    case 'enter_problem':
      // Each problem attempt has its own policy sequence. Help never carries over, but an
      // unsynced close of an attempt is remembered if the user comes back to it.
      return switchAttempt(ctx, { problemId: e.problemId, problemVersion: e.problemVersion, attemptId: e.attemptId }, {
        ...initialContext(e.problemId, e.problemVersion, e.attemptId),
        sync: ctx.sync,
        voiceMode: ctx.voiceMode,
        // A temporary language override is scoped to its problem and does not carry over.
        preference: { ...ctx.preference, override: ctx.preference.override?.problemId === e.problemId ? ctx.preference.override : null },
      });
    case 'new_attempt':
      return switchAttempt(ctx, { ...bindingOf(ctx), attemptId: e.attemptId }, { ...closed(ctx), attemptRevision: 0 });
    case 'attempt_revised':
      // A correction keeps the request open but invalidates content from older revisions.
      return { ...ctx, attemptRevision: e.revision };
    case 'pause':
    case 'erase':
    case 'wrong_step':
    case 'time_passes':
      return ctx;
    case 'let_me_try':
    case 'stop_telling':
      // Connected or not, the close stands until the server acknowledges it (R53).
      return { ...closed(ctx), pending: [...ctx.pending, { kind: 'close', madeAt: ctx.policyVersion }] };
    case 'request': {
      // The user's own later request applies at once, at its level, and is pending in turn.
      const provisional = ctx.sync !== 'fresh';
      const intent: Intent = { kind: 'request', id: e.request.id, level: e.request.level, madeAt: ctx.policyVersion, provisional, answerable: true };
      return { ...withRequest(ctx, e.request, provisional), pending: [...ctx.pending, intent] };
    }
    case 'backfilled_request':
      // It cannot open help, restore closed or stale permission, or resolve an unsynced
      // close. If it still matters, the user is asked and can request again.
      return ctx;
    case 'remote_policy': {
      if (ctx.sync !== 'fresh') return ctx;
      const s: Snapshot = { ...e, accepted: e.acceptedRequests ?? [], acknowledgedClose: e.acknowledgedClose === true };
      // Only for the problem attempt it belongs to, and its state only by a newer server version.
      if (!sameBinding(e.binding, bindingOf(ctx))) return acknowledgeSaved(ctx, e.binding, s);
      return receive(ctx, s, e.policyVersion > ctx.policyVersion);
    }
    case 'disconnect':
      return { ...ctx, sync: 'disconnected' };
    case 'reconnect': {
      // Reconnecting alone acknowledges nothing; unacknowledged intents stay pending.
      const s: Snapshot = { ...e, accepted: e.acceptedProvisional };
      const fresh: Context = { ...ctx, sync: 'fresh' };
      const matches = sameBinding(e.binding, bindingOf(ctx));
      // While already connected this is an ordinary resync: strictly newer versions only.
      if (ctx.sync === 'fresh') return matches ? receive(fresh, s, e.policyVersion > ctx.policyVersion) : acknowledgeSaved(fresh, e.binding, s);
      // After a disconnection the current snapshot applies unless it is older than this device's.
      return dropUnaccepted(matches ? receive(fresh, s, e.policyVersion >= ctx.policyVersion) : acknowledgeSaved(fresh, e.binding, s));
    }
    case 'voice_mode':
      return { ...ctx, voiceMode: e.mode };
    case 'preference':
      return e.version > ctx.preference.version ? { ...ctx, preference: { ...ctx.preference, version: e.version, language: e.language } } : ctx;
    case 'temporary_language':
      return { ...ctx, preference: { ...ctx.preference, override: { problemId: ctx.problemId, language: e.language } } };
  }
}

// ---- cache and presentation surfaces -----------------------------------------

/** A cached result can answer a new request only at the same level, scope, attempt revision and language. */
export function cacheHit(ctx: Context, request: Request, cached: ReadonlyArray<Item>): Item | null {
  const hit = cached.find(
    (c) =>
      c.problemId === ctx.problemId &&
      c.problemVersion === ctx.problemVersion &&
      c.attemptId === ctx.attemptId &&
      (c.basisRevision === null ? rank(c.level) === 0 : c.basisRevision === ctx.attemptRevision) &&
      c.level === request.level &&
      c.scope === request.scope &&
      c.preferenceKey === preferenceKey(ctx) &&
      c.channel !== 'voice',
  );
  return hit ? { ...hit, requestId: request.id } : null;
}

/** Everything currently visible or queued is re-checked after every event; failing items are withdrawn, not shown late. */
export type Surfaces = { readonly shown: ReadonlyArray<Item>; readonly voiceQueue: ReadonlyArray<Item>; readonly cache: ReadonlyArray<Item> };

export function revalidate(ctx: Context, s: Surfaces): { surfaces: Surfaces; withdrawn: string[]; flushed: string[] } {
  const shown = s.shown.filter((i) => decide(ctx, i).present);
  const voiceQueue = s.voiceQueue.filter((i) => decide(ctx, i).present);
  return {
    surfaces: { shown, voiceQueue, cache: s.cache },
    withdrawn: s.shown.filter((i) => !shown.includes(i)).map((i) => i.id),
    flushed: s.voiceQueue.filter((i) => !voiceQueue.includes(i)).map((i) => i.id),
  };
}
