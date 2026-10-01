# Windows subscription release for independent behavior acceptance

Owner leaves `68b4cd9`, `4944cc3`, `c977df5`, `84fc56a` integrate in order as
`8cfb04b`, `dbc6365`, `c801135`, `eb9dea4`. The complete Windows source tree
matches final owner candidate `84fc56a99a6e5c9dd98c39fb945cb93b573687ba`.
Shared managed connector includes reviewed Linux/WSL and Mac arm64 pins.

[Final independent review](fence-review.md) closes the remaining W-SUB-T01-FENCE:
original same-chunk reproduction now keeps one child/read, reports unavailable,
and does not restart automatically; four targeted checks pass. Earlier UI,
durability, cancellation and lifecycle fixes remain reviewed. Both author
Windows/Linux receipts' 63 source/test hashes and logs match integrated source.

On integrated main, the two affected suites contain 55 cases: 54 pass in the
restricted sandbox; the synthetic real-child pipe case has no child response
there. An approved exact-case retry outside that sandbox passes (98ms), making
all 55 cases verified without rerunning the passing cases. No Codex/model/auth
request is involved in those tests. TypeScript and static build pass.
[Raw restricted run](main-tests.txt) preserves the environmental failure;
[verification](verification.json) distinguishes its successful retry.

This is source approval for independent QA, not real account/image acceptance.
QA continues its existing runner task against this exact candidate, then one
isolated Windows app/surface run with approved display ownership. The real
connector Check can expose managed login state; missing login is a concrete
user-operated official Sign in action. QA must not accept consent, copy secrets,
or log an auth URL. One initial real image attempt may be used only after managed
login and generated-surface checks succeed; no retry, API-key fallback, private
screen input or other provider activation. Failed/missing prerequisites consume
no inference and are reported. The global initial limit remains three attempts.

Actual official image input, correctly identified randomized pixels/ink, visible
app response and identical retained provenance are required. Stop/cancel/refusal
controls remain labeled synthetic. Physical pen, ongoing whole-screen AI, audio,
Notability, interactive Mac and complete-product acceptance remain open.
