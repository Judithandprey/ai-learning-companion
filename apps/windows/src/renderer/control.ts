// Control window: choose a display, Start and Stop its capture, see what the capture produces, and
// open saved ink. Everything is rendered with textContent; the page only reaches the main process
// through the preload's calls.

import type { DisplaySample } from '../shared/samples.ts';
import type { DesktopInkSummary } from '../shared/desktop-ink.ts';

type DisplayChoice = { source_id: string; display_id: string; label: string; bounds: { x: number; y: number; width: number; height: number }; scale_factor: number; primary: boolean; thumbnail: string };
type Kept = { id: string; created_at: string; display_label: string; strokes: number; revision: number; reason: string; exported_to: string | null; spare_copy: boolean };
type ContextItem = {
  stroke: number;
  written_at: string;
  visible: 'visible' | 'partly erased' | 'erased or undone';
  reason: 'writing_started' | 'changed_while_writing';
  from_point: number;
  frame_seq: number;
  frame_taken_at: string;
  region: { x: number; y: number; width: number; height: number };
  region_px: { width: number; height: number };
  not_observed: string[];
  picture: string | null;
  picture_state: string;
};
type Result = { ok: true } | { ok: false; reason: string };
type SessionInfo = { running: true; starting: boolean; ending: boolean; display: { label: string; bounds: { width: number; height: number }; scale_factor: number }; session_id: string } | { running: false; starting: boolean; ended: string | null };
/** The development capture link (main process, capture-link.ts), as counts and states only. */
type LinkStatus =
  | { mode: 'off' }
  | { mode: 'unavailable'; reason: string }
  | { mode: 'development'; state: string; stored: number; unknown: number; refused: number; not_sent: number; detail: string | null; earlier_unknown: number; sends_stopped: boolean; storing: boolean };
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
  inkContexts(id: string): Promise<{ ok: true; items: ContextItem[]; not_shown: number } | { ok: false; reason: string }>;
  recoveries(): Promise<Kept[]>;
  retryRecovery(id: string): Promise<{ ok: true; saved_as: string } | { ok: false; reason: string }>;
  exportRecovery(id: string): Promise<Result>;
  discardRecovery(id: string): Promise<Result>;
  onRecoveries(fn: (list: Kept[]) => void): void;
  onCloseHeld(fn: () => void): void;
  onRetention(fn: (r: { frames: number; bytes: number; not_retained: number; refused: number; unwritten: number; unfinished: number[] | null; ended: boolean; end_recorded: boolean; place: string }) => void): void;
  linkState(): Promise<LinkStatus | null>;
  onLink(fn: (s: LinkStatus) => void): void;
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
    const pictures = document.createElement('button');
    pictures.type = 'button';
    pictures.className = 'plain';
    pictures.textContent = 'Pictures';
    pictures.addEventListener('click', () => void showContexts(s.id, text.textContent ?? ''));
    li.append(text, pictures, open);
    return li;
  });
  if (unreadable > 0) items.push(Object.assign(document.createElement('li'), { textContent: `${unreadable} saved file(s) cannot be read by this version and are left untouched.` }));
  if (items.length === 0) items.push(Object.assign(document.createElement('li'), { textContent: 'No saved ink yet.' }));
  $('ink').replaceChildren(...items);
}

const button = (label: string, onClick: () => void, plain = false): HTMLButtonElement => {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  if (plain) b.className = 'plain';
  b.addEventListener('click', onClick);
  return b;
};

