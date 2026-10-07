# Preserve sanitized preflight refusals — 2026-10-07

The wrapper now saves an allowlisted `preflight-refusal.json` before rejecting an occupied app/Edge port or a non-child/unreadable Electron launch. The original admission condition and refusal remain fail-closed. No later Windows call, candidate scratch, parser, runner, signal or cleanup follows a conflict. A new QA evidence leaf uses nonrecursive directory creation and exclusive file creation; concurrent evidence or a recording failure stops without overwriting it or starting anything.

This is the bounded follow-up from Lead message `handoff_d6346bd3b86d35e270077b49eaa9ea94`, using current Lead baseline `1df4976`. The earlier actual invocation and its released display were first committed separately as **`1b27f128d5bf78b1dbff1c14ca1002da0e1a3f74`**; [that original snapshot evidence](../execution-result/README.md) remains unchanged. Production, all ten candidate source pins, runner, 32 steps, surface, scratch identity and launch arguments remain unchanged. The new wrapper hash is **`cadc3a85d0c8c3621c5570247536ca1c81b4c0e53d83a9357441893e9ec7cee6`**; the issued historical allocation binds the old hash and cannot admit this changed wrapper.

Saved fields separate the two ports and Electron launch conflicts, with PID, creation ticks/null, metadata/readability flags and a fixed stage enum. `candidate_stage` means only a readable exact candidate executable plus an exact parsed candidate stage argument; it is not ownership, authenticity or product acceptance. Other paths remain `unknown`. A listener outside the image-scoped rows has unknown metadata, not an invented creation time. Raw command lines, executable/stage paths, titles, tokens and exception text are never serialized. The two wrapper lookup clocks remain separate; they are not an atomic screen-state observation.

## Focused offline checks

[Final checks](focused-checks.txt): **34 pass, 0 fail/skip/cancel** under Node24.21.0 `--permission`, with child-process permission withheld. The named check confirms an actual `ERR_ACCESS_DENIED` on subprocess spawning. Windows/fresh-auditor/native/FS behavior is injected; these tests launch no Windows process or product and consume no native scratch.

The changed branches cover each/both occupied ports, non-child launches, unreadable command/executable metadata, missing child creation time, readable children remaining ignored, separately preserved lookup clocks, exact-stage versus sibling/decoy/private-string classification, unknown listener metadata, exclusive evidence creation, write failures and a concurrently occupied output leaf. No broad production regression campaign was run. [Initial selected failure excerpt](initial-check-excerpt.txt) preserves the assertion-key mismatch; [intermediate 33-pass log](intermediate-33-checks.txt) predates the exclusive-output correction and is not added to the final total. Independent read-only review accepted privacy, admission and exclusive evidence behavior; that reviewer ran no tests or Windows calls.

Reproducible offline command (no child-process permission):

```sh
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node --permission --allow-fs-read=/home/agentsdock/Projects/learning-companion/wt-review --allow-fs-read=/mnt/c/Users/ROG/AppData/Local/Temp/lc-qa-tts-output-bf94386da582443495d2cae7ae3cbffb tests/e2e/windows/test_qa_run_tts_candidate.mjs
```

## One separately authorized current metadata observation

Normal command review accepted one foreground read-only observation at **2026-10-07T07:55:23.119Z–2026-10-07T07:55:26.487Z**. It queried `electron.exe` metadata and listeners on 43123/45123 only; it did not invoke wrapper `--execute`, native `-File`, capture/display getters, product, audio, microphone or helper. [Exact observation script](metadata-observation-script.txt) is a copied evidence artifact of the `/tmp` script that ran once; [current-metadata.json](current-metadata.json) is the sanitized actual result. Raw lookup stdout/error text was not printed or saved.

**Current blocker:** both ports had no listeners, while Electron PID **100568**, creation ticks **639267186912717160**, was a readable non-child launch with an executable different from the pinned candidate runtime. Its product/stage identity is **unknown**. PID plus creation time is observation metadata, not authority to signal it. The fresh observation does **not** reconstruct the discarded snapshots from the first line-89 refusal.

Native `-File` attempts remain **0**, there has been no second wrapper execution or display allocation, no process was signalled, real requests remain **0/4**, the voice-input slot is unassigned and the existing `ai` automation remains paused. All 32 actual diagnostic steps, speech/caption/Stop/cancellation and desktop real-AI gates remain **NOT_RUN**. This correction and metadata result do not establish a production defect or device acceptance.

Lead owns coordination of the current launch's actual owner and any future reviewed wrapper hash/exact scope/fresh exclusive allocation. QA will not close the unrelated process, bypass admission or retry. [check-receipt.json](check-receipt.json) and [artifacts.json](artifacts.json) bind this delivery and the unchanged candidate/payload/source identities.
