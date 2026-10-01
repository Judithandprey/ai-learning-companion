# Backend subscription terminal recovery — independent lifecycle review

**APPROVE, scoped lifecycle behavior.** Candidate `1b27a918f265349929d6344f0bbe163c6a854b99`, parent `2831480`, Windows integration source read at `db8d3d4`. No blocking issue found in QA-SUB-02 terminal recovery, receipt classification, replay/cancellation boundaries, or compatibility with the current Windows child-exit handling. Root separately owns streaming accounting and the integrated targeted test run.

Read the actual production/test diff, `docs/verification/backend/p0-04-subscription-recovery-streaming.md`, current D-SUBSCRIPTION-FIRST, ADR 0003 and workflow. PONYTAIL LITE: reuse the existing owner, process and IPC boundaries; preserve provenance, uncertainty, original records and explicit user control. No product changes in this review.

## Findings and interoperability

- The terminal event represents an unusable inner connection. `run_stream` races it against pending parent input and also checks the event directly before input admission, so a fatal inner client no longer waits indefinitely for a new parent line. Its one-second grace is followed by existing bounded owned-child cleanup and pipe flushing. It neither replaces the child nor replays an ASK.
- Once terminal, an ASK cannot bind/publish a late completed response; checks exist before binding, before final receipt completion and after that completion callback. Terminal ASK error envelopes are suppressed as well, allowing the desktop to observe loss rather than label an unknown outcome a known refusal. Healthy nonfatal errors retain the existing envelope.
- Terminal cleanup does not manufacture the user-cancel flag. Grace-expired entered work uses uncertain, reserved-but-not-run work uses not_submitted, and explicit Cancel/Stop keeps its cancelled local fence. Receipt submission/terminal facts remain distinct from the local outcome: a recorded local failure does not establish that no remote processing occurred.
- Existing Windows `lost()` clears the live child and settles outstanding work with no_answer; `ask()` maps that to uncertain, or cancelled with uncertainty when locally stopped/cancelled. Late results stay suppressed. The stopped-session set survives child replacement. Recovery requires a later explicit Check; no child or ASK is automatically replayed by this path.
- Connection/login error shapes and managed-auth ownership remain unchanged. No API-key fallback, credentials access or new provider/auth action is added by this leaf.

## Independent evidence

Exact archive: `/tmp/backend-subscription-1b27a91-y9i71opk`.

`/tmp/backend-subscription-recovery-probe.py` ran four entirely in-process synthetic cases through the actual bridge/run_stream, reusing existing FakeClient/LearningSpy fixtures. Production grace was shortened only in the isolated probe to 20 ms:

1. Entered ASK + terminal + pending parent input: uncertain receipt, no user cancellation flag, no answer/error envelope, one turn only.
2. Explicit Cancel + terminal: cancelled receipt, only the control acknowledgement, no late answer and no replay.
3. Explicit Stop + terminal: same conservative suppression and no replay.
4. Reserved ASK coroutine cancelled before it runs by terminal closure: not_submitted receipt, no provider work, no manufactured user cancellation.

**4 passed.** Parent input remained open in the stream cases; an additional queued ASK was ignored. All cases cleaned up with zero pending asyncio tasks. Results: `/tmp/backend-subscription-recovery-probe.json`. Scoped `git diff --check` passed. Author's real private-pipe and Windows fake-child test evidence was read, not counted as this review's execution. No broad suites were repeated.

No real Codex, account, provider, GUI, Windows process, network request, product state or credential operation occurred. Synthetic lifecycle checks do not prove real image inference or device acceptance. Next owner/action: Lead completes its separate streaming/integration checks, then QA performs the bounded released-candidate recovery and real-image acceptance already assigned.
