# Web known-follow-up review

**Candidate:** `0b42bbc1088cf48f2c8daf4dcf4b3ea885a566c5`, direct parent `0fae1350464de1dcd408f076316192d3840d35cb`; reviewed against ADR 0003 and integrated Backend at `28f67be`.

**Verdict: approve scoped partial adoption. No new blocker found.** W-KNOWN-CANCEL is closed in this source. W-KNOWN-END-BUDGET has correct waiting and in-memory reporting, but its already disclosed quit-report persistence remains open under Lead's separate Web handoff `7ae38cb`.

## Source findings

- `subscription.ts:540–555`: an unsolicited `cancelled` error now returns `uncertain:true`. A user Cancel/Stop still needs the exact relevant acknowledgement plus the cancelled ASK result before `uncertain:false`; late answer presentation remains suppressed. The new app-ASK test checks actual displayed text and retained outcome/shown values, rather than transport shape alone.
- `subscription.ts:115,239–258`: default EOF grace is 10 seconds, covering Backend's 8-second cleanup with WSL exit margin. Existing `endChild` still bounds the subsequent shim wait to 2 seconds. Shutdown promises remain chained per child. No automatic replacement or inference retry is introduced.
- `subscription.ts:140–144,166–172,239–258`: unconfirmed cleanup is retained per child. A later child cannot erase an earlier stuck shim; a late old exit updates only shim truth and still does not establish Linux connector/Codex reaping. Fixed status strings expose no child output, private paths or credentials. Login wording no longer mistakes local fencing for observed process exit.

## Bounded independent verification

Exact-source archive: `/tmp/web-known-0b42bbc-ybn6rsu7`.

Ran `/tmp/web-known-followup-probe.ts` with the existing Node 24.21.0 runtime, exit 0, four controls passed:

1. Unsolicited cancelled result is uncertain; a late answer causes neither another submission nor a new child.
2. Exact own Cancel remains confirmed and suppresses a late answer.
3. Exact own Stop remains confirmed, suppresses a late answer, and rejects a subsequent ASK from that stopped capture session.
4. Two fenced children finish out of order: one shim remains stuck after its deadline, another exits after forced cleanup. A third explicit Check does not clear old uncertainty; the first shim's late exit updates the wording without changing the live signed-in state, causing a read, sending inference, or creating another child. Natural shutdown of the third preserves that historical uncertainty.

The probe also asserts the 10,000 ms default constant. Machine outcomes: `/tmp/web-known-followup-probe.json` and `/tmp/web-known-followup-review.json`. Lead independently ran the 67 focused tests (including the real 8.2-second fake-EOF delay), TypeScript/build, and checked the 63 evidence hashes/log; those suites were not repeated here. Owner evidence reports 14 killed mutants; this review did not rerun mutations.

## Known incomplete work and limits

At application quit the windows are already closed and the current status exists only in memory. This is the previously disclosed completion gap, not a new transport finding. Keep W-KNOWN-END-BUDGET open until Web's existing quit path writes a sanitized lifecycle note and the next launch surfaces historical uncertainty, with truthful write-failure handling. Reuse the existing local state/receipt pattern; no process supervisor or new authentication layer is needed.

No repository edits, Windows process operations, GUI, account/login, private auth access or model/provider calls were performed. This review approves only the bounded source changes; it does not establish real image inference, visible app response, or remote process reaping.
