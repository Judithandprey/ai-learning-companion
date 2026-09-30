# Web ink recovery correction — bounded independent review

**HOLD `32b7768df7411ac7557f8d44ca546e9fe1ea625c` for two concrete corrections below.** The ordinary conflict path preserves both editable branches, but an already-open document becoming unreadable still loses new work on reload, and malformed copy metadata can receive a false successful-save acknowledgment.

Candidate: exact main `8c50587e1eb80e1e108c56bbd45ce12dd82f070d` plus **only** `git diff --binary c88b5f2 32b7768`; successful apply check/application in `/tmp/web-ink-recovery-review-njw496n7`. Reviewed ink-layer.ts, ink.ts, ink-worker.ts, shipped background.js/ink-format.js, actual inkStore messaging queue and changed retention tests/harness. The separate capture reviewer owns QA-EXT-03; no duplicate capture campaign here. Read prior lead ink/storage/correction reports, QA's exact 1616cce report and complete affected original/English R46/R51/A27/§7.1–7.2. Current workflow/PONYTAIL LITE applied. No main/worker edit, commit, browser, listener, network, provider, actual IndexedDB, database or user-preview access. Existing native CI dirty patch remains untouched.

## IR1 — record becomes unreadable after load: new ended strokes remain tab-only and disappear on reload

Locations: `apps/safari-extension/webextension/background.js:172–175`; `src/ink-layer.ts:252–279,292–308`.

The background properly refuses and preserves an unreadable existing main/copy. However, it returns an ordinary failure; the layer only creates a separate recovery copy when `failure.conflict` is true. The `mainWritable/loadFailed` copy selection at line 266 reflects the earlier **load**, not a later refusal. A new change, retry, Stop or same-page address return therefore keeps trying the unreadable target rather than saving the complete known editable document into a new record. This differs from actual storage failure: the store is working and a separate record is writable.

Actual controlled composition reproduction:

1. The real layer saves A1 through the actual extracted inkStore queue and shipped background/ink-format.
2. Replace the stored record's `format` with `other-version/unreadable`, preserving its raw contents otherwise, while the already-open layer retains its valid A1. This is controlled corruption/unsupported-version input, as in QA's existing corrupted-after-load case.
3. End A2. Background refuses; layer reports `failed`, two strokes visible, Export available, **zero durable copies**.
4. Reopen with a fresh layer/empty keep map (the reload boundary): **zero editable strokes** reopen. The unreadable raw record remains unchanged.
5. The same issue affects an already-open separate copy: after a normal conflict created A1+A2, corrupt that stored copy, then add A3. It reports failed with three strokes visible; reload shows only the main branch, one unreadable copy and no recovery copy containing A3.

Observed probe output:

```json
{"case":"unreadable_after_load","beforeStatus":"failed","beforeStrokes":2,"durableCopies":0,"reopenedStrokes":0,"rawUntouched":true}
{"case":"unreadable_copy_after_load","beforeStatus":"failed","beforeStrokes":3,"reopenedOnlyMain":2,"unreadableCopies":1,"rawUntouched":true}
```

Narrow owner correction: distinguish refusal because the stored target is unreadable from a quota/transport/commit failure, and preserve the complete current document in a separate readable copy without changing the unreadable record. Apply it to current and held-document completion paths, including a late refusal after Stop/address change. Do not merge branches, overwrite raw records or relabel an actual storage failure as saved. Regression: unreadable-after-load **main and copy**, exact raw preservation, whole original/history recovery after reload, plus the late held-document path. Existing “unreadable at initial load” and normal conflict controls must remain passing.

## IR2 — copy `kind` override is acknowledged saved but produces an unreadable record

Locations: `apps/safari-extension/src/ink.ts:292–311`; `webextension/background.js:155–158,184–189` (also present in the generated ink-format.js).

`isCopy` validates selected fields but accepts an extra `kind`. `copyRecord` constructs `{ kind: INK_COPY_KIND, ...copy, doc }`, allowing that extra field to overwrite the supported discriminator. Actual background accepts the following incoming copy description alongside a valid complete document:

