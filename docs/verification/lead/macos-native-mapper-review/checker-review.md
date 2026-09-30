# df581e8 checker/tests review — scoped HOLD

Candidate `df581e8a1d49725c966fdacd0d8e45bcbb9aeb4d`, exact export `/tmp/lc-macos-native-df581`. Scope: `MacRetainedFramesTests.swift`, `checks/validate_mac_retained_frames.py`, fixture/report claims and necessary production call paths. No repository/worker writes or new delegation. PONYTAIL LITE; unchanged source/English retention, unknown-evidence and original-ink requirements apply.

**P2: the checker reports exact unrepresented-fact verification without checking the recorded ending or actual ink-document names.** In `apps/macos/CompanionDesktop/checks/validate_mac_retained_frames.py:320–327`, line 322 only checks whether a `no ending is recorded` prefix matches the absence of `status.ending`. When an ending exists, *no ending statement at all* satisfies that condition. Lines 323–325 similarly check the presence of a filter prefix and a generic ink-document disclaimer, not their source details. `native_session` does not collect the `ended` event, so the checker cannot compare competing status/event endings.

Reproduced using a clearly synthetic wrapper around the unchanged audited seven-frame session. Its native status records `user_stop`, live-ended host `107.5`, ending host `107.6`. The supplied unrepresented array was only:

```json
["ink documents synthetic wrapper; not an immutable editable original"]
```

The checker printed:

```text
PASS mapping every_kept_frame: unrepresented facts name exactly the outcome-less callbacks, the ending, the capture filter and the ink documents
```

The overall wrapper correctly failed the **separate non-vacuity gate**, since the old seven-frame fixture lacks required new scenarios. This is a demonstrated false positive in the named subcheck, not a claim that the full checker accepted an incomplete new Swift fixture.

Smallest required behavior: make claimed source-fact coverage verify the actual applicable ending and document names, and add an omission/disagreement negative control for the consequential ending path already found by Lead. Filter details must likewise be compared if the check continues to claim exact coverage. Alternatively narrow descriptive claims for facts not checked; that alone would not cover the production ending correction. Keep unexpected records/unknown states intact. No automatic repair/quarantine is requested.

## Checks that are sound within this scope

- The two added Swift tests construct synthetic buffers through the actual recorder/composer/FrameStore, assert eight kept frames/seven outcomes and expected revisions `nil,0,1,2,2,2`, one refusal and one unknown outcome. Raw aliases, independent reference counts, callback pairing, reopened unknown commit time, null metadata and old 0.2.7 scope refusal have direct assertions.
- The 39 named Swift refusal closures test file corruption/missing data, contract-rule mismatches, binding/identity mismatches and duplicate outcomes. An accepted entry cannot silently satisfy their expected refusal assertions; unexpected error prefixes are rejected again by the Python checker. Partial erase uses two endpoints crossed by the eraser and the actual history model. These are source-reviewed assertions, **not executed tests**.
- The incomplete-session test covers torn JSON, lost outcomes becoming unknown, conflicting/stray outcomes, ignored requests and missing payload. It does not cover contradictory simultaneous status/event endings. The primary emitted fixture never finishes; its main ending check covers only the absent-ending case.
- The Python checker validates supplied source/bindings against released 0.2.11, verifies complete native profile/sample/clock and raw/composed pairing facts, and compares PNG reference digest/length/signature/IHDR. It uses exact Python integers for native ticks. The Process record is synthesized from each descriptor, correctly disclosed as equality by construction; this is not independent Process sequencing or acquisition authorization.
- Negative controls require `ValidationError` and a stated message fragment. They are not satisfied by arbitrary crashes. Non-vacuity checks all three composition kinds and the extra alias/no-document/callback/reopen families rather than only counting frames.

## Executed Linux evidence

`/tmp/macos-native-df581-checker-probes.py` executes the real checker helpers against the unchanged released/audited seven-frame descriptors and original files, with explicitly synthetic archive bindings:

- **7/7** original descriptors pass released binding validation and native-record/file comparison.
- **78** checker mutations are refused for their specified message fragments.
- Valid-schema changes to display name, PTS, null-versus-empty dirty rectangles and exact UInt64 tick text are detected against the native records.
- Foreign-source, wrong-length and missing composed bindings are refused.
- A changed PNG byte on a scratch copy is detected; original fixtures remain untouched.
- A synthetic wrapper lacking required new fixture families returns failure, while preserving the false-positive subcheck above.

No new Swift mapper, build or XCTest ran. The owner's Python mapper port is not counted as execution. No complete new-fixture acceptance is claimed.

```sh
PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python /tmp/macos-native-df581-checker-probes.py > /tmp/macos-native-df581-checker-probes.log 2>&1
```

Evidence: `/tmp/macos-native-df581-checker-results.json`, `/tmp/macos-native-df581-checker-wrapped.log`, and hashes/exact-source receipt `/tmp/macos-native-df581-checker-review.json`. The wrapper and edited PNG copy paths are recorded in the results. During setup, the wrapper's filter-presence label was corrected to match the audited session's actual absence of a filter event; no source was changed.

## Integration / limits

Root wiring must set `COMPANION_DESKTOP_MAC_FRAME_FIXTURE_DIR` to a **nonexistent** output directory, run the checker after successful Swift tests, hash/upload its full tree and retain the existing three fixture families. The old lead ingress-context probe consumes 0.2.7/0.2.8 requests and is not a 0.2.11 mapper acceptance probe. Root has separately reported its wiring stub checks; they were not rerun here. New declared total is 44 XCTests; actual hosted compilation/execution remains pending.

Do not promote PNG signature/IHDR checks into independent pixel decoding, synthetic buffers into captured-display evidence, document path/revision into immutable editable bytes, or this report into provider receipt. Production Swift has its own reviewer and known pending corrections reported by Lead. Consolidate the checker regression with that owner's correction, then execute the corrected source on the ordinary hosted Mac path.
