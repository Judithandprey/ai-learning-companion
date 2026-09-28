// P0-12 FIXTURE-ONLY probe: what a content script can observe when a user answers
// on a website (A42/A43). It only listens and reads; it never sets values,
// dispatches events, clicks or submits anything. Record shapes are local
// placeholders, not contract 0.1.0 and not the future P0-08 contract.

export type Actor = 'user' | 'site_script' | 'unknown';
export type Access = 'readable' | 'closed_shadow' | 'visual_only';
export type Evidence = 'trusted_event' | 'untrusted_event' | 'scripted_activation' | 'value_diff' | 'group_state' | 'mutation' | 'pointer_only';

export type EntryRecord = {
  readonly seq: number;
  /** Document-local order only; records from different frames are not ordered by clocks. */
  readonly frame: string;
  readonly problem: { readonly id: string; readonly version: string } | null;
  readonly entry: string;
  readonly control: string | null;
  readonly kind:
    | 'select'
    | 'deselect'
    | 'reselect'
    | 'check'
    | 'uncheck'
    /** An event for a choice whose state did not actually change (e.g. a synthetic change). */
    | 'no_value_change'
    | 'text_edit'
    | 'stroke'
    | 'change_without_event'
    | 'opaque_change'
    | 'site_feedback'
    | 'problem_changed';
  readonly actor: Actor;
  readonly evidence: Evidence;
  readonly access: Access;
  readonly before?: string;
  readonly after?: string;
  readonly inputType?: string;
  readonly detail?: string;
};

type Control = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

export type ObserverOptions = {
  readonly win: Window;
  readonly frame: string;
  /** Elements owned by the probe itself (never recorded). */
  readonly ignore: ReadonlyArray<Element>;
  /** Per-site adapter: which container shows the site's own feedback/answers. */
  readonly siteFeedbackSelector: string | null;
  readonly problemSelector: string;
  readonly onRecord: (r: EntryRecord) => void;
  readonly pollMs?: number;
};

function describe(el: Element): string {
  const base = el.id ? `#${el.id}` : el.tagName.toLowerCase();
  const root = el.getRootNode();
  return root instanceof ShadowRoot ? `${describe(root.host)}>${base}` : base;
}

const SENSITIVE_AUTOCOMPLETE = /(^|\s)(current-password|new-password|one-time-code|cc-[a-z-]+)(\s|$)/;

function isTextControl(el: Element): el is HTMLInputElement | HTMLTextAreaElement {
  return el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && !['radio', 'checkbox', 'password', 'hidden', 'file'].includes(el.type));
}

function valueOf(el: Control): string {
  if (el instanceof HTMLInputElement && (el.type === 'radio' || el.type === 'checkbox')) return el.checked ? 'on' : 'off';
  if (isTextControl(el)) return el.value;
  return (el.textContent ?? '').trim();
}

