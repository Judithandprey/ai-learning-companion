# P0 capability matrix

Initial state: 2026-09-28 UTC, before first module deliveries. `Not tested` is not a
failure or supported-platform declaration. All final decisions require concrete
versioned evidence and a preferred/fallback route.

| Gate | Current evidence | Status | Next evidence / fallback |
| --- | --- | --- | --- |
| G1 original-page input | Contract shapes and explicit input modes only | Device not tested | Web probe + real iPad/Pencil course page, iframe/fullscreen/captions; supported pages first, side assistant otherwise |
| G2 native cross-App | No compiled native app or device test | Not tested | iOS public API matrix and minimal device probe; no global overlay promise |
| G3 audio/video/multi-device | Source/actor/device/time/frame contracts | Not tested | Capture/audio/stop lifecycle probes; mark unavailable tracks and stale frames |
| G4 accounts | Authorization/budget shapes only; no login service | Not connected | Backend skeleton, then real provider auth/refresh/revoke; unavailable connections clearly gated |
| G5 external notes | Original ink/AI layer and revision contracts | Not tested | Real Notability import and OneNote receipt/readback; local original remains authoritative |
| G6 retrieval | Synthetic contract example only | Not evaluated | 30 fuzzy + 50 exact cases, measured baseline and same-input Graphiti candidate comparison |

No product provider/API call, course login, purchase, publication or device
installation is implied by contract tests. P0 remains in progress.
