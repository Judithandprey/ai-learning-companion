# macOS original-screen ink review — held

Candidate `3aaff3a3abcae29636537732e654b670ae14e34b`, parent `12eae15`, actual delivery
`handoff_6666d73aed7ed922e7e3f40c6ff9c3d6`. Reviewed against main
`f73df5a6d3696fc5a13236d485fa716e6f3e85dc`; no native candidate is integrated.
This continues the existing Native P0-03/11 → P1-02/P2-03 card under
R08/R46/R51/R52/R59, A26/A27/A30/A31/A44 and full original/English §7.1/7.2/7.4.

## Required same-owner corrections

1. **P1, normal Quit with persistently failed saves loses originals.** Close input
   and capture immediately, but do not terminate with only in-memory originals.
   Retain the process until save/export succeeds or explicit discard is chosen.
   Keep unsaved status visible independently of mode/start hints. Cover Quit during
   capture and after Stop. [Actual source path](app.md#n1--p1-quit-discards-originals-when-the-final-save-retries-still-fail).
2. **P2, delayed ASK Finish uses a newer frame.** Pin source/frame/session directory,
   contemporaneous geometry/evidence and ink revision when selection is established;
   never retarget the same selection when later callbacks arrive. A→B before Finish
   must retain A or honestly refuse unavailable evidence. [Review](app.md#n2--p2-ask-binds-the-selected-rectangle-to-a-later-frame-at-finish).
3. **P2, visible mid-segment erasure does nothing with sparse points.** The rendered
   segment (0,10)→(100,10) crosses the eraser (50,0)→(50,20), while neither stored
   endpoint is within radius 8. Cut the rendered chosen portion, preserve the exact
   original and derived provenance, undo/redo and unaffected portions. This is not
   an accepted user limitation. [Domain evidence](domain.md).
4. **P2, newer conflict originals cannot be reopened.** Discover valid preserved
   conflict copies and open the actual selected path, preserving both versions.
   The sole current reopen path instead loads the older fixed ink.json. Cover a
   changed original and a corrupted original with a valid newer recovery copy.
5. **P2, changed display geometry combines new points with startup dimensions.**
   `displayChanged` refits the overlay while `finishAsk` still uses startup
   `status.display`. A 1280×800→800×1280 change therefore uses old denominators.
   Invalidate/refuse the unverified mapping after a known change until a stable
   transform is re-established; do not crop the wrong pixels as the user's chosen
   region. Preserve all original ink, frame and uncertainty. Cover a change during
   selection and before Finish; pinning and geometry validity are separate.

## Capture scope and released-contract boundary

Lead inspected RetainedOriginal/SelectionCropper and its callers. Cropping rehashes
retained PNG bytes and clamps the supplied rectangle; this does not fix the caller's
later-frame or stale-transform errors. Existing crop test covers a horizontal crop
only; add an asymmetric vertical offset control when correcting pinned selection.

New panels request `sharingType = .none`, while the old recorded scope guarantees
this app's visible windows are captured. Current Apple documentation describes
[NSWindow.SharingType.none](https://developer.apple.com/documentation/appkit/nswindow/sharingtype-swift.enum/none)
as legacy and explicitly discourages relying on it to omit captured content.
The actual [ScreenCaptureKit filter](https://developer.apple.com/documentation/screencapturekit/sccontentfilter/init(display:excludingwindows:))
uses an empty excluded-window list. Neither fact verifies the delivered pixels or
whether ink/palette is included on an actual Mac. Lead read official Apple DocC
metadata/discussion on 2026-09-30; no private API or capture bypass is proposed.

Same-owner local correction: stop treating .none as exclusion proof, record the
actual configured filter and unknown overlay inclusion accurately, and preserve
original raw pixels. Do not manufacture composed PNGs by drawing ink onto a frame
that may already contain it. Keep composition explicitly unavailable until the
capture exclusion/composition path is verified. Do not silently widen released
0.2.7 scope values or relabel a new source as the old promise. Where the accurate
new local scope cannot be represented, mapper refusal must be explicit and local
originals retained; Lead owns the next additive shared mapping, not Native. Old
retained records and existing synthetic fixture compatibility stay unchanged.

## Executed evidence and next owner

[Domain](domain.md) and [app](app.md) are separate bounded source reviews. The
portable [witness](domain-witness.py) confirms two source/arithmetic traces; it is
not Swift execution. Run against the exact exported candidate:

```sh
python3 docs/verification/lead/macos-ink-review/domain-witness.py \
  /tmp/lc-macos-ink-3aaff3a/apps/macos/CompanionDesktop
```

[Proposed XCTest regressions](proposed-regressions.swift) are **uncompiled/not run**,
not accepted tests. The candidate's 33 declared XCTests are also **not run**.
Package/plist/diff checks and source/API inspection do not establish compilation.
The native owner corrects these concrete paths in the existing files/tests, then
Lead reviews the exact commit and uses the existing hosted macOS workflow. No
interactive Mac, physical pen, complete content anchoring, provider receipt, audio
or Notability acceptance is claimed. Both full desktop gates remain open.
