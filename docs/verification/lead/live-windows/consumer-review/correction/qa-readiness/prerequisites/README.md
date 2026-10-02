# Windows live QA: startup blockers and one driver correction

2026-10-02. Actual `handoff_37659c18217cb9a3e3ba8ca6d642b069` delivers
`d91a326455c01847df8b6b2230fa715bd9ea1318`, after QA's normal `4714615` merge
`f9e6ede`. Lead reviewed it against main `ee1fc22`. The leaf remains unintegrated
pending the bounded driver correction below. Original evidence is readable with
`git show d91a326:docs/verification/qa/p0-13-live-1755153/nonvoice-pass/README.md`.

## Actual result and released resources

[Independent audit](independent-hash-audit.json) matches 20/20 exact artifacts,
8/8 source/English hashes, the 280/280-file private source copy and 70/70 staged
files. [Changed-helper review](independent-review.md) establishes PRE-01 below.
The QA plan has three merge conflicts and retirement notices present only in its
parent; integrate those carefully after the correction, retaining all-attempt
counting and the retired old slot. No campaign was rerun.

QA reached neither product Start nor the generated-page test browser. All four
assigned real actions are **NOT_RUN / zero attempts**, with no account query,
managed lock, provider response, audio or capture. The [ledger](qa-real-attempts.json)
and [explicit release](qa-release.json) report no owned windows/processes and no
signals; foreign Edge remained untouched. Lead has closed that coordination
allocation in the existing request ledger. A fresh substantive assignment must
precede any eventual real pass; elapsed time or this review is not a new lease.

The same 70-file `1755153` package matches before/after according to the retained
QA stage records. Prior hidden-window/fake-provider results remain separate;
this continuation adds no actual GUI/AI, drag, speech or device acceptance.

## Binary prerequisite: existing reviewed bytes are still available

The [actual failed admission](qa-binary-admission.json) is `isolation_unverified`:
the generic official launcher now resolves to observed0.160 bytes, while the
released connector intentionally admits the measured0.158 bytes. This is before
client/state/lock creation, not a quota failure or proof that the account is out
of allowance. No cause for the install change is inferred.

Lead independently invoked the **unchanged** `_binary_identity` on the existing
versioned0.158 executable; [result](pinned-binary-admission.json) matches the
released SHA `167c0148a849d2444f1b5a7fb5f8bb2de1de5ae13a2a504b833fc765980f5cd9`.
No executable was started and no account/state was opened. The product's existing
trusted `codex_bin` setting passes `LC_SUBSCRIPTION_CODEX_BIN` through its private
child environment. The next reviewed QA configuration can explicitly select:

```
/home/agentsdock/.codex/packages/standalone/releases/0.158.0-x86_64-unknown-linux-musl/bin/codex
```

Recheck that exact digest before use. Do not change the AgentsDock launcher,
installed versions, runtime settings, production gate, model, auth profile or
credentials. This selects the already-supported dependency; it does not validate
0.160 or prove current login/inference. No Backend compatibility rewrite is needed
for this bounded next pass.

## QA-LIVE-PRE-01: guard every visible display before thumbnail startup

This is the same single finding labeled `QA-PREREQ-01` in the preserved
independent report; it is not an additional defect. Scratch artifact names in
that report refer to the reviewer's original directory.

The proposed `tests/e2e/windows/qa_visible_drag.mjs:142–148` launches the product
at step144, then checks that its display list has exactly one item at145/148.
The earlier owned Edge geometry/on-top checks do not exclude a second monitor.
Production `main.ts:150–151` obtains thumbnails for **all screens**;
`control.ts:103` requests the list on startup. On a two-display setup the helper
can therefore read the second display before discovering the unsupported setup.
This is a source-level future-execution defect, not a claim that private pixels
were captured in this OS-refused run.

Same QA owner corrects the changed helper in `tests/e2e/windows/` and its own
verification directory. Before any product launch/display enumeration, use
non-pixel native display metadata to reject multiple/unknown/changed displays
and validate the generated owned surface against the admitted display/geometry.
Keep the existing foreground and capture-time guards; stale preflight metadata
alone is insufficient. Add focused negative controls proving product launch is
not reached for multiple, unknown or changed display geometry, and preserve the
prior refusal evidence. Do not broaden this into another product campaign.

## Actual Windows script restriction and next step

The planned runner parsed, but normal `-File` execution failed with
`UnauthorizedAccess` under effective **Restricted**, all explicit scopes
Undefined: [observed policy](qa-execution-policy.json). This was an OS refusal,
**not** an automatic approval-review rejection. It occurred before the first
test step. No policy override or alternate execution was attempted.

QA prepares and syntax-checks the corrected exact script/arguments and a narrow
execution request; it does not run the refused payload by `-Command`, another
engine, or an execution-policy override. Lead reviews the corrected candidate
and obtains any required explicit process-scoped script permission before a new
display/account allocation. No machine-wide or persistent permission change is
proposed. The current helper is not ready for such execution while PRE-01 is open.

Next owner: QA for this one offline preparation; Lead for review/permission and
resource coordination; then the same QA task runs only the remaining bounded
acceptance. Native separately retains MAC-LIVE-03. Native TTS approval, actual
audio input and interactive Mac gates remain unchanged. Old app/profile/user
preview data and Paperclip are untouched.
