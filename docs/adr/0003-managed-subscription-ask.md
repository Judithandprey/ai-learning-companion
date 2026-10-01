# Managed ChatGPT subscription: first desktop image response

Status: implementation assignment, not connected/accepted. Baseline before this
decision: `e9ccccad6ac425a3d19a654e74340c565e3564c4`.

The user's direct instruction “先接入官方订阅” selects the existing ChatGPT
subscription via official managed Codex App Server for this personal local
prototype (R38, §3.8, G4). A separate API key is not a prerequisite. Read the
current source/English decision; preserve all existing product gates.

## One flow and ownership

Windows captures the current selected region with its visible committed ink,
keeps its immutable pixels and source metadata in the existing local capture
directory, and submits only after explicit ASK. The existing card displays the
completed answer beside that exact selection. Normal capture/writing sends no
model request. The first slice is selected-image ASK, not continuous observation.

Reuse the foreground Python/local-child pattern for one shared connector usable
by both desktop clients. It avoids a new listener, DB migration, identity store or
wire change. Codex is a private child of the connector, which is a private child
of the app. No daemon is installed. EOF/Stop/cancel has bounded cleanup; no retry
of an uncertain inference and no automatically resumed prompt.

- Backend: `services/worker/connectors/` managed RPC client and foreground JSONL
  bridge, its owned tests/evidence. Preserve the default disabled connector.
- Learning: `services/learning/subscription_ask.py` and owned tests/evidence;
  bounded original-PNG validation and English-first prompt/provenance assembly,
  response binding. No separate archive, provider, network or credential access.
- Web: `apps/windows/**` connection UI, exact-source ASK bridge, locally retained
  request/response evidence and lifecycle. No public server or preview replacement.
- Native: reuse the same bridge in `apps/macos/**`; independent native build,
  without implying an interactive Mac or starting mobile work.
- Support: installed official RPC/tool-isolation compatibility evidence only.
- QA: one exact integrated Windows image-bearing behavior pass and scoped
  cancellation/refusal controls, after Lead releases the candidate and display.
- Lead: this private envelope, compatibility/review/integration and release.

## Private desktop-to-connector JSONL interface, version 1

This is local process IPC, **not a new public capture protocol**. Every request is
`{version:"lc-subscription-ask/1", id:string, method:string, params:object}`.
Response: `{id, result:object}` or `{id, error:{code:string,message:string}}`.
Events: `{method:string, params:object}`. Lines are bounded; text errors must be
sanitized, with no credentials, whole RPC dump or private screenshot in logs.
Use the installed official Codex schema for the inner RPC; this envelope does not
invent official fields.

Launch: `<python> -m services.worker.connectors.chatgpt_local`, cwd the trusted
Backend checkout; no startup record or READY line. First `connection/read` is the
handshake. stdin is a private pipe, stdout only JSONL, stderr never forwarded to
the UI/log. Incoming lines max 12 MiB, outgoing max 256 KiB; completed answer text
max 32,000 characters. Identifiers are nonempty strings up to 128 characters,
without control characters. No arbitrary commands/paths in JSON requests.

The bridge owns a product-specific Codex state directory and empty work directory,
separate from existing development-agent state. No credential files are copied.
Trusted launch configuration may supply `LC_SUBSCRIPTION_STATE_DIR` and
`LC_SUBSCRIPTION_CODEX_BIN`; otherwise use the product-specific local-data default
and installed `codex` from PATH. These are native/main-only settings, never renderer
or model inputs. Drop inherited API/auth/provider and development runtime variables;
use a minimal environment for the Codex child. Support verifies the exact supported
child configuration before inference. Changing only this product child does not
change the seven AgentsDock runtimes, permissions or auth. A fresh managed login
in that product state may be required.

The reviewed launch at `46e1a70` admits only the measured Linux x86_64/WSL
and macOS arm64 Codex 0.158.0 binaries, each bound to its exact platform,
architecture and executable hash. The Mac pin follows hosted metadata run
`36825904220`; native Windows, Intel Mac and other builds remain unverified.
A compiled client does not extend admission. Official effective config,
requirements, disabled skill inventory and thread policy are still checked
before submission. Mac production-factory/login/inference and interactive
acceptance remain separate from metadata compatibility.

