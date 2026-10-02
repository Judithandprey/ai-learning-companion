# Existing Windows nonvoice pass: prerequisite blocker

2026-10-02. This continues P0-07/P0-13 under Lead's
`handoff_1f988a3723e6232b44c29d5cfc9d2c4c`; it is not another acceptance campaign.
The assigned reviewed source baseline is
`471461578cf81a45060bbb9587c7c1374f5643ba`, normally merged into `team/qa` as
`f9e6ededa59ccb58beb9a3ab3cc8b36ece3b509f`. The one plan conflict preserves
Lead's newer attempt-counting rules and the retired unused selected-image slot.
No reset, force, production patch or push occurred.

Environment: AgentsDock WSL/Linux x86_64, existing repository Python venv and
Node 24.21.0, plus the existing Windows PowerShell entry. Severity: **integration
prerequisite blockers**, not confirmed UI defects. Expected: an admitted official
binary and permitted driver entry before generated-display/real-provider tests.
Actual: both prerequisites refuse before those tests begin.

## Actual prerequisite result

**BLOCKED before a real session or assigned real action.** The official launcher
path used by the existing QA launch configuration, `/home/agentsdock/.local/bin/codex`, now resolves to the installed
`0.160.0-x86_64-unknown-linux-musl/bin/codex`. Its observed SHA256 is
`12eb3e81114588aca3b7998f4f19e8997b056aca08e57a7ca7c8a3ec8c652aad`.
The released `chatgpt_launch._binary_identity()` requires the measured Linux
0.158.0 SHA256
`167c0148a849d2444f1b5a7fb5f8bb2de1de5ae13a2a504b833fc765980f5cd9`.
Calling that actual function from the exact 280-file source-only private copy
returns **`isolation_unverified`**. See [binary-admission.json](binary-admission.json).

Steps: extract only assigned `services/` and `packages/` to a new 0700 `/tmp`
directory; compare all 280 tracked files with `4714615`; run
`qa_binary_admission.py` with that copy as cwd and the official launcher path.
The read-only probe applies the production gate directly, without a substitute.

This is a reproducible launch prerequisite failure, not a provider inference
failure or a product UI refusal. In `create_client()`, this gate precedes state
preparation, locking and child creation. The probe did not construct a client,
execute Codex, acquire an account lock, inspect credentials or query the account.
It did not switch the launcher, replace the hash, change provider/model/account,
or relax isolation. The installed directory name is the observed version label;
the executable was not run to obtain a version response. No cause for its change
is inferred.

[real-attempts.json](real-attempts.json) records **0/4 attempts**: unattended
observation, automatic circle hint, changed-screen typed follow-up and Stop
interception are all **NOT_RUN**. No real Start, image/turn, official receipt or
model answer exists for this continuation. Sign-in, current selected image model
and quota remain **NOT_READ**. The spoken slot remains unused and cannot be
reassigned. The requested 4/60000/60000 policy was not exercised in a real session;
earlier synthetic policy evidence remains separately attributed.

## Preserved candidate and requirements

[stage-before.json](stage-before.json) freshly matches all 70 payload files of
production `175515308f509fb8c0f531dbdb10e57313fcde5a` at
`%TEMP%\lc-windows-live-1755153`, including
`dist/apps/windows/src/main/main.js`. The payload tree remains
`3387824a0dee70013104388d4acec2b810475e98953e7c3f196063a8781fd154`;
entrypoint SHA256 is
`581d42c430941f3b5d7b8aaa86ee3588ca1e4b4976a7de6a6dcbb7a00f3d4df5`.
Cached Electron is 44.5.1; existing runtime bytes are identified, not independently
authenticated as a distribution. No staging or original-profile changes were
made by the prerequisite probes.

[context-refresh.json](context-refresh.json) records unchanged relevant
requirements/guidance since the delivered offline work and matching hashes for
all eight source/English files. Applicable behavior remains §7.1/7.3,
R03/R08/R46–R48/R59, R51–R57 and V-SourceTimeRelations/V-EntitlementBudgetQuality;
the bounded pass cannot close either desktop's full-product gates. The prior
offline campaign and hidden rehearsal were not replayed.

[display-preflight.json](display-preflight.json) is a read-only native metadata
observation: one 1280×800 display as returned to the DPI-unaware helper,
1280×752 work area, current foreground PID/process and physical DWM bounds,
window DPI 192. It records no pixels, window titles or command lines. This alone
does not admit a safe capture surface or establish exclusive account/display
ownership. The earlier read-only Electron/port observation found no launches or
candidate-port listeners; an interactive run must revalidate that observation.

## Independent visible dragging check

**BLOCKED_SETUP, not executed.** The necessary QA-only driver delta reuses the
existing generated page, native UI runner and identity-safe cleanup. It orders
full-screen page/ownership admission before launching the product, because the
production control page requests display thumbnails on startup. Its actual
scratch PowerShell source parsed successfully on Windows. The normal `-File`
launch then exited **1 / `UnauthorizedAccess`** under the current effective
**Restricted** execution policy (all explicit scopes Undefined). See
[execution-policy.json](execution-policy.json) and
[classification-and-release.json](visible-01/classification-and-release.json).
No execution-policy override or alternate execution of the refused script was
attempted. The tool action itself was approved; this was an OS script-execution
refusal, not an automatic approval-review rejection.

The actual preparation entry was `node tests/e2e/windows/qa_visible_drag.mjs
docs/verification/qa/p0-13-live-1755153/nonvoice-pass/visible-01`, under exact
normal tool approval. Its archived input identifies the planned UI/drag steps;
the OS refused before the first step. This receipt is not retry authorization.

No product process, test browser, capture, CDP input or OS mouse drag started.
Consequently the outside-handle ambiguity remains **NOT_RUN on visible windows**.
The planned guarded Win32 fallback is also NOT_RUN. This supplies no actual
layout, physical-pen, full-display capture, AI, speech or caption pass.

Both Electron and Edge exact-identity cleanup receipts say **confirmed**, with
no owned identities, no signals, no remaining owned processes and no unresolved
ownership. An existing foreign Edge process and its children were untouched.
QA never acquired the account lock or opened owned display windows and is now
off the assigned display/account. The new sibling scratch and all original
stage/profile/auth data are preserved. [stage-after.json](stage-after.json)
freshly matches the same 70 files and payload tree after this setup attempt.

[visible-01](visible-01) retains the exact run-01 driver, adapted runner, step
list, generated-page bytes and original decoded diagnostics. Its stderr was
decoded using UTF-8 by that version, so Chinese OEM text has replacement
characters; ASCII `SecurityError`/`UnauthorizedAccess` survives. These are not
original raw native stderr bytes. The final helper preserves future native
diagnostic buffers and marks launcher failure explicitly. That small reporting
change received a syntax check only; the blocked native launch was not repeated.

## Next owner and release

Lead coordinates Backend/Support to restore or validate a compatible official
launch and its isolation evidence, and a permitted Windows driver entry under
existing permissions. QA does not change
the product's pinned binary or pick another executable to bypass this rejection.
No retry/restart or new spending is implied. A later substantive bounded
assignment must coordinate renewed resource use before the real pass resumes.
Account ownership was never acquired; explicit final display/process cleanup and
release are recorded above. The real pass remains BLOCKED, with zero attempts
spent and no automatic retry or voice-slot reuse.
