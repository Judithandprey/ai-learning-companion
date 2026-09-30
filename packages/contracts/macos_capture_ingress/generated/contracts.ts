// Generated unreleased structural types; current authority, exact bytes and atomic commit remain service obligations.
export const CONTRACT_VERSION = "0.2.12" as const;

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

export type PngArtifactReference = {
  readonly "artifact_id": Identifier;
  readonly "sha256": string;
  readonly "byte_length": number;
  readonly "media_type": "image/png";
};

export type NativeWallUtc = string;

export type UInt64Decimal = string;

export type ReportedRect = {
  readonly "x": number;
  readonly "y": number;
  readonly "width": number;
  readonly "height": number;
};

export type MacDisplayAtStart = {
  readonly "display_id": number;
  readonly "name": string | null;
  readonly "frame_points": ReportedRect;
  readonly "point_pixel_scale": number;
  readonly "requested_width_pixels": number;
  readonly "requested_height_pixels": number;
  readonly "rotation_degrees": number;
  readonly "is_main": boolean;
  readonly "scope": "whole display; no window excluded, so this app's windows are captured when visible; cursor shown; BGRA buffers requested in sRGB; no audio" | "whole display; no window excluded, so this app's windows are captured when visible; cursor hidden; BGRA buffers requested in sRGB; no audio" | "synthetic fixture; not a captured display" | "whole display, SCContentFilter(display:excludingApplications: [this app], exceptingWindows: []); every window of this app (main window, ink overlay, palette, menu bar item, menus and alerts) is excluded, as far as ScreenCaptureKit's documented application exclusion applies, including to windows it creates after the filter (unverified on a Mac); all other applications' windows on the display are included; cursor shown; BGRA buffers requested in sRGB; no audio" | "whole display, SCContentFilter(display:excludingApplications: [this app], exceptingWindows: []); every window of this app (main window, ink overlay, palette, menu bar item, menus and alerts) is excluded, as far as ScreenCaptureKit's documented application exclusion applies, including to windows it creates after the filter (unverified on a Mac); all other applications' windows on the display are included; cursor hidden; BGRA buffers requested in sRGB; no audio" | "whole display, SCContentFilter(display:excludingWindows: []) with no window excluded; this app's ink overlay and palette panels request NSWindow.SharingType.none, which Apple calls legacy and says not to rely on to omit content, so whether kept frames contain them is unknown; this app's other windows are not excluded; cursor shown; BGRA buffers requested in sRGB; no audio" | "whole display, SCContentFilter(display:excludingWindows: []) with no window excluded; this app's ink overlay and palette panels request NSWindow.SharingType.none, which Apple calls legacy and says not to rely on to omit content, so whether kept frames contain them is unknown; this app's other windows are not excluded; cursor hidden; BGRA buffers requested in sRGB; no audio";
};

export type MacHostClock = {
  readonly "basis": "mach_absolute_time_seconds";
  readonly "session_started_wall_utc": NativeWallUtc;
  readonly "session_started_seconds": number;
  readonly "callback_seconds": number;
  readonly "display_time_ticks_decimal": UInt64Decimal | null;
  readonly "display_time_seconds": number | null;
  readonly "source_seconds": number | null;
  readonly "source_time_lead_tolerance_seconds": number;
};

export type MacSampleFacts = {
  readonly "status": "complete";
  readonly "presentation_time_seconds": number | null;
  readonly "geometry_basis": "SCStreamFrameInfo_as_reported";
  readonly "geometry_unit": null;
  readonly "content_rect": ReportedRect | null;
  readonly "content_scale": number | null;
  readonly "scale_factor": number | null;
  readonly "dirty_rects": ReadonlyArray<ReportedRect> | null;
};

export type MacPng = {
  readonly "artifact": PngArtifactReference;
  readonly "width": number;
  readonly "height": number;
  readonly "native_file": string;
  readonly "encoding": "png; 8-bit RGBA; sRGB; lossless; native size; not rotated";
};

export type MacInkDocumentReference = {
  readonly "created_in_session": Identifier;
  readonly "file": string;
  readonly "display_id": number;
};

export type MacPairedInk = {
  readonly "pixels_host_seconds": number;
  readonly "pixels_time": "source_time" | "callback_admission";
  readonly "document": MacInkDocumentReference | null;
  readonly "revision": number | null;
  readonly "revision_host_seconds": number | null;
  readonly "strokes": ReadonlyArray<Identifier>;
  readonly "mapping": string;
  readonly "rendering": "sRGB (255, 59, 48); each stroke's own width in points, scaled like the point-to-pixel mapping; round caps and joins; antialiased; strokes in creation order; a one-point stroke as a dot";
  readonly "limits": ReadonlyArray<string>;
};

export type MacComposed = {
  readonly "kind": "composed";
  readonly "image": MacPng;
  readonly "raw_sequence": number;
  readonly "raw_file": string;
  readonly "raw_sha256": string;
  readonly "raw_byte_length": number;
  readonly "ink": MacPairedInk;
  readonly "composed_host_seconds": number;
};

export type MacNotComposed = {
  readonly "kind": "not_composed";
  readonly "callback_sequence": number;
  readonly "host_seconds": number;
  readonly "reason": "refused" | "raw_unavailable" | "render_failed" | "write_failed" | "composed_cap_reached" | "composed_store_stopped" | "session_ended_before_composition";
  readonly "detail": string;
};

export type MacCompositionUnknown = {
  readonly "kind": "unknown";
  readonly "reason": "no_retained_outcome";
};

export type MacRetainedProfile = {
  readonly "kind": "macos_screencapturekit";
  readonly "native_session_id": Identifier;
  readonly "pixel_format": string;
  readonly "display_at_start": MacDisplayAtStart;
  readonly "host_clock": MacHostClock;
  readonly "sample": MacSampleFacts;
};

export type MacRetainedFrame = {
  readonly "contract_version": "0.2.11";
  readonly "kind": "retained_capture_frame";
  readonly "frame_id": Identifier;
  readonly "device_id": Identifier;
  readonly "session_id": Identifier;
  readonly "stream_id": Identifier;
  readonly "source": SourceRef;
  readonly "callback_sequence": number;
  readonly "captured_at": null;
  readonly "media_position": null;
  readonly "pixel_orientation": null;
  readonly "capture_latency_ms": null;
  readonly "raw": MacPng;
  readonly "composition": MacComposed | MacNotComposed | MacCompositionUnknown;
  readonly "profile": MacRetainedProfile;
};

export type MacOSFrameBatchRequest = {
  readonly "contract_version": "0.2.12";
  readonly "batch": ProcessBatch;
  readonly "frames": ReadonlyArray<MacRetainedFrame>;
};

export type MacOSIngressError = {
  readonly "contract_version": "0.2.12";
  readonly "error": "invalid_json" | "unauthenticated" | "forbidden" | "capability_required" | "not_found" | "source_identity_conflict" | "record_conflict" | "idempotency_conflict" | "dependency_missing" | "stale_scope" | "capture_stopped" | "unsupported_source" | "payload_too_large" | "unsupported_media_type" | "unsupported_version" | "invalid_request" | "unavailable";
  readonly "retryable": boolean;
};
