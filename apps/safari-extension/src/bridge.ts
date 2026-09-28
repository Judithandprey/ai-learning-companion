// Web end of bridge v0.1 (`selection.submit` only). The request carries a
// Selection and nothing else: no cookies, storage, tokens, form values or page
// URL. The page origin is established by native code from its trusted extension
// context, not by this payload. An ACK means acceptance, not persistence.

import type { BridgeRequest, BridgeResponse, Identifier, Selection } from './contracts.ts';
import { CONTRACT_VERSION } from './contracts.ts';

const SELECTION_KEYS = [
  'user_id',
  'source_id',
  'source_version',
  'id',
  'session_id',
  'device_id',
  'frame_id',
  'media_position',
  'bbox',
  'polygon',
  'selected_text',
  'concept_candidates',
  'input_mode',
  'created_at',
] as const;

/** Copies exactly the contract fields, dropping anything else attached to the object. */
export function contractSelection(selection: Selection): Selection {
  const out: Record<string, unknown> = {};
  for (const key of SELECTION_KEYS) {
    if (selection[key] !== undefined) out[key] = selection[key];
  }
  return out as Selection;
}

export function buildBridgeRequest(selection: Selection, requestId: Identifier): BridgeRequest {
  return Object.freeze({
    contract_version: CONTRACT_VERSION,
    request_id: requestId,
    action: 'selection.submit',
    selection: contractSelection(selection),
  });
}

const STATUSES = new Set(['accepted', 'needs_auth', 'unsupported', 'rejected']);
const ERROR_CODES = new Set(['invalid_payload', 'origin_not_authorized', 'identity_mismatch', 'stale_source', 'bridge_unavailable']);
const RESPONSE_KEYS = new Set(['contract_version', 'request_id', 'status', 'error_code']);

/** Strict shape check of a native reply; anything unexpected is treated as not accepted. */
export function parseBridgeResponse(raw: unknown, requestId: Identifier): BridgeResponse | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (!Object.keys(r).every((k) => RESPONSE_KEYS.has(k))) return null;
  if (r.contract_version !== CONTRACT_VERSION || r.request_id !== requestId) return null;
  if (typeof r.status !== 'string' || !STATUSES.has(r.status)) return null;
  if (!(r.error_code === null || (typeof r.error_code === 'string' && ERROR_CODES.has(r.error_code)))) return null;
  if (r.status === 'accepted' && r.error_code !== null) return null;
  return r as BridgeResponse;
}

export type NativeTransport = {
  readonly kind: 'native' | 'unavailable';
  send(request: BridgeRequest): Promise<unknown>;
};

export type BridgeOutcome = {
  readonly response: BridgeResponse;
  /** `local` means the reply was produced here because no native bridge answered. */
  readonly answeredBy: 'native' | 'local';
};

/** Transport used when the page is not running inside the Safari extension. */
export const unavailableTransport: NativeTransport = {
  kind: 'unavailable',
  send: async () => {
    throw new Error('native bridge unavailable');
  },
};

export async function submitSelection(transport: NativeTransport, request: BridgeRequest): Promise<BridgeOutcome> {
  const local = (error_code: BridgeResponse['error_code'], status: BridgeResponse['status']): BridgeOutcome => ({
    response: Object.freeze({ contract_version: CONTRACT_VERSION, request_id: request.request_id, status, error_code }),
    answeredBy: 'local',
  });
  if (transport.kind === 'unavailable') return local('bridge_unavailable', 'unsupported');
  let raw: unknown;
  try {
    raw = await transport.send(request);
  } catch {
    return local('bridge_unavailable', 'unsupported');
  }
  const parsed = parseBridgeResponse(raw, request.request_id);
  return parsed ? { response: parsed, answeredBy: 'native' } : local('invalid_payload', 'rejected');
}