/** Ink that could not be written: kept in the app until the user retries, exports or discards it. */
function showKept(list: Kept[]): void {
  $('kept').hidden = list.length === 0;
  if (list.length === 0) $('closeHeld').hidden = true;
  $('keptList').replaceChildren(
    ...list.map((k) => {
      const li = document.createElement('li');
      const text = document.createElement('span');
      const spare = k.spare_copy ? ' A spare copy is also in your temporary folder, under "Learning Companion unsaved ink".' : '';
      text.textContent = `${new Date(k.created_at).toLocaleString()} · ${k.display_label} · ${k.strokes} stroke(s): not saved because ${k.reason}.${k.exported_to ? ` Exported to ${k.exported_to}.` : ''}${spare}`;
      const note = document.createElement('span');
      const act = (fn: () => Promise<{ ok: boolean; reason?: string }>, done: string) => async () => {
        try {
          const r = await fn();
          note.textContent = r.ok ? done : ` ${r.reason ?? ''}`;
        } catch (error) {
          note.textContent = ` It did not work: ${error instanceof Error ? error.message : String(error)}`;
        }
      };
      const buttons = document.createElement('span');
      buttons.className = 'buttons';
      buttons.append(
        button('Retry saving', act(() => lc.retryRecovery(k.id), ' Saved.')),
        button('Export…', act(() => lc.exportRecovery(k.id), ' Exported.'), true),
        button('Discard…', act(() => lc.discardRecovery(k.id), ' Discarded.'), true),
      );
      li.append(text, buttons, note);
      return li;
    }),
  );
}

