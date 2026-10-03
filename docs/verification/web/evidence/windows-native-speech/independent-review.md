# Independent bounded Windows TTS integration review

Review date: 2026-10-02. Reviewer: independent read-only child of the Web owner.
Worktree: `/home/agentsdock/Projects/learning-companion/wt-web`.
Base: `095e25936c2f75d900a4c6e6b106530ac75ae93c`; the reviewed integration was an uncommitted owned diff, not an integrated release commit.
Human source-adoption authority was read at `69c06ea:docs/verification/lead/live-windows/approved-two-gates/README.md`, together with its linked native-TTS source review. Applied project PONYTAIL LITE, role/ownership guidance, canonical affected §7.3, R09/R57/R60, A05/A06/A14/A47–49 and AUDIO-08/09/14/15. Shared contracts and the existing renderer/preload speech boundary were not changed by this review.

## Limited result

No remaining blocking findings were identified in the assigned changed flow after the targeted loader correction. This is source review and portable stand-in verification only. It does not establish actual audible playback, perceptual rate, endpoint routing, microphone/ASR, visible device captions, interruption latency or full audio/screen acceptance. No future custom Melly voice or Chinese/English timbre consistency is claimed.

The reviewed main process derives each piece from its own current response. Playback requires its verified response/history identity, current request and live session, allowed assistance, confirmed shown state, spoken request, Talk on and unmuted state. Rechecks after an asynchronous piece reject obsolete authority. Stop/new requests/selection loss/AI-session end and app quit prevent later pieces; a late completion cannot advance another reading. Audible completed prefixes are persisted separately from shown/generated text and retained across failed rereads/storage recovery. Memory-only providers do not create played-help evidence.

The system provider remains lazy and replaceable behind the existing Voice boundary. Language switching waits for observed direct-child disposal; unobserved exit fails closed. The native adapter uses a fixed main-owned helper path, trusted sink/culture and shell-free direct spawn; text travels as JSON stdin. The parser repair contains null/non-object replies. Packaging requires an explicit verified local build, copies the checked bytes and omits/removes a native helper for ordinary source-only builds.

## Original receipt finding and disposition

Original location: `apps/windows/src/main/native-speech.ts:78` before the revision (source hash `069bdea77954d55ba5d7b71edd82de1961e91de861304252bd9ac2d59b5f8d21`). The loader accepted a truncated successful-looking receipt with source/executable hashes but no compiler/reference metadata. `scripts/build-native.mjs:27–34` rejected such metadata during packaging, so runtime and packaging had inconsistent receipt requirements. The original portable bundle test at `tests/native-speech.test.ts:115–119` demonstrated that synthetic executable bytes plus that self-declared truncated receipt enabled the lazy provider; no executable ran.

Severity assessment: nonblocking provenance-consistency finding within the local bundle contract. No renderer helper-path exposure or independent protection against an attacker able to rewrite the whole application bundle was asserted. Minimum repair: apply the packaging compiler/reference path and hash-shape checks to the runtime receipt and reject truncated receipts.

The owner applied that repair at current `native-speech.ts:79–85`. An additional targeted correction validates the fixed source and executable bytes against the original private parsed receipt before every actual child spawn (`native-speech.ts:87–95`), including a same-language adapter restart after the helper's normal idle exit. It does not reread a rewritten receipt to accept a new executable identity. The reviewer specifically requested guarding `createNativeVoice.spawnProcess`, since checking only `createSystemVoice.make` would miss that internal restart.

Resolution verified by source inspection and the targeted portable test: changed executable bytes between lazy loader construction and first say cause false with zero fake-spawn calls; changed bytes after an observed same-language idle close cause false without a second spawn. Missing/invalid compiler/reference metadata is rejected. No remaining blocker from this finding.

## Observed portable checks and raw-log status

Original command:

```sh
/home/agentsdock/.local/share/paperclip-pilot-runtime/node-v24.21.0-linux-x64/bin/node --permission --allow-fs-read='*' --allow-fs-write=/tmp --test --test-isolation=none apps/windows/tests/native-speech.test.ts apps/windows/tests/native-voice.test.ts apps/windows/tests/overlay-surfaces.test.ts
```

