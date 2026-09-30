p = "services/api/capture.py"; s = open(p).read()
old = """            received_at = old["received_at"] if old else self.archive._timestamp()
"""
new = """            received_at = old["received_at"] if (old and cached is not None) else self.archive._timestamp()  # MUTATION: a new-key duplicate overwrites retained receive times
"""
assert s.count(old) == 1; open(p, "w").write(s.replace(old, new))
