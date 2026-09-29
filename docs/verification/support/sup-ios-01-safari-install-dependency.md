# SUP-IOS-01 — original-Safari extension installation dependency

Checked 2026-09-29 UTC against assigned baseline
`d9fe67050f8d00414ec3479659ba8d17e7a16eba` and the actual granted lead route.

**Finding: the currently verified project access is sufficient for hosted unsigned
builds, but does not establish a way to install this Safari extension on the user's
M5 iPad / iPadOS 26.5 today.** A committed product extension/packaging handoff and
an existing authorized enrolled-team signing/distribution route are both missing
from the evidence available to Support. This is not a provider quota failure or
a requirement to buy a Mac. It does not cancel original-page R02/R03/R08/R59.

## Critical signing distinction

Apple's current [Safari-specific running instructions](https://developer.apple.com/documentation/safariservices/running-your-safari-web-extension)
state: “You must be a member of the Apple Developer Program to test on a device.”
The documented iOS flow installs a containing app with the embedded extension,
then the user enables it in Safari. A general free Personal Team app deployment
must not be presented as a confirmed exception to this extension requirement.

[Apple's distribution instructions](https://developer.apple.com/documentation/safariservices/distributing-your-safari-web-extension)
allow unsigned iOS extension testing in Simulator; physical-device testing requires
signing both the containing app and extension. They document signed Ad Hoc and
TestFlight beta distribution. Consequently:

| Route | Precise status for this task |
| --- | --- |
| Unsigned hosted `.app` / embedded `.appex` | Can prove compilation/package structure. Not a documented physical-iPad installation route. |
| Swift Playground plain-app execution | Does not establish Safari extension packaging, signing, installation or enabling. This distinction follows from the required containing-app/extension model. |
| Free Personal Team | Generic personal-device app development is documented, but Safari's specific enrolled-program requirement prevents promising this as the supported physical-extension route. No rejection was tested on this exact device. |
| Existing enrolled-team development/Ad Hoc/TestFlight | Documented route, presently unconfigured/unverified for this project. No evidence that the user lacks such an account elsewhere. |
| App Store Connect browser packager | A documented conditional no-Mac route, not confirmed existing access or authorization to activate/upload. |

The [general account overview](https://developer.apple.com/help/account/basics/about-your-developer-account)
describes free Personal Teams; it does not override the Safari-specific page.
[Ad Hoc provisioning](https://developer.apple.com/help/account/provisioning-profiles/create-an-ad-hoc-provisioning-profile/)
requires an App ID, distribution signing and registered devices. No certificate,
private key, profile or device registration was obtained or created here.

## Smallest next user action — existing access only

**Open [App Store Connect](https://appstoreconnect.apple.com/) with the existing
Apple account and report only whether Apps is accessible for an existing team.**
Do not send passwords, keys or tokens; do not enroll, purchase, create an app or
upload a build for this check. This resolves the first unknown: usable existing
team access. Access alone is not installation approval or proof of an appropriate
app/build-management role. Lead then resolves that exact remaining role/signing
dependency within existing authority; if no enrolled-team access exists, no
documented physical-extension delivery route is currently established in scope.

Apple's [App Store Connect packager](https://developer.apple.com/documentation/safariservices/packaging-and-distributing-safari-web-extensions-with-app-store-connect)
can package manifest/resources in a browser and deliver through TestFlight without
a personal Mac. It requires Developer Program membership, an app record and a
role able to manage the operation, and consumes included Xcode Cloud hours.
Nothing here establishes that this account/service is available or activates it.
Its documented inputs are WebExtension resources; preservation of any custom
native handler behavior would still need verification. The existing iOS-owned
project remains the native packaging boundary.

## Actual project checks and owner inputs

- Existing `gh` access reports repository `Judithandprey/ai-learning-companion`
  PUBLIC / ADMIN, published main `d9fe670…`. Repository secret names and variable
  names are both `[]`; no repository environments are returned. Only metadata was
  inspected, never values. This is no configured repository signing route, not a
  claim about every account or secret outside the project.
- Local PATH contains neither `xcodebuild` nor `xcrun`. The already executed hosted
  evidence at run `36528092111` establishes macOS 26.6.2 / Xcode 26.6 / SDK 26.5
  builds for a different candidate; no extension build or installation was run here.
- Assigned baseline has no committed WebExtension manifest/build script/native
  packaging project. Early input/scope notice was accepted as
  `handoff_edf44440a997060d9f7b35c986c17afa`.
- Lead refined the input in `handoff_324a415cadf5d4abe278f9dbf4db517c`: the complete
  committed resource directory is **`apps/safari-extension/webextension/`**
  (manifest, background, generated classic content script, icons). Generation/check
  is `node apps/safari-extension/scripts/build-webextension.mjs [--check]` using
  the project's pinned Node; merely packaging the committed resources needs no Node.
  This supersedes the earlier tentative `dist-extension` proposal. Native input is
  `apps/ios/SafariExtension/package.sh --webext <built-resource-dir> --out <out-dir> [--sdk iphonesimulator|iphoneos]`.
  Both owners' exact committed SHAs/final native output contract remain the named
  dependency. Consume actual product manifest/capture/selection resources, not
  only an iOS fixture. The proposed MV3 service worker/action/activeTab+scripting
  permissions do not establish runtime support or site acceptance.
- iOS still owns project generation, native host/handler, scheme and bundle IDs.
  Support's additional workflow scope is only `.github/workflows/ios-safari.yml`.
  No speculative workflow using uncommitted final paths was added. Lead must supply
  the owner's committed invocation/output contract before that bounded CI patch.

[Apple's packaging reference](https://developer.apple.com/documentation/safariservices/packaging-a-web-extension-for-safari)
now names `safari-web-extension-packager` (formerly `converter`). It accepts
extension resources and generates the containing app/extension project. The owner
script must check the actual runner tool availability; current documentation alone
does not prove which executable name exists in a fixed Xcode image.

The proposed CI handoff should retain exact Web/native source revisions, manifest,
packager warnings, actual Xcode/SDK, build logs/result bundle and containing app
with its embedded extension. Unsigned build/simulator evidence stays separate from
signed device installation, Safari enabling/site permission, original-page capture,
Pencil interaction and actual AI input. A44/R59/A46 remain unverified.

Search ended at the six linked Apple primary pages above, accessed 2026-09-29;
they do not display publication dates. No broad platform survey, credential/account
change, purchase, new service, model/quota change or unrelated project modification
occurred. Next owners: user supplies existing team-access fact; iOS/Web supply
committed package inputs through lead; Support is otherwise on demand.
