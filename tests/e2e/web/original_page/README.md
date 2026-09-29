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
  [QA_SCENARIO=pass|repro] node run.mjs <raw dir outside the repo>
python3 analyze.py <raw dir> <evidence dir>
```

- **`pass`** runs the owned synthetic course page, which provides controlled lifecycle cases, then one
  public learning page.
- **`repro`** repeats the region findings, adds a style-only layout shift, and makes real-timing
  attempts with no stand-in.

**Harness instrumentation** (labeled in `summary.json`):
- `chrome.tabs.captureVisibleTab` is wrapped in the extension's worker. The wrapper passes each call
  through and records the call, the active tab and the exact PNG returned. With no delay, it adds only
  a `tabs.query` before each capture.
- In the **timing stand-in** cases, the wrapper also waits before and/or after the real capture.
- Companion state is read through the worker, in the extension's isolated world.
- One case sends the product's own capture message from tab A's top frame to exercise the background
  fence directly.
- `qa-cdp-runner.ps1` is the candidate's runner plus one line: `triggerAction` may name an exact tab
  URL, which grants tab B in the A→B→A case.

**`analyze.py`** checks the product's report against the exact bytes captureVisibleTab returned. It
decodes every PNG independently and compares:
- the hash and size;
- the crop box and the crop's pixel statistics;
- what the crop actually shows.

Public-page pixels are not included in the published evidence; local raw captures/screenshots
are retained outside the repository for analysis. Published results keep only hashes and statistics.
