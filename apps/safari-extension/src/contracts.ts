// Type-only view of the lead-owned shared contract (packages/contracts, v0.1.0).
// Only types are imported so the browser build does not copy shared files.
import type { CONTRACT_VERSION as SharedContractVersion } from '../../../packages/contracts/generated/contracts.ts';

export type {
  BoundingBox,
  BridgeRequest,
  BridgeResponse,
  CapabilityResult,
  ExplanationCard,
  ExplanationRequest,
  Frame,
  Identifier,
  NoteRevision,
  Observation,
  Point,
  Selection,
  SourceRef,
  SourceSnapshot,
  UtcTimestamp,
} from '../../../packages/contracts/generated/contracts.ts';

export const CONTRACT_VERSION: typeof SharedContractVersion = '0.1.0';
