// What the control window says of the AI: the session's own bounds as typed (never clamped), the session as one line
// (its bounds apart from ChatGPT's quota), and the quota as ChatGPT states it, bucket by bucket (what is not
// reported is said as not known, never as zero; a credit balance is never called money). The real control.ts
// functions on a fake page. SYNTHETIC: made-up figures; no account, no connector and no network are involved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { controlPage } from './control-page.ts';
import { bucket } from './subscription-fakes.ts';
import { DEFAULT_POLICY, isPolicy } from '../src/shared/live.ts';

const page = controlPage();
const NOW = Date.parse('2026-10-01T12:00:00Z');
const on = (over: object = {}) => ({ state: 'on', model: 'vision-model', max_submissions: 60, used: 7, reserve: 12, expires_at: '2026-10-01T12:21:30Z', min_observation_interval_ms: 30_000, paused: null, missed: null, ended: null, seen: { at: '2026-10-01T11:59:00Z', frame_seq: 9 }, frames: 12, out: 0, unwritten: 0, ...over });

test('the session\'s bounds are taken as typed or refused with why: never clamped, never guessed; what is shown by default is a bound the envelope takes', () => {
  const of = (r: number, m: number, sec: number): unknown => JSON.parse(JSON.stringify(page.policyOf(r, m, sec))); // (out of the page's own realm)
  assert.deepEqual(of(60, 30, 30), DEFAULT_POLICY, 'the values the page starts with are the default bounds');
  assert.deepEqual(of(100, 60, 60), { max_submissions: 100, max_session_ms: 3_600_000, min_observation_interval_ms: 60_000 });
  assert.equal(isPolicy(of(1, 1, 1)), true);
  for (const [r, m, sec, why] of [[0, 30, 30, /requests must be a whole number from 1 to 100/], [101, 30, 30, /requests/], [12.5, 30, 30, /requests/], [Number.NaN, 30, 30, /requests/], [60, 0, 30, /minutes must be a whole number from 1 to 60/], [60, 61, 30, /one session lasts an hour at most, and is not renewed by itself/], [60, 30, 0, /seconds between two unattended looks/], [60, 30, 61, /seconds/]] as const) {
    assert.match(String(page.policyOf(r, m, sec)), why);
  }
});

