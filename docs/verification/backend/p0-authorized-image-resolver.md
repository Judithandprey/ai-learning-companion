# P0-04/P0-09 authorized image evidence composition

Backend assignment `handoff_6c7f4730f627f6cdf28e48458dcaf9fd`, 2026-09-29.
Clean `team/backend` at `ce45657` was normally merged with assigned
`98ee104f1991b0764a9cc71838af0e80f3b26196`; implementation parent is
`e471063b681fc50783e04b4077e3a5432d450479`. Existing originals, source extraction,
Learning context and shared contracts remain unchanged.

Refreshed current decisions, role/task guidance, original/English R07/R29/R30/
R46/R51/R52/R59, corresponding acceptance and source-time/original-archive cases.
The four source/English manifest pairs match. PONYTAIL LITE reuses the existing
actor transaction and original-artifact checks; no new archive or dependency.

## Callable

```python
from services.api.image_resolver import AuthorizedImageResolver
from services.learning.images import materialize_image_evidence

resolver = AuthorizedImageResolver(store, authenticated_user_id, current_caller_guard)
images = materialize_image_evidence(
    learning_archive, assembled_context, resolver,
    user_id=authenticated_user_id,
    capture_states=independently_observed_capture_states,
)
```

The caller supplies actual authenticated identity and a current guard that checks
its generation/expiry/scope. The callable receives `detached_frame, *, max_bytes`.
It compares the complete validated frame to the authoritative stored frame, then
checks current account/source authorization, exact source snapshot and its hash,
device/session ownership, artifact tombstones, owner, ID and hash under one actor
transaction. Requested historical versions remain readable while authorized;
neither a newer source version nor stopped capture erases their historical meaning.

For typed originals, existing `check_reference` enforces the exact source triple,
kind, media type, length, binding and bytes. Legacy frames use the stored frame
binding, strict base64, actual PNG signature and digest. No URL fetch, rendering
from text, MIME guess from a filename, or detached snapshot-byte fallback occurs.
The returned shape is precisely the existing Learning resolver vocabulary:

| Result | Meaning |
| --- | --- |
| `available`, exact `frame`, `media_type=image/png`, immutable `data` | Currently authorized original PNG bytes; Learning still validates dimensions and supported pixel format. |
| `missing` | Required current record is absent/deleted or its artifact ID is tombstoned. |
| `revoked` | Current account/source/caller guard denies access, including expiry. |
| `unobservable` | DOM-only/non-PNG bytes or a supported-storage type outside this PNG consumer, such as JPEG; no silent conversion. |
| `byte_limit` | The current encoded/decoded image exceeds the caller bound or shared 32 MiB ceiling; no truncation. |
| `unavailable` | Frame mismatch, ownership/binding corruption, invalid data, unsupported source state, or unexpected storage/guard/transaction failure; no bytes or exception details escape. |

`max_bytes` must be a positive integer. Encoded length and padding are checked
before decoding, including typed validation. The existing document store loads
one complete JSON row; this bounds decoded allocation/output, not total database
row-read memory. No source scans or storage redesign are introduced.

The resolver's byte availability is a point-in-time authorization result. It does
not grant subsequent provider delivery, current teaching permission, live capture,
or continued access after revocation. Those consumers retain their own fences.
Learning's `live_status/provider_receipt=not_attested`,
`presentation_permission=not_granted`, and explicit capture restrictions remain.

## Verification

Independent static review found no blocking issue. Used the existing installed
project Python, with no dependency changes:

```sh
python -m pytest -q services/api/tests/test_image_resolver.py
# 78 passed in 0.32s
python -m pytest -q tests/evals/test_image_evidence.py
# 66 passed in 0.64s
```

The first run of the new tests had 75 passes and one incorrect expectation:
a Frame linked to typed editable ink expected `unobservable`. That is a corrupt
image binding (`kind=ink`), so `unavailable` is correct; the assertion was corrected,
and genuine typed JPEG remains `unobservable`. No production assertion was weakened.
Two final cases then added composed byte-limit rejection and historical-version
readability after advancing the source head. Total: **144 focused cases passed**.
`git diff --check` passed. No DB or previous 479-case campaign was rerun.

Actual synthetic operation: generated valid 2×2 RGB PNG pixels, ingested them
through existing `Archive.import_fixture` and event methods, exported the authorized
snapshot, built `ArchiveSnapshot`/retrieval/context, and materialized the exact PNG
using this current-store resolver. The resulting evidence preserved source hash,
capture/receipt time, media position, actor and provenance. It remained labeled
`synthetic_image`, with no live/provider/presentation grant.

After that same context was assembled, source revoke, identity-generation change,
account disable, deletion, missing blob or corrupted bytes produced explicit gaps
and zero attached bytes, despite the detached archive still holding the old image.
Other cases exercised complete frame swaps, source/artifact ownership corruption,
typed aliases, both tombstones, canonical base64, byte limits before decoding,
an old source version after a newer head, and storage/guard/transaction failures.
Instrumentation confirmed one actor transaction, current guard execution inside
it, and point reads without any `scan`. Original records were unchanged.

## Remaining scope

Synthetic real PNG pixels exercise internal composition only. Typed frame linkage
in tests is an explicit fixture, not a new production ingestion route. The genuine
source/frame/producer ingress is still lead-owned pending protocol work. No HTTP
activation, provider call, database campaign, public endpoint, device/signing or
Notability test occurred. The user preview, ports 4173/8174 and Paperclip were not
accessed. Lead next integrates this callable and its focused evidence; Learning
can evaluate a concrete consumer mismatch if one appears. The continuous real-AI
and original-screen cross-app pen gates remain unaccepted.
