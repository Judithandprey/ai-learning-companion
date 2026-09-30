# SUP-01 continuation: native identity and real read denial

2026-09-30. Lead card `handoff_2782ba3cdc5039d8c4af06b9cee3b689`.
Exact assigned baseline: `4166529b88e9be402ad98241d609eadccd4247bd`.
Support owns only the probe and evidence; Lead owns hosted execution/integration,
and Web owns the uploader test correction.

The hosted sharing discrepancy remains unresolved. The next probe distinguishes
file identity, native open flags and observed privileges, and supplies a locally
verified byte-range lock as a candidate real unreadable precondition. No uploader
or root/workflow file was changed. The previous `holdUnshared` diagnostic proposal
is superseded; do not apply it.

## What changed in the evidence

[Hosted run 36766951888, job 110063404955](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36766951888/job/110063404955)
executed the previous three-arm probe at the assigned baseline. Stock Node
24.21.0 / libuv 1.52.1 opened and read the expected 35 bytes in every arm, both
immediately and 150 ms later, before release. Both traced PowerShell helpers
reported an open held handle and a failed .NET second open
(`-2147024864`, sharing violation). Input returned only after parent release,
followed by disposal and exit 0. There was no acquisition, stderr or early-input
failure in these observations. This rules out those lifetime explanations for
this reproduced failure; it does not establish a Node regression.

Node's `RUNNER~1` path and the helper's `runneradmin` path were not tied by a native
held-handle file ID in that receipt. The prior LF probe hash
`d7f8a61b9396be0276c07e41edbbc23c2ca7df43a3dd9a4c1656ea46e4069893`
matches the executed CRLF version
`f6ba08292aa0151fed2079df3efd2368ea0644f9609ee381addf00b554d08613`
after the documented Windows checkout conversion. The literal legacy command
hash was unchanged.

The Lead-provided artifacts were read at `/tmp/sharelock-36766951888`.
Their adjacent `-run.json`, `-artifacts.json`, `-audit.json`, and `-report.json`
have SHA-256 values, respectively:

```text
63de8d1cf5c0d5784605fd229df2f50d811d8603aaafc3904fb02c7dbd4656ba
0bda377f901ba0af0cddbfd33a7766c5ee7b2e2f615d38f15065906bb3779aa7
faa4a58e28b8a5035e869897dfa659b3cbf1d0e4b1d824502ce4eb698a29234b
d2750c0f49da49a34856b16c17e79e39c67d2367ae0c37a9c39b8af1a2536f69
```

## Source check and smallest discriminating probe

