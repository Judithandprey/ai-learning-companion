# MAC-LIVE-01 correction — independent presentation boundary review

2026-10-02. Read-only production-source review of the root-owned correction on
`3147291f449105c06255cfc0ea2056f1b2582437`; exact lead findings/probe read at
`c9177096c99c2562e4474bcbb2f4ffc8beb43c18`. PONYTAIL LITE applied: reuse the
existing gates, request provenance, writer and retained history. The initial
review below was read-only. This reviewer subsequently ran the bounded actual
controller replay described in `controller-replay.md`, with synthetic connector
and UI stand-ins. No Git, account, network or device action was taken. The
separately added eleven library tests remain unchanged; root owns their execution.

Requirements refreshed: main §7.1/§7.7, R52/R53/R58, A31–34, problem-solving
§3, AUDIO-14 and V-CacheProvenanceLatency, with source/English provenance.
This note evaluates the local correction, not complete teaching-policy or Mac
device acceptance.

## Source findings

The first-display correction has the appropriate boundary. Status callbacks are
refresh triggers rather than copied UI payloads. A command epoch is checked after
the current-status await; every nonnil answer goes through its shared permit
before `@Published` assignment. Stop/cancel/replacement/restart/capture-end close
the local presentation gate synchronously. Permit identity binds request/session/
capture/owner, and actor end/drop/replacement revoke unshown authority before
awaits. Final `.usedUp` answers use the underlying session's authority. First
visible time is retained separately, so later Stop/Close callbacks can preserve
the actual shown fact without granting a first presentation afterward.

Generation → capture → presentation locks are short, recursive and synchronous;
there is no await in their admitted display action. Source-state queue reads
occur before these display locks. The earlier end-session copy issue is corrected:
already-shown history is flushed before taking the `ending` session copy.

Three follow-up source points were sent promptly to root and were open in this
initial snapshot; they are source-derived counterexamples, not executed failures.
All three are corrected in the final-source review below:

1. **Session gate must also constrain supplied source gates.** A rapid Stop→Start
   creates a new open controller dispatch gate before actor Start completes. If
   actor Start runs before the pending actor Stop, `startSession` can return early
   because the old session still runs. Controller then enqueues with the new open
   gate. `take`, the post-render check and the writer predicate check that supplied
   gate; `send` falls back to `sessionDispatchGate` only when it is nil. Thus the
   new gate can bypass the old session's already-closed dispatch authority. Require
   the captured current session gate independently at admission/writer boundaries;
   successful new-Start binding must not be inferred merely from a Void return.

2. **Start must check the capture gate before and after its await.** A system stop
   closes it off MainActor before the capture-stop notification arrives. The
   current preflight and post-await fenced predicate check the dispatch gate but
   omit `captureGate`. Add the same closed-capture check at both existing fences,
   without changing wire fields or auto-restarting anything.

3. **Same-command refreshes need ordering.** Two `refreshStatus` awaits share the
   command epoch. An older `.asking` snapshot can resume after a newer `.answered`
   snapshot and replace its UI state. A monotonic refresh ticket rejecting
   superseded continuations preserves ordering without another controller layer.

The root's relevant follow-up controls should hold actor Stop behind a new Start,
supply a different open input gate while the session gate is closed, close capture
before Start/while Start awaits, and reverse same-epoch status continuations.
Existing delayed-UI, stopped receipt, replacement, capture-end, hidden/visible,
already-shown history and final-allowance checks remain necessary. No broad rerun
or Apple-framework/device result is claimed here.

## Reviewed working-copy fingerprints

| Source | SHA-256 |
| --- | --- |
| `LiveController.swift` | `5e6a3e93fceb722ce94946d8263384aa872e57196829188942c73e6f2f6a0ba8` |
| `LiveLink.swift` | `449a07b6680f42f93d514f9207639281da17460ea1a1e23b21b92b8121f80d49` |
| `LivePresentation.swift` | `945c0c57f8789d5b25aa05be95e879b84894e45978e5c0ffeccd243b726a3362` |
| `LiveGate.swift` | `94e937e6d7061fb53f7990be0a2451d18c791d2fd30a8d73affec52256edfaec` |

These fingerprints bind this review while root continues editing. Later corrected
bytes and checks require their own final delivery binding; this snapshot is not
unconditional source approval or compiled/native acceptance.

## Final-source review

The three initial findings are corrected in the final working copy:

- `dispatchAuthorityMatches` independently requires the actual session gate to
  remain open and rejects a supplied gate with a different identity. It is used
  at frame admission, after observation rendering, around explicit-request
  rendering and at `send`. Writer revocation additionally captures that actual
  gate and the capture gate, holding them through every nonblocking write step.
  A fresh input gate cannot replace the active session's closed authority.
- `startSession` rejects a closed capture before requesting Start and fences it
  again after awaiting the connector result. The fenced result is stopped and
  never assigned as the active session.
- `refreshStatus` rejects a continuation if either its command epoch or monotonic
  refresh ticket was superseded. Ticket behavior was source-reviewed; this replay
  does not force reverse ordering of the actor's status continuations.

`LiveAnswerPresentation` still checks source availability before taking generation,
capture and permit locks, performs the admitted UI action without awaiting, and
preserves a genuinely marked first-visible time. `endSession` and `dropCard` flush
that time before revocation/removal, so a delayed receipt stays historical. The
final used-up response remains allowed by the underlying running session.

No further concrete gap was found in this narrow review of presentation and its
session/source gate boundaries. Runtime results and limits are recorded separately
in `controller-replay.md`; they do not establish native UI or real-model behavior.

| Final source | SHA-256 |
| --- | --- |
| `LiveController.swift` | `4b6f619454aeac3201428d06f8c5bcebb6e302ea0940e8bc32a0be594f1b2021` |
| `LiveLink.swift` | `3adf120e20158e3e7e32379fca52803de45b3559e146c16b3153c2df438f868d` |
| `LivePresentation.swift` | `e64d2a0ecc444e52619eaef8c3c04b47f478d12f9a7101cca6405a679de4383c` |
| `LiveGate.swift` | `94e937e6d7061fb53f7990be0a2451d18c791d2fd30a8d73affec52256edfaec` |
| `AskChild.swift` | `860fe9d6a19fe7d7c5baf4235ce08a99453fd44cc4e8938ed1b1c94c6241c1bf` |

These final production hashes match the copied actual-controller replay snapshot.
The root's final delivery must bind them to its commit; this reviewer made no Git
change and ran no broad native or real-connector campaign.
