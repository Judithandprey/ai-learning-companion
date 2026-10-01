# MAC-SUB-LIB-01 retirement correction review — APPROVE

Exact candidate: `c9e8e0bcca67970adef9dd5bc21ecc0f1d0ee4a1`, one leaf on `704894f7e6e0a95c90f6a74bba68fb4394b45f9e`. Review is limited to the changed AskLink retirement ownership and its regression cases. Previous failing evidence remains intact at `/tmp/mac-ask-704894f-review`. No production, owner worktree, Git or CI files were changed by this reviewer; parent main's three dirty CI/check files were preserved.

Applied the already-read project PONYTAIL LITE/workflow and same task requirements. Read actual correction diff and affected call flow; independent secondary source review found no additional blocker. Agreement was not treated as proof: the two previous reviewer reproductions were rerun unchanged on exact candidate bytes.

## Source conclusion

No new blocker found. The prior premature-Quit cleanup gap is corrected by the following ownership boundaries in `apps/macos/CompanionDesktop/Sources/DesktopCapture/AskLink.swift`:

- `retire`, lines 307–310, appends each retiring child before its first actual suspension and releases only that child's identity after `end` returns. Both lost-child handling (916) and explicit replacement (296) use this path.
- `retired`, lines 314–318, rechecks the live retiring collection after each awaited end. Concurrent joiners cannot remove a different child's ownership.
- `connect`, lines 283–302, joins retirement before calling the only launcher. `ensureChild`, lines 321–347, rechecks `closed` and the active child before launch without an internal await, preventing a duplicate launch or restart after Quit begins.
- `shutdown`, lines 700–726, closes new launch/Submit admission first, ends the current child, and joins retiring children before returning.
- `received`, line 820, retains the launch serial fence; delayed callbacks from the old child cannot disconnect its replacement. A delayed retirement continuation removes only the old object and does not clear the newer active child.

`AskChild.swift` and `AskWire.swift` are byte-unchanged versus `704894f`; the prior verified newline/revocation and queued/partial-line transport invariants are not reimplemented by this leaf. No retry, automatic replacement, provider or native UI action was added. `git diff c9e8e0b^ c9e8e0b --check` passes.

## Verification

The prior reviewer tests `ZQuitReview.swift` and `ZRealQuitReview.swift` and reused `AppleShim.swift` were copied byte-for-byte (hashes in `source-provenance.json`). Only exact candidate production/test source and the four-entry harness main differ.

- Unchanged in-process Quit regression: PASS; shutdown now waits 1.500316 seconds and observes completed child ends=1. Previous candidate returned in 0.000051856 seconds with ends=0.
- Unchanged real-process Quit regression: PASS; production ProcessAskLauncher/AskLink returns after 2.155406 seconds with the exact owned PID already gone. The synthetic child received exactly 65,536 bytes without a newline, so withdrawal still prevents an actionable request. Previous candidate returned in 0.000049710 seconds while that PID remained alive.
- New owner in-process loss/Connect/quit overlap test: PASS (7.429 seconds). It covers loss then Quit, partial cancellation then Quit, loss then Connect, simultaneous Connects, and Quit while Connect waits. No overlapping launches or restart after Quit were observed.

- New owner real-process lingering-child Quit and reconnect regression: PASS (11.534 seconds); the old PID is gone before the new connector appears, and the replacement PID is gone after shutdown.

**Actual suite result: 4 tests, 0 failures, 23.648 seconds; process exit 0.** The remaining Quit blocker is closed for the demonstrated source/Linux scope. Approve this leaf for normal integration and the parent-owned exact-source hosted macOS build; no device acceptance is inferred.

## Reproduce and limits

```sh
bash /tmp/mac-ask-c9e8e0b-review/harness/run.sh
```

The temporary export contains exact candidate production/tests, existing Linux import substitutions (Apple/Darwin imports replaced by FoundationNetworking/Glibc; Linux-inapplicable waitsForConnectivity assignment commented), and the same cached Apple shim/toolchain as the preceding review. `source-provenance.json` records unmodified candidate file hashes and unchanged reviewer probe/shim hashes. Raw output is `focused-tests.txt`.

Execution received normal exact-command approval because Foundation Process requires a local socketpair blocked in the workspace sandbox. Only synthetic, bounded, test-owned local processes were started. Both reviewer probes join their owned child before returning; real-process assertions check the exact PID is gone. No pkill, account, Codex, provider, GUI, real device or remote call. No full previous suite or mutation campaign was repeated. The inherited non-Sendable test-closure warning remains visible in the log.

This is Linux source/control/process evidence, not macOS compilation or acceptance. Actual Mac App/XCTest build, real ImageIO PNG validator, login/inference, original-screen interaction, device/audio/ink and full product acceptance remain separate. Parent owns integration and the exact-source hosted macOS run.
