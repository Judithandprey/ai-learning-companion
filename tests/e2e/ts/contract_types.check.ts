// P0-06A: compile-time checks of generated/contracts.ts against schema intent.
// Each @ts-expect-error must be a real error; an unused directive fails tsc.
// Structural typing only; numeric ranges, formats and cross-field rules still
// need runtime validation (the generated file says so).
import type {
  ApiError,
  BridgeRequest,
  ExplanationCard,
  ExplanationRequest,
  JobCancelResult,
  NoteRevision,
  NoteWriteResult,
  Selection,
  SourceRegistrationRequest,
  UsageResult,
} from "../../../packages/contracts/generated/contracts.js";

const selection: Selection = {
  user_id: "fixture-user",
  source_id: "linear-algebra",
  source_version: 1,
  id: "selection-1",
  session_id: "session-1",
  device_id: "device-ipad",
  frame_id: "frame-1",
  media_position: 12.5,
  bbox: { x: 0.1, y: 0.2, width: 0.3, height: 0.2 },
  selected_text: "change of basis",
  concept_candidates: ["change-of-basis"],
  input_mode: "explicit_text_ask",
  created_at: "2026-09-28T00:00:00Z",
};

export const bridge: BridgeRequest = { contract_version: "0.1.0", request_id: "request-1", action: "selection.submit", selection };
// @ts-expect-error Bridge v0.1 has no arbitrary command action.
export const bridgeExec: BridgeRequest = { contract_version: "0.1.0", request_id: "r", action: "execute_code", selection };
// @ts-expect-error Bridge messages cannot carry a credential field.
export const bridgeToken: BridgeRequest = { contract_version: "0.1.0", request_id: "r", action: "selection.submit", selection, token: "x" };
// @ts-expect-error Frozen selection must name its frame; null is not an invented placeholder.
export const noFrame: Selection = { ...selection, frame_id: null };
// @ts-expect-error NAV/WRITE never request explanations.
export const navSelection: Selection = { ...selection, input_mode: "navigation" };

export const request: ExplanationRequest = { user_id: "u", request_id: "r", selection_id: "s", project_id: null, knowledge_profile_version: 1, mode: "silent" };
// @ts-expect-error Explanation requests are silent.
export const voiceRequest: ExplanationRequest = { ...request, mode: "voice" };

const card: ExplanationCard = {
  user_id: "u", request_id: "r", selection_id: "s", status: "ready", cache_hit: false, text: "t",
  source_event_ids: [], source_refs: [], knowledge_profile_version: 1, provenance: "fixture", audio: false,
};
// @ts-expect-error Cards never autoplay audio.
export const audioCard: ExplanationCard = { ...card, audio: true };

const note: NoteRevision = {
  user_id: "fixture-user", note_id: "note-1", kind: "handwritten", project_id: null, concept_ids: [], title: "",
  blocks: [{ id: "b1", layer: "user_original", format: "image", content: "ink-preview" }], ink_blob_id: "ink-1",
  context_segments: [{ source_id: "s", source_version: 1, frame_id: "f", media_position: null, source_event_ids: ["e1"] }],
  source_event_ids: ["e1"], revision: 1, base_revision: 0, authorship: "user", created_at: "2026-09-28T00:00:00Z",
};
export const written: NoteWriteResult = { note, persistence: "server_committed", replayed: false };
// @ts-expect-error Only an actual server commit may be reported.
export const queued: NoteWriteResult = { note, persistence: "queued", replayed: false };
// @ts-expect-error Block layers are only user_original / ai_supplement.
export const rewritten: NoteRevision = { ...note, blocks: [{ id: "b1", layer: "ai_rewrite", format: "text", content: "x" }] };
// @ts-expect-error Generated objects are readonly.
note.revision = 2;

const usage: UsageResult = {
  user_id: "u", budget_month: "2026-09", budget_timezone: "America/Los_Angeles", currency: "CNY", monthly_limit_fen: 100000,
  actual_fen: 0, reserved_fen: 0, remaining_fen: 100000, pricing_status: "unknown", subscriptions: [
    { backend: "fixture", authentication_status: "unknown", quota_status: "unknown", remaining_units: null },
  ], as_of: "2026-09-28T00:00:00Z", paid_executor_enabled: false,
};
// @ts-expect-error P0 interface keeps paid execution disabled.
export const paid: UsageResult = { ...usage, paid_executor_enabled: true };
// @ts-expect-error The service fixes the budget timezone.
export const utcUsage: UsageResult = { ...usage, budget_timezone: "UTC" };
// @ts-expect-error Money is CNY fen only.
export const usd: UsageResult = { ...usage, currency: "USD" };

export const cancel: JobCancelResult = { job_id: "j", state: "cancelling", cancel_requested: true };
// @ts-expect-error There is no "stopped" claim distinct from the actual states.
export const stopped: JobCancelResult = { ...cancel, state: "stopped" };

export const registration: SourceRegistrationRequest = { original_url: "https://example.invalid/a", project_id: null };
// @ts-expect-error Server derives identity from authentication; body cannot claim a user.
export const claimed: SourceRegistrationRequest = { ...registration, user_id: "someone-else" };
// @ts-expect-error project_id is required (nullable), unlike type/connection_id.
export const noProject: SourceRegistrationRequest = { original_url: "https://example.invalid/a" };
// @ts-expect-error Clients cannot register synthetic data as a real source.
export const synthetic: SourceRegistrationRequest = { ...registration, type: "synthetic" };

export const error: ApiError = { request_id: "r", code: "conflict", message: "m" };
// @ts-expect-error Error codes are a closed set.
export const stack: ApiError = { ...error, code: "stack_trace" };
