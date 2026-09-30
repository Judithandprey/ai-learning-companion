# QA-MAC-01 scoped-consistency correction review

**APPROVE** exact Backend `17262c8f441bbd716f290c19efcb1a17576711b9`, parent `daacde7c1f2db6b060967a38fd517abc23424d1b`. No demonstrated blocker. Support releasing this local SHA to the existing QA owner for its conditional changed-case retest before Lead integrates source.

Export: `/tmp/macos-scope-172-review-u1n89ljo`. All seven delivered files match exact Git bytes; hashes are in `/tmp/macos-scope-172-review.json`. Reviewed the complete production delta and real ancestor/read/resolver call paths, the two new test modules and Backend evidence. QA-owned files are unchanged. PONYTAIL LITE reuses the existing checker/transactions and historical QA helpers; no implementation, repository edit, DB, listener, native, provider or broader mutation campaign occurred.

The correction matches the requested boundary:

- `frame_variants.py:89` requires explicit stored targets; complete incoming and targeted descriptors seed both raw/composed image identities. It scans/validates all known retained families and follows artifact-ID, encoded-hash and Mac native-session/path aliases transitively. A matching retained image does not automatically select a different sibling image. A full target descriptor still attests both roles. Unknown/corrupt shapes remain globally fail-closed, including empty image scope.
- `capture.py:346–460` adds a stored ancestor frame only after existing source/incarnation/slot/original/binding checks. Its existing graph walk includes intermediate gaps and all known frame families. Submitted ancestors are covered by proposed complete descriptors; stored ancestors supply explicit dependency targets at the pre-write consistency call. No source/byte/witness check is bypassed. Current authority precedes dependencies and is rechecked before cached/new success.
- `process_context.py:119` supplies the actual validated returned frames. `image_resolver.py:197` supplies the exact stored complete descriptor, regardless of selected decoding role. Their final current-caller checks remain active. Reader selection semantics are unchanged: unselected external parent history is not newly fetched or claimed as attested.
- Relevant retained conflicts remain 503; new contradictory proposals remain 409 unless exact committed replay establishes retained damage. Native session/path remains distinct from cross-family common PNG facts. No global narrowing of old writers, wire/schema change, deletion, metadata repair, persistent index or decoder was introduced.

Seven independent probes passed in **2.17 s** (command wall 2.453 s), against the exact export:

| Probe | Result |
| --- | --- |
| Historical late raw contradiction | Unrelated frame 2 raw/composed and selected Learning packet succeed; actual frame 6, whole-chain cached ACK, mixed read/Learning still refuse; no write |
| Historical late Windows contradiction | Same boundary retained through the Windows writer |
| Historical actor-wide scope observation | Cross-source conflict stays retained; unrelated frame/gap access and parentless gap admission/replay succeed without deleting originals; first Mac gap also succeeds after an unrelated ordinary raw/raw contradiction |
| Pure checker order/sibling boundaries | All six orders preserve sibling non-expansion; all six orders catch transitive alias damage. Explicitly targeting the dual-image sibling still refuses its composed conflict |
| Token revoked immediately after scoped check: cached ingress | 401, no ACK/write |
| Token revoked immediately after scoped check: reader | 401, no detached result/write |
| Token revoked immediately after scoped check: resolver | `revoked`, no bytes/write |

The ordering case uses explicitly synthetic retained descriptor rows; it is not claimed as an ordinary mutation API or an original-byte verification. The three historical QA cases were adapted only in the `/tmp` probe; original QA files were not edited. Actual conflict failures were preserved. Lead separately reports **264 focused checks passed in 15.45 s**; this reviewer did not duplicate that suite or count it as independently executed work.

Reproduce this review's seven checks:

```sh
cd /tmp/macos-scope-172-review-u1n89ljo
PYTHONDONTWRITEBYTECODE=1 PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 \
PYTHONPATH=/tmp/macos-scope-172-review-u1n89ljo:/tmp/macos-scope-172-review-u1n89ljo/tests/e2e \
/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -p no:cacheprovider -v /tmp/macos-scope-172-probes.py
```

Probe source: `/tmp/macos-scope-172-probes.py`; complete result: `/tmp/macos-scope-172-probes.txt`; machine review: `/tmp/macos-scope-172-review.json`.

Retain the documented limits: the in-memory alias walk can be quadratic for long reverse-ordered chains; no archive-scale performance claim was tested. Malformed retained variants still cause global refusal by design. The historical QA suite cannot be labeled wholly passing until its three obsolete scope expectations are explicitly retested. MemoryStore/ASGI evidence does not establish PostgreSQL durability, native Mac, provider receipt, Notability or either desktop core gate.
