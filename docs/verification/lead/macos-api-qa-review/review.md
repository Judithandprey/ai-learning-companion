# QA Mac ingress delivery audit

**APPROVE the QA delivery as scoped evidence; keep QA-MAC-01 open as an availability defect/explicit temporary limit.** The test passing that observation confirms current actor-wide refusal; it does not mean the refusal scope is desirable or that full Mac acceptance passed. Recommend a bounded Backend follow-up to narrow ordinary declared-image contradictions to the images/dependencies being admitted or returned. No production or repository edits were made in this review.

Exact QA commit: `4fd6b2860a207a5b71971be08a3f22f0d92d5d92`. Claimed baseline: `576c62c6679cf0db4d6d18307abd0e727553ee9a`. Independent execution baseline: current main `1f2a41257dd1fa88d7327827eff73800919ead6a`.

## Exact-source and evidence audit

Exports: `/tmp/macos-qa-4fd-review-psbrdn8e/qa` and `/tmp/macos-qa-4fd-review-psbrdn8e/current-main`. The latter contains the exact main tree with only the delivered QA test overlaid for execution. `PYTHONPATH` selects this export and its existing e2e helper. No worker/main changes, DB, listener, display, provider or native execution occurred.

- QA changes exactly six files: one test, its report and four text evidence files. QA `services/` and `packages/` are byte-identical to `576c62c`.
- The test SHA-256 is `dcdf901c7cacc284d9dedb10ce2ed0d6b94f245f2c55cadd762cf865e6cb4fee`; imported Windows QA helper SHA-256 is `fbf9acb64ca30123ab590f6a4e0d22ac73f292a13490dd667f427953f2783d93`. Both match the retained execution/sensitivity/future-clock logs. The helper is unchanged on current main.
- `frame_variants.py`, `capture.py`, `process_context.py`, `image_resolver.py`, Learning `process_context.py` and `capture_runtime.py` have identical Git blobs at baseline, QA delivery and current main. The retained Swift fixture tree also matches all three revisions (`65dd82a9013bb2445c420b1ac88d27318d4dc431`). Fixture PNG bytes are checked against their descriptor digest and length by the actual tests.
- The independent current-main replay passed **41 tests in 6.04 seconds**, and its ordered 41 case IDs exactly match the retained QA log: 40 assigned behavior cases plus one scope observation. Full output is `/tmp/macos-qa-4fd-review-pytest.txt`; source/hash audit is `/tmp/macos-qa-4fd-review-audit.json`.
- Tests use the actual composed trusted-local runtime with explicit capability/profile/consent, in-process ASGI and MemoryStore. They exercise ordered envelopes, exact artifacts, reader/resolver/Learning call paths, current fences, cross-family aliases, delayed contradictions, rollback/cancellation and no-write refusals. The inherited autouse crash spy distinguishes deliberate DomainError refusals from unexpected masked failures; deliberately injected exceptions are explicitly inspected and cleared by the cancellation tests.
- Owner/QA historical controls, mutation sensitivity and future-clock runs remain reported evidence. This review did not rerun them. The checked-in mutation record specifically retains M23 and its three failures; it is not a complete audit trail for all 26 reported mutations.

Minor documentation clarification: the gap-only table says “0 receipts.” The test correctly expects **one record ACK with zero artifact receipts**, so clarify that phrase when updating the report. This does not invalidate the execution evidence. The synthetic Swift buffers, synthetic ink/identities and absent native/provider acceptance are otherwise labeled accurately.

## QA-MAC-01: demonstrated scope and cause

`tests/e2e/test_p0_13_macos_ingress_qa.py:560–595` is the executed reproduction. Through ordinary authorized HTTP, it uploads a same-hash alias on source 2 and submits an old raw descriptor with width 201 for the PNG retained by a Mac descriptor at width 200. After that, even an unrelated source-1 gap record and unrelated frame 2 are denied by Mac read/resolution; a new parentless gap-only Mac batch is 503/no-write. Old routes still accept. Deleting source 2 in the isolated MemoryStore restores source-1 Mac history. A second independent setup has no Mac data at all: two ordinary raw records sharing one PNG declare widths 200/201, and the actor's first Mac gap-only submission is denied.

The defect affects availability within the authenticated actor. It is not an unauthorized reader, an image-byte overwrite, a fabricated PNG decode result or cross-actor denial. Keep contradictory requested originals refused. The test demonstrates deletion as a recovery, not an exhaustive proof that no conceivable administrative repair exists; no nondestructive repair API is established here. Deleting source originals must not become an automatic workaround.

