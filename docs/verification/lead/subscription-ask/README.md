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
tool isolation. A single bounded installed-binary/fake-loopback follow-up checks
the actual tool exposure; it uses no official auth/model request or quota.

No product login, account RPC or inference has been executed by Lead in this
milestone. The [initial request budget](request-budget.json) permits at most
three real submission attempts in total once reviewed code and isolation are
released; no owner has an active allocation yet. No API fallback, purchases,
private-content batch, quota retries or credential extraction are authorized.
Product-owned Codex state stays separate from development-agent state; Codex
itself performs login and manages credentials. Missing login must become a real
user-operated official connection entry, not a request to paste credentials.

Next: integrate the actual connector/Learning/desktop deliveries, run focused
changed-path checks and independent review, then release the exact Windows
candidate/display/budget to QA. Acceptance requires the real image-bearing turn
and randomized image-only answer visibly bound to the retained ASK context.
Mac build evidence, actual interactive Mac access, continuous whole-screen AI,
audio, physical pen and Notability remain distinct open gates. User preview,
`lc_desktop_preview`, ports 4173/8174 and Paperclip remain untouched.
