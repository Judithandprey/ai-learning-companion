// Generated structural types; runtime validation and trusted authorization are required.
export const CONTRACT_VERSION = "document-preview.0.1.0" as const;

export type SessionInfo = {
  readonly "contract_version": "document-preview.0.1.0";
  readonly "user_id": Identifier;
  readonly "device_id": Identifier;
  readonly "session_id": Identifier;
  readonly "authorization_generation": number;
  readonly "membership_revision": number;
  readonly "project_id": null;
};

export type DocumentImport = {
  readonly "contract_version": "document-preview.0.1.0";
  readonly "source_id": Identifier;
  readonly "source_version": number;
  readonly "filename": string;
  readonly "content_base64": string;
  readonly "sha256": string;
  readonly "device_id": Identifier;
  readonly "session_id": Identifier;
  readonly "source_timezone": string;
  readonly "project_id": Identifier | null;
};

export type ImportReceipt = {
  readonly "contract_version": "document-preview.0.1.0";
  readonly "source": SourceSnapshot;
  readonly "filename": string;
  readonly "persistence": "server_committed";
  readonly "replayed": boolean;
};

export type DocumentSave = {
  readonly "contract_version": "document-preview.0.1.0";
  readonly "note_id": Identifier;
  readonly "frame": Frame;
  readonly "frame_bytes_base64": string;
  readonly "bridge_request": BridgeRequest;
  readonly "request": ExplanationRequest;
  readonly "title": string;
  readonly "request_text": string;
  readonly "user_note": string;
};

export type SaveReceipt = {
  readonly "contract_version": "document-preview.0.1.0";
  readonly "note_id": Identifier;
  readonly "revision": 1;
  readonly "persistence": "server_committed";
  readonly "replayed": boolean;
  readonly "ai_status": "provider_unavailable";
};

export type SavedPreview = {
  readonly "contract_version": "document-preview.0.1.0";
  readonly "source": SourceSnapshot;
  readonly "filename": string;
  readonly "content_base64": string;
  readonly "frame": Frame;
  readonly "frame_bytes_base64": string;
  readonly "bridge_request": BridgeRequest;
  readonly "request": ExplanationRequest;
  readonly "observation": Observation;
  readonly "note": NoteRevision;
  readonly "request_text": string;
  readonly "user_note": string;
  readonly "persistence": "server_committed";
  readonly "ai_status": "provider_unavailable";
};

export type PreviewError = {
  readonly "contract_version": "document-preview.0.1.0";
  readonly "code": "unauthorized" | "forbidden" | "not_found" | "conflict" | "invalid_request" | "unavailable";
};

export type DomSnapshot = {
  readonly "kind": "dom_snapshot/v1";
  readonly "captured_at": UtcTimestamp;
  readonly "page": {
  readonly "origin": string;
  readonly "path": string;
  readonly "query_omitted": boolean;
};
  readonly "document_version": string | null;
  readonly "viewport": {
  readonly "width": number;
  readonly "height": number;
  readonly "device_pixel_ratio": number;
};
  readonly "scroll": {
  readonly "x": number;
  readonly "y": number;
};
  readonly "selection": {
  readonly "text": string;
  readonly "rect": {
  readonly "x": number;
  readonly "y": number;
  readonly "width": number;
  readonly "height": number;
};
};
  readonly "context_text": string;
  readonly "media": null;
  readonly "pixels": "not_captured";
};

export type LibraryCursor = string;

export type SavedLibraryQuery = {
  readonly "limit"?: number;
  readonly "cursor"?: LibraryCursor;
};

export type SavedLibraryItem = {
  readonly "note_id": Identifier;
  readonly "title": string;
  readonly "filename": string;
  readonly "source_id": Identifier;
  readonly "source_version": number;
  readonly "created_at": UtcTimestamp;
};

export type SavedLibrary = {
  readonly "contract_version": "document-preview.0.1.0";
  readonly "items": ReadonlyArray<SavedLibraryItem>;
  readonly "next_cursor": LibraryCursor | null;
};

export type Identifier = string;

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

export type Provenance = {
  readonly "origin": "synthetic" | "user_authorized" | "public_licensed";
  readonly "consent_scope": "test_only" | "learning";
  readonly "attribution": string;
  readonly "license": string;
};

export type UtcTimestamp = string;

export type AccessStatus = "registered" | "fetched" | "parsed" | "indexed" | "ready" | "needs_auth" | "temporarily_unavailable" | "unsupported" | "failed";

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

export type BridgeRequest = {
  readonly "contract_version": "0.1.0";
  readonly "request_id": Identifier;
  readonly "action": "selection.submit";
  readonly "selection": Selection;
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

export type ExplanationRequest = {
  readonly "user_id": Identifier;
  readonly "request_id": Identifier;
  readonly "selection_id": Identifier;
  readonly "project_id": Identifier | null;
  readonly "knowledge_profile_version": number;
  readonly "mode": "silent";
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

export type ContextSegment = {
  readonly "source_id": Identifier;
  readonly "source_version": number;
  readonly "frame_id": Identifier;
  readonly "media_position": number | null;
  readonly "source_event_ids": ReadonlyArray<Identifier>;
};

export type NoteBlock = {
  readonly "id": Identifier;
  readonly "layer": "user_original" | "ai_supplement";
  readonly "format": "text" | "markdown" | "image";
  readonly "content": string;
};
