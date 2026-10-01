# Selected-image subscription ASK: pure learning seam

Implemented on `team/learning` after merging assigned baseline
`ff163a6ebbb9d974055e23ae97d0359e17cecef4` into clean worktree HEAD
`4922685fee7606d9f74b8ed4de6aa0e5420a38bf`. Applied ADR 0003 clarification
and source/English subscription decision at exact revision
`1b7c90558165c87c83564b1d6c777905923b8528` via read-only `git show`.
Scope: R38/§3.8/G4, R49/R51–57, §7.1–7.3/7.7. PONYTAIL LITE:
reuse canonical/hash, UTC-time and PNG validation; no provider, archive,
framework, dependency or shared-contract additions.

## Behavior and integration

`services.learning.subscription_ask.prepare_subscription_ask(request)` returns
`{text, image_bytes, provenance}`. The private request has exactly ADR 0003's
fields; missing fields are rejected rather than defaulted. Provenance is exactly
`{request_id,question,assistance,image:{sha256,width,height},context}`. All
metadata is detached from input; image bytes are immutable and unchanged.
Retain the returned preparation privately for the matching completed turn.

- Validate canonical base64, SHA-256, exact decoded byte count, PNG structure/CRC,
  bounded decompression and dimensions through the existing `images._png_status`.
  Supported subset: static, non-interlaced, 8-bit RGB/RGBA. Other PNG variants are
  refused without conversion. Ceilings: 8 MiB, 16 million pixels, question 4,000
  characters. Fixed errors never quote screenshots or private question content.
- Validate display-local DIP rectangles and frame-local integer pixels using
  Windows `toFramePixels` floor/ceil conversion and actual frame dimensions.
  Global display origins may be negative; nominal scale does not replace actual
  frame ratios. Crop PNG dimensions must equal the selected pixel rectangle.
  Rectangles must be contained, not silently repaired.
- Explicit null source URL/version/media position, capture time and unavailable
  ink binding survive. Known ink hash requires a known revision. Known time is
  UTC ending in Z with unchanged fractional precision. Source versions use the
  existing positive-integer convention; media position is nonnegative numeric.
  Counters accept JSON integer-valued numbers, including `7.0`, and reject bool,
  unsafe integers and nonfinite values. Source URLs are opaque bounded metadata,
  never resolved or interpreted as acquisition authorization.
- Explicit hint/explain/full-solution permission controls an English-first
  instruction, retaining original terms and a scoped temporary language request.
  The question is a separate JSON string; captured metadata/pixels/ink are marked
  untrusted. No source text is OCRed or substituted for image bytes. Instructions
  preserve unknown reasoning, distinguish assisted completion from mastery, and
  reject treating writing/erasing/pauses/capture as help permission.

`bind_subscription_response(prepared, text, *, model, auth_mode, latency_ms,
thread_id, turn_id)` rechecks the prepared PNG/hash/metadata/prompt consistency,
then returns request ID, exact completed text, full detached provenance, caller
supplied actual model/latency/thread/turn and `auth_mode: "chatgpt"`. The additional
`kind: "generated_assistance"` labels authorship separately from originals. Answer
limit: 32,000 characters; reject rather than truncate. Other auth modes, empty
answers and invalid receipt metadata are refused. Model output stays plaintext,
not trusted HTML or commands.

These functions do not attest source acquisition, ink document hash correctness,
real authentication, provider completion, semantic safety or permission. Metadata
comes from trusted desktop main, receipt facts from Backend. Provenance is not an
authenticated seal; coherent malicious rewriting of a whole preparation is not
prevented by a pure function. Backend must only bind successful completed turns,
fence cancelled/stopped requests and isolate tools. Desktop main must compare the
**entire retained provenance** and current selection/session/assistance before
display, render as text and retain generated assistance separately. Prompt wording
alone is not semantic disclosure enforcement or real-model acceptance.

## Verification

From the learning worktree:

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest tests/evals/test_subscription_ask.py tests/evals/test_image_evidence.py -q --tb=short
```

**180 passed in 0.71s**: 114 new ASK tests and 66 existing image-evidence tests.
Project-authored synthetic RGB/RGBA PNGs only. Covers exact provenance/bytes,
mutation isolation, repeated deterministic preparation, all three assistance
levels, separated injected/quoted text, unknown time/ink/version gaps, closed
objects/missing fields, malformed base64, encoded/decoded ceilings, bad CRC,
truncation/trailing data, decompression/dimension errors, unsupported variants,
coordinates/fractional edge rounding, integer spellings, changed preparation,
receipt validation, UTF-8/text ceilings and fixed errors. Calls run with filesystem
and socket access forbidden in the roundtrip check. No failed test was counted as
passed; the first targeted run passed.

Existing contracts, frozen retrieval corpus/labels and previous failure evidence
have no diff from the assigned baseline. Retrieval code/quality are unchanged;
the earlier 50/50 exact and 25/30 fuzzy result was not rerun or improved here.
Real provider calls: **0**. Provider usage/cost, image comprehension, actual
subscription eligibility and end-to-end latency: **not measured**. Backend/Web
integration, real image-only randomized-information acceptance, cancellation
races and current-session display remain the next owners' checks under Lead/QA.
No continuous observation, interactive Mac, physical pen, audio or Notability
acceptance is claimed.
