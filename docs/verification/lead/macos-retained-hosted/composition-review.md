# PASS — actual retained Mac fixture → HTTP → archive → Learning

The standalone `/tmp/macos-retained-http-composition.py` consumed the actual hosted fixture supplied from run `36752548728` at `/tmp/lc-macos-36752548728/macos-retained-frame-fixture`. It did not generate or replace fixture inputs, execute Swift, rerun the owner checker/control suite, start a listener, access a database or call a provider. Native provenance remains tied to the separate hosted run/source/artifact audit, not to a generator label alone.

Both supplied mapper plans passed through an explicitly configured `desktop_pixels` runtime, released 0.2.4 display registration/original upload, 0.2.12 HTTP ingress, real stored `read_macos` / `resolve_macos`, and actual `prepare_observation_window` with its complete-selection final reread:

| Supplied plan | Exact frames / records | Stored PNG artifacts | Learning attached bytes |
| --- | ---: | ---: | ---: |
| `every_kept_frame` | 8 / 8 | 12 | 11,138 |
| `raw_alias_two_references` | 8 / 8 | 13 | 11,138 |

Each plan uses a separate pristine MemoryStore because the alternate plans deliberately retain the same frame IDs while callback 2's archive alias differs. No descriptor or supplied binding is rewritten. Process records and their historical transport envelope are explicitly constructed using the existing checker `batch_for` helper; they are not native-generated Process observations or capture-clock evidence. Server display-source `created_at` is taken from actual synthetic registration; all supplied identity/incarnation/source fields otherwise match exactly.

Checks actually executed:

- Every supplied PNG's bytes match its reference SHA/length, original upload/readback and stored binding. Stored canonical records and complete 0.2.11 descriptors match the derived records and supplied frames exactly.
- All eight raw images and all six available composed images resolve and pass Learning's image path with exact original bytes. Same-reference and two-reference raw aliases both work; both image roles count toward the byte total.
- Callback 7 remains `not_composed/refused`; callback 8 remains `unknown/no_retained_outcome`. Their composed resolver result is unobservable and Learning preserves explicit gaps without substituting raw bytes. Complete ink revision/path/limitation, reopened-time and callback-pairing metadata stays intact through whole-descriptor equality.
- Process clock, observed time and media position remain null. Native metadata is not converted to capture chronology; observation-window clock comparisons remain unknown. Adjacent raw/composed byte comparisons equal actual supplied bytes, with unavailable composition comparisons unknown.
- Exact ordered HTTP retry and reopened-runtime retry return the same verified-only ACK without mutations. Learning rereads the complete ordered selection twice.
- Unknown-boundary Stop rejects cached historical and new live HTTP requests with 409 while retained context remains exactly readable. Token revocation withholds a packet and cached ACK with 401. Source revocation withholds a packet with 403, cached ACK with 404 and raw resolution as revoked. Refusals do not mutate the archive.
- All **16 supplied fixture files** retain their initial SHA-256, including the local saved ink document and native manifest. No fabricated editable-ink original is uploaded: the descriptor's document path/revision remains metadata, with no supplied immutable ink binding. The 42 native refusal receipts and mapping `unrepresented` lines are preserved in the JSON evidence; they are not invented into image or Process records.
- Provider, live and authorization/commit attestation flags remain `not_attested`; presentation remains `not_granted`. The app's paid executor stays disabled, and the MemoryStore session never claims physical live capture.

Main advanced during preparation from `ef487cfcfaa7110ddb86c339c2065d0b12f21221` to `3ddd6d343c4d9d951e3868dba6063d27633275f0` through a Windows QA evidence/harness commit. The API, contract and Learning paths did not change. The relevant current runtime/reader/consumer/checker source files were additionally compared byte-for-byte with `ef487cfc`; the run receipt records this source check. There are no repository/worker edits from this task.

## Repeat

Uses the project's existing locked `.venv` including backend/test helpers; no dependency installation is needed.

```sh
PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python /tmp/macos-retained-http-composition.py /tmp/lc-macos-36752548728/macos-retained-frame-fixture --repo /home/agentsdock/Projects/learning-companion/repo --output /tmp/macos-retained-http-composition-36752548728.json > /tmp/macos-retained-http-composition-36752548728.log 2>&1
```

The input can also be the exact `manifest.json` path. The script fails on missing input; it has no simulated-fixture fallback. AST syntax validation passed. The actual composition command passed on its first execution.

Evidence: script `/tmp/macos-retained-http-composition.py`; full JSON receipt `/tmp/macos-retained-http-composition-36752548728.json`; concise execution log `/tmp/macos-retained-http-composition-36752548728.log`. The JSON contains all input hashes, ACKs, role-specific byte hashes, exact Learning metadata, current-fence outcomes and preserved unrepresented/refusal evidence.

Script SHA-256: `72c0b9fa88ae23b7cbb197793fd675d3856e346ce221faa51e5a991521de5cc8`.
Receipt SHA-256: `403dffa03890d2849b392953c8135138783e23b424bd2aa1c84d9e3a960c0303`.

This proves the supplied Swift-generated synthetic-buffer fixture chain through in-process API/storage/Learning. It does not prove display acquisition, physical permissions/Stop, persistent database durability, editable ink upload, provider receipt, real AI use or full product acceptance. Root owns script review, any repository retention, and further hosted/device/provider gates.
