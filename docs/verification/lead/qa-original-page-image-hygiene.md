# QA original-page PNG hygiene review

Commit: `fcc41b8ee2bedb2d5738dedfbbad6a5057a52926`.
Scope: exactly the 19 PNGs below under `docs/verification/qa/p0-07-original-page/component-b8ec18e/`.

Disposition: no image-hygiene blocker found. All 19 images were viewed individually. The 10 captures show the synthetic “Lecture 7: Eigenvalues” course fixture (or its scrolled/shifted view), with a drawn characteristic-polynomial board and generated “Lecture video · frame N” tile. The 9 crops are magenta, white, or a fragment of that synthetic video label. No Wikipedia/public-page pixels, private account content, secrets, credentials, browser address bar, or unrelated application UI are visible. This is a limited visual/metadata conclusion; source ownership and run provenance remain with the parent harness review.

All PNGs contain only IHDR, IDAT and IEND chunks; no text/EXIF/other ancillary metadata was present. Captures are 1246×903; crops are 132×53. Extracted files and metadata remain under `/tmp/qa-original-page-image-hygiene-eci_wpcv/`; repository files were not modified.

Additional consistency check: the first eight retained captures (f11/f3/f5/f6/f7/r1/r2/r3) match summary cases' SHA-256, exact byte length and dimensions. Their seven retained crops decode to exactly the corresponding source rectangle and match the reported rounded RGB mean. The summary's real-timing attempt records for r4/r5 omit exact SHA-256/length fields, so those two capture hashes cannot be independently compared to summary values; this is a verification limit, not a mismatch. Their four PNGs were visually and structurally inspected. No browser, service or network was used.

Reviewed filenames:

- `f11-restart-capture.png`
- `f11-restart-crop.png`
- `f3-region-capture.png`
- `f3-region-crop.png`
- `f5-real-scroll-capture.png`
- `f6-scroll-away-back-capture.png`
- `f6-scroll-away-back-crop.png`
- `f7-content-shift-capture.png`
- `f7-content-shift-crop.png`
- `r1-scroll-away-back-capture.png`
- `r1-scroll-away-back-crop.png`
- `r2-content-shift-capture.png`
- `r2-content-shift-crop.png`
- `r3-style-shift-capture.png`
- `r3-style-shift-crop.png`
- `r4-real-timing-scroll-1-capture.png`
- `r4-real-timing-scroll-1-crop.png`
- `r5-real-timing-style-shift-0-capture.png`
- `r5-real-timing-style-shift-0-crop.png`
