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
  /** Made while this device could not confirm the authoritative state. */
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
  /** "Let me try"/"stop telling me" said while disconnected and not yet acknowledged by the server. */
  readonly pendingClose: boolean;
  readonly sync: Sync;
  readonly voiceMode: 'silent' | 'discussion';
  /** R57: persistent preference version plus an optional problem-scoped override. */
  readonly preference: { readonly version: number; readonly language: string; readonly override: { readonly problemId: string; readonly language: string } | null };
};

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
  /** Authoritative policy for one problem attempt, as synced from the server. */
  | { readonly type: 'remote_policy'; readonly binding: Binding; readonly policyVersion: number; readonly teaching: Context['teaching']; readonly request: RequestInput | null }
  | { readonly type: 'disconnect' }
  | {
      readonly type: 'reconnect';
      readonly binding: Binding;
      readonly policyVersion: number;
      readonly teaching: Context['teaching'];
      readonly request: RequestInput | null;
      /** Provisional local requests the server ordered as current. */
      readonly acceptedProvisional: ReadonlyArray<string>;
      /** The server has applied this device's offline "let me try"/"stop telling me". */
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
    pendingClose: false,
    sync: 'fresh',
    voiceMode: 'silent',
    preference: { version: 1, language: 'en', override: null },
  };
}

const bindingOf = (ctx: Context): Binding => ({ problemId: ctx.problemId, problemVersion: ctx.problemVersion, attemptId: ctx.attemptId });
const sameBinding = (a: Binding, b: Binding): boolean => a.problemId === b.problemId && a.problemVersion === b.problemVersion && a.attemptId === b.attemptId;
const closed = (ctx: Context): Context => ({ ...ctx, teaching: 'explore', permission: CLOSED, activeRequest: null });

function withRequest(ctx: Context, r: RequestInput, provisional: boolean): Context {
  const request: Request = { ...r, ...bindingOf(ctx), basisRevision: ctx.attemptRevision, provisional };
  return { ...ctx, teaching: rank(r.level) === 0 ? 'explore' : 'help', permission: { level: r.level, scope: r.scope }, activeRequest: request };
}

export function apply(ctx: Context, e: Event): Context {
  switch (e.type) {
    case 'enter_problem':
      return {
        // A new problem starts its own policy sequence; nothing from the old one carries over.
        ...initialContext(e.problemId, e.problemVersion, e.attemptId),
        sync: ctx.sync,
        voiceMode: ctx.voiceMode,
        // A temporary language override is scoped to its problem and does not carry over.
        preference: { ...ctx.preference, override: ctx.preference.override?.problemId === e.problemId ? ctx.preference.override : null },
      };
    case 'new_attempt':
      return { ...closed(ctx), attemptId: e.attemptId, attemptRevision: 0, policyVersion: 0, pendingClose: false };
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
      // Said offline, the close must survive reconnection until the server has applied it.
      return { ...closed(ctx), pendingClose: ctx.pendingClose || ctx.sync !== 'fresh' };
    case 'request':
      // A new explicit request is newer than any earlier close from this device.
      return { ...withRequest(ctx, e.request, ctx.sync !== 'fresh'), pendingClose: false };
    case 'remote_policy': {
      // Ordered by server version only, and only for the problem attempt it belongs to.
      if (ctx.sync !== 'fresh' || !sameBinding(e.binding, bindingOf(ctx)) || e.policyVersion <= ctx.policyVersion) return ctx;
      const base = { ...ctx, policyVersion: e.policyVersion };
      return e.request ? { ...withRequest(base, e.request, false), teaching: e.teaching } : { ...closed(base), teaching: e.teaching };
    }
    case 'disconnect':
      return { ...ctx, sync: 'disconnected' };
    case 'reconnect': {
      // A snapshot while already connected is an ordinary resync: strictly newer versions only.
      if (ctx.sync === 'fresh') return apply(ctx, { type: 'remote_policy', binding: e.binding, policyVersion: e.policyVersion, teaching: e.teaching, request: e.request });
      const fresh: Context = { ...ctx, sync: 'fresh', pendingClose: false };
      const local = ctx.activeRequest;
      const matches = sameBinding(e.binding, bindingOf(ctx));
      // A provisional local request survives only if the server ordered it as current.
      if (local && local.provisional && matches && e.acceptedProvisional.includes(local.id)) {
        return { ...fresh, policyVersion: Math.max(e.policyVersion, ctx.policyVersion), activeRequest: { ...local, provisional: false } };
      }
      // Anything else provisional is dropped; the user can ask again.
      const settled = local?.provisional ? closed(fresh) : fresh;
      // A snapshot for another problem attempt, or an older one, changes nothing here.
      if (!matches || e.policyVersion < ctx.policyVersion) return settled;
      // An offline close stands until the server confirms it has applied it.
      if (ctx.pendingClose && !e.acknowledgedClose) return closed(settled);
      const base = { ...settled, policyVersion: e.policyVersion };
      return e.request ? { ...withRequest(base, e.request, false), teaching: e.teaching } : { ...closed(base), teaching: e.teaching };
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