```js
{ id: '0123456789abcdef', reason: 'conflict',
  created_at: '2026-09-29T17:00:00.000Z', forked_from: null, forked_at: 0,
  kind: 'unsupported-copy-kind' }
```

Its transaction commits and returns `{ok:true}`, but its own `parseCopy` immediately refuses the retained record. Reopening lists it as unreadable rather than an editable saved copy:

```json
{"case":"copy_kind_override","saveAcknowledged":true,"storedKind":"unsupported-copy-kind","reopens":false,"unreadableCopies":1}
```

This is a controlled malformed-message/data-integrity boundary, **not a claim that ordinary website JavaScript can invoke the isolated extension API**. It repeats the prior WS1 false-success/unreadable-write class in the new copy envelope.

Narrow owner correction: reject the reserved override or build the persisted envelope from the validated explicit copy fields with an invariant supported discriminator. Ensure an acknowledged incoming copy is readable by the same reader for the same page/id. Preserve strict existing-record refusal, history-prefix and original-stroke guards. No general schema/framework is needed. Regression: this exact extra-kind message must either be rejected without writing or commit a supported readable copy; valid copies/replays/extensions must still work.

## Independent controls and checks actually run

- Actual layer + extracted **unchanged** `inkStore` function + **shipped** background/ink-format against controlled DOM and deterministic in-memory IndexedDB: normal main conflict saved exactly one whole separate branch, retained the other main branch byte-for-byte and reopened the copy successfully:

```json
{"case":"normal_conflict_control","copies":1,"mainUnchanged":true,"branchReopened":true}
```

- Focused delivered checks:

```sh
cd /tmp/web-ink-recovery-review-njw496n7/apps/safari-extension
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node --test --test-name-pattern='conflict|unreadable|failed save|empty page|export|refused save|cannot be loaded|cop' tests/ink-layer.test.ts tests/background-ink.test.ts
```

Exit 0; reporter showed **2 test-file groups, 0 failures/0 skips**, duration 60.53 s (the export URL revocation timer remains alive for 60 s). Do not relabel this as the owner's 167 independently observed unit cases. The focused sources cover normal conflict/reopen/edit, initially unreadable/unloaded records, failed-save/export, Stop/address holding, prefix/commit/foreign-sender guards. No old input or full browser campaign was rerun.

- Generated bundle check:

```sh
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node /tmp/web-ink-recovery-review-njw496n7/apps/safari-extension/scripts/build-webextension.mjs --check
```

All five outputs current: content.js, ink-format.js, icons 48/96/128. Initial check failed because the partial scratch archive omitted root package.json's ESM setting; adding that **exact file from main8c50587** to scratch resolved it. No candidate source or configuration was changed.

## Portable reproduction and limits

Probe retained at:
`/tmp/web-ink-recovery-review-njw496n7/apps/safari-extension/tests/review-recovery-probe.ts`

```sh
cd /tmp/web-ink-recovery-review-njw496n7/apps/safari-extension
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node tests/review-recovery-probe.ts
```

It imports actual `createInkLayer`, extracts actual inkStore through Node's built-in TypeScript stripping, and executes the actual classic background/ink-format in a VM. `review-layer-helper.ts` and `review-background-helper.ts` retain/adapt the delivery's minimal DOM and deterministic IDB test helpers; no production implementation is replaced. The helpers supply an owned synthetic origin/hash and native-like message/commit completion. Probe exit 0 means the documented defects and positive control were reproduced, **not product acceptance**.

The owner-reported 28 browser ink cases and 32 capture cases remain owner evidence. The failed-save export is a complete JSON document/copy description; its UI says “Export started”, not completed download/import. Actual browser download, Safari runtime, native IndexedDB concurrency, Pencil/finger, provider receipt and Notability import are not independently established here. Main integration and one exact-candidate QA behavior pass remain lead-owned after these narrow corrections.
