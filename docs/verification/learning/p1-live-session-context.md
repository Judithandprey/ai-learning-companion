# Whole-screen live context and presentation binding

Learning continuation from assigned `d37f7a442a78122fb351a7aab83ffdff8aec1448`;
normal clean-worktree merge produced `23b49b97e5f42dd9ee4fe87da1333790e1842619`.
Adopted released `9b33a7675fe98ab30e5c79952668906ff7ef232a` without discarding
the three in-progress owned files; merge HEAD `2f1be514a8cb7cba8c25cf156d813a03ccd9f645`.
Scope: §7.1/7.3/7.7, R51–57, AUDIO-08/09/13/14 and the Lead-owned additive
`lc-subscription-live/1` interface. PONYTAIL LITE: reuse the existing PNG/ASK
validation, archive/context assembly and shared schema, without another store,
provider, identity, framework or dependency.

## Callable outcome

`prepare_live_session_context(turn, *, archive=None, index=None, user_id=None)`
accepts the released `Turn`. It returns the exact full PNG `image_bytes`, a bounded
English-first `text` prompt, the complete `provenance` (Turn minus base64), and
private preparation data. Focus stays a separate same-frame rectangle; it never
replaces/crops the full image. Original source/time/ink facts and nulls survive.
The exact bytes pass existing bounded static RGB/RGBA PNG decoding/hash checks.

Observation prepares provisional context without display permission. A focus with
no supplied text asks for the smallest useful contextual hint. The released
validator refuses a broader old allowance for that textless circle; Learning also
rejects whitespace-only text at preparation and final use. It does not invent a
user utterance or change the original control fields. Explicit follow-ups retain their original words, frame,
focus and audio-source attribution. `none` suppresses assistance; observation and
writing/erasure/source speech cannot independently ask for a solution. A transcript
does not prove acoustic evidence or speaker identity, and late/source history is
not a new user request.

Recent history remains exact, ordered as supplied and bounded by the shared
24-entry/4,000-character-each/32,000-total limits. The final prompt is limited to
65,536 characters. Oversize inputs are refused, never cut midway or deleted.
Callers must select whole retained entries and explicitly declare missing context
in gaps. Earlier observations are historical and provisional; unknown reasons,
unseen steps, incomplete coverage and unconfirmed presentation remain unknown.
The prompt does not manufacture reasoning or independent mastery.

Optional archive/index reuse calls existing `assemble_context` with the trusted
owner, preserving original evidence, correction links, historical status, budget
omissions and unknown reasons. The returned `archive_context` is a **local
candidate packet only**. It is not secretly appended to the provider prompt or
Result provenance. To use candidates, the caller selects whole authorized
original records into Turn.history and prepares that new Turn. Existing storage
retains all source and correction history; this module stores nothing.

`bind_live_session_response(prepared, text, *, current_state, model, auth_mode,
latency_ms, thread_id, turn_id)` revalidates preparation/image consistency and
current lifecycle bindings before returning the closed shared `Result` shape.
Successful observation text is labeled `observation` and stays internal; other
responses are labeled `generated_assistance`. Backend supplies actual successful
completion, auth/model/thread/turn/latency facts; no such facts are inferred here.

`authorize_live_presentation(result, *, current_state, channel="text")` checks
fresh `CurrentState={active,cancelled,provenance}` on every use, including cached
results and queued speech. The entire trusted-main provenance must match, including
session, capture, epoch, request, permission revision, PNG hash, user words,
history/corrections, context/ink/focus and assistance, with active/not-cancelled
state. Never echo a model result into current state. It refuses observation/none output and
silent-mode audio. A successful private display payload uses the exact same text
for `text`, `caption` and (only on the audio path) `speech_text`; it accepts no
separate unbound caption. It is not a presentation receipt or durable permission.
Main must cancel old cards/speech immediately and record actual shown/played
events separately. Model semantic disclosure still needs independent evaluation.

## Verification and remaining work

Final verification uses the exact released interface above:

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest tests/evals/test_live_session.py tests/evals/test_subscription_ask.py tests/evals/test_image_evidence.py tests/evals/test_context.py packages/contracts/tests/test_live_companion.py -q --tb=short
```

**336 passed in 3.62s**, including 61 new live-context checks. The sequence case
executes preparation/binding on three different synthetic whole-frame pixel arrays
(two visible changes), retains provisional observations, then prepares a textless
focus on that same full image and permits only silent hint output. Other cases
exercise exact source/hash/ink/null preservation, malformed/crop-only inputs,
original/corrected transcripts without speaker inference, actual archive correction
links and unknown reasons, none/exploration, changed session/epoch/permission/source/
question/history, cancellation, cached full-solution rejection, speech/caption
identity, mutation isolation, no filesystem/socket access, and bounded history.

One final-review defect was reproduced before correction: whitespace-only focus
text (`space`, `tab/newline`, `U+3000`) passed the shared schema's non-null check and
could retain full-solution allowance. The initial targeted run was **3 failed,
55 deselected in 0.16s** (`DID NOT RAISE ValueError`). Runtime guards now reject it
at preparation and presentation (six regression cases). No shared schema was
edited; Lead owns any additional schema tightening. Earlier private-shape checks
and the intermediate 330-pass run do not substitute for this final result.

Original retrieval files/labels/failure evidence and legacy ASK implementation
are unchanged. Earlier 50/50 exact and 25/30 fuzzy retrieval quality is neither
rerun nor improved by this task. No second memory store or identity is introduced.

No actual provider, microphone, desktop, TTS, credentials or private user content
used. Calls: 0; usage/cost/latency and real comprehension: not measured. The tests
use project-authored synthetic pixels and synthetic transcript/correction data.
Backend transport/session enforcement and client final rendering/playback remain
next-owner integrations; this component passes no continuous real-AI, acoustic,
interactive Mac, pen, Notability or full-product acceptance gate.
