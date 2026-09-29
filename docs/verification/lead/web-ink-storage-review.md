# Web editable-ink persistence review

**Disposition: HOLD for WS1, a narrow persisted-document validation correction.** No second archive, framework or protocol redesign is required. Input/eraser/geometry/model semantics are reviewed separately by the other agent.

Candidate: main `9ec9feb8e15afd0ca4c2292b34e7fc2706d58782` archive plus only `git diff --binary c6e6cfce42ce02ff353c18178602fae397b4be92 366a994d2e4e90e528662d4f082bcf3f8e7eddc7`, successfully checked/applied in `/tmp/web-ink-storage-review-tmhratrz`. Main and worker files were not edited. Read background.js completely, inkStore/InkLayer save-load/held-document lifecycle, actual entry/Stop calls, related tests/interface and owner ink report. Refreshed affected original/English requirements R27/R29/R30/R46/R51/R58 and current original-ink decisions under workflow/PONYTAIL LITE; all eight relevant translation/source manifest hashes match.

## WS1 — unsupported/unreadable persisted documents can be overwritten, and an unreadable replacement can be acknowledged saved

Location: `apps/safari-extension/webextension/background.js:118–129,145–162`.

`inkConflict` only checks that stored history is an array and stored strokes an object, then compares their contents. It does not establish that the stored record is the supported format, belongs to its storage key, has a consistent revision/visible set, or is otherwise readable by the current consumer. Incoming validation is similarly partial. Therefore:

1. Start with a valid two-stroke document `D`.
2. Retain `D` in an already-open companion/tab.
3. The persisted record is now unreadable: independently mutate its `format` to `lc-web-ink/unknown`, its `revision` to `999`, or its `visible` to `[]`, keeping history and strokes. The actual `parseInk` refuses each.
4. The old companion saves `D`. Actual background code returns `{ok:true}` and replaces the unreadable record in all three cases. The advertised “unreadable record ... left untouched” guard is not enforced at the transaction boundary.

Also, a supplied `{...D, visible:[]}` preserves both protected collections and is accepted/committed with `{ok:true}`, but the actual `parseInk` rejects the resulting record when reopened. This can turn a readable original into an unusable saved document while reporting success.

These are controlled integrity/corruption and message-boundary probes, **not a claim that a normal website can invoke the extension's isolated-world APIs**. The present UI normally validates on load and produces valid model documents. That is insufficient for the separately promised stored-record check when another already-open tab saves after the stored state changes.

Minimum fix: before `pages.put`, validate the incoming complete supported document and the existing document (when present) against the expected page key, preferably reusing the existing validator without creating a competing schema. Reject and preserve unreadable/unsupported stored values. Keep the existing history-prefix/stroke-equality conflict checks and commit-only success. Add targeted regressions for the stored format/revision/visible cases and an incoming inconsistent document; no merge algorithm is requested.

## Boundaries checked without another finding

- Extension ID, top-frame and HTTP(S) sender restrictions; sender origin determines the storage namespace. Foreign origin cannot read the original namespace or save a document naming it.
- Exact address is computed in trusted isolated content code (`exactAddress`, then SHA-256 including nonempty query/fragment and excluding credentials). Background only checks the hash shape and sender origin; it **does not authenticate that hash against `sender.url`**. Its accepted caller may access another fingerprint on the same origin. Treat this as the existing internal content-script trust boundary, not URL-level authorization. A naive current-URL comparison would also reject legitimate queued old-address saves after same-document navigation; no such redesign is requested here.
- One readwrite transaction performs read/compare/put; success is emitted only by `oncomplete`. Prefix changes, a shorter history or modified old stroke are refused.
- The page-global queue survives companion Stop/restart, places restart loads after old pending saves, and recovers its tail after a rejection. Stop may finish local original persistence; this does not restart capture or authorize AI/provider transmission.
- Unsaved documents remain in the isolated-world keep map on Stop/address changes. Conflicts explicitly stay local rather than silently merge or overwrite the other tab. This is not cross-device/archive durability.

## Exact runnable evidence

Retained independent probe: `/tmp/web-ink-storage-probes.mjs`.

```sh
cd /tmp/web-ink-storage-review-tmhratrz
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node /tmp/web-ink-storage-probes.mjs
```

Result: **9 control groups passed; 4 malformed-state acceptance observations**, reproduced against actual background functions/message handler, actual `inkStore` queue function (Node's built-in TypeScript stripping), and actual `parseInk`. The small in-memory IndexedDB adapter supplies deterministic get/put/commit/abort events; this is not native browser IndexedDB or browser concurrency evidence.

Passed controls: initial/exact replay; sender/origin fences; changed stroke/history/shortened-history rejection; controlled abort with unchanged record; valid history append; detached reads; same-origin alternate fingerprint trust boundary; restart load ordering; queue recovery and conflict classification after failed save.

Observed failures:

```text
unreadable stored format:   accepted=true, overwritten=true
unreadable stored revision: accepted=true, overwritten=true
unreadable stored visible:  accepted=true, overwritten=true
unreadable incoming visible set: accepted=true, reopens=false
```

The existing packaging test command also exited 0:

```sh
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node --test --test-name-pattern='shipped extension folder' apps/safari-extension/tests/extension-entry.test.ts
```

No broad model test suite, browser, device, service, network, provider, real IndexedDB, or owner's 21-case browser campaign was run. Initial archive creation omitted `--binary` and correctly failed check on evidence PNGs; the retry used the complete binary delta in a fresh temp archive. Bare `node` was absent from PATH; the existing pinned project Node 24.21.0 was used, with no install.
