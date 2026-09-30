// Control window: choose a display, Start and Stop its capture, see what the capture produces, and
// open saved ink. Everything is rendered with textContent; the page only reaches the main process
// through the preload's calls.

import type { DisplaySample } from '../shared/samples.ts';
import type { DesktopInkSummary } from '../shared/desktop-ink.ts';

type DisplayChoice = { source_id: string; display_id: string; label: string; bounds: { x: number; y: number; width: number; height: number }; scale_factor: number; primary: boolean; thumbnail: string };
type SessionInfo = { running: true; ending: boolean; display: { label: string; bounds: { width: number; height: number }; scale_factor: number }; session_id: string } | { running: false; ended: string | null };
type Api = {
  listDisplays(): Promise<DisplayChoice[]>;
  sessionState(): Promise<SessionInfo | null>;
  start(sourceId: string): Promise<{ ok: true } | { ok: false; reason: string }>;
  stop(): Promise<void>;
  listInk(): Promise<{ sessions: DesktopInkSummary[]; unreadable: number }>;
  openInk(id: string): Promise<{ ok: true } | { ok: false; reason: string }>;
  onSession(fn: (s: SessionInfo) => void): void;
  onSample(fn: (s: DisplaySample) => void): void;
  onInkSaved(fn: () => void): void;
};
const lc = (globalThis as unknown as { lc: Api }).lc;
const $ = (id: string): HTMLElement => document.getElementById(id)!;

let chosen: string | null = null;
let running = false;
let sessionId: string | null = null;
const counts = { fresh: 0, no_new_frame: 0, gap: 0, ended: 0 };
let lastSample: DisplaySample | null = null;
/** When the last sample arrived (ms, this window's clock). */
let lastSampleAt = 0;
/** No sample for this long while capturing: the capture's state is unknown (stale). */
const STALE_MS = 3500;

async function showDisplays(): Promise<void> {
  const list = $('displays');
  const displays = await lc.listDisplays();
  chosen ??= (displays.find((d) => d.primary) ?? displays[0])?.source_id ?? null;
  list.replaceChildren(
    ...displays.map((d) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(d.source_id === chosen));
      const img = document.createElement('img');
      img.src = d.thumbnail;
      img.alt = '';
      const text = document.createElement('span');
      text.textContent = `${d.label}${d.primary ? ' (main)' : ''} · ${d.bounds.width}×${d.bounds.height} at ${d.scale_factor}×`;
      li.append(img, text);
      li.addEventListener('click', () => {
        if (running) return;
        chosen = d.source_id;
        void showDisplays();
      });
      return li;
    }),
  );
  if (displays.length === 0) list.replaceChildren(Object.assign(document.createElement('li'), { textContent: 'No display can be captured.' }));
}

async function showInk(): Promise<void> {
  const { sessions, unreadable } = await lc.listInk();
  const items = sessions.map((s) => {
    const li = document.createElement('li');
    const text = document.createElement('span');
    text.textContent = `${new Date(s.created_at).toLocaleString()}${s.forked_from ? ' (separate copy)' : ''} · ${s.display_label} · ${s.strokes} stroke(s)`;
    const open = document.createElement('button');
    open.type = 'button';
    open.textContent = 'Open';
    open.disabled = !running;
    open.addEventListener('click', async () => {
      const r = await lc.openInk(s.id);
      $('session').textContent = r.ok ? `Showing saved ink from ${new Date(s.created_at).toLocaleString()} over the captured display.` : `Could not open it: ${r.reason}.`;
    });
    li.append(text, open);
    return li;
  });
  if (unreadable > 0) items.push(Object.assign(document.createElement('li'), { textContent: `${unreadable} saved file(s) cannot be read by this version and are left untouched.` }));
  if (items.length === 0) items.push(Object.assign(document.createElement('li'), { textContent: 'No saved ink yet.' }));
  $('ink').replaceChildren(...items);
}

function showSample(): void {
  const s = lastSample;
  const el = $('sample');
  const stale = running && Date.now() - lastSampleAt > STALE_MS;
  el.className = `status ${stale ? 'gap' : (s?.state ?? '')}`;
  if (stale) {
    el.textContent = `Stale: no sample from the overlay for ${((Date.now() - lastSampleAt) / 1000).toFixed(0)} s, so nothing is known about the display since${s ? ` sample ${s.seq}` : ''}.`;
    return;
  }
  if (!s) return void (el.textContent = '');
  const when = new Date(s.sampled_at).toLocaleTimeString();
  const raw = s.raw ? `${s.raw.width}×${s.raw.height} px, newest system frame ${(s.raw.frame_age_ms / 1000).toFixed(1)} s old, change ${s.raw.change === null ? '—' : (s.raw.change * 100).toFixed(1) + '%'}` : 'no frame';
  const state = {
    fresh: 'new frame',
    no_new_frame: 'no new frame from Windows (the display is still, or the capture stalled)',
    gap: `gap: ${((s.gap_ms ?? 0) / 1000).toFixed(1)} s not observed`,
    ended: 'capture ended',
  }[s.state];
  const ink = s.composed ? `; composed with ink revision ${s.composed.ink_revision} (${s.composed.visible_strokes} stroke(s))` : '';
  el.textContent = `Sample ${s.seq} at ${when} from ${s.source.label}: ${state}; ${raw}${ink}.`;
  $('counts').textContent = `Samples: ${counts.fresh} new frame, ${counts.no_new_frame} no new frame, ${counts.gap} gap, ${counts.ended} ended.`;
}

function showSession(s: SessionInfo): void {
  if (s.running && s.session_id !== sessionId) {
    sessionId = s.session_id;
    lastSample = null;
    lastSampleAt = Date.now();
    for (const k of Object.keys(counts) as Array<keyof typeof counts>) counts[k] = 0;
    $('counts').textContent = '';
  }
  running = s.running;
  ($('start') as HTMLButtonElement).disabled = s.running;
  ($('stop') as HTMLButtonElement).disabled = !s.running || s.ending;
  if (s.running) {
    $('session').textContent = s.ending
      ? 'Stopping… live capture has ended.'
      : `Capturing ${s.display.label} (${s.display.bounds.width}×${s.display.bounds.height} at ${s.display.scale_factor}×). The overlay is on that display: ✋ passes clicks to your apps, ✎ writes, ? selects.`;
  } else {
    $('session').textContent = s.ended ? `Not capturing: ${s.ended.replace(/\.$/, '')}.` : 'Not capturing.';
    if (lastSample) lastSample = { ...lastSample, state: 'ended' };
    showSample();
  }
  void showInk();
  void showDisplays();
}
lc.onSession(showSession);
lc.onSample((s) => {
  lastSample = s;
  lastSampleAt = Date.now();
  counts[s.state] += 1;
  showSample();
});
setInterval(() => {
  if (running) showSample();
}, 1000);
lc.onInkSaved(() => void showInk());
$('start').addEventListener('click', async () => {
  if (!chosen) return;
  ($('start') as HTMLButtonElement).disabled = true;
  const r = await lc.start(chosen);
  if (!r.ok) {
    $('session').textContent = `Could not start: ${r.reason}.`;
    ($('start') as HTMLButtonElement).disabled = false;
  }
});
$('stop').addEventListener('click', () => void lc.stop());
void lc.sessionState().then((s) => (s ? showSession(s) : undefined));
void showDisplays();
void showInk();
