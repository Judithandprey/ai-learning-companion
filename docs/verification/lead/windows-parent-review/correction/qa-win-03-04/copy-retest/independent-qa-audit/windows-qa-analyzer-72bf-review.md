# Windows QA analyzer correction — bounded independent review

Verdict: **APPROVE the scoped correction** at `72bf9a37a422e2da6152c05abb6d0628151c374c`. No blocker found in this bounded review. QA-HARNESS-01 and QA-HARNESS-02 are closed by source inspection and focused metadata replay. This approves the analyzer correction, not a new GUI/DB acceptance run or exhaustive proof of the harness.

Scope and source review: the six-file leaf delta contains the analyzer, its standalone saved-evidence replay, three separately named replay/summary receipts and the report update. Read the changed analyzer logic, replay construction and case definitions, and the correction report. No production, scenario, process watcher, runner or database helper was changed by this leaf. PONYTAIL LITE: retain the existing analyzer and reuse its saved evidence; no new framework or mutation campaign.

## The two findings

- **QA-HARNESS-01: repaired.** `tests/e2e/windows/analyze_fix.py:403` now requires exactly one paused and one resumed host, both matching the uniquely identified session PID, a stopped pause state, an explicitly successful live resumed state, ordered event times, and correlation to the recorded runner steps. The old empty-resume-list reproduction fails; a different resumed PID also fails. The historical retained PID/continued evidence remains present.
- **QA-HARNESS-02: repaired.** `tests/e2e/windows/analyze_fix.py:468` derives the required ink artifacts from the committed jobs and selected server records, checks complete job/readback/artifact coverage, rejects duplicate or missing comparison rows, and binds equal SHA-256 values to the artifact identifier and stored metadata. Removing every comparison or one required comparison now fails the final-count claim. This validates recorded byte-hash evidence; it does not turn the analyzer into an image decoder or a new native capture test.

The adjacent guards are appropriate to these evidence claims: unique actor/job/record relationships, nonempty immutable checkpoints, recorded process/exit facts, expected historical copy and manifest ordering. Their size alone is not a reason to cut them. The analyzer and replay are **fixture-specific to the historical 86d2405 run**; exact copy and scenario expectations must remain pinned. The later QA-WIN-05 copy changes need separately versioned actual QA checks, not edits that make this historical fixture accept the new product. The replay uses standard-library temporary reconstruction and preserves the original evidence; no shared validation framework was introduced.

## Executed checks

Command (foreground, pure saved JSON/files only):

```sh
PYTHONDONTWRITEBYTECODE=1 python3 /tmp/lc-windows-qa-72bf9a3/focused_replay.py > /tmp/lc-windows-qa-72bf9a3/focused.log
```

Exit 0; **7/7 expected outcomes**:

| Case | Expected and actual result |
| --- | --- |
| Unchanged historical baseline | All 26 statuses identical: 24 pass / 2 limit |
| Resumed host list empty | Host pause/resume claim fails |
| Resumed host has another PID | Host pause/resume claim fails |
| All ink comparisons absent | Complete server-count/ink-evidence claim fails |
| One required ink comparison absent | Complete server-count/ink-evidence claim fails |
| Prior forced-kill control | Quit-after-Stop claim fails |
| Prior missing-status control | Copy-following-state claim fails |

These cases reuse the delivered reproduction definitions and the two prior controls. The full 121-case replay was **not rerun by this reviewer**. Its delivered receipts were read and their analyzer hashes checked: corrected analyzer 0 pass / 117 fail / 4 limit; executed old analyzer 110 pass / 9 fail / 2 limit. These are owner replay results, not new independent execution.

## Evidence provenance

All **14 historical committed evidence files** are byte-identical between `6a3611e2567cf97e858ff146a55c8d0fda7d832c` and the correction, including the original run, summary, readback, process watcher, coordination, hashes and cleanup receipts. Their exact hashes are in the machine receipt. The historical 24 pass / 2 limit remains valid: the actual retained identity and ink evidence was present; the previous problem was acceptance of missing evidence on reuse.

- Historical executed analyzer SHA-256: `ba2b42095a4218e14c947e848dd3a08c8cd264a105596a48fd8420f1a1a28103`; still matches the unchanged historical `run.json`.
- Corrected analyzer SHA-256: `17d8598082b34db2c504cec310ac5ca2922bb4e78c4ecf91e4ed7cb69761c641`.
- The separately named corrected summary reproduces all 26 historical statuses. It does not overwrite or relabel the historical executed analyzer.

Artifacts: `/tmp/lc-windows-qa-72bf9a3/focused_replay.py`, `focused-results.json`, `focused.log`, and the exact exported analyzer/replay/report plus unchanged evidence under that directory. The earlier failure evidence in `/tmp/lc-windows-qa-6a3611e` remains untouched.

Limits: no GUI, database, signal, network, native campaign or private original-capture audit was performed. Provenance here is the committed evidence and recorded hash bindings; unprovided private capture files were not independently accessed. No repository or worker files were edited. Root owns integration and the single full delivered replay against the integrated analyzer.