/** The pictures of what a saved session's strokes were written over, with where and when they come from. */
async function showContexts(id: string, title: string): Promise<void> {
  const r = await lc.inkContexts(id);
  $('contexts').hidden = false;
  if (!r.ok) {
    $('contextsNote').textContent = `The pictures of ${title} cannot be shown: ${r.reason}.`;
    return void $('contextList').replaceChildren();
  }
  $('contextsNote').textContent = `${title}. Each picture is cropped from the captured display as it was: when a stroke began, and again when what was under it changed while writing. The app, link, page and media position shown are not known from a picture of the display.${r.not_shown > 0 ? ` ${r.not_shown} more picture(s) are not shown here.` : ''}`;
  $('contextList').replaceChildren(
    ...r.items.map((c) => {
      const li = document.createElement('li');
      if (c.picture) {
        const img = document.createElement('img');
        img.src = c.picture;
        img.alt = `What stroke ${c.stroke} was written over`;
        li.append(img);
      }
      const text = document.createElement('span');
      const why = c.reason === 'writing_started' ? 'when it began' : `changed while writing, from point ${c.from_point + 1}`;
      const state = c.picture ? '' : ` Picture ${c.picture_state}.`;
      text.textContent = `Stroke ${c.stroke}${c.visible === 'visible' ? '' : ` (${c.visible})`} · ${why} · frame ${c.frame_seq} at ${new Date(c.frame_taken_at).toLocaleTimeString()} · ${Math.round(c.region.width)}×${Math.round(c.region.height)} DIP at ${Math.round(c.region.x)},${Math.round(c.region.y)} (${c.region_px.width}×${c.region_px.height} px).${state}`;
      li.append(text);
      return li;
    }),
  );
}
$('contextsClose').addEventListener('click', () => ($('contexts').hidden = true));

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
  const raw = s.raw ? `${s.raw.width}×${s.raw.height} px, held frame ${(s.raw.frame_age_ms / 1000).toFixed(1)} s old, change ${s.raw.change === null ? '—' : (s.raw.change * 100).toFixed(1) + '%'}` : 'no frame';
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
  const starting = !s.running && s.starting;
  ($('start') as HTMLButtonElement).disabled = s.running || starting;
  ($('stop') as HTMLButtonElement).disabled = s.running ? s.ending : !starting; // Stop also cancels a Start in progress
  if (s.running) {
    $('session').textContent = s.ending
      ? 'Stopping… live capture has ended.'
      : s.starting
      ? 'Starting: opening the overlay…'
      : `Capturing ${s.display.label} (${s.display.bounds.width}×${s.display.bounds.height} at ${s.display.scale_factor}×). The overlay is on that display: ✋ passes clicks to your apps, ✎ writes, ? selects.`;
  } else {
    $('session').textContent = starting ? 'Starting: listing the displays and opening the overlay…' : s.ended ? `Not capturing: ${s.ended.replace(/\.$/, '')}.` : 'Not capturing.';
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
lc.onRecoveries(showKept);
lc.onRetention((r) => {
  const mb = (r.bytes / 1024 / 1024).toFixed(1);
  const problems = [
    r.refused > 0 ? `${r.refused} refused` : '',
    r.unwritten > 0 ? `${r.unwritten} event(s) not listed (the list could not be written)` : '',
    r.unfinished ? (r.unfinished.length > 0 ? `${r.unfinished.length} frame(s) lost: the overlay ended before writing them` : 'frames after the last listed one may be missing: the overlay ended before confirming them') : '',
    r.ended && !r.end_recorded ? 'the end of this record could not be written yet (tried again at the next Start and when the app closes)' : '',
  ].filter(Boolean).join('; ');
  $('retention').textContent = `Whole-display frames kept on this device: ${r.frames} (${mb} MB), in ${r.place}. ${r.not_retained} sample(s) not kept, each recorded with why (a smaller change, the limit, or a failure).${problems ? ` ${problems}.` : ''}`;
});
lc.onCloseHeld(() => {
  $('closeHeld').hidden = false;
  $('kept').scrollIntoView();
});
void lc.recoveries().then(showKept);
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

/** The header when nothing is stored anywhere (control.html's own text). */
const AI_DEFAULT = 'No AI is connected: captured frames and ink stay on this device, and nothing is sent anywhere.';
/** What the development capture link does; in that mode the header says it too. Otherwise the header is the default. */
function showLink(l: LinkStatus): void {
  const el = $('link');
  if (l.mode !== 'development') $('ai').textContent = AI_DEFAULT;
  if (l.mode === 'off') {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  if (l.mode === 'unavailable') {
    // Storage cannot happen: the header keeps saying nothing is sent.
    el.textContent = `Capture storage (development): off. ${l.reason}.`;
    return;
  }
  // The header says what is happening now, never what is merely configured. After a fault, earlier sends are not
  // undone and stay counted; only further sends have stopped.
  $('ai').textContent = l.sends_stopped
    ? 'Development mode: captured frames and ink are kept on this device. Further sends to the local test capture service on it have stopped; what the latest capture sent before is counted below. No AI is connected; nothing is sent to any AI.'
    : l.storing
      ? 'Development mode: captured frames and ink are kept on this device and are also being stored in a local test capture service on it; the counts are below. No AI is connected; nothing is sent to any AI.'
      : 'Development mode: captured frames and ink are kept on this device. A local test capture service on it is not storing them now; its state, and the latest capture\'s counts, are below. No AI is connected; nothing is sent to any AI.';
  const states: Record<string, string> = {
    idle: 'not connected yet (a connection is tried when you press Start)',
    connecting: 'connecting',
    sending: 'storing',
    stalled: 'not storing now (the frames are kept on this device)',
    offline: 'offline (the frames are kept on this device)',
    stopping: 'stopping: nothing new is sent',
    stopped: 'stopped',
    'not connected': 'not connected (the frames stay on this device)',
    'ended by the service': 'ended by the service',
    reconciling: 'checking earlier streams',
  };
  const parts = [
    `${l.stored} record(s) stored`,
    l.unknown > 0 ? `${l.unknown} not known whether stored` : '',
    l.refused > 0 ? `${l.refused} refused` : '',
    l.not_sent > 0 ? `${l.not_sent} not sent (kept on this device)` : '',
    l.earlier_unknown > 0 ? `${l.earlier_unknown} earlier stream(s) whose end is not known` : '',
  ].filter(Boolean);
  el.textContent = `Capture storage (development): ${states[l.state] ?? l.state}. ${parts.join('; ')}.${l.detail ? ` ${l.detail}.` : ''} AI: not connected.`;
}
lc.onLink(showLink);
void lc.linkState().then((l) => (l ? showLink(l) : undefined));
void showDisplays();
void showInk();
