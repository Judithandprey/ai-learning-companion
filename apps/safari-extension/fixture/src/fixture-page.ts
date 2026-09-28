// Owned top-level fixture page: ordinary page behavior (counters, captions,
// scrub bar, fullscreen, version change), a locally generated synthetic video,
// and the probe installed as it would be by a content script.

import { CHANNEL } from '../../src/page.ts';
import { FIXTURE_ORIGINS } from '../../src/fixture-data.ts';
import { boot, deferredBridge, otherFixtureOrigin, pointOf, versionMeta } from './common.ts';

export type PageCounters = {
  clicks: number;
  linkClicks: number;
  scrolls: number;
  scrubInputs: number;
  pagePointer: Record<string, number>;
  pageTouch: number;
  pageWheel: number;
};

export type FrameState = { origin: string; mode: string; explanation_requests: number; clicks: number; phrase_rect: unknown; last_ask: unknown };

const selfTest = new URLSearchParams(location.search).get('selftest') === '1';
const bridge = selfTest ? deferredBridge() : null;
const handle = boot('top', selfTest, bridge?.transport);
const counters: PageCounters = { clicks: 0, linkClicks: 0, scrolls: 0, scrubInputs: 0, pagePointer: {}, pageTouch: 0, pageWheel: 0 };
const frameStates: Record<string, FrameState> = {};
const videoInfo: Record<string, unknown> = { status: 'pending' };

const $ = <T extends HTMLElement>(id: string): T => {
  const e = document.getElementById(id);
  if (!e) throw new Error(`missing #${id}`);
  return e as T;
};

// ---- ordinary page behavior the probe must not disturb ----------------------
$('counter-btn').addEventListener('click', () => {
  counters.clicks += 1;
  $('counter').textContent = String(counters.clicks);
});
$('link').addEventListener('click', () => (counters.linkClicks += 1));
window.addEventListener('scroll', () => (counters.scrolls += 1), { passive: true });
$('scrub').addEventListener('input', () => (counters.scrubInputs += 1));
for (const type of ['pointerdown', 'pointerup']) {
  document.addEventListener(type, (e) => {
    const key = `${type}:${(e as PointerEvent).pointerType}`;
    counters.pagePointer[key] = (counters.pagePointer[key] ?? 0) + 1;
  });
}
document.addEventListener('touchstart', () => (counters.pageTouch += 1), { passive: true });
document.addEventListener('wheel', () => (counters.pageWheel += 1), { passive: true });

$('publish-v2').addEventListener('click', () => {
  versionMeta(document).setAttribute('content', '2');
  $('p-basis').textContent = 'A change of basis (version 2 wording) re-expresses the same vector in new coordinates.';
});

$('fs-container').addEventListener('click', () => {
  void $('player-box').requestFullscreen?.().catch((error: unknown) => (videoInfo['fullscreen_container_error'] = String(error)));
});
$('fs-video').addEventListener('click', () => {
  void $<HTMLVideoElement>('video').requestFullscreen?.().catch((error: unknown) => (videoInfo['fullscreen_video_error'] = String(error)));
});

// ---- frames -------------------------------------------------------------------
const other = otherFixtureOrigin();
$<HTMLIFrameElement>('frame-cross').src = `${other}/fixture/frame.html`;
window.addEventListener('message', (e: MessageEvent) => {
  if (!FIXTURE_ORIGINS.includes(e.origin)) return;
  const data = e.data as (FrameState & { channel?: string; type?: string }) | null;
  if (!data || data.channel !== CHANNEL || data.type !== 'frame_state') return;
  frameStates[e.origin] = { origin: data.origin, mode: data.mode, explanation_requests: data.explanation_requests, clicks: data.clicks, phrase_rect: data.phrase_rect, last_ask: data.last_ask };
});

