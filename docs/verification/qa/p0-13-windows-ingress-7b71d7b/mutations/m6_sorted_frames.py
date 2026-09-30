p = "services/api/capture.py"; s = open(p).read()
old = """            request_hash = hashlib.sha256(encoded).hexdigest()
"""
new = """            request_hash = fingerprint({"batch": batch, "frames": proposed})  # MUTATION: internal sorted frame map replaces ordered envelope
"""
assert s.count(old) == 1; open(p, "w").write(s.replace(old, new))
