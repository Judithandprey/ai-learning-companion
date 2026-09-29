# Safari packaging correction review

Decision: **APPROVE integration of d5fb0b00888d05249c538bb996f69d028c6f523d** for the next real unsigned Apple build. No blocking defect found in this bounded correction. Review baseline: main b3c6a2160362a54cb44c9e6a338ec983110419c3; delivery merge head a567ff4d612e45032955f033ed34733d04449809. All seven changed files have identical bytes at the corrective commit's parent and the assigned main baseline.

Scope: exact correction under apps/ios/SafariExtension, its README/verification notes, and the consumer .github/workflows/ios-safari.yml. Applied project PONYTAIL LITE/simple-design policy. This is packaging review, not original-screen/AI, device, settings-operation, signing or installation acceptance.

## Findings

- The supplied hosted failure log records the missing Script.js lookup at line 15 and the embedded bundle prefix error at line 1083. The correction addresses both observed causes without weakening compiler validation.
- package.sh:64–66/94–98 constructs the case-preserving app identifier from a validated, quoted prefix plus LearningCompanion, and expects that exact app identifier plus .Extension. Lines 127–159 read actual generated target settings and reject either unexpected ID before writing interface.json or starting builds. No global PRODUCT_BUNDLE_IDENTIFIER override or signing activation is introduced. The generated IDs remain a fail-closed assertion until Apple's actual packager runs again.
- package.sh:117–125 performs each required generated-file lookup in an assignment before copying. The nonzero lookup now terminates the parent script under set -e, instead of being swallowed as an inline cp argument. Main.html/Style.css searches stay inside the app directory, and no Script.js is assumed. Existing source/output separation remains intact.
- native/ViewController.swift:16–33 registers the former page script as a main-frame WKUserScript at document end before loading local Main.html. The matching open-settings button exists, show(state) remains available to the existing didFinish refresh, and the script retains the same state/button behavior. The local page introduces no remote navigation or data transfer; native bridge behavior is untouched. Real WebKit and Swift behavior still requires the actual platform run.
- The workflow invokes the same interface with the default placeholder prefix, requests simulator then device with CODE_SIGNING_ALLOWED=NO, and retains package failure logs/generated source through always() collection. Correction does not change workflow permissions, service access or credential handling.

## Independent evidence

Exact source extracted with git archive d5fb0b0 apps/ios/SafariExtension to /tmp/safari-packaging-fix-review-q0gl0fq7. No repository files modified.

Commands executed:

```sh
bash -n /tmp/safari-packaging-fix-review-q0gl0fq7/apps/ios/SafariExtension/package.sh /tmp/safari-packaging-fix-review-q0gl0fq7/apps/ios/SafariExtension/tests/package_guard_test.sh
bash /tmp/safari-packaging-fix-review-q0gl0fq7/apps/ios/SafariExtension/tests/package_guard_test.sh
git diff --check d5fb0b0^ d5fb0b0
```

Results: syntax exit 0; all 17 focused guard checks PASS; whitespace check exit 0. Output retained in /tmp/safari-packaging-fix-review-q0gl0fq7/guards.log and syntax.log. The guards independently exercised source/output protection, exact native overlays with no Script.js, default/custom identifiers, fail-before-build on mismatched generated IDs, missing required resources and invalid prefix. Stubs mirror the observed first-run layout; their success does not establish Apple's identifier derivation or successful compilation.

Next owner/action: lead integrates the correction and observes the normal hosted Apple compile for both requested SDKs, retaining any new real failure. No CI dispatch, signing, cloud call, browser, service or DB operation performed in this review. The owner's prior baseline-failure count was not independently replayed. Minor existing README wording that the packager has not run is stale after the recorded failed run; it does not affect integration and can be reconciled with the new hosted result.
