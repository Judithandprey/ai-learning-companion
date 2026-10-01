// Where the overlay's movable surfaces (the toolbar, and the card that shows a response) sit on a display.
// A place is kept as two fractions of the free room in the display's work area: 0 is the left (top) edge, 1 the
// right (bottom) one. The same fractions give a place on any size of work area and at any scale, with the whole
// surface inside it, so a place kept on one geometry is restored and clamped on another. Pure: no I/O.

export const PLACEMENT_FORMAT = 'lc-windows-overlay-preferences/v1';
/** The surfaces that can be moved. */
export const SURFACES = ['toolbar', 'caption'] as const;
export type Surface = (typeof SURFACES)[number];
export type Place = { readonly fx: number; readonly fy: number };
export type Rect = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
/** Where each surface starts: the toolbar at the top right, the card at the bottom right (as before they could be moved). */
export const DEFAULT_PLACE: Readonly<Record<Surface, Place>> = { toolbar: { fx: 1, fy: 0 }, caption: { fx: 1, fy: 1 } };
/** The room kept free between a surface and the edge of the work area (DIP). */
export const EDGE_MARGIN = 10;
/** Places are kept for at most this many displays (the most recently used). */
export const DISPLAYS_MAX = 16;
/** The speech rate, as kept with the places. */
export const RATE_DEFAULT = 1.3;
export const RATE_MIN = 0.7;
export const RATE_MAX = 2;
export const RATE_STEP = 0.1;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const unit = (n: number): number => (Number.isNaN(n) ? 0 : Math.min(1, Math.max(0, n)));
const isUnit = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
export const isPlace = (v: unknown): v is Place => isObj(v) && Object.keys(v).sort().join() === 'fx,fy' && isUnit(v['fx']) && isUnit(v['fy']);
export const isSurface = (v: unknown): v is Surface => SURFACES.includes(v as Surface);
/** A speech rate inside its bounds, to one decimal. */
export const clampRate = (rate: number): number => (Number.isFinite(rate) ? Math.round(Math.min(RATE_MAX, Math.max(RATE_MIN, rate)) * 10) / 10 : RATE_DEFAULT);

/** The part of the display a surface may occupy: its work area (relative to the display's own corner), less the margin. */
export function usableArea(workArea: Rect): Rect {
  const m = Math.max(0, Math.min(EDGE_MARGIN, Math.floor(Math.min(workArea.width, workArea.height) / 4)));
  return { x: workArea.x + m, y: workArea.y + m, width: Math.max(0, workArea.width - 2 * m), height: Math.max(0, workArea.height - 2 * m) };
}
/**
 * The place of a surface whose top-left corner is wanted at (left, top): the fractions that put it there, clamped so
 * the whole surface stays inside the area. A surface as large as the area (or larger) is held at its start.
 */
export function placeAt(left: number, top: number, size: { width: number; height: number }, area: Rect): Place {
  const free = { w: area.width - size.width, h: area.height - size.height };
  return { fx: free.w > 0 ? unit((left - area.x) / free.w) : 0, fy: free.h > 0 ? unit((top - area.y) / free.h) : 0 };
}
/** The top-left corner a place gives a surface of this size in this area (what the style sheet works out). */
export function cornerOf(place: Place, size: { width: number; height: number }, area: Rect): { left: number; top: number } {
  return { left: area.x + place.fx * Math.max(0, area.width - size.width), top: area.y + place.fy * Math.max(0, area.height - size.height) };
}

export type DisplayPlaces = Partial<Record<Surface, Place>>;
/**
 * The key a display's places are kept under. Never a bare number: an object lists number-like keys in numeric order,
 * whatever order they were added in, and the order here is the order of use.
 */
export const displayKey = (displayId: string): string => `display:${displayId}`;
export const placesOf = (p: Preferences, displayId: string): DisplayPlaces => p.displays[displayKey(displayId)] ?? {};
export type Preferences = { readonly displays: Readonly<Record<string, DisplayPlaces>>; readonly speech_rate: number };
export const NO_PREFERENCES: Preferences = { displays: {}, speech_rate: RATE_DEFAULT };
/** The preferences as stored, read only if they are exactly this shape; anything else is null (and is left untouched). */
export function readPreferences(v: unknown): Preferences | null {
  if (!isObj(v) || Object.keys(v).sort().join() !== 'displays,format,speech_rate' || v['format'] !== PLACEMENT_FORMAT) return null;
  const rate = v['speech_rate'];
  if (typeof rate !== 'number' || clampRate(rate) !== rate || !isObj(v['displays'])) return null;
  const entries = Object.entries(v['displays']);
  if (entries.length > DISPLAYS_MAX) return null;
  const displays: Record<string, DisplayPlaces> = {};
  for (const [id, places] of entries) {
    if (!/^display:.{1,64}$/s.test(id) || !isObj(places) || !Object.keys(places).every(isSurface) || !Object.values(places).every(isPlace)) return null;
    displays[id] = Object.fromEntries(Object.entries(places).map(([s, p]) => [s, { fx: (p as Place).fx, fy: (p as Place).fy }]));
  }
  return { displays, speech_rate: rate };
}
/** The preferences with one surface's place on one display replaced; that display becomes the most recently used. */
export function withPlace(p: Preferences, displayId: string, surface: Surface, place: Place): Preferences {
  const key = displayKey(displayId);
  const others = Object.entries(p.displays).filter(([id]) => id !== key);
  const displays = Object.fromEntries([...others.slice(-(DISPLAYS_MAX - 1)), [key, { ...p.displays[key], [surface]: { fx: unit(place.fx), fy: unit(place.fy) } }]]);
  return { displays, speech_rate: p.speech_rate };
}
export const storedPreferences = (p: Preferences): string => `${JSON.stringify({ format: PLACEMENT_FORMAT, displays: p.displays, speech_rate: p.speech_rate })}\n`;
