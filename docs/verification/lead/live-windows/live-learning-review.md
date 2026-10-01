# Live Learning delivery review

**Candidate:** `90da1a6a078f0f41c57b45ac8f1f0976c8ec281e`, against released `9b33a7675fe98ab30e5c79952668906ff7ef232a` and ADR 0004. Exact archive: `/tmp/live-learning-90da1a6-jfbnkp4k`.

**Verdict: approve the bounded pure Learning delivery; no concrete blocker found.** Backend can consume the three implemented functions under the released contract. This is not a real provider, desktop or audio acceptance result.

## Source conclusions

- `prepare_live_session_context` validates the live metadata, then reuses existing full PNG decoding/hash/provenance checks. It checks the full display region and optional focus coordinates separately; focus does not crop or replace the image. Returned image bytes are the validated full frame. All Turn fields except base64 remain in provenance, including null source/time/ink facts, original words, recent history and gaps.
- Prompt construction treats image, captured metadata and prior dialogue as untrusted evidence. Observation requests receive provisional internal-observation instructions and no presentation permission. Questionless focus stays a small hint under the released shared rule. Typed/voice followups do not silently broaden assistance or infer speaker identity; transcript and acoustic evidence remain distinct.
- Preparation is revalidated before response binding, including prompt/permission, PNG bytes/hash, inner frame preparation and full source correspondence. Binding/each presentation use compare complete provenance to trusted current state, including history, source, epoch, permission revision and request; stopped/cancelled/currently changed state refuses use.
- Observation results remain internal and cannot pass either presentation channel. Silent mode rejects audio. Audio authorization emits exactly the same immutable supplied generated text for caption and speech; no separate alternate caption is accepted. Actual render/playback, cancellation of already queued output and truthful shown/played receipts remain client obligations.
- Existing archive retrieval is owner-scoped and returned only as local candidates. It is absent from provider prompt and Result provenance until the caller deliberately selects whole authorized entries into Turn.history and prepares again. No second archive, provider or hidden source fetch is added.

The Lead's pending stricter shared text/ID/UTC guards were read and are compatible with this implementation. Its local whitespace guard already prevents blank text from retaining a full-solution scope. No shared files were edited or overlaid for this exact-candidate run.

## Focused verification

Executed in the exact archive with the existing root Python environment:

```sh
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest tests/evals/test_live_session.py tests/evals/test_subscription_ask.py -q
```

**175 passed in 0.59s: 61 new live-session checks plus 114 existing ASK checks.** No broader campaign was repeated.

Seven additional pure controls passed:

1. Altering the inner frame-preparation prompt is rejected on binding.
2. Altering full PNG bytes while retaining metadata is rejected.
3. Changing a retained gap reason invalidates cached text use.
4. The same gap change invalidates cached audio use.
5. Modifying local archive candidate content does not add it to provider prompt or bound result.
6. An embedded historical assistant instruction cannot grant observation text presentation.
7. The same instruction cannot grant observation audio presentation.

Source hashes and outcomes: `/tmp/live-learning-independent-probe.json`; combined review evidence: `/tmp/live-learning-review.json`.

## Next owner and limits

Lead integrates and runs its final shared-guard compatibility checks; Backend uses `prepare_live_session_context`, `bind_live_session_response`, and `authorize_live_presentation` with actual completion/model facts and current trusted state. Clients must recheck at output time, not copy model-returned provenance into current state. Prompt restrictions do not prove semantic non-disclosure; synthetic frames/transcripts do not prove continuous screen or acoustic understanding.

No production changes, private content, provider/account/device/GUI/ASR/TTS calls or real playback operations occurred in this review.
