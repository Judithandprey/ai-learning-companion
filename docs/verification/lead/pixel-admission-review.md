# Independent review — Backend pixel producer admission

**Verdict: HOLD for one narrow damage/fallback case.** Normal bound admission, exact replay restrictions, paired-marker rollback and generic compatibility pass the checks below. The remaining case requires loss of BOTH internal profile fields; it is not an HTTP-accessible profile deletion or an ordinary-token exploit.

## Exact candidate and scope

- Candidate: `81e5441bb2a04f4e1f9080c046d19c18d01295bf`.
- Parent: `25dd67849941e53e4971ed67d0e62c63e140dfcf`; adopted ADR §3 decision: `061efe287fd965b5a8fcfeced36f1309c2540e2f`.
- Complete `git archive` export: `/tmp/pixel-admission-review-q0hyuywq`; identity receipt: `review-candidate.json` there. No mutable worker source was used.
- Main at review start: `e819bfe4c6650c01c72610109725f30bccb82b47`. Main's concurrent dirty docs/probes and Windows evidence were preserved. This review wrote only `/tmp` probes/report, not production source.
- Applied project PONYTAIL LITE. Refreshed the full adopted ADR §3 rule and Backend delivery evidence. Prior bounded triage had read full source/English R51/R52, A30/A31, effective decisions, full released desktop 0.2.7/0.2.8 and Process rules, plus real caller and reader flow. Read-only comparison from that triage baseline `775436f` to this candidate confirms only ADR 0002 changed among AGENTS/TEAM/lead/workflow, requirements and contract files; no requirement translation or released validator drift was introduced.
- Reviewed full relevant ControlRegistry binding/register/current-authority calls, runtime setup/reopen transaction, CaptureArchive common ingest/gate and retained source/lifecycle interactions, MemoryStore/transaction behavior, all new admission cases and changed desktop fixture calls. No database, listener, provider, native launch/compiler, install, network or external/team message was run.

Changed files in this delivery: `services/api/capture.py`, `capture_runtime.py`, `control.py`; `services/api/tests/test_producer_admission.py`, `test_desktop_capture_runtime.py`, `test_desktop_frame_ingress.py`, `test_desktop_ingress_http.py`, `postgres_desktop_runtime_check.py`, `postgres_producer_admission_check.py`; and `docs/verification/backend/capture-runtime.md`, `desktop-capture-runtime.md`, `pixel-producer-admission.md`, `pixel-producer-native-composition.txt`, `pixel-producer-postgres.txt`.

## P2 blocker: a retained desktop gap does not fence downgrade after both profile markers are lost

Location: `services/api/capture.py:123–131`, particularly the negative witness scan at lines 126–128. It only looks for `raw_capture_frame` with `contract_version == "0.2.7"`.

The first-gap path is an expressly supported desktop path. It durably retains a desktop-route ACK and same-stream canonical record even though it has no frame. Those surviving facts distinguish it from a never-desktop generic stream, but the new gate ignores them after both markers disappear.

Executed reproduction, independently authored against the exact export:

1. Use the existing MemoryStore fixture, register the display and upload valid PNG/editable-ink originals. Bind the exact stream with the trusted `bind_pixel_producer` entry.
2. POST honest `external_app / visual / coverage: unknown` sequence 1 to `/v2/process/desktop-frames:batch` (0.2.8), with `frames: []`. It returns 200. Assert no `raw_capture_frame` exists.
3. Simulate the expressly reviewed two-marker damage by deleting only `producer_profile` from `control_start` and `control_stream` in this test actor. All authority, source, canonical gap, replay and originals remain intact.
4. POST sequence 2 in that same stream, with the gap as causal parent and a valid frame, via `/v2/process/raw-frames:batch` (0.2.6). Its record claims `web_dom / structured / operation: reselect`, `observed_actor: user`, `actor_basis: trusted_input_event`, before B and after C.
5. **Observed 200 accepted and exact structured record persisted.** Independently repeat through `/v2/process/frames:batch` (0.2.4): same result. The retained desktop replay key is `["POST","/v2/process/desktop-frames:batch","review-gap"]`, and its ACK carries the exact stream identity. All preexisting rows remain unchanged.

