# Windows editable-ink mapper review: 46dbb90

Decision: HOLD only the new mapper's contradictory `ink_original` metadata guard; valid-path snapshot binding and artifact evidence are approved within their explicit fake-canvas limits. This is a small malformed-manifest correction, not an ordinary-client exploit or a demonstrated normal-writer loss.

Exact candidate `46dbb9023768d7d738b84ffca4d8f8c725b02953`, parent `f277362b5f13a0681a6cd9e5ea5f04e67b05ed86`; read-only export `/tmp/windows-ink-mapper-46dbb90`. Current guidance and affected full original/English R46/R51/R52/R59, §7.1/7.2/7.4 and A26/A30/A31/A44 were refreshed at lead main `6036026`, rather than the worker's historical bootstrap root documents. Applied PONYTAIL LITE with existing pure APIs, the focused file and one five-case malformed-input probe. Core storage/overlay correctness and API/Learning composition are owned by the other assigned reviewers.

## Blocking correction: conflicting refusal is silently lost

Low/P3, `apps/windows/src/shared/frame-ingress.ts:259–260`, `inkOriginalOf`.

The refusal branch requires exactly one key; the retained branch only tests `file`, `sha256` and `bytes` and therefore also accepts a contradictory object carrying `refused`:

```js
ink_original = {
  ...validRetainedOriginal,
  refused: 'synthetic failed original retention'
}
```

With the unchanged first `harness-ink` plan entry, `frameRequest` returns a request carrying the editable-ink artifact and no warning containing that refusal. The exact `{refused: reason}` control correctly refuses the binding. The record's malformed union is silently interpreted as successful retention instead of being refused.

Reproduction (no filesystem mutation outside /tmp, no transport):

```sh
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node /tmp/windows-ink-mapper-negative-probe.mjs
```

The probe reuses exact committed manifest/plan data and changes only the selected manifest object's `ink_original`. Results: valid retained → accepted; exact refused → MappingRefusal; combined retained+refused → accepted with the ink artifact and omitted refusal; wrong path → MappingRefusal; null → MappingRefusal. Input plan bytes remain unchanged. Results and log: `/tmp/windows-ink-mapper-negative-results.json`, `/tmp/windows-ink-mapper-negative.log`.

Minimal owner correction: require the retained variant's exact `{file, sha256, bytes}` keys, or at minimum reject any `refused` member alongside retained fields. Retain absent-field legacy handling and exact refusal handling. Add this one mixed-variant regression to the existing malformed-original table. No wire or storage change is needed. Main's normal writer produces disjoint variants, so this is specifically the advertised malformed-input boundary, not proof of current healthy-data loss.

## Positive verification

- Verified 72 exported Windows/evidence files against exact Git blobs. No repo or worker writes.
- Executed the focused mapper file with pinned Node 24.21.0:
  `node --test --test-isolation=none --test-reporter=tap tests/frame-ingress.test.ts` from `apps/windows`: **23 passed, 0 failed, 176.268448 ms**. Log `/tmp/windows-ink-mapper-23-direct.log` contains all named cases. The default isolated runner initially summarized only one file-level pass; that summary was not used as 23-case proof.
- Those cases establish exact emitted fixture bytes, unchanged source/sample facts and unknown clocks, source/size/hash/length refusals, later-document binding refusal, raw-only/refused/unbound/old-original distinctions, gesture and pending-evidence reporting, and malformed basic types.
- Released Python checker passed native, harness and harness-ink against the documented exact contracts at `f276dad`. It validates request/binding schemas, canonical round trips, retained file hashes and sizes, and all four new ink-original readbacks. Log `/tmp/windows-ink-46dbb90-checker-output.txt`. No API/Learning composition was run by this reviewer.

## Artifact results

The new body is **13,015 bytes**, SHA-256 `64aa289799e9a61aac6b35763e96a084dae0e19bff6d89fda787fab91f3c3af4`; manifest SHA-256 `4a144991049fdecc17a9988bacec21b275405d4a984347cab82a64beebd4b650`. Metadata and actual bytes agree.

Four retained records bind three exact ink files, revisions **0, 1, 1, 5**, lengths **439, 2746, 2746, 7395** bytes. Session, revision, visible IDs, replayed history and artifact bindings agree. The delayed third frame retains the second frame's revision-1 bytes rather than the later document. Revision 5 preserves `add, add, erase, undo, redo`; the unfinished y=320 gesture is absent from committed ink and explicitly reported.

Old request bodies remain byte-identical to the parent:

| Body | Bytes | SHA-256 |
| --- | --- | --- |
| native | 17563 | `56bdab1231dfacea3c149f123591afca781f773ab86d090aa3fab27b4743f1fe` |
| harness | 11188 | `60f8c85446fcc915668560d5a09f92af207fe87faecb76ba6d3dfbb9e147d64f` |

The native body's old placeholder editable-ink binding remains metadata-only, with no invented original. The new harness has actual editable-ink bytes; the old harness body is unchanged.

## Evidence limits

These new frames are generated with the real modules under Electron/capture/canvas fakes. All four raw/composed PNG pairs are byte-identical per frame, and decoded RGBA hashes differ from the fixture's declared `pixels_sha256`: fake `stroke()` does nothing, readback is synthetic and PNG encoding is uniform shade (`tests/overlay-page.ts:101–115,127–130`). This is consistent with the disclosed fake boundary; it proves snapshot retention/binding, not actual pixel composition or native rendering. Make that pixel limitation explicit wherever the fixture is described as composition evidence. The checker verifies visible count, not rendered stroke identity; the separate artifact audit checked document visible IDs/history. Context-picture files are absent from this capture fixture, as disclosed in the owner report at lines 338–339.

Pure mapping trusts retained facts and supplied original bindings; it performs no file read, upload, ACK or external identity bootstrap. Missing/old originals and facts absent from released wire versions remain explicit in `unrepresented`. No native display, database, network/provider, API/Learning integration, full 99-case suite or compile campaign was run. This review does not pass either §7.1 gate.

Machine evidence: `/tmp/windows-ink-original-mapper-source.json`, `/tmp/windows-ink-46dbb90-artifact-audit.json`; small reproducible probe and focused logs are named above. Originals are unchanged.
