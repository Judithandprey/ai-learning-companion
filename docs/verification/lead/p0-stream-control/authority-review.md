# Process-control authority collection guard — bounded follow-up

Decision: **no blocker; the tiny follow-up correctly closes the reproduced
ControlAuthority collection-type issue.** No main edits were made by this reviewer.
This supplements `/tmp/p0-control-review.md`; it does not repeat or replace the
original control-contract review.

Baseline: committed main `3636dd6db1e337671892d65b8f5d7919d452986a`.
Candidate: only the authority guard in process_control/validation.py, its README
contract statement, and six parameterized cases in test_process_control.py.
The lead's untracked verification output was not modified.

## Cause and correction

Previously `_bound` tested `required in authority.scopes/capabilities` without
checking their runtime types. Dataclass annotations do not enforce those types.
A scalar string could satisfy substring membership and a dict could satisfy key
membership even with false values; a mixed-type frozen set also passed, while
None raised an incidental TypeError.

The candidate checks `type(values) is frozenset` and exact string elements for
both collections before any membership authorization check. Short-circuiting
rejects None and other container types without iterating them. Empty or missing
required exact strings still fail the existing scope/capability checks. Normal
frozen string sets retain their behavior.

All three entry points call this shared `_bound` guard:
`register_stream`, `transition_stream`, and `capture_authority`. No bypass among
those entry points was found. README now accurately states the runtime collection
requirement. The implementation is suitably small and reuses the central check.

## Independent reproduction and checks

Loaded the committed 3636dd6 validation.py into a temporary in-memory module using
read-only `git show`; no checkout/reset or repository file was created. Compared
that code against the candidate using six malformed inputs across all three entry
points (18 calls per version):

- Committed version: **15 accepted**, **0 ValidationError**, **3 TypeError**.
- Candidate: **0 accepted**, **18 ValidationError**, **0 TypeError**.

Inputs were scalar substring scopes, false-valued dict scopes, scalar prefix-like
capabilities, false-valued dict capabilities, a mixed int/string scope frozenset,
and None capabilities. Valid matching frozen string sets successfully created the
control state used by the probes.

Executed:

`PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest -q packages/contracts/tests/test_process_control.py -k 'authority_collections or compatibility_artifacts or local_lifecycle'`

Result: **8 passed, 31 deselected**. These are the six new parameterized tests,
a valid lifecycle/capture-mapping check, and the independent compatibility pins.

`git diff --quiet 3636dd6 -- packages/contracts/schema.json packages/contracts/validation.py packages/contracts/generated packages/contracts/process_v2`

Result: exit 0; the inspected original v1/capture0.2 files remain unchanged.
No full-repository rerun, service/auth-token integration, DB/provider/device test,
or resolution of the older capture-only QA xfails is claimed. Those remain their
existing separate work. No network or other-agent dispatch was used.

Candidate SHA-256:

- process_control/validation.py: `054bbc781905c9a24b36f3891c4791e00dcf847186496695106c5dcc4d7b8398`
- process_control/README.md: `a5ea0885452d5adfaf317b1e4e56b8a09d3ceb8ef7326209f7ff3e1f6145743a`
- tests/test_process_control.py: `6d851e23e644800ba113c82448201b3fca881d6382f79b3622aa27289fbe525b`
