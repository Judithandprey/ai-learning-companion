p = "services/api/capture.py"; s = open(p).read()
old = """            for replay in tx.scan("capture_replay"):
                if not replay.get("deleted") and replay.get("key", "").startswith(prefixes):"""
new = """            for replay in []:  # MUTATION: gap-receipt downgrade witness removed
                if not replay.get("deleted") and replay.get("key", "").startswith(prefixes):"""
assert s.count(old) == 1; open(p, "w").write(s.replace(old, new))
