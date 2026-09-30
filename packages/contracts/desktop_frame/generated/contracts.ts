// Generated; runtime binding, authorization and byte checks remain required.
export const CONTRACT_VERSION = "0.2.7" as const;

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

export type NativeWallUtc = string;

export type CallbackEstimateUtc = string;

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
  readonly "scope": "whole display; no window excluded, so this app's windows are captured when visible; cursor shown; BGRA buffers requested in sRGB; no audio" | "whole display; no window excluded, so this app's windows are captured when visible; cursor hidden; BGRA buffers requested in sRGB; no audio" | "synthetic fixture; not a captured display";
};

export type MacHostClock = {
  readonly "basis": "mach_absolute_time_seconds";
  readonly "session_started_wall_utc": NativeWallUtc;
  readonly "session_started_seconds": number;
  readonly "callback_seconds": number;
  readonly "display_time_ticks_decimal": UInt64Decimal | null;
  readonly "display_time_seconds": number | null;
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

export type MacScreenCaptureKit = {
  readonly "kind": "macos_screencapturekit";
  readonly "native_session_id": Identifier;
  readonly "pixel_format": string;
  readonly "encoding": "png; 8-bit RGBA; sRGB; lossless; native size; not rotated";
  readonly "display_at_start": MacDisplayAtStart;
  readonly "host_clock": MacHostClock;
  readonly "sample": MacSampleFacts;
};

export type DesktopTiming = {
  readonly "observed_at_estimate": null;
  readonly "estimate_basis": null;
  readonly "uncertainty_ms": null;
  readonly "callback_clock": null;
} | {
  readonly "observed_at_estimate": CallbackEstimateUtc;
  readonly "estimate_basis": "session_wall_plus_callback_monotonic_delta";
  readonly "uncertainty_ms": null;
  readonly "callback_clock": null;
};

export type DesktopFrame = {
  readonly "contract_version": "0.2.7";
  readonly "kind": "raw_capture_frame";
  readonly "frame_id": Identifier;
  readonly "device_id": Identifier;
  readonly "session_id": Identifier;
  readonly "stream_id": Identifier;
  readonly "source": SourceRef;
  readonly "artifact": PngArtifactReference;
  readonly "raw_width": number;
  readonly "raw_height": number;
  readonly "callback_sequence": number;
  readonly "captured_at": null;
  readonly "media_position": null;
  readonly "pixel_orientation": null;
  readonly "pixels_transformed": false;
  readonly "timing": DesktopTiming;
  readonly "profile": MacScreenCaptureKit;
};
