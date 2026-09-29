# Original adapter review reproductions

These preserve the observed failures of Web `096cac1` over main `b494fdf`.
They are fault probes, not product acceptance tests. All credentials are explicit
synthetic stand-ins; no provider or real account is contacted. The Python race
uses the actual ASGI app with MemoryStore, not a PostgreSQL/network race.

In an isolated candidate checkout with that main plus the Web paths, copy the
three scripts to the candidate root. Run the `.mjs` scripts there with the
project pinned Node 24, and `PYTHONPATH=. <project venv python>
review-pending-race.py` for the ASGI case. The scripts use candidate-relative
imports and write their JSON observations beside the scripts / in that cwd.
Their recorded JSON is the original failure evidence; corrections need separate
assertions and results, not edited historical observations.

See [full review](../web-real-adapter-review.md) for expectations and the released
validator's positive and three individual mutation results.
