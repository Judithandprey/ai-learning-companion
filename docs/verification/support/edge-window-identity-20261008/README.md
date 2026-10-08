# Edge window identity incident — 2026-10-08

**Source defect confirmed: the candidate's Edge HWND is selected by the first
visible process-family match, without binding it to the generated page.** The
saved attempt cannot establish whether the rejected HWND was a transient popup,
the main window during startup, or another owned window. Keep that distinction;
the existing topmost guard correctly rejected the selected window.

Lead card `handoff_7ec6453247f0b0c65ed89342abbf34be`, evidence update
`handoff_fe99b5f26871465f2094733ab6c7bdec`. Source baseline
`6d256bcd22bfa09f5f551e8f99ba2d9612586ef5`; finalized QA evidence
`89a077d99985b3e8a073afee5e58da9fd94ce862`. Both initially read worktree evidence
files match that final commit byte for byte. [Saved extracts and hashes](saved-evidence.json)
preserve their provenance. Support changed only this documentation directory.

## Observed failure and source path

The saved runner records step `i=1` (`edgeStart`) passing, then `i=2` (`window edge
raise`) failing; these are the card's zero-based steps 0 and 1. The rejected HWND
`17504798`, owned by the launched Edge PID `14104`, was visible, not minimized,
not foreground, class `Chrome_WidgetWin_1`, **topmost**, bounds
`[670,88,1888,202]`: 1218 × 114 physical pixels. Display admission still matched
2560 × 1600 at 192 DPI. Product launch, capture and later steps were not reached.
Saved cleanup confirms only the owned Edge was asked to close, with no force;
the foreign Electron/Edge clients were not signalled. Lead reports display release
`handoff_de51af8fcae9104bf6e9f40332df7787`; this consumed attempt is not reusable.

At the exact source baseline:

- `qa-electron-runner.ps1:130–140`, `QaWin.Find`, stops enumeration at the first
  visible HWND whose PID belongs to the supplied set when `title == null`.
  No target, class, geometry, normal-band or uniqueness condition participates.
- `Window-Handle:303–309` passes the launched Edge PID plus immediate child PIDs
  and a null title. Same process ownership therefore stands in for page identity.
  The method and its caller are identical in the pinned emitted runner
  `6728ec6c…`; this is the actual candidate path, not an unused generic helper.
- `Get-Socket:271–295` separately selects the first CDP `type=page` for Edge;
  `Target-Url` supplies no expected Edge URL. A cached target is revalidated only
  by ID presence. Step `edgeStart:396` waits for that page's ready state, not an
  exact URL or the generated-surface marker. Thus successful startup does not
  prove that the later HWND and the generated page are the same target.
- `qa_edge_placement.ps1:101–105` calls `Assert-QaNormalEdge` **before**
  `[QaWin]::Raise`. Its topmost check at line 78 threw; this Raise did not create
  the observed topmost state. Repeating `Window-Handle` inside the guard merely
  repeats the same ambiguous search.
- `qa_visible_candidate.mjs` retains this resolver while routing Edge raises
  through the stricter guard. Fullscreen placement, generated truth and all 16
  root-point checks come later, so they cannot establish identity before step 2.

The small topmost geometry is consistent with transient browser chrome. No title,
pixels, alternative HWND list, CDP target ID/URL or browser bounds were saved at
the failure. A specific popup type or the existence of a normal fullscreen HWND
at that instant is **not proved**. Nor does the evidence establish that the actual
generated target was safely non-topmost. A read-only independent source reviewer
reached the same distinction.

## Offline regression evidence

[replay-find.mjs](replay-find.mjs) extracts the pinned C# `Find` body and adapts
only its language scaffolding and API return shapes into a JS sandbox. The
original selection conditions and early callback return are retained. Enumeration,
ownership, visibility and titles are injected literal data; no Win32 calls occur.
This is a source-bound synthetic replay, **not compiled C# or live enumeration**.

[Six fixture results](replay-results.json), actual exit 0, confirm the old selection
behavior. Three violate the intended unique-target boundary:

| Fixture | Actual selection | Implication |
| --- | --- | --- |
| Recorded narrow-window metadata precedes a synthetic intended surface | Narrow HWND | A same-PID chrome window can win before the intended target |
| Identical pair, reversed | Intended surface | Enumeration order changes identity |
| Two normal same-PID windows with equal bounds, either order | First one | Filtering topmost or choosing largest does not resolve ambiguity |

The single-surface and foreign/hidden-window controls behave as expected. Added
alternative HWNDs are explicitly synthetic; the replay does not assert they existed
in the failed attempt. It is evidence of the resolver defect, not a passing repair.
Run used Node v24.21.0 with read grants only, no child-process or write grant:

```sh
node --permission --allow-fs-read="$PWD/docs/verification/support/edge-window-identity-20261008" \
  --allow-fs-read="$SOURCE_EXPORT" \
  docs/verification/support/edge-window-identity-20261008/replay-find.mjs \
  "$SOURCE_EXPORT/qa-electron-runner.ps1"
```

`SOURCE_EXPORT` contains that file from baseline `6d256bc`. Its hash is asserted
before extraction. The actual export was `/tmp/support-edge-window-3902bzi5`.

## Smallest author correction and acceptance constraints

QA should replace **this candidate's Edge resolution path**, preserving generic
callers, product code and the existing guards:

1. Establish the unique CDP page for the exact generated `surfaceUrl` in this
   isolated launch, verify its generated-surface marker, and retain/revalidate
   target identity and URL before acting. An unrelated first page or a cached ID
   whose page navigated must not pass.
2. Bind that target to a **unique owned HWND**, using target-specific evidence plus
   consistent native geometry/DPI and process lifetime. Geometry, class, PID,
   title or largest-area selection alone is not sufficient. The current source
   establishes no equivalence between a CDP `windowId` and a native HWND.
3. Reject zero, multiple, unreadable or stale matches before any mutation. If
   startup settling is handled, bound metadata-only waiting within the one
   attempt and then fail closed. Do not demote/resize/raise an unidentified window
   or silently substitute another window because the true target is topmost.
4. After identity is established, retain normal-band, foreground, display/DPI,
   placement and all 16 exact-root checks. Revalidate before/after actions.
   Cleanup stays on its existing exact process-identity path.

Meaningful repair regressions should inject: both window orders; owned transient
chrome first; a non-topmost same-size decoy; unrelated CDP page first; zero/multiple
targets or HWND matches; foreign PID with matching geometry; changed/reused
identity or target navigation; unavailable DPI/metadata; and an identified actual
target that is topmost and must still refuse **without mutation**. Assert actions
stay empty on every unresolved case, rather than only checking generated strings.
QA's finalized README mentions largest-window selection as an example; that alone
would not satisfy the ambiguity cases above, consistent with Lead's constraint.

QA owns the bounded harness correction, tests, regenerated candidate and pins;
Lead integrates and supplies its exact delta for review. This diagnosis performed
**zero** Windows/native/process/port/window queries, GUI/browser launches,
screenshots, signals or device/account/provider operations. No production files
were modified and no new display attempt or product acceptance is claimed.
