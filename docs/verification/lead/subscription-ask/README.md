# Managed ChatGPT subscription ASK integration

The user's direct “先接入官方订阅” is adopted in pushed decision baseline
`1b7c90558165c87c83564b1d6c777905923b8528`. This resolves the old separate-API
selection prerequisite. R38/§3.8/G4 select official managed ChatGPT through Codex
App Server for a bounded personal local text/image slice, not general API access.

The [private foreground interface](../../../adr/0003-managed-subscription-ask.md)
is versioned independently of all unchanged released capture contracts. Backend,
Learning, Windows and macOS own distinct production paths; QA prepares one
conditional integrated behavior pass. [Actual native handoffs](dispatch.json)
distinguish accepted sends from actual start replies. No duplicate team or old
acceptance campaign was started. [Interface review](interface-review.md) led to
exact connection/provenance fields, coordinate definitions, preserved nullable
facts and separate ASK-input versus inference lifetimes.

Support delivery `324fb11` is reviewed and integrated as `b459e96`. The installed
CLI is 0.158.0; its saved 314 stable/440 experimental schemas reproduce exactly
under the integrated offline audit. See the [version-specific report](../../support/codex-app-server-0.158.0-compatibility.md).
This establishes RPC shapes, not account eligibility, image inference or runtime
tool isolation. The actual installed-binary/fake-loopback follow-up `a1aa530` integrates as
`23074b7`: only `request_user_input` was advertised, the contaminated product-home
AGENTS witness was detected, and the clean-state HTTP 503 path made one POST with
selected-provider retries disabled. Saved receipt fields/probe SHA match. Lead
first used a newer completion key against the earlier receipt (KeyError), then
checked the actual earlier terminal/cleanup fields; no probe was repeated. These
are synthetic configuration findings, not managed provider or cross-OS proof.
[Exact limits and measured configuration](../../support/codex-app-server-isolation-followup.md).

Lead now ran the actual installed App Server connection read through the staged
connector: **signed_out**, image modalities listed, no quota facts available,
258 ms reported. [Sanitized result](connection-status.json). The private child
closed normally; no login was started and no inference occurred. Catalog entries
are not verified account entitlement. The next user action is official managed
ChatGPT login through the product connection UI when the desktop release is ready. The [initial request budget](request-budget.json) permits at most
three real submission attempts in total once reviewed code and isolation are
released; no owner has an active allocation yet. No API fallback, purchases,
private-content batch, quota retries or credential extraction are authorized.
Product-owned Codex state stays separate from development-agent state; Codex
itself performs login and manages credentials. Missing login must become a real
user-operated official connection entry, not a request to paste credentials.

Learning delivery `5b4b549` is [independently reviewed](learning-review.md) and
integrates as `e7c696f900b4b8f0df21926f22b19e68628e28d8`. Main's focused PNG/ASK
tests pass 180/180 (0.68s); six independent groups/30 checks also pass, including
the archived Windows mapper versus Python crop validation. Exact PNG/provenance,
nullable facts, mutations and separate generated-response binding are covered.
No semantic teaching quality, model image understanding or lifecycle authority
is inferred from this pure seam. The first independent probe's missing Node PATH
is preserved in its report and corrected with the pinned executable.

Backend first leaf `18fe478` had a [bounded review](backend-review.md) with two
findings and a hard-disabled gate. Correction `7dc5e4` integrates as
`9884c601d03b2fc626a69a269fcec093d05f2357`; the
[correction review](backend-correction-review.md) closes B-SUB-01/02. Its 144
focused review checks/five independent controls pass. Lead separately reviewed
the complete receipt writer/call sites and ran its 41 exact-candidate tests
(0.10s); atomic send-state and terminal/local-outcome distinctions are retained.
The saved actual settings-template hash matches the exact candidate. Integrated
main connector tests pass **313/313 in 6.99s**, using only synthetic children.

Lead then ran the corrected production launch/connection read on the existing
product-owned state: exact config/skills verification succeeds, the managed alias
is active, and official auth remains **signed_out**; catalog image capabilities
are listed. The child is reaped. [Actual result](corrected-connection-status.json)
records 360ms and zero inference/login starts. At that historical release the gate admitted only the pinned Linux/WSL
binary/configuration; the current Mac addition is recorded below, while account
entitlement remains open. No real request budget has been allocated or spent.

