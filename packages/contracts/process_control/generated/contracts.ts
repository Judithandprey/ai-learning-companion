// Generated from process_control/schema.json. Structural types only; runtime checks required.
export const CONTRACT_VERSION = "0.2.1" as const;

export type ControlVersion = "0.2.1";

export type Revision = number;

export type SequenceBoundary = number | null;

export type InitialContinuity = {
  readonly "kind": "initial";
};

export type RestartContinuity = {
  readonly "kind": "restart";
  readonly "previous_stream_id": Identifier;
  readonly "gap": "unknown";
};

export type Continuity = InitialContinuity | RestartContinuity;

export type StreamRegistration = {
  readonly "contract_version": ControlVersion;
  readonly "device_id": Identifier;
  readonly "session_id": Identifier;
  readonly "stream_id": Identifier;
  readonly "continuity": Continuity;
  readonly "authorization_generation": Revision;
  readonly "membership_revision": Revision;
};

export type StopAction = {
  readonly "kind": "stop";
  readonly "pre_stop_sequence": SequenceBoundary;
};

export type SealStopAction = {
  readonly "kind": "seal_stop";
  readonly "pre_stop_sequence": number;
};

export type WithdrawAction = {
  readonly "kind": "withdraw";
};

export type StreamCommand = {
  readonly "contract_version": ControlVersion;
  readonly "device_id": Identifier;
  readonly "session_id": Identifier;
  readonly "stream_id": Identifier;
  readonly "expected_revision": Revision;
  readonly "action": StopAction | SealStopAction | WithdrawAction;
};

export type StreamState = {
  readonly "contract_version": ControlVersion;
  readonly "device_id": Identifier;
  readonly "session_id": Identifier;
  readonly "stream_id": Identifier;
  readonly "user_id": Identifier;
  readonly "authorization_generation": Revision;
  readonly "membership_revision": Revision;
  readonly "revision": Revision;
  readonly "continuity": Continuity;
  readonly "state": "live" | "stopped" | "withdrawn";
  readonly "pre_stop_sequence": SequenceBoundary;
};

export type ControlError = {
  readonly "contract_version": ControlVersion;
  readonly "error": "unauthenticated" | "forbidden" | "capability_required" | "not_found" | "stream_conflict" | "idempotency_conflict" | "stale_revision" | "invalid_transition" | "unsupported_version" | "invalid_request" | "unavailable";
  readonly "retryable": boolean;
};

export type Identifier = string;

export type IdempotencyKey = string;
