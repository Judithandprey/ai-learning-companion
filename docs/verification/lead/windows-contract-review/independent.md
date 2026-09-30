# Independent Windows metadata contract review

**APPROVE the pure 0.2.9 metadata candidate**
`3f59d76ddb13cb9576117776f378ed6431218fb1` for Lead's final registration/release.
No concrete blocker found within this bounded contract/binding scope. This does
not approve held producer `04caef61f251e9df2e6c6f5e433b0a2c1dd6ed68`, a service
adapter, live capture authority, image decoding/composition, or either §7.1 gate.

Exact export: `/tmp/lc-windows-frame-review-3f59d76`. Read the full Windows package
and test file, necessary Process/display/original/raw/Mac validator call paths,
and relevant held producer facts already reviewed. Current main's affected
source/English §7.1, R35/R36/R46/R51/R52/R59, effective decisions and workflow
remain unchanged from the preceding review. PONYTAIL LITE applied: reuse of
existing primitives and bounded probes, no new implementation or audit campaign.

## Independently checked

- Explicit selected Process record, complete raw/composed PNG references and each
  distinct original binding agree on owner/source/version, frame and capture
  device/session/stream. Binding reordering and selecting a non-first record work
  without rewriting unrelated records or separate editable-ink references.
- Every image artifact identity remains immutable. Same PNG bytes may use one or
  two archive identities; contradictory length/dimension/RGBA facts for one native
  file are rejected independently of artifact ID. Native filenames bind to the
  **encoded PNG** digest, not the renderer's RGBA digest.
- Native capture session, reopened ink session, held-frame ordinal, sampling
  ordinal and Process sequence remain distinct. Native labels are observations,
  not authentication. Generic structured Process data is preserved; this helper
  does not grant it to a pixel-only producer.
- Unknown presentation/age before the held image's first callback remains null.
  A backward wall-clock jump and independently rounded age are accepted unchanged.
  No actual capture UTC, media position, capture latency or Process clock is
  invented. Known gap duration remains explicit; absent old `gap_ms` remains null.
- Frame and composition dimensions agree with one another without fabricating
  equality to startup DIP geometry. Ink marks partition the visible count, while
  transformation text and alignment labels remain producer declarations.
- This candidate changes no old contract package or admission route. Existing
  raw/Mac descriptor and Mac-ingress validators reject the new Windows descriptor;
  the package's tests also explicitly cover the remaining 0.1.0–0.2.8 boundaries.

## Exact executed checks

All Python used the existing interpreter with `PYTHONDONTWRITEBYTECODE=1`; no
installation or repository writes.

```sh
cd /tmp/lc-windows-frame-review-3f59d76
PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m packages.contracts.windows_frame.generate --check
PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python /tmp/windows-contract-independent-probes.py
```

Both commands passed. The second contains **seven independent probe groups**:
exact source mapping; selected-record and separate-original preservation;
owner/source/incarnation substitutions; identity/time/unknown distinctions;
capture-time promotion rejection; file/artifact alias consistency; old-reader
rejection. It directly calls the actual candidate validators; synthetic shared
archive relationships are clearly labeled.

Additional read-only Git comparison matched all **8 package/test files** in the
provided export to `3f59d76`. The probe matched the committed producer manifest
byte-for-byte through `git show 04caef61:.../manifest.jsonl`, then compared all five
retained examples' native metadata. Manifest SHA-256:
`bd866444e33ed7581244c2b2ff89a32c626521035b13283d60f6082587891382`.

Lead's 216-test execution was not repeated or counted as this independent result.
Generated-output checking passed; root generator/type registration remains Lead's.

## Explicit residual dependencies

The native producer remains held for its already reported retention-integrity
defects. This package neither hides those failures nor represents omitted frames,
refusals, Stop or unwritten history as fabricated PNGs. Their transport treatment
and corrected-producer mapping remain later work.

The inherited 32 MiB artifact ceiling is narrower than the native 96 MiB ceiling.
Oversized originals must later fail visibly without resizing/trimming or claiming
archival success. Stored-file integrity, PNG decoding, actual RGBA/composition,
editable-stroke recovery, current source permission, lifecycle and disclosure
checks remain runtime/consumer responsibilities. No native launch, service, DB,
provider, interactive desktop, Chats or account action was performed.