// ---- captions: native track plus a DOM caption line like custom players ------
const video = $<HTMLVideoElement>('video');
const crossTrack = $<HTMLTrackElement>('track-cross');
crossTrack.src = `${other}/fixture/captions.vtt`;
const sameTrack = $<HTMLTrackElement>('track-same');
sameTrack.track.mode = 'showing';
crossTrack.track.mode = 'hidden';
sameTrack.track.addEventListener('cuechange', () => {
  const cues = sameTrack.track.activeCues;
  const texts: string[] = [];
  for (let i = 0; cues && i < cues.length; i++) texts.push((cues[i] as VTTCue).text);
  $('dom-caption').textContent = texts.join(' ');
});
video.addEventListener('timeupdate', () => {
  if (Number.isFinite(video.duration) && video.duration > 0) {
    $<HTMLInputElement>('scrub').value = String(Math.round((video.currentTime / video.duration) * 100));
  }
});

// ---- synthetic video generated locally (no external media) -------------------
async function generateVideo(seconds: number): Promise<void> {
  const canvas = document.createElement('canvas');
  canvas.width = 480;
  canvas.height = 270;
  const ctx = canvas.getContext('2d');
  if (!ctx || typeof canvas.captureStream !== 'function') {
    videoInfo['status'] = 'no_canvas_capture';
    return;
  }
  const start = performance.now();
  let raf = 0;
  const draw = (): void => {
    const t = (performance.now() - start) / 1000;
    ctx.fillStyle = '#1f3b2c';
    ctx.fillRect(0, 0, 480, 270);
    ctx.fillStyle = '#f5f5dc';
    ctx.font = '30px serif';
    ctx.fillText('Board: A v = λ v', 30, 70);
    ctx.font = '22px serif';
    ctx.fillText(`t = ${t.toFixed(1)} s (synthetic)`, 30, 120);
    ctx.fillRect(30 + ((t * 60) % 400), 160, 20, 20);
    raf = requestAnimationFrame(draw);
  };
  draw();
  const stream = canvas.captureStream(30);
  if (typeof MediaRecorder !== 'function') {
    video.srcObject = stream;
    videoInfo['status'] = 'live_canvas_stream';
    return;
  }
  const recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : '' });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => chunks.push(e.data);
  const stopped = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));
  recorder.start(250);
  await new Promise((r) => setTimeout(r, seconds * 1000));
  recorder.stop();
  await stopped;
  cancelAnimationFrame(raf);
  const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
  video.src = URL.createObjectURL(blob);
  videoInfo['status'] = 'recorded_blob';
  videoInfo['mime'] = blob.type;
  videoInfo['bytes'] = blob.size;
}

const videoReady = generateVideo(9).then(() => {
  $('status').textContent = `Synthetic video: ${String(videoInfo['status'])}`;
});

