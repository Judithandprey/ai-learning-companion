p = "services/api/capture.py"; s = open(p).read()
old = """            cached = tx.get("capture_replay", cache_key)
            if cached is not None:"""
new = """            cached = tx.get("capture_replay", cache_key)
            if not cached:
                cached = None  # MUTATION: historical `if cached:` defect, a present {} row is treated as absent
            if cached is not None:"""
assert s.count(old) == 1; open(p, "w").write(s.replace(old, new))
