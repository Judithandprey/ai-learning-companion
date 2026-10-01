# QA-WIN-05 notification correction evidence

**APPROVE this narrow evidence followup.** Delivery `d295a514b531e7fae5ad35df10b4bc10b43bf742`, code `44fbd503bcbc45f4f3b28ff52d78e379ddbaf8c9`, parent `10cbae629b6d7330e0da61b5668c43e338d00a97`. The other reviewer owns behavioral acceptance of the rollback notification fix.

- All **57 executed-file SHA-256 receipts** match exact candidate Git blobs.
- `linux-focused-correction.txt` hash `cc30461f2f2a4edabd733199295cbc94b800b766dcbe6fc06486086afeb10f8b` matches its receipt. Recounted **78 named passes / 78 tests**, zero failures, cancellations or skips; duration 40232.801499 ms. Recorded runtime `node v24.21.0 linux-x64`, released Backend/main `f2c883d98912744300c300245ed23824e63bbcbb`. These are author Linux results, not new independent execution.
- Historical `linux-focused.json` and `linux-focused.txt` from `d6f4e20` remain byte-identical. Their 94-test result was not relabeled or replaced.
- Production delta is only the additional status notification after restoring the job to `not_sent` on save failure; one regression was added in `capture-link-record.test.ts`. UI renderer/preloads/main and delivery-vs-code Windows trees are unchanged. The stale current-flow “not storing now” phrase is corrected to “storage is not confirmed now”.

No new defect in evidence identity or scope. No tests, build, Windows GUI, DB, provider, network or source mutation performed. Actual changed Windows behavior remains NOT_RUN; prior independent QA results retain their original scope.

Machine details: `/tmp/windows-win05-correction-evidence.json`.
