# Platform (iPad native) verification evidence

Owner: 04 iPad native. Write scope: `apps/ios/**`, `docs/verification/platform/**`.

## P0-03: G1/G2/G3/G5 capability boundary (2026-09-28 UTC)

Baseline `91019c3fd548e47aca632136012bb961c4af07cb`, contract 0.1.0. The v1.1 specification at
`57aee9c` and the final specification at `e43293760c70364584cb597ae01d34a261cc52cf` (content
`a2567fa`) were read with `git show`, not merged. R59/A44/A45 exist only in `e432937`; the
matrix's R59/A44 section relies on it. G7/R59 work is P0-11.

| File | Content |
| --- | --- |
| [`p0-03-capability-matrix.md`](p0-03-capability-matrix.md) | Preferred/fallback decisions per gate, go/no-go device tests, contract observations for the lead, and the generated matrix table |
| [`p0-03-capability-matrix.json`](p0-03-capability-matrix.json) | 62 rows. Each wraps a contract `CapabilityResult` with `doc_basis`, OS/SDK, sources with access dates (page dates where the page shows one) and device-test IDs. |
| [`research/p0-03-verified-claims.json`](research/p0-03-verified-claims.json) | 168 researched claims, each with independent verifier verdict, corrections and sources; 89 verifier-added claims; 30 completeness-critic claims; 2 review addenda (RV-01/02) |
| [`p0-03-environment.md`](p0-03-environment.md) | Local environment evidence, ranked build/sign/install routes, minimal steps, exact user inputs |
| [`p0-03-device-checklist.md`](p0-03-device-checklist.md) | Real-device test protocol and 58 tests (all `not_tested`) |
| [`p0-03-prototype-plan.md`](p0-03-prototype-plan.md) | Bounded probe sequence, native bridge decision table, input-mode and lifecycle state design |

### Result separation

| Stage | Result |
| --- | --- |
| Documented (primary sources, dated) | Matrix rows marked `documented` or `unsupported` |
| Inferred / undocumented / third-party only | Matrix rows marked `not_tested`; each lists a device test |
| Implemented | None. There is no Swift or extension source. `apps/ios/tools/check_capability_matrix.py` is a Linux-run consistency checker, not app code. |
| Compiled | None (no macOS/Xcode; see environment report) |
| Automated checks | Contract baseline `42 passed`. The matrix checker validates: rows against 0.1.0; that each status agrees with its documentation basis and with the cited research claims' statuses and source kinds; evidence prefixes; ISO access dates; research references; checklist coverage; and markdown sync. Its self-test rejects 13 known-bad mutations and accepts a well-formed device failure. |
| Real provider | None |
| Real device | None |

### Method

The official-documentation research ran as one orchestrated multi-agent workflow on 2026-09-28
(run `wf_00ecfe60-124`). It used seven dimension researchers (Safari extension, Pencil/ink, cross-app,
capture/audio, lifecycle, notes export, build environment). An adversarial verifier re-fetched the
sources for each dimension and tried to refute every claim: 125 were confirmed, 43 were corrected,
none was fully refuted, and 89 missed facts were added. A final critic resolved contradictions and
added 30 claims. The research was read-only: it made no logins, account actions, purchases or posts.

A second independent workflow (run `wf_96e2b4a8-dc1`, 4 reviewers) then reviewed these deliverables.
It reported 55 findings: 4 high, 24 medium and 27 low. The high findings overlap. All findings were
addressed before commit:
- PEN-04, G3-09 and G5-01 were downgraded from `documented_absent` to `inferred`/`undocumented`.
- The inferred part of LC-07 moved to a new row, LC-08.
- G5-06 was relabelled `undocumented`.
- Overstated wording was narrowed in many other rows.
- Forum sources relabelled: DTS reply, other Apple staff, or developer post.
- Checker tightened.
- The native bridge table corrected for `request_id`, duplicates and `AuthorizationContext`.
- Lifecycle state names unified.

The SFExtensionProfileKey fact (RV-01) was re-read from Apple's DocC JSON before being added.
Apple's JS-rendered documentation was read through its public DocC JSON.

### Reproduce

```sh
uv sync --frozen
.venv/bin/python -m pytest -q                                   # contract baseline
.venv/bin/python apps/ios/tools/check_capability_matrix.py --self-test
```
