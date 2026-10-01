# Bounded live desktop companion over the managed subscription

Status: additive executable interface released with this revision; runtime consumers
and real Windows acceptance remain unfinished. This continues R03/R08/R09/R35–38,
R46/R51–60, §3.8/7.1/7.3 and AUDIO-06/08/09/13/15. Read the complete current source,
English derivative and decisions. ADR 0003 is the retained selected-image milestone,
not the current product workflow. No public capture protocol or v0.1.0 field changes.

## Observable next outcome

Explicit Start shows which whole display is observed and the bounded session's
remaining requests/time. Fresh composed frames, obtainable ink and relevant recent
conversation enter one app learning context. A circle identifies focus within that
whole image and requests an immediate small contextual hint without a second Ask
button or required text. Text or explicit Talk can continue the same context.
Observation alone requests no displayed answer. Exploration and disclosure scope
remain authoritative; choosing a region never grants a full solution.

Silent point-reading remains the default. Explicit Talk/mute/interrupt controls and
floating captions accompany actual spoken responses. Caption and toolbar handles
move without drawing or asking, persist positions and clamp to available work areas.
No fresh audio, system-playback, acoustic identity or real provider claim follows
from implementing these surfaces. Source transcripts preserve track versus speaker
and uncertainty. Support's actual capability evidence determines the first audio
adapter; no speculative paid provider, new auth lifecycle or saved-recording step.

## Small shared seam, existing components

Reuse the foreground Python connector, managed App Server child, existing PNG
validation, app storage, learning archive and Windows/Mac clients. There is no new
service, listener, database, credential owner or persistent conversation store.
Backend owns transport/session enforcement; Learning owns pure preparation and
response/presentation binding; clients own capture, UI, local retention and current
permission. Lead owns this private version and final integration.

`packages/contracts/live_companion` is the executable schema/semantic validator,
with a generated JSON schema and non-sensitive full-image example. The version is
**`lc-subscription-live/1`**. Existing `lc-subscription-ask/1` remains byte/behavior
compatible at its boundary. A client selects one version for a foreground child;
reject mixed versions rather than reinterpret old fields. Use the existing module
entrypoint, dispatching by version, not another daemon or endpoint.

Requests remain `{version,id,method,params}`; successful responses `{id,result}`;
errors `{id,error:{code,submission}}`, with fixed client descriptions, never raw
provider messages. `submission` is `not_submitted|submitted|unknown`, independently
of the error's cause. Preserve deeper write/ack/terminal facts in sanitized existing
operational receipts. Input line limit 12 MiB; live output limit 1 MiB (legacy limit
unchanged). Reject before writing if bounds cannot be met. No secret/image/prompt
content in operational logs; original frames/history stay in existing app storage.

| Method | Parameters / result |
| --- | --- |
| `connection/read` | `{}` → `Connection`: managed auth, actual models and structured `Quota`. Metadata availability is not inference entitlement. |
| `connection/login/start` / `connection/login/cancel` | Existing managed login parameters/results and completion event from ADR 0003. No token copying, account switching or auth-owner change. |
| `companion/start` | `Start` → `{session_id,epoch,remaining_submissions,expires_in_ms}`. Screen permission and selected model must be current; audio flags require an actually available explicitly enabled route. |
| `companion/turn` | `Turn` → `Result` after actual successful completion. Includes full original PNG, separately bound focus, current assistance/presentation intent and bounded original recent history/gaps. |
| `companion/interrupt` | `{session_id,epoch,request_id:null|string}` → `{cancelled,uncertain}`; cancels the selected/current request and pending work, but not an unrelated new session. |
| `companion/stop` | `{session_id,epoch}` → `{cancelled,uncertain}`; terminal for this session/epoch. Only a new explicit Start with a new session ID can resume. |

Exact field names/types are in the executable schema, not implicit official RPC
fields. A Turn's `context` reuses ADR 0003 metadata but its image/region is the
**entire selected display**. `focus` optionally contains a same-frame rectangle
with actual DIP-to-frame mapping; follow-ups can retain it only after validating
its anchor. Display origin/nominal scale cannot replace actual captured dimensions.
PNG bytes/hash/dimensions must pass the existing full decoder validation before
provider submission; schema validation alone does not establish actual pixels.
Missing source URL/video time/capture UTC remains null, not invented.

`history` is at most 24 original entries, 4,000 characters each / 32,000 total.
Original history remains retained outside this bounded prompt; omitted context is
explicitly noted, not represented as complete memory. Full prepared prompt remains
within the existing 65,536-character bound. Do not silently cut original records.
`audio_source` records source/track separately from speaker/attribution, with
unknowns and actual available timing. A transcript is not raw acoustic evidence;
`voice_followup` additionally needs an explicit user Talk/recipient decision from
the trusted caller. A teacher's captured words do not independently authorize help.

