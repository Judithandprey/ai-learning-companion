# Hosted native share-lock interpretation — 36769242351

**Supports the existing Web owner's test-only FileStream.Lock read-denial correction.** No contradictory observation or blocker found. This does not pass uploader or product acceptance.

Actual run `36769242351`, commit `66e6be339eaad1f55691a069c76ed3ccf8ee1ac2`, exit 0: **one passing Node test module containing two diagnostic arms**, 4,470.2291 ms total. Runtime is Windows stock Node 24.21.0/libuv 1.52.1, Windows 10.0.26100. The saved report matches JSON extracted from raw TAP. Its embedded `source=4166529...` is the assigned legacy baseline; `source.txt` records the actual run commit. Root owns the separate full receipt/source checksum audit.

The initial target, both held native handles, six successful native opens and all six Node opens agree on **dev `742408122`, ino `1125899907132851`, size 35**. Node's `RUNNER~1` and the helper's `runneradmin` spellings therefore refer to the same observed file. All 15 retained identity records, including the initial target, agree. TAP's escaped path text is not a separate runtime path claim.

## Share-none matrix

Both helpers and the Node parent report SeBackupPrivilege and SeRestorePrivilege present and enabled, attributes 2, without query errors. No privilege state was changed.

| Access | Flags | Observed result while FileShare.None is held |
| --- | --- | --- |
| GENERIC_READ (`0x80000000`) | NORMAL (`0x80`) | Open denied, Win32 32 |
| GENERIC_READ (`0x80000000`) | NORMAL + BACKUP_SEMANTICS (`0x02000080`) | Same-file open succeeds; ReadFile returns 35 bytes |
| FILE_GENERIC_READ (`0x00120089`) | NORMAL (`0x80`) | Open denied, Win32 32 |
| FILE_GENERIC_READ (`0x00120089`) | NORMAL + BACKUP_SEMANTICS (`0x02000080`) | Same-file open succeeds; ReadFile returns 35 bytes |

The Node original-path, helper-path and delayed original-path opens also succeed. All six fd/path reads return the exact original bytes/hash before release. This establishes **flag-dependent behavior in this runner's native helper**, with enabled privileges observed alongside it. There is no privilege-off control or runtime trace of Node's CreateFile call, so it does not prove either privilege's necessity/sufficiency, establish the complete Node-side mechanism, or demonstrate a general Node regression. The source-backed flag hypothesis is supported by this controlled matrix; privilege causality remains qualified.

## Byte-range outcome and cleanup

All four native access/flag combinations open the same file, but every ReadFile fails with Win32 33 and zero bytes. Node successfully opens it at all three observations; **three opened-fd reads and three path reads fail with EBUSY, syscall `read`**, including the original path after 150 ms. This is meaningful actual read denial even under this runner's enabled privileges, without assuming open denial.

Both helpers remain live with stdin open through the delayed observation. The byte-range arm records parent release → exact sentinel input → unlock → disposed/closed file handle → exit 0 → close. The share-none arm records the equivalent disposal sequence without unlock. No force kill, stderr, spawn/pipe/output/cleanup error is reported. After each arm the recovered 35 bytes hash to `fd3c2810473c07410c9b73ad7efd550f66c3f4fef04d6ef1f5d61c18b14ccf4a`, matching the initial synthetic source. Owned-temp removal is confirmed by the report.

Web can now make the existing narrow test correction: shared-open nonempty full-file FileStream.Lock; independently verify identity/size and actual opened-fd read EBUSY before calling the uploader; retain the helper for that call; require **cannot be read**, `refused` at `local`, and zero sends; finally confirm owned-helper close and exact original-byte recovery. This replaces an invalid unreadability assumption with observed read denial. It must be labelled read-denial coverage, and the focused uploader acceptance still needs to run after the owner implements it.

Machine checks and evidence: `/tmp/windows-sharelock-native-hosted-review.json`; reusable read-only interpretation checks: `/tmp/windows-sharelock-native-hosted-interpret.py`. No workflow/probe rerun, research, production edit, native launch or provider operation occurred in this review.
