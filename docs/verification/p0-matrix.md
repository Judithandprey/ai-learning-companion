# P0 capability matrix

State: 2026-09-28 UTC, after the first learning delivery review. `Not tested` is not a
failure or supported-platform declaration. All final decisions require concrete
versioned evidence and a preferred/fallback route.

| Gate | Current evidence | Status | Next evidence / fallback |
| --- | --- | --- | --- |
| G1 original-page input | Contract shapes and explicit input modes only | Device not tested | Web probe + real iPad/Pencil course page, iframe/fullscreen/captions; supported pages first, side assistant otherwise |
| G2 native cross-App | No compiled native app or device test | Not tested | iOS public API matrix and minimal device probe; no global overlay promise |
| G3 audio/video/multi-device | Source/actor/device/time/frame contracts | Not tested | Capture/audio/stop lifecycle probes; mark unavailable tracks and stale frames |
| G4 accounts | Authorization/budget shapes only; no login service | Not connected | Backend skeleton, then real provider auth/refresh/revoke; unavailable connections clearly gated |
| G5 external notes | Original ink/AI layer and revision contracts | Not tested | Real Notability import and OneNote receipt/readback; local original remains authoritative |
| G6 retrieval | Synthetic lexical/metadata baseline reproduced: 50/50 exact and 25/30 fuzzy complete queries; original hashes and restart/rebuild preserved | Incomplete; delivery needs timestamp fix before integration | Fix fractional-second ordering; independently review labels and execute same-input Graphiti comparison. See lead/p0-learning-review.md |
| G7 process and restrained help | Requirements v1.1 adopted; R51–R58/A30–A41 and P0-08–13 specify the evidence and work | Not implemented / not verified | Independently test external visual and owned-canvas structured paths, preserved steps/gaps, evidence-based diagnosis and all-channel disclosure. Synthetic tests do not certify iPad/Pencil; P1 needs one explicitly supported real iPad path, not every external app |

No product provider/API call, course login, purchase, publication or device
installation is implied by contract tests. P0 remains in progress.
