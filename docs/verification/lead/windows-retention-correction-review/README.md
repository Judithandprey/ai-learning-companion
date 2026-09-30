# Windows retention correction review — APPROVE, bounded integration scope

Candidate: `e586b822f81867ecab29ddaeccf5537a40b9f653`, parent `04caef61f251e9df2e6c6f5e433b0a2c1dd6ed68`. Read-only review on 2026-09-30. Exact export: `/tmp/windows-retention-e586b82`.

**No remaining reproducible blocker found in the assigned S1–S3/R1–R2 correction paths.** The candidate closes the prior HOLD findings at this component boundary. Approval does not close QA-WIN-01, independent Windows behavior acceptance, native packaging/build verification, physical pen/device acceptance, or actual provider delivery. Those have separate owners/evidence.

Applied the already-read project PONYTAIL LITE/workflow rules and retained original/English requirements for source/ink preservation, honest time/gap evidence, and Stop/recovery. Reviewed the exact delivery delta, complete affected production call paths, the original lead README/storage/renderer findings and retained probes, and the owner's correction section at `docs/verification/web/windows-original-display.md:87`. No project source or worktree was edited; diagnostic additions are confined to the exact `/tmp` export.

## Results

| Boundary | Evidence and disposition |
| --- | --- |
| S1: torn append / repair before acknowledgment | `main.ts:416` tracks the acknowledged byte prefix, removes partial tails immediately where possible, and retries repair before the next append. The existing correction tests and additional same-sample retry probe show no successful ACK while repair fails. Once repair succeeds, prior bytes remain identical and every JSONL record parses; `unwritten` counts the failed attempts. A failed first batch does not duplicate the header. PASS. |
| S2: Stop progress and bounded forced ending | `main.ts:221`–260 checks completed valid retained-frame/ink work and records pending frame/deferred IDs or explicit unknown later frames. Whole `overlay.ts:956` reports pending and deferred work before waiting for save/retention, then acknowledges only after those promises settle. Additional controlled-clock probe keeps work moving at each 10-second check: session stays alive through 50,000 ms, ends at 60,000 ms, writes `unfinished.samples=[100]`, deferred `[98,99]`, then refuses a late sender without changing the manifest. Existing tests cover first quiet timeout, crossed report/ACK, crash, no-frame case, and deferred work behind held encoding. PASS. |
| Actual capture/input Stop boundary | `overlay.ts:155` stops the stream tracks, sets ended and suppresses post-end live samples; Stop settles the pre-existing gesture and releases input. The 54-test run includes actual-source capture/Stop regressions with fake tracks and canvas. This review does not claim an independently observed Windows track stop. PASS at portable source boundary. |
| S3: failed final end after teardown | `main.ts:263`–275 observes the append result and publishes ended/end_recorded state; `:452` retries held final records on Start and before-quit. Additional partial-final-append plus failed-truncation probe stays visibly `ended=true,end_recorded=false,unwritten=0`; repair on before-quit yields exactly header/retained/ended with a late-record note. Existing test verifies failed retries are not counted as lost events and do not overwrite a running session's panel. PASS for in-process recovery. |
| R1: known gaps despite unchanged pixels | `overlay.ts:286` independently sends measured gap metadata; `:879` carries gap_ms in retained facts; `main.ts:574` appends the gap line. Actual main+overlay test records the same-pixel 7,000 ms gap and changed 5,500 ms gap, with 5,500 ms also on the retained record. PASS. |
| R2: independently rounded clocks | Header at `main.ts:405` now states separate rounding/measurement and unmeasured pre-presentation latency. No timestamp or exact subtraction is fabricated. PASS. |
| Owned IPC facts / PNG robustness | `main.ts:492` rejects malformed required facts before writes, including NaN/noninteger sequences, invalid time/state/deferred data and inconsistent ink marks. `:472` calls nativeImage and checks decoded dimensions, after bounding geometry to the chosen display. Portable tests reject the prior 24-byte prefix using the explicitly fake decoder. This is the owned overlay IPC channel, not a demonstrated external attack surface. Native decoder behavior was not independently executed here. |
| Encoding failure during Stop | Additional whole main+overlay probe holds queued encoding, sends Stop, then rejects encoding. The actual catch writes `not_retained` with its failure reason before the normal Stop ACK. Manifest is header/not_retained/ended; no retained-success claim is made. PASS. |

## Executed checks and reproduction

Pinned Node 24.21.0, Linux, no installs:

```sh
cd /tmp/windows-retention-e586b82/apps/windows
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node --test --test-isolation=none tests/*.test.ts
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node tests/correction-review-probe.ts
```

