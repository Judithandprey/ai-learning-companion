# Windows capture coordinator review — HOLD

Candidate: `d6ef68a03bc3e18569d1b4a85dc20f09b7717dff`; owner baseline `5dc8493`; application source read from `/tmp/lc-windows-parent-d6ef68a`. Canonical requirements and released contracts came from current root `10542360d272cc49e470fb5501a77af0b8dea8fb`, not the candidate's older shared tree. No repository or worker files were changed.

**Two reproduced persistence blockers require correction before integration.** These are bounded coordinator findings; host transport and app quit findings belong to the other assigned reviewers.

## W-PARENT-C1 — damaged JSON is accepted, then loses recovery accounting or crashes status

`apps/windows/src/main/capture-link.ts:220–223, 254–257` validates only the outer stream shape, array presence and actor `user_id`. Required recovery state and array elements are unchecked. `status()` dereferences jobs at lines 313/315; outstanding-stream accounting and restart reconciliation use exact `final === null` at lines 314, 434 and 865.

Reproduction against unchanged source:

1. Seed a structurally complete live registration, then replace its jobs with `[null]`. The constructor accepts it. `status()` throws `TypeError: Cannot read properties of null (reading 'stuck')` rather than disabling the link with the file untouched.
2. From the same valid live record, delete only its `final` member. The constructor accepts it and reports `earlier_unknown: 0`; `reconcile()` performs no recovery attempt. Public `begin()` then persists a second stream into that same damaged file. A deliberately invalid test DSN stops the probe before any child, pipe or network operation. Therefore this proves skipped recovery and overwrite, not actual issuance of a new backend grant.

The unchanged valid-state control reports `earlier_unknown: 1`. The defect contradicts the candidate's explicit unreadable-record fail-closed boundary: corruption of a consumed recovery field must not silently become a settled/nonexistent predecessor, and status must not dereference unchecked entries.

Scoped owner correction: validate the persisted actor/stream/job/Stop fields that recovery and status actually consume, including required identities, enum/null states, numeric bounds and corresponding witness shapes/bindings. Reject invalid records through the existing broken-record path, leave their bytes intact, and request no host/grant. Preserve compatible optional fields intentionally supported by valid v1 records; do not default missing authoritative state to a guessed outcome. Add focused null-entry and missing-final tests alongside a valid-record recovery control.

## W-PARENT-C2 — short write replaces the prior record and permits an unwitnessed Stop

`apps/windows/src/main/capture-link.ts:264–278` ignores `writeSync`'s returned byte count at line 272, then fsyncs/renames the temporary file and returns success. The actual Stop path at lines 823–830 trusts that success before dispatch.

The bounded injected filesystem failure writes and returns **23 of 1,113 requested bytes**. The actual `sendStop → save → call` path then sends its POST while the on-disk coordination file contains invalid JSON and no recoverable key/body witness. `fault` remains `null`; subsequent saves also replace the file with truncated data. The matching full-write control sends only after its exact Stop key/body is readable on disk. This is actual unchanged TypeScript executing on Node with a short-write injection and in-process response fake, not a real disk-full or backend test.

This affects the shared registration/job/Stop persistence boundary: the preceding valid file can be destroyed and a remotely committed operation can lose its retry witness. Scoped correction: write the complete UTF-8 byte buffer, handle incomplete/zero-progress writes, and rename only after the whole record is successfully written and flushed. Failure must preserve the preceding coordination file and use the existing persistence-fault/no-unwritten-dispatch behavior. A standard-library full-write operation or small bounded write loop is sufficient; no new storage framework is needed.

## Scope and checks

Read complete `capture-link.ts` and `capture-plan.ts`, relevant existing mapper/uploader binding and original-read paths, owner report and focused coordinator/rules tests. Applied project PONYTAIL LITE and refreshed current decisions, source/English R35/R36/R46/R51/R52/R59, lifecycle/ink acceptance and §7.1/§7.2, and released process-control obligations. Existing capture/original/window-frame versions remain unchanged.

The intended flow otherwise preserves deterministic source-scoped line/record/batch identity, immutable PNG and ink bindings, explicit coverage, exact live retry bodies and keys, unknown outcomes after later refusal, read/control-only restart recovery, fresh consent only from explicit Start, and conservative null Stop boundaries. It does not delete retained originals or claim AI delivery. These source observations do not override the two reproduced durable-state violations, or certify every race.

Executed **five bounded cases** on pinned Node `v24.21.0`: two positive controls and three expected-bug reproductions grouped into the two blockers above. All probe assertions completed. No owner suite, DB, listener, host child, GUI, provider, Windows native runtime or actual filesystem exhaustion was run. Root's separately reported 83 focused passes/build and the owner's broader evidence are not independent observations by this reviewer. R59/A44 and both desktop §7.1 gates remain unverified by this review.

Reproduce:

```sh
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node /tmp/windows-parent-coordination-review-probes.mjs
```

The probe imports the immutable `/tmp/lc-windows-parent-d6ef68a` source, uses isolated `/tmp` state, and retains its generated fixtures. Its Stop probe invokes the production method through a runtime test seam; the transport only returns an in-process response. The corruption probe exercises public constructor/status/reconcile/begin. Existing production source is neither patched nor copied into a simulated implementation.

Evidence: `/tmp/windows-parent-coordination-review-probes.mjs`, `/tmp/windows-parent-coordination-review-probes.json`, `/tmp/windows-parent-coordination-review.json`. Candidate `capture-link.ts` SHA-256: `5095cb30d015f3027d116174e01cee03b811711f4124ec2badd87f6fb5808e50`.
