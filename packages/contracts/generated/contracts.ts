// Generated from schema.json. Do not edit. Runtime validation is required.
export const CONTRACT_VERSION = '0.1.0' as const;

export type Identifier = string;

export type UtcTimestamp = string;

export type SourceRef = {
  readonly "user_id": Identifier;
  readonly "source_id": Identifier;
  readonly "source_version": number;
};

export type AccessStatus = "registered" | "fetched" | "parsed" | "indexed" | "ready" | "needs_auth" | "temporarily_unavailable" | "unsupported" | "failed";

export type Provenance = {
  readonly "origin": "synthetic" | "user_authorized" | "public_licensed";
  readonly "consent_scope": "test_only" | "learning";
  readonly "attribution": string;
  readonly "license": string;
};

export type LearningProject = {
  readonly "user_id": Identifier;
  readonly "id": Identifier;
  readonly "kind": "course" | "self_study" | "work_learning";
  readonly "title": string;
  readonly "aliases": ReadonlyArray<string>;
  readonly "goal_ids": ReadonlyArray<Identifier>;
  readonly "source_ids": ReadonlyArray<Identifier>;
  readonly "unit_ids": ReadonlyArray<Identifier>;
  readonly "status": "active" | "paused" | "archived";
  readonly "curriculum_version": number;
};

export type SourceSnapshot = {
  readonly "user_id": Identifier;
  readonly "source_id": Identifier;
  readonly "source_version": number;
  readonly "project_id": Identifier | null;
  readonly "type": "web" | "transcript" | "image" | "document" | "synthetic";
  readonly "original_url": string;
  readonly "canonical_url": string;
  readonly "connection_id": Identifier | null;
  readonly "access_status": AccessStatus;
  readonly "content_hash": string;
  readonly "fetched_at": UtcTimestamp;
  readonly "source_timezone": string;
  readonly "locator_schema": "source-frame-v1";
  readonly "text": string;
  readonly "provenance": Provenance;
};

export type Frame = {
  readonly "user_id": Identifier;
  readonly "source_id": Identifier;
  readonly "source_version": number;
  readonly "frame_id": Identifier;
  readonly "session_id": Identifier;
  readonly "device_id": Identifier;
  readonly "captured_at": UtcTimestamp;
  readonly "source_timezone": string;
  readonly "media_position": number | null;
  readonly "width": number;
  readonly "height": number;
  readonly "artifact_id": Identifier;
  readonly "content_hash": string;
  readonly "representation": "screen_capture" | "dom_snapshot" | "synthetic_fixture";
};

export type Observation = {
  readonly "user_id": Identifier;
  readonly "source_id": Identifier;
  readonly "source_version": number;
  readonly "event_id": Identifier;
  readonly "device_id": Identifier;
  readonly "device_sequence": number;
  readonly "session_id": Identifier;
  readonly "captured_at": UtcTimestamp;
  readonly "received_at": UtcTimestamp | null;
  readonly "source_timezone": string;
  readonly "actor": "user" | "teacher" | "assistant" | "unknown";
  readonly "text": string;
  readonly "frame_id": Identifier | null;
  readonly "media_position": number | null;
  readonly "confidence": number;
  readonly "gap_flags": ReadonlyArray<"missing_audio" | "missing_frame" | "uncertain_transcript" | "stale_frame">;
  readonly "correction_of": Identifier | null;
};

export type Point = {
  readonly "x": number;
  readonly "y": number;
};

export type BoundingBox = {
  readonly "x": number;
  readonly "y": number;
  readonly "width": number;
  readonly "height": number;
};

export type Selection = {
  readonly "user_id": Identifier;
  readonly "source_id": Identifier;
  readonly "source_version": number;
  readonly "id": Identifier;
  readonly "session_id": Identifier;
  readonly "device_id": Identifier;
  readonly "frame_id": Identifier;
  readonly "media_position": number | null;
  readonly "bbox": BoundingBox;
  readonly "polygon"?: ReadonlyArray<Point>;
  readonly "selected_text": string;
  readonly "concept_candidates": ReadonlyArray<Identifier>;
  readonly "input_mode": "pencil_ask" | "explicit_touch_ask" | "explicit_text_ask";
  readonly "created_at": UtcTimestamp;
};

