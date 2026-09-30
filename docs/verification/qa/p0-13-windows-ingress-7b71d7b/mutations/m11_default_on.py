import re
for p in ("services/api/ingress_app.py", "services/api/capture_app.py", "services/api/capture_runtime.py"):
    s = open(p).read()
    n = s.count("enable_windows_ingress=False")
    assert n >= 1, p
    s = s.replace("enable_windows_ingress=False", "enable_windows_ingress=True")  # MUTATION: route default ON
    open(p, "w").write(s); print(p, n)
