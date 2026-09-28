// DOM-free orchestration of one probe page: explicit modes, input decisions,
// frozen selections, silent cards and the bridge. The page layer supplies a
// synchronously captured snapshot; everything after that works on frozen data.

import type { BridgeRequest, ExplanationCard, ExplanationRequest, Selection } from './contracts.ts';
import { freezeSelection, normalizePolygon, normalizeRect, type PixelPoint, type PixelRect } from './anchor.ts';
import { buildBridgeRequest, submitSelection, type BridgeOutcome, type NativeTransport } from './bridge.ts';
import { buildExplanationRequest, normalizeSelectedText, resolveProbeCard, type FixtureExplanation } from './explain.ts';
import { freezeDomSnapshot, type Clock, type DomSnapshotPayload, type FrozenFrame, type Identity, type Ids, type SourceBinding } from './frame.ts';
import { decideInput, type InputDecision, type InputTarget, type PointerKind } from './input-policy.ts';
import { INITIAL_MODE_STATE, mayRequestExplanation, reduceMode, type Mode, type ModeState } from './mode.ts';

export type SessionConfig = {
  readonly identity: Identity;
  readonly ids: Ids;
  readonly clock: Clock;
  readonly transport: NativeTransport;
  readonly fixtures: ReadonlyArray<FixtureExplanation>;
  /** Maps the current page to a registered source version; null when unknown. */
  readonly resolveSource: (snapshot: DomSnapshotPayload) => SourceBinding | null;
  readonly projectId: string | null;
  readonly knowledgeProfileVersion: number;
};

export type AskCapture = {
  readonly askEpoch: number;
  readonly inputMode: Selection['input_mode'];
  /** Viewport-pixel geometry of what the user marked. */
  readonly rect: PixelRect;
  readonly polygon?: ReadonlyArray<PixelPoint>;
  /** Snapshot taken synchronously when the gesture ended. */
  readonly snapshot: DomSnapshotPayload;
};

export type AskOutcome =
  | { readonly status: 'not_in_ask' }
  | { readonly status: 'source_unregistered' }
  | { readonly status: 'empty_geometry' }
  | {
      readonly status: 'submitted';
      readonly frozen: FrozenFrame;
      readonly selection: Selection;
      readonly request: ExplanationRequest;
      readonly card: ExplanationCard;
      readonly bridgeRequest: BridgeRequest;
      readonly bridge: BridgeOutcome;
    };

export type SessionListener = (state: ModeState) => void;

export class ProbeSession {
  #state: ModeState = INITIAL_MODE_STATE;
  #penObserved = false;
  #explanationRequests = 0;
  #listeners = new Set<SessionListener>();
  readonly #config: SessionConfig;

  constructor(config: SessionConfig) {
    this.#config = config;
  }

  get state(): ModeState {
    return this.#state;
  }

  get penObserved(): boolean {
    return this.#penObserved;
  }

  /** Number of explanation requests ever issued; NAV/WRITE input must never raise it. */
  get explanationRequestCount(): number {
    return this.#explanationRequests;
  }

  subscribe(listener: SessionListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #set(state: ModeState): void {
    if (state === this.#state) return;
    this.#state = state;
    for (const l of this.#listeners) l(state);
  }

  press(mode: Mode): void {
    this.#set(reduceMode(this.#state, { type: 'press', mode }).state);
  }

  cancelAsk(): void {
    this.#set(reduceMode(this.#state, { type: 'ask_cancelled' }).state);
  }

  /**
   * Classifies an input and records real pen presence (never assumed from pairing).
   * Callers must pass only trusted input events.
   */
  classify(pointer: PointerKind, target: InputTarget): InputDecision {
    if (pointer === 'pen') this.#penObserved = true;
    return decideInput({ mode: this.#state.mode, pointer, target, penObserved: this.#penObserved });
  }

  /** A pen seen by another document of the same page (frames share one input rule). */
  notePenObserved(): void {
    this.#penObserved = true;
  }

  /** Exact fixture text for a relayed frame card; null for anything else. */
  fixtureText(sourceId: string, sourceVersion: number, selectedText: string): string | null {
    const wanted = normalizeSelectedText(selectedText);
    if (wanted.length === 0) return null;
    const f = this.#config.fixtures.find((x) => x.source_id === sourceId && x.source_version === sourceVersion && normalizeSelectedText(x.selected_text) === wanted);
    return f ? f.text : null;
  }

  async submitAsk(capture: AskCapture): Promise<AskOutcome> {
    if (!mayRequestExplanation(this.#state, capture.askEpoch)) return { status: 'not_in_ask' };
    const { snapshot } = capture;
    const viewport = snapshot.viewport;
    const geometry = capture.polygon
      ? normalizePolygon(capture.polygon, viewport)
      : (() => {
          const bbox = normalizeRect(capture.rect, viewport);
          return bbox ? { bbox, polygon: undefined } : null;
        })();
    if (!geometry) return { status: 'empty_geometry' };
    const source = this.#config.resolveSource(snapshot);
    if (!source) {
      this.#set(reduceMode(this.#state, { type: 'ask_finished', askEpoch: capture.askEpoch }).state);
      return { status: 'source_unregistered' };
    }
    const { ids, clock, identity } = this.#config;
    const frozen = await freezeDomSnapshot(snapshot, identity, source, ids, clock);
    const selection = freezeSelection(frozen.frame, {
      id: ids.next('sel'),
      bbox: geometry.bbox,
      ...(geometry.polygon ? { polygon: geometry.polygon } : {}),
      selectedText: snapshot.selection.text,
      inputMode: capture.inputMode,
      createdAt: clock(),
    });
    // The ASK may have been cancelled while hashing; a stale capture is dropped.
    if (!mayRequestExplanation(this.#state, capture.askEpoch)) return { status: 'not_in_ask' };
    this.#set(reduceMode(this.#state, { type: 'ask_finished', askEpoch: capture.askEpoch }).state);
    this.#explanationRequests += 1;
    const request = buildExplanationRequest(selection, ids.next('req'), this.#config.projectId, this.#config.knowledgeProfileVersion);
    const card = resolveProbeCard(request, selection, this.#config.fixtures);
    const bridgeRequest = buildBridgeRequest(selection, ids.next('brq'));
    const bridge = await submitSelection(this.#config.transport, bridgeRequest);
    return { status: 'submitted', frozen, selection, request, card, bridgeRequest, bridge };
  }
}