Sources checked 2026-09-30: Node's
[`'r'` flag conversion](https://github.com/nodejs/node/blob/v24.21.0/lib/internal/fs/utils.js)
selects `O_RDONLY`. In the pinned
[libuv Windows implementation](https://github.com/libuv/libuv/blob/v1.52.1/src/win/fs.c),
that selects `FILE_GENERIC_READ` (0x00120089), share mask 7 and `OPEN_EXISTING`.
The normal flags include `FILE_FLAG_BACKUP_SEMANTICS`; ordinary reads use
`ReadFile`. These are source facts, not a trace of the hosted Node call.
Microsoft describes the flag's privilege-dependent override of security checks
in [CreateFileW](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew).
That statement alone does not prove a sharing-check bypass or its cause here.

The updated [executable probe](../../../tests/probes/support/windows_share_lock.mjs)
has two sequential arms:

1. **identity-share-none:** retain a .NET `FileShare.None` handle; query its
   existing native handle for volume serial/file index and final path; compare
   IDs with the original Node stat and every successful Node open. In the helper,
   test `GENERIC_READ` versus `FILE_GENERIC_READ`, each with normal flags alone
   and normal plus backup semantics. Attempt real `ReadFile` after each native
   open. Node opens and reads both its original path and the helper's reported
   `FileStream.Name`, with one delayed original-path observation.
2. **byte-range:** open with `FileShare.ReadWrite | FileShare.Delete`, then
   `FileStream.Lock(0, Length)` before readiness. Run the same observations, now
   requiring successful Node opens of the same file and actual `EBUSY` reads
   through the opened descriptors and paths. Release requires the exact sentinel,
   explicit unlock, disposal, normal exit, and recovery of the original hash.

[GetFileInformationByHandle](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-getfileinformationbyhandle)
provides the identity fields; comparisons retain 64-bit values as decimal strings.
Read-only `TOKEN_QUERY` / [GetTokenInformation](https://learn.microsoft.com/en-us/windows/win32/api/securitybaseapi/nf-securitybaseapi-gettokeninformation)
records only SeBackupPrivilege/SeRestorePrivilege presence and enabled state for
the owned helper and its Node parent. Query failures remain explicit unknowns.
No privilege adjustment, impersonation or ACL change is performed. The matrix
runs in the helper process: even a flag-dependent result requires interpretation
alongside the parent/helper observations, not an automatic privilege-cause claim.

The [FileStream.Lock API](https://learn.microsoft.com/en-us/dotnet/api/system.io.filestream.lock?view=netframework-4.8.1)
and [Windows byte-range locking rules](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-lockfileex)
support testing actual read denial. Memory-mapped access is a distinct case;
this probe and the current uploader use ordinary reads. The pinned
[libuv error mapping](https://github.com/nodejs/node/blob/v24.21.0/deps/uv/src/win/error.c)
maps lock violation to `EBUSY`.

## Actual local validation

At `2026-09-30T19:49:03.919Z`, native Windows Node **24.19.0**, libuv 1.52.1,
Windows 10.0.26200, PowerShell 5.1.26100.9444 / CLR 4.0.30319.42000, NTFS:

| Arm | Native matrix | Node before release | Cleanup |
| --- | --- | --- | --- |
| identity-share-none | All four opens failed with Win32 32 | Opens/reads returned EBUSY; held ID matched initial Node ID | Sentinel, dispose, exit 0; bytes recovered |
| byte-range | All four opens succeeded with matching IDs; ReadFile failed with Win32 33 and zero bytes | Both paths opened with matching IDs; descriptor/path reads returned EBUSY, syscall read, including at 150 ms | Sentinel, unlock, dispose, exit 0; bytes/hash recovered |

Both queried privileges were absent and disabled in the local parent and helpers.
This is not evidence of the hosted tokens. Aggregate identity, byte-range
precondition and normal-release checks passed, and the owned synthetic directory
was removed. No forced cleanup, stderr, helper error or privilege-query error was
observed. One Node test module passed, containing two diagnostic arms; this is
not an uploader acceptance result.

[Raw TAP](windows-share-lock-native-local.tap) SHA-256:
`fe62fe806dc183deb16b26d79131892b51a785d7a12efb8d5fdbf2c0f90f5042`.
[JSON extracted from TAP comments](windows-share-lock-native-local.json) SHA-256:
`82e86ee1926035d48e7c5dfafc1186cd3fd10a36442cbeac644316aa2097b1bd`.
The derived JSON retains TAP's extra backslash escaping in path strings; do not
interpret that formatting as runtime path differences. Identity comparisons ran
inside the probe before TAP formatting.

Executed probe SHA-256:
`511407efd2526903350b9667093bdfd27453762c8dd5109e1d7e3d81555c4821`.
The exact file was copied to a unique owned Windows temp staging directory and
run in the foreground with `node --test --test-reporter=tap probe.mjs`, avoiding
the already observed local UNC test-runner argument issue. Staging was removed
after completion. Independent read-only review found no material blocker in
native layouts/constants, ownership, read-only token queries or pass predicates.

## Next owner actions and concrete Web correction

Lead can integrate this probe and run the existing
`.github/workflows/windows-share-lock-diagnostic.yml` **once**, unchanged. Its
two-minute step bound covers two 30-second readiness bounds plus owned cleanup.
The embedded C# uses installed PowerShell/.NET; no additional file, package,
installation or uploader context is needed. Preserve executed hashes including
checkout conversion, complete TAP, exit code, IDs, native matrix and query errors.
The module exit code validates identity/read-denial/normal cleanup; successful
ShareNone opens are diagnostic observations, not an automatic failure or fix.

If the byte-range arm passes on the affected hosted image, Web's narrow test
correction is to replace the assumed open-denial fixture with a shared-open,
nonempty full-file byte-range lock. Before calling the uploader, independently
open the original, verify its identity/size, and assert that `readFileSync(fd)`
actually throws `EBUSY`; keep the helper alive throughout the uploader call.
At the assigned baseline, `apps/windows/src/main/uploader.ts` already catches that
read failure and returns **cannot be read**, whereas open failure returns
**cannot be opened**. Assert the read reason, `refused` at `local`, and zero sends.
Finally release, await confirmed close, and verify the original bytes recover.
Keep timeout/failure cleanup bounded to the owned child and preserve diagnostics.

This covers the real **read-denial** refusal branch. It does not establish
open-denial coverage; do not label it as such or weaken the real-denial assertion.
No production uploader change or skip is proposed. Web reviews/integrates its
test change at a safe boundary after hosted evidence, and runs the focused
uploader acceptance. Support has not dispatched that hosted run, modified app
tests, or passed any product R/A gate. The unresolved facts are the hosted native
identity/flag/token observations and whether byte-range denial holds there.
