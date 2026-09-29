# Safari native packaging: bounded independent review

## Current disposition

Approved `738866fbb29b354b56a5aee4940637c3cbe47011` after the narrow correction retest below. The initial hold is retained as historical defect evidence.

## Initial disposition (superseded)

**Hold exact delivery `b750d0083206d68fa0f30edfbc58339d478c3fcb` for one small output/source guard fix (SN-PKG-01 below).** The native implementation otherwise has no blocker found in this review. Do not turn this into a new platform investigation or older matrix/ink campaign.

Baseline: `a7654d766d3b81b462bba1573e15f078c0287ae1`. Initially assigned delivery `9b8a04b8966630fff50e041bce331e47ba432135` was superseded during review by `b750d008`. All five native files are byte-identical between those deliveries. Later changes correct resource/build-script references and the existing Apple-team dependency. Final delivery is a descendant of the assigned main baseline; its diff contains only 12 owned files, 489 inserted lines. No main/worktree source files were modified by the reviewer.

Candidate files copied from exact final Git objects to `/tmp/safari-native-packaging-review-l_0sml08`. Metadata and complete path list: `/tmp/safari-native-packaging-review-metadata.json`. Scope was `apps/ios/SafariExtension/**`, accompanying platform report, and the small `apps/ios/README.md` pointer. Support's workflow and Web implementation remain their owners' work.

## SN-PKG-01 — reject an output directory inside the input resources before writing

**Severity: P2; integration blocker for this packaging script.** `apps/ios/SafariExtension/package.sh:58–67` checks only that the output is absent/empty, then creates it and starts hashing every input file. It accepts `--webext /tmp/resources --out /tmp/resources/generated`.

An independent narrow probe used copied fixture inputs and a fake packager that deliberately exits 17 without generating any Apple project. Before that stub is reached, the script has already added these files under the input:

- `generated/webext.sha256`
- `generated/toolchain.txt`
- `generated/packager.log`

The purported exact-input hash list includes `./generated/webext.sha256` itself. It is therefore not a valid immutable inventory of the supplied WebExtension. The later requested project path is also inside the resource tree passed to `--copy-resources`; actual Apple behavior for that overlap was deliberately not inferred or run. Original fixture bytes were unchanged, but the input tree was contaminated before the tool call. This is an ordinary accepted argument combination, not a required race or a malicious tool implementation.

**Minimal fix:** resolve the existing input and prospective output using physical/canonical paths before `mkdir`, hashing, logs, or Apple execution. Reject overlapping input/output trees, including overlap through symlink aliases, with a clear error. Preserve the existing absent/empty output rule and legitimate unrelated source/output paths, including paths with spaces. A short standard-library path check is sufficient; no packaging redesign is needed. A same-path or ancestor output already fails in normal nonempty cases, but explicitly validating the relationship makes the actual contract clear.

Retest only direct nested output, a symlink alias into the input, and the existing safe unrelated-output control. Confirm rejected cases leave the source inventory unchanged and do not invoke Apple tools. The existing runnable probe preserves the original failure before any repair.

## Reviewed behavior and limits

- Shell variables and subprocess arguments are quoted; embedded Python uses argument arrays rather than shell evaluation. SDK selection is constrained to `iphoneos`/`iphonesimulator`. Nonempty output is refused without deletion. `set -euo pipefail` propagates packager/build failures through `tee`; failure does not append a successful build to `interface.json`.
- Replacement of the five generated files requires one matching file for each expected name. Onboarding page files are searched beside the app's generated controller rather than across extension resources. Missing or duplicated expected generated names fail closed. The Apple template layout, outlet name, options and generated target/scheme assumptions still need the first actual hosted run.
- `interface.json` obtains target identifiers and a scheme via `xcodebuild`; unsigned builds use `CODE_SIGNING_ALLOWED=NO`, and `.app` plus embedded `.appex` presence is checked before recording a build. Stub success proves this orchestration against the stub shape only. It proves neither Swift compilation, product correctness, signing nor a loadable Safari extension. Actual built-product/resource provenance should use Support's existing route and actual artifacts.
- The containing app loads bundled local HTML, uses a local CSP, has one settings button and a settings/status explanation. It has no course browser, file picker, provider, account operation, source upload, or capture bridge. It directs the learner back to Safari. JavaScript passed from Swift uses a closed set of static state strings, not external content. The script message accepts only the settings action; no save or receive ACK is manufactured.
- The native handler completes requests with no returned data and does not log incoming contents. The fixture is explicitly labeled as non-product and restricted to example.com. These paths do not establish receipt of page pixels or content by AI.
- The app refreshes state after its local page loads and on app activation; lower OS versions and state/settings errors display unknown/error states. Async API availability/actor compilation, real foreground settings behavior and generated storyboard compatibility have not been tested here. The retained WK script handler and asynchronous status refreshes are limited to this single containing-app screen; they do not authorize capture or durable save. This review found no consequential lifecycle/security defect in the bounded path.
- Final usage/report points to committed `apps/safari-extension/webextension/` and the optional `node apps/safari-extension/scripts/build-webextension.mjs --check`. The obsolete `dist-extension`/`build-extension.mjs` commands are corrected. The generic `--webext` interface remains suitable for Web's final resources. Do not substitute the fixture for the product build.
- Final report no longer presumes the user must enroll or buy a membership. It records the pending existing-team/App Store Connect access question and delegates signing/distribution resolution to Support. This review performs no account operation and independently establishes no Apple entitlement or distribution capability.

