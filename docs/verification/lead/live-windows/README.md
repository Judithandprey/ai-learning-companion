# Windows live companion implementation checkpoint

Starting baseline `d37f7a442a78122fb351a7aab83ffdff8aec1448`. The user's current
request restores the documented whole-screen/conversation experience and adds
explicit floating spoken-response captions and movable controls. The old running
`3e4b406` package remains untouched: no app restart, user screen/mic capture, account
operation or profile overwrite occurred in this integration.

## Actual ownership / current execution

| Owner | Sent native message | Actual observed status / next action |
| --- | --- | --- |
| Backend | `handoff_26afedde82001568fd372636368a02b8` | Start `handoff_63f349b1bac0afb993c7095b9840af7d`; initial quota delivery `6559198` then explicit incomplete/correction notice `handoff_b3da72f89392b6715033774b016973e4`. Lead holds that first candidate until blanket ordinary-usage veto correction. Next same assignment consumes released live seam. |
| Learning | `handoff_3c92d9028eb9810a64daec76fc42ae35` | Actual start `handoff_bcf1a8b26d7d55238ceba0332e0e2a6c`, normal merge `23b49b9`; implementation/checkpoint and exact-shape feedback `handoff_43cccaffe25b169f6a1f97694cf51098`. Pure live context implementation underway. |
| Windows | `handoff_0dde292d7bd2b8ae876640770b8a8b22` | Actual safe checkpoint/start `handoff_f1d063aabe44754eb061c92b1b0603c0`: lifecycle `4ef42cc`, then toolbar/caption implementation. Root found one nonblocking historical-count edge, returned once as `handoff_21b1471373f22902a1bf5cb207cc4291`. |
| Native/Mac | `handoff_ed8a301873ab085a027e8ada8f54dc76` | Accepted receipt only for this amendment; prior queued/partial-write Stop correction remains its one task, then common seam. No mobile dispatch. |
| Support | `handoff_cdfa998fe3e79e1b5fa3ccd30e895186` | Actual delivered `0640446` / `handoff_690d0a7146b8703c66242b047cb64113`: Windows generated in-memory speech probe and installed schema evidence. Complete/on demand. |
| QA | `handoff_a6d4a4baf7e368565b8de52e935a3d91` | Accepted scoped amendment, not new execution/acceptance. Changed-flow candidate and coordinated generated test display/audio remain dependencies. Preserve prior evidence and unused narrower real-image allocation. |

## Immediate quota diagnosis

The source collapsed typed transient `rateLimitExceeded` with `usageLimitExceeded`
and discarded credits/reached facts. Installed Codex0.158.0 schema and the
[official App Server reference](https://learn.chatgpt.com/docs/app-server) were
checked. Credit balances are lossless nullable strings; unknown differs from zero.
`ordinaryUsageAllowed` describes included usage, not every possible credit-backed
request. Neither a100% window nor that included-only field alone establishes a
universal denial; applicable explicit restrictions and actual turn denials remain
authoritative. No reset-credit consumption, billing activation, token inspection,
account switch or retry is introduced.

Backend read exactly one permitted sanitized operational receipt from the old
package: 2026-10-01 13:29:17 UTC, `not_submitted`, `failed`, null terminal and no
actual model/error/quota facts. That record cannot establish the actual refusal
cause or user balance. The first internal fix is explicitly NOT closed while its
included-only preflight interpretation is corrected. New package diagnostics must
retain typed reasons and actual submission facts safely.

## Shared executable release

[ADR 0004](../../../adr/0004-live-desktop-companion.md) defines additive private
`lc-subscription-live/1`; old selected-image v1 and public v0.1.0 stay intact.
Python/schema/example enforce whole frame plus independently bound focus,
conversation/gaps, current full provenance, separate observation/presentation,
finite policy and typed quota/error facts. No new service/store/dependency.

Initial83 focused new/legacy checks passed. Independent bounded review reproduced
newline-terminated SHA and subnormal no-focus display-ratio mismatches with existing
Learning validation; both were corrected with regression cases. Final targeted
check result is recorded in `contract-checks.txt`. These are executable metadata
and compatibility checks, not runtime image/audio acceptance.

Canonical main/source English, effective decisions and original-goal cases are
updated in place; unchanged R/A/G/V/INTENT obligations remain. Manifest binds
updated derivative hashes to the containing commit and preserves previous source
provenance. Audio's stale blanket provider status is corrected to source exists,
real image/audio/continuous acceptance unfinished.

## Delivery limits and next owners

The next actual user-facing candidate combines corrected quota messaging, fresh
full-screen context, focus without a second Ask, follow-up, movable controls and
captions. Windows source/build, actual Windows interaction, real subscription,
actual audio and actual Mac remain independently reported. Support has measured
only in-memory speech; its zh-CN recognizer performed poorly and no English
recognizer was available. Installed managed schema has audio/localAudio; account,
model, codec and real source coverage are untested. Do not claim audio unavailable
from SIWC or working from a schema/device list. Support's report informs the next
bounded existing-owner adapter, not a replacement architecture.

Lead releases the tested exact seam to active owners, reviews returned production
commits and prepares a distinct versioned package. QA then verifies only the changed
flow on coordinated generated content. Current user app/data/profile are preserved;
a package build or accepted mail is not a completed usable core experience.
