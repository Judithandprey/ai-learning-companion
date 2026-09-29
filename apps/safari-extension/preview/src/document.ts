// P0-07 early desktop fallback: a user-selected local UTF-8 document shown on an
// owned page. This is not the original course page and not the iPad path. The
// complete original is kept exactly, separately from the truncated DOM context of
// any selection. DOM-free so it can be unit tested.

/** Largest document this preview opens; larger files are refused, never truncated (engineering default). */
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

export type LocalDocument = {
  /** File name as the user's system reported it (display only; may be any text). */
  readonly name: string;
  /** Exact decoded text. A leading byte-order mark is kept, so re-encoding gives the original bytes. */
  readonly text: string;
  readonly byte_length: number;
  /** SHA-256 of the original bytes, lower-case hex. */
  readonly sha256: string;
  readonly last_modified: number | null;
};

export type OpenResult = { readonly ok: true; readonly document: LocalDocument } | { readonly ok: false; readonly reason: string };

export async function sha256OfBytes(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Decodes the bytes of a local file as strict UTF-8. Invalid UTF-8 is refused rather
 * than repaired or guessed, and nothing is truncated.
 */
export async function readUtf8Document(bytes: Uint8Array<ArrayBuffer>, name: string, lastModified: number | null): Promise<OpenResult> {
  if (bytes.byteLength > MAX_DOCUMENT_BYTES) {
    return { ok: false, reason: `This file is ${bytes.byteLength} bytes; this preview opens up to ${MAX_DOCUMENT_BYTES} bytes. Nothing was opened or truncated.` };
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return { ok: false, reason: 'This file is not valid UTF-8 text. Nothing was opened; no encoding was guessed.' };
  }
  // Valid UTF-8 re-encodes to exactly the same bytes; check it rather than assume it.
  const again = new TextEncoder().encode(text);
  if (again.byteLength !== bytes.byteLength || again.some((b, i) => b !== bytes[i])) {
    return { ok: false, reason: 'The decoded text does not reproduce the file bytes exactly. Nothing was opened.' };
  }
  return { ok: true, document: Object.freeze({ name, text, byte_length: bytes.byteLength, sha256: await sha256OfBytes(bytes), last_modified: lastModified }) };
}

export type Block = { readonly kind: 'paragraph' | 'gap'; readonly text: string };

const GAP = /((?:\r\n|\n|\r)(?:[ \t\f\v]*(?:\r\n|\n|\r))+)/;

/**
 * Splits text into paragraphs and the blank-line gaps between them, so a selection's
 * DOM context is its own paragraph. Joining every block's text gives the original exactly.
 */
export function splitBlocks(text: string): Block[] {
  return text
    .split(GAP)
    .map((part, i): Block => ({ kind: i % 2 === 1 ? 'gap' : 'paragraph', text: part }))
    .filter((b) => b.text.length > 0);
}
