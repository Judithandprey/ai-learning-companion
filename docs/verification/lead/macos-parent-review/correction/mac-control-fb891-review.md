# MAC-CONTROL-01 correction — APPROVE within assigned scope

Candidate `fb891d699cc33cde10c2a1fa25928f3c87346b3f`, parent `f625b480e591682be75dd6a7617c08eee4cf7bd6`; exact export `/tmp/lc-macos-parent-fb891d6`. Canonical main at review: `ee30e6889f7d12394020a7eb9123fde38678a742`. Parent journal/Stop and app integration are independently reviewed; this approval is for control-write uncertainty and the necessary consumer branches.

The repair keeps a mutating request unknown after any earlier attempt may have taken effect. A later typed refusal carries status/code without converting the earlier outcome into known non-commit. A matching accepted 200 settles the sender. A first refusal remains refused, a stop before the first attempt sends nothing, and GET refusals intentionally remain definitive for the read itself (`CaptureControl.swift:158–205`).

**Independent results: 9/9, exit 0, empty stderr.** The six previous probe cases are rerun with the repaired expectations; three small checks cover the new carried-404/GET distinction:

| Script | Result |
| --- | --- |
| Lost reply → 401 | unknown, later401/unauthenticated |
| 503 → 403 | unknown, later403/forbidden |
| Malformed200 → 403 | unknown, later403/forbidden |
| First403 | refused, one request |
| Lost reply → exact accepted success | ok |
| Stop before send | notSent, zero requests |
| Lost reply → 404, POST/control0.2.1 | unknown, later404/not_found |
| Lost reply → 404, PUT/source0.2.4 | unknown, later404/not_found |
| Lost reply → 403, GET | refused, no carried write uncertainty |

Every retry preserves exact request body, headers and URL; the probe also verifies attempt counts and carried status/code. Existing failure proofs are unchanged in `docs/verification/lead/macos-parent-review/control-probes/`.

Consumer source review confirms that `CaptureLink` distinguishes initial registration uncertainty from a known registration replay, keeps display-source registration unknown, and acts on carried403/404 as loss of current permission without claiming the earlier write failed. Stop persists the unknown result with later status/code; a carried401 renews the bearer while reusing the same key/body, and `inDoubt` prevents a later refusal from erasing the prior possible commit. These consumer flows are source-reviewed here, not independently native-executed; the parallel link reviewer owns journal/reopen and Stop-flow probes.

Reproduce:

```sh
bash /tmp/mac-control-fb891-probes/run.sh
```

The prior extraction harness is reused. It interprets the exact generic sender, enum, typed-error validator and actual JSON/error helpers; only the sender's private visibility is removed. Scripted transport and an explicit success callback isolate sender settlement. The matching-success probe is **not** a full state-parser or Backend integration test. Toolchain, source hashes, generated probe hashes and old-proof hashes are recorded in `/tmp/mac-control-fb891-probes/source-manifest.json`; six reviewed source/test/report files match the candidate byte-for-byte.

Files: `/tmp/mac-control-fb891-review.json`; `/tmp/mac-control-fb891-probes/prepare.py`, `run.sh`, `probe.swift`, `probe.json`, `probe.stderr`, `source.json`, `source-manifest.json`.

No repository edits, macOS compile, whole test suite, host/socket, GUI, database, native CI or provider run. Owner78declared tests and Linux runs are reported evidence only. Actual Darwin URLSession replay/drop behavior remains unverified, as explicitly recorded by the owner; this Linux scripted sender result does not close it. PONYTAIL LITE: retain the existing sender/consumer model and bounded prior probes, with no new protocol or framework.