## Narrow checks actually executed

1. `bash -n` for final `package.sh`: passed.
2. `git diff a7654d7 b750d00 --check`: passed.
3. Five expected local stub/control cases: passed. They cover generation with two fake SDK builds and paths containing spaces, native-file replacement and interface fields, unchanged source bytes/tree on that safe route, nonempty-output refusal, invalid-SDK refusal before output creation, missing-manifest refusal before output creation, and propagation of an intentional packager failure without `interface.json` success.
4. One negative source/output overlap probe: reproduced SN-PKG-01 above. Its source fixture bytes remain exact, but the input inventory changes and the inventory file hashes itself.

The Python probe groups normal generation/build/replacement assertions into one control case. It reports five expected safety/control cases plus one reproduced defect, not six successful acceptance tests. Fake tools are visibly labeled as stubs in retained output and were located only under `/tmp`.

Runnable evidence:

```sh
python3 /tmp/safari-native-packaging-probe.py
```

Probe source: `/tmp/safari-native-packaging-probe.py`. Full commands, return codes/stdout/stderr, self-referential inventory and result details: `/tmp/safari-native-packaging-probe-results.json`. First run directory: `/tmp/safari-packaging-probe-83upl10c`; running again creates another isolated directory and refreshes the result JSON. Candidate extraction metadata stays separate and immutable unless deliberately replaced.

## Requirement fit and integration guidance

Applied TEAM/AGENTS, lead/iOS roles, workflow proportional-check policy and PONYTAIL LITE. Refreshed current decisions and relevant full original/English clauses: R01–R03/R06–R10/R59; §7.1–7.2; A01–A03/A12/A44–A46; detailed live-annotation/platform boundaries; V-DailyResume and V-SourceTimeRelations; audio addendum's actual-evidence/current-target constraints. All four source/English manifest hash pairs match. This packaging step preserves the original Safari goal and introduces no alternative course surface, but completes none of those product acceptance cases.

Owner next action is the small path-overlap guard, followed by the narrow retest. Lead can then normally integrate the owned delta; no force/reset, cross-owner editing, whole historical test campaigns or new approval interview is needed. Web supplies its final committed resources; Support runs the existing bounded hosted packaging/build workflow against the integrated commit, retains exact toolchain/packager/build logs and the app/appex products, and reports any actual Apple interface/compile defect to the owning role. Product resource build and real entry/capture verification remain pending.

No macOS/Xcode, Simulator, iPad, provider, DB, browser, user-preview, Paperclip, enrollment, signing or external account access was performed. Apple API facts in the owner report are owner-attributed research, not independently revalidated platform results from this Linux review. No broad matrices or old 187/273-case campaigns were rerun.

## Correction retest — `738866f` — latest disposition

**Approve exact correction `738866fbb29b354b56a5aee4940637c3cbe47011` and its reviewed `b750d008` packaging baseline for normal integration. SN-PKG-01 is resolved.** This supersedes the initial hold above, which is retained with the original reproduction as historical evidence.

Reviewed only the exact three-file correction from `b750d008`: `apps/ios/SafariExtension/package.sh`, new `apps/ios/SafariExtension/tests/package_guard_test.sh`, and the corresponding report amendment. The guard uses existing Python standard-library `realpath` resolution, separator-aware ancestor checks in both directions, and conservative case-insensitive comparison. It runs before `mkdir`, hashing, logging or Apple commands. This addresses the reproduced direct and symlink-alias overlap without adding dependencies or changing native behavior. Case-fold comparison deliberately rejects some distinct case-sensitive paths; this is documented and acceptable for the bounded macOS packaging route. No filesystem-race-proof or arbitrary filesystem-alias guarantee is inferred.

Extracted exact corrected files to `/tmp/safari-native-packaging-correction-u_r8xxuu`; metadata: `/tmp/safari-native-packaging-correction-metadata.json`. **Three narrow independent checks passed:**

1. Formerly failing nested-output argument: now exits 1 with the separation error; no output directory/files, source paths/bytes unchanged, zero fake Apple-tool invocations.
2. Nested output reached through a symlink alias to the source: same rejection and preservation results.
3. Separate output with the input itself supplied through a symlink alias, using paths containing spaces: succeeds against the preserved fake tool layout; source paths/bytes unchanged, `interface.json` exists and the hash list contains exactly the supplied fixture files, with no generated self-entry.

`bash -n` passed for both corrected shell files; `git diff b750d008 738866f --check` passed. The owner's committed guard suite was read but intentionally not rerun here; lead owns running it on integrated main. No prior full packaging, SDK build or old campaign was repeated. Only the third local control invokes the preserved fake tools, with no actual Apple process.

Reproduce these exact narrow checks:

```sh
python3 /tmp/safari-native-packaging-correction-retest.py
```

Detailed commands, outputs and results: `/tmp/safari-native-packaging-correction-results.json`. First correction run: `/tmp/safari-packaging-correction-probe-24rewlhz`. Original `/tmp/safari-native-packaging-probe.py`, its failure results, original candidate and report remain preserved separately.

Lead next action: normal integration and the committed guard test on integrated main; Support then continues its already assigned hosted route using Web's final committed resources. Approval is source/guard review only. Real Apple packager output, Swift compilation, Safari enablement, original-page capture and device acceptance remain pending and are not implied by this correction.