export function installEntryObserver(o: ObserverOptions): { stop: () => void; records: EntryRecord[] } {
  const { win } = o;
  const doc = win.document;
  const records: EntryRecord[] = [];
  let seq = 0;
  const known = new Map<Control, string>();
  const everSelected = new Map<string, Set<string>>(); // radio group -> values chosen in this problem
  let problem: EntryRecord['problem'] = null;
  // A script calling el.click() produces an untrusted click, but the checkbox/radio
  // activation it causes fires input/change events that may report isTrusted=true.
  // So isTrusted on input/change alone does not prove a user action. A mark lives
  // only for the task of its click; during a live user gesture its source is unknown.
  const scriptedClick = new Map<Element, Actor>();
  // Choices already recorded from their composed `input` event in this task.
  const activationHandled = new WeakSet<Element>();
  // Once a field was sensitive it stays excluded, even if the page later changes its type
  // (e.g. a "show password" toggle): its values are never read or recorded.
  const sensitive = new WeakSet<Element>();
  const isSensitive = (el: Element): boolean => {
    if (sensitive.has(el)) return true;
    const input = el instanceof HTMLInputElement ? el : null;
    const ac = (el.getAttribute('autocomplete') ?? '').toLowerCase();
    if ((input && ['password', 'hidden', 'file'].includes(input.type)) || SENSITIVE_AUTOCOMPLETE.test(ac)) {
      sensitive.add(el);
      return true;
    }
    return false;
  };

  const readProblem = (): EntryRecord['problem'] => {
    const p = doc.querySelector<HTMLElement>(o.problemSelector);
    return p ? { id: p.dataset['problemId'] ?? '', version: p.dataset['problemVersion'] ?? '' } : null;
  };
  problem = readProblem();

  const emit = (r: Omit<EntryRecord, 'seq' | 'frame' | 'problem'>): void => {
    const rec: EntryRecord = { seq: ++seq, frame: o.frame, problem, ...r };
    records.push(rec);
    o.onRecord(rec);
  };
  const ignored = (el: Element | null): boolean => !el || o.ignore.some((i) => i.contains(el));
  const entryOf = (el: Element): string => el.closest('[data-entry]')?.getAttribute('data-entry') ?? (el.getRootNode() instanceof ShadowRoot ? 'component' : 'unknown');

  /** All answer controls reachable from this document, including open shadow roots. */
  const controls = (): Control[] => {
    const out: Control[] = [];
    const visit = (root: Document | ShadowRoot): void => {
      root.querySelectorAll<HTMLElement>('input, textarea, [contenteditable="true"]').forEach((el) => {
        if (!ignored(el) && !isSensitive(el)) out.push(el);
      });
      root.querySelectorAll('*').forEach((el) => {
        if (el.shadowRoot) visit(el.shadowRoot); // closed roots return null and stay opaque
      });
    };
    visit(doc);
    return out;
  };
  const refreshKnown = (): void => {
    for (const c of controls()) if (!known.has(c)) known.set(c, valueOf(c));
  };
  refreshKnown();

  const onEvent = (e: Event): void => {
    const path = e.composedPath();
    const target = path[0];
    if (!(target instanceof Element) || ignored(target) || isSensitive(target)) return;
    const scripted = scriptedClick.get(target);
    const actor: Actor = scripted ?? (e.isTrusted ? 'user' : 'site_script');
    const evidence: Evidence = scripted ? 'scripted_activation' : e.isTrusted ? 'trusted_event' : 'untrusted_event';
    const scriptedNote =
      scripted === 'site_script'
        ? { detail: `activation from a scripted click(); this ${e.type} event reported isTrusted=${e.isTrusted}` }
        : scripted === 'unknown'
          ? { detail: `scripted click() during a live user gesture; this ${e.type} event reported isTrusted=${e.isTrusted}` }
          : {};
    // Closed shadow root: the event is retargeted to the host and the inner control is unreadable.
    const isControl = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable);
    if (!isControl) {
      if (target instanceof HTMLElement && target.localName.includes('-') && target.shadowRoot === null) {
        emit({ entry: entryOf(target), control: describe(target), kind: 'opaque_change', actor, evidence, access: 'closed_shadow', detail: `${e.type} from inside a closed shadow root; value and control not observable` });
      }
      return;
    }
    const el = target as Control;
    const choice = el instanceof HTMLInputElement && (el.type === 'radio' || el.type === 'checkbox') ? el : null;
    if (choice) {
      // Activation fires a composed `input` (it also reaches us from open shadow roots)
      // and then a non-composed `change`. A lone `change` is a synthetic one.
      if (e.type === 'change' && activationHandled.has(choice)) return;
      if (e.type === 'input') {
        activationHandled.add(choice);
        win.setTimeout(() => activationHandled.delete(choice), 0);
      }
      const before = known.get(choice);
      const after = valueOf(choice);
      known.set(choice, after);
      if (before === after) {
        emit({ entry: entryOf(choice), control: describe(choice), kind: 'no_value_change', actor, evidence, access: 'readable', before, after, ...scriptedNote });
        return;
      }
      if (choice.type === 'checkbox') {
        emit({ entry: entryOf(choice), control: describe(choice), kind: choice.checked ? 'check' : 'uncheck', actor, evidence, access: 'readable', ...(before === undefined ? {} : { before }), after, ...scriptedNote });
        return;
      }
      const group = choice.name;
      const root = choice.getRootNode() as Document | ShadowRoot;
      // The previously checked radio fires nothing; its deselection is derived from group state.
      root.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${CSS.escape(group)}"]`).forEach((r) => {
        if (r !== choice && known.get(r) === 'on' && !r.checked) {
          known.set(r, 'off');
          emit({ entry: entryOf(r), control: describe(r), kind: 'deselect', actor, evidence: 'group_state', access: 'readable', before: 'on', after: 'off', detail: `radio group "${group}"` });
        }
      });
      const chosen = everSelected.get(group) ?? new Set<string>();
      const kind = chosen.has(choice.value) ? 'reselect' : 'select';
      chosen.add(choice.value);
      everSelected.set(group, chosen);
      emit({ entry: entryOf(choice), control: describe(choice), kind, actor, evidence, access: 'readable', after: choice.value, ...scriptedNote });
      return;
    }
    if (e.type !== 'input') return; // text: one record per input event with exact before/after
    const before = known.get(el);
    const after = valueOf(el);
    known.set(el, after);
    emit({
      entry: entryOf(el),
      control: describe(el),
      kind: 'text_edit',
      actor,
      evidence,
      access: 'readable',
      ...(before === undefined ? {} : { before }),
      after,
      ...(e instanceof InputEvent && e.inputType ? { inputType: e.inputType } : {}),
    });
  };

  // Before a user edit, anything the page changed since our last reading (for example a
  // site reformatting the field in its own input handler) is recorded separately, so it
  // is never merged into the user's edit.
  const onBeforeInput = (e: Event): void => {
    const t = e.composedPath()[0];
    if (!(t instanceof Element) || ignored(t) || isSensitive(t)) return;
    if (!(t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || (t instanceof HTMLElement && t.isContentEditable))) return;
    const el = t as Control;
    const prev = known.get(el);
    const now = valueOf(el);
    if (prev !== undefined && prev !== now) {
      known.set(el, now);
      emit({ entry: entryOf(el), control: describe(el), kind: 'change_without_event', actor: 'unknown', evidence: 'value_diff', access: 'readable', before: prev, after: now, detail: 'changed since the last observed event, detected before the next user edit' });
    }
  };

  // Values changed without any event (e.g. a site restoring a draft) are only visible as a diff; the actor is unknown.
  const poll = (): void => {
    for (const c of controls()) {
      if (c instanceof HTMLInputElement && (c.type === 'radio' || c.type === 'checkbox') && activationHandled.has(c)) continue;
      const now = valueOf(c);
      const prev = known.get(c);
      if (prev === undefined) {
        known.set(c, now);
        continue;
      }
      if (prev !== now) {
        known.set(c, now);
        emit({ entry: entryOf(c), control: describe(c), kind: 'change_without_event', actor: 'unknown', evidence: 'value_diff', access: 'readable', before: prev, after: now, detail: 'changed without an observed input/change event; site script, browser autofill or another extension cannot be told apart' });
      }
    }
  };

  // Site canvases: pointer activity is observable, the drawing's semantics and undo history are not.
  let stroke: { target: HTMLCanvasElement; points: number; x0: number; y0: number; x1: number; y1: number; trusted: boolean } | null = null;
  const onPointer = (e: PointerEvent): void => {
    const t = e.composedPath()[0];
    if (e.type === 'pointerdown') {
      if (!(t instanceof HTMLCanvasElement) || ignored(t)) return;
      stroke = { target: t, points: 1, x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY, trusted: e.isTrusted };
    } else if (stroke && e.type === 'pointermove') {
      stroke.points += 1;
      stroke.x0 = Math.min(stroke.x0, e.clientX);
      stroke.y0 = Math.min(stroke.y0, e.clientY);
      stroke.x1 = Math.max(stroke.x1, e.clientX);
      stroke.y1 = Math.max(stroke.y1, e.clientY);
    } else if (stroke && (e.type === 'pointerup' || e.type === 'pointercancel')) {
      const s = stroke;
      stroke = null;
      let pixels = 'unknown';
      try {
        s.target.getContext('2d')?.getImageData(0, 0, 1, 1);
        pixels = 'readable (not read by the probe)';
      } catch {
        pixels = 'blocked (tainted or unavailable)';
      }
      emit({
        entry: entryOf(s.target),
        control: describe(s.target),
        kind: 'stroke',
        actor: s.trusted ? 'user' : 'site_script',
        evidence: 'pointer_only',
        access: 'visual_only',
        detail: `${s.points} pointer samples over ${Math.round(s.x1 - s.x0)}×${Math.round(s.y1 - s.y0)} px; site stroke storage, erase/undo and semantics not observable; canvas pixels ${pixels}`,
      });
    }
  };

  // Site feedback (answers, grading) and problem changes are recognized only through a per-site adapter.
  const mo = new MutationObserver((mutations) => {
    for (const m of mutations) {
      const el = m.target instanceof Element ? m.target : m.target.parentElement;
      if (!el || ignored(el)) continue;
      const problemEl = el.closest(o.problemSelector);
      if (m.type === 'attributes' && el.matches(o.problemSelector)) {
        const next = readProblem();
        if (next && (next.id !== problem?.id || next.version !== problem?.version)) {
          const prev = problem;
          problem = next;
          everSelected.clear();
          emit({ entry: 'problem', control: null, kind: 'problem_changed', actor: 'site_script', evidence: 'mutation', access: 'readable', before: prev ? `${prev.id}@${prev.version}` : '', after: `${next.id}@${next.version}` });
        }
      } else if (o.siteFeedbackSelector && el.closest(o.siteFeedbackSelector) && problemEl) {
        const box = el.closest(o.siteFeedbackSelector)!;
        const text = (box.textContent ?? '').trim();
        if (text) emit({ entry: 'site', control: describe(box), kind: 'site_feedback', actor: 'site_script', evidence: 'mutation', access: 'readable', after: text });
      }
    }
    refreshKnown();
  });
  mo.observe(doc.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['data-problem-id', 'data-problem-version'] });

  const onClick = (e: MouseEvent): void => {
    const t = e.composedPath()[0];
    if (!(t instanceof HTMLInputElement && (t.type === 'checkbox' || t.type === 'radio'))) return;
    if (e.isTrusted) {
      scriptedClick.delete(t);
      return;
    }
    const activation = (win.navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
    scriptedClick.set(t, activation?.isActive ? 'unknown' : 'site_script');
    // Activation events follow within this task; the mark must not outlive it.
    win.setTimeout(() => scriptedClick.delete(t), 0);
  };
  const cap = { capture: true } as const;
  win.addEventListener('click', onClick, cap);
  win.addEventListener('beforeinput', onBeforeInput, cap);
  win.addEventListener('input', onEvent, cap);
  win.addEventListener('change', onEvent, cap);
  for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) win.addEventListener(t, onPointer as EventListener, cap);
  const timer = win.setInterval(poll, o.pollMs ?? 200);

  return {
    records,
    stop: () => {
      win.clearInterval(timer);
      mo.disconnect();
      win.removeEventListener('click', onClick, cap);
      win.removeEventListener('beforeinput', onBeforeInput, cap);
      win.removeEventListener('input', onEvent, cap);
      win.removeEventListener('change', onEvent, cap);
      for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) win.removeEventListener(t, onPointer as EventListener, cap);
    },
  };
}
