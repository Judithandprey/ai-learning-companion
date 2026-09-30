> Historical preparation only. The example36762827375 below failed test compilation; do not execute those example commands. Current successful Mac job36764195464 and its final audit commands/results are recorded in README.md. No result is inferred from this earlier script preparation.

# Prepared macOS immutable-ink hosted verification — NOT RUN

Two scripts are ready under `/tmp`, adapted from the existing `docs/verification/lead/macos-retained-hosted/{artifact-audit.py,composition.py}`. Historical scripts and image-only results remain unchanged. Both new files were syntax-parsed only (`ast.parse`); neither has been run, and no future native/HTTP PASS is claimed.

Exact producer fields were read from reviewed **35c75a45b1a29c3e069e061e077b45f820cfee1e** (including the 89edd5c correction): `item.ink_original_bindings`, `ComposedFrame.inkOriginal`, `ink-originals/<sha256>.json`, and native `pairedRevision`/`documentRevision`/pending/freeze fields. Reviewer capture_runtime_review confirmed the same fixture seam; its Python-only synthetic probes were not substituted for native output.

## Artifact audit

`/tmp/macos-ink-hosted-audit.py` takes explicit artifact directory, exact hosted source SHA, approved native SHA, run ID and fresh output path; metadata paths default to `<artifact-dir>-run.json` and `-artifacts.json` and may be supplied explicitly. It retains full checksum coverage, complete raw Git blob/path/mode identity, app/package/build input checks, declared-vs-actual XCTest names/results, logged checker/refusal counts and old fixture families. Counts are derived from actual evidence, not populated from the reported 47 tests/51 refusals.

Added checks compare every emitted editable binding with its native retained JSON bytes, digest/length/path, source identity, frozen document/session/display and paired revision. Visible IDs are replayed at the paired revision, permitting a later frozen document revision. All immutable JSON files and native status counters must be accounted for. No-document, unavailable and absent/unrecorded originals retain their distinct states; no binding is invented. Native records, full original histories/stacks/ASK selections and limitations are retained in the audit receipt. The mutable live `ink/ink.json` hash is labelled separately and is never substituted for an immutable original.

For the actual run supplied by lead, after download:

```sh
python3 /tmp/macos-ink-hosted-audit.py \
  --repo /home/agentsdock/Projects/learning-companion/repo \
  --artifact-dir /tmp/lc-macos-36762827375 \
  --commit 687a58bc91df2bf651c14c2cffd66eabc2907ed6 \
  --approved 35c75a45b1a29c3e069e061e077b45f820cfee1e \
  --run 36762827375 \
  --output /tmp/macos-ink-36762827375-audit.json
```

No downloaded artifact is required to prepare or syntax-parse this script. Actual missing files or mismatched identities fail when lead executes it; output must be new and outside the evidence directory.

## Existing HTTP/runtime composition

`/tmp/macos-ink-http-composition.py` requires that successful new audit receipt and verifies every fixture file hash against it. The checker must equal the exact audited source. It reuses the checker's `batch_for`, native association helpers and existing released validators; it does not run the checker's mutation suite or manufacture a fixture.

For each unchanged emitted descriptor, supplied **0.2.2 editable_ink** references are appended to the same existing `Process.artifacts`; PNG bindings stay separate. The envelope remains **0.2.12**, frames remain **0.2.11**. No native pairing, pending-gesture, frozen-time or unrepresented field is inserted into a wire schema. Generic archive contracts do not certify the native paired/snapshot relation; that evidence is audited separately and kept in the receipt.

The existing actual MemoryStore runtime/ASGI sequence uploads exact supplied immutable JSON alongside PNGs, validates original receipts, HTTP-reads every original back byte-for-byte, commits/replays the batch, reads actual stored/context rows, and rebuilds the runtime over the same store without fresh consent. Reopened original HTTP readback is checked again. Existing historical Stop, rejected post-Stop ingest, current token and source-revocation fences remain; editable originals now participate in their readback/refusal checks. Learning retains exact artifact references and existing PNG role attachment; it is not claimed to render/read editable stroke JSON or establish a provider receipt.

After a successful artifact audit:

```sh
PYTHONDONTWRITEBYTECODE=1 \
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python \
  /tmp/macos-ink-http-composition.py \
  /tmp/lc-macos-36762827375/macos-retained-frame-fixture \
  --repo /home/agentsdock/Projects/learning-companion/repo \
  --artifact-audit /tmp/macos-ink-36762827375-audit.json \
  --output /tmp/macos-ink-36762827375-composition.json
```

Authority, identities and consent remain explicitly synthetic; separate mapping variants get pristine stores. No listener, DB, provider, interactive desktop/native capture or service edit is involved. Source/fixture validation, library XCTest, packaged app and actual interactive/provider acceptance remain separate. Script hashes and preparation status are saved in `/tmp/macos-ink-verification-preparation.json`.
