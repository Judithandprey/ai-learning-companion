// Generated; runtime binding, authorization and byte checks remain required.
export const CONTRACT_VERSION = "0.2.9" as const;

export type Identifier = string;

export type UtcTimestamp = string;

export type SourceRef = {
  readonly "user_id": Identifier;
  readonly "source_id": Identifier;
  readonly "source_version": number;
};

export type PngArtifactReference = {
  readonly "artifact_id": Identifier;
  readonly "sha256": string;
  readonly "byte_length": number;
  readonly "media_type": "image/png";
};

export type Sha256 = string;

export type LocalWallUtc = string;

export type DisplayAtStart = {
  readonly "kind": "display";
  readonly "source_id": string;
  readonly "display_id": string;
  readonly "label": string;
  readonly "bounds": {
  readonly "x": number;
  readonly "y": number;
  readonly "width": number;
  readonly "height": number;
};
  readonly "scale_factor": number;
};

export type WindowsSample = {
  readonly "sample_seq": number;
  readonly "frame_seq": number;
  readonly "reason": "first" | "ink" | "changed" | "heartbeat" | "deferred";
  readonly "deferred_samples_not_retained": ReadonlyArray<number>;
  readonly "sampled_at": LocalWallUtc;
  readonly "taken_at": LocalWallUtc;
  readonly "monotonic_ms": number;
  readonly "state": "fresh" | "no_new_frame" | "gap";
  readonly "gap_ms": number | null;
  readonly "presented_frames": number;
  readonly "stream_presented_frames": number;
  readonly "presentation_ms": number | null;
  readonly "frame_age_ms": number | null;
  readonly "change_from_previous_sample": number | null;
};

export type WindowsElectron = {
  readonly "kind": "windows_electron";
  readonly "retention_format": "lc-desktop-capture-retention/v1";
  readonly "capture_session": string;
  readonly "started_at": LocalWallUtc;
  readonly "source_at_start": DisplayAtStart;
  readonly "sample": WindowsSample;
};

export type WindowsPng = {
  readonly "artifact": PngArtifactReference;
  readonly "width": number;
  readonly "height": number;
  readonly "pixels_sha256": Sha256;
  readonly "native_file": string;
};

export type WindowsComposition = {
  readonly "image": WindowsPng;
  readonly "ink_session": string;
  readonly "ink_revision": number;
  readonly "visible_strokes": number;
  readonly "ink_marks": {
  readonly "verified": number;
  readonly "changed": number;
  readonly "unknown": number;
  readonly "following_content": number;
};
  readonly "transformation": string;
};

export type WindowsFrame = {
  readonly "contract_version": "0.2.9";
  readonly "kind": "retained_capture_frame";
  readonly "frame_id": Identifier;
  readonly "device_id": Identifier;
  readonly "session_id": Identifier;
  readonly "stream_id": Identifier;
  readonly "source": SourceRef;
  readonly "captured_at": null;
  readonly "media_position": null;
  readonly "capture_latency_ms": null;
  readonly "raw": WindowsPng;
  readonly "composed": WindowsComposition | null;
  readonly "profile": WindowsElectron;
};
