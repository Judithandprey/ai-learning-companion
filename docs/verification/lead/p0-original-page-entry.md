# P0-07 original learning-page entry integration

The active outcome is the ONE existing core loop in [requirements §7.1](../../requirements.md#71-首次设置与每天使用):
continuous whole-visible-display pixels reaching real AI independently of ASK,
and a separate original-screen cross-app selector/pen gate, with the complete
NAV/WRITE/partial erase/undo/redo/ASK-return/editable-save/reopen interaction.
All work below is explicitly a dependency component until actual evidence passes
those gates. This is not a new requirement, file-import workflow or replacement
for iPad/audio/Notability acceptance. Task-board ownership remains authoritative.

## Native packaging and build integration

- iOS delivery `738866fbb29b354b56a5aee4940637c3cbe47011` is integrated normally.
  It adds the containing-app onboarding, settings entry and Apple packager script,
  using Web's committed `apps/safari-extension/webextension/` resources.
- The [independent source review](p0-safari-native-packaging-review.md) first found
  output/source overlap corrupting the input inventory. The owner repaired it;
  three independent narrow correction checks passed. Normal push published native
  integration `0faa253` to origin/main successfully; no force or history rewrite.
  On integrated main, all
  **11 committed directory-guard checks passed**, plus shell syntax checks.
  Their valid-output control uses explicitly fake Apple tools.
- Support `b7ed163c99145695ede76930bd94271974ecdb20` is integrated as `ba622b3`.
  `.github/workflows/ios-safari.yml` packages only the actual product resources,
  builds both unsigned SDKs, and preserves exact source, logs, app/appex archives
  and hashes. Missing product resources fail; no fixture substitution is allowed.
  [Independent workflow review](p0-safari-workflow-review.md) approved the exact
  integrated interface, failure behavior and provenance.
  Seven changed-path workflow logic cases passed on integrated main using labeled
  local stand-ins. They verify failure propagation and retained evidence, not
  Apple tooling or Swift compilation.
- The initial Safari workflow remains explicitly dispatchable; its automatic main
  trigger will be enabled with the actual Web resources. No dispatch is made
  against known missing inputs. First actual hosted Apple build is pending the
  Web product commit. This lets independent code/specification releases continue. No existing
  EnvProbe, ink Simulator or desktop recovery campaign was replayed.

## Independent browser harness

QA delivery `5eb825b` is integrated as `117f8c8`. Actual start/result message
`handoff_851eb3961b9ee53c8a86820b2bff1632` records the isolated Edge capability
probe and the [product test plan](../qa/p0-07-original-page-plan.md). The test-only
extension obtained a real PNG of a public learning page after DevTools invoked
its real action/activeTab path; before invocation capture was refused. This is
not acceptance of the product extension, a human toolbar click, Safari or iPad.
Lead did not rerun this successful probe. QA awaits the exact integrated product
candidate and its visible interaction steps.

## Browser capture component (not the continuous-screen AI gate)

Web's actual start message `handoff_a77e58fc89b0b080ac6a32c5cc0a61a1` and source
changes confirm implementation of toolbar entry, original-page selection, actual
PNG capture and an honest no-provider state. The committed output interface is
`webextension/`, built by `scripts/build-webextension.mjs [--check]`; earlier
`dist-extension` suggestions are superseded.

Lead's bounded pre-delivery source observation `handoff_ab288400ac6f34aa9474b4b0248fe023`
asks the same owner/task to finish capture invalidation through publication:
scroll/viewport/page changes, tab switching during capture and Stop/restart.
The delivered candidate must be reviewed against these cases before acceptance.
QA received the same bounded edge cases in
`handoff_9bb44ed9714da34ebed917a23c786788`, with no duplicate campaign.
No fixture response, DOM-only text, imported file or placeholder receipt can
stand for the actual visual region. Mark/capture/receipt time and media uncertainty
must remain explicit. No image has been sent to an AI provider by this slice.

## Dependencies and isolation

The user has been asked one concrete installation question: whether the existing
Apple account can access an existing team's Apps page in App Store Connect.
No response is recorded yet. [The installation finding](../support/sup-ios-01-safari-install-dependency.md)
separates this signing route from unsigned hosted builds. No enrollment, purchase,
new account, signing credential, provider activation or device acceptance is assumed.

Next: Web delivers its nearest checked real-resource checkpoint, then repairs
actual writing tools; iOS implements the 26.5 system broadcast component; Backend
implements typed original bytes; Learning materializes image context. Lead
integrates exact candidates and QA checks behavior at each truthful scope.
User preview ports 4173/8174, database `lc_desktop_preview`, exported source/
identities/token, and Paperclip remain untouched.

## Current core coordination and executable original-byte boundary

Actual native messages distinguish delivery from execution:

- iOS start `handoff_6c1692ecefed5ef1b81b113d1f4d6f1a`: merged `1cbc38f`,
  implementing ScreenObserver + BroadcastUpload, actual sample metadata/lifecycle
  and bounded frame retention. Main has not received/compiled this code yet.
- Backend start `handoff_48ce89eedc13a4ad4efe8c1f146e7df2`: merged `1cbc38f`,
  implementing `OriginalArtifacts` in the existing actor store with current guards,
  source/version binding and deletion fences. No extra archive or migration.
- Learning start `handoff_ad9c7eb89e17521bcef84daec527925c`: implementation of
  `materialize_image_evidence` over existing frame provenance and explicit trusted
  resolver; limited PNG decoding and no network/provider. Web PNG and iOS native
  PNG have been coordinated for this first path; unsupported encodings remain gaps.
- Support reply `handoff_b2b756d4aeaecdc0404c74a5135536a6` completed the narrow
  public-SDK overlay check. No supported arbitrary-other-native-app transparent
  interactive selector/Pencil layer was established. Lead independently read
  [Apple DTS's qualified technical guidance](https://developer.apple.com/forums/thread/797031).
  This is not a physical 26.5 test, and signing does not unlock such an overlay.
  ReplayKit's sample path remains a separate feasible implementation/verification
  task; it does not establish actual AI receipt or interactive overlay authority.
- QA `eee42a8` + `c2eeb87` integrated as `b1d9914` + `4b95210` revise its existing plan; two wording refinements are incorporated:
  no edit-triggered help must preserve independent R49 proactive teaching, and real
  provider input evidence cannot fabricate a provider-returned hash field.

Lead implemented isolated `packages/contracts/original_artifact` 0.2.2. It reuses
existing SourceRef/ArtifactReference, validates exact immutable bytes, bounded
canonical base64 and source/artifact receipts. **19 focused checks and root
TypeScript checks passed**; all unchanged legacy v1/capture/control files match.
A byte-committed receipt is never authentication, image decoding, editable-ink
codec validation, live screen, provider receipt or AI understanding. [Independent review](p0-original-artifact-review.md) approved the exact code,
with seven additional negative probes, nonmutation checks and generated-file verification. Backend internal persistence consumes the released baseline;
Reviewed source/content commit `4626833` and exact translation-provenance commit
`e5bb658` were ordinarily pushed to origin/main successfully.
HTTP and control-backed artifact activation remain gated by actual producer/source
bindings. No fixture-only source import is repurposed as real capture.

The product account connector/paid executor is explicitly disabled in current
code. The user was asked which existing official product API/connector they intend
to use, without requesting secret values or activating anything. This and the
existing Apple installation question are concrete dependencies; they do not stop
the independent source work above. Full core acceptance remains unverified.

## Integrated image-context component and CI repair

Learning delivery `handoff_d8c71fac410672a3ce2bc550e5cc3056`, exact `afd59a8`,
was integrated as `e410f7a` after a bounded independent review. Main ran
`.venv/bin/python -m pytest -q tests/evals/test_image_evidence.py`: **66 passed**.
The reviewer separately ran four targeted composition cases and three PNG probes:
consecutive IDAT accepted, nonconsecutive IDAT and a second zlib stream rejected.
Exact frame, immutable bytes, hash, dimensions, context provenance and current/
history restrictions are preserved. PNG-only support is explicit; JPEG, missing,
revoked, oversized and unobservable inputs stay gaps. This is synthetic image
component evidence, not real screen capture, provider input or either core gate.
Backend authorization through final use and actual capture ingress remain required.

Hosted [P0 run 36563876584](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36563876584)
failed at the Web examples blob pin after `06aa07f` added library examples.
Both Python matrix jobs had 1686 passes/19 retained xfails and Web 112/113;
this was a real failing CI gate, not a passed milestone. Comparing both Git blobs
confirmed all three original examples identical and only two library keys added.
The existing assertion now pins the actual released blob `81af5701ad7f6b61d0f38e46b1b71e374ab5fc62`.
The exact named example-pin test passed locally with Node 24 and
`--test-isolation=none --test --test-name-pattern='the examples read'`;
the assertion remains enforced. The full hosted result after publication is
recorded separately; a prior branch/file-level output is not substituted for it.

Exact core baseline `ae1f20b` was natively notified once to Backend
`handoff_80772a514f16d373ec591c775db57e09`, Learning
`handoff_daefdb0081277cd432681c4ab1c33af5`, iOS
`handoff_1ab1d8c418bdbe45d0aeb29900d9a30a`, Web
`handoff_5ea455982f6bd4786d6b79484eb958cd`, QA
`handoff_3fe3a4a002866cfc638c89b52a090624`, and Support
`handoff_ce378dbbe8630daf06a246aae4db853c`. These are delivery receipts;
actual reading/implementation is established by the separate owner replies above.

Published `5702bfd966562f77c2c44d20fd435e8c3dd1dd1c` passed the actual
[P0 matrix run 36567023402](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36567023402)
on Python 3.12 and 3.14 / Node 24.21.0. This closes the stale example-pin CI
failure for that exact code, not the remaining independent device/provider gates.
[Image review](image-materialization-review.md) retains the separate reviewer evidence.

Web `fb4450f` and iOS `46ee9c5` + `a6f2ae7` are actual delivered code, held
for [Web lifecycle defects](web-extension-entry-review.md) and
[native retention/pixel-layout defects](screen-observer-review.md), respectively.
The native correction deliveries requested are
`handoff_a99190076d395d79e1f4f7d5088a36a3` (Web) and
`handoff_3a4105240ecd4562d77a5bc32abc2588` (iOS). They are not fixed merely
because the requests were accepted. Web's previously assigned ink continuation
remains next after the safe capture repair; QA waits for that corrected candidate.

Support received one bounded unsigned ScreenObserver workflow preparation task
`handoff_587fbe6d026518ba4e48e772cef5ef91`, with explicit ownership of only the
new workflow and its usual evidence/probes. Lead narrowed the old ios-probe main
trigger to its actual EnvProbe/CompanionInk/check/harness source paths; unrelated
Safari/ScreenObserver deliveries must not rerun the accepted ink Simulator campaign.
Seven path-selection cases passed; existing build/test commands are unchanged.
PR workflow changes and explicit workflow_dispatch remain available. A workflow-only
main edit needs deliberate dispatch if it changes build behavior; this path-filter
edit itself requires no new Simulator acceptance run.

QA `df53334` → `cf72285` aligns its existing plan with the full canonical loop;
lead clarified that a region crop cannot replace full-display input for gate 1.
No further plan-only round was assigned. Existing actual provider and Apple
installation questions remain pending; no supplier, account or fallback was chosen.