The fixed `lc_managed_chatgpt` provider name is a configuration alias for the same
managed ChatGPT route: `requires_openai_auth=true`, forced ChatGPT login, no
endpoint/key/token/auth-command override, no provider fallback, and request/stream
retry settings zero. Installed 0.158.0 rejects overrides of the reserved built-in
`openai` ID. This alias implements the existing user choice, not a new supplier or
an API-key alternative. Codex still owns login/token refresh. See the
[exact configuration evidence](../verification/backend/p0-04-managed-subscription-launch.md).

Minimal sanitized operational receipts are written under the product state's
`receipts/<launch>/<sha256(request_id)>.json`. They bind actual input types/hashes,
transport counters, model/binary and terminal/local outcomes; they contain no
prompt/image content or credentials. Prepared, uncertain, written and acknowledged
are distinct states. QA must correlate the receipt with retained desktop pixels
and the visible response. A receipt alone does not establish image understanding.

Exact successful result/event shapes (optional information uses explicit null):

```text
connection/read -> {
  auth:{state:signed_in|signed_out|unknown, mode:chatgpt|null, plan:string|null},
  rate_limits:[{label:string,used_percent:number,resets_at:UTC_timestamp|null}]|null,
  models:[{id:string,label:string,image_input:boolean,default:boolean}]
}
connection/login/start -> {login_id:string,auth_url:string}
connection/login/completed event -> {login_id:string,success:boolean,error:string|null}
connection/login/cancel -> {}
session/stop -> {}
ask/cancel -> {cancelled:boolean,uncertain:boolean}
```

`signed_in` means managed ChatGPT account reported by Codex, not successful model
access. Other authentication modes do not become managed ChatGPT. Unknown quota
or modality stays unavailable; do not infer image support from a missing field.
The desktop opens `auth_url` only on a user click, after validating HTTPS, no
userinfo, and exact `openai.com`/`chatgpt.com` host or their dot-delimited subdomains.
Never log the login URL. Login errors expose fixed sanitized descriptions.

Closed error codes: `busy`, `unauthenticated`, `unsupported_model`,
`invalid_request`, `session_stopped`, `cancelled`, `interrupt_unconfirmed`,
`quota`, `failed`, `unavailable`. Clients map codes to fixed text, not raw error
messages. Invalid images use `invalid_request`; unsuccessful/incomplete turns use
`failed` unless a more precise listed code applies. `cancelled:true` means local
submission/presentation is fenced, not proven remote rollback; `uncertain:true`
records unconfirmed remote interruption.

- `connection/read {}` returns sanitized managed-auth state, plan label when
  available, quota windows and model catalog/capabilities. No email/token needed.
  Catalog availability is not proof of inference entitlement.
- `connection/login/start {}` uses official `account/login/start` with managed
  ChatGPT browser login, returning only the official login URL and login ID to
  the product UI. Propagate official completion/error as
  `connection/login/completed`. Browser access/consent is performed by the user.
- `connection/login/cancel {login_id}` cancels only this product's pending login.
  Closing/disconnecting the product does not log out other Codex clients.
- `ask/start {request, model}`: one in-flight request; complete the response only
  after an official successful completed turn. Reject busy/unauthenticated,
  unsupported image model, malformed/oversize image or stopped capture session.
  Return `request_id`, completed `text`, `provenance`, actual `model`,
  `auth_mode:"chatgpt"`, `latency_ms` and official thread/turn identifiers.
  `kind:"generated_assistance"` labels the separate model output. The exact
  identifier keys are `thread_id` and `turn_id`.
  Incomplete/error/cancelled turns never become completed answers. No retry.
- `ask/cancel {request_id}` invalidates presentation at once and interrupts that
  turn. Cancellation racing before `turn/start` must prevent later submission;
  racing after submission must suppress late response. Report uncertainty if
  interruption cannot be confirmed, never promise quota rollback.
- `session/stop {capture_session_id}` permanently fences further asks for that
  capture session in this child and cancels its in-flight request. Only a later
  explicit desktop Start with a different session can submit again.
- EOF ends this connector and its owned Codex child within a bounded interval.

`request` is exactly:

```text
request_id: bounded identifier
question: nonempty bounded user text
assistance: hint | explain | full_solution
image: {png_base64, sha256, width, height}
context: {
  capture_session_id, frame_seq, frame_captured_at, frame_width, frame_height,
  display: {id:string, bounds:{x,y,width,height}, scale_factor},
  region_dip:{x,y,width,height}, region_px:{x,y,width,height},
  ink_revision, ink_sha256,
  source_url, source_version, media_position
}
```

