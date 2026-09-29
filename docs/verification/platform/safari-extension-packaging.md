# Safari web extension packaging for the primary iPad (native side)

Task: the lead's bounded P0-03/P0-11/P0-07 continuation, activated in
`handoff_6f672ef6d403967c109730b0a0f39038` at baseline `d9fe67050f8d00414ec3479659ba8d17e7a16eba`. The
goal is the actual entry point and capture on the original Safari page on the user's iPad. Web
builds the WebExtension (content and background UI, formula or figure region, `captureVisibleTab`,
source, time and selection, stale and stop states, AI unavailable). iOS owns the containing app and
the packaging that loads those resources on an iPad.

Requirements read at the baseline:
- R01–R03, R06–R10, R59;
- §7.1 (setup: install or enable the Safari extension, then return to the original course) and §7.2;
- A01–A03, A12, A44;
- the existing SURF-01 to SURF-06, DT-G1-07 and DT-G7-W01/W05 records.

This slice passes none of those acceptance cases. It is packaging only.

## Interface (for Support's hosted job and for Web)

```sh
node apps/safari-extension/scripts/build-webextension.mjs --check   # optional: Web's consistency check
apps/ios/SafariExtension/package.sh \
  --webext apps/safari-extension/webextension \
  --out "$RUNNER_TEMP/safari-ext" \
  --sdk iphonesimulator --sdk iphoneos
```

- `--webext DIR`: a built, loadable WebExtension with `manifest.json` at its root. The alias
  `--resources` is also accepted. The product folder is `apps/safari-extension/webextension/`, which
  Web commits complete (manifest, `background.js`, generated classic `content.js`, icons). No Node
  step is needed to package it (Web interface `handoff_a77e58fc`, adopted by the lead in
  `handoff_8460ed8d78aa1c4778d31cd229cc7095`). It replaces the earlier suggested `dist-extension`
  path. For checking the packaging plumbing alone, use
  `apps/ios/SafariExtension/fixture-webext`. It is a two-file manifest v3 extension, labelled "not
  the product", that shows a label on `https://example.com/*` pages. The final hosted compile must
  use Web's real resources.
- `--out DIR`: must be absent or empty, and fully separate from `--webext`. Neither may contain the
  other, whether directly, through `..` or through a symlink (compared case-insensitively). This is
  checked before anything is written, so the input is never modified and `webext.sha256` covers
  exactly the input. The script never deletes anything. The alias `--output` is also accepted.
- `--sdk`: can be repeated; the alias `--build` is also accepted. Each build is unsigned
  (`CODE_SIGNING_ALLOWED=NO`).
