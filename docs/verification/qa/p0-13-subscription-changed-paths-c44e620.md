# Managed-subscription ASK on Windows: the changed paths, retested offline at `c44e620`

- **Result:** in the released source, the corrections of QA-SUB-01 to 08 and the two lifecycle follow-ups behave as
  their owners describe, and each differs from the candidate `3e4b406` in the way the correction intends. 86 offline
  tests pass (21 + 37 + 28), three runs out of three, with the same evidence bytes in two runs.
- **This is not acceptance of the product.** Nothing was run on Windows, in a window, with the real connector launch,
  an account or a model. The display checks of these paths and the one real image turn stay NOT RUN (see
  [the plan](p0-13-subscription-ask-plan.md), sections 5 and 7).
- **Ten observations for the owners** came out of the retest (QA-SUB-09 to 18 below). None undoes a correction. Four
  are new with the corrections (QA-SUB-09, 10, 14, 15): at those points the candidate said more, or said it
  consistently. Two are marked for the lead to decide (QA-SUB-09, 16); a third is the lead's as owner of the bound's
  design (QA-SUB-17).
- **What "shows", "says" and "answered" mean below:** except in the app file, no window runs. What is read is what
  the app's class `Subscription` returns and tells its windows, and the answers are the stand-ins' text.
- **Assignment:** lead `handoff_8f88fafe46123912b38fbd3c432e322f` (combined release `8eac9fc`) and
  `handoff_e8b0cc78f1fd26c823c0101b2eebd8c9` (release `c44e620` for the same work). Earlier results at `3e4b406`:
  [p0-13-subscription-ask-windows-3e4b406.md](p0-13-subscription-ask-windows-3e4b406.md).

## What was tested

