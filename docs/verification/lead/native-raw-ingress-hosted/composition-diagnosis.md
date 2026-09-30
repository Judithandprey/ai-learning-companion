# Native fixture composition diagnosis

**Resolved: harness expectation error; no product defect demonstrated.** After correcting only the `/tmp` harness, both actual downloaded Swift request fixtures pass the production ASGI → MemoryStore → current reader/resolver → Learning path against exact main `81b7e182550d9f70ddc3bf4357bbab935488d6ea`. Product source and native fixtures were not edited.

## Failed evidence retained

The original script SHA-256 is `8e2d472dd28b073cb7840b2f8fdbb54b33c09826b3f9a74d1cbb25c56136ac9e`. Its unchanged copy is `/tmp/native-fixture-composition-diagnosis-bsitctu_/native-fixture-http-composition.before.py`. I reproduced the reported failure using the actual downloaded fixture directory, retaining the nonzero exit and line-174 AssertionError in `before.stderr`; `before.stdout` and the complete argv in `before-command.json` are preserved beside it. Root's first failed observation is not overwritten or reclassified as a pass.

Cause: `services/learning/process_context.py:167` intentionally constructs `packet.batch` **without** `records`; complete records are placed in ordered `packet.items` at line 181. The harness incorrectly compared that metadata-only dictionary to the reader's full ProcessBatch. The left side of the combined assertion failed before the count check. The corrected run proves counts remain exactly supplied=1, included=1, omitted=0 for each case, before and after Stop.

## Minimal correction

```diff
--- native-fixture-http-composition.before.py
+++ native-fixture-http-composition.py
@@ -171,7 +171,10 @@

         packet = prepare_stored_process_context(ids, traced_read, resolver.resolve_raw, user_id=USER)
         assert len(reads) == 2 and reads[0] == reads[1] == ((ids,), {'max_metadata_bytes': 4 * 1024 * 1024})
-        assert packet['batch'] == snapshot['batch'] and packet['counts'] == {'supplied': 1, 'included': 1, 'omitted': 0}
+        # Learning keeps batch metadata here; complete records live in ordered items.
+        assert packet['batch'] == {k: v for k, v in snapshot['batch'].items() if k != 'records'}
+        assert [item['record'] for item in packet['items']] == snapshot['batch']['records']
+        assert packet['counts'] == {'supplied': 1, 'included': 1, 'omitted': 0}
         assert len(packet['items']) == 1
         item = packet['items'][0]
         assert item['record'] == record and item['frame'] == frame and item['source'] == descriptor
```

This is not a weakened no-loss assertion: exact metadata equality is now checked in its intended location, and a new whole ordered record-list equality checks that every reader record survives in the corresponding Learning item. Existing exact per-item record/frame/source comparisons, PNG bytes/hash/length, one-item count, double current metadata read, unapplied orientation, unknown capture UTC/course position and honest permission flags all remain enforced.

## Actual rerun

```sh
cd /home/agentsdock/Projects/learning-companion/repo
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python /tmp/native-fixture-http-composition.py \
  /tmp/lead-native-raw-ingress-36677566096/extracted/raw-frame-ingress-fixtures \
  --repo "$PWD" \
  --fixture-provenance 'actual hosted run 36677566096; downloaded fixtures; main 81b7e18'
```

Result: **PASS, 2 native-fixture request cases**. This run actually sent each fixture's exact PUT body and raw request bytes/key through the in-process composed production handler; checked the verified-only ACK and exact replay after ASGI-object recreation; retrieved and resolved the original bytes; prepared complete Learning context; then performed unknown-boundary Stop, observed replay refusal, and re-read identical authorized history/context. Each case used its own MemoryStore and explicitly fixed synthetic account/device/session/membership/start facts.

| Case | Native manifest provenance | Original PNG bytes | Original SHA-256 |
| --- | --- | ---: | --- |
| live | posted by native check | 291 | `ab89c6d23de2e7e580b8abe9f5c4318d06208cf4795d14e1ca191923ea54d361` |
| historical-unknown-clock | built/enqueued by native check, not posted there; posted by this ASGI composition | 290 | `53d8152de8a37d4a953726323097ade5a8e46453c830843fbabcf92fc507d6a6` |

The historical reader wrapper remains historical; it is not falsely equated with the original transport batch ID/delivery mode. Unknown producer Stop boundary permits retained reads but grants no new historical ingestion. Full frame equality preserves all incoming orientation/timing metadata; no native field or image is normalized to make this pass.

## Artifacts and limits

- Structured result: `/tmp/native-fixture-http-composition-result.json`, SHA-256 `be95762475c221aa681a3a768c5ec95d052c8d3b878d32b45f5c121c11f4b417`. Includes main SHA, fixture file hashes, production module hashes, per-case original/PUT/request hashes and explicit synthetic-authority/runtime labels.
- Corrected executable: `/tmp/native-fixture-http-composition.py`, SHA-256 `89614fdf749c86764206bf70865d6f1131ce8ee8d0827f65531f25691d5f978f`.
- Diff, exact after argv, successful stdout and empty after stderr: `/tmp/native-fixture-composition-diagnosis-bsitctu_/script-fix.diff`, `after-command.json`, `after.stdout`, `after.stderr`.
- Manifest SHA-256: `010737d74737b2c50ce2f83d27fd56c0ad3eff7cf34680ace2ab48a465da7f82`. The script rehashed every consumed fixture after execution and found it unchanged.

This is actual composition of downloaded native-check output with real production handlers/readers/Learning in memory. I did not rerun Swift/Xcode; root separately owns hosted compiler/artifact provenance. Synthetic native-check PNGs and synthetic local authorization do not prove ReplayKit device capture, actual user registration/consent, network deployment, PostgreSQL, provider receipt, AI understanding, fresh live capture or §7.1 acceptance. No DB, listener, network/provider call or broader campaign was run.
