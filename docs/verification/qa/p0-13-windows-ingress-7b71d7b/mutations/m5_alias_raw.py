p = "services/api/image_resolver.py"; s = open(p).read()
old = """            picture = frame["raw"] if image_role == "raw" else frame["composed"]["image"]
"""
new = old + """            if image_role == "composed" and picture["artifact"]["sha256"] == frame["raw"]["artifact"]["sha256"]:
                picture = frame["raw"]  # MUTATION: composed alias decoded from the RAW archive ID, never the composed ID
"""
assert s.count(old) == 1; open(p, "w").write(s.replace(old, new))