- The script runs on macOS with Xcode, for example the `macos-26` runner (Xcode 26.6, iOS 26.5
  SDK), in these steps:
  1. Record the SHA-256 of every input file (`OUT/webext.sha256`) and the toolchain
     (`OUT/toolchain.txt`).
  2. Run Apple's `xcrun safari-web-extension-packager` with `--ios-only --swift --copy-resources
     --no-open --no-prompt --force`, logging to `OUT/packager.log`, which includes manifest-key
     warnings.
  3. Replace four generated files, found by name, with `apps/ios/SafariExtension/native/`:
     `ViewController.swift`, `SafariWebExtensionHandler.swift`, the app's `Main.html` (in
     `Resources/Base.lproj/`) and `Style.css`. It stops if any is missing or duplicated. Each lookup
     is its own assignment, so a failed lookup stops the script. Run 36570494322 showed that an
     inline command substitution let the script continue after "expected exactly one Script.js …
     found: none".
  4. Check the generated bundle IDs against the expected pair (see below) and write
     `OUT/interface.json`. A mismatch stops the script before any build.
  5. Build each requested SDK, logging to `OUT/build-<sdk>.log`.
- `OUT/interface.json` is the authoritative interface. It holds the fields `xcodeproj`, `scheme`,
  `app_target`, `app_bundle_id`, `extension_target`, `extension_bundle_id`, `webext_sha256_file`,
  `signed: false`, and `builds[]` (`sdk`, `app`, `appex`). Callers read it instead of assuming the
  generated names.
- Names observed in run 36570494322 (Xcode 26.6, real Web resources at `b8ec18e`):
  - project `OUT/project/LearningCompanion/LearningCompanion.xcodeproj`;
  - scheme and app target `LearningCompanion`;
  - extension target `LearningCompanion Extension`;
  - app resources `LearningCompanion/Resources/Base.lproj/Main.html` and `Resources/Style.css`; the
    iOS template has no `Script.js`.
- **Bundle IDs.** That run failed at simulator embedding with "Embedded binary's bundle identifier is
  not prefixed with the parent app's bundle identifier". The IDs were extension
  `org.example.learningcompanion.Extension` and app `org.example.LearningCompanion`.
  - The packager builds the app ID from the identifier's prefix plus the app name, and the extension
    ID from the given identifier plus `.Extension`. Xcode's prefix check is case-sensitive.
  - `package.sh` therefore gives it exactly `<prefix>.LearningCompanion`. With the default prefix,
    the expected IDs are `org.example.LearningCompanion` (app) and
    `org.example.LearningCompanion.Extension` (extension).
  - `--bundle-prefix PREFIX` configures the prefix. The placeholder is `org.example`; the real prefix
    is user input U6.
  - The generated IDs are read back from the build settings and must equal this pair, with the
    extension starting with the app ID plus `.`. There is no global `PRODUCT_BUNDLE_IDENTIFIER`
    override, and compiler validation stays enabled.

  No team, account or signing identity is set.
- The project is regenerated on every run. No generated `.xcodeproj` is committed or hand-edited, and
  no dependency or framework is added.

## Native files

| File | Replaces | Behaviour |
| --- | --- | --- |
| `native/ViewController.swift` | the generated view controller | The containing app's single screen. On iPadOS 26.2+ it reads `SFSafariExtensionManager.stateOfExtension(withIdentifier:)` for the embedded extension (the ID is read from the built app) and refreshes when the app becomes active. One button calls `SFSafariSettings.openExtensionsSettings(forIdentifiers:)`. Below 26.2, or on error, it shows an honest fallback: open Settings › Apps › Safari › Extensions. It keeps the generated storyboard's `webView` outlet. |
| `native/Main.html`, `Style.css` (the page's small script is injected by `ViewController` as a `WKUserScript`, since the template has no `Script.js`) | the generated onboarding page | Shows the state (on, off, unknown, missing, settings error) and two steps: turn it on and allow your learning site, then go back to your page in Safari. It says the app opens no course page, sends nothing, and that AI help is not connected. There is no file picker and no in-app browser. |
| `native/SafariWebExtensionHandler.swift` | the generated handler, which echoes and logs messages | Completes any native request with no data and logs nothing. This slice has no native bridge: nothing is acknowledged as saved, received or answered. The v0.1 `selection.submit` bridge stays P0-08. |

API facts are from Apple DocC JSON read on 2026-09-29 (sha256 prefixes):
- `safari-web-extension-packager` options `a99d59c8`;
- `SFSafariExtensionManager.getStateOfExtension` / `stateOfExtension` (iOS/iPadOS 26.2) `47d6dc50`;
- `SFSafariSettings.openExtensionsSettings(forIdentifiers:)` (iOS/iPadOS 26.2; foreground only)
  `7e0bb0e7`.

## Resource constraints for Web (from existing research)

Web's adopted manifest shape:
- MV3 `action` with a title and no popup;
- `background.service_worker: background.js`;
- `permissions: activeTab, scripting`;
- no `host_permissions`, static `content_scripts`, `web_accessible_resources` or `nativeMessaging`;
- the action injects into the top frame of the current http(s) page, and a second action stops.

Whether Safari on the target runs the service worker is for target verification. If the real
packager rejects anything, its exact output goes to Web through the lead.

- The background must be an MV3 `service_worker`, or an MV2 `persistent: false` page (D1-06).
- `captureVisibleTab` defaults to JPEG, so request `{format: "png"}`. It needs `activeTab` or host
  permission (D1-13).
- `tabs` needs host permission. There are no `contextMenus`, `webRequest` or `windows.create` on iOS
  (D1-12).
- Do not declare `nativeMessaging` in this slice.
- Provide icons (48/96/128).
- Content scripts run only after the user grants site access (D1-04). Extensions are enabled per
  Safari profile (D1-M02).

## Evidence levels

| Level | State |
| --- | --- |
| Source and script written | Yes (this commit) |
| Script logic, Linux smoke run with stubbed `xcrun`/`xcodebuild` (not committed) | Passed: file replacement by name, `interface.json`, refusal of a non-empty output, a missing manifest and a bad SDK. It shows nothing about Apple's real packager output. |
| Output/input separation (`tests/package_guard_test.sh`, committed, stubbed Apple tools, Linux or macOS) | 11/11 PASS. An output equal to the input, nested either way, reached through a symlink or `..` is rejected with the input byte-identical, and a separate output succeeds with a hash list of exactly the input files. Against the pre-fix script 8/11 fail. This fixes the lead's independent review of `b750d00`, which found output written inside the input. |
| Real packager run and hosted compile | **Yes, unsigned.** [Run 36572647629](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36572647629) (`iOS Safari extension build`) succeeded at main `d553e5b`, which integrates the correction `d5fb0b0` as `9cdf115`, using Web's real `apps/safari-extension/webextension`. It ran on Xcode 26.6 with the iOS 26.5 SDKs, for both `iphoneos` and `iphonesimulator`, each app with its embedded extension. The retained `interface.json` records app `org.example.LearningCompanion`, extension `org.example.LearningCompanion.Extension`, `signed: false`, and both SDKs; `packager.log` reports no unsupported manifest keys. The earlier failure (run 36570494322) was run on real Apple tools *before* the fix. This run is its real-toolchain confirmation. |
| Simulator: extension enabled in Safari and content script on a page | Not run. Unsigned app extensions in Simulator Safari are unverified; if they do not load, the next step is ad-hoc signing for the simulator lane. |
| Installed on the iPad; original-page pixels, touch, navigation and stop | Not run |

## The one remaining physical-install action

**A signed build under an enrolled Apple Developer Program team.** Apple's Safari documentation
says Developer Program membership is required to test a Safari web extension on a device. Without it,
only the Simulator is available (D7-09). A device install needs the containing app and the extension
both signed (D1-01).

Support's check ([`sup-ios-01-safari-install-dependency.md`](../support/sup-ios-01-safari-install-dependency.md),
`c1d9960`) sets the first user step. The user opens App Store Connect with their existing Apple account
and reports only whether Apps is accessible for an existing team. They send no credentials and
enroll, buy, create and upload nothing.

Whether an enrolled team already exists is unknown, and the question to the user is pending. No
enrolment decision is being asked for. Support then resolves the signing and distribution route, for example TestFlight.
No Mac is required for that route. Nothing has been enrolled, bought or signed.

## Not covered

- Web's extension behaviour: region selection, capture, stale and stop states.
- Actual iPad pixels, touch and navigation.
- The native bridge, AI help, audio, Notability.
- R59/A44 original-screen annotation, which also needs the composite actually received by the AI
  (P0-11 plan section 5).

## First real run and correction (run 36570494322)

The lead's integrated main `b8ec18e`, with Web's reviewed resources, ran the packaging workflow once. It
failed in simulator embedding: the extension ID `org.example.learningcompanion.Extension` is not
prefixed by the app ID `org.example.LearningCompanion` (log line ~1083).

The same log also showed:
- the guard defect described in step 3;
- the template's actual resources: `Base.lproj/Main.html` and `Style.css`, with no `Script.js`.

The correction covers the bundle-ID pair and its pre-build check, the assignment-based lookups, and
native injection of the page script. `tests/package_guard_test.sh` now mirrors the observed layout
and ID derivation in its stub packager. It checks, with 17/17 PASS on Linux:
- the default and a configured prefix give matching IDs;
- a mismatched pair stops the script before any build;
- a missing template file stops the script;
- an invalid prefix is rejected;
- the native files replace the generated ones, including `Base.lproj/Main.html`.

Against the previous script, 7 of these checks fail. The real Apple rerun now succeeded at
`d553e5b` / run `36572647629` for both unsigned SDKs; all 14 retained hashes and the
actual archived bundle IDs were checked. This closes the compiler/packaging defect,
not native page behavior, Safari operation or physical-device acceptance.