Learning's callable names are `prepare_live_session_context`,
`bind_live_session_response` and `authorize_live_presentation`. `Result.provenance`
retains the exact Turn minus base64 image bytes. Recheck `CurrentState` against the
retained result before every text/caption/speech output. `CurrentState` is
`{active,cancelled,provenance}`; its provenance comes from the trusted main process
and must match the complete retained Turn projection, not just IDs or geometry.
Session, capture, epoch, request, permission revision, image hash, user words,
history, whole context/ink and focus must match; active and not cancelled, with
current assistance and presentation still permitted. Never copy the provider
result into current state as a substitute for checking the live caller state.
Observation responses are internal provisional observations, never help cards or
mastery evidence. `none` and scoped independent exploration suppress help across
all channels. Speech requires its matching caption and a current Talk preference;
actual shown/played events are recorded separately from generated/unconfirmed text.
Validation/prompt instructions are not a proof of semantic non-disclosure.

## Bounded scheduling and Stop

One provider request may be in flight. The client retains at most one newest
pending observation; coalescing/backpressure leaves explicit sequence gaps while
retained originals are not deleted. A focus/follow-up replaces a pending observation;
if an inference is already active, show pending/busy or explicitly interrupt it,
never silently overlap or retry. Both observation and focus requests count against
the same finite allowance. Each potentially submitted request consumes one local
budget slot; uncertain outcome is not a refundable slot or a retry opportunity.

Initial engineering defaults: at most 12 submissions / 5 minutes after explicit
Start, minimum 30 seconds between unattended observations. The UI shows the bounds;
no automatic renewal. These are implementation defaults, not a new user spending
budget or permission for QA to consume 12 calls. Existing narrower real-test
allocations remain authoritative. Show the last actual observation/receipt age and
coverage; do not call cached/stopped/unobserved content live. Sampling is not
frame-perfect understanding, and unsupported sources/gaps remain visible.

Enforce budgets/time with a monotonic clock in the trusted bridge, and reject stale
or mismatched session/epoch/capture/request state immediately before any provider
write. Stop/permission loss fences queued input and output immediately, clears
pending observations, interrupts the active request and cancels old speech/captions.
EOF/child failures keep existing bounded shutdown and uncertainty semantics. No
reconnect, percentage reset or quota notification resumes a stopped session.
The user is actively using an older package: preparing this implementation does
not authorize touching their current display, microphone, app, files or auth state.

## Quota facts and refusal reasons

Verified installed schema: Codex 0.158.0, official
[App Server reference](https://learn.chatgpt.com/docs/app-server). Credits are exact
server strings and boolean flags; unavailable differs from zero. Preserve bucket
identity, reached classification, individual/spend-control facts and nullable
ordinary-usage permission. Do not add the legacy mirror twice or infer permission
from percentages/reset times or an unrelated account's balance.

`ordinaryUsageAllowed=false` is a server refusal of ordinary included usage,
not proof that every credit balance is depleted. Positive credits do not override
that field or alone prove a permitted credit-spending route. The field describes
included usage only: do not use it alone as a blanket local veto on the user
authorized managed request. Preserve applicable explicit spend/workspace controls;
let the same official route authoritatively accept or reject credit-backed usage
without changing account, billing, auth or retrying. Null is unknown, not a
manufactured zero/approval or recovery of a latched refusal. The unsubmitted
preflight failure at the old boundary is not a proven turn-level server denial.
Existing owned ordinary credits may be used within the authorized session when
the official route permits. Do not call `account/rateLimitResetCredit/consume`,
consume earned resets, purchase, enable API billing or switch accounts/models.

Live error categories distinguish `allowance_exhausted`, `rate_limited`,
`ordinary_usage_not_allowed`, `allowance_unknown`, `workspace_limit`,
`unauthenticated`, `unsupported_model`, `context_limit`, `overloaded`, plus lifecycle
and validation failures in the schema. Use actual typed RPC failures, never a
message substring. Reached owner/member reasons remain per-bucket facts; do not
claim an unrelated snapshot caused a failed turn. Authoritative denials are not
bypassed and unknown/submitted errors are never blindly retried.

## Release/acceptance

Backend → Learning → Windows consume the exact committed baseline; native finishes
its already assigned Mac Stop correction before reuse. Independent QA exercises the
changed usable flow once on the actual new package, using generated non-sensitive
screens and coordinated audio only. Record exact candidate/launch version, fresh
whole image plus focus/ink/context, actual model/auth/latency, automatic focus answer,
text/voice follow-up, audible reply plus matching caption, drag/DPI/navigation,
Stop and truthful quota failure. Build/offline/real Windows/real subscription/Mac
statuses remain separate. A fixture or schema pass closes no real-AI/audio gate.
The corrected release gets a distinct directory/version and reversible reopen
instructions; the user's active old package/profile is not overwritten or stopped.
