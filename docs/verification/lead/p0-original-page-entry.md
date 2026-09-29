# P0-07 original learning-page entry integration

The active outcome is the existing R02/R03/R08/R59 experience: start from the actual
learning page already in use, with necessary extension/permission confirmation and
no file import. This is a delivery-priority correction, not a new requirement.
The task board current section is authoritative for ownership; the document preview
remains a completed, bounded engineering fallback.

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
- The workflow and QA harness are integrated locally but deliberately not pushed
  until real Web resources are present, avoiding a known missing-input run.
  First actual hosted Apple build is pending the Web product commit. No existing
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

## Active original-page implementation

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

Next: Web delivers exact product resources; lead integrates/reviews and runs the
first combined Apple build; QA verifies actual current-page behavior independently.
Actual iPad invocation, Pencil/ink, audio, Notability import and AI interpretation
retain their existing gates. User preview ports 4173/8174, database
`lc_desktop_preview`, exported source/identities/token, and Paperclip are untouched.
