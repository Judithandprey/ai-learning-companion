# Support macOS metadata probe — bounded review

**APPROVE** leaf `d8a402b7d6972a5a0d271b526915cacd22b0f0be` for integration against `a46a00d` and Lead's one existing authorized hosted measurement. No blocking finding in the assigned probe/tests/workflow slice. No production connector or binary-admission code changes.

Applied project PONYTAIL LITE/workflow and current original/English §3.8 / managed-subscription ADR boundaries. Read the exact leaf, full probe/tests, source report/receipt and the reused launch/config/RPC lifecycle. Export: `/tmp/subscription-mac-d8a402b`.

## Checked controls

- `codex_macos_metadata.py:31–60`: fixed official OpenAI `rust-v0.158.0` arm64 asset URL; archive SHA-256 `341c4a08f9ce1935b3007376dc2a3d50a0a89112930e9a474ae61367218f6e8a`; executable SHA-256 `788a818fbb9596869c7a487554507cb8bdca17584b8671112b23f9e225ba35c8`. Exact single regular member/name/239,662,592-byte size and arm64 Mach-O header required. It copies that member to an exclusive fresh file, never unpacks archive paths. Version output must equal `codex-cli 0.158.0`. No alternate version/architecture fallback.
- Lines 65–155: fresh owned state, separate HOME/tmp and empty work directory. Child receives only system PATH, owned CODEX_HOME/HOME/TMPDIR and LANG. Account/provider/GitHub/injection/proxy environment is not inherited. Curl disables curlrc and receives only system PATH, with HTTPS-only redirects and no credentials/retry fallback.
- Actual shared client start sends only **initialize → initialized → config/read → configRequirements/read → skills/list**. The outgoing `_send` wrapper rejects every other method before transport, including replies without an allowed method. Success requires that exact sequence and the unchanged complete configuration/requirements/skill verifier. No account/login/model/thread/turn operation is invoked.
- Source check requires a full lowercase 40-hex expected SHA equal to checkout HEAD, clean tracked files and all required tracked source files; receipt binds five probe/connector/workflow SHA-256 values. Manual workflow input enters through a quoted environment variable, not inline shell interpolation.
- Workflow is manual and main-only, contents-read, no persisted checkout credentials. Checkout/setup-python/upload-artifact action hashes equal the existing desktop workflow pins. It uses macos-26 with 4-minute step/8-minute job limits and preserves the receipt via `always()`; missing receipt fails artifact upload. It does not cancel another active run.
- Download is bounded to 90/95 seconds. Version communicate/reaping use 5-second waits; metadata startup is 50 seconds, RPCs 10 seconds. Existing shared close sends termination, waits 3 seconds, kills if needed and waits another 3 seconds. Both owned children close in finally; TemporaryDirectory cleanup encloses the measurement. Outer workflow limits cover abnormal host-level failures. Ordinary failures retain a failed receipt, never a compatibility pass.
- Fixed RPC codes are sanitized by the shared `RPCError`; arbitrary exception text/configuration is not emitted. Receipt records hashes, platform/version, fixed stages/codes, permitted method attempts, skill count/disabled status and cleanup flags. Outbound attempts on failure are not completed RPC evidence. No production `create_client`/binary admission function is called or patched.

## Verification and provenance

**9/9 offline tests pass in 0.160 seconds**, using existing `.venv` and exact exported test/probe bytes. These exercise environment exclusion, forbidden RPCs, corrupt archive, source mismatch, unavailable artifact, synthetic success/reaping, real verifier rejection, silent-child timeout/reaping and wrong-version rejection. Command: `.venv/bin/python /tmp/subscription-mac-metadata-run-offline.py`; transcript `/tmp/subscription-mac-metadata-offline.txt`.

The standalone runner relocates only `probe.ROOT` to the main repository for the deliberately invalid-SHA read-only Git test, because a Git archive has no `.git`. The synthetic successful transport case mocks verifier acceptance as declared; the separate unchanged real verifier correctly refuses the fake response. No real Codex executable or Mac was run.

All three author probe/test/workflow hash receipts match the leaf. All three recorded reused connector hashes match current `a46a00d`. The author's official archive inspection remains attributed; this review did not download or independently rehash those external bytes. The actual hosted probe will repeat both integrity checks before execution.

No source changes, workflow dispatch, provider/authentication request, database, desktop or native run performed. The future hosted result can establish only this pinned candidate's fresh-state metadata/configuration compatibility. Production Mac admission remains Linux-only until its owner explicitly changes it; login, image inference, interactive Mac and full product acceptance remain separate.

Machine evidence: `/tmp/subscription-mac-metadata-review.json`.
