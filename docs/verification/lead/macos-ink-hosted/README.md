# macOS ink: executed build and library checks

Exact pushed source **a33932a35a32aed985facfd5de334e1b24512cf0** passed
[macOS-only run 36725613633](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36725613633),
2026-09-30 13:58:53–14:00:45 UTC. The native tree equals the reviewed owner
correction **d258856abbf621613fa3ed8a049cb34101924112**. This closes the earlier
[source-only compilation dependency](../macos-ink-review/correction-integration.md).

- Release app compiled, linked and packaged on macOS 26.6.2 / Xcode 26.6 /
  Swift 6.3.3, arm64. The development package is the named artifact on the run;
  it is not installed, project-signed or notarized by this verification.
- **37 distinct XCTest cases passed**, including 10 ink cases. These execute
  the DesktopCapture library; the app controller, Quit alerts, permissions and
  actual mouse/pen routing are compiled but have not been interactively tested.
- **82 checks passed** over actual Swift-emitted synthetic fixture bytes,
  including 25 refusal cases. The new `ink_overlay_scope` refusal actually ran:
  old 0.2.7 cannot describe unknown panel inclusion. Accepted synthetic fixture
  mapping does not mean the current live ink session can be uploaded.
- [Independent artifact audit](artifact-audit.md): 29/29 checksums and all 1,749
  archived Git blobs/modes match; all 27 Mac source files are present; the complete
  arm64 executable bundle passes static source/package inspection. The two fixture
  sets retain their original PNG hashes, dimensions, nulls, gaps and UInt64 ticks.
  No actual ScreenCaptureKit learning screen was captured by these fixtures.

[Raw receipt](hosted-receipt.json), original test/build logs (stored as `.txt`) and machine audit are
retained here. SHA256SUMS describes the **complete downloaded artifact**, not just
this selected committed subset. Large binaries/source tar remain in the hosted
artifact and `/tmp/lc-macos-36725613633`; no user data or tokens are included.
The audit is reproducible from that downloaded directory; it did not launch the
app, rerun an earlier native campaign or touch any database/service.

## Next owned action

One substantive Native P0-03/11 continuation at exact a33932a was accepted as
**handoff_789c03610e5fcd107595ec71aa51637b**: retain separate actual raw/composed
PNG originals with the pinned editable-ink revision, use an explicit documented
filter rather than relying on `sharingType.none`, and preserve gaps, geometry,
Stop and storage failures. Actual start **handoff_00668e0fc5b3411c90daa7cf5e6a51a3** confirms normal merge
**3355763**; Lead independently checked that its Mac tree equals a33932a.
An actual start is not completion. Native owns apps/macos, Lead
owns review and the eventual explicit compatible contract for the concrete
producer facts. Existing 0.2.7/0.2.8 stay closed to unrepresentable scope.

Interactive Mac access is still unconfirmed. Actual capture/permission/Spaces,
physical pen, content anchoring, provider receipt, audio and Notability import
remain open. Neither §7.1 gate nor the complete product is accepted by this build.
Windows alignment QA and Backend HTTP ingress continue under their existing owners.
