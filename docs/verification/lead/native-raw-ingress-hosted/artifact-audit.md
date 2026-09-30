# PASS — downloaded native evidence integrity audit

Commit: `81b7e182550d9f70ddc3bf4357bbab935488d6ea`.
Run: https://github.com/Judithandprey/ai-learning-companion/actions/runs/36677566096
(attempt 1). Evidence: `/tmp/lead-native-raw-ingress-36677566096`.
This is an integrity review of existing artifacts, not independent product QA.

## Verified results

- **18/18 SHA256SUMS entries match.** Every downloaded file except SHA256SUMS
  itself is covered (19 files total); no duplicate or missing entries.
- **105/105 source files match `git show 81b7e18:path` byte for byte**, with exactly
  the workflow's archived source set and no extra/missing files. ZIP commit comment
  matches the full SHA. Scope: ScreenObserver app/extension/shared sources, all
  four native check directories, packages/contracts, pyproject.toml, uv.lock and
  the workflow. `inputs.log` source tree matches Git:
  `f3685759574c786c7e1b7c7f1f11cb6f1a43139b`.
- `inputs.log` records the exact commit/run/attempt, macOS **26.6.2 (25G83)**,
  arm64, runner image **macos26 / 20260907.0351.1**, Xcode **26.6 (17F113)** and
  both SDK versions **26.5**.
- Both **iphoneos and iphonesimulator builds succeeded**, with
  `CODE_SIGNING_ALLOWED=NO`. Logs include compilation of RawFrameIngress.swift.
  Both app archives contain the declared app and embedded BroadcastUpload bundle
  metadata and executable bytes. Four executable headers are Mach-O/universal
  Mach-O, and the archived plist SDK/Xcode values agree with the inputs.
  build-results.json reports all seven native/fixture outcomes as `success` and
  explicitly keeps `device_install_verified: false`.

Actual anchored `PASS`/`FAIL` line counts from the downloaded logs:

| Log | PASS | FAIL |
| --- | ---: | ---: |
| boundary-checks.log | 15 | 0 |
| ingress-native-checks.log | 99 | 0 |
| ingress-contract-checks.log | 42 | 0 |
| raw-frame-native-checks.log | 40 | 0 |
| raw-frame-contract-checks.log | 104 | 0 |
| raw-frame-ingress-native-checks.log | **35** | 0 |
| raw-frame-ingress-contract-checks.log | **56** | 0 |

The new native count is **35, not the earlier predicted 33**. Its log includes
both added saved-ACK checks: valid committed readback and rejection of invalid
saved acknowledgements. No FAIL, compiler error, traceback, mismatch or failed
build was found. Six nonfatal warnings are present: four skipped AppIntents
metadata extractions and two simulator ONLY_ACTIVE_ARCH warnings; the latter
explicitly say all applicable architectures were built.

## Raw fixture archive coherence

The manifest contains 2 requests, 35 ACKs (6 accepted/29 rejected), 3 valid errors
and 5 invalid errors. All ACKs reference the exported live request; the Python
log records matching Swift/Python verdicts. The two exact original PUT bodies
are now present and each decodes to a PNG matching the complete manifest binding,
raw frame/record source and artifact, byte length and SHA-256:

| Request | posted | PNG bytes | SHA-256 |
| --- | --- | ---: | --- |
| live | true | 291 | `ab89c6d23de2e7e580b8abe9f5c4318d06208cf4795d14e1ca191923ea54d361` |
| historical-unknown-clock | false | 290 | `53d8152de8a37d4a953726323097ade5a8e46453c830843fbabcf92fc507d6a6` |

Both preserve orientation 6 with `applied_to_pixels: false`; captured UTC and
course media position remain null. Historical is built/enqueued, not POSTed.
These are actual hosted native test outputs using synthetic source/capture data
and an in-process fake service, not real ReplayKit/device observations or Backend
commit evidence. Root separately owns the actual-fixture API/Learning probe.

## Exact audit commands and limits

```sh
cd /tmp/lead-native-raw-ingress-36677566096
sha256sum -c SHA256SUMS
cd /home/agentsdock/Projects/learning-companion/repo
env PYTHONDONTWRITEBYTECODE=1 .venv/bin/python \
  /tmp/audit-native-raw-ingress-artifacts.py
```

The portable read-only audit script uses `git ls-tree` for the expected archive
set and `git show` for each source file, reads ZIP/plist/JSON data, counts logs and
checks original-byte hashes without running any contract or native suite.
Passing audit output: `/tmp/native-raw-ingress-artifact-audit-checks.log`.
The initial log scan matched the words "error:" inside a PASS label; it was
narrowed to diagnostics outside PASS lines. This was an audit-filter false
positive, not a native failure. Artifact hashes were rechecked unchanged at the
end. No artifact/source files, CI, service, database, provider or network were
changed or invoked.

Compilation and native test execution are evidenced at this exact commit.
Signing, installation, real-device/app runtime, provider delivery, pixel rendering,
original-live-screen ink, original-source completion and product core gates remain
outside this audit and are not marked passed.
