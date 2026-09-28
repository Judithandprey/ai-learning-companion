# P0-03 minimum native prototype plan (design only, nothing implemented)

Date: 2026-09-28 UTC. This plan specifies what to build once a compile route exists (see
[`p0-03-environment.md`](p0-03-environment.md)). **No Swift has been written.** Each probe answers
specific matrix rows, has a hard size bound, and produces a JSON log that becomes device evidence.
Probe results, including failures, are recorded as contract-0.1.0 `CapabilityResult` rows.
`device_pass` and device `failed` results require `device:` evidence; `compiled` and
`automated_pass` require `exec:` evidence. `apps/ios/tools/check_capability_matrix.py` enforces this.

## Rules for native source

- No Swift is written before its route exists: C (Swift Playground on the iPad), D (lead-owned CI
  compile job) or A (Mac with Xcode 27). Source that has been written but not compiled is labelled
  `uncompiled` in its header and in the handoff.
- One question per probe, and at most about 300 lines per probe. If a probe outgrows its bound or its
  question, stop and report to the lead.
- Probes use project-owned fixture pages and synthetic content only. No course login, no provider
  calls and no uploads. Logs stay on the device until the user exports them.
- Probes add no new dependencies. MSAL (OneNote) comes later through the lead.

## Probe sequence

