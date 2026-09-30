# Learning Windows retained-image consumer independent review

**APPROVE the bounded source/component delivery. No reproducible blocking defect found.**

Exact candidate: `18faf4f8f21eaebf4384adc99b2deec9b8a00ca6`, parent `a74da93d8f5e0de89dc2dc8e8a8592d561c313f2`, adopting released `d3b4b4779e6bceb7aca0ee0df4c544a22132d61e`. Reviewed in exact export `/tmp/lc-learning-windows-18faf4f`; all five changed files were byte-compared against `git show` successfully. Scope is `services/learning/process_context.py`, `images.py`, `README.md`, `tests/evals/test_windows_process_context.py`, and `docs/verification/learning/p0-05-windows-image-consumer.md`. The actual diff contains only those five files. Main and worker files were not edited. PONYTAIL LITE applied: reuse existing validators and PNG checks; no additional framework or dependency requested.

The current root seam in `docs/verification/lead/windows-contract-review/README.md` was read. Review follows the unchanged affected source/English requirements and decisions; this is not producer acceptance or a new permission grant.

## Source findings

- `process_context.py:224–267` validates each full Windows descriptor and its exact owner/source/version, selected-record original references and device/session/stream before resolving any bytes. Every supplied record is checked, including output-budget omissions. These are proposed-reference checks; they do not manufacture stored-original receipts.
- `images.py:110–135` passes a detached copy of the same complete descriptor, demands the exact available-result role and descriptor, then checks actual bytes/hash/MIME/PNG structure/dimensions/pixel limits. `process_context.py:370–388` also checks the selected original's byte length. Wrong-role, cross-record, missing or malformed images remain explicit separate gaps; no fallback substitutes the other picture.
- `process_context.py:303–344` reserves metadata for both attachments and counts attached bytes separately, including identical aliases. Only binary attachment data is excluded by metadata sizing. A rejected large raw image does not spend the composed image allowance.
- `process_context.py:48–75` freezes and twice reads the same complete ordered selection. Final read errors, changed metadata and cancellation withhold the whole packet even when an affected record was omitted by the output metadata budget. Both `asyncio.CancelledError` and futures cancellation remain propagating boundaries.
- `process_context.py:99–165` preserves requested order, compares validated raw/composed bytes separately, retains unknown comparison for absent composition, and does not convert Windows native readings into Process clocks. Unknown chronology, meaning, reasoning, provider receipt and presentation permission remain explicit.
- The extracted old-image helper preserves legacy behavior and signatures. Independent mixed-family execution exercised legacy 0.1.0, raw 0.2.5, desktop 0.2.7 and Windows 0.2.9 descriptors without manufacturing or changing a descriptor family.

## Executed evidence

From `/tmp/lc-learning-windows-18faf4f`:

```sh
PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python \
  -m pytest -q -p no:cacheprovider tests/evals/test_windows_process_context.py
```

**63 passed in 0.51s**, exit 0. This independently reruns the delivered tests; it is separate from the author's reported 415-test campaign. That broad campaign was not repeated.

Independent executable probes, using existing synthetic fixture builders only for valid inputs and direct calls into candidate production functions:

```sh
PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python \
  /tmp/learning-windows-independent-probes.py /tmp/lc-learning-windows-18faf4f
```

**6 independent synthetic probe groups passed**, exit 0:

1. Paired cross-record descriptor swaps with identical image bytes and correct roles reject every substituted attachment.
2. Large raw/small composed PNGs independently respect image and total budgets, including exact byte accounting.
3. A bad full reference on a later omitted record fails before callbacks; concurrent mutation of caller metadata withholds the packet.
4. Final complete-selection authorization and cancellation include a metadata-omitted record.
5. Mixed four-family historical window preserves old/new resolver signatures, descriptors, byte totals, final selection and unknown clocks.
6. Independently measured metadata stays within admission boundaries across six image-failure states; stale supplied payloads never escape failure statuses.

Probe SHA-256: `80e48831d2c6c3b9c8f95d4743f4d99987d9ea01e3a4fc8f03282d2488a6b49a`.

`git diff --check 18faf4f8^ 18faf4f8` passed. No install, network, repository edit, service, database, native launch, provider call or real acquisition occurred.

## Remaining dependencies and limits

Lead must compose this exact consumer with Backend's actual current-authorized `read_windows` and `resolve_windows(image_role=...)`, including both stored original bindings and current lifecycle/deletion fences. The injected reader/resolver is the authorization boundary; a malicious/cached adapter is not made trustworthy by this consumer. The last preparation recheck is not atomic dispatch or a future permission lease; actual later source/help use needs a fresh check.

Tests use project-authored PNGs and explicitly synthetic metadata/adapters. Renderer RGBA hashes, transformation text, native sample labels and editable-ink references are retained declarations, not independently verified pixel alignment or editable history. Held Windows producer integrity repair, real desktop input, actual AI receipt, both desktop §7.1 gates and full original-source/ink/audio/Notability acceptance remain open. No correction task is requested for this Learning candidate.

## Main integration

Delivery `18faf4f` integrates as `98edf14`. Combined main check of the Windows
consumer and corrected pixel-admission QA passes **84 tests in 2.30s**. This is
63 consumer cases + 21 QA cases, not extra distinct coverage beyond those files.
Actual Backend composition is the next focused integration check; provider stays
disabled and the full product gates remain open.
