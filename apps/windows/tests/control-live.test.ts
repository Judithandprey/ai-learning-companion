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
  assert.match(page.liveLine(on({ unwritten: 2 }), NOW), / 2 line\(s\) of this session's record could not be written on this device\.$/);
  // Past its time on this clock: zero, never a negative time.
  assert.match(page.liveLine(on({ expires_at: '2026-10-01T11:00:00Z' }), NOW), /about 0 min left/);
  assert.equal(page.liveLine(on({ state: 'used_up', used: 60 }), NOW), 'AI: all 60 requests of this session are used (its own bound, not ChatGPT\'s quota). Nothing more is sent to ChatGPT in it; Start the AI ends it and starts a new session.');
  assert.equal(page.liveLine(on({ state: 'ended', ended: 'ChatGPT says requests are coming too fast for now (a rate limit, not a used-up allowance); nothing more is sent by itself' }), NOW), 'AI: stopped observing this display: ChatGPT says requests are coming too fast for now (a rate limit, not a used-up allowance); nothing more is sent by itself. 7 of 60 requests used (53 left; the last 12 are kept for your own circles and questions). Nothing is sent to ChatGPT now; Start the AI starts a new session.');
});

test('the quota is said as ChatGPT states it: buckets apart, credits as its own figure and never as money, and what is not reported as not known, never as zero', () => {
  assert.equal(page.quotaText(null), 'Usage: not read.');
  assert.equal(page.quotaText({ available: false, ordinary_usage_allowed: null, windows: [] }), 'Usage as ChatGPT reports it: not available now (not known; this is not zero).');
  const text = page.quotaText({ available: true, ordinary_usage_allowed: false, windows: [
    bucket({ primary: { used_percent: 100, window_duration_mins: 10_080, resets_at: '2026-10-05T00:00:00Z' }, secondary: { used_percent: 40, window_duration_mins: 300, resets_at: null }, credits: { has_credits: true, unlimited: false, balance: '1234.5600' } }),
    bucket({ limit_id: 'workspace', normal_model_slug: 'gpt-x', primary: null, credits: null, rate_limit_reached_type: 'workspace_member_usage_limit_reached', spend_control_reached: true, individual_limit: { limit: '50.00', used: '50.00', remaining_percent: 0, resets_at: '2026-11-01T00:00:00Z' } }),
  ] });
  assert.match(text, /^Usage as ChatGPT reports it \(the account's, not this app's session bounds\): included usage is NOT allowed now \(this alone says nothing about credits\)\. codex: first window 100% used \(7-day\), resets .*; second window 40% used \(5-hour\); credits: some, balance 1234\.5600 credits as ChatGPT states it \(not an amount of money\) · workspace \(gpt-x\): credits not reported; reached: this member's usage limit is reached; a spend control is reached; your own limit: 50\.00 of 50\.00 used, 0% left, resets .*\.$/);
  assert.equal(/\$|USD|dollar/i.test(text), false, 'a credit balance is never called money');
  // The first bucket's credits are not the second's; an unreported balance is not zero; a known zero is a known zero.
  assert.match(page.quotaText({ available: true, ordinary_usage_allowed: null, windows: [bucket({ primary: null, credits: { has_credits: false, unlimited: false, balance: null } })] }), /whether included usage is allowed now is not reported\. codex: credits: none, balance not reported\.$/);
  assert.match(page.quotaText({ available: true, ordinary_usage_allowed: true, windows: [bucket({ primary: null, credits: { has_credits: false, unlimited: false, balance: '0' } })] }), /included usage is allowed now\. codex: credits: none, balance 0 credits as ChatGPT states it \(not an amount of money\)\.$/);
  assert.match(page.quotaText({ available: true, ordinary_usage_allowed: true, windows: [bucket({ limit_id: null, primary: null, credits: { has_credits: true, unlimited: true, balance: null }, spend_control_reached: false })] }), /a bucket without a name: credits: unlimited; no spend control is reached\.$/);
  assert.match(page.quotaText({ available: true, ordinary_usage_allowed: true, windows: [] }), /No bucket reported\.$/);
});

test('the subscription section offers the AI with Start only when it can be started, ticked then by default, and says why when it cannot; the Start button says what it does', () => {
  const p = controlPage();
  const managed = (over: object = {}) => ({ mode: 'managed', state: 'signed_in', plan: 'Pro', quota: { available: true, ordinary_usage_allowed: true, windows: [bucket()] }, models: [{ id: 'vision-model', label: 'Vision', image_input: true, default: true }], model: 'vision-model', login: 'none', detail: null, asking: false, ...over });
  const box = p.$('aiOn') as unknown as { checked?: boolean; disabled?: boolean };
  box.disabled = true; // as the page starts
  p.showSubscription(managed({ state: 'not_checked', quota: null, models: [], model: null }));
  assert.deepEqual([box.checked, box.disabled, p.$('aiSession').hidden, p.$('aiWhy').textContent, p.$('start').textContent], [false, true, false, 'Not available now: check the connection and sign in below. Start then captures only; nothing is sent to any AI.', 'Start: capture only (no AI)']);
  p.showSubscription(managed());
  assert.deepEqual([box.checked, box.disabled, p.$('aiWhy').textContent, p.$('start').textContent], [true, false, '', 'Start: capture, and let ChatGPT observe this display']);
  assert.match(p.$('subQuota').textContent, /^Usage as ChatGPT reports it /);
  // The user's own untick stays through later reports of the same state.
  box.checked = false;
  p.showSubscription(managed({ asking: true }));
  assert.deepEqual([box.checked, p.$('start').textContent], [false, 'Start: capture only (no AI)']);
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
  assert.match(p.$('ai').textContent, /ChatGPT \(your subscription\) observes a display only while its AI session runs: started by your own Start, within the bounds you set beside it/);
});
