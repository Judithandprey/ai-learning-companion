// Generated; runtime binding, authorization and byte checks remain required.
export const CONTRACT_VERSION = "0.2.5" as const;

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

export type CallbackClock = {
  readonly "domain_id": Identifier;
  readonly "elapsed_ms": number;
  readonly "uncertainty_ms": null;
};

export type RawCaptureTiming = {
  readonly "observed_at_estimate": null;
  readonly "estimate_basis": null;
  readonly "uncertainty_ms": null;
  readonly "callback_clock": CallbackClock | null;
  readonly "sample_pts_seconds": number | null;
} | {
  readonly "observed_at_estimate": UtcTimestamp;
  readonly "estimate_basis": "session_wall_plus_callback_monotonic_delta";
  readonly "uncertainty_ms": null;
  readonly "callback_clock": CallbackClock;
  readonly "sample_pts_seconds": number | null;
};

export type RawCaptureOrientation = {
  readonly "system": "CGImagePropertyOrientation";
  readonly "value": null | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  readonly "applied_to_pixels": false;
};

export type RawCaptureFrame = {
  readonly "contract_version": "0.2.5";
  readonly "kind": "raw_capture_frame";
  readonly "frame_id": Identifier;
  readonly "source": SourceRef;
  readonly "device_id": Identifier;
  readonly "session_id": Identifier;
  readonly "stream_id": Identifier;
  readonly "artifact": PngArtifactReference;
  readonly "raw_width": number;
  readonly "raw_height": number;
  readonly "buffer_sequence": number;
  readonly "captured_at": null;
  readonly "media_position": null;
  readonly "timing": RawCaptureTiming;
  readonly "orientation": RawCaptureOrientation;
};
