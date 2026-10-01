# Reviewed live transport release

This is the existing P0-07/08 Windows live-companion transport milestone, not a
new product task or real device/provider acceptance. The original selected-image
v1, public v0.1.0, original records and existing user app remain unchanged.

## Delivery, review and source identity

Backend's actual correction arrived as
`handoff_a58c7f02f71525cb3a07ccd6f4d35922` at 2026-10-01 14:50:51 UTC, replying to
the unchanged scheduling reproduction. Native inbox/read succeeded; no authority
or lock bypass occurred. This is actual owner delivery, unlike an accepted send.

| Owner commit | Integrated main commit | Scope |
| --- | --- | --- |
| `2833e2d15b67777aa85b91f1ad47a3efd0751312` | `9773688a8b6079b221e39ef91ca8a99bb5c947a3` | Live foreground dispatcher, rich quota projection, bounded scheduling, Learning preparation/presentation and lifecycle checks. |
| `91e72fe5c3d25b0372df79a51a6683df869d757a` | `0f3c16e30b0a616d21813bc9fe230d18d4befb9f` | Honor configured policy, reserve interactive allowance, retain authorized active focus across newer observations. |

The held base was integrated only together with its independently approved direct
correction. The [independent correction review](backend-correction-review.md)
closes H1/H2 for their demonstrated local scope. At the resulting main revision,
`git diff 91e72fe --` over all seven delivered source/test/evidence paths is empty.
No dependency, migration or formal wire field changed. The ADR describes the
released scheduling rule and required caller behavior.

## Executed resulting-main checks

Executed at main `0f3c16e30b0a616d21813bc9fe230d18d4befb9f`, with
`PYTHONDONTWRITEBYTECODE=1 PYTEST_DISABLE_PLUGIN_AUTOLOAD=1`, repository
`.venv/bin/python`, and `pytest -q -p no:cacheprovider --tb=short`:

| Selection | Actual result | Output |
| --- | --- | --- |
| `test_chatgpt_live.py`, `test_chatgpt_live_stream.py`, `test_chatgpt_local.py` | 156 passed in 9.54 s; exit 0 | [Live and legacy](main-live-legacy.txt) |
| `test_chatgpt_rpc.py -k 'live or authoritative_error or private_receipt or send_intent or drain_failure or cancellation_while_waiting_for_write_lock'` | 59 passed, 172 deselected in 1.75 s; exit 0 | [Affected RPC checks](main-rpc-affected.txt) |

The foreground fake-child checks ran through normal exact-command approval,
consistent with the previous environment-sensitive pipe behavior. These 215 cases
are resulting-main local/synthetic checks; they are not independent device QA,
real subscription inference, actual audio or Windows runtime acceptance. Earlier
review/owner counts overlap and are not added to this total.

The [original scheduling probe](scheduling-probe.py), unchanged SHA-256
`bd393c98ec1518e8dbf40273df455feae53dad31dab7c57ee75f833211836209`, was also run
against actual main. [Result](scheduling-main-after.json): configured 60 requests /
1,800,000 ms honored; active frame-3 focus and subsequent frame-4 observation both
complete with original attribution; two writes and maximum concurrency one. The
[pre-fix failures](scheduling-before.json) remain intact. The historical public-v1
quota probe remains 7 PASS / 2 FAIL; live/1 rich quota projection has separate pipe
coverage and must still be displayed by the new client.

## Exact caller obligations and next owners

Windows consumes the existing `chatgpt_local` foreground entrypoint pinned to
`lc-subscription-live/1`; no second manager/service is needed. It must:

- Present the actual configured finite session bounds and rich per-bucket quota
  facts, keeping included usage, credits, unknowns, authoritative refusal and local
  budgets distinct. A metadata read must not restart stopped work.
- Honor the final `max(1, ceil(max_submissions / 5))` slots reserved for explicit
  focus/follow-ups. Observation `budget_reached/not_submitted` at that boundary
  suspends unattended submissions while allowed interactive work continues; it is
  not official quota exhaustion or permission to retry each frame.
- Keep independently retained active-request provenance. A newer unrelated frame
  does not invalidate it, but new intent, permission change, Stop and interruption
  must fence it. A busy/rejected replacement does not itself revoke an active job:
  trusted main sends the interrupt immediately and rechecks final output authority.
- Use the released focus helper before authorizing a follow-up Turn, preserving
  same-frame focus or explicitly historical anchors without claiming old pixels
  are attached or remembered. Backend must not silently rewrite an authorized Turn.
- Finish its existing whole-frame/circle-auto/text-follow-up, caption/layout and
  reviewed native-TTS adoption work, then provide an exact distinct build for one
  independent changed-flow QA pass. The null-JSON parser fix and per-chunk trusted
  playback guards remain required. Preserve the running old app/profile/session.

Backend's delivered transport repair is complete within this scope; runtime caller
feedback remains owned by Backend. Native preserves its current Mac Stop repair
and can consume this common release at the existing safe boundary. Learning's pure
composition is integrated, and Support remains on demand. No duplicate tasks,
acknowledgement loops or new audio architecture were dispatched by this review.

Raw microphone/system-audio Start is explicitly unsupported by this transport;
`voice_followup` represents an explicitly addressed transcript, not acoustic input.
The TTS candidate's memory-only synthesis does not prove audible playback. Actual
audio input, continuous real-AI vision, provider earlier-image retention and
interactive Mac acceptance remain open. Real account/audio/display operations
remain gated on safe user availability; no user app, lock, microphone, private
screen or audible output was accessed. Publication and substantive delivery
receipts are recorded after the reviewed commit exists.
