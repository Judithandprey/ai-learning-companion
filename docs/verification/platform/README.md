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

## P0-11: G7 dual path and R59 original-screen annotation (2026-09-28 UTC)

Baselines, all read with `git show` and not merged:
- Specification: `e43293760c70364584cb597ae01d34a261cc52cf` (content `a2567fa`).
- Confirmed user decisions: `44e60ec289717e155fb0f4374784c791bf23689c` (`intent-and-decisions.md`:
  two display modes, contextual note/draft purpose, completion prompt, destination choice).
- Increment `9ce270cc747676889797199b7e8455ccfef07a5f`: it adds R12 and R20/R22 evidence and the
  on-demand support role, and changes nothing in P0-11 scope.

Contract 0.1.0 is unchanged. P0-11 builds on the P0-03 commit `a4841d3`.

| File | Content |
| --- | --- |
| [`p0-11-g7-matrix.md`](p0-11-g7-matrix.md) / [`.json`](p0-11-g7-matrix.json) | 48 rows: R59/A44 surfaces, S path (own canvas), V path (external pixels), confirmed-decision rows (each display mode per surface, completion prompt) and measurement tooling, with A44 status per surface |
| [`p0-11-g7-plan.md`](p0-11-g7-plan.md) | S-path operation log; V-path observation and gaps; offline replay; `CompositeDeliveryProof` (backend receipt vs model input); display modes; purpose, prompt and destination (native end); A45 return flow; A46 end to end; name mapping; teaching state and R57; the 40-case human-reference experiment; bounded hosted build route H; lead requests; user inputs U12–U18 |
| [`p0-11-device-checklist.md`](p0-11-device-checklist.md) | 42 device tests (all `not_tested`), including offline replay, both display modes, the completion prompt and destinations, and A45 fallbacks |
| [`research/p0-11-verified-claims.json`](research/p0-11-verified-claims.json) | 96 claims (62 confirmed, 34 corrected by adversarial verifiers) plus 41 verifier additions, from run `wf_27c2dac1-b0f`. The first attempt failed on a provider quota limit and was re-run after the quota was restored. |

**Review.** An independent 3-reviewer workflow (`wf_50e008b7-112`) reported 47 findings: 2 high, 25
medium and 20 low. A second verification workflow (`wf_793d6bdc-1c6`) then re-checked those fixes and
the new `44e60ec` content. It found 6 fixes incomplete and 12 issues in the new content (none high). All
of these were fixed before commit. The main changes across both rounds:
- offline replay and A45 fallback tests were added;
- the proof now separates backend receipt from model input and has an A44-eligibility rule;
- the indicator promise is scoped to surfaces we render;
- A46 import passes only on an observed import;
- web-ink transfer and routes were corrected;
- inferred clauses in documented rows are marked;
- forum labels and dates were fixed;
- existing 0.1.0 names (`device_sequence`, `gap_flags`) are reused;
- the checker now validates `a44_status`, explicit `a45_only` rows, decision-gated A44 rows,
  `v1_1_gate` and forum labels, and uses argparse;
- the display-mode rows are split per surface;
- the screen-fixed, completion-prompt and destination tests now include their negative cases;
- the hosted signed build route H (unverified, not configured) is available to tests that need only an
  installed build;
- E01 uses fixture pages, and a screenshot from a real page is redacted.

**Result separation** is the same as P0-03: documentation only. Nothing is implemented or compiled,
and there are no provider or device results. Status per surface:
- Safari content-script ink: candidate for A44.
- In-app browser: candidate, pending a lead/user decision.
- Canvas Student, Notability and other native apps: unsupported unless a device test shows otherwise.
- Side-by-side, frozen frames and own canvas: A45 only.

```sh
.venv/bin/python apps/ios/tools/check_capability_matrix.py --matrix p0-11 --self-test
```