- Candidate suite: **54/54 pass**, 0 failed/skipped, 621.996 ms reported test duration. Log `/tmp/windows-retention-e586b82-tests.txt`.
- Additional bounded probes: **4/4 groups pass**, described above. Source `tests/correction-review-probe.ts`; results `/tmp/windows-retention-correction-probe.json` and `.log`.
- `tests/correction-review-harness.ts` is the candidate harness with only an injected Date.now clock added for deterministic hard-cap verification. Production source is unchanged. Electron/window/canvas/capture/nativeImage are test doubles; filesystem writes are real `/tmp` files. The PNG decoder stand-in checks size/IEND, not complete native decoding. This is not a Windows launch, native build, or real-time 60-second observation.
- Owner-reported mutation sensitivity/earlier internal reviews were read but not independently rerun; the approval rests on inspected source and the concrete results above.

## Committed synthetic sample

All **17 changed delivery files match their exact raw Git blobs**, without normalization. Inventory: `/tmp/windows-retention-correction-source-hashes.json`.

All **8 retention sample files** (manifest + seven PNGs) match exact raw candidate Git blobs. All seven PNGs pass signature, chunk bounds/CRC/IEND checks, complete zlib decompression and PNG scanline reconstruction. Every manifest file hash, byte count, 2560×1600 geometry and decoded RGBA hash matches actual bytes; no missing/orphan references. Total PNG bytes: **2,388,480**. Manifest: **9,192 bytes**, SHA-256 **`506c4ab9641fb94ce57a38cf8ae80d12e9c9abeb44de0e81f6e4bac9430b4834`**. Retained samples 1/3/7/10/12; refused 5/14; not-retained 8; final ended record is present. The corrected audit deliberately does not assert exact subtraction of independently rounded clocks.

Reproduce:

```sh
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node /tmp/windows-retention-correction-sample-audit.mjs
```

Detailed results: `/tmp/windows-retention-correction-sample-audit.json`; exact Git inventory: `/tmp/windows-retention-correction-sample-git-tree.txt`.

The two replacement PNGs were visually inspected: synthetic red checkerboard/counter/pointer; the composed version adds a dashed test stroke. No private desktop/user content is visible. The other five are unchanged from the previously reviewed synthetic sample.

The committed author report contains **40 checks, 40 passed**, Electron **44.5.1**, Windows **10.0.26200**, 2026-09-30 **13:18:30.072–13:19:21.560 UTC**. The document says this latest run had the display released to the author with no other Electron process before/after. Treat that as **author-reported native synthetic evidence**, not an independently witnessed quiet run or independent QA. The older 12:37 run's possible overlap remains a historical limitation; it is not this new sample's timestamp.

## Preserved limits

- Failed final `ended` lines are held in process memory and retried on Start/before-quit. There is no durable retry journal across app termination/restart; a final retry that still fails cannot make that line durable. The current session reports this failure. This review approves the requested teardown/retry correction, not crash/restart recovery or fsync/power-loss guarantees.
- Stop timer callbacks run on the event loop and use Date.now. The deterministic nominal 60-second cap does not establish a hard real-time deadline during blocked synchronous I/O or wall-clock adjustments. It cannot interrupt a synchronous append mid-call.
- Forced Stop explicitly records loss/unknowns; it does not recover PNG bytes still held by a destroyed renderer. A disk failure can also leave events counted as unwritten. No claim of complete loss-free history is warranted by this slice.
- The fake decoder does not prove arbitrary malformed PNG refusal in Electron. The committed sample is independently fully decoded; the owner's native report establishes only what that author actually exercised.
- No native app/UI/display, browser, provider, DB, listener, service, workflow, network or install was run. No main/worker edits, Git mutations or Chats occurred. No physical pen, Notability import, full product acceptance or actual AI understanding is inferred.

## Main integration

Base `04caef61` and correction `e586b82` integrate as `f185d40` / `0a3d879`.
On main, the actual Linux pinned TypeScript build and static-copy command passed;
the explicit `node --test --test-isolation=none tests/*.test.ts` passed all **54
named checks** (647.880 ms). Default isolation separately reported seven passing
file wrappers; these are not 61 independent checks. The independent probes and
sample audit above were not repeated after their exact source was integrated.

Retained probe/harness files are export replay artifacts: put them back in the
exact candidate export under their original `tests/correction-review-*.ts` names.
The sample script uses the recorded /tmp export and inventory paths. They do not
launch Electron. QA-WIN-01 remains Web's already active next correction; one
focused independent changed-workflow pass follows its reviewed release. No user
preview or actual interactive desktop was launched, changed or restarted here.
