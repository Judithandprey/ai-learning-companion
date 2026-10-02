# Mac live correction integrated; native build next

2026-10-02. Actual `handoff_9902e766057d402806f72ee16a489a4a` delivers
`29bdeb4de9c926148262098ed6b4015ed62ee404` after `4f6c327` and `3147291`.
Reviewed native leaves integrate normally as **495ab39 / 61f221a / b422391**.
The complete `apps/macos/CompanionDesktop` tree matches the reviewed owner tree
`0670e70e1de2fa5136c0eba3db1137338c478e22` exactly. No shared wire or dependency,
mobile source, managed account, native TTS import or runtime setting changed.

## Review and checks

MAC-LIVE-03 closes at source/portable-regression scope. The prior failed paired
probe now permits a valid frame-N answer after healthy frame N+1 while retaining
its original frame/ink/response attribution. True blank/source loss and Stop still
refuse first display. The correction distinguishes current-input eligibility
from the authority to present an already-submitted answer; it also drains a newer
waiting observation after refusing an obsolete render. Strict current-frame write
admission and all permanent authority gates remain in place.

- [Independent lifecycle review](lifecycle-review.md): **9/9 passed**, zero failures,
  exit0. The unchanged original paired probe, actual-controller response-receipt
  to first-display pair, five touched-path regressions and two Stop controls are
  in [raw output](focused.txt) with [source binding](source-manifest.json).
- [Independent source review](review.md): exact Freshness classifier **15/15 passed**,
  exit0, including unknown/unretained/lost/stopped negatives. [Raw output](freshness-classifier.txt).
- [Hash audit](hash-audit.json): 58 owned, nine released and eight translation
  inputs match; 50 overall/19 frame-answer/24 interface checksums match; all128
  prior correction files and127 prior checksums remain unchanged. The five original
  failure artifacts, owner replay and public-interface compiler inputs remain bound.
- Integrated main [live fixture validator](main-validator.txt): **211 checks** over
  10 generated lines/six synthetic turns pass. This checks the actual local released
  contract and context preparation, not provider inference or screen capture.
- Integrated runner [three focused tests](main-ci-checks.txt) pass, including missing,
  bad and failed live-fixture validation while retaining failure artifacts. Shell
  syntax passes. These exercise orchestration with fake native tools.

The owner's42 checks remain separately attributed. These independent runs use
Linux Apple/UI stand-ins and synthetic connector answers; they do not establish
native macOS compilation or interactive acceptance. Original failed runs remain
in correction-01 and the owner evidence. The retained replay files identify the
exact original sources/toolchain; temporary toolchain paths are not promised to
survive. No unchanged broad suite was repeated locally.

## Native build and remaining gates

Lead applies the previously reviewed pending patch to the existing desktop CI:
run the live fixture producer inside the native suite, validate it with the
released Python contract, retain its bytes/checksums and fail on missing/bad output.
The existing macOS-only workflow will compile/package this integrated source and
execute the **156 declared** native methods. That count is a declaration until an
actual completed run and artifact audit establish the result. The adapted existing
[auditor](../native-build/audit.py) verifies all artifact/source bytes, method sets,
App package and ASK/live fixture results; it has only been syntax-checked so far.

Lead owns exact-source CI and resulting failures. Native next handles a concrete
native build/candidate defect if one appears; no duplicate feature or mobile
campaign is assigned. Interactive Mac/capture/permission/pen/audio/real-AI gates
remain open. Windows QA separately prepares its one offline driver correction;
its previous account/display allocation is explicitly released with zero usage.
