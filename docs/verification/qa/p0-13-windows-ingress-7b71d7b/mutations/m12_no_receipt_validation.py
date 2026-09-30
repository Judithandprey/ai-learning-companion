p = "services/api/capture.py"; s = open(p).read()
start = s.index("                # A present corrupt receipt is never permission to reconstruct")
end = s.index("                if cached[\"fingerprint\"] != request_hash:")
new = """                if cached.get("deleted") is True and set(cached) == {"key", "deleted"}:
                    raise DomainError(404, "not_found")
                response = json.loads(cached["response_json"])  # MUTATION: no deliberate retained-receipt validation
"""
s = s[:start] + new + s[end:]
open(p, "w").write(s)
