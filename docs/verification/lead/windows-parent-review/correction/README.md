# Windows app-parent correction and integration

**The six source-review HOLD findings are closed.** Actual delivery
`handoff_ece4676100aaf8edb8f0d80b7fc6dbe0` at 2026-09-30 22:27:57 UTC supplied
`5871981524140e3be986268a941d34e99af25bb9`, directly after `d6ef68a`.
The original failed probes remain in the [parent review](../README.md).

The app now contains the off-by-default development link: explicit Start,
retained raw/composed pixels and original ink to the existing local service,
truthful stored/unknown/refused status, Stop, and read/control-only recovery.
It has no connected product AI. This milestone releases a candidate for actual
Windows interaction/storage QA, not full-product or either §7.1 gate acceptance.

## Review and actual checks

| Evidence | Actual result and boundary |
| --- | --- |
| Exact candidate build | Pass, pinned Node 24.21.0 / TypeScript and static assets; retained build log. |
| Lead candidate checks | 115 passed, zero failures/skips, 37.737 s; eight affected files using disposable MemoryStore loopback hosts, no DB/GUI. |
| [Independent host retest](windows-parent-host-correction-review.md) | Five groups pass: actual ENOENT/EPIPE, whole-write and pending-write uncertainty, FIFO cleanup. No Backend/DB/Windows GUI. |
| [Independent record retest](windows-parent-coordination-correction-review.md) | Eight cases pass: corrupt records untouched, optional-member compatibility, complete UTF-8 short writes, zero-progress/ENOSPC preservation, nine generated-record checkpoints reload, read/control-only recovery. In-process child/HTTP fakes. |
| [Independent app retest](windows-parent-app-correction-review.md) | Seven checks pass: repeated/rejected quit, historical stored/unknown counts and Stop uncertainty, overlay mode flag, no relaunch after fault. Exact source over explicit boundary doubles. |
| Owner receipt audit | Both Linux and Windows receipts' 56 source hashes and result logs match exact Git bytes. Author Linux:115/115; Windows Electron-as-Node:70 pass/45 explicit skips. Audited attribution, not Lead native execution. |
| Integrated main `15501b6` | Entire Windows app tree equals the reviewed owner source. **221 passed, zero failures, five intentional owned-DB skips** out of226, 39.067 s. Build passes. Shared services/contracts and other platform source remain unchanged. |

See [source/receipt audit](windows-parent-correction-source-audit.json),
[candidate test output](windows-parent-correction-focused-5871981.txt),
[integrated test output](windows-parent-integrated-15501b6.txt),
[integrated build](windows-parent-integrated-build-15501b6.txt), and
[SHA-256 manifest](evidence-manifest.json). Each original reviewer probe, result
and log is retained. The initial host helper lacked its required stdout witness;
its invalid-control log is preserved and excluded from product findings/counts.

These probes retain exact `/tmp/lc-windows-parent-5871981` imports; they are
historical correction evidence. The committed application regressions are the
normal repeatable checks. No PostgreSQL owner run or prior GUI campaign was
repeated by Lead. Directory-fsync/power-loss durability and stale diagnostic
fields after a later successful Stop remain disclosed limits, not new guarantees.

## Integration

| Owner commit | Main commit |
| --- | --- |
| `44c5536` | `701d531` |
| `d252e48` | `51d8c33` |
| `1fea3f7` | `37401fb` |
| `6b74148` | `4aa296d` |
| `d6ef68a` | `9e5671c` |
| `5871981` | `15501b6` |

Only these owned commits were cherry-picked; the older shared branch tree was
not merged. The uploader-test conflict retained main's verified failed-kill
guard and text. The documentation conflict retained its later full-file local
test results while closing the already-passed Windows portability incident.
Final `apps/windows` is byte-identical to `5871981`; no residual source conflict
or shared/dependency change. Integrated source SHA:
`15501b6a0d158b3e0fa21a2cb72db5c23639ab52`.

Commands on main:

```sh
cd apps/windows
LC_BACKEND_ROOT=/home/agentsdock/Projects/learning-companion/repo \
LC_PYTHON=/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python \
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node --test tests/*.test.ts
PATH=/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin:$PATH npm run build
```

## Next owner

QA receives the exact pushed revision for [one real Windows workflow pass](next-qa-task.md).
Default-off behavior, the real app's automatic changing display/ink originals,
local test-service readback, Stop and same-profile reopen are checked together.
Tests may use only isolated profiles and existing `lc_p0_test`; user preview and
Paperclip remain untouched. Display claim/release and actual input provenance
are mandatory. This file does not assert that dispatch or QA execution occurred;
actual receipts and any hosted Windows run are recorded after observation.
Native continues its already-started macOS app-parent task. Interactive Mac,
physical pen, real provider, complete audio and Notability gates remain open.
