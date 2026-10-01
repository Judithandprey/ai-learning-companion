# Windows subscription selection/history review

**APPROVE, bounded source scope.** Candidate `0fae1350464de1dcd408f076316192d3840d35cb`, parent `84fc56a99a6e5c9dd98c39fb945cb93b573687ba`, integration baseline `868a91d94ef3c94a9b2b032f6014025ead941ba5`. No blocking finding in QA01/QA04/QA08 and the optional local presentation field. Exact Git source was exported to `/tmp/web-qa-subscription-0fae135`; repository and worker files were not changed. Applied project PONYTAIL LITE and affected subscription/ADR0003, original-screen/ink and disclosure requirements.

- **QA01 — fixed snapshot boundary.** `overlay.ts:765–815` captures pixel region, frame sequence/time/dimensions, exact editable ink JSON, ink session/revision and visible count before its first await. `compose` at line 249 synchronously draws the held bitmap and that ink to a new canvas; the cropped canvas has copied those pixels before asynchronous PNG encoding. Closing/replacing the sampled bitmap during encoding cannot replace this canvas or zero the saved dimensions. Existing main-side PNG geometry and exact ink-binding validation/content-addressed original storage remains intact. Stable held sequence/time are still read for later card wording; these are not live bitmap dimensions. An epoch guard rejects stale completion. ASK finishes back in its preceding input mode before submission; merely selecting/writing does not submit a question.
- **QA04 — no silent Unicode repair.** `subscription-ask.ts:61–67` rejects lone UTF-16 surrogates before main starts or records an ask (`main.ts:855–859`), with a fixed actionable message. Valid Chinese, emoji and combining characters retain their text apart from existing boundary trimming. Exporting the existing pure `hasLoneSurrogate` from `frame-ingress.ts:159` does not change the mapper or wire shape.
- **QA08 — missing presentation acknowledgement stays unknown.** `main.ts:754–759,922–959` adds optional `presentation` to the local `lc-windows-ask/v1` request record. An answer is initially `unconfirmed`, retaining its text and `shown:false`; only a positive overlay acknowledgement makes it `shown`. Loss of the overlay/finish does not erase that answer. Explicit negative acknowledgement/ordered card closure follows the existing cancellation path. Existing earlier answers/refusals remain unchanged. The old boolean retains its positive-only meaning; no released transport schema, ingestion field or Learning/mastery classifier changes. Absence of an acknowledgement is neither proof of unseen assistance nor proof of independent mastery; historical records without the optional field remain unspecified.

## Independent focused evidence

Ran only the four relevant actual-source regression/control tests, with pinned Node 24.21.0, in the exact export:

```sh
node --test --test-isolation=none --test-reporter=tap \
  --test-name-pattern='frame is replaced|holding half of a surrogate|whose overlay is lost|a selection is retained as its exact picture' \
  apps/windows/tests/app-ask.test.ts
```

**4 tests passed, 0 failed, 0 skipped; TAP duration 306.399354 ms.** Log: `/tmp/web-qa-subscription-frame-focused.tap`. The cases cover exact selection bytes/facts/ink and mode restoration; replacement and closure of the old bitmap while encoding is suspended; damaged Unicode refusal with connector untouched and valid multilingual control; and retained unconfirmed answer after overlay loss, with prior shown/refused entries preserved. The fake canvas now refuses a closed bitmap and records the source shade, so the snapshot regression exercises the intended distinction.

These tests execute the real main/overlay functions in fake Electron/DOM/canvas and synthetic connector infrastructure. They do not establish real Windows rendering, native ImageBitmap behavior, login, authorization, or provider inference. Connection/login transport is another reviewer's scope. Owner evidence audit and integrated suites belong to Lead; they were not repeated here. No GUI, provider, private state or external actions occurred.

Machine receipt: `/tmp/web-qa-subscription-frame-review.json`, including exact exported source and TAP hashes.