Limits: question 4,000 characters, PNG 8 MiB, 16 million pixels, one image and one
request at a time; engineering defaults, not user-mandated values. `ink_sha256`
binds the exact retained editable document drawn into this selection; nullable
only when no retained document is available, which remains explicit. URL/version/
media position are nullable unknowns, not invented from visible pixels. Display,
frame and ink are the actual captured facts supplied by the trusted desktop main
process, not a model assertion. Record PNG SHA-256 and exact context in both
request and response; keep model text separate from originals. Rectangles must
be finite/positive and within the corresponding captured display/image bounds.
`region_dip` is display-local DIP/points (origin 0,0); `display.bounds.x/y` is the
global desktop origin and may be negative. `region_px` is frame-local pixels:
clamp to the display, floor the scaled left/top and ceil right/bottom using the
actual frame width/height versus display size. Crop PNG dimensions equal the
integer `region_px.width/height`. Do not assume scale_factor alone establishes
capture dimensions. `frame_captured_at` may be null when unknown; it must not be
invented from response time. `ink_revision` may be null only with null ink hash;
null hash with a known revision explicitly records unavailable editable-original
binding. Both known and unknown facts survive to the card.
`display.id` follows the existing bounded identifier rule (nonempty text, up to
128 characters, without control characters). Native numeric display identifiers
must be represented as text; this documents the released validator, not a new
wire version or field conversion in the shared connector.
When known, `source_version` is a positive integer and `media_position` a
nonnegative numeric position; this slice sends null when the platform has no
such evidence. JSON integer-valued numbers remain interoperable across runtimes.

Provenance shape is exactly `{request_id,question,assistance,image:{sha256,width,
height},context}`. `context` echoes every validated field above, including nulls.
It never includes base64 or credentials. Clients compare the full frozen
provenance to their retained request before presenting a result; checking only
the capture session or image hash is insufficient for changed selection/ink.

Learning callable seam:
`prepare_subscription_ask(request) -> {text, image_bytes, provenance}`; return
the exact decoded validated PNG bytes. `bind_subscription_response(prepared,
text, *, model, auth_mode, latency_ms, thread_id, turn_id) -> result` preserves
the complete provenance and labels generated assistance. These pure functions
do not grant send/display authority. Backend rechecks cancellation before inner
submission/completion; desktop main rechecks its session/request/selection before
display. Existing capture/lifecycle rules remain authoritative.

## Official authentication and execution bounds

Use managed `account/read`, `account/login/start`/completion/cancel,
`account/rateLimits/read`, `model/list`, `thread/start`, `turn/start` with actual
`image`/`localImage`, and `turn/interrupt`, as verified against installed
`codex-cli 0.158.0` schemas and current official docs. Codex alone owns OAuth,
token persistence and refresh. Do not open/copy auth files or mix managed auth
with app-owned SIWC tokens. An API-key/other auth mode is not accepted as this
subscription mode. Expose a real login step if managed login is absent.

Launch in a dedicated empty work directory, no project instructions. Disable
shell/execution, hooks, MCP/apps, web/computer-use and other tools through actual
supported configuration; reject server tool/approval requests, and use restrictive
sandboxing as defense in depth. Verify supported isolation before any inference;
do not silently inherit the development agents' tools/configuration. Captured
pixels/text are untrusted learning material, never instructions to act in apps.

Use simple English and original technical terms, hint-first when applicable;
unknown reasoning stays unknown. No full solution without explicit matching
request scope. Normal writing, erasing, or capture is not response permission.
Render model content as text, not executable HTML or commands.

## Acceptance and limits

First real verification: generated non-sensitive content on the available Windows
display, randomized visual-only information absent from prompts/filenames; actual
captured selection and ink sent through official image input; successfully
completed answer correctly identifies it in the existing ASK card. Record exact
source candidate, model, auth mode, image hash/source/time/ink, outcome and latency,
quota/auth/capability limits without secrets. Modest bounded calls only; no paid
API fallback, purchase, private-content batch or repeated quota retry.

Also verify cancellation before submission, in flight and after Stop suppresses
new/late work; these may use focused deterministic controls separately labeled
from the real image turn. Account/login/catalog success, OCR-only prompt, mocks
and echoed text do not pass real image acceptance. Interactive Mac, full ongoing
screen understanding, physical pen, audio/video and Notability remain separate.

References: [official App Server](https://learn.chatgpt.com/docs/app-server),
[separate app-owned Sign in with ChatGPT](https://developers.openai.com/siwc/token-sharing-open-source).
