# Stages the exact files for the Windows parse/compile-only check: the candidate's runner and checker, the prepared
# fixture check, and every literal C# block (Add-Type @' ... '@) of the runner and the checker, deduplicated by content.
import hashlib, json, os, re, sys, uuid
cand, fixture, outroot = sys.argv[1], sys.argv[2], sys.argv[3]
d = os.path.join(outroot, 'lc-qa-parse-' + uuid.uuid4().hex)
os.mkdir(d)
sha = lambda b: hashlib.sha256(b).hexdigest()
staged = {}
for src, name in [(os.path.join(cand, 'runner.ps1'), 'runner.ps1'), (os.path.join(cand, 'admission-checker.ps1'), 'admission-checker.ps1'), (fixture, 'overlay-fixture-check.ps1')]:
    b = open(src, 'rb').read(); open(os.path.join(d, name), 'wb').write(b); staged[name] = {'from': src, 'sha256': sha(b)}
blocks = {}
for name in ['runner.ps1', 'admission-checker.ps1']:
    text = open(os.path.join(cand, name), encoding='utf-8').read()
    for m in re.finditer(r"^Add-Type @'\n(.*?)\n'@\n", text, re.S | re.M):
        body = m.group(1)
        cls = re.search(r'public (?:static |sealed )?class (\w+)', body).group(1)
        h = sha(body.encode('utf-8'))
        blocks.setdefault(h, {'first_class': cls, 'in': []})['in'].append(name)
for i, (h, info) in enumerate(sorted(blocks.items(), key=lambda kv: kv[1]['first_class'])):
    fn = 'cs-%02d-%s.cs' % (i, info['first_class'])
    body = None
    for name in info['in']:
        text = open(os.path.join(cand, name), encoding='utf-8').read()
        for m in re.finditer(r"^Add-Type @'\n(.*?)\n'@\n", text, re.S | re.M):
            if sha(m.group(1).encode('utf-8')) == h: body = m.group(1)
    open(os.path.join(d, fn), 'w', encoding='utf-8').write(body)
    staged[fn] = {'sha256_of_literal': h, 'first_class': info['first_class'], 'in': info['in']}
print(json.dumps({'folder': d, 'staged': staged}, indent=1))
