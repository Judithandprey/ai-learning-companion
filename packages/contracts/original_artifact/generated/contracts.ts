// Generated; byte/authorization checks remain required.
export const CONTRACT_VERSION = "0.2.2" as const;

export type Identifier = string;

export type SourceRef = {
  readonly "user_id": Identifier;
  readonly "source_id": Identifier;
  readonly "source_version": number;
};

export type ArtifactReference = {
  readonly "artifact_id": Identifier;
  readonly "sha256": string;
  readonly "byte_length": number;
  readonly "media_type": "image/png" | "image/jpeg" | "image/svg+xml" | "application/json" | "text/plain";
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