The exact cause is `services/api/frame_variants.py:89–147`: one unscoped `identities/hashes/files` accumulator compares every retained legacy/raw-family row before considering `proposed`. Any contradiction between two unrelated retained rows raises 503. Callers supply no read target at `process_context.py:119` or `image_resolver.py:197`; admission at `capture.py:743` still performs the full scan when `proposed` is empty. This is why raw/raw damage can block the first image-free Mac gap.

The released 0.2.12 contract requires immutable image identity, current cross-batch consistency and fail-closed unknown/corrupt variants; it does not require ordinary valid contradictions unrelated to a requested result to deny every Mac operation for the actor. The current implementation is conservative and protects integrity, but has a broader availability impact than “refuse the contradictory image.” The Backend correction README states actor scans and retained refusal but does not explain the first-gap/unrelated-source impact as clearly as QA's new finding.

## Minimal safe follow-up recommendation

Keep the existing shared checker and transaction; add an explicit target/dependency scope rather than a new index, storage layer, PNG decoder, wire family, or global narrowing of older writers.

1. Seed relevant identity keys from **all raw and composed images of the complete descriptors whose admission/read/resolution is being attested**, not only the selected image role. For admission include the frames of stored causal ancestors already resolved by `_dependencies` (`capture.py:346–460`) where their evidence is relied on. Merely returning early when `proposed` is empty would miss a gap that depends on a contradictory framed ancestor.
2. Continue scanning known retained families and sources within the same actor lock, and compare every retained fact matching a relevant **artifact ID OR encoded SHA-256**. Include Mac's **native-session ID + native-file path** identity independently. A source-only filter, family-only filter or archive-ID-only filter would reopen the proven alias/cross-family hole. Keep partial legacy facts accumulating without inventing MIME/dimensions, and retain complete descriptor validation and the released unknown/corrupt-variant refusal policy.
3. `read_macos` can supply its actual validated `result["frames"]`; `resolve_macos` can supply the exact stored full frame it already validated. Admission supplies proposed frames plus actual retained dependency frames. A parentless frameless gap has no image target and must not inherit an unrelated valid-declaration conflict. Preserve source/account/current authority, typed-original, loss/tombstone, ancestor and final reread checks unchanged.
4. Preserve existing fresh conflict vs retained damage behavior: conflicting new Mac declarations are 409/no-write; retained requested contradictions and exact cached success are refused with 503/unavailable. A selection containing a relevant conflict still fails atomically; no partial Learning packet. Preserve both roles of an affected frame even if only one is requested for decoding.

Bounded acceptance for that follow-up should retain all original alias/cross-family controls and adapt the scope observation: unrelated frame/gap read and first parentless gap admission succeed despite unrelated old/raw contradictions; the actually contradicted frame and any mixed selection containing it still refuse; a gap with a conflicting framed ancestor still refuses; cross-source same-hash aliases and same-session native-path collisions remain checked. A different native session may reuse a path as before. Keep final Learning reread/current-fence and no-write assertions. No repeat mutation campaign is needed to establish this bounded change.

If Lead defers the fix, record an explicit temporary actor-wide Mac unavailability limit, including raw/raw triggers before any Mac sample and lack of a nondestructive recovery API. Keep the existing released `503 unavailable/retryable:true` mapping; that flag permits a retry **after actual dependency repair**, not evidence that an unchanged request or time delay can recover. Do not silently change the wire error contract or erase retained originals. The narrowing recommendation changes service selection scope without requiring a schema/version migration.

## Reproduction

```sh
cd /tmp/macos-qa-4fd-review-psbrdn8e/current-main
PYTHONDONTWRITEBYTECODE=1 PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 \
PYTHONPATH=/tmp/macos-qa-4fd-review-psbrdn8e/current-main:/tmp/macos-qa-4fd-review-psbrdn8e/current-main/tests/e2e \
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -p no:cacheprovider -v tests/e2e/test_p0_13_macos_ingress_qa.py
```

PONYTAIL LITE was applied as a bounded exact-source audit and one focused replay, reusing the actual delivered tests. No broader suite or mutation repetition was run. Lead owns the final correction decision; Backend owns the production consumers. Native Mac, PostgreSQL durability, provider receipt, original-screen pen behavior and both desktop core gates remain outside this evidence.
