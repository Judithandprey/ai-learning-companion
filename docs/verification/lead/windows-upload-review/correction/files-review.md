# Windows uploader c09c151 — file/snapshot review

**APPROVE for the present disconnected, trusted-main callable and app-owned capture-directory scope.** No new blocking defect was found in the file-identity or input-snapshot correction. This is **not** approval of atomic confinement against a process adversarially rewriting the capture directory; that reproducible limitation remains explicit below.

Candidate: `c09c1518024555afcc3f646195f2c1d0b617ed9d`, parent held `6c4ac03a43a4681bc1466fd0c894854a0b14df04`. Exact export: `/tmp/windows-uploader-c09-files-export`. All seven changed files match their Git blob bytes; uploader SHA-256 is `2e3695dfcaa219ef8752791d65f6f2d857558744a5673d6acfc28e90474bae68`. `git diff --check c09c151^ c09c151` passed.

Read the complete uploader, the affected file/snapshot test groups, previous lead file review and probes, and owner correction/boundary documentation. Current workflow/role/requirements were refreshed from main `1f2a41257dd1fa88d7327827eff73800919ead6a`; candidate's older branch does not contain current workflow.md. Affected original/English requirements and decisions are unchanged from previously reviewed `8e2094e`. PONYTAIL LITE applied: reuse native fd identity and owned input copies; no new storage/identity framework.

## Corrections verified

**W-U-F2 — caller aliasing is closed in the reviewed scope.** At `apps/windows/src/main/uploader.ts:341–357`, authority primitives, source/incarnation, directory, complete plan, prepared key/body/request are copied before the first asynchronous operation. Binding artifact facts receive an additional owned primitive copy at `:180`. Preflight and sends use those copies, with the sent artifact ID recorded at `:438`. AbortSignal remains intentionally live; this review does not interpret it as a copyable job field.

The independent probe changes current and later binding IDs/hashes/source, capture directory, body, key, prepared request, owner/incarnation, token and origin during the first response. All seven original PUTs and the unchanged batch retain the initial facts; reported original IDs equal the exact IDs sent. The previously demonstrated unplanned PUT and falsely reported committed identity no longer reproduce.

**W-U-F1 — ordinary check/open/read substitutions are closed.** `readOriginal` now obtains bigint `lstat` identity (`:205`), resolves containment against the capture root resolved once (`:212–216`, `:373–378`), rejects zero device/inode (`:223`), opens with supported no-follow/nonblocking flags (`:228`), compares regular-file fd identity and size (`:236–241`), then reads through that fd (`:243`) and verifies exact byte length/SHA-256 (`:251`). Closure is in `finally` (`:248–250`). There is no later pathname read of the file bytes.

Independent actual-filesystem interleavings show:

- Static leaf or parent outside symlinks: refused before requests.
- Leaf or parent replacement after containment: refused before outside **content** is read or any request occurs. Parent traversal can open the outside file, but mismatching fd identity prevents reading it.
- Leaf replacement with O_NOFOLLOW deliberately removed: still refused by fd identity. This is Linux link-following evidence, **not** an executed Windows/reparse-point test.
- A different file renamed onto the path after `open`: exact original fd bytes are sent, never the replacement bytes.
- Later original content changed after preflight: refused at send time after only the preceding correct original; no changed bytes/batch sent, and the already receipted original is retained in the result.

The unchanged job sends exact PNG/ink bytes and exact body and leaves all local files unchanged. All successful receipts/ACKs in this independent probe are **response doubles**, not evidence of a Backend commit.

## Real residual containment limit — nonblocking in this callable scope

The owner correctly states this at uploader `:12–14` and the verification document's explicit limit. Separate path lookups are not atomic. The independent probe uses genuine filesystem renames/symlinks, without fabricating stat/realpath results:

1. On the first original's send-time `lstat` (`:205`), briefly replace `frames` with a symlink to an outside copy. The returned device/inode is genuinely the outside file's identity.
2. Restore the inside directory before `realpath` (`:212`). The returned path genuinely passes containment.
3. Restore the outside symlink before `open` (`:228`). Its regular leaf is unaffected by O_NOFOLLOW; fd identity equals the genuine identity obtained at step 1.
4. `readFileSync(fd)` (`:243`) reads the outside file, independently confirmed using Linux `/proc/self/fd`. The probe then restores the directory.

Two observations make the boundary precise:

- With an outside copy of the **exact expected bytes**, seven PUTs and the batch are emitted; the corresponding synthetic ACK is accepted.
- With a same-length outside file containing **different bytes**, the outside content is still read, but `:251` refuses it, with **zero requests**. No hash/byte/original substitution is accepted.

This preserves proof of an outside read, not proof of arbitrary unknown-content exfiltration. It requires adversarial ability to rewrite the capture directory across multiple lookup boundaries. The original absolute inside-directory promise is therefore **not fully closed**; the correction narrows ordinary races and honestly bounds the hostile-directory case.

I do not hold the existing callable solely on this limit: the API explicitly takes trusted main-process authority and a retained app directory, is still unconnected to main/renderer/page code, and content identity remains enforced. Current retained paths are app-controlled `userData/captures/<id>` (`main.ts:402`). Integration must preserve that trust boundary and the documented limitation. Exposing caller-controlled paths or relying on this routine as an atomic filesystem sandbox would require a different review and containment design. No assumption of Windows file-ID/reparse behavior has been independently verified here.

## Focused evidence and limits

Executed **11 named Node probes: 11 pass, 0 fail, 0 skipped**, **105.378057 ms**, Node **v24.21.0** on Linux. This count includes the two successful reproductions of the stated residual limit; those are not security-closure passes. No full author suite or mutant campaign was repeated. Root owns focused suite execution/final integration; the other reviewer owns HTTP semantics.

```sh
LC_UPLOAD_REVIEW_ROOT=/tmp/windows-uploader-c09-files-export \
  /home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node \
  --test --test-isolation=none --test-reporter=tap \
  /tmp/windows-uploader-c09-files-probes.mjs
```

Artifacts:

- `/tmp/windows-uploader-c09-files-review.json`: source provenance, complete observations and scope.
- `/tmp/windows-uploader-c09-files-probes.mjs`: reusable bounded actual-source probe.
- `/tmp/windows-uploader-c09-files-probes.json`: per-case observations and retained temporary data directory.
- `/tmp/windows-uploader-c09-files-probes.log`: exact successful TAP run.

A first launcher invocation accidentally supplied the export directory as an additional Node test file; the 11 probes themselves passed, but Node rejected that extra directory import. The corrected command above supplies the path by environment and completed successfully. No product source or test assertion changed to obtain the result.

No repository/worker edits, network/listener, Backend/DB/provider, native Windows/desktop/display or user-content inspection was performed. Linux file checks and synthetic receipts do not establish native Windows or real-AI acceptance. R27/R46/R51/R52/R59 original/context/ink preservation and both §7.1 acceptance gates remain intact and unclosed by this component review.
