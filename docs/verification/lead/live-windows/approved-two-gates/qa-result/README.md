# Approved QA attempt: actual surface admission failure

Actual native delivery `handoff_65884c9d789f5f9ed28bc2ef59ff71d2` supplies
`6903beb2c0e2adeec0298a15ffe2bc329d8a097c`, integrated as `d007de2`.
The [original QA report](../../../../qa/p0-13-live-1755153/pre01-execution/README.md)
and raw results remain unchanged. No attempt was replayed during this review.

The process-only RemoteSigned approval worked: the script ran, C# metadata helper
compiled, and initial/pre-Edge native display getters passed for one primary
2560×1600 display, work area2560×1504 and DPI192. Four Edge/generated-page steps
passed. Step5 required all16 ownership points to belong to the generated surface;
14 did, while physical[20,1580] and[2540,1580] returned `explorer`. The cause/class
of that occlusion was not measured. CDP fullscreen was true, but was insufficient
evidence of native surface ownership.

The guard correctly stopped before product step6. Product launch, capture, both
drag actions and later Stop steps were **NOT_RUN**. Native script exit0 recorded
the abort; wrapper exit1 is the actual failed diagnostic result. No AI/model,
account, microphone or sound was used. The four-request real ledger remains0/4.
This is an environment/test-surface prerequisite, not a demonstrated product bug.

[Independent saved-evidence review](evidence-review.json) approves consistency:
14 artifact hashes, six source pins, three payloads and saved stage/runtime/entry
identities match. Lead repeats only byte/ledger checks on integrated main, also
matching14/6/3 and the four-success/one-failure sequence. Production is unchanged.
The fixed approved runner remains0f6d0b28…; original failure bytes are retained.
No native or broader application checks ran during this evidence integration.

QA explicitly released the display: only owned Edge75156 was asked to close,
with creation identity revalidated and no force; checked launch roots/ports ended.
No owned Electron existed. Foreign Edge23092 was not signalled. This does not
claim every Chromium child or every desktop application ended. Scratch/profile
and source evidence remain. The allocation is closed, not silently renewed.

## Same-owner next action

Lead sent `handoff_977a93a93d3c879e0d431416817712e5` to the same QA owner for
**offline preparation only** of the smallest own-window placement correction.
It preserves the fixed old candidate/results, all16 ownership points and native
freshness/one-display guards. Inspect the existing Raise/fullscreen path; no
assumed shell cause, ignored corners, cropping, global setting changes, Explorer
interference or foreign-window actions. Review that the generated background will
not obstruct actual product controls when later launched. Return a concrete
separately named candidate/delta and focused evidence, with no immediate replay,
provider/audio operation or display lease. Lead reviews before any fresh execution.

Web separately continues the already-approved source/parser/local-compile TTS
integration. Its product result and audible acceptance are not inferred here.
The human's old two permission decisions remain resolved; no repeat question or
restart of paused automation follows from this test-surface failure.
