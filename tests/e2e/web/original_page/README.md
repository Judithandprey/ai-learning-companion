# QA original-page entry/capture harness (P0-13/P0-07)

## Capability probe (test-only, not the product)

`probe-extension/` is a QA-owned MV3 extension with only `activeTab` and `storage`. On an action
invocation it captures the visible tab and records what it received: PNG size, signature,
dimensions, SHA-256, tab URL, title and time. It sends nothing anywhere.

`ext-probe.ps1` runs from WSL through `powershell.exe`, with Windows copies of the extension and
script under `%TEMP%`. It:

1. starts headless Edge with a fresh profile, `--load-extension` and
   `--enable-unsafe-extension-debugging`;
2. lists the DevTools `Extensions` commands;
3. opens a public page;
4. **control:** attempts `captureVisibleTab` from the service worker *without* an invocation, which
   must be refused;
5. calls `Extensions.triggerAction` on the page's **tab** target;
6. reads the record.

Result on Edge 154.0.4258.37:
[capability-probe.json](../../../../docs/verification/qa/p0-07-original-page/capability-probe.json).

**What this proves:** the shipped extension's own `action.onClicked` handler can be invoked, and the
`activeTab` grant can be tested without any test manifest.

**What it does not prove:** `triggerAction` is a DevTools invocation, not a human toolbar click, and
it runs in headless desktop Edge, not iPad Safari.

## Component pass on an exact candidate (`run.mjs`, `analyze.py`)

`run.mjs` runs the shipped `apps/safari-extension/webextension/` folder, unchanged, from an exact copy
of the lead's candidate. It refuses to start unless:

- the copy equals the commit (`../preview_recovery/provenance.py`);
- the generated extension files are current (`build-webextension.mjs --check`);
- port 4184 is free. It never uses 4173 or 8174.

Each run uses a fresh temporary Edge profile, which is removed afterwards. Windows temporary paths are
redacted from logs and results.

```sh
QA_SOURCE=<exact copy with built dist> QA_BASELINE=<sha> LC_WEB_FIXTURE_PORT=4184 \
  [QA_SCENARIO=pass|repro|ink|targets] node run.mjs <raw dir outside the repo>
python3 analyze.py <raw dir> <evidence dir>       # first: it clears the evidence dir's PNGs
python3 analyze_ink.py <raw dir> <evidence dir>   # then: ink evidence (ink-*.png, summary-ink.json)
```

- **`pass`** runs the owned synthetic course page, which provides controlled lifecycle cases, then one
  public learning page.
- **`repro`** repeats the region findings, adds a style-only layout shift, and makes real-timing
  attempts with no stand-in. Since `1616cce` it also runs the changed-path negatives:
  - Stop and an immediate restart while the old watched capture is in flight;
  - a shift inside a page-owned open shadow root;
  - an in-place change of the marked element.
- **`ink`** (`ink-steps.mjs`) runs the editable-ink flow on the owned page:
  - NAV, then WRITE with mouse writing off, a pen stroke, then Mouse and a short draft in both
    placements;
  - partial erase, undo and redo;
  - ASK finish, and ASK cancelled two ways;
  - continued writing, placement pixels, then reload, reopen and edit;
  - source changes: visible, held and off-screen;
  - an unreadable record and a record corrupted after load (both forged doubles);
  - a real two-tab same-address conflict.
- **`targets`** is a harness capability probe for a second same-address tab. It makes no product
  claim.

**Harness instrumentation** (labeled in `summary.json`):
- `chrome.tabs.captureVisibleTab` is wrapped in the extension's worker. The wrapper passes each call
  through and records the call, the active tab and the exact PNG returned. With no delay, it adds only
  a `tabs.query` before each capture.
- In the **timing stand-in** cases, the wrapper also waits before and/or after the real capture.
- Companion state is read through the worker, in the extension's isolated world.
- One case sends the product's own capture message from tab A's top frame to exercise the background
  fence directly.
- `qa-cdp-runner.ps1` is the candidate's runner with QA additions:
  - `triggerAction` may name an exact tab URL (tab B in the A→B→A case) and an exact title. Title
    matching tells two same-address tabs apart, because tab targets carry no link to their page. The
    action applies to the active tab, so tab B is activated first;
  - eval, cdp and screenshot steps with `other` run on a second page's own socket;
  - `cdpBrowser` runs on the browser socket.
- **Ink run instrumentation:**
  - a `runtime.onMessage` spy in the worker that records message types only;
  - native IndexedDB reads in the worker, with the product's own `parseInk`;
  - forged records for the unreadable cases, labelled FORGED TEST DOUBLE.

**`analyze_ink.py`** checks the ink state against the stored IndexedDB documents and against
DevTools screenshots of the owned page, decoding the pixels itself:
- gaps, stacking at a crossing, placement rows and dashes;
- the exact ASK capture;
- the message spy.

**`analyze.py`** checks the product's report against the exact bytes captureVisibleTab returned. It
decodes every PNG independently and compares:
- the hash and size;
- the crop box and the crop's pixel statistics;
- what the crop actually shows.

Public-page pixels are not included in the published evidence; local raw captures/screenshots
are retained outside the repository for analysis. Published results keep only hashes and statistics.
