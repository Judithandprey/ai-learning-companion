# P0-02 W-1: explicit card dismissal behavior

Date: 2026-09-28 UTC. Owner: web (05).
- **Finding:** QA `3e8e99d28262d01f432f8ab579ff25842516fda8`, `docs/verification/qa/p0-02-r2-retest.md`,
  finding W-1 (low, nonblocking), on main `693069a`.
- **Main reading baseline:** `3ab538e08cf2e64bdafbba3c8742a7e78262b8f6`.
- **Unchanged:** scope `apps/safari-extension/**` and `docs/verification/web/**`; contract `0.1.0`,
  dependencies and root configuration.

## The finding

- Closing a card retired every pending result. Web's own tests did not cover this guard: removing it passed all
  48 unit and 46 browser checks.
- When an older card was still visible while a newer request was pending (possible with a slow bridge), closing
  that older card silently dropped the newer answer. The learner got nothing for a request they had just made.

## Chosen behavior (deliberate and conservative)

The card belongs to one submission at a time (`src/page.ts`, top document):

1. **A new submission immediately shows its own pending card.** It replaces whatever card was on screen. The
   pending card is honest status only: "Preparing a silent card for this selection. Nothing has been explained
   yet." It carries the selection quote and makes no claim of an explanation.
2. **A result is shown only while its submission is still the latest.** Three things retire a submission:
   - a newer submission;
   - starting a new ASK (this also removes its pending card);
   - closing its card.

   A retired answer is still emitted as evidence with `presented: false`. It is never shown late, and the
   final-presentation check after the last await is unchanged.
3. **Closing dismisses exactly the submission on the card.** Because of rule 1, an older card can never be on
   screen while a newer top-document request is pending. So a close cannot drop an answer the user did not
   dismiss. Closing a finished card only hides it.

Frames render no cards of their own. The top renders a frame's completed relay only, as before. A frame request
therefore shows no pending card in the top document; this is a limitation of this probe.

This stays within R07–R10, A02–A03 and R53/A34: the probe is silent and explicit, it never presents stale or
dismissed results, and it keeps its evidence.

## Web-owned regressions (browser self-test, `fixture/src/selftest.ts` §9e)

Run with the self-test deferred transport. This is a fixture transport, not a native bridge.

| Check | Case |
| --- | --- |
| `dismiss.close_before_delayed_response` | The pending card is shown at once. Closing it before the delayed answer hides it; the answer arrives, stays hidden and is `presented: false` |
| `dismiss.older_card_replaced_while_newer_pending` | An older finished card is visible. A newer submission replaces it with the newer pending card, so the older card is not on screen and cannot be closed. The newer answer is then shown (`presented: true`) |
| `dismiss.current_response_presented` | Positive control: a delayed answer for the current, undismissed request replaces its pending card |
| `dismiss.close_finished_card` | Closing a finished card hides it and leaves no pending state |
| `dismiss.new_ask_retires_pending` | Starting a new ASK removes the pending card; the late answer stays hidden and is `presented: false` |

## Mutation results ([evidence](evidence/w1-mutations.json))

Each guard was removed alone in a temporary copy, and the unchanged 51-check self-test was run.

| Removed guard | Result |
| --- | --- |
| Close retires the current generation (QA's F4b revert) | 50/51, `dismiss.close_before_delayed_response` fails |
| Pending card on submission | 48/51, three `dismiss.*` checks fail |
| New ASK removes the retired pending card | 50/51, `dismiss.new_ask_retires_pending` fails |
| Generation check after the last await | 48/51: `ask.late_bridge_answer_not_presented` and two `dismiss.*` checks fail |

## Commands and results

```text
$ RUN_PREFIX=w1-edge BROWSER="/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" apps/safari-extension/scripts/check.sh
```

The recorded results are in the delivery message and in `evidence/w1-edge-*`.

- The first two self-test runs of the new checks failed: 47/50 because of harness indexing, then 50/51 because of
  check ordering.
  - The self-test's deferred-transport `ack(i)` indexes every held request in the run, so it silently skipped
    already-answered ones. It gained an `ackLatest()` helper.
  - One check ran after its card was already hidden. It was reordered.
- Neither failure was a product defect. Both were fixed before the recorded run.

## Not verified

- A real slow native bridge.
- iPad Safari, Apple Pencil and a packaged extension.
- Timing of the pending card (R13's 150 ms status target was not measured).
- Frame requests showing a pending state in the top document.
