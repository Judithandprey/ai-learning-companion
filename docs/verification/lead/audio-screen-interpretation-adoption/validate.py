from pathlib import Path
from collections import Counter
import hashlib, json, re, subprocess, unicodedata

root=Path.cwd()
base='c14b35d147b7d68b2c7f45f418765bcd7a679765'
packet=Path('/mnt/c/Users/ROG/Documents/Codex/2026-09-27/x-o/work/audio-screen-interpretation')
out=Path('docs/verification/lead/audio-screen-interpretation-adoption')
out.mkdir(exist_ok=True)
def git(*args):return subprocess.check_output(['git',*args])
def sha(b):return hashlib.sha256(b).hexdigest()
def stripped(t):return '\n'.join(x for x in t.splitlines() if not x.startswith('> English working derivative:'))
def same(pattern,s,t):
    a,b=Counter(re.findall(pattern,s,re.M)),Counter(re.findall(pattern,t,re.M))
    return {'equal':a==b,'missing':dict(a-b),'extra':dict(b-a)}
checks={}
source=(packet/'audio-screen-interpretation.md').read_text()
adopted=Path('docs/requirements/audio-screen-interpretation.md').read_text()
checks['source_packet_hash']=sha(source.encode())=='8dd09b2f586944950a54faa2058d191c19775a50393033f882d66f5bb7b5b5cf'
checks['integration_request_hash']=sha((packet/'integration-request.md').read_bytes())=='05be45e9b1e6e5f056989fd7b777df3d105aa37850c141d2139ee89ef3b0add0'
sq=re.findall(r'^> .+$',source,re.M);aq=re.findall(r'^> .+$',adopted,re.M)
checks['four_exact_quotes']=len(sq)==4 and sq==aq
def normative(s):return s[s.index('## 2.'):s.index('## 5.')]
checks['all_audio_avtest_clauses_exact']=normative(source)==normative(adopted)
checks['audio_ids_unique_complete']=re.findall(r'^### (AUDIO-\d{2})',adopted,re.M)==[f'AUDIO-{i:02}' for i in range(1,16)]
avrows=re.findall(r'^\| (AVTEST-\d{2}) \|.+?\| (\w+) \|$',adopted,re.M)
checks['twelve_unique_avtest_not_run']=avrows==[(f'AVTEST-{i:02}','not_run') for i in range(1,13)]
manifest=json.loads(Path('docs/requirements/english-translation-manifest.json').read_text())
old_manifest=json.loads(git('show',base+':docs/requirements/english-translation-manifest.json'))
checks['initial_translation_record_preserved']=manifest['history'][0]['record']==old_manifest
ids=r'(?<![A-Za-z0-9_])(?:R\d{2}|A\d{2}|G\d|P\d(?:-\d{2})?|V-[A-Za-z]+|INTENT-[A-Z-]+|Q-[A-Z-]+|D-[A-Z-]+|AUDIO-\d{2}|AVTEST-\d{2})(?![A-Za-z0-9_])'
pairs=[]
for f in manifest['files']:
    sp,tp=Path(f['source_path']),Path(f['translation_path'])
    s,t=sp.read_text(),stripped(tp.read_text())
    c={
        'source_hash':sha(sp.read_bytes())==f['source_sha256'],
        'translation_hash':sha(tp.read_bytes())==f['translation_sha256'],
        'ids':same(ids,s,t),
        'numeric_tokens':same(r'\d+(?:\.\d+)*',s,t),
        'numbered_headings':re.findall(r'^#{2,3} (\d+(?:\.\d+)*)(?=[.\s])',s,re.M)==re.findall(r'^#{2,3} (\d+(?:\.\d+)*)(?=[.\s])',t,re.M),
        'table_shape':[l.count('|') for l in s.splitlines() if l.startswith('|')]==[l.count('|') for l in t.splitlines() if l.startswith('|')],
        'explicit_anchors':re.findall(r'<a id="([^"]+)"',s)==re.findall(r'<a id="([^"]+)"',t),
        'links':same(r'\]\(([^)]+)\)',s,t),
    }
    if f['source_commit']:
        c['source_commit_bound']=sha(git('show',f['source_commit']+':'+str(sp)))==f['source_sha256']
        c['translation_at_bound_commit']=sha(git('show',f['source_commit']+':'+str(tp)))==f['translation_sha256']
    checks[str(tp)]=all(v['equal'] if isinstance(v,dict) else v for v in c.values())
    pairs.append({'source':str(sp),'translation':str(tp),'checks':c})
