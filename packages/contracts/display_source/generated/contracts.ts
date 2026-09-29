// Generated; declared provenance is not capture or authorization evidence.
export const CONTRACT_VERSION = "0.2.3" as const;

export type Identifier = string;

export type UtcTimestamp = string;

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
