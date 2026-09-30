# HOLD — Windows uploader local-original and test-host review

Exact candidate: `6c4ac03a43a4681bc1466fd0c894854a0b14df04`, parent `bb6761109cbca86c65e7b3f2e68deb95cab8b1d8`.
Exact Git archive: `/tmp/windows-upload-6c4-files-review-g_y72pr_`.

Scope: `apps/windows/src/main/uploader.ts` local originals, mapper/binding ownership, filesystem races and `tests/backend-host.py` / `tests/uploader.test.ts` evidence orchestration. HTTP/authentication/retry/cancellation/ACK semantics are independently reviewed elsewhere. Root owns the separate real-Backend run. No main/worker source was edited and no host/listener, DB, provider, native app, user preview or display was used by this review.

**Decision: HOLD for two bounded corrections in the uploader.** Eight independent observations executed successfully: four positive/refusal controls and four defect reproductions covering the two root causes below. Synthetic successful ACKs in these probes are test doubles, never evidence of a Backend commit.

## W-U-F1: pathname checks and file read can refer to different originals (P2)

At `uploader.ts:144–165`, `readOriginal` separately calls `lstatSync(file)`, `realpathSync(file)`, `realpathSync(root)` and finally `readFileSync(file)`. An intervening pathname replacement invalidates the regular-file and containment checks. The final read follows the pathname again.

The independent probe deterministically inserts a real filesystem change after the containment resolution and before the first send-time read, without modifying the uploader source or fabricating any filesystem return values:

- Replace the previously checked leaf file with a symlink to a copy outside the capture directory; or
- replace the checked `frames` directory with a symlink to a copied directory outside the capture directory.

The actual `readFileSync` opens and reads the outside target. The probe verifies the real resolved path is outside the capture root at that instant, then restores the original path. All seven PUTs and the batch are subsequently emitted; the uploader accepts the synthetic corresponding ACK. Static leaf and parent links present before checking are correctly refused with zero requests, so the issue is specifically the check/read race.

The outside copy deliberately has the expected exact bytes. **The length/SHA-256 checks are not bypassed, and this is not proof that arbitrary unknown file contents can be exfiltrated.** It violates the uploader's explicit regular-file/inside-capture guarantee and permits an external path to be consumed after that guarantee has been checked. The filesystem interleaving is reproduced on this review host; no native Windows race or reparse-point test is claimed.

Owner remedy: bind checking and reading to the same opened regular-file identity, with supported containment/link/reparse protections and changed-identity refusal. Retain both leaf and parent replacement regressions. Do not silently rely on a POSIX-only no-follow flag as complete Windows parent-path protection, or weaken the promised original/path guarantee. This requires a bounded file-read correction, not a new archive or service.

## W-U-F2: caller-owned bindings remain mutable across network awaits (P2)

`originalsOf` validates the binding against the prepared body, then stores the original caller object at `uploader.ts:127`. `uploadRetained` subsequently rereads that binding and `job.capture_dir` at `:309–313`, after earlier PUTs have awaited. The immutable body snapshot does not make those objects immutable; TypeScript `readonly` is a static view, not a runtime copy or freeze.

Two reproducible consequences using initially valid mapper output:

1. While the first PUT is awaiting its receipt, mutate a later ink binding's artifact ID to `independent-unplanned-ink`. The uploader sends that ID even though the prepared request never references it, and never sends the original `example-ink-7e2d667c44839eed` ID. The defect is the unexpected outbound PUT; a real Backend may then refuse the unchanged batch. The probe's synthetic ACK is not evidence otherwise.
2. Mutate the currently in-flight original binding's ID while its already-formed PUT is awaiting. The exact receipt for the original ID passes because it is compared to the copied `upload.artifact` at `:318`. But `:323` appends the now-mutated `a.artifact_id`. `result.originals` thus claims `independent-never-uploaded-original` was committed even though no PUT used that identity; the actual PUT/receipt named `example-png-eb1ce1ead5dbf130`.

The second case is a direct inaccurate committed-original report, independent of accepting a forged receipt. The upload job is supplied by a trusted host, so this does not establish an untrusted renderer API; it is a caller-aliasing/async correctness defect at the promised prepared-job boundary.

Owner remedy: before any asynchronous send, snapshot the selected bindings' exact primitive source/kind/artifact facts and capture-directory value; validate and use that owned snapshot throughout the run. Record the ID from the exact request/receipt being acknowledged. Preserve current per-send byte rechecks, unchanged prepared-body/key bytes, source ownership and already-committed-original reporting. No mapper wire or Backend change is needed.

## Passing evidence and test-host findings

The independent probes establish:

- A valid unchanged job emits seven originals with exact lengths/hashes, then its unchanged batch.
- A static outside leaf symlink is refused locally before any request.
- A static outside parent-directory symlink is refused locally before any request.
- Changing a later original's bytes after preflight is refused at its send-time check; only the preceding correct PUT was emitted.

Read the complete uploader, uploader tests, foreground Python host, mapper plan/binding/request paths, retained-original producer path and owner evidence document. The candidate branch predates current root contract/document files, so the released OriginalArtifact 0.2.2 and Windows ingress 0.2.10 contract READMEs were read from exact `8e2094e` Git objects. Current unchanged requirements/decisions and PONYTAIL LITE remain in force: retain original PNG/ink bytes and immutable source identity, preserve unknowns and do not equate synthetic upload with device/provider acceptance.

The host is an ordinary foreground child with piped stdin; `backend-host.py:45–50` creates the released runtime with synthetic consent, `desktop_pixels`, Windows capability and MemoryStore, and `:66–79` binds only `127.0.0.1`, without a DB/provider. The token comes through the environment, is not included in the ready JSON and is not logged by access logging. The stdin watcher requests server exit; normal test `finally` blocks close the relay and request child shutdown. The test helper does not await child exit in `stop()` (`uploader.test.ts:492`), so source inspection alone does not independently prove the owner's “no host left” statement. No orphan-process defect was reproduced and no separate host correction is requested here; root's actual run can observe process exit.

The real-Backend tests are explicitly skipped without both environment inputs. Evidence JSON records synthetic receipts/results and checks that the chosen bearer is absent. It does not itself prove which extracted Backend commit was used; the owner/root exact export and run evidence supply that provenance. The mapper harness capture is real application code under fakes, not native display evidence. Existing owner-reported 12/12 uploader results, full-suite counts and mutation scores remain owner evidence; this review did not duplicate them or root's planned real-Backend run.

## Reproduce and artifacts

```sh
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node /tmp/windows-upload-6c4-files-review-probes.mjs /tmp/windows-upload-6c4-files-review-g_y72pr_
```

- `/tmp/windows-upload-6c4-files-review-probes.mjs`: complete independent executable, intercepted fetch and controlled filesystem interleavings.
- `/tmp/windows-upload-6c4-files-review-probes.json`: eight observed outcomes, including explicit defect markers and retained temporary probe-data location.
- `/tmp/windows-upload-6c4-files-review-checks.json`: exact candidate/export, source hashes checked against Git objects, probe hash and scope.

The bug probes deliberately assert the existing undesired behavior so original evidence survives. Owner regressions should assert the desired refusal or stable snapshotted identity instead. Root may combine these two corrections with the independent HTTP review into one same-owner request. No broader campaign or native acceptance claim follows.
