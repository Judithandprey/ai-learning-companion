# Held Windows Backend + Learning stored composition

**Four valid-path composition groups passed; no seam mismatch found. Backend `09eb9b5` remains HOLD under the separate source review. These results do not approve integration.**

Exact source: Backend `09eb9b558e675abe78f8cbdfd078587caaef6c65`, overlaid only with the five changed files from Learning `18faf4f8f21eaebf4384adc99b2deec9b8a00ca6`, in `/tmp/lc-windows-backend-learning-composition`. All 11 Backend changed files and all five Learning changed files were byte-compared to their respective Git commits successfully. No main or worker file was edited. Root subsequently reported Learning-only integration as `98edf14`; this execution still uses the exact isolated pair above.

The standalone executable is `/tmp/windows-stored-learning-composition.py` (SHA-256 `3a6ee45c484a1c410d9a9da1016cc261b6a7539b52eab268fd67f1fde9743a44`). Its source-root argument also permits repeating on a later integrated tree without changing imports.

## Actual path and results

Setup uses the existing synthetic `control_fixture` with real `MemoryStore`, actual registration and explicit pixel-producer binding, actual `OriginalArtifacts.put` uploads, and current checks through `LocalTestAuthenticator`. It creates no HTTP app or request. Synthetic image metadata comes from the existing Learning fixture builder; PNGs are project-authored. Source/frame/archive references are assigned explicitly, with a Windows frame ID distinct from the fixture's legacy frame.

Before Learning is called, the probe invokes actual `ControlRegistry.ingest_windows_frames`, verifies ACK artifact receipts, opens the stored archive, compares each canonical record and full descriptor, checks the absence of a fabricated legacy frame, and checks each typed original binding and retained byte hash/length. The consumer receives actual `AuthorizedProcessContextReader.read_windows` and actual `AuthorizedImageResolver.resolve_windows` adapters.

Executed groups:

1. One archive stores distinct raw/composed PNGs, one same-artifact image alias, one raw-only sample, and one frameless unknown-coverage record. Exact original records, descriptor roles, separate editable-ink reference, retained sample gap with null duration, null Process/capture clocks, requested order and byte totals survive Learning observation-window preparation. The consumer uses five actual image reads and two complete metadata reads, independently checking authorization on each read. Raw equality and composed inequality are compared separately; chronology and provider/presentation authority remain unknown/not attested/not granted.
2. Legacy, raw and desktop readers/resolvers remain closed to Windows descriptors. A separately stored actual 0.2.5 raw record still composes through the unchanged old adapter signature. An actual Stop command with explicit synthetic producer boundary preserves the same authorized Windows historical packet.
3. Starting each case with committed originals and a successful stored Learning preparation, deletion of the composed artifact through a real store transaction returns 503 with no packet; deleting the source and both originals returns 404; source revocation returns 403; current-token revocation returns 401. The raw resolver also withholds availability when the other required original is lost or authority fails. The direct artifact deletion is an explicit retained-original-loss injection, not a public per-artifact deletion API claim.
4. A transparent instrumentation wrapper calls the actual Windows image resolver and revokes the actual test token immediately after its composed-image result returns. Both image reads had succeeded; Learning's final actual full-selection read then returns 401 and no partial packet escapes. No reader, store, consumer or image result was stubbed.

## Exact execution

```sh
PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python \
  /tmp/windows-stored-learning-composition.py /tmp/lc-windows-backend-learning-composition
```

Result: **4 stored Backend + Learning composition groups passed**, exit 0, 0.74 seconds reported by the command tool. No broad test suite was repeated. The first development run failed with `frame_identity_conflict` because the probe reused the bootstrap fixture's legacy frame ID. The probe ID was corrected in `/tmp`; the guard was correct, and this was not a product defect or a passing run.

The exact overlay can be reproduced from main's Git object store without touching its working files:

```python
import io, subprocess, tarfile
from pathlib import Path
out = Path('/tmp/lc-windows-backend-learning-composition')
out.mkdir(exist_ok=True)
backend = '09eb9b558e675abe78f8cbdfd078587caaef6c65'
learning = '18faf4f8f21eaebf4384adc99b2deec9b8a00ca6'
with tarfile.open(fileobj=io.BytesIO(subprocess.check_output(['git', 'archive', backend]))) as archive:
    archive.extractall(out, filter='data')
paths = subprocess.check_output(['git', 'diff-tree', '--no-commit-id', '--name-only', '-r', learning], text=True).splitlines()
assert len(paths) == 5
for name in paths:
    (out / name).parent.mkdir(parents=True, exist_ok=True)
    (out / name).write_bytes(subprocess.check_output(['git', 'show', learning + ':' + name]))
```

## Hold and remaining boundaries

Lead reported a separate concrete Backend review finding: contradictory renderer `pixels_sha256` facts for one retained raw PNG identity can be admitted within/later batches. That owner correction remains pending; this probe deliberately does not duplicate the invariant campaign or turn valid-path passes into Backend approval. Learning's existing PNG validator verifies retained file bytes and supported PNG structure/dimensions; renderer RGBA hashes remain declared metadata, not decoded-pixel attestation.

Lead/Backend next supply the corrected exact candidate and perform the focused correction check plus this stored composition at the integrated boundary. No HTTP activation, native acquisition, database persistence, actual ink/editability, provider dispatch, AI receipt, source/ink/audio/Notability completion or desktop §7.1 acceptance was exercised. Synthetic bootstrap and LocalTestAuthenticator are not production login or acquisition authority. Final preparation is not atomic provider dispatch or a future permission lease.
