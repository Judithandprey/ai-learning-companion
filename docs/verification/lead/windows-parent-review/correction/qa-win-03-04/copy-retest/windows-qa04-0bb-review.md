# W-COPY-01/02 continuation — HOLD for one wording correction

Candidate `0bb23c46096107910dd0c121508063eb5a4f3ddf`, code `67a1da5e6de69eabbfe6f0c1d0e80939c7077202`, compared with `70cb7e872e1cc7826d5b108ccc006b758d3cfb70`; exact export `/tmp/lc-win-copyfix-0bb23c4`. Canonical main `6ef0faa`. Both original defects are fixed. The remaining hold is confined to two newly added outcome strings and tests requiring them; no state redesign is needed.

## Original corrections: pass

- **W-COPY-01:** The development ASK card now says what the service may do and points to the control window. It no longer asserts current storage. The prior open-card probe passes across a stall: text stays identical and conditional, image remains visible, and its frame/time/ink description is unchanged. A newly made card has the same conditional prefix. The source diff leaves image selection/composition and immutable context construction unchanged; this is not a new native pixel comparison.
- **W-COPY-02:** `unanswered` is retained when a job becomes stuck; `rest()` does not convert queue exhaustion into answered storage. The prior unknown/missing-original probe (using a connection-reset variant) remains `stalled`, `storing=false`, `stored=0`, `unknown=2`. Later fresh records receive one exact fake ACK validated by the actual uploader: `sending`, `storing=true`, `stored=2`, while the first two records remain unknown/stuck.
- **Stop control:** Stop preserves unknown records and leaves `storing=false`. AI remains explicitly disconnected.

## Remaining W-COPY-03: unknown is stated as definitely not stored

`apps/windows/src/main/capture-link.ts:773` renders “the last send was not stored (no answer, or the service said to send it again later)”. `rest()` at line 664 repeats “the last send was not stored”. `src/renderer/control.ts:318` puts that detail directly in the visible control line.

The bounded probe's batch transport throws `ECONNRESET` on all six attempts. No batch ACK is received. The real coordinator correctly persists `status=unknown`, `in_doubt=batch`; after one original is removed from the probe's own copy, it also sets `stuck=true`. Nevertheless the control line says both:

> 2 not known whether stored ... the last send was not stored

The second statement cannot be inferred from a lost reply. The actual uploader's existing contract/comment explicitly keeps missing answers unknown because a commit could precede them. This finding does not claim a real server committed in this fake transport, and does not change the correctly retained unknown journal status.

**Small owner correction:** replace both strings with unknown/unconfirmed wording, such as “the last send was not confirmed as stored”; align the nearby comments and tests currently requiring the false string. Keep the reviewed state transitions, later ACK recovery, original bytes and Stop behavior. A typed retryable response also does not justify globally converting unknown to known non-storage.

## Evidence and limits

Five bounded observations completed, exit 0: four positive groups and one remaining-defect reproduction. Exit 0 means these observations were established; it is not overall approval. Reused the old probe and exact exported helpers; no broad campaign.

```sh
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node /tmp/windows-qa04-0bb-probes.mjs
```

- Probe: `/tmp/windows-qa04-0bb-probes.mjs`
- Complete stdout/results: `/tmp/windows-qa04-0bb-probes.log`, `/tmp/windows-qa04-0bb-probes.json`
- Machine review: `/tmp/windows-qa04-0bb-review.json`
- Hash manifest: `/tmp/windows-qa04-0bb-source-manifest.json` — 66 production/test/fixture/report files byte-equal to the immutable candidate; old and new probe hashes included.

Pinned Node v24.21.0; existing source-loading main/renderer harnesses, fake Electron/browser objects, fake child and transport. No GUI, native Windows runtime, real child, socket, database, provider or full suite was run. The positive ACK is a contract-shaped fake checked by the actual uploader, not real Backend evidence. Owner-reported suites and real Windows unavailable-service run remain owner evidence. No project files were edited; old expected-bug evidence is preserved.

The complete production diff and changed tests/owner report were reviewed. Canonical affected requirements/workflow/role files have no changes from the preceding review baseline `05465cc` to `6ef0faa`; prior R03/R08/R35/R36/R46/R59 and A14/A26/A30/A31/A44 scope remains. PONYTAIL LITE: reuse the existing harness and fix only the demonstrated wording; no new manager, protocol or platform campaign.