| | Commit | Role in the tests |
| --- | --- | --- |
| RELEASED | `c44e6204b3e0c49f710fc7bb73d540ef6daa7b06` | the source under test: `8eac9fc` plus the Windows lifecycle follow-up (of the product source only `subscription.ts`; two of the owner's test files changed with it) |
| FIRST_RELEASE | `8eac9fc02ebf10e2e2fca7c164b6c33c2f99698b` | the first combined correction; shown beside RELEASED where the follow-up changed something, and in two places to show that it changed nothing (the app's own Cancel and Stop; the retained controls) |
| BEFORE | `3e4b40654460a2dc2407f1d9be60d8e1a5b39a3e` | the candidate on which QA found QA-SUB-01 to 08: the negative control |

- **QA harness:** `team/qa` `ad33e77`. Each run takes the product source from `git archive` of these commits into a
  new folder and compares every file with the commit's blob id. The worktree's own `apps/` and `services/` are not
  used. The connector side (`services`, `packages`) of FIRST_RELEASE and RELEASED is the same tree.
- **Environment:** WSL2 Linux, Node 24.21.0, the project's Python. No `.exe` was started.
- **Evidence:** [p0-13-subscription-changed-paths-c44e620/](p0-13-subscription-changed-paths-c44e620/): one JSON per
  test file with what each case saw on each commit, the result counts, the tree ids and the sha256 of the harness
  files. A run in which any test fails writes no observation.

| Test file | Tests | What is the released source | What stands in |
| --- | --- | --- | --- |
| `sub_changed_app.test.mjs` | 21 | `overlay.ts`, `main.ts`, `subscription.ts`, the shared files | the owner's offline harness: fake Electron, fake canvas and bitmaps, fake connector |
| `sub_changed_bridge.test.mjs` | 37 | the `Subscription` class, over real pipes | QA's stand-in connector `qa_fake_bridge.py`; `spawn` and the browser opener are replaced (nothing is opened) |
| `sub_changed_backend.test.mjs` | 28 | the `Subscription` class and the connector `chatgpt_local.py` + `chatgpt_rpc.py`, as two real processes | the repository's own synthetic Codex app server; a relay where `wsl.exe` stands; the launch checks are replaced |

Run them with `node --test tests/e2e/windows/sub_changed_app.test.mjs` (about 3 s), `…/sub_changed_bridge.test.mjs`
(about 28 s) and `…/sub_changed_backend.test.mjs` (about 35 s). `QA_EVIDENCE=<existing folder>` writes the JSON.

The sign-in cases call the class's `login()` against a stand-in or the synthetic child only. No account and no browser
is involved, and no sign-in address issued by a real server: the two addresses are fixed test text on official hosts
(`chatgpt.com/qa-synthetic-not-a-sign-in`, `auth.openai.com/oauth/authorize?private=not-logged`), handed only to a
recorder and never opened. The product's sign-in was not touched.

## The corrections, before and after

| Finding | BEFORE (`3e4b406`) | RELEASED (`c44e620`) | Not shown here |
| --- | --- | --- | --- |
| **QA-SUB-01** frame replaced while the selection's picture is encoded | the selection is refused: "This selection cannot be asked about: the selection facts are malformed. It was not sent to any AI."; frame size handed over as 0×0; no record | the selection is kept with the frame held at pen-up (frame 41, 1280×800, the same picture and ink as a control); also after two replacements and with the ink changed meanwhile | Chromium's real bitmaps and encoder. The display probe `subselect` (16 plain selections) is still to be run |
| **QA-SUB-04** question with half of a surrogate pair | accepted, recorded and sent to the connector (8 damaged texts, 8 questions sent) | refused before anything is recorded or sent: "Not sent: the question holds a damaged character (half of a pair), so it cannot be sent as it is; type that part again."; a valid Chinese + emoji question then reaches the connector byte for byte | whether a lone half typed in the real window crosses the preload and IPC unchanged |
| **QA-SUB-05** wording of a failed account read / sign-in start | a question's words ("another question is still being answered", "ChatGPT did not complete an answer", …) | words about the read ("the connector is busy, so the account was not read; check again", "the account could not be read: the connector says ChatGPT is not signed in", "the account could not be read") and about the sign-in ("a sign-in or a question is already pending in the connector, so no sign-in was started", "the sign-in could not be started") | the sentences the control window builds from them |
| **QA-SUB-06** pending sign-in and its cancel | "cancelled" said at once, the cancel's answer never read; a signed-in read forgot the pending sign-in and questions were sent into a busy connector | "the sign-in is being cancelled" until answered; `{}` → cancelled; `invalid_request` → failed, "the connector no longer holds that sign-in; whether it completed is not known (check the connection)"; another error (`failed`, `busy`), a result of another shape or no answer within the bound → still waiting, "the cancel of the sign-in was not confirmed…", and a second cancel can be sent; a completion that arrives while the cancel is out is taken (signed in); a pending sign-in survives a signed-in read and questions are refused in the app with 0 reaching the connector; a refused address whose cancel is not acknowledged ends the connector (BEFORE kept it), and the user's Check starts a new one | a real sign-in; the control window |
| **QA-SUB-07** automatic reads after "changed" | goes on reading when "changed" comes after each answer (watched to 20 reads for one Check); with "changed" in the same write as each answer it also stopped after 4 reads | at most 3 in the 10 s window (4 reads with the user's), then the state `unknown` with "the account may have changed since it was last read, and it is not read again by itself; check again"; 20 more "changed" cause 0 reads; the user's Check recovers; 64 in all between two Checks | the 10 s window running out by itself; how many "changed" the real connector writes; the control window |
| **QA-SUB-08** an answer the overlay never reported | the answer text was kept with `shown: false` and nothing to tell it from an answer nobody could have seen | the same entry carries `presentation: "unconfirmed"`; a shown answer carries `"shown"`; refused, cancelled and uncertain questions carry no such key; the notice says "(an answer included, if one was shown or may have been)" | a real stalled or lost renderer |
| **QA-SUB-02** connector alive but dead after a fatal failure | the connector stays and repeats the old code (`unavailable`, `quota`, `failed`) to the question, to the next question and to the user's Check (after that the app itself refuses questions); 1 connector ever | the connector ends its own output and exits 0; the question is "uncertain" ("no answer came; whether ChatGPT worked on the question is not known"), the state not available; nothing restarts or re-sends by itself; the user's Check starts a new connector with a new inner server, no question is replayed, and a new question is answered. Shown for five kinds of fatal failure during a turn and for a loss while idle | the real launch (binary pin, configuration, state lock); `wsl.exe`; the card and the control window (the answer is the synthetic server's text) |
| **QA-SUB-03** turn with more than 4096 notifications | a 9000-delta turn is killed at the count and answered `unavailable` | the same turn is answered with its whole text (27,000 characters of the synthetic server), three times on one connector; lifecycle and byte floods far over the bounds still end the turn, and the connector with it: the question is "uncertain" and the state not available until the user's Check | the level of the two bounds (the synthetic floods are fixed far over them; the values 4096 and 32 MiB are read from the running connector); the card |

**The lifecycle follow-up** (RELEASED against FIRST_RELEASE and BEFORE, which are equal here except in the last row):

| Path | FIRST_RELEASE and BEFORE | RELEASED |
| --- | --- | --- |
| a question the connector ends as "cancelled" by itself (no Cancel, no Stop from the app) | `{cancelled, uncertain: false}`; the card says "Cancelled: no answer is shown." | `{cancelled, uncertain: true}`; the card adds "Whether ChatGPT stopped working on it is not confirmed; it may still have counted against your usage." The app's own confirmed Cancel and Stop stay `uncertain: false` on all three |
| the app's bound for a connector's end | 5 s: with the connector's end held back 8.2 s by the stand-in shim, the app ends the shim by signal at its bound without having seen the connector end, and nothing is said (QA's stand-in connector that needs 7 s is itself ended by signal) | 10 s: the app waits; the connector ends by itself, exit code 0, and nothing is signalled |
| a connector whose own end was not seen | nothing is said | the status keeps "a connector that was ended here did not end by itself in time; its wsl.exe shim was ended, which does not show that the connector, or the Codex app server it runs, ended in WSL" (or "…its wsl.exe shim did not end either, so it is not known that…"); nothing is started in its place by itself; the note stays after the user's Check |
| two wordings | "the connector ended before the sign-in completed" (both); "…so the connector was ended (check the connection to start it again)" (FIRST_RELEASE only: BEFORE kept the connector and said only "…so it was not opened") | "the connector was ended here before the sign-in completed" when the app ended it; "…so that connector is no longer used and is being ended (check the connection to start one again)" |

Durable reporting of an unseen end after the app quits is not in RELEASED and is not tested here. The owner's note for
it was integrated on main after RELEASED (`a35d250`, `75c2ac7`).

**Retained controls.** For the 16 questions of the display controls that reach the connector (the same stand-in script
and order as `subcontrols`), each commit's `Subscription` class, driven directly offline, returns identical outcomes
on the three commits. Cards and records were not compared. The 18 display controls were not run again.

## Observations for the owners

Each has a test that asserts what is observed, marked `QA NOTE` (QA-SUB-18: `CANDIDATE FINDING`) in the file; the
evidence key is given in brackets (`app`, `bridge`, `backend` name the JSON file). "Same" means the same on BEFORE.
Unless a window is named, "shows" is what the class returns and notifies.

| ID | Owner | What is observed at `c44e620` | Compared with BEFORE |
| --- | --- | --- | --- |
| **QA-SUB-09** | Backend; lead to decide | The private receipt and what the client class returns disagree on what is known. After a fatal failure during a turn the class returns `uncertain` and the receipt says outcome `failed` (six cases; in the one corrected receipt path both say uncertain). At the turn's time bound the class returns a known refusal (`failed`, "ChatGPT did not complete an answer") and the receipt says `uncertain`. [backend: `inner_ends_during_a_turn`, `deltas_9000_no_answer`] | after a fatal failure both said a known refusal. The time-bound half could not be compared (BEFORE ends that turn at the 4096 count first); by the source the same mapping is in BEFORE, not run |
| **QA-SUB-10** | Backend, Web | A synthetic usage-limit error during a turn ends the connector; the class returns `uncertain` and the state `unavailable` with no detail (the control window would say "Not available." by its source; not run). The usage limit is in neither the outcome nor the status detail, and after Check a new question is sent. [backend: `inner_reports_an_error_on_the_turn`] | BEFORE said "the subscription's usage limit was reached" (from a connector that then stayed dead) |
| **QA-SUB-11** | Backend | After 4096 requests to one connector it answers everything `unavailable` and stays alive; the user's Check cannot start a new one and the next question is refused in the app. The same shape as QA-SUB-02, not covered by its correction. Reach not measured: it takes 4096 requests on one connector in one app run, and each Check, question and automatic read counts. [backend: `unsolicited_cancelled`] | same |
| **QA-SUB-12** | Web | If only the connector's output closes while its process lives, the app notices nothing; a question waits its whole bound and ends "uncertain"; each Check waits its whole bound, says "the connector did not answer" and starts no new connector. [bridge: `only_the_output_closes`] | same |
| **QA-SUB-13** | Web, low | A connector that ends during the sign-in start is said, in the final status, as "the connector did not answer", not as ended. [bridge: `sign_in_start_unchanged.connector_exits`] | same |
| **QA-SUB-14** | Web, low | Refused sign-in address with an unacknowledged cancel: the class notifies once with login `failed` ("the connector was ended here before the sign-in completed") before login `refused_address`, though the app itself ended the connector. [bridge: `refused_address_unacknowledged`] | BEFORE did not end the connector; FIRST_RELEASE has the same extra notification with the older words |
| **QA-SUB-15** | Web | Refused sign-in address, and the connector ends on the cancel the app sends for it: the refusal of the address is never said (only "the connector ended before the sign-in completed"). [bridge: `refused_address_connector_ends_on_the_cancel`] | BEFORE said the refusal |
| **QA-SUB-16** | Web; lead to decide | After a connector whose end was not seen, the user's Check starts a second connector; where the process the app killed did not end either (a stand-in that ignores the signal), the first is still running beside it. The note is kept. With the real connector that would be two on one state folder, unless its state lock refuses the second: not shown here. [bridge: `connector_does_not_end`] | the second start is the same; only RELEASED says the note |
| **QA-SUB-17** | lead (the bound's design) | The 4th "changed" within 10 s turns an account just read as signed in into "not known" without reading it, and every question is refused until the user's Check. This is the bound as written; whether it is acceptable depends on how many "changed" the real connector writes for one real change. [bridge: `changed_after_the_bound`] | BEFORE went on reading (watched to 20 reads) |
| **QA-SUB-18** | Web, low | If the picture of a selection cannot be encoded, there is no card and no message, and the failure is an unhandled rejection. The failure is injected into the owner's page double; whether Chromium's encoder ever fails is not shown. [app: `CANDIDATE.encoding_fails`] | same |

Observed facts that are not findings:

- A frame taken between pen-down and pen-up is the one selected: the card names it, but the pixels can be newer than
  what was on screen when the circle began. Same with the `overlay.ts` of BEFORE put into the released tree (BEFORE as
  a whole was not run for this case).
- A question that is both damaged and too long is said to be damaged.
- The class `Subscription` has no check of its own for a damaged question; the refusal is made before it, in
  `submitAsk`. Any other caller of `ask()` would bypass it.
- With the browser unopened and the cancel unconfirmed, the status says the cancel's note while a question is refused
  with the browser's words. Both point to Cancel.
- Read once outside these tests, with the owner's control-page double at `8eac9fc`; not asserted here and no log of
  it was kept: the control
  window puts its fixed sign-in sentence before the new detail, so it can read "The sign-in did not complete. The
  connector no longer holds that sign-in; whether it completed is not known (check the connection)."

## Not tested, limits

- **Windows and `wsl.exe`:** whether the shim exits when the connector exits (the app learns of a loss only from the
  child's exit), and whether ending the shim ends anything in WSL.
- **The display:** QA-SUB-01 with real frames, QA-SUB-04 through the real window, the control window's sentences, the
  card for an unconfirmed answer.
- **The real connector launch:** `chatgpt_launch.py` is replaced in the Backend file, so the binary pin, the
  configuration check, the state lock and the per-question isolation reads do not run. No real Codex, sign-in, answer,
  quota or network.
- **Parts of the Backend correction's receipt handling:** one corrected receipt path is reached (a question cancelled
  by the connector's own close after a fatal failure: receipt `uncertain`). The three terminal guards in `_ask`, the
  `elif self.closed and self.client.terminal.is_set()` branch, `close()`'s own finish of a question whose task never
  ran, and the `cancelled` and `not_submitted` results of `_unfinished_outcome` are not exercised. Mutants of the
  guards, of the branch, of `close()`'s finish and of the `not_submitted` result pass; the `cancelled` result may be
  reachable and was not tried.
- **More than one unseen end:** what the note says when more than one connector's end was not seen is not shown
  (QA-SUB-16 is the path that makes it possible).
- **Seen once in scratch, not asserted and not in the evidence:** when the synthetic server refuses to start a turn
  and nothing is lost, the released connector waits 3 s and then ends itself; the class returns `uncertain` and
  `unavailable`, and the receipt says `failed`. BEFORE answered a known refusal and stayed. It is the disagreement of
  QA-SUB-09 on a path with no failure of the server.
- **Bounds by level:** the two QA-SUB-03 bounds, the length of the grace second, the read loop's yield during a
  flood, the app's 30 s and 300 s defaults, the 10 s change window by real time.
- **Absence over time:** "nothing starts by itself" is watched for 2 s in the bridge file (3 s and 1.5 s in two
  cases); in the Backend file it is read 300 ms after the quit, or at the next step with no wait.
- **FIRST_RELEASE** is run where the follow-up changed something and in two places where it must not differ.
  Elsewhere the connector side and the app file rest on equal blobs and tree ids; for the cases of the class
  `Subscription` (QA-SUB-05, 06, 07 and the client side of 02 and 03) it is not run in the committed files.
- **Independent recheck:** the first version of each file was verified by an independent reviewer with mutants, and
  its findings were closed. The recheck of the app file was completed. The recheck of the bridge and Backend files was
  stopped before it was complete (a command of each reviewer was refused and the session then ended). Both reviewers
  had run the files as they then were (9 passing runs each) and every mutant named in the fixes (all killed or
  disclosed), but not the three-commit, evidence and product-finding steps, nor all of their own mutants. The files
  were then edited again (comments, a time limit on the last hook, one test name, one check of the stand-in's
  self-test); those bytes were run by QA only: three passing runs of each file, the same evidence bytes in two runs,
  and a commit swap ([commit-swap-check.json](p0-13-subscription-changed-paths-c44e620/commit-swap-check.json)). With
  the FIRST_RELEASE column given the released commit, 2 + 6 + 6 tests fail (app, bridge, Backend); with the BEFORE
  column given the first release, 11 + 20 + 14 fail. So those columns run their own commit.

## At main as of `667c31f`, for information only

Run once with RELEASED pointed at main `667c31f474e6395697e1f56538e2bb4bbeaa949d` (not a released candidate; main has
moved since, with no change under `apps/windows`, `services` or `packages`):

- app file: 20 of 21 (only the source test fails, at its list of files that differ from FIRST_RELEASE: 16, not 3);
- bridge file: 35 of 37; the two that differ are the app's quit while a sign-in waits (main adds "; the app is
  closing: the connector is being ended") and the app's own end bound;
- Backend file: not comparable (9 pass, 17 fail, 2 end at their time limit). The file runs RELEASED's synthetic child
  under every connector, and main's
  connector and synthetic child have changed with the quota work. It needs to be adopted to the next exact release.

No conclusion about main is drawn from this.

## What remains

- The display checks of the changed paths and the selected-image turn wait for the same exact integrated candidate as
  the changed-flow pass, and for a display coordinated by the lead (plan, sections 5 and 7). Section 7 does not list
  them as cases of their own, and the selected-image attempt does not cover the live flow; how many real turns that
  pass may spend is open with the lead. The 18 controls are not repeated.
- The selected-image allocation `handoff_d548b28a9fa5613b7543be19858a5ca2` is unused: 0 of 1.
