# Executed Windows build and package

Reviewed source **`e819bfe4c6650c01c72610109725f30bccb82b47`** was pushed to
origin/main, then built by the existing Windows-only workflow. Actual
[run 36713802500](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36713802500)
was created at 2026-09-30 12:17:45Z and completed successfully at 12:20:56Z.
Job `109882009970` ran for 1m18s; queue time is not build time.

The earlier run 36712629071 on `061efe2` failed 29/31 tests. Its two CRLF-sensitive
test setup failures are preserved in the [review](../windows-correction-review.md).
The reviewed test-only correction `99ae568` → `8ad77c5` changes no production
source; QA's actual Windows behavior candidate at `061efe2` remains identical.

## Actual hosted evidence

- Windows runner `win25-vs2026`, image `20260922.246.2`, x64; Node 24.21.0,
  Electron 44.5.1, TypeScript 7.0.2, committed dependency lock.
- TypeScript compilation and copied HTML/CSS/preloads succeeded; the pinned
  Electron runtime was acquired, queried and packaged with the built application.
- All **31 named tests pass**, zero failures/skips/cancellations, actual reported
  duration 1011.9193 ms. These tests use synthetic boundaries, not actual user input.
- `result.json`: `checks-completed`, exit0, interactive runtime/provider/signing
  flags all false. The job did not launch the product or capture a display.
- Development ZIP SHA-256:
  `13691cadd5ee9298b7acc427f109ef63b6a01914f8e755fed5468f70750c2071`.
  Exact source archive SHA-256:
  `f2ff7884214b8d029ecba18043c88b657907e61faecac929d7658f8acf5544e7`.

Artifact `11095048494`, name
`desktop-windows-e819bfe4c6650c01c72610109725f30bccb82b47-1`, was downloaded
successfully to `/tmp/lc-windows-36713802500`. The workflow retains it for 14 days.
Large source/runtime ZIPs are not added to Git. This folder preserves exact raw
bytes of `environment.txt`, `result.json` and the original `SHA256SUMS`;
`tests.log`, `build.log`, `manifest.log` and `electron-version.log` are retained
unchanged as `tests.txt`, `build.txt`, `manifest.json` and `electron-version.txt`.
Thus original hash filenames refer to their artifact names, not these aliases.

## Independent package and provenance audit

All **13 artifact checksums** match. The ZIP has 98 files: 25 application files
and 73 Electron runtime files. Its PE32+ executable is x64 (`0x8664`) with embedded
file/product version 44.5.1.0; inspected dependency names are Windows system
libraries. The declared main entry, all relative ESM imports, both preloads,
HTML/CSS assets and reused Safari ink/mode modules are present. No package launch
is inferred from this static inspection.

The source archive's 1,599 paths, file types and modes match Git, and its PAX
comment names exact `e819bfe`. **Raw Git blob identity is not claimed for all
files:** 380 member payloads match directly; 1,219 text payloads differ only by
LF→CRLF. A read-only `git -c core.autocrlf=true archive --format=tar e819bfe`
reproduction matches every hosted member's exact bytes/type/mode/name. There is
no `.gitattributes` in that tree and no difference beyond that transformation.
This demonstrates the archive conversion, but the original runner's config was
not logged, so its actual `core.autocrlf` value is not asserted. The corrected
tests explicitly handle that representation rather than silently skipping source.

The independent review found no remaining source/package blocker. This is exact
commit/content provenance with the observed text representation disclosed, not
an unqualified assertion that all archived bytes equal raw repository blobs.
The full [audit report](artifact-audit.md) and [inventory/results](artifact-audit.json)
are retained here. Normal P0 CI
[36713799361](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36713799361)
also completed successfully on the same exact `e819bfe`.

## Scope and next action

This is a build/package milestone, not independent product acceptance, project
signing, physical pen validation or a real AI connection. No user preview/service,
private database, Paperclip runtime, provider/account or permission was changed.
The development entry is the bundled `WindowsDesktop/electron.exe`; its behavior
is under the existing isolated QA pass before presenting a tested replacement to
the user. The downloaded package was not launched for this audit.

QA continues original-screen capture/input/save/reopen/Stop on the identical
production source; Windows owner continues whole-display raw/composed PNG
retention. Native is implementing its separate Mac local ink slice, Backend the
trusted pixel-producer admission repair. Lead reviews actual deliveries and the
next explicit Windows producer binding. Real provider, content-following/physical
pen, live audio, Notability and interactive Mac acceptance remain open.
