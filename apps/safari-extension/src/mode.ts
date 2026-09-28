// Explicit input modes (requirements §7.2). NAV is the default; ASK is entered
// only by an explicit control and returns to the previous mode after one
// selection is finished or cancelled; WRITE persists until the user switches.

export type Mode = 'NAV' | 'ASK' | 'WRITE';
export type PersistentMode = Exclude<Mode, 'ASK'>;

export type ModeState = {
  readonly mode: Mode;
  /** Mode to restore when ASK ends; equals `mode` outside ASK. */
  readonly returnMode: PersistentMode;
  /** Increments on every ASK entry so late results from an old ASK are ignored. */
  readonly askEpoch: number;
};

export type ModeAction =
  | { readonly type: 'press'; readonly mode: Mode }
  | { readonly type: 'ask_finished'; readonly askEpoch: number }
  | { readonly type: 'ask_cancelled' };

export type ModeTransition = {
  readonly state: ModeState;
  /** True when an ASK ended because of this action (finished or cancelled). */
  readonly askEnded: 'finished' | 'cancelled' | null;
};

export const INITIAL_MODE_STATE: ModeState = Object.freeze({ mode: 'NAV', returnMode: 'NAV', askEpoch: 0 });

function settled(mode: PersistentMode, askEpoch: number): ModeState {
  return Object.freeze({ mode, returnMode: mode, askEpoch });
}

export function reduceMode(state: ModeState, action: ModeAction): ModeTransition {
  switch (action.type) {
    case 'press': {
      if (action.mode === 'ASK') {
        // Pressing ASK again while asking is a cancel, not a nested ASK.
        if (state.mode === 'ASK') return { state: settled(state.returnMode, state.askEpoch), askEnded: 'cancelled' };
        return {
          state: Object.freeze({ mode: 'ASK', returnMode: state.mode, askEpoch: state.askEpoch + 1 }),
          askEnded: null,
        };
      }
      // An explicit NAV/WRITE press replaces an unfinished ASK without submitting it.
      const askEnded = state.mode === 'ASK' ? 'cancelled' : null;
      return { state: settled(action.mode, state.askEpoch), askEnded };
    }
    case 'ask_finished': {
      if (state.mode !== 'ASK' || action.askEpoch !== state.askEpoch) return { state, askEnded: null };
      return { state: settled(state.returnMode, state.askEpoch), askEnded: 'finished' };
    }
    case 'ask_cancelled': {
      if (state.mode !== 'ASK') return { state, askEnded: null };
      return { state: settled(state.returnMode, state.askEpoch), askEnded: 'cancelled' };
    }
  }
}

/** Only an active ASK may create a selection or request an explanation. */
export function mayRequestExplanation(state: ModeState, askEpoch: number): boolean {
  return state.mode === 'ASK' && state.askEpoch === askEpoch;
}
