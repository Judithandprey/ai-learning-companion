# Request outcome and exhausted-connector correction

Existing QA-SUB-09/10/11 continuation, not a new audit or provider task.
Actual Backend delivery `handoff_bbf03873362dc28fc2bc713c1c94bc53` supplies
`69c0a0cbb2856b6931ee60404df3ae07844bcb54`; assigned main `bf54ab2`.
Seven paths: three connector modules, three test files and owner evidence.
Shared schema/factory/auth/dependency files are unchanged. The reviewed Support
WinRT evidence remains separate; this code adds no audio route.

## Behavior and compatibility

A written/acknowledged request does not establish completion. Disconnect, generic
RPC start error, missing completion and nonterminal retryable error retain an
uncertain private outcome. A valid failed terminal retains its typed cause. A
local/preflight rejection retains not_submitted; explicit Stop retains cancellation
with interruption uncertainty separately. Sanitized failure metadata survives
bounded child cleanup without retaining the raised exception traceback.

The existing live1 code/submission pair remains independent. Frozen v1 has no
separate unknown-result field, so its genuinely uncertain case uses EOF; it cannot
also convey typed cause on that path. No new fields or prose encoding is added.
A transport submission fact is neither completed inference nor a billing fact.

When the 4096-ID ledger fills, first overflow retires the current foreground stream,
fences work and reaps only its owned child; matching scoped Stop/cancel is still
honored at the cap. IDs are retained, not cleared or rotated. Only a later explicit
Check creates a fresh owner, without resuming/replaying an old question/session.

## Verification and release

Integrated as `b08d48488dac48af210e5495c59e3fb8c7558d0c`.
All seven paths match the delivered candidate byte-for-byte. Independent review
passed the 32 new cases and 37 selected existing regressions. The remaining
real-outer-pipe EOF case timed out twice in sandbox (`queue.Empty`, 5-second
wait), then passed unchanged through normal approved execution in 0.35 seconds.
Its synthetic log reached metadata only; the exact blocked primitive is not
identified. Retain this observed environment differential, not a blanket sandbox
pass or a diagnosed production failure. No assertion or environment-variable
change was made. [Independent record](terminal-independent-review.md).

On integrated main, the 32 new cases plus the actual outer-pipe EOF case pass:
**33 passed in 4.17 seconds**, using the normal approved execution path.
[Commands, hashes and scope](terminal-checks.json). `git diff --check` passes.
No unrelated historical suite or actual provider test was repeated.
Owner evidence preserves the initial 4-failure ledger reproduction, six missing-
completion failures, 419 affected-suite passes and final 32-test subset. Those
counts are owner evidence until separately reproduced; subset counts are not added
to the suite total. All child processes are synthetic; no account/Codex/provider,
Windows display, microphone, speaker or real subscription test is claimed.

## Next owner

Web consumes reviewed exact live1 code/submission behavior in the current Windows
live/credit UI, along with its already assigned stdout/EOF, refused-login cleanup,
selection-failure and TTS corrections. Native preserves its current Mac Stop fix.
Lead integrates their actual commits and prepares a uniquely versioned package;
QA uses the one changed-flow pass, retaining earlier frozen-source evidence.
The five-request reservation is still held, not an account/device lease; no raw
audio test or repeated quota attempt follows. Full GUI/voice/Mac gates remain open.

## Actual release handoffs

Reviewed code/evidence baseline `fca2a2580c2fc2260cb39c122ae78dd678d4705e`
was normally pushed to origin/main before dispatch. Native async sends:

- Windows `handoff_d9ffd7962ebfde70a89f4af0fd0ae147`: consume exact live1
  cause/submission and retirement behavior within the current live/TTS work.
- Native `handoff_d462ea44d3c91e9e92015ba300f79393`: fold frozen-v1 EOF/uncertainty
  and scoped Stop/retirement into its existing queued-write correction.

Both receipts are accepted, initially unread with execution_started=false. They
are safe-boundary dependency updates, not duplicate tasks, observed adoption or
new device/test leases. Existing dirty changes remain preserved. QA's actual
package/lease prerequisite and held five-action allocation are unchanged.
