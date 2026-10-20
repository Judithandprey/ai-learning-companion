# Candidate 09: the connector moves to the released baseline 260884e, with a new scratch — 2026-10-20 (prepared only)

**What ran.** Offline source assembly and synthetic checks only:
- read-only Git (`show`, `diff`, `ls-tree`, `rev-parse`, `log`);
- plain Node writing only the new folder;
- Node tests and the template check under `--permission` (read grants only, no child process, no write);
- existence checks (stat only) of the new scratch and copy paths.

**What did not run:**
- no `prepare-connector` and no connector copy;
- no Python against any copy;
- no runtime or stage copying;
- no Windows process or PowerShell (so no parse-only check);
- no installed Codex, account or provider;
- no display, microphone, audio or TTS;
- no `--execute`, no allocation, no lease.

**Unchanged, as Lead `handoff_6d184e39` states:**
- Candidate 08 stays native 1/1 consumed and real actions 1/4, with DISPLAY and ACCOUNT released. Its actual failure
  cause stays **UNKNOWN**.
- Its three unused action slots authorize no retry.
- Candidates 05–08, their scratch `lc-qa-live-nonvoice-e72ea0f9…` (consumed by 08's run), the copy
  `subscription-source-52be105a148a`, and every refusal, run and review record are untouched.

Assignment: Lead `handoff_6d184e39e4e10d5cad2b69b51126af71`, on the published main
`260884e670c25da7ab8d0360cc8355f90c3697b6`. That baseline integrates:
- QA's reader `21668dd` (as `7b81981`);
- Backend `4e840a4` (output diagnostics);
- the corrected close `63ddf8e`;
- Support's re-review `a90f51b`.

`tests/e2e/windows` and this evidence tree are identical at `21668dd` and `260884e`, so no merge was needed.

## What changed

1. **Generator** [`qa_live_candidate.mjs`](../../../../../../tests/e2e/windows/qa_live_candidate.mjs):
   - `CONNECTOR.commit` is now `260884e670c25da7ab8d0360cc8355f90c3697b6`, a constant separate from the product
     `source`, which stays `0ff325b`.
   - `CONNECTOR.copy` is the new, unused folder `/home/agentsdock/.local/share/lc-qa/subscription-source-260884e670c2-nonvoice-09`.
     It is neither an earlier candidate's copy nor the sign-in launcher's derived `subscription-source-<12 hex>` path.
   - The comment no longer claims that `services/` is identical at 52be105 and 0ff325b.
   - Everything else in `CONNECTOR` is unchanged: Python, the codex 0.158.0 path and sha256 `167c0148…`,
     `state_dir` null, Ubuntu, agentsdock.
   - `prepare-connector` still makes a copy only if the folder is absent. It never overwrites an existing folder: it only
     compares it and exits 1 on a difference.
2. **Candidate** [`../`](../candidate.json): generated with a new random scratch,
   `lc-qa-live-nonvoice-a4a1c3351f934979ac83776c01e9decc`, which does not exist.
3. **Wrapper** [`qa_run_live_candidate.mjs`](../../../../../../tests/e2e/windows/qa_run_live_candidate.mjs): only
   lines 24–27 changed (`candidateDir`, `candidateHash`, `pins`). The candidate pins live there, so assembling a new
   candidate requires this change.
   - The receipt reader is byte-for-byte unchanged: `RECEIPT_KEYS`, `RECEIPT_KEYS_EXTENDED`, `DIAGNOSTICS`,
     `receiptFault`, `sanitizeReceipts`.
   - So are every time, identity, window, source, 16-point, cleanup and request-accounting guard.
   - The wrapper hash moves from `dc10b044…` (the hash at `21668dd` and `260884e`) to `7023257e…`.
4. **Tests** [`test_qa_live_candidate.mjs`](../../../../../../tests/e2e/windows/test_qa_live_candidate.mjs):
   - **Connector test.** It now pins the exact commit 260884e, product 0ff325b and the exact copy path. The copy must
     differ from 05–08's copy and from the sign-in path.
   - **New delta test** (09 against 08):
     - the scratch differs from 05–08's;
     - every payload and the manifest equal 08's once the scratch name and the copy path are put back;
     - only the generator's hash differs in `source_files`;
     - the wrapper pins equal 09's files.
   - **Deadline test.** It compares 09's runner, below its deadline delta, with 06's under the scratch name.
   - **Two saved-candidate references** now point to 09.
   - **Two error-message regexes.** The wrapper builds the message from `CONNECTOR.commit`, so they now expect
     `260884e`.

## Payload differences from candidate 08 ([payload-diff.json](payload-diff.json))

| Payload | Difference from 08 |
| --- | --- |
| `runner.ps1` | 1 line: the scratch name, once, as before |
| `steps.json` | 2 lines: the Edge start and profile paths in the scratch |
| `admission-live.json` | 1 line: the three checker paths in the scratch |
| `sub-live.json` | 1 line: `launch.cd`, the new copy |
| `surface.html`, `admission-checker.ps1` | none: byte-identical (`be82967a…`, `9637db61…`) |

- Each changed file equals 08's once the scratch name and the copy are put back.
- The manifest differs only in fields derived from the scratch, the four payload hashes, `connector.commit` and `.copy`,
  and the generator's hash.
- **Unchanged:**
  - product, release, stage, the 81 files, the tree, app entry, Electron and Edge;
  - policy 4 / 1 min / 60 s;
  - bounds: 360 000 ms, with work 320 000 ms and close 15 000 ms;
  - the steps' 16-point admission.

## The connector baseline ([connector-source.json](connector-source.json), read-only Git)

- **Paths changed from 0ff325b to 260884e.** Only `services/worker/connectors` changed. The non-test files are
  `chatgpt_live.py`, `chatgpt_local.py`, `chatgpt_receipts.py` and `chatgpt_rpc.py`.
  - `packages/` (the contracts) has the same tree, `4a0edf80…`.
  - The copy will hold 282 files: 147 in `services/` and 135 in `packages/`.
- **Receipt writer.** `chatgpt_receipts.py` equals the `4e840a4` version QA reviewed; after it, only `chatgpt_rpc.py`'s
  close path changed.
- **Every receipt is now extended.** A 260884e receipt carries all nine diagnostics from `begin_request` on, which the
  integrated reader accepts. The independent review compared the writer's 28 `FAILURE_CODES`, its field sets, enums,
  bounds and phase sum with the reader, and found no mismatch.
- **Offline check entry points.** The entry points the offline copy checks call are present, and `_prepare` is unchanged:
  `chatgpt_local._prepare`, `chatgpt_live` and `services.learning.live_session`.
- **Unchanged connector behaviour:**
  - the F1 spend/workspace bucket selection;
  - `chatgpt_launch.py`'s supported codex digest;
  - the managed-state location, which comes from HOME and not from the copy.
- **Close path.** The corrected close adds no process. The watch and `processesIn` see the same tree within the same
  bounds.

## Results

- [passes-after.txt](passes-after.txt): **56 of 56**.
- [failures-before-21668dd.txt](failures-before-21668dd.txt): the same tests on the unchanged `21668dd` sources, with
  09's payloads: **37 of 56**. The failures are the connector, delta and message tests, plus the 15 wrapper tests that
  need the wrapper to pin candidate 09.
- [candidate-check.json](candidate-check.json): candidate 09 reproduces from the sources, and its scratch is unused.
- [template-check.json](template-check.json): the wrapper's own validator runs in memory.
  - The inactive [allocation.template.json](allocation.template.json) is refused as saved.
  - It is accepted with only the seven Lead-owned fields filled.
  - Driver-08's template is refused.
- [command.json](command.json): the exact commands, none run.
  1. The prerequisite `prepare-connector`, not allowed here.
  2. The `--execute` form, run in the foreground with 600 000 ms and no retry.
  3. The native invocation.
- **Independent review.** A read-only workflow with three lenses checked connector compatibility, candidate and pin
  integrity, and task completeness, then adversarially verified what they found. **0 confirmed findings.** Both notes it
  raised were refuted on verification:
  - The wrapper's change must be stated: it is, under What changed, item 3.
  - This evidence folder was incomplete while it was being written.

## Pins

| | |
| --- | --- |
| `candidate.json` | `9dad7058fa43becf5c76f76f816e85646a014af8a6398e377d33f62c2e73c5cf` |
| `runner.ps1` | `45063b37328c65771f1c5d431af291a5586e560b57658e4ef9778115e498e36f` |
| `steps.json` | `8e3e7357ef4902adeccd6fb9148f61dc6bfd8f2c6afe82f976ccd89e71edc19a` |
| `surface.html` | `be82967ae45d36bece4ac4858d6f45d0e90e58d088203b71323b74e6ae5e1067` (unchanged) |
| `sub-live.json` | `c38aaae0e38070c805972f71ebed085610427ddc8a2883ee52f1ee5ceec47478` |
| `admission-checker.ps1` | `9637db613373ef5ba63bc10753033aedaab90bf749aeaa982fed9b65c91eccf1` (unchanged) |
| `admission-live.json` | `f2c209e94c3b5cecb7f5c2f7e709b27d799c9007c7fc3e763376a9a364763964` |
| Wrapper | `7023257e0739787744a3a60a36cf5cc038e1f10ebdeb91b0e9dedda9c9ef3594` |
| Generator | `9a93b225364a6b7a7252e22aa85f17c30c4d7a2feff22fdf765586129a576746` |
| Test file | `39aa6620b78d8f3b1cb2a14c4d37e57f95a27390bc249673c312b9046da233ae` |
| Inactive template | `d7f51a719c43889a7e5ccffcfc8e8b30b9e039a4b526ae7efd62a07d2b17a7c4`; differs from driver-08's only in `wrapper_sha256`, `candidate_sha256`, `payload_sha256`, `connector`, `native_invocation` and `launch_identity` (the work folder) |

## Not run, and remaining dependencies

- **Runner parse-only check: NOT_RUN.** It needs Windows PowerShell, which the handoff excludes. The runner differs from
  `4655ec11…`, which parsed with 0 errors, in one line only: the 32-hex scratch name inside the same string.
- **Not yet made: the private copy**, and with it the file-for-file comparison and the ask-path and live-import checks
  on it. These are `prepare-connector`'s, and they run again in the wrapper's connector admission. They need their own
  Lead authorization. Until then, the copy's import behaviour at 260884e is checked against source only.
- **Unchanged from candidate 08:** the stage, the cached Electron and the 81-file identity still need the wrapper's own
  run-time checks.
  - So do every native dependency listed in [driver-08](../../driver-nonvoice-08/README.md) (uncancellable reads,
    unreadable `powershell.exe`, filesystem stalls, the WSL signal path, unmeasured ceilings) and the native
    unknowns.
- **Proof.** No real failure branch or acceptance is shown by this offline work. Only a separately authorized execution
  can show either.

**Next:**
1. The Lead reviews this exact candidate delta, the pins and the command.
2. Any `prepare-connector` and any execution each need the Lead's separate decision and allocation.
