# Windows retention renderer/shared review

**Judgment: request correction before integration.** Exact source:
`04caef61f251e9df2e6c6f5e433b0a2c1dd6ed68`, parent `99ae568`, exported to
`/tmp/lc-windows-retention-04caef61`. No repository/worktree changes, Windows UI,
capture, provider, native launch, installation, preview or Paperclip access.
PONYTAIL LITE applied: existing call path and standard-library probes; no new layer.

## Blocking source-integrity finding

**WR-R1 — P2: known capture gaps are lost from the durable retention history.**

Locations: `apps/windows/src/renderer/overlay.ts:250–255`, `:843–860`, `:867–881`;
`apps/windows/src/shared/retention.ts:69`; the existing `lc:sample` handler at
`apps/windows/src/main/main.ts:741–747` retains samples only in memory (last 300).

Two forms of the same defect are independently reproduced using actual
`takeSample` / `considerRetention` / Stop code:

1. Retain display A at sample 1. Resume after a known 7000 ms scheduling gap,
   observing identical pixels A. The sample is explicitly `state='gap'` with
   `gap_ms=7000`, but retention classifies it as unchanged. Stop acknowledges
   successfully with only the original fresh retained frame and **zero**
   `notRetained` reports. The known observation gap disappears on closing/restart.
2. When a gap sample does qualify for retention, `state='gap'` is copied but
   `sample.gap_ms` is omitted. An actual 5500 ms gap becomes a durationless entry.

This is not an unobserved external edit or an expected adaptive-sampling omission:
the producer already measured and reported the gap. R52, A31 and §7.1 require this
uncertainty to survive. Persist the known gap independently of pixel/ink materiality,
and preserve its original measured duration without inferring one from timestamps.

## Separate time-description correction

**WR-R2 — P2: the manifest promises an exact clock equality that its producer does
not satisfy.**

Locations: `apps/windows/src/renderer/overlay.ts:253`, `:264`, `:878–879`;
`apps/windows/src/main/main.ts:349–351`.

The header describes `frame_age_ms` as `monotonic_ms - presentation_ms`, but the
producer rounds separate observations. With callback presentation time 980.6 ms
and sample time 1000.4 ms, actual code emits monotonic 1000, presentation 981,
age 20. The advertised subtraction is 19. Separate performance reads can add
further disagreement. Before the first callback, the new retention path correctly
keeps presentation/age null.

Describe the independently measured/rounded age honestly (including the existing
capture-latency limitation); do not rewrite historical values to force equality.
Backend's future mapping should retain these facts exactly.

## Stop cross-boundary evidence

**WR-R3 — P1 shared with the main/storage review: a pending encode can outlive the
main process's 10 s Stop bound.**

Renderer locations: `overlay.ts:894–917`, `:952–959`.

The preserved probe blocks the real retention chain at synthetic PNG encoding,
admits a first frame plus a second deferred material sample, then invokes the real
Stop callback. Capture becomes ended, the deferred sample is reported as omitted,
and the first queued frame has not yet reached `lc.retainFrame`; no Stop ACK is
sent until encoding completes. The retained frame's facts/pixels exist only in the
renderer during that interval. The separate main reviewer reproduced invoking the
actual 10 s timeout destroying this renderer and losing pending retention. My
probe substantiates the renderer half only; it does not pretend a simulated
renderer survived actual Electron destruction. Coordinate one owner correction
and keep retention loss/recovery distinct from the existing ink-unsaved message.

## Executed evidence

Node executable used:
`/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node`

From `/tmp/lc-windows-retention-04caef61/apps/windows`:

```sh
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node --test --test-isolation=none tests/overlay-frames.test.ts tests/overlay-stop.test.ts
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node --test --test-isolation=none --test-name-pattern='retention rules' tests/retention.test.ts
```

Results: **9 existing overlay checks + 1 policy check passed.** Main storage tests
were not duplicated. These are portable mocked checks, not Windows operation.

Independent executable:
`/tmp/windows-retention-renderer-probes.mjs`; output:
`/tmp/windows-retention-renderer-probes.log`.

```sh
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node /tmp/windows-retention-renderer-probes.mjs /tmp/lc-windows-retention-04caef61
```

**6 behavioral probe groups pass; 2 defect-reproduction groups succeed.** The two
defect groups assert current faulty behavior and are not regression acceptance.
The harness extracts actual candidate functions with checked anchors, using
explicit synthetic immutable image objects, Canvas/encoder, clock and IPC. It
encodes/decodes small real PNGs via the existing test PNG helper, but does not claim
browser rasterization, Electron IPC or real captured imagery. An initial anchor
mismatch after TypeScript stripping was fixed only in `/tmp`; it was a harness
error, not a product failure.

Checked positives:

- Raw/composed pixels, ink revision and uncertainty counts stay with the sampled
  image through delayed hashing and encoding; held-frame and later stream counts
  remain distinct. Original source identity remains on the emitted sample.
- Presentation/age stay null before a callback. Current-frame age does not silently
  use a later callback observed during hashing.
- At most two image retention jobs are queued; earlier bitmaps stay alive until
  copied, then release. Third image omission is explicitly listed by sample seq.
- A/B/A interval coalescing stores A and explicitly lists B as not retained; it
  does not manufacture B pixels. This remains incomplete observation, not full
  process retention or mastery evidence.
- Encode rejection records a gap and releases pins; later current-frame retry
  works. Ordinary renderer Stop drains admitted encoding and records interval
  omissions when it is allowed to finish.
- Existing targeted tests cover Stop refusing new input, pending stroke save,
  cap refusal/no remaining pins, transient write retry, ASK uncertainty and
  bounded context-picture receipt.

## Limits and next owner

Web owns the correction; Lead consolidates with the main/storage review, reviews
the exact correction and arranges one focused retest. No production edits were
made here. Main/storage findings concerning append corruption or final-write
visibility belong to that separate report.

The image-job bound is two; deferred sample-number metadata is not separately
bounded. No new stress campaign was opened for that observation.

Author 39 unit checks and 40 synthetic Windows checks are not independent QA.
The reported 12:37:09–12:38:00 author run may overlap QA, so no quiet-desktop or
timing acceptance is inferred. Both real whole-display-to-AI and original-screen
ink-to-that-same-AI §7.1 gates remain open, along with real permission/device,
supported pen, content-following and complete classroom/Notability evidence.
