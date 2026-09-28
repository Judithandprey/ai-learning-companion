// Silent explanation cards for the provider-disabled probe. A card is `ready`
// only for an exact known fixture (same source, version and selected text) and
// is labeled as a fixture. Everything else is reported as unavailable; the
// probe never fabricates an explanation.

import type { ExplanationCard, ExplanationRequest, Identifier, Selection } from './contracts.ts';

export type FixtureExplanation = {
  readonly source_id: Identifier;
  readonly source_version: number;
  /** Compared after whitespace normalization only; no fuzzy matching. */
  readonly selected_text: string;
  readonly text: string;
  readonly source_event_ids: ReadonlyArray<Identifier>;
};

export const PROVIDER_UNAVAILABLE_TEXT =
  'No explanation generated: the explanation provider is not connected in this probe. (未接入解释模型，未生成解释。)';

export function normalizeSelectedText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function buildExplanationRequest(selection: Selection, requestId: Identifier, projectId: Identifier | null, knowledgeProfileVersion: number): ExplanationRequest {
  return Object.freeze({
    user_id: selection.user_id,
    request_id: requestId,
    selection_id: selection.id,
    project_id: projectId,
    knowledge_profile_version: knowledgeProfileVersion,
    mode: 'silent',
  });
}

export function resolveProbeCard(
  request: ExplanationRequest,
  selection: Selection,
  fixtures: ReadonlyArray<FixtureExplanation>,
): ExplanationCard {
  if (request.selection_id !== selection.id || request.user_id !== selection.user_id) {
    throw new Error('explanation request does not belong to this selection');
  }
  const wanted = normalizeSelectedText(selection.selected_text);
  const fixture = fixtures.find(
    (f) => f.source_id === selection.source_id && f.source_version === selection.source_version && normalizeSelectedText(f.selected_text) === wanted,
  );
  const base = {
    user_id: request.user_id,
    request_id: request.request_id,
    selection_id: selection.id,
    knowledge_profile_version: request.knowledge_profile_version,
    audio: false as const,
  };
  if (fixture && wanted.length > 0) {
    return Object.freeze({
      ...base,
      status: 'ready',
      cache_hit: false,
      text: fixture.text,
      source_event_ids: Object.freeze([...fixture.source_event_ids]),
      source_refs: Object.freeze([Object.freeze({ user_id: selection.user_id, source_id: selection.source_id, source_version: selection.source_version })]),
      provenance: 'fixture',
    });
  }
  return Object.freeze({
    ...base,
    status: 'unsupported',
    cache_hit: false,
    text: PROVIDER_UNAVAILABLE_TEXT,
    source_event_ids: Object.freeze([]),
    source_refs: Object.freeze([]),
    provenance: 'none',
  });
}

export type CardView = {
  readonly badge: string;
  readonly body: string;
  /** What was selected, quoted as plain text (never markup). */
  readonly quote: string;
  readonly anchorLine: string;
  readonly audio: false;
};

const QUOTE_LIMIT = 160;

export function quoteOf(selectedText: string): string {
  const t = normalizeSelectedText(selectedText);
  if (t.length === 0) return 'Selected region (no page text)';
  return `Selected: “${t.length > QUOTE_LIMIT ? `${t.slice(0, QUOTE_LIMIT)}…` : t}”`;
}

/** Plain-text view model; rendering uses textContent only. */
export function cardView(card: ExplanationCard, selection: Selection): CardView {
  const badge =
    card.provenance === 'fixture'
      ? 'Fixture card · synthetic test content, not a model explanation'
      : card.provenance === 'model'
        ? 'Model explanation'
        : 'Provider unavailable';
  const position = selection.media_position === null ? 'no media position' : `video ${selection.media_position.toFixed(2)} s`;
  const anchorLine = `Anchored to ${selection.source_id} v${selection.source_version} · frame ${selection.frame_id} · ${position}`;
  return Object.freeze({ badge, body: card.text, quote: quoteOf(selection.selected_text), anchorLine, audio: false });
}
