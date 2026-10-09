# Windows: the test's source-admission interlock (opt-in, QA path only)

2026-10-09. Existing Windows P0-12 / live-consumer task, lead `handoff_18b4ff71bb8202171b38c72be18194e1`.
It answers Support's F3 on the nonvoice live driver: after Start, frames were taken and requests sent between the
QA driver's explicit steps, without a fresh full source admission
([Support review](../support/nonvoice-live-b8f0d9c-review-20261009/README.md) F3,
[lead review](../lead/live-windows/nonvoice-driver-review/README.md)). The lead chose prevention sequencing, not an
asynchronous monitor. This change makes the app wait for the test's checker at each step.

The interface was proposed in `handoff_1b7f16285d35144c7c876d11402e08a8` and accepted with refinements in
`handoff_65d44351ffdfa6c2126f9f94ab6687f3`. The overlay binding was added by the lead in
`handoff_f9c208600bcc9b8d39ba033019464857` (main `73488f5`). It is published as the lead's
["Checker interface decision"](../lead/live-windows/nonvoice-driver-review/README.md#checker-interface-decision--source-implementation-only)
at main `4f7d9fa`. Requirements read at main `93697b4`: §7.1 (Start, Stop and fencing, the two evidence gates), R35,
R36 and R59 in `docs/requirements.en.md`.

**Status: source and Linux offline checks only.** Nothing was run on Windows, on a display, with an account or
model, with a microphone or with sound. No package was built or launched. QA's checker does not exist yet; every
check here uses a stand-in checker.

## What it is, and what it is not

- **Off in the product.** Without `LC_SOURCE_ADMISSION` the app behaves exactly as before; no path gains an await.
- **On only for one test launch.** The QA runner writes one pinned configuration file and sets `LC_SOURCE_ADMISSION`
  for that app process only. If the variable is set but the file is unreadable or invalid, every Start is refused
  with the reason, and nothing is captured. There is no fallback to running unchecked.
- **Trust.** Only the main process reads the configuration, once, at app start. No window, captured pixel, IPC
  message or request chooses the command, its arguments, a decision, or whether the check runs. The overlay can only
  ask main; main asks the checker; only the checker's `allow` lets the app go on.
- **Not a product feature, contract or wire change.** No shared contract, connector envelope, permission or
  dependency changed. `lc-source-admission/1` is a private test adapter.

## Where the app waits

| Step | Code | Asked | Without "allow" |
| --- | --- | --- | --- |
| Arm | `lc:arm-capture` (main), before `getDisplayMedia` | checker started and ready, then `arm` with the chosen display and this capture's overlay window | not armed: no stream; the capture ends |
| Before a frame is taken | overlay `takeSample`, before its only `createImageBitmap(video)` | `pre_acquire` with that sample; main issues a one-use ticket | no frame is taken; the capture ends |
| After it is taken | same, after the grab and its RGBA SHA-256 | `post_acquire` with the ticket, `frame_seq` = that frame's own number, raw hash and size | the bitmap is closed unused (never shown, kept, looked at, circled or sent); the capture ends |
| Every intake of a frame | main `retainFrame`, `lookFrame`, `retainSelection`, `submitAsk` | nothing new: the frame's number, raw hash and size must match an admitted taking | refused, nothing of it written; the capture ends |
| Every send | shared `sendTurn` (looks, a circle's own hint, follow-ups) | `send`, naming the frame's admitted taking, the request id and the SHA-256 of the exact PNG sent | not sent (`subscription.turn` never called, recorded `not_submitted`); the capture ends |

After every wait, the main process and the overlay check again before acting:

- whether this is still the current capture and it is not ending;
- whether the AI session is the same one and has not ended;
- whether the request was cancelled.

A Stop during any wait takes, keeps and sends nothing; that is not a violation. A decision waiting in the queue
behind the one that is out is withdrawn (never written) when its purpose no longer holds.

**Frame numbers.** `frame_seq` in the protocol is always the overlay's own number of a frame it took (`HeldFrame.seq`,
the sample it was taken in). It is never the AI session's renumbered `LiveContext.frame_seq`. A reused frame keeps
its number, hash and size. Main records both numbers in its record for correlation (`ai_frame_seq`). The tests
check this with frame 4 of the capture being the session's frame 2.

**Lineage.** The admitted taking travels with every `Frame` (`source`). This covers:

- retained frames;
- the first look;
- a circle's frame;
- a follow-up on the same reused frame;
- a delayed or coalesced look.

The picture sent is the composed PNG (frame plus ink) whose bytes main hashes as before. Its ink revision and ink
hash are recorded with the send decision.

**The overlay window.** At arm, main tells the checker which window is this capture's overlay:
`overlay: {pid, hwnd}`. `pid` is `process.pid`; `hwnd` is the positive decimal number of
`s.overlay.getNativeWindowHandle()`. Both come from main, never from a window, and are never found by title. Every
request has the member; it is null in every phase but arm. It is echoed exactly and does not change for that capture.

**What the runner can read.** Only with a check configured, the existing read-only `lc:session-state` answer of the
control window carries `source_admission: {capture_id, overlay, active}`:

- `capture_id` is the capture's own id. It is not `session_id`, which is the overlay window's id.
- `overlay` is `null` until arm.
- `active` is true only while that capture is current, not ending, its arm was admitted and there is no violation.
- After the capture's end the member is absent.

There is no new command and nothing a window can write.

## Violations and the end

Each of the following is latched and ends the whole capture with ordinary `end()` (not only the AI session), and
the reason is shown where the capture's end is shown:

- a denial;
- a malformed, oversized, extra-member, mismatched (any echoed member), repeated (replayed) or late answer;
- no ready line in time;
- the checker's exit or output end, reported at once even when no decision is waiting;
- a frame presented without its own ticket, or with facts that are not the admitted ones;
- a decision that cannot be recorded.

What the capture already kept stays, and a turn already out keeps its real status and the ordinary cancellation. A
new capture is only the user's own explicit Start, with a new checker; nothing restarts by itself.

The checker ends with its capture. Its input is closed and it gets a 3 s grace; then this child alone is killed (no
other process). Whether it was ever started, whether its exit was seen and whether a kill was delivered are recorded.
An exit not seen is said as that, not as a release. A checker that could not be started (no pid) is not waited for.
A capture stopped before it was armed starts no checker and makes no record. The app's quit waits for open
checkers.

A late answer, one after a Stop or after the checker's end, is not read. An intentional end of the checker by this
app is never reported as a failure, and never replaces the capture's own end reason.

## The record

`captures/<capture>/admission.jsonl`, one JSON line each, no pixels, no command, environment or path:

- `decision`: one line per request actually written to the checker. It records the phase, sample and frame numbers,
  raw hash and size, request id, image hash, `allowed`, `denied`, reason and elapsed ms. A send also records
  `live_session_id`, `ai_frame_seq`, `trigger`, `ink_revision` and `ink_sha256`. A decision withdrawn before it was
  written is not a line, and neither is one refused here, unasked, after a failure.
- `violation`: its reason.
- `checker_end`: `spawned`, `exit_seen`, `code`, `signal`, `killed`.

A torn line is cut back before the next one (as in `live.jsonl`). A write that fails is a violation.

## Limits, stated as such

- The checks bracket the grab and precede the send; they are **not atomic** with them. Windows can still change
  between a check and the grab or the send.
- Main binds frames to the overlay's own RGBA hash of the bitmap it took; it does **not** decode the PNGs again to
  recompute pixels. It does hash the received PNG bytes, as before.
- A frame that is reused (no new stream frame) is not admitted again at taking, but every send is admitted again.
- Frames the stream presented while the admission before a taking was out are counted as that picture's: the
  presented-frame count, age and `stream_new_frame` describe the frame actually taken.
- The least time between two unattended looks runs from the moment a look goes on to be sent, after its send
  admission, not from when it was queued.
- In test mode, a stroke that starts in the instant the capture ends gets no starting-context picture (the frame
  that would have been taken after the end is not admitted).
- Cost: two decisions per new stream frame taken (at most about one per second while the screen changes), plus one
  per send, each bounded by `decision_ms`.

## Examples for QA's checker

These are the exact shapes the app writes and accepts (values illustrative). Lines are UTF-8, at most 4096 bytes.

The checker's first line:

```json
{"format":"lc-source-admission/1","ready":true}
```

Requests (`arm`, `pre_acquire`, `post_acquire`, `send`):

```json
{"format":"lc-source-admission/1","id":"5f0c…(32 hex)","seq":1,"phase":"arm","capture_id":"9a1b2c3d4e5f6071","display":{"id":"2779098405","bounds":{"x":0,"y":0,"width":1280,"height":800},"scale_factor":2},"overlay":{"pid":10412,"hwnd":"263418"},"sample_seq":null,"frame_seq":null,"raw_sha256":null,"raw_size":null,"request_id":null,"image_sha256":null,"sent_at":"2026-10-09T08:00:00.000Z"}
{"format":"lc-source-admission/1","id":"…","seq":2,"phase":"pre_acquire","capture_id":"9a1b2c3d4e5f6071","display":null,"overlay":null,"sample_seq":4,"frame_seq":null,"raw_sha256":null,"raw_size":null,"request_id":null,"image_sha256":null,"sent_at":"…"}
{"format":"lc-source-admission/1","id":"…","seq":3,"phase":"post_acquire","capture_id":"9a1b2c3d4e5f6071","display":null,"overlay":null,"sample_seq":4,"frame_seq":4,"raw_sha256":"(64 hex)","raw_size":{"width":2560,"height":1600},"request_id":null,"image_sha256":null,"sent_at":"…"}
{"format":"lc-source-admission/1","id":"…","seq":4,"phase":"send","capture_id":"9a1b2c3d4e5f6071","display":null,"overlay":null,"sample_seq":4,"frame_seq":4,"raw_sha256":"(64 hex)","raw_size":{"width":2560,"height":1600},"request_id":"live-0123456789abcdef.look.1","image_sha256":"(64 hex)","sent_at":"…"}
```

An answer is every member of its request but `sent_at`, each equal, plus a verdict and a reason:

```json
{"format":"lc-source-admission/1","id":"…","seq":4,"phase":"send","capture_id":"9a1b2c3d4e5f6071","display":null,"overlay":null,"sample_seq":4,"frame_seq":4,"raw_sha256":"(64 hex)","raw_size":{"width":2560,"height":1600},"request_id":"live-0123456789abcdef.look.1","image_sha256":"(64 hex)","verdict":"allow","reason":null}
```

`"verdict":"deny"` takes a reason of at most 300 characters, or null. Only one request is out at a time, and the next
is written only after the answer.

Further rules for the answer:

- Echoed objects are compared by value: their members may come in any order.
- An answer line must be valid UTF-8; nothing is replaced. A line ending in `\r\n` is read as one line.
- The configuration file and the ready line must not begin with a byte-order mark. JSON allows a parser to refuse
  one, and the ready line must be exactly as above.

**Compatibility with QA's checker.** QA's first checker (`9614947`, `tests/e2e/windows/qa_admission_checker.ps1`) was
read, not run. Its request member list, phase nulls, string `display.id` and the echo of every member but `sent_at`
agree with this app, and `ConvertTo-Json` keeps the parsed member order. It predates the `overlay` member: its
strict member-list check would refuse this app's requests until QA adds `overlay`, as the lead has asked.

## Review

One review workflow over the whole change, each finding checked by a second agent before it counted:
`wf_25337b6e-87b`, 29 findings in four areas (main, checker client, overlay, tests). 26 were confirmed, 3 refuted,
none uncertain. All 26 are fixed in this commit, each with a test.

- **Main.** A cancelled circle at the send gate lost its same-frame follow-up, so `live.latest` is set before the
  gate again, as in the product. A send decision that could not be recorded was dropped when the AI was stopped
  meanwhile; it is now latched first. The least time between looks started before the gate; it now starts after.
  A refusal made here without asking was recorded as a decision. A capture stopped before arm got a `checker_end`.
- **Client.** The echo compare depended on member order. Invalid UTF-8 was accepted as `U+FFFD`. A checker that
  never started (ENOENT) was waited for 5 s and reported killed. `open()` after `close()` started a child.
- **Overlay.**
  - The presented-frame facts were read before the wait for the admission rather than at the grab.
  - A pen-down during that wait lost its starting frame: the stroke's threshold is now the last grab begun.
  - A frame whose pixels could not be read was not closed.
- **Tests.** Fourteen tests or test changes were missing; they are added: the retain-frame and follow-up intakes,
  a follow-up on a later frame, a cancel at the gate, a withdrawn queued send, the ticket's value and its
  consumption before the await, record failures at arm, post and send, the quit wait, the deadline and `sent_at` at
  write, the hash tied to the frame taken, main's recheck after the post decision, exit and end of output alone,
  and width and height separately.

Refuted, with no change:

- A byte-order mark is refused, which is allowed and wanted.
- A command beginning with `/` counts as absolute, as in Node's own definition.
- Ink context pictures are not an intake of the check: they are made only from admitted frames, are never sent,
  and are not listed in the decision.

## Executed

On Linux (WSL2), Node v24.21.0, TypeScript 7.0.2, from `apps/windows`, on the tree of this commit. The Backend
checkout at `73488f5` was used for the tests that run the released Python bridge.

| Check | Command | Result |
| --- | --- | --- |
| Types | `tsc -p tsconfig.json --noEmit` | clean |
| Build | `npm run build` | passes (the new module is in `dist`) |
| Whole suite | `node --test tests/*.test.ts` | **491 tests: 486 pass, 0 fail, 5 skipped** ([output](evidence/windows-source-admission/linux-full.txt)) |
| Interlock | `tests/source-admission.test.ts`, `tests/app-admission.test.ts` | 10 + 18, all pass (in the suite) |
| Mutation | [`mutants.py`](evidence/windows-source-admission/mutants.py) in a scratch copy | **53 mutants: 51 killed, 2 left** ([results](evidence/windows-source-admission/mutation.txt)) |

The run before that final one had one failure (485 pass). It was the real-pipe released-bridge test
`tests/live-bridge.test.ts`, which timed out after 10 s while the whole suite ran. That test does not configure the
check, and it passed alone three times and in the final run. The run is kept as
[`linux-full-first-run.txt`](evidence/windows-source-admission/linux-full-first-run.txt).

The five skipped tests are the development capture link's owned-host run (`tests/owned-host-flow.test.ts`). It runs
only with the `lc_p0_test` database, which was not given to this run.

[Receipt](evidence/windows-source-admission/receipt.json): the counts, the Backend checkout and the SHA-256 of every
source and test file that ran.

The two mutants left change nothing that can be reached:

- `send-no-source-check`: every frame that can reach a send already carries its source; the check is a defensive
  second guard.
- `no-ended-check-after-post`: after the end, the overlay's existing ended branch already closes the frame, and main
  never admits a frame once the capture is ending.

**What the tests use.** The real `main.ts` and `overlay.ts` run under the unit-test fakes, with a stand-in checker
(`tests/admission-fakes.ts`) speaking the protocol over in-process streams. A real spawn is used only for a command
that does not exist. There is no Windows, no PowerShell, no native check, no display, no Edge, no account, no model
and no sound.

## Next

1. **QA**: add the `overlay` member to the checker, then build candidate 03 against this commit. The lead
   coordinates the native overlay predicate and the review of both sides.
2. **Lead**: integrate this commit and stage a distinct versioned package for the changed-flow review. Nothing was
   staged or launched here.
3. **Real execution** under the lead's allocation only. Then the native time-of-check race, real IPC ordering, the
   overlay handle and the checker's real latency are observed for the first time. None of them is claimed here.
