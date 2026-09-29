# ScreenObserver compile workflow review

**Approve `3d26f72a640fe7423fec654d1594e219e2eda40c`; no workflow blocker found.** Hosted compilation remains deferred until the held ScreenObserver source receives its SO1/SO2 corrections. This review does not accept that source or claim an Apple build/runtime pass.

Scope: the exact new `.github/workflows/ios-screen-observer.yml` (177 lines), compared with the actual `a6f2ae7` project, Info.plist and entitlements. Current workflow/PONYTAIL LITE applied. No main/owner edits, hosted dispatch, simulator launch, account, network or running-user-environment access.

- One main-only `macos-26` job, 30-minute limit; path-filtered push and explicit dispatch. Read-only contents permission, pinned existing checkout/upload actions, no persisted checkout credential.
- `apps/ios/ScreenObserver/ScreenObserver.xcodeproj` and target `ScreenObserver` match the committed project. Its explicit `BroadcastUpload` target dependency and Embed Foundation Extensions copy phase produce `ScreenObserver.app/PlugIns/BroadcastUpload.appex`; the collector checks that actual path. Shared Swift source is assigned to both targets in the project.
- Both commands use `Debug`, explicit `iphoneos`/`iphonesimulator`, `CODE_SIGNING_ALLOWED=NO`, and separate per-SDK SYMROOT/OBJROOT/products directories. There is no test/simulator run, provisioning request, dependency installation or account setup.
- Explicit Bash preserves pipeline failure through `tee`. A device failure does not skip simulator compilation when preflight succeeded: the simulator condition contains `!cancelled()` and tests the inputs outcome. No `continue-on-error` masks the failed build/job.
- Collection, hashing and upload all use `always()`. Available partial products are archived; ordinary device build failures retain both SDK outcomes/logs. A nominally successful build missing either bundle's metadata/executable fails collection rather than claiming success, while processing the other SDK. Source and workflow are archived from HEAD; exact commit/tree, SDK/toolchain, run/attempt, build logs, bundle metadata and hashes are retained. The report explicitly marks signing and device installation unverified.
- Existing `ios-probe.yml` push paths shown on main exclude ScreenObserver and this new workflow, avoiding an automatic replay of the accepted ink campaign. Its job steps were outside this review.

Independent bounded validation reused the owner's `/tmp/check-screen-observer-workflow.py`, changing only its input root to an isolated archive and selecting three existing scenarios:

1. Successful device/simulator stand-ins: exact target/settings, separate products, app plus embedded extension and evidence hashes pass.
2. Device exit 65: failure survives `tee`; simulator and both outcomes/available products survive.
3. Missing embedded extension after nominal success: collector fails while retaining other-SDK evidence.

YAML structure, all Bash blocks (`bash -n`) and embedded Python syntax also passed. No new framework or broader campaign was introduced. The owner's remaining malformed-plist/archive-error/missing-source cases were inspected, not rerun, and remain owner evidence.

Exact independent command:

```sh
python3 /tmp/screen-observer-workflow-review-vud4eizv/three-case-check.py
```

Inputs are the exact `3d26f72` workflow and `a6f2ae7` native tree. Script and output: `/tmp/screen-observer-workflow-review-vud4eizv/three-case-check.py` and `three-case-check.log`. These are controlled xcodebuild/ditto stand-ins testing workflow behavior, not Xcode compilation or Simulator/device evidence.

Next: lead retains the approved workflow, integrates corrected native source, then uses the resulting exact main SHA for the single hosted unsigned device+simulator build and reviews its retained results. No costly dispatch was issued here.