export type NoteBlock = {
  readonly "id": Identifier;
  readonly "layer": "user_original" | "ai_supplement";
  readonly "format": "text" | "markdown" | "image";
  readonly "content": string;
};

export type ContextSegment = {
  readonly "source_id": Identifier;
  readonly "source_version": number;
  readonly "frame_id": Identifier;
  readonly "media_position": number | null;
  readonly "source_event_ids": ReadonlyArray<Identifier>;
};

export type NoteRevision = {
  readonly "user_id": Identifier;
  readonly "note_id": Identifier;
  readonly "kind": "ai" | "handwritten";
  readonly "project_id": Identifier | null;
  readonly "concept_ids": ReadonlyArray<Identifier>;
  readonly "title": string;
  readonly "blocks": ReadonlyArray<NoteBlock>;
  readonly "ink_blob_id": Identifier | null;
  readonly "context_segments": ReadonlyArray<ContextSegment>;
  readonly "source_event_ids": ReadonlyArray<Identifier>;
  readonly "revision": number;
  readonly "base_revision": number;
  readonly "authorship": "user" | "assistant";
  readonly "created_at": UtcTimestamp;
};

export type EventBatch = {
  readonly "contract_version": "0.1.0";
  readonly "events": ReadonlyArray<Observation>;
};

export type EventAck = {
  readonly "event_id": Identifier;
  readonly "device_id": Identifier;
  readonly "device_sequence": number;
  readonly "status": "accepted" | "duplicate";
};

export type EventBatchAck = {
  readonly "contract_version": "0.1.0";
  readonly "acknowledged": ReadonlyArray<EventAck>;
};

export type AuthorizationContext = {
  readonly "user_id": Identifier;
  readonly "session_id": Identifier;
  readonly "device_id": Identifier;
  readonly "scopes": ReadonlyArray<"sources:read" | "events:write" | "notes:read" | "notes:write" | "explanations:create" | "sources:write" | "jobs:cancel" | "usage:read">;
  readonly "expires_at": UtcTimestamp;
  readonly "authorized_origin": string;
};

export type BudgetReservation = {
  readonly "user_id": Identifier;
  readonly "reservation_id": Identifier;
  readonly "request_id": Identifier;
  readonly "backend": string;
  readonly "budget_month": string;
  readonly "budget_timezone": string;
  readonly "price_version": string;
  readonly "fx_version": string;
  readonly "currency": "CNY";
  readonly "estimated_max_fen": number;
  readonly "actual_fen": number | null;
  readonly "state": "reserved" | "settled" | "released";
  readonly "created_at": UtcTimestamp;
};

export type ExplanationRequest = {
  readonly "user_id": Identifier;
  readonly "request_id": Identifier;
  readonly "selection_id": Identifier;
  readonly "project_id": Identifier | null;
  readonly "knowledge_profile_version": number;
  readonly "mode": "silent";
};

export type ExplanationCard = {
  readonly "user_id": Identifier;
  readonly "request_id": Identifier;
  readonly "selection_id": Identifier;
  readonly "status": "ready" | "generating" | "needs_auth" | "unsupported" | "failed";
  readonly "cache_hit": boolean;
  readonly "text": string;
  readonly "source_event_ids": ReadonlyArray<Identifier>;
  readonly "source_refs": ReadonlyArray<SourceRef>;
  readonly "knowledge_profile_version": number;
  readonly "provenance": "fixture" | "model" | "none";
  readonly "audio": false;
};

export type BridgeRequest = {
  readonly "contract_version": "0.1.0";
  readonly "request_id": Identifier;
  readonly "action": "selection.submit";
  readonly "selection": Selection;
};

export type BridgeResponse = {
  readonly "contract_version": "0.1.0";
  readonly "request_id": Identifier;
  readonly "status": "accepted" | "needs_auth" | "unsupported" | "rejected";
  readonly "error_code": "invalid_payload" | "origin_not_authorized" | "identity_mismatch" | "stale_source" | "bridge_unavailable" | null;
};

