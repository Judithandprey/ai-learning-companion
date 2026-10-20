# Independent review of Backend 4e840a4 (receipt output diagnostics), and QA's consumer — 2026-10-20

**Verdict: READY. No defect found** in Backend's delivery for the reviewed boundaries. One non-blocking observation is
listed below. QA's strict receipt reader and sanitizer now accept exactly the legacy **or** the complete extended field
set.

**What ran:**
- local source reads;
- one offline Python probe of the pure writer validation and of `finish_request`;
- Node tests with fakes under `--permission`.

There was no Windows, PowerShell or native run, no Codex, provider, account, microphone or audio call, no access to
private receipts or state, and no lease.

**Unchanged:**
- Candidate 08 stays at 1/4 real actions with its one native attempt consumed; its actual failure branch stays
  **UNKNOWN**, and DISPLAY and ACCOUNT stay released;
- no candidate, stage, runtime or runner pin was changed.

Assignment: Lead `handoff_0c51bd8a` (main `e56084a`). Backend delivery: `4e840a4b82896ded93d7844966bac60beaa47f22`,
on `a6406b4` via `f397816`, with its README `docs/verification/backend/subscription-output-diagnostics/README.md`.

## Backend review

Reviewed at `4e840a4`: `chatgpt_rpc.py`, `chatgpt_receipts.py`, `chatgpt_live.py`, `chatgpt_local.py`, and the two
synthetic fixtures. Findings by boundary:

- **Field set.** The writer (`_metadata`) accepts exactly the old key set or that set plus all nine diagnostics.
  Partial sets and extra keys raise `ReceiptError`. The 16 KiB per-receipt bound and the 4096-record bound are
  unchanged.
- **Value types.**
  - `failure_code` is null or a member of `FAILURE_CODES`. That set is `frozenset(_MESSAGES)`: 28 codes, identical to
    the README list. `RPCError` also normalizes any code into it.
  - `terminal_items_view`, `answer_selection` and `answer_text_state` are fixed enums.
  - `terminal_error_present` is null or a boolean.
  - The four counts pass `_integer(value, 4096**2)`: `type is int`, so bools are rejected.
  - The message count must equal the sum of the three phase counts.
- **Counting.** Counts come from the unique `active["messages"]` (by item id), only for completed, full-view agent
  messages. Duplicates do not add. `terminal_items_view` is recorded before the view is validated, so an unknown view
  becomes `invalid`.
- **First cause.** `ask` records `error.code` before the bounded interrupt. `finish_request` sets `failure_code` only
  while it is still null, and an unknown code becomes `unavailable`. A failing receipt write becomes
  `RPCError("unavailable")`, which is caught there, so the original cause and the cleanup run.
- **No new authority.** The live and local bridges only pass `failure_code` to `finish_request`. There is no new retry,
  fence, presentation or model path. Contracts and public `live/1` are unchanged: the commit touches no file under
  `packages/`.
- **No content.** The new fields carry no text, reasoning, image, raw error, credential or path.

**Independent probe.** [probe_backend_metadata.py](probe_backend_metadata.py) ran against a `git archive` of `4e840a4`
using the delivered fixtures ([probe-backend.json](probe-backend.json), exit 0, empty stderr).
- **Accepted:** 4 valid cases, namely both fixtures, all nullable fields null, and the counts at the 16 777 216 bound.
- **Refused:** 17 invalid cases. They are a partial extended set, legacy plus one diagnostic, an extra key, an unknown
  code, a long marker code, the wrong case, a string boolean, 0 as a boolean, bool, fraction, negative, over-bound,
  null and string counts, a phase-sum mismatch, and an out-of-enum selection and text state.
- **First cause:** kept; an unknown code is recorded as `unavailable`.

**Observation, P3, non-blocking: not part of the stated contract.** The writer does not cross-check the selection or
text state against the counts. For example, `answer_selection: final_answer` is accepted with
`completed_final_answer_count: 0`, and `answer_text_state: nonempty` with `answer_selection: none`. The connector sets
these fields together from one computation, so a real receipt cannot reach those states by that path. The writer's
contract simply does not enforce it. QA does not reject them either, matching the contract.

## QA consumer: `tests/e2e/windows/qa_run_live_candidate.mjs`

- **`RECEIPT_KEYS_EXTENDED`.** A receipt is read only if its keys are exactly the legacy set or the complete extended
  set. Anything mixed, partial or extra is "not this request's receipt in the connector's format", and nothing of it is
  kept.
- **`receiptFault`.** It requires all diagnostics or none. Each must be valid (`DIAGNOSTICS`):
  - nullable fixed enums;
  - a nullable boolean;
  - integer counts 0–16 777 216, so no bool, fraction, negative, null or string;
  - the phase sum must hold.

  The error names the field and never echoes its value.
- **`sanitizeReceipts`.** It still exposes only the typed review fields, never `thread_id`, `turn_id` or the
  executable path. It now also exposes each diagnostic, but only when its value is valid. Old receipts gain nothing.
- **Unchanged guards:** no-link and single-link opening, the 16 KiB bound read through the open file, the same request
  ID, the single launch, the identity fields, and the bounded readers. No source, window, cleanup or time guard was
  touched, and the ledger is unchanged.

**Focused test** in `test_qa_live_candidate.mjs`, using the delivered fixtures copied byte for byte into
[fixtures/](fixtures/) (SHA-256 matches the Git blobs):
- both fixtures are admitted;
- the sanitized view of the extended fixture shows `incomplete_turn`/`full`/false/1/`none`/`empty`, and the legacy one
  gains nothing;
- the valid boundaries pass;
- three mixed, partial or extra key sets are refused;
- 16 invalid values are refused, never copied, and a marker is never echoed;
- a phase-sum mismatch is refused;
- the sanitizer, given malformed diagnostics directly, drops them;
- a receipt over 16 KiB is still refused.

## Results

- [passes-after.txt](passes-after.txt): **55 of 55**.
- [failures-before-82ee0ac.txt](failures-before-82ee0ac.txt): the same tests against the unchanged reader. **54 of 55
  pass**; only the new test fails, because the old reader refuses the extended fixture.

## Pins and next dependency

- Wrapper `qa_run_live_candidate.mjs` is now `dc10b044bd703bd502d1af40458a03cab893b97af9f7e2a52fbaa81964dbcead`.
  Candidate 08 does not pin the wrapper, so its candidate and payload pins are unchanged.
- An allocation for any future run must name this wrapper hash. It is regenerated only when the Lead coordinates the new
  production baseline; the existing templates are history.
- Test file: `c6bb5f0aae9d12356fa008a9434c9f9862dad2b525fc4c9c860676ab589be63f`.

Next steps:
1. The Lead integrates Backend `4e840a4` and this consumer adaptation.
2. A new production baseline and candidate are coordinated before any separately authorized real attempt.
3. Only such an attempt can show the real failure branch.
