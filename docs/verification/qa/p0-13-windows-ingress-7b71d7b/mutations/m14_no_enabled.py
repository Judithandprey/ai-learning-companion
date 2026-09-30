p = "services/api/domain.py"; s = open(p).read()
old = """        if not state or not state["enabled"]:"""
new = """        if not state:  # MUTATION: disabled account no longer refused by the enabled bit"""
assert s.count(old) == 1; open(p, "w").write(s.replace(old, new))
p = "services/api/ingress_app.py"; s = open(p).read()
old = """            if (state.get("enabled") is not True or type(state.get("generation")) is not int"""
new = """            if (type(state.get("generation")) is not int"""
assert s.count(old) == 1; open(p, "w").write(s.replace(old, new))
