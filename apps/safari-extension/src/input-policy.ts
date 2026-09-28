// Decides, per pointer/touch event, whether the probe may take the input away
// from the page. Everything not explicitly claimed passes through untouched:
// no preventDefault, no stopPropagation, no explanation request.

import type { Mode } from './mode.ts';

export type PointerKind = 'pen' | 'touch' | 'mouse' | 'unknown';
export type InputTarget = 'page' | 'own_ui';

export type InputDecision =
  /** Leave the event to the page (scroll, tap, zoom, scrub, text selection...). */
  | 'pass_through'
  /** Claim the gesture to draw an ASK selection (tap, stroke or closed lasso). */
  | 'ask_capture'
  /** Let the page handle it, then read a non-empty text selection at pointerup (desktop mouse ASK). */
  | 'ask_observe_text'
  /** Claim the gesture as user ink in WRITE mode. */
  | 'ink_capture';

export type InputContext = {
  readonly mode: Mode;
  readonly pointer: PointerKind;
  readonly target: InputTarget;
  /** True only after a real pen pointer was observed; pairing is not assumed. */
  readonly penObserved: boolean;
};

export function decideInput(ctx: InputContext): InputDecision {
  if (ctx.target === 'own_ui') return 'pass_through';
  switch (ctx.mode) {
    case 'NAV':
      return 'pass_through';
    case 'WRITE':
      // Fingers and mice keep operating the page; only a pen writes ink.
      return ctx.pointer === 'pen' ? 'ink_capture' : 'pass_through';
    case 'ASK':
      if (ctx.pointer === 'pen') return 'ask_capture';
      if (ctx.pointer === 'mouse') return 'ask_observe_text';
      // Explicit finger selection exists only when no pen has been observed;
      // with a pen, fingers keep navigating (requirements §7.2).
      if (ctx.pointer === 'touch') return ctx.penObserved ? 'pass_through' : 'ask_capture';
      return 'pass_through';
  }
}

export function pointerKindOf(pointerType: string): PointerKind {
  return pointerType === 'pen' || pointerType === 'touch' || pointerType === 'mouse' ? pointerType : 'unknown';
}

/** Maps a capture decision to the contract's `Selection.input_mode`. */
export function selectionInputMode(pointer: PointerKind, decision: InputDecision): 'pencil_ask' | 'explicit_touch_ask' | 'explicit_text_ask' | null {
  if (decision === 'ask_observe_text') return 'explicit_text_ask';
  if (decision !== 'ask_capture') return null;
  if (pointer === 'pen') return 'pencil_ask';
  if (pointer === 'touch') return 'explicit_touch_ask';
  return null;
}
