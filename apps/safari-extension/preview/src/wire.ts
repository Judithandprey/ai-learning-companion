// Use the released generated preview contract directly. Runtime response validation
// remains in api-store.ts; structural TypeScript types do not validate received data.
export { CONTRACT_VERSION as PREVIEW_CONTRACT_VERSION } from '../../../../packages/contracts/document_preview/generated/contracts.ts';
export type { SessionInfo, DocumentImport, ImportReceipt, DocumentSave, SaveReceipt, SavedPreview } from '../../../../packages/contracts/document_preview/generated/contracts.ts';
import type { PreviewError } from '../../../../packages/contracts/document_preview/generated/contracts.ts';

export type PreviewErrorCode = PreviewError['code'];

/** Engineering limits stated by the contract README (not product capacity). */
export const LIMITS = Object.freeze({ sourceBytes: 2 * 1024 * 1024, domBytes: 1024 * 1024, titleMin: 1, titleMax: 300, filenameMax: 255, textMax: 65536 });
