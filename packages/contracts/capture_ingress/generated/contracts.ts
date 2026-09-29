// Generated structural types; local validation and transaction-current authority remain required.
export const CONTRACT_VERSION = "0.2.4" as const;

export type ProcessVersion = "0.2.0";

export type ArtifactReference = {
  readonly "artifact_id": Identifier;
  readonly "sha256": string;
  readonly "byte_length": number;
  readonly "media_type": "image/png" | "image/jpeg" | "image/svg+xml" | "application/json" | "text/plain";
};

export type ProvisionalScope = {
  readonly "kind": "provisional_session";
};

export type AttemptScope = {
  readonly "kind": "attempt";
  readonly "problem_id": Identifier;
  readonly "attempt_id": Identifier;
  readonly "relation_revision": number;
};

export type ProcessScope = ProvisionalScope | AttemptScope;

export type CaptureClock = {
  readonly "domain_id": Identifier;
  readonly "elapsed_ms": number;
  readonly "uncertainty_ms": number | null;
};

export type UnknownState = {
  readonly "kind": "unknown";
  readonly "reason": "not_observed" | "ambiguous" | "unavailable";
};

export type TextState = {
  readonly "kind": "text";
  readonly "text": string;
};

export type ChoiceState = {
  readonly "kind": "choices";
  readonly "selected_option_ids": ReadonlyArray<Identifier>;
};

export type ArtifactState = {
  readonly "kind": "artifact";
  readonly "artifact_id": Identifier;
};

export type ObservedState = UnknownState | TextState | ChoiceState | ArtifactState;

export type OperationEvidence = {
  readonly "kind": "operation";
  readonly "operation": "select" | "deselect" | "reselect" | "text_edit" | "ink_edit" | "erase" | "undo" | "redo" | "visible_change" | "site_feedback";
  readonly "observed_actor": "user" | "website" | "ai" | "unknown";
  readonly "actor_basis": "trusted_input_event" | "script_observation" | "visual_observation" | "user_report" | "unknown";
  readonly "before": ObservedState;
  readonly "after": ObservedState;
  readonly "reason_quote": string | null;
};

export type SequenceInterval = {
  readonly "first": number;
  readonly "last": number;
};

export type CoverageEvidence = {
  readonly "kind": "coverage";
  readonly "coverage": "observed_samples" | "partial" | "unobserved" | "unknown";
  readonly "from_clock_ms": number | null;
  readonly "through_clock_ms": number | null;
  readonly "missing_sequences": ReadonlyArray<SequenceInterval>;
  readonly "limitations": ReadonlyArray<"sample_only" | "disconnected" | "missing_events" | "blurred" | "occluded" | "unsupported_history" | "unknown">;
};

export type ProcessRecord = {
  readonly "record_id": Identifier;
  readonly "sequence": number;
  readonly "source": SourceRef;
  readonly "scope": ProcessScope;
  readonly "observed_at": UtcTimestamp | null;
  readonly "clock": CaptureClock | null;
  readonly "media_position": number | null;
  readonly "surface": "web_dom" | "web_canvas" | "external_app" | "original_screen_overlay" | "owned_canvas" | "frozen_capture" | "side_by_side";
  readonly "method": "structured" | "visual" | "mixed";
  readonly "causal_parents": ReadonlyArray<Identifier>;
  readonly "artifacts": ReadonlyArray<ArtifactReference>;
  readonly "evidence": OperationEvidence | CoverageEvidence;
  readonly "frame_id": Identifier | null;
};

export type ProcessBatch = {
  readonly "contract_version": ProcessVersion;
  readonly "batch_id": Identifier;
  readonly "device_id": Identifier;
  readonly "session_id": Identifier;
  readonly "stream_id": Identifier;
  readonly "delivery_mode": "live" | "historical";
  readonly "records": ReadonlyArray<ProcessRecord>;
};

export type ArtifactReceipt = {
  readonly "artifact_id": Identifier;
  readonly "sha256": string;
  readonly "byte_length": number;
  readonly "media_type": "image/png" | "image/jpeg" | "image/svg+xml" | "application/json" | "text/plain";
  readonly "status": "pending" | "verified";
};

export type ProcessReceipt = {
  readonly "record_id": Identifier;
  readonly "sequence": number;
  readonly "disposition": "accepted" | "duplicate";
  readonly "received_at": UtcTimestamp;
  readonly "envelope": "committed";
  readonly "artifacts": ReadonlyArray<ArtifactReceipt>;
};

export type ProcessBatchAck = {
  readonly "contract_version": ProcessVersion;
  readonly "batch_id": Identifier;
  readonly "user_id": Identifier;
  readonly "device_id": Identifier;
  readonly "session_id": Identifier;
  readonly "stream_id": Identifier;
  readonly "acknowledged": ReadonlyArray<ProcessReceipt>;
};

export type ProcessError = {
  readonly "contract_version": ProcessVersion;
  readonly "error": "unauthenticated" | "forbidden" | "capability_required" | "not_found" | "record_conflict" | "idempotency_conflict" | "dependency_missing" | "stale_scope" | "capture_stopped" | "unsupported_version" | "invalid_request" | "unavailable";
  readonly "request_id": Identifier;
  readonly "retryable": boolean;
};

export type Identifier = string;

export type UtcTimestamp = string;

export type SourceRef = {
  readonly "user_id": Identifier;
  readonly "source_id": Identifier;
  readonly "source_version": number;
};

export type IdempotencyKey = string;

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

export type OriginalArtifactBinding = {
  readonly "contract_version": "0.2.2";
  readonly "source": SourceRef;
  readonly "artifact": ArtifactReference;
  readonly "kind": "screen_image" | "editable_ink";
};

export type OriginalArtifactUpload = {
  readonly "contract_version": "0.2.2";
  readonly "source": SourceRef;
  readonly "artifact": ArtifactReference;
  readonly "kind": "screen_image" | "editable_ink";
  readonly "data_base64": string;
};

export type OriginalArtifactReceipt = {
  readonly "contract_version": "0.2.2";
  readonly "source": SourceRef;
  readonly "artifact": ArtifactReference;
  readonly "kind": "screen_image" | "editable_ink";
  readonly "status": "bytes_committed";
};

export type DisplaySourceSnapshot = {
  readonly "contract_version": "0.2.3";
  readonly "user_id": Identifier;
  readonly "source_id": Identifier;
  readonly "source_version": number;
  readonly "type": "shared_display";
  readonly "device_id": Identifier;
  readonly "session_id": Identifier;
  readonly "stream_id": Identifier;
  readonly "project_id": Identifier | null;
  readonly "created_at": UtcTimestamp;
  readonly "source_timezone": string;
};

export type SourceVersion = number;

export type DisplaySourceRegistration = {
  readonly "contract_version": "0.2.4";
  readonly "source_id": Identifier;
  readonly "stream_id": Identifier;
  readonly "project_id": Identifier | null;
  readonly "source_timezone": string;
};

export type FrameBatchRequest = {
  readonly "contract_version": "0.2.4";
  readonly "batch": ProcessBatch;
  readonly "frames": ReadonlyArray<Frame>;
};

export type IngressError = {
  readonly "contract_version": "0.2.4";
  readonly "error": "invalid_json" | "unauthenticated" | "forbidden" | "capability_required" | "not_found" | "source_identity_conflict" | "record_conflict" | "idempotency_conflict" | "dependency_missing" | "stale_scope" | "capture_stopped" | "unsupported_source" | "payload_too_large" | "unsupported_media_type" | "unsupported_version" | "invalid_request" | "unavailable";
  readonly "retryable": boolean;
};
