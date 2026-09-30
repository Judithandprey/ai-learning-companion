p = "services/api/ingress_app.py"; s = open(p).read()
old = """        def guard(state):
            current = authenticate()
            if current != initial:"""
new = """        def guard(state):
            current = initial  # MUTATION: no under-lock token/expiry recheck
            if current != initial:"""
assert s.count(old) == 1; open(p, "w").write(s.replace(old, new))
