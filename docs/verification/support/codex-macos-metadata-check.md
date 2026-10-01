# Codex 0.158.0 macOS metadata candidate check

Prepared 2026-10-01 UTC for the lead's bounded G4/P0-08 continuation, incoming
`handoff_4a375c7b93c178b1fbb2432e4e5f432f`, exact published baseline
`871aabd974a8b1c11d18072da7200b0a2413ae73`. This delivery prepares one hosted
measurement. **No hosted Mac execution or production Mac admission is claimed.**

## Cause and bounded outcome

The existing connector deliberately admits only the measured Linux x86_64
0.158.0 executable. A compiled Mac UI therefore cannot yet start that connector.
This is an explicit platform/hash admission boundary, not an observed subscription,
quota or approval failure. Backend owns any later precise production admission
change after review of actual Mac evidence.

The new [manual workflow](../../../.github/workflows/subscription-compatibility.yml)
runs only the [metadata probe](../../../tests/probes/support/codex_macos_metadata.py)
on the already authorized `macos-26` runner. It does not rebuild desktop applications.
The lead delegated this one root workflow file; all other changes are support probe
and evidence files. No production connector, native source, dependency or shared
contract is modified. PONYTAIL LITE uses the existing connector and Python standard
library instead of another configuration verifier or dependency.

## Official candidate and actual local inspection

Sources read on 2026-10-01 UTC:

- [Official OpenAI release](https://github.com/openai/codex/releases/tag/rust-v0.158.0),
  published `2026-09-28T05:07:23Z` according to its
  [official release API](https://api.github.com/repos/openai/codex/releases/tags/rust-v0.158.0).
- [Official arm64 archive](https://github.com/openai/codex/releases/download/rust-v0.158.0/codex-aarch64-apple-darwin.tar.gz),
  release asset `594554175`, 95,135,097 bytes.
- [GitHub runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners):
  `macos-26` is a standard arm64 runner. The probe also checks the actual host and
  refuses another OS or architecture.

The archive was actually downloaded to temporary storage and its published digest
matched. Its single regular member, `codex-aarch64-apple-darwin`, is 239,662,592 bytes.
The probe's own extraction check verified the member, binary digest and Mach-O arm64
header without executing it on Linux.

| Identity | SHA-256 |
| --- | --- |
| Published and measured archive | `341c4a08f9ce1935b3007376dc2a3d50a0a89112930e9a474ae61367218f6e8a` |
| Measured executable | `788a818fbb9596869c7a487554507cb8bdca17584b8671112b23f9e225ba35c8` |

The hosted check repeats both digest checks and requires actual `--version` output
`codex-cli 0.158.0`. No latest-version, Intel/Rosetta, package or provider fallback
exists. Download failure records the phase, curl exit and available HTTP status;
the URL remains in the receipt for a precise unavailable-artifact handoff.

## Isolation and measurement

The candidate constructs `ChatGPTAppServer` directly and reuses `_command`,
`_settings`, `_environment`, `_prepare_state`, `_state_lock` and the complete
`_verify_config` from the checked-out connector. It neither calls nor patches
`create_client` / `_binary_identity`; the production Linux admission remains intact.

Each run creates temporary product state, an empty working directory, a separate
HOME and temporary directory. Canonicalizing the newly created scratch path avoids
macOS `/var` symlink ambiguity without weakening the connector's symlink checks.
The child receives only PATH, CODEX_HOME, HOME, TMPDIR and LANG. No inherited GitHub,
API, development-agent or proxy credentials/configuration is passed. Curl disables
curlrc, uses no inherited environment beyond a system PATH, and has a 90-second
limit with no retries. Checkout does not persist credentials.

The outgoing transport permits exactly:

1. `initialize`
2. `initialized` notification
3. `config/read`
4. `configRequirements/read`
5. `skills/list`

All account, login, model, thread and turn methods are refused before transport.
No account activation, inference or user/provider credential access is requested.
The unchanged verifier checks effective values, origins, permitted configuration
layers, managed-provider restrictions and exactly six disabled bundled skills using
their complete `SKILL.md` paths. A Mac difference fails the check; the probe does not
relax it. Raw responses stay in memory and stderr is discarded. Fixed metadata error
codes and the failing step survive the client's normalized startup error.

The version process has a five-second limit; metadata startup has a 50-second bound
and individual RPCs ten seconds. Owned processes are closed/reaped in `finally`;
temporary state is removed. The workflow adds four-minute step/eight-minute job
bounds. There is no detached execution, polling, background service or cancellation
of another run.

The sole uploaded JSON contains source SHA and source-file hashes, candidate
source/digests/version/architecture, configuration result, bounded skill counts,
outbound method attempts, sanitized failure information and cleanup facts. A
successful method list is checked in exact order. Failed attempts are not proof of
completed calls. No raw configuration, account information, filesystem inventory,
tokens, model output or screenshots are retained.

## Local checks and limits

[Nine offline tests](../../../tests/probes/support/test_codex_macos_metadata.py)
pass: dirty-environment isolation; forbidden RPC refusal before transport; corrupt
archive rejection; wrong source SHA receipt; unavailable official artifact with
HTTP status and no fallback; synthetic transport success/reaping;
actual verifier rejection/reaping; silent-process timeout/reaping; wrong-version
refusal before app-server startup. The successful synthetic case mocks only the
verifier and is explicitly **not** Mac configuration compatibility evidence.

The support branch predates the current connector. Tests imported the three
unchanged connector modules exported read-only using `git show` at the assigned
baseline into `/tmp/lc-support-macos-metadata-baseline`:

```sh
PYTHONPATH=/tmp/lc-support-macos-metadata-baseline python3 -m unittest discover \
  -s tests/probes/support -p test_codex_macos_metadata.py -v
```

On integrated main, run the same command without the temporary PYTHONPATH.
Python AST parsing, YAML parsing/structure checks, actual pinned-archive extraction
and `git diff --check` also passed. No Mac binary was run locally, no hosted workflow
was dispatched, and no GUI, capture, login, tool-free inference, image or real-device
acceptance follows from these checks. See the [local receipt](codex-macos-metadata-local.json).

## Next owner and one exact hosted run

Lead reviews/integrates this leaf normally, runs the focused tests on integrated main,
and pushes under existing authority. Lead then triggers this manual workflow once
on main with `expected_source_sha` equal to that exact reviewed integrated commit:

```sh
gh workflow run subscription-compatibility.yml --ref main \
  -f expected_source_sha=FULL_REVIEWED_INTEGRATED_MAIN_SHA
```

The probe fails before download if checkout HEAD differs from that full SHA, tracked
files are modified, required source files are untracked/missing, or the connector's
expected version changed. Review the actual hosted run/head SHA and the single
`subscription-macos-metadata-<SHA>-<attempt>` receipt. Passing establishes candidate
metadata compatibility only. Backend then owns a precise admission decision and
its tests; native/UI and Windows actual-image owners keep their existing scopes.
If it fails, hand back the exact receipt/phase/code without retrying another version
or weakening admission. Support finishes this bounded preparation and waits for
the next concrete assignment.
