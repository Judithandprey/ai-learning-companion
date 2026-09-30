p = "services/api/capture.py"; s = open(p).read()
old = """                if cached["fingerprint"] != request_hash:
                    raise DomainError(409, "idempotency_conflict")
"""
new = old + """                if request_envelope is not None:
                    return response  # MUTATION: cached success skips dependencies/retained bytes/admission
"""
assert s.count(old) == 1; open(p, "w").write(s.replace(old, new))
