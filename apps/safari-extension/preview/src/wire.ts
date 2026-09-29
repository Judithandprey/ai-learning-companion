// document-preview.0.1.0 wire types, mirrored from the released generated file
// packages/contracts/document_preview/generated/contracts.ts at main
// 8a35663cf607726cad4adb78d906026d600322c8 (lead-owned; Web does not change it).
// The shared v0.1.0 record types are imported, not copied. This local mirror exists
// only because team/web cannot yet merge main; on integration it can be replaced by
// an import of the generated file. Runtime checks in api-store.ts are still required.

import type { BridgeRequest, ExplanationRequest, Frame, Identifier, NoteRevision, Observation, SourceSnapshot } from '../../src/contracts.ts';

export const PREVIEW_CONTRACT_VERSION = 'document-preview.0.1.0' as const;

export type SessionInfo = {
  readonly contract_version: typeof PREVIEW_CONTRACT_VERSION;
  readonly user_id: Identifier;
  readonly device_id: Identifier;
  readonly session_id: Identifier;
  readonly authorization_generation: number;
  readonly membership_revision: number;
  readonly project_id: null;
};

export type DocumentImport = {
  readonly contract_version: typeof PREVIEW_CONTRACT_VERSION;
  readonly source_id: Identifier;
  readonly source_version: number;
  readonly filename: string;
  readonly content_base64: string;
  readonly sha256: string;
  readonly device_id: Identifier;
  readonly session_id: Identifier;
  readonly source_timezone: string;
  readonly project_id: Identifier | null;
};

export type ImportReceipt = {
  readonly contract_version: typeof PREVIEW_CONTRACT_VERSION;
  readonly source: SourceSnapshot;
  readonly filename: string;
  readonly persistence: 'server_committed';
  readonly replayed: boolean;
};

export type DocumentSave = {
  readonly contract_version: typeof PREVIEW_CONTRACT_VERSION;
  readonly note_id: Identifier;
  readonly frame: Frame;
  readonly frame_bytes_base64: string;
  readonly bridge_request: BridgeRequest;
  readonly request: ExplanationRequest;
  readonly title: string;
  readonly request_text: string;
  readonly user_note: string;
};

export type SaveReceipt = {
  readonly contract_version: typeof PREVIEW_CONTRACT_VERSION;
  readonly note_id: Identifier;
  readonly revision: 1;
  readonly persistence: 'server_committed';
  readonly replayed: boolean;
  readonly ai_status: 'provider_unavailable';
};

export type SavedPreview = {
  readonly contract_version: typeof PREVIEW_CONTRACT_VERSION;
  readonly source: SourceSnapshot;
  readonly filename: string;
  readonly content_base64: string;
  readonly frame: Frame;
  readonly frame_bytes_base64: string;
  readonly bridge_request: BridgeRequest;
  readonly request: ExplanationRequest;
  readonly observation: Observation;
  readonly note: NoteRevision;
  readonly request_text: string;
  readonly user_note: string;
  readonly persistence: 'server_committed';
  readonly ai_status: 'provider_unavailable';
};

export type PreviewErrorCode = 'unauthorized' | 'forbidden' | 'not_found' | 'conflict' | 'invalid_request' | 'unavailable';

/** Engineering limits stated by the contract README (not product capacity). */
export const LIMITS = Object.freeze({ sourceBytes: 2 * 1024 * 1024, domBytes: 1024 * 1024, titleMin: 1, titleMax: 300, filenameMax: 255, textMax: 65536 });
