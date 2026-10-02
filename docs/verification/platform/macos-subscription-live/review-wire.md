# Independent bounded live/1 wire and session review

Reviewed on 2026-10-02 at HEAD `5d8d12128721f4eb38d48e526738c34c667cdf53`, with the retained dirty macOS migration preserved. This is a source review of `LiveWire.swift`, `LiveSession.swift`, and `LiveFrame.swift`, their callers and relevant tests. It does not compile or execute the native client, launch a connector or provider, use an account/device, or establish real-AI/macOS acceptance. No production file was changed by this review.

Read AGENTS/TEAM, workflow, native role, current task and decisions; affected original/English §3.8/7.1–7.3/7.7; process coverage/disclosure and V-SourceTimeRelations; PONYTAIL LITE; ADR 0004; released schema/validator/focus helper; Backend `chatgpt_live`; and Learning `live_session`. All eight current source/English hashes match the translation manifest. The released Result's `latency_ms` maximum is `9007199254740991`.

## Findings

### P2: oversized latency can terminate the app during malformed-result handling

`LiveWire.swift:591–598` admits every finite nonnegative `NSNumber`, then converts its rounded value to `Int`. An otherwise matching result with `latency_ms: 1e100` passes these predicates but cannot be represented as `Int`; the conversion traps instead of rejecting the result and ending the connector/session safely. Values above the released maximum but within `Int` are also accepted despite the closed contract.

Reproduction: make a matching successful result using `FakeLiveConnector.result` and replace only `latency_ms` with `1e100`, then deliver it to a waiting focus request. Expected: `LiveAnswer.parse` returns nil and the existing unbound-result path fences further inference. Source-derived actual: integer conversion traps. This reproduction has **not** been executed on a Swift runtime in this review.

Coverage: `testLiveEnvelopePolicyAndStrictAnswers` checks envelopes/policy/control, while result fixtures use latency `1234`; the malformed-answer controls at `LiveLinkTests.swift:1628–1669` change other fields but omit numeric overflow. Add boundary controls for the released maximum, maximum plus one, huge finite number, negative/nonfinite/bool, and a valid fractional latency. The parent owner is correcting this finding; a correction/test pass is not attested here.

### P2: bounded context can silently hide omitted evidence

`LiveSession.swift:310–341` correctly retains whole original history entries locally, but two omission paths are not communicated to the next model request:

1. At `325–334`, any retained row on a frame suppresses an omission marker for every other omitted row on that same frame. Reproduction: `answered` records a short user question and a permitted 4,001-character assistant answer on frame 1; call `context(for: 2)`. The assistant answer is omitted because each wire-history entry is limited to 4,000 characters, the user row is retained, and `sentFrames` removes frame 1 from `omitted`, leaving no notice that the prior answer was left out. This is reachable through an ordinary text follow-up; successful Result text may be up to 32,000 characters. The full original answer remains stored, but the next request has no behavior-specific omission evidence.
2. At `340–341`, `suffix` caps gap runs without declaring the discarded coverage. Reproduction: add 65 nonmergeable original gap runs (for example, alternating `.coalesced` and `.backpressure` on frames 1 through 65), then call `context(for: 66)`. Only the last 64 runs remain in the request, with no marker covering the omitted earlier gap. Local `session.gaps` is retained in memory, but session-end records include counts rather than its complete gap list (`LiveLink.swift:610–620`).

ADR 0004 requires omitted context to be explicitly noted; main §7.1 and process coverage require unknown intervals to remain explicit. These are bounded-context fidelity defects, not a request to expand the wire or implement full memory. Use the existing history/gap shapes for truthful omission evidence, or reject a projection that cannot fit without misrepresenting coverage. Preserve the originals.

Coverage: `testLiveContextIsWholeEntriesWithinBoundsAndStatedGaps` (`LiveLinkTests.swift:629–690`) checks 30 whole entries and a standalone overlong observation. It does not cover a partially omitted same-frame user/assistant pair, more than 64 gap runs, or omission of gap runs alongside omitted history. Source-derived reproductions above were not executed as native tests here.

## Checked without a new finding

Within this slice, local reserve/interval rules agree with the released bounded policy; observation-only turns remain unpresentable; quota buckets and nullable credit/reached facts remain distinct, and quota percentages/credits do not locally authorize or veto requests. Full-image request construction retains separate focus and complete response provenance. Same-frame focus reuse and historical-focus references preserve their original image/context binding; no separate sequence-regression defect was found. Raw frames and editable ink are read/frozen and retained separately from derived composites using existing storage.

Voice/system audio, spoken captions, persistent/clamped panel position, teaching/exploration scope, content-anchored ink, long-term context, Notability import and interactive Mac acceptance remain recorded unfinished work. They were not reclassified as regressions in this assigned source slice. The separate lifecycle reviewer owns LiveLink queue/Stop findings.

Reviewed source SHA-256:

| File | SHA-256 |
| --- | --- |
| LiveWire.swift | `898a634451f85ecc7876b8f5e4cd71a2a9e35f1e6f37b299e5cdec639aa21081` |
| LiveSession.swift | `6e3bfa339536b265ecf0d29fe3adcea8d8ad09198d90b36f133122a0b859dc7c` |
| LiveFrame.swift | `61fc58591326ef962fcc43249bb4fb01ff988c226f62d07eef505653074f1a22` |
| LiveLinkTests.swift | `6354c9e96c360bf04a93a232d81519b2777583355bcab7e4afc47288b01b1d61` |

Next owner: the native parent integrates bounded corrections and focused portable tests; Lead retains exact-source hosted macOS build/integration and the separately coordinated interactive-device acceptance.

## Context correction under the parent's bounded follow-up

Implemented only `LiveSession.context(for:extra:)` and added cases inside its existing `testLiveContextIsWholeEntriesWithinBoundsAndStatedGaps`. Ordinary whole-entry omissions continue to use their existing budget gaps. A single frame-less, `not_presented` history entry now explicitly identifies partial/current-frame dialogue omissions and older gap ranges omitted by the released cap; its counts and bounding frame span are labeled metadata, not observations or a claim that every intervening frame is missing. If needed, whole oldest projected entries make room for that notice, while the original session history/gaps and explicitly supplied historical focus remain intact. The projection retains the 24-entry/64-gap wire limits and existing 24,000-character headroom.

Added deterministic checks for a 4,001-character answer with its same-frame user question at both the same and a later request sequence; 65 nonmergeable gaps; combined current-frame omission with overflowing gaps; and notice-plus-explicit-focus under occupied history/character limits. These also assert preservation of original records and valid `LiveTurn.problem` projections. No independent Swift/subprocess run was started for this correction; the parent owns the final module/tests/checker/probe run. This section records implemented source and test coverage, not a compilation or acceptance pass.
