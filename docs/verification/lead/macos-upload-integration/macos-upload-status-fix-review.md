# Mac upload status correction — bcfda2c

**APPROVE. The demonstrated PUT/POST HTTP-status evidence gap is closed.** Exact candidate `bcfda2c7b5362516135790242767cdb5683a2555`, parent `fb1d1ed3f3f0d35f88367a03551c15ca705f6f12`; all three changed files read. No production source change or new blocking finding.

The stand-in now records every returned reply as its actual `(status, body)` pair, instead of retaining only successful bodies. The fixture writes `replies[index].status`, not a literal200, and the Swift test asserts matching request/reply counts and all200 statuses for its committed success transcript. The Python checker requires status200 on every exchange and adds both originally missing status mutation controls; declared controls rise16→18 and total checker checks22→24.

The original bounded reproduction was rerun against the exact corrected checker with the same **explicitly Python-simulated fixture**, read-only and with in-memory mutations:

- Baseline succeeds with14 verified originals.
- PUT403 plus unchanged success body is refused with the explicit non200 problem.
- POST403 plus unchanged success body is refused with the explicit non200 problem.
- The existing wrong-POST-bearer sensitivity control still refuses.

These four probe groups passed; `ast.parse` and `git diff --check` also passed. No full checker/native suite or Swift execution was performed. Actual-status preservation is confirmed in source and awaits the real hosted Swift fixture; the simulation is not native acceptance.

New probes/results: `/tmp/macos-upload-status-fix-probes.{py,json,log}`. Exact export: `/tmp/macos-upload-bcfda2c-export`. Machine review: `/tmp/macos-upload-status-fix-review.json`. The original failed probe/evidence and simulated manifest are unchanged; no repository or worker source was edited.
