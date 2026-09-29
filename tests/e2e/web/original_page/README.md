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