| Probe | Question (matrix rows) | Route | Bound | Output |
| --- | --- | --- | --- | --- |
| P-1 DeviceProbe | Model, OS and Pencil capability signals (PEN-04/05/06/07) | C | ~120 lines SwiftUI/UIKit | `device.json`: machine ID, OS, first `.pencil` touch, hover `zOffset`, squeeze phases, `rollAngle`, preferred actions |
| P-2 InkOverlayProbe | Pencil ink over our WKWebView while fingers operate the page; NAV toggle; Scribble (PEN-01/02/03/08, G1-10 in WKWebView) | C (D for compile) | ~300 lines | `routing.jsonl`: every touch with type, phase and recognizer outcome, page `pointerdown` echoes, stroke continuity, and false ASK triggers over a scripted run |
| P-3 InkStoreProbe | Durable editable ink: atomic write at stroke end, force-quit and offline restore, separate AI layer (INK-01/02/04/05) | C | ~150 lines (may share P-2's canvas) | `persist.jsonl`: stroke-end → fsync latency, restored stroke count, `requiredContentVersion` |
| P-4 CaptureProbe | Go/no-go for ScreenCaptureKit: background survival, `.audio` course audio, `.microphone` separation, stop codes, black frames (G3-01…06, G3-12, LC-01/02/03/07/08) | A (Xcode 27, iPadOS 27) | ~300 lines | `capture.jsonl`: per-output sample counts and PTS, audio RMS, gaps over 2 s, `didStopWithError` codes, scene phases, `isAvailable` |
| P-5 BridgeProbe | Native end of `selection.submit` 0.1.0 (G1-03/04), with the web role's content script | A-paid | ~200 lines | Round-trip latency, `BridgeResponse`, every observed `userInfo` key, payload-size limits |
| P-6 ExportProbe | Share-sheet semantics and PDF form (G5-02/03); OneNote later | C for share, A + MSAL for OneNote | ~150 lines | `activityType`/`completed` log, the exported PDF |

Order rationale: P-1 to P-3 are free and can run on the user's real iPad now (route C), and they
answer A26/A27/A03. P-4 decides the whole G2/G3 architecture but needs route A. P-5 depends on the
bridge-origin decision below.

## Native bridge end (contract 0.1.0) — decision table

Transport:
- The extension background calls `browser.runtime.sendNativeMessage` with a `BridgeRequest`.
  Content scripts cannot call it (G1-03).
- The native app extension's `SafariWebExtensionHandler.beginRequest` answers once with a
  `BridgeResponse`. This handler is a separate process from the containing app.
- Apple documents two keys in its `userInfo`: `SFExtensionMessageKey` and, on 17+,
  `SFExtensionProfileKey`. No sender tab, URL or origin key is documented; the absence is inferred from
  documentation silence (RV-01). P-5 logs every key it actually observes.

Shared state lives in the App Group container:
- `active_session.json` stores a 0.1.0 `AuthorizationContext`: `user_id`, `session_id`, `device_id`,
  `scopes`, `expires_at`, `authorized_origin`. Optionally it also records the Safari profile UUID.
- `bridge_queue/` is an append-only queue of accepted requests. The main app drains it to the backend.

Validation order (first failure wins):

| # | Check | Response |
| --- | --- | --- |
| 0 | The message is not a dictionary, or has no `request_id` matching `Identifier` | No contract-valid `BridgeResponse` is possible, because `request_id` is required. Complete the request with no items and log locally. *(lead decision 4)* |
| 1 | App Group unreadable or handler misconfigured | `rejected` + `bridge_unavailable` *(pairing proposed; see below)* |
| 2 | Payload fails `packages.contracts.validate('BridgeRequest', …)`. This covers the full 0.1.0 schema: required fields, types, `Identifier` pattern, UTC `Z` timestamps, the `input_mode` enum and closed objects. It also covers the local invariants: bbox inside [0,1], polygon inside bbox, non-zero polygon area. | `rejected` + `invalid_payload` |
| 3 | No unexpired `AuthorizationContext` in the App Group, or its `scopes` lack `events:write` | `needs_auth` + `null` |
| 4 | Page origin does not equal `authorized_origin`. The origin must come from a trusted envelope, which 0.1.0 lacks (see below). | `rejected` + `origin_not_authorized` |
| 5 | `selection.user_id`, `session_id` or `device_id` differs from the context | `rejected` + `identity_mismatch` |
| 6 | `request_id` (scoped to user and device) or `selection.id` already queued. Identical canonical payload: `accepted` + `null`. Different payload: `rejected` + `invalid_payload`, because 0.1.0 has no conflict code *(lead decision 5)*. | as stated |
| 7 | `source_version` older than a version the app already knows for that `source_id` | `rejected` + `stale_source` |
| 8 | First-time durable append to `bridge_queue/` (atomic write and fsync) | `accepted` + `null` |

Rows 1 to 8 echo the validated `request_id`. The duplicate check (row 6) runs before the mutable
`stale_source` check (row 7). This way a retry of an already-queued request is not reported as a
failure.

`accepted` means only that the request was durably queued. It does not mean the note persisted, the
frame was uploaded or a provider was reached, as the contract README requires. The bridge never
returns tokens. Frames travel from the extension directly to the backend over HTTPS, not through
native messaging, because handler payload limits are undocumented (G1-03).

Decisions needed from the lead before P-5:
1. **Origin envelope.**
   - On iOS, no origin is documented in the handler input (see Transport).
   - Proposal: the background adds an envelope field such as `page_origin`, taken from
     `runtime.MessageSender`, and never passes content-script data through as origin.
   - Decide whether this is the top-level page (`sender.tab.url`) or the sending frame
     (`sender.origin` plus `frameId`). They differ for Kaltura player iframes.
   - `AuthorizationContext` allows one `authorized_origin`. bCourses plus player iframes need a list,
     or one context per origin.
   - Alternative: backend-only origin validation.
   - `BridgeRequest` is closed (`additionalProperties: false`), so this needs a contract version.
2. **Status/error pairing.** Confirm the proposed pairs above. In particular, decide whether
   `bridge_unavailable` pairs with `rejected` or with `unsupported`.
3. **Golden vectors.** Once 1 and 2 are settled, lead-owned fixtures (valid and invalid
   `BridgeRequest` plus the expected `BridgeResponse`) let the Python validator and the future Swift
   handler be tested against the same cases. Include the row-0 and duplicate-conflict cases.
4. **Unparseable requests.** Make `BridgeResponse.request_id` nullable for row 0, or confirm that
   completing with no items is acceptable.
5. **Duplicate conflict.** Add a conflict error code, the analogue of the event-batch 409, or confirm
   the `invalid_payload` mapping.

## Input-mode controller (NAV / ASK / WRITE)

- NAV (default): the ink layer does not take touches. No explanation requests.
- WRITE: Pencil strokes become user-original ink.
  - The ink is an immutable blob referenced by `NoteRevision.ink_blob_id`, with `kind=handwritten` and
    `authorship=user`.
  - Typed user text is a `NoteBlock` with `layer=user_original`. AI output appears only in
    `layer=ai_supplement` blocks.
  - Fingers keep page navigation where PEN-02 passes; otherwise PEN-03 applies.
  - WRITE never requests an explanation.
- ASK: a Pencil tap, stroke or lasso produces one `Selection` bound to a frozen `Frame`
  (`input_mode=pencil_ask`). Without a detected Pencil, an explicit icon enters `explicit_touch_ask`.
  The mode reverts to the previous one after the selection or on cancel.
- Squeeze and double tap are optional shortcuts that respect the user's preferred actions. Hover
  previews only.
- v1.1 addition, handled under P0-11: teaching state (exploration, hint, review) is a separate
  dimension. WRITE never implies a request for help.

## Session and capture lifecycle (native side)

| State | Entered by | Left by | Reported to server |
| --- | --- | --- | --- |
| `active_foreground` | Start (user) in foreground | scene background, End | heartbeat |
| `active_background` | scene enters background while capture/mic run | foreground, stop events, End | heartbeat continues if the process runs |
| `capture_stopped_user` | `SCStreamError.userStopped` | user restarts via picker, End | event with time; screen source unavailable |
| `capture_interrupted_system` | `systemStoppedStream`, `missingBackgroundMode`, lock-induced stop | user restart via picker, End | event with code; gap opened |
| `mic_paused` | audio interruption, Smart Folio mute, mic off in picker | user resume in foreground | event; mic source unavailable |
| `offline` | network loss while capturing | reconnect → drain queue | gap on the server until replay |
| `interrupted_unobserved` | server only: heartbeat timeout (force-quit, jetsam, suspension) | next launch reconciles from journal | server sets it, never `ended` |
| `ended` | explicit End (in-app button, closure confirmation, Live Activity deep link) | — | `POST …/end` then `BGContinuedProcessingTask` finalization |

Only the explicit End reaches `ended`. Every stop and gap is journaled locally with timestamps and
replayed idempotently. Restarting capture after any stop always goes back through the system picker.

## Stop conditions for this plan

Stop and report to the lead in any of these cases:
- A probe cannot be compiled on its route.
- DT-G3-01 fails with Apple's exact configuration. In that case, reassess the G2/G3 architecture
  around the ReplayKit fallback, audio-only sessions or screenshots.
- The bridge-origin question is unresolved when P-5 is due.
- Any probe needs a dependency, entitlement request, account or payment.
