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
- QA `eee42a8` revises its existing plan; two wording refinements are requested:
  no edit-triggered help must preserve independent R49 proactive teaching, and real
  provider input evidence cannot fabricate a provider-returned hash field.

Lead implemented isolated `packages/contracts/original_artifact` 0.2.2. It reuses
existing SourceRef/ArtifactReference, validates exact immutable bytes, bounded
canonical base64 and source/artifact receipts. **19 focused checks and root
TypeScript checks passed**; all unchanged legacy v1/capture/control files match.
A byte-committed receipt is never authentication, image decoding, editable-ink
codec validation, live screen, provider receipt or AI understanding. [Independent review](p0-original-artifact-review.md) approved the exact code,
with seven additional negative probes, nonmutation checks and generated-file verification. Backend internal persistence consumes the released baseline;
HTTP and control-backed artifact activation remain gated by actual producer/source
bindings. No fixture-only source import is repurposed as real capture.

The product account connector/paid executor is explicitly disabled in current
code. The user was asked which existing official product API/connector they intend
to use, without requesting secret values or activating anything. This and the
existing Apple installation question are concrete dependencies; they do not stop
the independent source work above. Full core acceptance remains unverified.