for p in ['docs/requirements.md','docs/requirements.en.md']:
    t=Path(p).read_text();old=git('show',base+':'+p).decode()
    for kind,pattern,n,newn in [('requirements',r'^- R(\d{2})(?:[:：]| ).*$',59,60),('acceptance',r'^\| A(\d{2}) \|.*$',46,49)]:
        before=old[old.index('## 2.'):old.index('## 3.')] if kind=='requirements' else old
        after=t[t.index('## 2.'):t.index('## 3.')] if kind=='requirements' else t
        oldrows=[l for l in before.splitlines() if re.match(pattern,l)]
        newrows=[l for l in after.splitlines() if re.match(pattern,l)]
        checks[p+'_'+kind+'_old_preserved']=len(oldrows)==n and all(l in newrows for l in oldrows)
        checks[p+'_'+kind+'_unique']=len(newrows)==newn and sorted(int(re.match(pattern,l).group(1)) for l in newrows)==list(range(1,newn+1))
task=Path('docs/tasks.md').read_text();oldtask=git('show',base+':docs/tasks.md').decode()
checks['task_cards_preserved']=re.findall(r'^## (?:P0-\S+|SUP-\S+).*',task,re.M)==re.findall(r'^## (?:P0-\S+|SUP-\S+).*',oldtask,re.M)
checks['all_23_future_task_ids_preserved']=re.findall(r'^\| (P[1-4]-\d{2}) ',task,re.M)==re.findall(r'^\| (P[1-4]-\d{2}) ',oldtask,re.M) and len(re.findall(r'^\| (P[1-4]-\d{2}) ',task,re.M))==23
checks['required_phase_audio_mappings']=all('R60/' in next(l for l in task.splitlines() if l.startswith('| '+phase+' ')) for phase in ['P1-03','P1-04','P3-01'])
trace=Path('docs/requirements-traceability.md').read_text()
checks['sixty_direct_trace_rows']=re.findall(r'^\| R(\d{2})：',trace,re.M)==[f'{i:02}' for i in range(1,61)]
checks['trace_a47_a49_unique']=all(len(re.findall(r'^\| '+a+r' /',trace,re.M))==1 for a in ['A47','A48','A49'])
def anchors(t):
    result=set(re.findall(r'<a\s+(?:id|name)="([^"]+)"',t));seen={}
    for h in re.findall(r'^#{1,6}\s+(.+?)(?:\s+#+)?$',t,re.M):
        h=re.sub(r'<[^>]+>','',h).strip().lower()
        h=''.join(c for c in h if c in '-_ ' or unicodedata.category(c)[0] in 'LN').replace(' ','-')
        n=seen.get(h,0);seen[h]=n+1;result.add(h if not n else h+'-'+str(n))
    return result
changed=set(git('diff',base,'--name-only').decode().splitlines())|set(git('ls-files','--others','--exclude-standard').decode().splitlines())
bad=[];count=0
for name in sorted(changed):
    p=Path(name)
    if p.suffix!='.md':continue
    for target in re.findall(r'(?<!!)\[[^\]\n]+\]\(([^)\n]+)\)',p.read_text()):
        target=target.strip('<>')
        if re.match(r'[a-z]+:',target):continue
        loc,_,frag=target.partition('#');dest=p.parent/loc if loc else p
        if not dest.exists():bad.append([name,target,'missing path'])
        elif frag and not re.match(r'L\d+$',frag) and dest.suffix=='.md' and frag not in anchors(dest.read_text()):bad.append([name,target,'missing anchor'])
        count+=1
checks['local_links_and_anchors']=not bad
checks['only_documentation_paths_changed']=all(p in ['AGENTS.md','CLAUDE.md','TEAM.md'] or p.startswith('docs/') for p in changed)
checks['implementation_unchanged']=not git('diff',base,'--name-only','--','apps','services','packages','tests','scripts','package.json','package-lock.json','pyproject.toml','uv.lock','.github').strip()
checks['diff_check']=subprocess.run(['git','diff','--check'],capture_output=True).returncode==0
result={'base':base,'scope':'Documentation structure/provenance only; semantic review separate; no product acceptance','source_commit_binding':manifest['source_commit'] or 'pending following provenance-only commit','checks':checks,'pairs':pairs,'local_links_checked':count,'broken_links':bad,'all_passed':all(checks.values())}
(out/'checks.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'all_passed':result['all_passed'],'failed':{k:v for k,v in checks.items() if not v},'pair_failures':[{**p,'checks':{k:v for k,v in p['checks'].items() if not(v['equal'] if isinstance(v,dict) else v)}} for p in pairs if not checks[p['translation']]],'broken_links':bad,'local_links_checked':count},ensure_ascii=False,indent=2))
raise SystemExit(0 if result['all_passed'] else 1)
