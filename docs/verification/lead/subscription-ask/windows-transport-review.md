# Windows managed-subscription transport review

**Decision: REQUEST CHANGES.** Review candidate `68b4cd9344dc0a2b36f151b911c7f9c4f2a797d8`; report candidate `4944cc38091f5f53a175deefa58c69fe26391b32` has identical `apps/windows`. Backend interoperability read at `a46a00de960114b866fe70d3c7d7f2c552e8c95b` (corrected Backend/Learning integrated).

Scope: `src/main/subscription.ts`, `src/shared/subscription-ask.ts`, changed transport helpers in `capture-host.ts`, and owned transport tests. Main/renderer/crop/retention are a separate Lead review. PONYTAIL LITE applied: existing seams, bounded source review and targeted synthetic probes. No repository changes, display, Codex process, provider call, account lookup, login, credential access, purchase, or private screen capture.

## Findings

### W-SUB-T01 — P2 / blocking: successful login refresh can be dropped

`subscription.ts:212,269,273,280,352–356` discards account-change refresh while a check is pending. Login completion calls that same no-op check. A response that captured the previous auth state then becomes the final UI state.

Independent valid-envelope reproduction: start login; begin a held `connection/read`; receive `connection/changed` and matching `connection/login/completed {success:true}`; then the old read returns signed_out. Observed: **state signed_out, login none, model null, exactly one connection/read**. The new signed-in account is never read. This ordering is supported by actual Backend `chatgpt_rpc.py:533–558`: account is read first, followed by awaited model-list/quota operations; notifications can arrive during those awaits. The current flow then requires an unplanned manual Check after successful consent.

Minimal owner fix: coalesce one pending refresh or use a generation and rerun the read after an account-change/login-completion event. Do not start login or inference automatically. Cover both success and signed-out change while a previous read is pending, plus multiple events coalescing and child-loss/quit fencing.

### W-SUB-T02 — P2 / blocking: malformed cancellation receipt claims remote stop confirmation

`subscription.ts:398` treats every successful response except literal `uncertain:true` as confirmed. With the ASK reply `error.code=cancelled`, cancellation replies `{}`, `null`, and `{cancelled:true,uncertain:"unknown"}` each produce **`{status:"cancelled",uncertain:false}`**. The predicate also accepts Backend's valid no-active receipt `{cancelled:false,uncertain:false}`, which does not establish that this request was interrupted.

The normal actual Backend matching cancel emits `{cancelled:true,uncertain:boolean}`; Stop emits `{}` on success or `interrupt_unconfirmed`. The ASK cancellation error itself only fences local submission/presentation; it is not remote rollback proof. These probes are synthetic malformed/missing confirmation cases, not a claim that the current Backend normally emits malformed fields.

Minimal owner fix: retain the interrupt method alongside its promise and validate its exact success shape. `ask/cancel` confirms only explicit `cancelled===true && uncertain===false`; `session/stop` uses its documented empty-object success. Missing, wrong-type, no-active or lost cancellation responses keep uncertainty true. Preserve suppression of late answers and stopped-session tombstones.

### W-SUB-T03 — P3 / non-blocking cleanup defect: protocol fencing suppresses process-exit settlement

`subscription.ts:187–191` sets `child.gone=true` before EOF shutdown. `over()` at `156–159` then ignores the actual exit and never resolves `child.exited`. An overlong-output probe with a fake child that exits immediately on EOF still observes a kill attempt after `end_ms`; cleanup retains its additional two-second timeout. The existing size-limit test checks unavailable state but misses this lifecycle result.

Minimal owner fix: separate the read/protocol fence from process-exit settlement, or always settle the exit promise once even if already fenced. Keep bounded cleanup and the WSL-shim uncertainty distinction.

## Verification

- Exact archive: `/tmp/windows-subscription-68b4cd9-cpnehy26`; source files unchanged by this review.
- Focused owner suite `node --test --test-isolation=none tests/subscription.test.ts`: **17/18 passed in restricted sandbox**. Only the real synthetic Node-child pipe test received no output. Exact isolated rerun of that one test with approved execution outside the sandbox: **1/1 passed**. Thus all 18 cases pass when child output is available; this is not a product failure.
- Independent probe `/tmp/windows-subscription-independent-probe.ts`: **6 reproductions** (login race, four non-confirming cancellation receipts, exit settlement). Machine output `/tmp/windows-subscription-independent-probe.json`.
- Existing same-chunk login start/completion buffering, arbitrary-chunk UTF-8 line assembly, explicit WSL argv, controlled LC/WSLENV propagation, fixed error mapping, one active request, Stop no-respawn fence, and whole provenance equality were inspected; no additional blocker found in those paths.
- Changed `capture-host.ts` helper only exports existing functionality and clears completed wait timers. No independent regression found in that diff; T03 is the new caller's exit-state handling.

Synthetic tests establish local protocol behavior only. No actual Windows image inference, semantic image-only answer, app learning response, login redirect, physical desktop input, macOS device result or complete-product gate is claimed. Next owner: existing Windows/Web owner fixes T01/T02 and preferably T03, then a focused review of changed cases before the Lead/QA real-image slice.