This does not claim that HTTP can delete the markers. It demonstrates that, under the two-marker loss already addressed for retained frames, surviving desktop gap history is incorrectly treated as generic compatibility. It is outside the documented unavoidable case “before any retained desktop use” in `pixel-producer-admission.md:72–74`: actual desktop use and an identifiable desktop ACK are retained here.

Smallest scoped owner correction: Backend should treat a retained, attributable desktop-ingress replay as an additional **negative** witness in the existing common gate, using exact namespace/route and same-stream ACK identity with existing stored-data validation conventions. Refuse fallback before success/write; never infer or reconstruct positive producer authority from a replay or gap. Preserve old generic streams, canonical bytes, ACK bodies, and explicit trusted-host adoption. No schema migration, global visual-only validator or new provenance system is needed. Add this first-gap/two-marker-loss case for raw and legacy fallback, and keep the existing never-desktop generic structured positive control. Malformed surviving witness data should not silently authorize downgrade.

## Executed checks

Pinned interpreter: `/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python`.

```sh
cd /tmp/pixel-admission-review-q0hyuywq
PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python \
  -m pytest -p no:cacheprovider -q services/api/tests/test_producer_admission.py
```

Observed **48 passed in 1.75s**. This independently reruns the actual candidate's narrowly relevant module, not the author's broad campaign. It covers exact registration binding, pending propagation, paired malformed/lost markers, no-write mixed-batch refusal, route/internal convergence, historical record/ACK preservation and replay refusal, lifecycle precedence, runtime omission/reopen and injected paired-write rollback.

Independent executable:

```sh
cd /tmp/pixel-admission-review-q0hyuywq
PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python review-probes.py
```

Eight bounded checks completed; detailed evidence is `/tmp/pixel-admission-review-q0hyuywq/review-probes-results.json`:

- Bound structured reselection refused 403, without writes, through desktop, raw and legacy HTTP: three checks.
- Both markers missing after a retained actual 0.2.7 frame: raw and legacy fallback refuse 403 without writes: two checks.
- Both markers missing after a retained desktop gap/ACK: raw and legacy return 200 and persist the forged claim: the two blocker reproductions above. The script explicitly asserts the observed defect, not desired behavior, and saves the committed record.
- Binding without any start grant refuses 403 and makes no changes: one check.

## Other findings and limits

The current implementation appropriately keeps producer selection in trusted host configuration/internal registration, rejects omitted/unknown desktop profiles before opening a transaction, binds exact existing identities/pins/fingerprint, and does not grant consent. Pending propagation and consumed adoption use the existing actor transaction. One-sided marker damage cannot be repaired by repeating binding, and a generic reopen cannot erase an existing restriction. The admission gate is common and is after current lifecycle/original checks but before cached success and archive writes. Existing records and ancestors are not relabelled. Generic contract decoders and structured examples remain unchanged; future legitimate DOM/own-ink/mixed acquisition remains required and separately authorized.

Owner-reported **452 focused cases, PostgreSQL 16 HTTP checks/five groups, and retained hosted Swift fixture composition** are owner evidence only; none is counted as newly observed DB/native/provider acceptance here. Real acquisition, complete mixed-input semantics, provider delivery, permission/disclosure and full desktop product acceptance remain open. No other demonstrated blocker was found within this bounded review. Resolve the gap-witness case, then replay its two focused regressions plus generic compatibility; do not rerun old broad DB/native campaigns solely for this correction.

## Actual correction handoff

Lead sent the same-owner bounded correction as
`handoff_013569487a6150ce5c3ccc092686eecf`, replying to actual delivery
`handoff_ca1db8154128c1140472519cbe86dcb3`. The send was accepted, initially
unread; that does not mean the correction is implemented. Candidate `81e5441`
remains unintegrated until the retained-gap fallback closes. The owner's real
DB/native-fixture evidence remains separate and will not be replayed merely for
this narrow correction.