export type CapabilityResult = {
  readonly "gate": "G1" | "G2" | "G3" | "G4" | "G5" | "G6";
  readonly "capability": string;
  readonly "status": "not_tested" | "documented" | "implemented" | "compiled" | "automated_pass" | "device_pass" | "failed" | "needs_auth" | "unsupported";
  readonly "environment": string;
  readonly "evidence": ReadonlyArray<string>;
  readonly "limitation": string;
  readonly "fallback": string;
  readonly "checks": {
  readonly "documentation": "not_tested" | "pass" | "fail" | "not_applicable";
  readonly "implementation": "not_tested" | "pass" | "fail" | "not_applicable";
  readonly "compilation": "not_tested" | "pass" | "fail" | "not_applicable";
  readonly "automated": "not_tested" | "pass" | "fail" | "not_applicable";
  readonly "provider": "not_tested" | "pass" | "fail" | "not_applicable";
  readonly "device": "not_tested" | "pass" | "fail" | "not_applicable";
};
};

export type BackgroundJob = {
  readonly "user_id": Identifier;
  readonly "id": Identifier;
  readonly "kind": "source_sync" | "prepare_explanation" | "rebuild_index" | "export_note";
  readonly "source_versions": ReadonlyArray<SourceRef>;
  readonly "idempotency_key": Identifier;
  readonly "state": "queued" | "running" | "completed" | "waiting_for_auth" | "retry_scheduled" | "failed" | "cancelling" | "cancelled";
  readonly "checkpoint": string | null;
  readonly "budget_reservation": string | null;
  readonly "attempts": number;
  readonly "cancel_requested": boolean;
  readonly "outputs": ReadonlyArray<Identifier>;
};

export type HttpUrl = string;

export type IdempotencyKey = string;

export type SourceRegistrationRequest = {
  readonly "original_url": HttpUrl;
  readonly "project_id": Identifier | null;
  readonly "connection_id"?: Identifier | null;
  readonly "type"?: "web" | "transcript" | "image" | "document";
};

export type SourceRecord = {
  readonly "user_id": Identifier;
  readonly "source_id": Identifier;
  readonly "project_id": Identifier | null;
  readonly "connection_id": Identifier | null;
  readonly "type": "web" | "transcript" | "image" | "document" | "synthetic";
  readonly "original_url": HttpUrl;
  readonly "canonical_url": HttpUrl;
  readonly "access_status": AccessStatus;
  readonly "current_version": number | null;
  readonly "created_at": UtcTimestamp;
  readonly "updated_at": UtcTimestamp;
};

export type SourceRegistrationResult = {
  readonly "source": SourceRecord;
  readonly "already_exists": boolean;
  readonly "job_id": Identifier | null;
};

export type SourceReadResult = {
  readonly "source": SourceRecord;
  readonly "snapshot_versions": ReadonlyArray<number>;
};

export type NoteWriteResult = {
  readonly "note": NoteRevision;
  readonly "persistence": "server_committed";
  readonly "replayed": boolean;
};

export type ApiError = {
  readonly "request_id": Identifier;
  readonly "code": "invalid_request" | "unauthorized" | "forbidden" | "not_found" | "conflict" | "source_unavailable" | "budget_exceeded" | "needs_auth" | "unsupported" | "internal_error";
  readonly "message": string;
};

export type SubscriptionUsage = {
  readonly "backend": Identifier;
  readonly "authentication_status": "connected" | "needs_auth" | "unsupported" | "unknown";
  readonly "quota_status": "known" | "unknown" | "exhausted";
  readonly "remaining_units": number | null;
};

export type UsageResult = {
  readonly "user_id": Identifier;
  readonly "budget_month": string;
  readonly "budget_timezone": "America/Los_Angeles";
  readonly "currency": "CNY";
  readonly "monthly_limit_fen": number;
  readonly "actual_fen": number;
  readonly "reserved_fen": number;
  readonly "remaining_fen": number;
  readonly "pricing_status": "known" | "unknown";
  readonly "subscriptions": ReadonlyArray<SubscriptionUsage>;
  readonly "as_of": UtcTimestamp;
  readonly "paid_executor_enabled": false;
};

export type JobCancelResult = {
  readonly "job_id": Identifier;
  readonly "state": "cancelling" | "cancelled" | "completed" | "failed";
  readonly "cancel_requested": boolean;
};
