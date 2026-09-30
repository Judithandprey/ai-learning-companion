p = "services/api/capture.py"; s = open(p).read()
old = """            request_hash = hashlib.sha256(encoded).hexdigest()
"""
new = """            request_hash = hashlib.sha256(json.dumps(request_envelope).encode()).hexdigest()  # MUTATION: object member order participates
"""
assert s.count(old) == 1; open(p, "w").write(s.replace(old, new))
