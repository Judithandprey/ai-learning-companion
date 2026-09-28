# Frozen synthetic memory benchmark v1

Every record is project-authored, `origin=synthetic`, `consent_scope=test_only`.
There is no real learner, account, classroom, audio capture, or course history.
Teaching text is English-first; four fuzzy queries deliberately use Chinese
recall clues to expose the untranslated lexical baseline's limitation.

The committed corpus contains 30 primary scenes, two similar distractor episodes
per scene (another project and a later review), five explicit user corrections,
and 600 later repetitive observations. There are 90 immutable source-version
snapshots, 89 synthetic SVG frames, and 875 observations. Source 04 versions one
and two preserve 220/330 ohm handouts separately. Scene 22 has no captured frame;
scene 23 explicitly lacks audio. Scene 15 carries the rare early minus-three
encoder offset. Scenes 27–30 separately record scheduled study, exposure,
self-reported understanding and demonstrated independent application.

SVGs are labeled schematic test illustrations, not screenshots, faithful lecture
diagrams or handwritten originals. This benchmark tests their exact references
and hashes, not visual understanding. Later repeated material is a stressor for
preservation; it is not evidence of actual model-context compression.

- `records.json`: SourceSnapshot / Frame / Observation wire records.
- `originals/`, `artifacts/`, `manifest.json`: original UTF-8 bytes and artifact
  hashes, plus fixed ID-to-artifact references.
- `queries.json`: 50 exact-history and 30 fuzzy/correction queries, with explicit
  user-provided metadata clues. No expected IDs are passed to the retriever.
- `labels.json`: separately authored full evidence anchors and relevance rules.
  Labels were authored before scores and never derived from ranked results.
- `dev_queries.json`: six separate unscored assistant-quote probes. There was no
  parameter search or tuning; textbook BM25 constants were chosen before scoring.

All required evidence must be in Top-5 to count a query as complete. A target is
the tuple `(user_id, source_id, source_version, event_id, frame_id)`. Finding an
identical sentence from a different course/day/speaker/version does not count.
Also report the fraction of required evidence retrieved, so partial failures
remain visible. Null frame IDs are valid labels only for documented media gaps.

Labels have **not** been independently reviewed by a human. Repeated wording can
make queries temporally ambiguous; the intended target is the initial episode,
and Top-5 recall does not establish uniquely correct answer selection. Structured
course/time filters are supplied, not inferred from natural language. These
conditions make this a bounded engineering fixture, not real-world validation.

The committed bytes are the benchmark. `build_fixture.py` and
`evaluation_spec.py` document deterministic authoring; do not regenerate or edit
them to improve the reported scores. New candidate tuning needs a separate
development set, a versioned benchmark, and retained prior failures. The
evaluation records fixture and implementation hashes before scoring.
