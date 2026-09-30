p = "services/api/capture.py"; s = open(p).read()
old = """        with self.store.transaction(user_id) as tx:
            if check_retained:
                self._authorized(tx)"""
new = """        with self.store.transaction(user_id) as tx:
            _early = tx.get("capture_replay", cache_key)  # MUTATION: cached success before every in-tx fence
            if request_envelope is not None and isinstance(_early, dict) and _early.get("deleted") is True and set(_early) == {"key", "deleted"}:
                raise DomainError(404, "not_found")
            if request_envelope is not None and isinstance(_early, dict) and _early.get("deleted") is False and _early.get("fingerprint") == request_hash:
                return json.loads(_early["response_json"])
            if check_retained:
                self._authorized(tx)"""
assert s.count(old) == 1; open(p, "w").write(s.replace(old, new))
