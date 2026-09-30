# Engine writes each frame+record+replay-less state as soon as a record is checked (incremental staging) --
# only visible if the store does not roll back; combine with non-atomic store.
p = "services/api/capture.py"; s = open(p).read()
old = """                records.append((record_id, {"canonical_json": canonical, "received_at": received_at}, slot))
"""
new = old + """                if typed_originals and record["frame_id"] is not None:  # MUTATION: incremental staging
                    tx.put("capture_record", record_id, {"canonical_json": canonical, "received_at": received_at})
"""
assert s.count(old) == 1; open(p, "w").write(s.replace(old, new))
exec(open("/tmp/qa-win0210-review-probes/m8_nonatomic.py").read())
