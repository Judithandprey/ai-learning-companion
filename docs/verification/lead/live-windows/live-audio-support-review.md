# Support audio evidence review

Candidate: `0640446c72a13aa589d338166740006aec43cfb6` (six added documentation/probe files), archived exactly at `/tmp/live-audio-0640446-e77irg4q`.

**Verdict: approve this bounded evidence delivery. No concrete blocker found.** This approves source/evidence correspondence and stated limits; it does not establish a usable audio product or release another runtime test.

## Independent checks

- Recomputed both complete installed-schema manifests using the documented sorted relative-path/NUL/hash/newline construction: stable **314** files, `cd9238d61238dca0566621d17416638307501c5fbf0a90ed2bb882f2f00aa958`; experimental **440**, `20836679ba7d25073e4d2b837fd4d1cc116857dd442174b72fe912c2879415c9`. Both match committed audit metadata, as do all selected file hashes.
- Inspected both `UserInput` unions: ordinary `audio/url` and `localAudio/path` variants are present in stable and experimental schemas. The six named realtime request methods occur only in the experimental request union. Listed stable/experimental realtime notifications are present. Model modality/default, realtime start controls and list-voices fields match the report. None of these types establishes account eligibility, installed model advertisement, codec behavior or real acoustic understanding.
- Recomputed the actual PowerShell source hash: `2a220bfec0791de8f654059fd27419cb6a7961a51bbcf04d8768f5c72bf63eeb`, exactly matching the retained Windows receipt. The source uses generated memory WAV input and memory synthesis output, with no microphone/default-input selection, speaker playback, provider request or user-app control.
- The retained receipt supports the precise conclusions: Chinese dictation produced `答案不恤衫75` and `挺先解释这个步骤`; only the `zh-CN` recognizer is enumerated; English reports no matching installed recognizer. Actual synthesis speed ratios recompute to about **1.242×** (Chinese) and **1.270×** (English), rather than guaranteed 1.3×.
- Both voice trials recorded two completed/two cancelled queued synthesis prompts. This is cancellation of active memory synthesis plus its queue. ASR cancellation recorded no captions and zero late suppressed callbacks: the report correctly leaves late callback rejection and physical playback cancellation unverified.
- Ran the four launcher unit tests from the exact `/tmp` archive, using the existing root Python environment. All four passed; every subprocess call was mocked. Nonzero/timeout/malformed/unavailable cases keep failures sanitized and never claim native child reaping after a WSL launcher timeout.

The receipt predates the Python launcher's disclosed failure-receipt hardening. Its PS1 hash still identifies the exact executed speech implementation; the report does not pretend the newly hardened launcher was rerun on Windows. Execution completion remains separate from ASR quality and product acceptance.

## Adoption and remaining boundaries

Keep the source conclusions unchanged: local Chinese dictation failed this meaningful synthetic sentence; the measured installed System.Speech route has no matching English recognizer; stable managed audio protocol types exist but actual account/model/runtime use is unknown. No audible playback, microphone/system capture, joint audio/screen delivery, late-tail cancellation, real acoustic inference or macOS operation was verified by this delivery.

The small probe is not a production stream/cancellation implementation. Web retains actual Windows capture/playback and source-consent integration, Backend retains separately scoped audio transport/acceptance, and Lead retains the interface and coordinated runtime release. Do not substitute local transcript text or schema presence for the original audio requirements.

Evidence and six file hashes: `/tmp/live-audio-support-review.json` (also `/tmp/live-audio-support-evidence.json`). No repository changes, installed changes, Codex execution, auth/account/provider calls, Windows process/GUI/audio rerun or external research expansion were performed.
