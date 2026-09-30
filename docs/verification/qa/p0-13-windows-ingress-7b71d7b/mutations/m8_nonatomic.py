p = "services/api/storage.py"; s = open(p).read()
old = """            try:
                yield tx
                self._documents[user_id] = tx.documents
            finally:
                tx.active = False"""
new = """            try:
                yield tx
            finally:
                self._documents[user_id] = tx.documents  # MUTATION: staged writes survive an exception (no rollback)
                tx.active = False"""
assert s.count(old) == 1; open(p, "w").write(s.replace(old, new))
