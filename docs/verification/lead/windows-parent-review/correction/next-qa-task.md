# One Windows app-parent behavior acceptance pass

This is the next bounded P0-07/P0-13 assignment for the existing QA owner,
conditional on Lead's exact integrated-source release in the native handoff.
It is not dispatched by this file alone. Keep prior capture/alignment/ink/API
acceptance evidence; do not replay their full campaigns.

## Outcome and scope

Demonstrate the real Windows app's explicit Start → changing original display
and editable ink → retained originals → local development capture service →
Stop → reopen loop. This is capture/storage acceptance only. The actual product
AI remains disconnected and both complete §7.1 gates remain open.

Read the released revision's complete affected R02/R03/R07/R08/R35/R36/R46/
R51/R52/R59, A12/A14/A26/A27/A30/A31/A44 and §3.9/7.1/7.2/7.4/7.5 original
and English clauses, current decisions, workflow, owner implementation report
and Lead correction evidence. Existing 0.2.1/0.2.4/0.2.9/0.2.10 contracts apply;
no protocol or production fix is delegated.

Write only `tests/e2e/windows/**` and `docs/verification/qa/**`; reuse the current
Windows runner/staging helper and independent analyzers. A narrowly scoped test
helper in that QA path may reuse released Backend read/guard functions. Backend
alone owns migrations: do not create/change migrations, schemas or grants outside
the explicit test app Start.

## Controlled execution

- Record source and staged-build hashes before launch. Use the existing pinned
  Electron and installed project Python/runtime; inspect current helpers first.
  Stage only into a new QA-owned location. Keep app `LC_USER_DATA`, TMP/TEMP,
  browser profile and artifacts isolated, with an observable foreground runner.
- Claim the shared Windows display through the substantive start reply and
  release it explicitly with owned process/window cleanup evidence. Earlier
  release evidence is not permission to terminate a new foreign app. If another
  owner/user is using the display, preserve work and report that concrete conflict.
- Use only existing local **`lc_p0_test`**, with `dedicated_test_dsn`, database,
  migration and actor guards. Obtain the existing DSN from its handoff file
  privately. It must never be printed/committed/in argv. No connection or action
  against `lc_desktop_preview`, preview ports 4173/8174, user sessions, Paperclip
  or unrelated services. Do not restart any existing service.
- Use a private exact-source Backend copy as the development host working
  directory, the existing WSL private-stdin launch path, and a fresh app actor.
  Record only non-secret identity/source/version facts needed for assertions.
  Cleanup, if performed, is restricted to this run's proven actor IDs after all
  its hosts exit; preserve failures and do not kill by process-name pattern.
- Whole-screen images may include private desktop content. Keep raw display
  evidence local; commit only inspected/redacted owned-course crops, hashes,
  context and necessary sanitized logs. Tokens, DSNs and real user data never
  enter evidence. Input method must be explicit: injected pen is synthetic,
  intentional mouse mode is mouse, neither establishes physical pen support.

## One changed-workflow pass

1. Verify default-off/local-only behavior, then enable the explicit development
   configuration for this test process. Before Start, no fresh grant or uploads.
2. Start the app on the currently visible QA-owned learning screen without
   importing a document into the app. Make at least three visible changes,
   including a second owned native surface. Observe automatic retained frames
   without repeated region selections. Record actual raw/composed pixels,
   timestamps, source/version/stream and explicit observed gaps/latency.
3. Exercise one short WRITE → partial erase → undo/redo → ASK finish/cancel back
   to WRITE → continue loop. Preserve the editable original and exact history.
   Confirm the app's storage status corresponds to actual server originals and
   frame batch/ACK, including immutable raw PNG, composed PNG and editable ink
   JSON bytes. No normal stroke/erase may trigger an AI answer. The UI must say
   no AI is connected.
4. Stop through the app. Check the synchronous no-new-send boundary, returned
   control state and actual host EOF/exit. Null server sequence boundary remains
   unknown; do not invent a precise last observed frame. Preserve known/unknown
   results instead of labelling every stored local frame acknowledged.
5. Close/relaunch the same isolated app profile, verify read/control-only recovery
   without automatic data replay or fresh consent, reopen the retained original
   and continue editing. Keep old bytes/history/source association intact.
6. Add one bounded controlled failure relevant to the new link, with a healthy
   control: unavailable child/service or coordination-write refusal. Verify local
   capture/original retention, truthful counts and no unwitnessed send. Do not
   repeat every portable fault probe or corrupt unrelated records. If an actual
   host fault cannot be isolated safely, report that part not run rather than
   substituting a mock for the interactive happy path.

Return a commit, exact runtime/source/staging evidence, concise actual results,
failure reproduction if any, start/access steps, original preservation and
owned-process/display release. Clearly separate native capture, synthetic input,
real local service/DB, and not-run physical pen/provider/Mac/audio/Notability.
Lead reviews the changed workflow evidence and routes any specific repair to
Web or Backend; do not implement a production fix without that handoff.
