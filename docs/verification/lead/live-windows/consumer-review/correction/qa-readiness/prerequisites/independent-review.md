# Bounded QA prerequisite review — d91a326

Hold the unchanged drag helper for one concrete capture-safety correction. The prerequisite evidence itself is consistent, hash-valid, and does not claim a pass.

## Finding: display admission occurs after thumbnail capture

`tests/e2e/windows/qa_visible_drag.mjs:144` launches Electron before the one-display check at `:145` and `:148`. Its earlier generated-page geometry/16-point ownership checks (`:122–124`, `:143`) cover only Edge's display. The released product starts display listing through `control.ts:101–111`; `1755153:apps/windows/src/main/main.ts:150–151` requests thumbnails for **all** displays.

Counterexample: the expected fullscreen generated Edge page occupies the primary 1280×800 DPR2 display, while a second display contains private content. Existing prelaunch checks pass, then Electron captures that second display's thumbnail before the later count check aborts.

Minimal QA-owner correction: fail closed on a fresh native metadata display-count/expected-geometry check before the first Electron launch, recheck immediately before capture, and retain later product checks and coordinated exclusive display ownership. No production edit or execution-policy bypass is required. The recorded run was refused before any app, browser, capture or drag; its zero-capture evidence is unaffected.

## Verified scope

- All **20/20** indexed artifacts match exact Git blob sizes/hashes, including preserved decoded CRLF diagnostics. The only intentionally unindexed changed paths are the hash index itself and the plan.
- All **8/8** source/English hashes match the manifest. Relevant policy/requirement files are unchanged between offline85edcac and assigned4714615.
- Existing scratch source matches **280/280** tracked services/packages files at4714615, with no extras; its0700 directory mode was separately observed. Git hashes do not attest filesystem modes.
- Existing stage matches **70/70** payload files; manifest hash/tree match; before/after receipts are identical. Runtime authenticity remains explicitly unclaimed.
- The exact production binary gate rejects unmatched bytes before state preparation, locking or client creation. Stored 0.160 default-launcher rejection is consistent with the0.158 gate. Lead's later read-only admission of the existing explicit0.158 path is a separate possible prerequisite resolution.
- Real actions remain **0/4**, all NOT_RUN; account/model/quota NOT_READ; voice unused. OS Restricted `-File` refusal is correctly distinguished from approval-review rejection. The original decoded stderr limitation is disclosed.
- The visible driver clears AI connector configuration, checks capture-only mode, uses generated local content and exact-identity cleanup. It is an active capture/input diagnostic, requiring the safety correction above before execution. No scripts were executed in this review; Python AST parsing only.

## Integration note

A read-only three-way plan merge against main `ee1fc22` yields **three conflicts**. Preserve newer all-counted attempts, retired selected-image slot, unused voice slot, and explicit resource release. Current main's early plan sections still say the selected-image slot is HELD; normal cherry-pick does not transfer the untouched retirement notices inherited in QA's parent. Retain those candidate notices in initial Status/Budget and §5 while reconciling the continuation hunks. Leave the newer lead ledger intact.

Artifacts: `hash-audit.json`, `review.json`, `helper-source-review.md`, and `plan-threeway-result.md` in this directory. No repository files were changed by this reviewer.