const fixtureApi = {
  point: (selector: string, phrase?: string) => pointOf(document, selector, phrase),
  /** Viewport point of a phrase inside a frame, from the frame's own report (works cross-origin). */
  framePoint: (frameId: string, origin: string) => {
    const frame = document.getElementById(frameId);
    const inner = frameStates[origin]?.phrase_rect as { x: number; y: number; left: number; right: number } | null | undefined;
    if (!frame || !inner) return null;
    const r = frame.getBoundingClientRect();
    const dx = r.left + frame.clientLeft;
    const dy = r.top + frame.clientTop;
    return { x: inner.x + dx, y: inner.y + dy, left: inner.left + dx, right: inner.right + dx };
  },
  /** Flat path objects ({x0..xn, y0..yn}) so the CDP runner can substitute fields. */
  sweep: (selector: string, phrase: string, n = 8) => {
    const q = pointOf(document, selector, phrase);
    if (!q) return null;
    const out: Record<string, number> = {};
    for (let i = 0; i <= n; i++) {
      out[`x${i}`] = q.left + 2 + ((q.right - q.left - 4) * i) / n;
      out[`y${i}`] = q.y + (i === n ? 1 : 0);
    }
    return out;
  },
  frameSweep: (frameId: string, origin: string, n = 8) => {
    const q = fixtureApi.framePoint(frameId, origin);
    if (!q) return null;
    const out: Record<string, number> = {};
    for (let i = 0; i <= n; i++) {
      out[`x${i}`] = q.left + 2 + ((q.right - q.left - 4) * i) / n;
      out[`y${i}`] = q.y;
    }
    return out;
  },
  ellipse: (selector: string, n = 16, fx = 0.3, fy = 0.25) => {
    const q = pointOf(document, selector);
    if (!q) return null;
    const out: Record<string, number> = {};
    const rx = (q.right - q.left) * fx;
    const ry = (q.bottom - q.top) * fy;
    for (let i = 0; i <= n; i++) {
      out[`x${i}`] = q.x + rx * Math.cos((i / n) * 2 * Math.PI);
      out[`y${i}`] = q.y - (q.bottom - q.top) * 0.15 + ry * Math.sin((i / n) * 2 * Math.PI);
    }
    return out;
  },
  toolbar: (mode: string) => {
    const r = handle.toolbarRects()[mode];
    return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2, visible: r.width > 0 ? 1 : 0 } : null;
  },
  lastAsk: () => {
    const e = [...handle.events].reverse().find((x) => x.type === 'ask');
    if (!e || e.type !== 'ask') return null;
    const d = e.detail as { selection?: { input_mode?: string; selected_text?: string; media_position?: number | null; source_id?: string; source_version?: number }; card?: { status?: string; provenance?: string; audio?: boolean }; frame?: { representation?: string } };
    return {
      outcome: e.outcome,
      input_mode: d.selection?.input_mode ?? null,
      selected_text: d.selection?.selected_text ?? null,
      media_position: d.selection?.media_position ?? null,
      source_id: d.selection?.source_id ?? null,
      source_version: d.selection?.source_version ?? null,
      card_status: d.card?.status ?? null,
      provenance: d.card?.provenance ?? null,
      audio: d.card?.audio ?? null,
      representation: d.frame?.representation ?? null,
      asks: handle.events.filter((x) => x.type === 'ask').length,
    };
  },
  eventsOf: (type: string) => handle.events.filter((x) => x.type === type),
  /** Viewport point of an element inside the same-origin frame. */
  sameFramePoint: (selector: string) => {
    const frame = document.getElementById('frame-same') as HTMLIFrameElement | null;
    const inner = frame?.contentDocument ? pointOf(frame.contentDocument, selector) : null;
    if (!frame || !inner) return null;
    const r = frame.getBoundingClientRect();
    return { x: inner.x + r.left + frame.clientLeft, y: inner.y + r.top + frame.clientTop };
  },
  otherOrigin: other,
  state: () => ({
    mode: handle.session.state.mode,
    penObserved: handle.session.penObserved,
    requests: handle.session.explanationRequestCount,
    scrollY,
    visualScale: visualViewport?.scale ?? null,
    fullscreen: document.fullscreenElement?.id ?? null,
    selection: getSelection()?.toString() ?? '',
    counters,
    videoTime: video.currentTime,
    videoStatus: videoInfo['status'],
  }),
};
window.__lcProbe = { ...handle, counters, frameStates, videoInfo, videoReady, fixture: fixtureApi };

if (selfTest) {
  // Keep the load event pending until the self-test reports, so headless
  // screenshot/dump runs capture the finished state.
  const hold = document.createElement('img');
  hold.alt = '';
  hold.width = 1;
  hold.height = 1;
  hold.src = `/__hold?run=${encodeURIComponent(new URLSearchParams(location.search).get('run') ?? 'manual')}`;
  document.body.append(hold);
  void import('./selftest.ts').then((m) => m.runSelfTest(handle, counters, frameStates, videoInfo, videoReady, bridge!));
}
