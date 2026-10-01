# QA launcher complete-snapshot correction

**APPROVE bounded source integration.** Code `0e210edf219744e49b3b4a96fe262831bac01f29`, report `706141489ffae093f263d7f8665d14a3083681d8`, reviewed against main `28f67be`. The prior QA-LAUNCHER-IDENTITY-04 caller-filter finding is closed; no new blocking finding in this delta. Applied project workflow/PONYTAIL LITE, preserving the user's entry/profile and uncertain process state. This is not corrected Windows runtime acceptance or display/provider release.

## Closure and preserved guards

- `signin_launcher.mjs:93–103,190–192` obtains `look` and `signal` from the new `windowsCalls` wrapper and passes that same complete look to `releaseOwned`. Child filtering through `launches` occurs only in the pre-start refusal check. There is no post-query `--type=` filter before cleanup.
- `signin_cleanup.mjs:119–131` checks the remembered PID/creation identity before placing an otherwise foreign row in `children`. A remembered launch whose command line changes to include `--type=` therefore remains `not_revalidated`, even when its executable becomes unreadable. It cannot become “gone” merely because the caller classified it as a child.
- Never-remembered, readable child rows with a known creation time are reported separately and are never signalled. An unknown creation time remains unresolved; `launches` keeps that row and preflight refuses. This reports launch cleanup, not a claim that every Electron descendant has exited.
- Existing exact executable/whole-argv and creation-time guards remain. The wrapper preserves the five signal outcomes and rejects malformed output. The unchanged generated signal command retains its handle-before-reread and exact identity checks; no generic PID-only taskkill is introduced. Unknown ownership or failed inspection retains the private check directory. The original prepared entry/profile remains separate.

## Focused independent evidence

Executed `/tmp/qa-launcher-complete-snapshot-probe.mjs` with pinned Node 24.21.0. **Five pure observations passed**, without invoking Windows or process APIs and without deleting a directory:

1. Exact previous caller filter plus the current helper still reproduces false `confirmed`/removal for a remembered identity changed to `--type=renderer` (negative control).
2. Current actual `windowsCalls` wrapper plus helper returns `unknown`, zero signals, no removal, and `not_revalidated:[741:2000]` for that same transition.
3. The same transition with unreadable executable also stays unknown with zero signals/no removal.
4. A never-remembered child control remains separately reported, while a disappeared launch can be confirmed without signalling the child.
5. A child with missing creation time is retained by the preflight filter and leaves cleanup unknown, with no signal/removal.

The five exported changed source/test files match exact Git bytes; hashes are in the JSON report. Scoped `git diff --check 0e210ed^ 7061414` passes.

Read the new permissioned launcher tests completely. They run the actual caller with only `node:child_process` and copy operations replaced by the textual Windows double; the child Node has no subprocess permission, a nonexistent PATH and temporary HOME, and writes only inside its test directory. They assert unknown/retained/exit-3 for the previous gap, the ordinary confirmed/removal control, and preflight refusal. The changed helper declares 39 tests and the launcher 3, agreeing with the report's 42. **Lead independently reports exact-archive 42/42 passing in 21.252 s**; this reviewer did not repeat the suite. Owner's 24-mutant claim remains author-attributed, not independently reproduced here.

The report accurately keeps the earlier 35-test and 30-argv/headless-sleeper evidence historical and says the corrected launcher itself was not run on the display. No Windows launch, real process inspection/signal, GUI, login, authentication or provider operation occurred in this review.

## Integration lineage

Integrate the six ordinary author leaves in order: `85d79e6`, `a926e91`, `b583969`, `87c1599`, `0e210ed`, `7061414`. Main currently contains none of them, per Lead. Preserve both prior HOLD reports as history; do not merge the branch/adoption merges `4d5c81f` or `75fa327`.

Evidence: `/tmp/qa-launcher-complete-snapshot-probe.{mjs,json,txt}` and `/tmp/qa-launcher-complete-snapshot-review.json`. Exact source export: `/tmp/qa-launcher-complete-0e210ed`. No repository or worker files changed.
