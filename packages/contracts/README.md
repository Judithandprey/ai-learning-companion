# Shared contracts 0.1.0

`schema.json` is the wire-format source of truth (JSON Schema 2020-12).
`generated/contracts.ts` is generated structural typing, not runtime validation.
The Python entry point is `packages.contracts.validate(name, payload)`.
The additive HTTP interface is documented in [HTTP.md](HTTP.md); its generated
OpenAPI file describes the interface; backend implementation and its unverified
provider/database boundaries are documented in [services/api](../../services/api/README.md).

Run from the repository root:

```sh
uv sync --frozen
uv run python -m packages.contracts.generate_types --check
uv run python -m packages.contracts.generate_openapi --check
uv run pytest packages/contracts/tests
```

Regenerate types with `uv run python -m packages.contracts.generate_types`.
Regenerate OpenAPI with `uv run python -m packages.contracts.generate_openapi`.
The additive [Mac retained-frame metadata 0.2.11](macos_frame/README.md) describes
raw/composed/refused/unknown native outcomes without changing these 0.1.0 formats
or activating an HTTP route. The additive [Mac ingress 0.2.12](macos_capture_ingress/README.md)
adds executable ordered HTTP envelope/binding/ACK/error checks; the future adapter
remains explicitly off and unimplemented. Both generators and types are registered
in root checks. Existing families retain their own closed versions.
The generator intentionally accepts only the subset used by this schema; new
structural keywords require a generator change. No external schema fetch is needed.

## Semantics that every consumer must preserve

- All domain IDs are application IDs, not provider identities. Authenticate first;
  never trust a page-provided `user_id`, origin or authorization context. Compare
  every related record against the authenticated user. Long-lived credentials
  stay outside messages, pages, logs and model contexts.
- UTC instants end in `Z`; source timezone is an IANA name. `media_position` is
  seconds in the source video, not wall-clock time; null means unknown.
  The Python wire validator rejects integer literals outside the JavaScript safe
  integer range even in `number` fields, so a huge Python integer cannot silently
  become Infinity/null in a JavaScript consumer. Invalid timezone names, including
  filesystem lookup errors for overlong names or directory-only zone keys,
  produce validation errors.
  Other timezone database permission/I/O faults remain service errors, rather
  than being mislabeled as invalid input. Integer traversal is iterative;
  payloads the JSON encoder cannot process within its recursion limit are rejected.
- `(user_id, source_id, source_version)` identifies immutable source bytes.
  `Frame` references an immutable artifact whose SHA-256 is checked on ingestion.
  `representation=dom_snapshot` is not proof of a screen image or captured video.
  Synthetic data is test-only and must never become real user history.
- Selection geometry uses normalized frozen-frame coordinates: origin top-left,
  x rightwards, y downwards, each in [0,1]. A polygon is optional and supplements
  its bounding box. The frame, source version, video position, session, device and
  user must match. Future page movement does not rewrite these anchors. An absent
  capture is reported as missing, never replaced by an invented frame identifier.
- NAV and WRITE never request explanations. ASK is explicit. Pencil presence
  does not authorize intercepting fingers. A finished/cancelled ASK restores the
  previous mode. `ExplanationRequest.mode` is silent; cards have `audio=false`.
- Bridge v0.1 supports only `selection.submit`. Native code obtains the page origin
  from its trusted extension context and checks permissions, expiry, identity and
  payload before storing anything. A bridge ACK means request acceptance, not
  note persistence, captured media, or provider connectivity. No bridge returns a
  long-lived token. There is no arbitrary command or code execution action.
- Batch ingest is atomic: stable event IDs deduplicate; reuse with different
  content is a 409. `(user_id, device_id, device_sequence)` cannot identify two
  events. ACK lists exact accepted/duplicate events; clients resend only missing
  ACKs, not everything below a presumed highest sequence. `received_at` is filled
  by the server. An actor is never inferred from the current device alone.
- New notes start at revision 1/base 0. Every update uses compare-and-swap and
  conflicts return 409 without overwriting. User ink is immutable versioned input;
  AI additions are separate blocks. AI may not change a user's original blocks or
  ink. Corrections retain the prior event link. Deletion must tombstone sources and
  derivatives so stale jobs cannot recreate them.
  The top-level `source_event_ids` is the complete note evidence set and must
  include all context-segment events; it may additionally cite discussion events.
- API budget is initially 100,000 fen per month in America/Los_Angeles. Money is
  integer CNY fen, rounded upward for reservations. A concrete price and FX version
  are required; unknown price/quota is not zero. Subscription quota is separate.
  Backend must atomically reserve across concurrent tasks before any paid call,
  include retry exposure, reconcile actuals, and stop new calls at the limit.
  A schema validation alone does not implement this ledger or enable paid calls.
- Jobs check source versions, authorization, deletion and cancellation before
  committing derived output. `cancel_requested` is not proof execution stopped.
- Cache keys include the exact source version/locator and knowledge-profile
  version; a cache miss cannot masquerade as a generated answer. Provider-disabled
  probes may show a clearly labeled fixture card only for its exact fixture.

Examples are project-authored synthetic data with no real credentials or course
account content. `frame.svg` is an illustration, not a screenshot. This package
implements shape/local-invariant checks; database constraints, login, lifecycle,
providers, native capture and durable synchronization remain assigned work.

## P0 compatibility checkpoint

The in-development `0.1.0` label alone does not identify a synchronized checkout.
The earlier `627e01c` validator predates the additional HTTP scopes supplied in
`f02618f`; for example, the earlier enum rejects `usage:read`. Consumers must use
the lead's exact committed baseline and its generated artifacts together. These
local numeric/timezone fixes add no wire fields or executor. P0-08 still owns the
next versioned compatibility/migration decision; do not silently mix baselines.