test('the AI\'s session is said as one line: whether ChatGPT observes the display, what is left of the session\'s own bounds (said as not ChatGPT\'s quota), and what it last saw', () => {
  assert.equal(page.liveLine({ state: 'none' }, NOW), '');
  assert.equal(page.liveLine({ state: 'starting' }, NOW), 'AI: starting…');
  assert.equal(page.liveLine({ state: 'off', reason: null }, NOW), 'AI: not observing this display (it was not started with this capture). Frames and ink stay on this device.');
  assert.equal(page.liveLine({ state: 'off', reason: 'ChatGPT is not signed in (sign in from the control window)' }, NOW), 'AI: not observing this display: ChatGPT is not signed in (sign in from the control window). Frames and ink stay on this device.');
  const line = page.liveLine(on(), NOW);
  assert.match(line, /^AI: ChatGPT \(vision-model\) observes this whole display as it changes, at most once every 30 s\. 7 of 60 requests used \(53 left; the last 12 are kept for your own circles and questions\); about 22 min left\. These are this session's own bounds, not ChatGPT's quota\. ChatGPT last completed a look at .* \(frame 9 of 12 taken for it\)\.$/);
  assert.match(page.liveLine(on({ seen: null, frames: 0 }), NOW), /ChatGPT has not completed a look yet \(0 frame\(s\) taken for it\)\.$/);
  assert.match(page.liveLine(on({ paused: 'the requests left in this session are kept for your own focus and follow-ups', used: 48 }), NOW), /^AI: ChatGPT \(vision-model\) looks only when you circle or ask \(the requests left in this session are kept for your own focus and follow-ups\)\. 48 of 60 requests used \(12 left;/);
  assert.match(page.liveLine(on({ missed: 'another request of yours is still waiting, so this one was not taken', out: 1 }), NOW), /; the newest look was not made \(another request of yours is still waiting, so this one was not taken\); a request is out\.$/);
  assert.match(page.liveLine(on({ unwritten: 2 }), NOW), / 2 line\(s\) of the AI session's record \(live\.jsonl\) could not be written on this device\.$/);
  assert.match(page.liveLine({ state: 'off', reason: null, unwritten: 1 }, NOW), /Frames and ink stay on this device\. 1 line\(s\) of the AI session's record \(live\.jsonl\) could not be written on this device\.$/);
  // Past its time on this clock: zero, never a negative time.
  assert.match(page.liveLine(on({ expires_at: '2026-10-01T11:00:00Z' }), NOW), /about 0 min left/);
  assert.equal(page.liveLine(on({ state: 'used_up', used: 60 }), NOW), 'AI: all 60 requests of this session are used (its own bound, not ChatGPT\'s quota). Nothing more is sent to ChatGPT in it; Start the AI ends it and starts a new session.');
  assert.equal(page.liveLine(on({ state: 'ended', ended: 'ChatGPT says requests are coming too fast for now (a rate limit, not a used-up allowance); nothing more is sent by itself' }), NOW), 'AI: stopped observing this display: ChatGPT says requests are coming too fast for now (a rate limit, not a used-up allowance); nothing more is sent by itself. 7 of 60 requests used (53 left; the last 12 are kept for your own circles and questions). Nothing is sent to ChatGPT now; Start the AI starts a new session.');
});

test('the quota is said as ChatGPT states it: buckets apart, credits as its own figure and never as money, and what is not reported as not known, never as zero', () => {
  assert.equal(page.quotaText(null), 'Usage: not read.');
  assert.equal(page.quotaText({ available: false, ordinary_usage_allowed: null, windows: [] }), 'Usage as ChatGPT reported it: not available then (not known; this is not zero).');
  // Said as what the account was when it was read, with that time, never as how it is now.
  assert.match(page.quotaText({ available: false, ordinary_usage_allowed: null, windows: [] }, '2026-10-01T11:58:00Z'), /^Usage as ChatGPT reported it at .*: not available then \(not known; this is not zero\)\.$/);
  assert.match(page.quotaText({ available: true, ordinary_usage_allowed: true, windows: [] }, '2026-10-01T11:58:00Z'), /^Usage as ChatGPT reported it at .* \(the account's, not this app's session bounds; Check connection reads it again\): included usage was allowed then\. No bucket reported\.$/);
  assert.equal(/\bnow\b/.test(page.quotaText({ available: true, ordinary_usage_allowed: false, windows: [bucket()] }, '2026-10-01T11:58:00Z')), false);
  const text = page.quotaText({ available: true, ordinary_usage_allowed: false, windows: [
    bucket({ primary: { used_percent: 100, window_duration_mins: 10_080, resets_at: '2026-10-05T00:00:00Z' }, secondary: { used_percent: 40, window_duration_mins: 300, resets_at: null }, credits: { has_credits: true, unlimited: false, balance: '1234.5600' } }),
    bucket({ limit_id: 'workspace', normal_model_slug: 'gpt-x', primary: null, credits: null, rate_limit_reached_type: 'workspace_member_usage_limit_reached', spend_control_reached: true, individual_limit: { limit: '50.00', used: '50.00', remaining_percent: 0, resets_at: '2026-11-01T00:00:00Z' } }),
  ] });
  assert.match(text, /^Usage as ChatGPT reported it \(the account's, not this app's session bounds; Check connection reads it again\): included usage was NOT allowed then \(this alone says nothing about credits\)\. codex: first window 100% used \(7-day\), resets .*; second window 40% used \(5-hour\); credits: some, balance 1234\.5600 credits as ChatGPT states it \(not an amount of money\) · workspace \(gpt-x\): credits not reported; reached: this member's usage limit is reached; a spend control is reached; your own limit: 50\.00 of 50\.00 used, 0% left, resets .*\.$/);
  assert.equal(/\$|USD|dollar/i.test(text), false, 'a credit balance is never called money');
  // The first bucket's credits are not the second's; an unreported balance is not zero; a known zero is a known zero.
  assert.match(page.quotaText({ available: true, ordinary_usage_allowed: null, windows: [bucket({ primary: null, credits: { has_credits: false, unlimited: false, balance: null } })] }), /whether included usage was allowed was not reported\. codex: credits: none, balance not reported\.$/);
  assert.match(page.quotaText({ available: true, ordinary_usage_allowed: true, windows: [bucket({ primary: null, credits: { has_credits: false, unlimited: false, balance: '0' } })] }), /included usage was allowed then\. codex: credits: none, balance 0 credits as ChatGPT states it \(not an amount of money\)\.$/);
  assert.match(page.quotaText({ available: true, ordinary_usage_allowed: true, windows: [bucket({ limit_id: null, primary: null, credits: { has_credits: true, unlimited: true, balance: null }, spend_control_reached: false })] }), /a bucket without a name: credits: unlimited; no spend control is reached\.$/);
  assert.match(page.quotaText({ available: true, ordinary_usage_allowed: true, windows: [] }), /No bucket reported\.$/);
});

test('the subscription section offers the AI with Start only when it can be started, ticked then by default, and says why when it cannot; the Start button says what it does', () => {
  const p = controlPage();
  const managed = (over: object = {}) => ({ mode: 'managed', state: 'signed_in', plan: 'Pro', quota: { available: true, ordinary_usage_allowed: true, windows: [bucket()] }, quota_read_at: '2026-10-01T11:58:00.000Z', models: [{ id: 'vision-model', label: 'Vision', image_input: true, default: true }], model: 'vision-model', login: 'none', detail: null, asking: false, ...over });
  const box = p.$('aiOn') as unknown as { checked?: boolean; disabled?: boolean };
  box.disabled = true; // as the page starts
  p.showSubscription(managed({ state: 'not_checked', quota: null, models: [], model: null }));
  assert.deepEqual([box.checked, box.disabled, p.$('aiSession').hidden, p.$('aiWhy').textContent, p.$('start').textContent], [false, true, false, 'Not available now: check the connection and sign in below. Start then captures only; nothing is sent to any AI.', 'Start: capture only (no AI)']);
  p.showSubscription(managed());
  assert.deepEqual([box.checked, box.disabled, p.$('aiWhy').textContent, p.$('start').textContent], [true, false, '', 'Start: capture, and let ChatGPT observe this display']);
  assert.match(p.$('subQuota').textContent, /^Usage as ChatGPT reported it at .* \(the account's, not this app's session bounds; Check connection reads it again\): /);
  // The user's own untick stays through later reports of the same state, AND through every re-read of the account
  // (a Check, "the account changed", a sign-in): the box is never ticked again behind the user's back.
  box.checked = false;
  p.showSubscription(managed({ asking: true }));
  assert.deepEqual([box.checked, p.$('start').textContent], [false, 'Start: capture only (no AI)']);
  for (const state of ['checking', 'unknown', 'unavailable', 'signed_out']) {
    p.showSubscription(managed({ state, quota: null }));
    assert.deepEqual([box.checked, box.disabled], [false, true], state);
    p.showSubscription(managed());
    assert.deepEqual([box.checked, box.disabled, p.$('start').textContent], [false, false, 'Start: capture only (no AI)'], `${state}, then signed in again: still as the user left it`);
  }
  // Ticked again by the user: that stays too.
  box.checked = true;
  p.showSubscription(managed({ state: 'checking', quota: null }));
  p.showSubscription(managed());
  assert.deepEqual([box.checked, box.disabled, p.$('start').textContent], [true, false, 'Start: capture, and let ChatGPT observe this display']);
  box.checked = false;
  p.showSubscription(managed());
  // A sign-in pending, or no model that takes pictures: not offered, with why.
  p.showSubscription(managed({ login: 'waiting' }));
  assert.deepEqual([box.checked, box.disabled, p.$('aiWhy').textContent], [false, true, 'Not available now: a sign-in is pending. Start then captures only; nothing is sent to any AI.']);
  p.showSubscription(managed({ models: [{ id: 't', label: 'Text', image_input: false, default: true }], model: null }));
  assert.match(p.$('aiWhy').textContent, /no model that takes pictures is listed/);
  // Off or unavailable: the AI is not offered at all.
  p.showSubscription({ mode: 'off' });
  assert.deepEqual([p.$('aiSession').hidden, p.$('start').textContent], [true, 'Start']);
  assert.equal(p.$('ai').textContent, 'No AI is connected: captured frames and ink stay on this device, and nothing is sent anywhere.');
  p.showSubscription(managed());
  assert.match(p.$('ai').textContent, /^Captured frames and ink are kept on this device\. ChatGPT \(your subscription\) observes a display only while its AI session runs: started by your own Start, within the bounds you set beside it/);
});

test('the control page\'s own wiring: every element its code names is in its markup, `hidden` is the last word on an element whose class sets its display, and the development storage line claims nothing about what the AI is given', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const dir = path.join(import.meta.dirname, '..', 'src', 'renderer');
  const html = fs.readFileSync(path.join(dir, 'control.html'), 'utf8');
  const css = fs.readFileSync(path.join(dir, 'control.css'), 'utf8');
  const code = fs.readFileSync(path.join(dir, 'control.ts'), 'utf8');
  const ids = new Set([...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]!));
  const named = [...new Set([...code.matchAll(/\$\('([A-Za-z]+)'\)/g)].map((m) => m[1]!))];
  assert.deepEqual(named.filter((id) => !ids.has(id)), [], 'ids used by control.ts that are not in control.html');
  for (const id of ['aiSession', 'aiOn', 'aiRequests', 'aiMinutes', 'aiInterval', 'aiWhy', 'aiNote', 'live', 'liveActions', 'liveStart', 'liveStop']) assert.equal(ids.has(id), true, id);
  // #liveActions is `class="actions" hidden`, and .actions sets display: without this rule `hidden` would hide nothing.
  assert.match(html, /<div id="liveActions" class="actions" hidden>/);
  assert.match(css, /\.actions \{ display: flex;/);
  assert.match(css, /\[hidden\] \{ display: none !important; \}/);
  // The bounds the page starts with are the default policy.
  assert.deepEqual(['aiRequests', 'aiMinutes', 'aiInterval'].map((id) => Number(new RegExp(`id="${id}"[^>]* value="(\\d+)"`).exec(html)?.[1])), [DEFAULT_POLICY.max_submissions, DEFAULT_POLICY.max_session_ms / 60_000, DEFAULT_POLICY.min_observation_interval_ms / 1000]);
  // With the development capture link and the subscription both on, the storage line says nothing that the AI's session line could contradict.
  const p = controlPage();
  p.showSubscription({ mode: 'managed', state: 'signed_in', plan: null, quota: null, quota_read_at: null, models: [], model: null, login: 'none', detail: null, asking: false });
  p.showLink({ mode: 'development', state: 'sending', stored: 1, unknown: 0, refused: 0, not_sent: 0, detail: null, earlier_unknown: 0, sends_stopped: false, awaiting: false, storing: true });
  assert.match(p.$('link').textContent, /This local service sends nothing to any AI; what ChatGPT is given is said under Capture\.$/);
  assert.equal(/not sent to any AI/.test(p.$('link').textContent), false);
});

test('what Start asks for is the page as it is: the AI only with the box offered and ticked, within exactly the bounds typed; bounds that cannot be are said and nothing is asked; Start the AI and Stop the AI are offered by the session\'s state', async () => {
  const p = controlPage();
  const set = (id: string, over: object): void => void Object.assign(p.$(id), over);
  const ask = (): unknown => JSON.parse(JSON.stringify(p.startRequest()));
  set('aiSession', { hidden: false });
  set('aiOn', { disabled: false, checked: true });
  for (const [id, value] of [['aiRequests', '40'], ['aiMinutes', '20'], ['aiInterval', '15']] as const) set(id, { value });
  assert.deepEqual(ask(), { ai: { policy: { max_submissions: 40, max_session_ms: 1_200_000, min_observation_interval_ms: 15_000 } } });
  // Unticked, not offered (disabled, though ticked), or no AI box at all: the capture alone.
  set('aiOn', { checked: false });
  assert.deepEqual(ask(), { ai: null });
  set('aiOn', { checked: true, disabled: true });
  assert.deepEqual(ask(), { ai: null });
  set('aiOn', { disabled: false });
  set('aiSession', { hidden: true });
  assert.deepEqual(ask(), { ai: null });
  set('aiSession', { hidden: false });
  // Bounds that are not this version's: said, and nothing is asked for (not the capture alone either).
  set('aiRequests', { value: '500' });
  assert.match((ask() as { problem: string }).problem, /requests must be a whole number from 1 to 100/);
  set('aiRequests', { value: '' });
  assert.match((ask() as { problem: string }).problem, /requests must be a whole number/);
  // With the AI unticked the bounds are not looked at.
  set('aiOn', { checked: false });
  assert.deepEqual(ask(), { ai: null });
  // Start the AI / Stop the AI by the session's state; none, and no line, without a running capture.
  const shown = (): unknown[] => ['live', 'liveActions', 'liveStart', 'liveStop'].map((id) => p.$(id).hidden);
  p.showLive(on());
  assert.deepEqual(shown(), [false, false, true, false]);
  p.showLive(on({ state: 'used_up', used: 60 }));
  assert.deepEqual(shown(), [false, false, false, false], 'used up: both (stop it, or start a new one)');
  p.showLive(on({ state: 'ended', ended: 'stopped by you' }));
  assert.deepEqual(shown(), [false, false, false, true]);
  p.showLive({ state: 'off', reason: null });
  assert.deepEqual(shown(), [false, false, false, true]);
  p.showLive({ state: 'starting' });
  assert.deepEqual(shown(), [false, false, true, true]);
  for (const none of [null, { state: 'none' }]) {
    p.showLive(on());
    p.showLive(none);
    assert.deepEqual(shown(), [true, true, true, true], JSON.stringify(none));
  }
  // The press on Start the AI: the bounds as typed; a refusal is said; bounds that cannot be are said and nothing is asked.
  set('aiRequests', { value: '12' });
  await p.startLiveAgain();
  assert.deepEqual([p.calls, p.$('aiNote').textContent], [[['liveStart', { max_submissions: 12, max_session_ms: 1_200_000, min_observation_interval_ms: 15_000 }]], '']);
  p.answers.liveStart = { ok: false, reason: 'ChatGPT is not signed in (sign in from the control window)' };
  await p.startLiveAgain();
  assert.equal(p.$('aiNote').textContent, 'The AI was not started: ChatGPT is not signed in (sign in from the control window).');
  set('aiMinutes', { value: '0' });
  await p.startLiveAgain();
  assert.deepEqual([p.calls.length, /minutes must be a whole number from 1 to 60/.test(p.$('aiNote').textContent)], [2, true]);
});
