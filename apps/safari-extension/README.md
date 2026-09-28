# Safari course-page probe (P0-02, web)

Web end of the G1 original-page input probe. It is TypeScript that a Safari Web
Extension content script would run; **no Safari extension is packaged yet**. Packaging
needs macOS/Xcode, which the project does not have. Desktop browser checks in this module
are not iPad Safari or Apple Pencil evidence.

## What it does

- **Explicit modes** (`src/mode.ts`, `src/input-policy.ts`): NAV (default) never claims
  input. WRITE claims only pen strokes as ink; fingers and mouse keep operating the
  page. ASK is entered only through the toolbar and claims one mark (pen tap, sweep or
  loop). Without an observed pen, a finger may mark in ASK. Once a pen has been seen,
  fingers always navigate. A mouse in ASK keeps native text selection, and the
  selection is read at pointer-up. Finishing or cancelling ASK restores the previous mode.
- **Frozen anchors** (`src/anchor.ts`, `src/frame.ts`): a mark is snapshotted synchronously
  at gesture end into a hashed `dom_snapshot` frame (structure/state only: no pixels, no
  query string, no form values). The deep-frozen `Selection` then carries normalized
  frame geometry, source id/version, frame id and video position. Later scrolling,
  playback or page edits cannot change it.
- **Silent cards** (`src/explain.ts`, `src/page.ts`): `audio: false`, `mode: silent`.
  Only an exact known fixture (source, version, normalized text) gets a `ready` card,
  labeled "Fixture card · synthetic test content". Everything else shows "Provider
  unavailable", with no invented explanation. Rendering uses `textContent` inside a
  closed shadow root, styled with a constructable stylesheet (works under strict page CSP).
- **Card dismissal (W-1)**: the card belongs to one submission at a time. A new submission
  shows its own pending card at once. A result is shown only while its submission is still the
  latest; a newer submission, a new ASK or closing its card retires it, and the retired answer
  stays evidence (`presented: false`). See `docs/verification/web/p0-02-w1-dismissal.md`.
- **Bridge v0.1** (`src/bridge.ts`): builds `selection.submit` carrying exactly the
  contract fields and parses replies strictly. Without a native bridge, the outcome is
  the local answer `bridge_unavailable` ("selection not stored").
- **Ambiguity**: an unclosed loop, a non-horizontal stroke, or a tap with no text under it
  shows an adjustable box to confirm; the probe never guesses. The box keeps the video
  position of the mark, not of the confirm.
- **Only trusted input**: synthetic (page-script) events are ignored. The in-page self-test
  turns acceptance of synthetic events on only for itself (`?selftest=1`).
- **Frames**: a probe instance inside each frame (as `all_frames` injection would give) follows
  the top mode, and pen presence is shared. The top renders frame cards from its own fixture
  table. This coordination uses `window.postMessage`, which is a fixture stand-in; the
  packaged extension must use extension messaging.
- **Fullscreen**: the overlay moves into a fullscreen container. For fullscreen video, iframe
  or replaced elements nothing can render there, so ASK/WRITE end in NAV.

## Commands

```sh
apps/safari-extension/scripts/check.sh                 # typecheck, unit tests, browser build
BROWSER="/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" \
  apps/safari-extension/scripts/check.sh               # + desktop self-test and trusted-input check
PYTHONPATH=. <lead venv python> apps/safari-extension/scripts/validate_evidence.py <reports...>
```

The browser checks run in the foreground only. They serve `fixture/` and `dist/` on
`127.0.0.1:4173` (the lead-allocated probe port), start the browser headless with a
fresh temporary profile (never the user's), and remove everything when they finish.
On WSL, the CDP client for trusted input runs as `scripts/cdp-runner.ps1` on Windows,
because NAT networking hides the browser's loopback debugging port from WSL.

## Layout

| Path | Purpose |
| --- | --- |
| `src/` | Probe code a content script would run (static safety scan in `tests/safety.test.ts`) |
| `tests/` | Deterministic unit tests (`node --test`, Node 24 type stripping) |
| `fixture/` | Owned synthetic test pages: main page, same/cross-origin frame, strict-CSP page, control page |
| `scripts/` | Fixture server, synthetic self-test harness, CDP trusted-input harness, evidence validator |

Evidence and the capability matrix: `docs/verification/web/`.
