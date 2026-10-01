# Windows copy correction — APPROVE within assigned scope

Exact final candidate `41fd2cb2845c8139f9ec5a326d38ebf593e290f9`, direct parent `0bb23c46096107910dd0c121508063eb5a4f3ddf`, export `/tmp/lc-win-copyfix-41fd2cb`. The complete final delta changes two reason strings, explanatory comments, two corresponding assertions and report wording. No state transition changes. Previous `67a1da5` behavior review is retained in `/tmp/windows-qa04-0bb-review.md/.json`; its remaining wording hold is now closed.

**Five bounded groups pass on the final exact source:**

1. Existing ASK card stays conditional and unchanged across an upload stall; a fresh card uses the same conditional prefix. Its image remains visible and selected frame/time/ink description stays intact. No new native pixel comparison is claimed.
2. Stop retains unknown outcomes and clears affirmative storing state.
3. A lost-reply job whose copied original is subsequently missing remains unknown/stuck; an empty queue stays `stalled`, `stored=0`, `unknown=2`, `storing=false`.
4. Six `ECONNRESET` batch outcomes without ACK now produce “storage of the last send is not confirmed” both immediately and after queue exhaustion (`capture-link.ts:664`, `capture-link.ts:774`). The rendered control line no longer claims the upload was not stored. Persisted `unknown`, `in_doubt=batch`, and `stuck=true` are preserved.
5. A later fresh job receives one exact fake ACK accepted by the actual uploader; state becomes `sending`, `stored=2`, `unknown=2`, `storing=true`. The earlier stuck job remains unknown.

The coordinator/UI corrections therefore satisfy the reviewed W-COPY-01/02 cases, and the remaining uncertainty-wording defect is resolved. No further code change is requested in this scope.

Reproduce:

```sh
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node /tmp/windows-qa04-41fd-probes.mjs
```

Pinned Node v24.21.0, process exit 0, five of five bounded observations pass. Probe imports exact exported production and existing source-loading main/renderer harnesses; only fake Electron/browser, child and transport are used. The ACK is a contract-shaped fake validated by the production uploader. No GUI, actual Windows runtime, real child host, socket, database, provider, or broad suite ran. Root's integrated checks and subsequent real Windows QA remain separate; full-product acceptance is not claimed.

Artifacts:

- `/tmp/windows-qa04-41fd-probes.mjs`
- `/tmp/windows-qa04-41fd-probes.json`
- `/tmp/windows-qa04-41fd-probes.log`
- `/tmp/windows-qa04-41fd-review.json`
- `/tmp/windows-qa04-41fd-source-manifest.json` (83 exact exported production/test/helper/fixture/report files; SHA-256 for probes and historical failure evidence)

One initial attempt stopped before test execution because the narrow export omitted an existing Safari ink helper imported by the harness. Its error is preserved at `/tmp/windows-qa04-41fd-initial-export-error.log`; exporting the full immutable commit resolved setup, and the subsequent run passed. No dependency install or product fix was involved. Repository/worker files and original fixtures were not modified; previous failed evidence remains unchanged. PONYTAIL LITE and the prior complete affected-clause scope continue to apply.
