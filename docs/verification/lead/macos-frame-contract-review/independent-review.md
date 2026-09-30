# Independent review: Mac retained-frame candidate 794fbd9

Decision: HOLD release of candidate `794fbd910051ffda253abf38229f2f40be7dce09` for one bounded integer-formatting correction covering two sites. No additional producer/provenance or binding blocker was found. Version 0.2.11 remains UNRELEASED; no transport, admission or consumer registration is introduced.

Parent `ea3ec234161ea4b404775600d57fc8bf95a124c5`; assigned producer `5f80c0926f96d3afdb8da7a00c295b4f4e8fdd63`; fixture provenance `484e06ae7b8fb33ac8e67a11d9a25e959311a608`. Exact export `/tmp/macos-frame-contract-794fbd9`. Reviewed all 11 changed files, complete validator/README/tests, generated schema/types and relevant Swift CaptureRecords/FrameFacts/CaptureRecorder/InkComposition semantics. Used current AGENTS/TEAM/workflow and the affected full original/English requirements already refreshed at this task boundary. Applied PONYTAIL LITE: isolated candidate, existing validators/generator, focused tests and a small JSON-only reproducer.

## Blocking finding: JSON integers represented as floats

P2 before release; `packages/contracts/macos_frame/__init__.py:154,193–196`.

JSON Schema's integer type accepts integral JSON numbers, including `3.0` and `3e0`. Python's JSON decoder reads these as floats. With only `callback_sequence` changed from `3` to either representation, the generated schema accepts the unchanged frame but `validate()` raises uncaught `ValueError: Unknown format code 'd' for object of type 'float'` at `f"{frame['callback_sequence']:08d}.png"`. All declared facts and the native filename still represent callback 3.

The same representation issue affects the reopened-revision limit: a valid reopened revision `2` with null commit time and the exact native `revision 2 was committed before ...` limitation passes. Representing the revision as JSON `2.0` still passes the structural schema, but runtime interpolation expects `revision 2.0 ...` and falsely rejects the truthful native limitation.

Minimal correction: after schema validation has established integral, safe-range values, format a local `int(...)` value when deriving the callback filename and expected reopened-revision text. Do not mutate input numbers or native strings, weaken the existing source/clock rules, or remove the unknown-clock limit. Test decimal and exponent integral JSON forms at both sites; fractional and boolean values must continue to raise ValidationError. The lead has returned this correction to Learning. No live endpoint exploit is claimed: this is a pure unreleased validator compatibility/error-boundary defect.

Reproducer:

```sh
PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python /tmp/macos-frame-contract-negative-probe.py
```

Nine independent cases: unchanged control accepted; callback `3.0` and `3e0` structurally accepted but runtime ValueError; fractional `3.5` and boolean rejected by schema/runtime; reopened integer control accepted; reopened `2.0` falsely rejected; inconsistent sourceHost rejected; honest unknown-source callback pairing accepted. All inputs remained unchanged. Script, `/tmp/macos-frame-contract-negative-results.json` and `/tmp/macos-frame-contract-negative.log` preserve the original failing behavior.

## Positive source and behavior review

- Complete owner/source/version, record/frame and device/session/stream binding is checked. Each distinct declared image identity requires exactly one screen-image original binding; binding order is immaterial. Same-ID, same-file and same-hash PNG contradictions are refused, while legitimate one/two-reference aliases and separate identical files remain possible.
- Source time follows the producer's reported ticks/seconds and configured lead tolerance; callback admission is the explicit fallback. No timebase conversion is invented. PTS, composition processing time and startup wall time do not become capture UTC, playhead, a Process clock or live permission. Those corresponding fields remain null.
- Unknown outcome, explicit refusal and successful empty-ink/raw alias remain distinct. Raw relation, frame dimensions, mapping ratios, exact rendering text, base limitations, optional document/revision/commit time and reopened unknown-clock conditions are checked without rewriting originals.
- The candidate is metadata-only. It deliberately cannot prove the supplied revision/stroke list matches immutable editable-ink bytes. Document path/revision, save state and successful composition are not an ink-save receipt. Separate ink references and unrelated Process records/scope/parents remain unchanged. A structurally valid structured record receives no acquisition authority from this validator.
- No existing contract module or root registration changed. The focused file includes old-family rejection and unchanged 0.2.7 scope checks. Generated schema/types express structural constraints; Python runtime checks remain required for cross-field binding rules.

## Independent execution and exact provenance

```sh
# cwd /tmp/macos-frame-contract-794fbd9
PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -p no:cacheprovider -v packages/contracts/tests/test_macos_frame.py
```

**182 passed in 0.53 s**, log `/tmp/macos-frame-contract-182.log`. This includes generated-output equality checks. No full 1,442-test suite or independent TypeScript/native compile was rerun.

All 11 exported changed files match exact candidate Git bytes. Copied native metadata matches exact fixture Git blobs:

- status SHA-256 `ede049b1e10d6072e7aa739fb942d55d5926fbc7918765cb41101083dc7b6d73`;
- events SHA-256 `d5c7840a55150987ee52b566fdd819cba6b4885cd18b4d246cb74b86a0d55033`.

The independent producer/artifact audit verified all **12 PNGs** (7 raw, 5 composed) against file hashes, lengths and dimensions. Seven retained frames map to six compositions and one refusal. Original ink history replay matches ordered stroke IDs at revisions **0, 1, 2, 3, 4, 4**. Relevant producer files and fixture tests agree between the fixture commit and assigned producer. These are actual Swift-generated synthetic-buffer artifacts, not real display capture.

## Limits and non-blocking documentation precision

The README says “16 KiB detail/limit text” and “1 KiB mapping,” but JSON Schema `maxLength` is a character limit, not a UTF-8 byte limit. Describe the actual 16,384-/1,024-character admission bounds (or deliberately implement byte bounds if required); do not imply these structural limits are transport byte ceilings. No new transport exists here.

Session counters/gaps/ending, capture-filter process details, geometry changes, input/ASK events and complete editable history/save state remain in native originals; this is not a whole-session export. Future ingestion must preserve/report unrepresented facts. App exclusion and geometry remain explicitly unverified on a Mac. Current authorization, bytes, immutable ink retention, native ingestion, real AI receipt, help permission and both §7.1 gates remain separate. No database, socket, provider, native execution, research, repository/worker edits or Git mutation occurred.

Source evidence: `/tmp/macos-frame-contract-review-source.json`; producer audit: `/tmp/macos-frame-contract-794fbd9-provenance-audit.json`. Lead owns the correction review, root registration and release.
