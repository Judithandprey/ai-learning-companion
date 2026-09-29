# Stored process context reader integration

Backend base `4b5b7684bfaf2821d2827622dbcd63019d340b60` and correction
`9e40baa159387f9f544f7debdd18fbb7ce83b96d` integrate normally as `c607c58`
and **`5360b42`**. Actual deliveries are
`handoff_0ac12fbec712dc82c584004f54445ff6` and
`handoff_2cd529713117fd4bd4f1afc6770be449`. No worker branch or existing
source history was reset. The pending native-upload CI patch remains uncommitted.

The internal callable reads 1–100 explicitly selected stored records, exact sources
and Frames in one actor transaction, with current caller/source access and retained
binding/tombstone checks. It returns detached released objects, bounds complete
UTF-8 metadata at4MiB, and does not scan/write the archive or read image blobs.
Selection order is not chronology; historical context is not live permission.
The separate existing resolver checks actual image bytes. No route/default service,
provider, new source store, schema, migration or dependency was added.

[Independent review](process-context-reader-review.md) found PC1: changing only the
historical capture-binding generation left contradictory display provenance but
still returned context. The original failure is retained. The correction compares
the independently validated historical pins, without comparing them to today's
account generation. Nine independent exact failure/negative/positive checks now
pass, including fresh current authorization reading intact older history.

## Main verification actually run

On exact integrated source `5360b42`:

```sh
env -u LC_DATABASE_URL -u LC_TEST_DATABASE_URL .venv/bin/python -m pytest -q \
  services/api/tests/test_process_context_reader.py \
  tests/evals/test_process_context.py services/api/tests/test_image_resolver.py
```

**209 passed in15.54s, exit0.** Includes actual in-process HTTP registration,
original upload and frame/process commit through the new reader and unchanged
Learning composer, preserving the synthetic124-byte PNG, source/Frame/process
record and separate52-byte editable-original reference. Input limits, exact UTF-8
boundary, immutable pins, no reads outside the explicit selection, guard changes,
deletions, transaction failure, detachment, historical Stop and byte gaps remain
covered. `git diff --check` passes. Backend separately reported118 reader/display
checks on its correction; those are owner evidence, not additional main checks.

These are ASGI/MemoryStore and local component tests. No new PostgreSQL run,
listener, browser, native build/device or provider call occurred. The earlier real
API restart evidence is not relabeled as execution of this reader. Both full core
gates and untested product acceptance remain open.

## Next bounded owned step

The current P0-05/10 card assigns Learning a small stored-context preparation
callable using this reader and the existing composer/resolver. It must re-read
all selected metadata after composition, including frameless or budget-omitted
sources, and withhold the packet on changed/denied access. Preserve exact originals,
unknown gaps and all current permission/evidence flags; no retry loop, cache,
second reader/archive or provider callback. Last-check preparation does not grant
future send/display permission: actual use still needs current source and help
checks at that boundary.

Lead releases the precise baseline before native dispatch. Backend's reviewed
reader task is complete; it remains available for actual consumer defects, without
a duplicate implementation assignment. Web continues its accepted capture/ink
recovery correction; iOS retains the four upload-state corrections and held native
CI dependency. User preview and Paperclip remain untouched.


## Publication and actual next dispatch

Release `7dfb9eaaf6ec7cf6e8c44ebb6fe31d59849cc8d1` was pushed normally
and independently matched `origin/main`. Automatic [P0 CI36606984773](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36606984773)
passed: Python3.12/Node24.21 in2m57s and Python3.14/Node24.21 in4m1s.
The foreground watcher completed with exit0; this adds no device/provider claim. Native Learning route accepted
`handoff_adb3251867602a8520c131e1df784f26` for the exact release and complete
P0-05/10 card. That passive receipt was not execution evidence. Actual reply
`handoff_77b24841fbd8fe312b0b0cc300184ce4` at2026-09-29 17:52:11 UTC
subsequently confirms task/affected original-English clause and call-flow reads,
normal merge `ae4ebd5e5a229644f03716520ab43d8a02b43c3f`, and implementation
of the single assigned callable. Lead verified the merge object and exact baseline
ancestry. The owner reports its first merge approval timed out and the identical
allowed retry succeeded; this is not a current blocker. No new acceptance or code
delivery is claimed, and no acknowledgment or duplicate task was sent.


## Consumer cancellation finding (2026-09-29 UTC)

While implementing the assigned wrapper, Learning reports actual finding
`handoff_bdf94299ea830e3713e903e15ad6fb24`: a trusted guard calling a cancelled
standard `concurrent.futures.Future.result()` is sanitized by the concrete reader
as 503 or resolver as an unavailable image, instead of propagating cancellation.
The ordinary reader refusal still withholds metadata; however, resolver cancellation
can become a gap while a separately valid reader allows metadata to return. This
is a cancellation-flow defect, not a claimed authorization bypass or provider run.
The earlier 209 checks and PC1 fix remain evidence for their actual assertions;
they did not cover these adapter cancellation cases.

Backend owns only the two adapter catch boundaries and focused regressions under
`handoff_cf11967a910cbf9141c9131bfadd843b`. Actual start
`handoff_8e841d557f8bc336db125d007a8986d1` at 18:00:02 UTC confirms
its clean `9e40baa` worktree and exact affected source/test matches with `f022165`.
Learning continues its separate wrapper and real-adapter composition regression;
coordination receipt is `handoff_14c5c3ca3f6bab623dce8a94d2c55b5f`.
No duplicate reader, broader code sweep or repeated DB campaign is assigned.
Next is the owner correction and targeted independent/main checks; combined
consumer acceptance remains pending.


[Independent exact-adapter reproduction](backend-context-cancellation-review.md)
now confirms eight cancellation failures and seven ordinary-error sanitization
passes at `f022165`. The composed case continues to a second image after the
first cancelled resolver; cancellation should instead propagate immediately.
Stored documents remain unchanged and transactions are released. The same
15-case probe is retained for the owner's correction. These are local synthetic
HTTP/MemoryStore checks; no real provider/device cancellation is established.
