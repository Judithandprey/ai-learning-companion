# macOS retained-frame mapper source review

**HOLD for two bounded corrections in the new mapper.** This is source review, not a Swift compilation, test execution or real Mac result.

Candidate `df581e8a1d49725c966fdacd0d8e45bcbb9aeb4d`, parent `ebae7af24296fdb9066d66cd789a8cf7e7372682`. All nine changed files in `/tmp/macos-native-df581-export` match their Git blob bytes. Released `macos_frame` contracts are unchanged from `c2ac1c7`. Current workflow/decisions/requirements have no diff between previously read `dc3a7d8` and review main `f9b2eca`; existing PONYTAIL LITE, R03/R08/R35/R36/R46/R51/R52/R59 and A12/A14/A26/A30/A31/A44 evidence boundaries apply.

Reviewed the complete new `MacRetainedFrames.swift`, shared reader changes and affected recorder/composition/JSON/retained-file call paths. Checker and test coverage are separately assigned; their execution is not claimed here.

## P2: The new PNG check does not require PNG bytes

`apps/macos/CompanionDesktop/Sources/DesktopCapture/MacRetainedFrames.swift:481–492` calls the generic `CGImageSourceCreateWithData` and reads width/height. It does not inspect PNG signature or detected image type. Both raw (`:191–197`) and nonempty composed (`:338–345`) files pass through this helper before a descriptor labels them `image/png` with the PNG encoding statement.

`RetainedOriginal.read` does verify exact native path, regular-file/symlink policy, recorded length and SHA-256. Those checks cannot establish format when the file and its recorded hash/length are mutually consistent. A JPEG placed at the expected `.png` path, with its SHA/length and dimensions supplied in the retained record and binding, reaches generic ImageIO properties with no format refusal. Its descriptor can therefore claim PNG despite the bytes being a different image type. This is a retained-input validation flaw, **not evidence that the normal recorder writes JPEG or that an external caller can exploit the app**.

Minimal correction: require the PNG signature and/or ImageIO's detected PNG type before accepting dimensions; retain the current standard ImageIO implementation rather than adding a decoder. Add one native regression rejecting a valid same-sized JPEG renamed `.png`, preferably through the mapper as well as the helper.

`/tmp/macos-native-df581-regression-sketch.swift` contains a focused XCTest sketch that creates a JPEG using ImageIO and expects `checkSize` to refuse it. **The sketch was not compiled or executed.** The missing format guard is established from the exact source; actual ImageIO execution remains for the hosted native test.

## P2: Competing recorded endings disappear from the mapping

`DesktopIngress.swift:278–279` reads an `ended` event into `session.endedEvent`. In `MacRetainedFrames.swift:522–532`, a non-null `status.ending` always wins; the event details are emitted only when status has no ending. The only disagreement check tests whether the event is absent. If both exist but have different reason, detail or live-ended host, the event's competing facts are omitted with no disagreement note.

This contradicts the delivery report's explicit “with any disagreement flagged” behavior and the mapper's unrepresented-evidence purpose. The original files remain intact, so this is **loss from the returned evidence/report, not destruction of native originals**.

Reproduction for the existing synthetic native fixture: finish a session normally; change only the well-formed `events.jsonl` ending's `reason`, `detail` and `live_ended_host`; retain the status ending, all PNGs and bindings. `RetainedSession.read` accepts and records the changed dictionary, but mapping follows the status branch and returns none of the competing event values or an inconsistency note. The exact branch is unconditional; no Swift execution is claimed.

Normal `CaptureRecorder.finish` (`CaptureRecorder.swift:144–166`) derives the status ending and event details from the same arguments and writes event then status. No normal Stop race producing conflicting reasons was demonstrated. The finding concerns inconsistent retained records, which this mapper otherwise explicitly reports/refuses. Minimal correction: retain both recorded endings in unrepresented evidence (and flag differences in shared fields), or explicitly refuse inconsistent records; do not invent which record is true. Add one paired-ending regression. No lifecycle redesign is needed.

## Positive scope and next verification

- Caller-supplied archive identities remain separate from native session identity. Duplicate plan IDs/sequences and conflicting artifact identities are rejected; complete source/incarnation and PNG facts are preserved.
- Raw aliases, two-reference aliases, composed files, no outcome (`unknown`) and explicit refusal remain distinct. Conflicting outcomes refuse the affected descriptor; stray/ignored outcomes and omitted frames are reported. Neither current ink documents nor missing outcomes fabricate an immutable ink original.
- UInt64 ticks remain decimal text, wall text is retained separately, source-time/callback pairing and tolerance mirror 0.2.11. UTC capture time, playhead, orientation and latency stay null. Ordered strokes, mappings, conditional limits and reopened-revision uncertainty remain explicit.
- Changed `CaptureRecorder`/`InkComposition` lines extract the same pinned limitation/mapping strings into shared constants; no normal capture/Stop behavior change was found there. The older 0.2.7/0.2.8 mapper retains its scope refusal, with the documented stricter shared read of malformed composition events.
- No additional concrete compile trap was found by inspection. Package remains macOS 15, Swift tools 6 / language mode 5, using existing Foundation/ImageIO/CoreGraphics APIs. This is not build evidence.

Next action: Native supplies the two local guards/evidence corrections; lead reviews that delta and runs the existing exact-source hosted build, 44 declared XCTests and Swift-emitted fixture checker. No native/device/provider/transport acceptance, Python-port-as-Swift proof, or multi-model-agreement proof is claimed. No repository/worker changes, native execution, service, network or provider operation occurred in this review.

Machine evidence: `/tmp/macos-native-df581-review.json`.