Observed tool output: **91 tests, 91 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo**, exit 0, reported duration 3087.4949 ms. This includes nested cases. The original suite preceded the targeted loader correction and overlapped the owner's own verification. Raw stdout/stderr was returned through tool outputs but was **not saved to a filesystem log**; there is no retained original raw execution-log path.

After the owner signaled the loader correction, only this affected suite was rerun:

```sh
/home/agentsdock/.local/share/paperclip-pilot-runtime/node-v24.21.0-linux-x64/bin/node --permission --allow-fs-read='*' --allow-fs-write=/tmp --test --test-isolation=none apps/windows/tests/native-speech.test.ts
```

Observed tool output: **6 tests, 6 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo**, exit 0, reported duration 52.60043 ms. These 6 overlap the original suite and are **not additive** to 91. Raw output was **not saved to a filesystem log**; there is no retained original raw execution-log path. Both invocations lacked Node subprocess permission and used only synthetic EventEmitter/stream children; temporary test fixtures were under `/tmp`.

`git diff --check` also completed successfully during the initial review. No passed checks were rerun merely to create this report. No Windows compiler/helper, memory runner, staging, device/audio/microphone/capture/app/account/provider operation ran in this review, and no project files or Git metadata were edited.

## Source hashes

SHA-256 below was captured while preserving this report after the final targeted review. These identify current owned bytes, not a signed build or retained execution snapshot. The original adapter/native-source hashes were also independently captured during the initial review; the original loader hash is recorded above. Original 91-test output was not tied to a filesystem snapshot of every test file, so this table does not retroactively assert such a snapshot.

| File | SHA-256 |
| --- | --- |
| `apps/windows/native/NativeSpeech.cs` | `c4c1f127a85ff1c871ce98895d51584af7936bbf23f3a35c7418002f201cbbfd` |
| `apps/windows/src/main/native-voice.mjs` | `e3f80d60a03d8dd054723c7514ebd1b29de9a9189c7285bf9c964871985ec587` |
| `apps/windows/src/main/native-speech.ts` | `d63a557e93d60e3f2ecccbf4b4f0539c98ecdb1ae2e33ad7b09e4bc846d3101d` |
| `apps/windows/src/main/native-voice.d.mts` | `7215383c662bb808ba62e4ac572c79a82a376af052bcf9ff3eacbb88c3535c95` |
| `apps/windows/src/main/main.ts` | `cbf3ede04376fe78983215f69de0cdc33b0afcb0db7d49678445916d6e729e60` |
| `apps/windows/scripts/build-native.mjs` | `feedd10f4e01f008371afda0c4a125e91d270c361292689da8104da459b9a308` |
| `apps/windows/scripts/check-native-memory.mjs` | `8b1c039b7d89d45b9a2631964a1b9239310dd5814fd72d61322d8435e76ee11b` |
| `apps/windows/scripts/copy-static.mjs` | `f006689c6cb4efb049824435efa2d7d2c359b4f8a21e0888544a964742b9824a` |
| `apps/windows/scripts/stage.mjs` | `c263a227473525c5688002bdd287a0bc77b42f459f5471bb9d089ee4b66d98bb` |
| `apps/windows/scripts/windows-stage.mjs` | `c065f419dd26940445ffbbcd02b2e1c2c8885deaf6b7b199157562c9f2d5ea9a` |
| `apps/windows/tests/native-speech.test.ts` | `4c9f834b0044e754eb1e8a8cc7f4849af7292532f27ca840597f998206c364ad` |
| `apps/windows/tests/native-voice.test.ts` | `6d2dff20f93365fc61f0361dac50a08daaca3b37e5fd1343b797c226b89375f6` |
| `apps/windows/tests/overlay-surfaces.test.ts` | `07ad60f05d964d40fd3b6b4571c2b17d1b3a7255b44d572bcdb4edacf0f4819a` |

Next owner: Web incorporates this bounded review into its delivery evidence; Lead retains final integration and QA retains actual authorized device acceptance. Parent-reported compilation/memory outcomes were not independently rerun or promoted to device evidence here.
