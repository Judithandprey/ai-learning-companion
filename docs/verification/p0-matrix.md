# P0 capability matrix

State: 2026-09-28 UTC, after P0 integration da4bb08 and receipt of later review deliveries (not automatically integrated). `Not tested` is not a
failure or supported-platform declaration. All final decisions require concrete
versioned evidence and a preferred/fallback route.

| Gate | Current evidence | Status | Next evidence / fallback |
| --- | --- | --- | --- |
| G1 original-page input | Integrated desktop web probe and actual lead browser checks; six P2 fix delivery cdc354c received, re-review pending | Device not tested | Web probe + real iPad/Pencil course page, iframe/fullscreen/captions; supported pages first, side assistant otherwise |
| G2 native cross-App | iOS research a4841d3 received and statically checked; platform/source review pending; no compiled native app or device test | Not tested | iOS public API matrix and minimal device probe; no global overlay promise |
| G3 audio/video/multi-device | Source/actor/device/time/frame contracts | Not tested | Capture/audio/stop lifecycle probes; mark unavailable tracks and stale frames |
| G4 accounts | Integrated local-test auth/API/MemoryStore budget skeleton; no real OAuth/provider connection or PostgreSQL acceptance | Not connected | Backend skeleton, then real provider auth/refresh/revoke; unavailable connections clearly gated |
| G5 external notes | Original ink/AI layer and revision contracts | Not tested | Real Notability import and OneNote receipt/readback; local original remains authoritative |
| G6 retrieval | Synthetic lexical/metadata baseline reproduced: 50/50 exact and 25/30 fuzzy complete queries; original hashes and restart/rebuild preserved | Incomplete; timestamp fix integrated, real candidate comparison not run | Retain five fuzzy failures; execute same-input Graphiti comparison and real-history recovery. See lead/p0-resume-integration.md |
| G7 process, original-screen notes and restrained help | R51–R59/A30–A46 specify multi-surface input, original-screen annotation, process evidence and Notability flow; R59 clarifies R03/R08/R46–48 | Not implemented / not verified | Verify authorized webpage choices/input, source attribution, shared attempts and actual AI-visible ink separately for web, Windows desktop (P3) and iPad/iPhone native surfaces. Retain capture gaps; own/frozen/side canvases are A45 fallbacks, never R59/A44 proof. A46 also needs original ink/source/AI-layer and actual Notability import evidence; INTENT cases separately test two display modes, purpose correction and final-answer choice without conflating dimensions |

No product provider/API call, course login, purchase, publication or device
installation is implied by contract tests. P0 remains in progress.

Original requirements also need their direct [V- cases](../requirements/original-goal-verification.md)
and [INTENT cases](../requirements/intent-and-decisions.md). Gate prerequisites
are not substitutes for these original behaviors or full phase exits; all new
case definitions remain unexecuted/unaccepted.
