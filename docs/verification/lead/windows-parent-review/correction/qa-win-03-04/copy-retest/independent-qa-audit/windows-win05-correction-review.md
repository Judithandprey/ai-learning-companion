# WIN05-STATE-01 correction — APPROVE

Exact code `44fbd503bcbc45f4f3b28ff52d78e379ddbaf8c9`, evidence `d295a514b531e7fae5ad35df10b4bc10b43bf742`, parent `10cbae6`; export `/tmp/lc-win-win05-d295a51`. Reviewed only the corrective leaf: `capture-link.ts:734–736` now notifies after restoring `job.status = not_sent`; one owner regression covers this boundary.

**The same three independent probes pass (3/3, exit0):**

- Held ACK, then another pending upload and Stop: confirmed/unknown counts remain distinct; `awaiting` clears and Stop preserves uncertainty.
- Retry-witness write fails after three refused connections: no fourth upload; old journal remains byte-identical; direct status and last notification now both show unknown0/not_sent2/stored0, awaitingfalse/storingfalse, sticky sends_stoppedtrue.
- Typed refusal is announced before the follow-up state read waits.

The original finding is closed. No other production behavior is changed by this leaf. Reproduce:

```sh
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node /tmp/windows-win05-correction-probes.mjs
```

Probe/output: `/tmp/windows-win05-correction-probes.mjs`, `.json`, `.log`. Machine review and source/probe SHA-256 manifest: `/tmp/windows-win05-correction-review.json`; 66 files match the immutable export, whose Windows tree equals the code commit. The original HOLD report and failure artifacts are unchanged; old artifact hashes were rechecked.

Pinned Node v24.21.0; exact coordinator/uploader, existing fake child/transport and temporary fixture copy. No GUI, real child/socket/Backend/database/provider or broad suite. Root's integrated78checks/build and independent real Windows QA remain separate. No repository/worker edits.
