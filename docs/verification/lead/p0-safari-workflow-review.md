# Safari packaging workflow review

Decision: **APPROVE**. No consequential workflow integration blocker found in
`.github/workflows/ios-safari.yml` at
`117f8c83c0df6d9bb3415437f6e0b969b72cf1c6` (Support source
`b7ed163c99145695ede76930bd94271974ecdb20`). Reviewed against the complete actual
`package.sh` integrated at `738866fbb29b354b56a5aee4940637c3cbe47011`.

Read-only blob comparisons confirm the workflow equals the Support delivery and
package.sh is unchanged between its integration and reviewed main. package.sh is
committed executable. Product Web resources are not present yet; this workflow
properly treats that as a missing owner input, not a successful fixture build.

- Both preflight and invocation name **apps/safari-extension/webextension**.
  There is no fixture fallback. Native fixture files may be included in the native
  source archive for provenance but are never selected as packaging inputs.
- Actual CLI flags match package.sh: separate absent output directory and both SDK
  arguments. The native script writes interface.json with the exact fields the
  collector consumes. It builds with CODE_SIGNING_ALLOWED=NO.
- Explicit Bash plus normal Actions fail-fast/pipefail behavior preserves failures
  through tee. Missing inputs fail preflight; packaging/compilation failure remains
  a failed job. There is no continue-on-error or unconditional success conversion.
- Always-run collection retains root logs/interface and generated project after
  partial failure. Reported products require the expected unique SDK, an existing
  app under the package output and an embedded extension. A reported successful
  package must include both SDKs and signed=false; partial results do not change
  the package step's failed outcome.
- Provenance includes checked-out commit, run/attempt, both input tree IDs, archived
  exact native/product/workflow source, toolchain, Web resource hashes, interface,
  product archives and retained-file SHA-256 sums. Upload runs after failure and
  labels unsigned/device-install-unverified output honestly.
- Permissions stay read-only, checkout credentials are not persisted, paths are
  quoted, and all output stays under runner temp. No signing/device/provider access
  is introduced.

Applied current workflow/PONYTAIL LITE. Reviewed workflow and native script via
`git show`; compared their exact blobs with `git rev-parse` and executable/input
entries with `git ls-tree`. Did not duplicate the reported seven workflow cases,
11 native guards or three independent corrected probes. No hosted, browser,
external or platform calls; no source edits. All pre-existing dirty work preserved.

Next evidence boundary is the real Web resource delivery followed by actual hosted
packaging/build. This approval is source review, not a successful product build,
signed installation or Safari/iPad runtime acceptance.