QA preparation `d2de2ba` and correction `4c63a2e` integrate as `ec9f5a7`/`fad98c7`.
Lead reproduced two negated/uncertain answer false positives in the first judge;
the correction holds such output and requires semantic review for every match.
All 31 integrated judge cases and changed JS syntax checks pass. This is harness
validation, not image inference or desktop execution.
No display or real request is allocated from these preparations.

Next: integrate the actual desktop deliveries against `9884c60`, run focused
changed-path checks and independent review, then release the exact Windows
candidate/display/budget to QA. Acceptance requires the real image-bearing turn
and randomized image-only answer visibly bound to the retained ASK context.
Mac build evidence, actual interactive Mac access, continuous whole-screen AI,
audio, physical pen and Notability remain distinct open gates. User preview,
`lc_desktop_preview`, ports 4173/8174 and Paperclip remain untouched.

Existing CI at `d9c7334` passed both Python 3.12/3.14 jobs in
[run 36821816955](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36821816955).
It predates `9884c60` and does not validate that later correction.

Exact pushed connector release `871aabd974a8b1c11d18072da7200b0a2413ae73`
was sent to Windows and Native through accepted native receipts in dispatch.json;
these are dependency deliveries, not claims those owners already read that SHA.
Support has one accepted bounded preparation task for a hosted macOS metadata-only
compatibility probe, with explicit root-workflow delegation. It neither blocks
Windows login nor changes production admission before actual reviewed evidence.


Windows delivery `68b4cd9` / author report `4944cc3` is under source review and
**not released for real acceptance**. [Lead UI review](windows-ui-review.md)
reproduces two faults; [independent transport review](windows-transport-review.md)
reproduces two blocking protocol faults and one cleanup defect. W-SUB-T01/T02/T03
map to handoff W-SUB-03/04/05 respectively; W-SUB-05 is non-blocking cleanup.
The existing Web owner has one accepted bounded correction, not a new task.
All probes are synthetic; the real request budget remains unallocated/unspent.
Support metadata-only macOS workflow/probe `d8a402b` is [independently approved](mac-metadata-review.md), integrated and pushed as `de46212ac6c4800d8e0170c1ee4fe59f716a2de4`. All nine focused tests pass on integrated main (0.165s). The one [hosted metadata run](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36825904220) passed on that exact SHA. Its [actual receipt](mac-metadata-hosted.json) records macOS 26.6.2/arm64, CLI 0.158.0 and matching pinned binary; effective configuration and six disabled skills passed. Lead verified all five source hashes, metadata-only method sequence and child/state cleanup. No account/login/model/turn request occurred. Subsequent Backend addition `2831480` integrates as `46e1a70`, admitting only the measured Mac arm64 hash as well as the unchanged Linux pin; interactive Mac and inference remain unverified. No new account/device result
is inferred from either delivery.


At pushed evidence baseline `80bcd81`, Backend received one precise continuation
for the measured Mac platform/architecture/hash admission (actual accepted receipt
in dispatch.json). Native received the same evidence and cancellation/login race
constraints for its existing slice. Neither receipt is a start or acceptance claim.
Read-only Web worktree inspection observes matching correction edits at owner HEAD
`4944cc3`; these are active uncommitted work, not a reviewed delivery. Lead waits
for that exact correction before integrating the Windows candidate and releasing
QA's user-operated official login/real image path. No credentials or private user
screens have been captured, and no real requests have been allocated or spent.


Backend Mac admission delivery `28314805a5500ceb6457d9f275372daed7c1eec2`
is integrated as `46e1a70f6b26cc2cbd5ff0cce68b1971de6b9505`. Production diff is
an exact platform/architecture/hash lookup; independent source review approved
the unchanged Linux gate and all five prior metadata source hashes. No auth, settings, skill, thread,
receipt or provider fallback change. Main focused launch suite: **129 passed in
0.22s**. Synthetic platform/hash cases exercise actual file hashing and reject
unknown/cross-platform candidates. The earlier hosted metadata evidence is reused,
not rerun. This does not yet establish Mac production-factory execution, login,
image inference or device acceptance. Next owner: Native consumes this released
connector in its existing UI/build slice; Windows correction and independent real
image acceptance retain their separate pending status.
