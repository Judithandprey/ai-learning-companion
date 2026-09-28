"""Validate the final documentation increment, not product audio acceptance."""
from pathlib import Path
from collections import Counter
import hashlib,json,re,subprocess,unicodedata
BASE='e3f848c4893bf358443418fd84c08d9a824e9f5b'
PACKET=Path('/mnt/c/Users/ROG/Documents/Codex/2026-09-27/x-o/work/audio-screen-interpretation')
OUT=Path('docs/verification/lead/audio-final-decisions-normalization')
def git(*a):return subprocess.check_output(['git',*a])
def sha(b):return hashlib.sha256(b).hexdigest()
def content(p):return Path(p).read_text()
def pairsame(pattern,s,t):
 a,b=Counter(re.findall(pattern,s,re.M)),Counter(re.findall(pattern,t,re.M));return {'equal':a==b,'missing':dict(a-b),'extra':dict(b-a)}
def strip(t):return '\n'.join(l for l in t.splitlines() if not l.startswith('> English working derivative:'))
checks={};details=[]
history=content('docs/requirements/history/audio-screen-discussion-2026-09-28.md')
audio=content('docs/requirements/audio-screen-interpretation.md')
inputs={p.name:sha(p.read_bytes()) for p in PACKET.glob('*.md')}
quotes=[]
for name in ['audio-screen-interpretation.md','live-microphone-routing-clarification.md','normalize-final-decisions-request.md']:
 quotes+=re.findall(r'^> (.+)$',(PACKET/name).read_text(),re.M)
checks['all_current_input_quotes_in_history']=bool(quotes) and all(('> '+q) in history for q in quotes)
checks['supplied_history_quotes_preserved']=re.findall(r'^> (.+)$',(PACKET/'proposed-discussion-history.md').read_text(),re.M)==re.findall(r'^> (.+)$',history,re.M)
checks['no_chronological_quotes_in_active_audio']=not re.findall(r'^> ',audio,re.M)
checks['stable_audio_ids']=re.findall(r'^### (AUDIO-\d{2})',audio,re.M)==[f'AUDIO-{i:02}' for i in range(1,16)]
checks['twelve_avtest_not_run']=re.findall(r'^\| (AVTEST-\d{2}) \|.*?\| (\w+) \|$',audio,re.M)==[(f'AVTEST-{i:02}','not_run') for i in range(1,13)]
oldaudio=git('show',BASE+':docs/requirements/audio-screen-interpretation.md').decode()
old_av=[l.split('|')[2].strip() for l in oldaudio.splitlines() if l.startswith('| AVTEST-')]
new_av=[l.split('|')[2].strip() for l in audio.splitlines() if l.startswith('| AVTEST-')]
checks['original_av_scenarios_retained']=len(old_av)==len(new_av)==12 and all(a in b for a,b in zip(old_av,new_av))
checks['positive_acoustic_case']=all(s in next(l for l in audio.splitlines() if l.startswith('| AVTEST-09')) for s in ['paired examples','transcript-only','human-reviewed','predetermined winner'])
manifest=json.loads(content('docs/requirements/english-translation-manifest.json'))
provenance=manifest['incremental_provenance'][-1]
checks['latest_input_hashes_match_manifest']=provenance['normalization_request_sha256']==inputs['normalize-final-decisions-request.md'] and provenance['microphone_clarification_sha256']==inputs['live-microphone-routing-clarification.md']
previous=json.loads(git('show',BASE+':docs/requirements/english-translation-manifest.json'))
checks['prior_provenance_preserved']=manifest['history'][:-1]==previous['history'] and manifest['history'][-1]['record']=={k:v for k,v in previous.items() if k!='history'}
ids=r'(?<![A-Za-z0-9_])(?:R\d{2}|A\d{2}|G\d|P\d(?:-\d{2})?|V-[A-Za-z]+|INTENT-[A-Z-]+|Q-[A-Z-]+|D-[A-Z-]+|AUDIO-\d{2}|AVTEST-\d{2})(?![A-Za-z0-9_])'
for f in manifest['files']:
 sp,tp=Path(f['source_path']),Path(f['translation_path']);s,t=sp.read_text(),strip(tp.read_text())
 c={'source_hash':sha(sp.read_bytes())==f['source_sha256'],'english_hash':sha(tp.read_bytes())==f['translation_sha256'],'ids':pairsame(ids,s,t),'numbers':pairsame(r'\d+(?:\.\d+)*',s,t),'links':pairsame(r'\]\(([^)]+)\)',s,t),'numbered_headings':re.findall(r'^#{2,3} (\d+(?:\.\d+)*)(?=[.\s])',s,re.M)==re.findall(r'^#{2,3} (\d+(?:\.\d+)*)(?=[.\s])',t,re.M),'table_shape':[l.count('|') for l in s.splitlines() if l.startswith('|')]==[l.count('|') for l in t.splitlines() if l.startswith('|')],'explicit_anchors':re.findall(r'<a id="([^"]+)"',s)==re.findall(r'<a id="([^"]+)"',t)}
 if f['source_commit']:
  c['git_source_binding']=sha(git('show',f['source_commit']+':'+str(sp)))==f['source_sha256']
  c['git_english_binding']=sha(git('show',f['source_commit']+':'+str(tp)))==f['translation_sha256']
 checks[str(tp)]=all(v['equal'] if isinstance(v,dict) else v for v in c.values());details.append({'source':str(sp),'english':str(tp),'checks':c})
for p in ['docs/requirements.md','docs/requirements.en.md']:
 s=content(p);old=git('show',BASE+':'+p).decode()
 requirements=lambda x:{int(m.group(1)):l for l in x[x.index('## 2.'):x.index('## 3.')].splitlines() if (m:=re.match(r'^- R(\d{2})(?:[:：]| )',l))}
 before,after=requirements(old),requirements(s)
 checks[p+'_R_ids']=set(after)==set(range(1,61)) and all(before[n]==after[n] for n in range(2,60))
 ac=lambda x:{int(m.group(1)):l for l in x.splitlines() if (m:=re.match(r'^\| A(\d{2}) \|',l))}
 before,after=ac(old),ac(s)
 checks[p+'_A_ids']=set(after)==set(range(1,50)) and all(before[n]==after[n] for n in range(1,47))
 checks[p+'_old_microphone_rule_removed']=('同一时刻指定一个主麦克风' not in s and 'Assign one primary microphone and one playback device at a time' not in s and '主麦克风角色唯一' not in s and 'the primary-microphone role is unique' not in s)
 checks[p+'_reported_target']=all(v in s for v in ['iPad Pro 13-inch (M5)','iPadOS 26.5','dualRoute'])
 switch_clause='Let the user switch the primary interaction input and AI playback device among supported, authorized routes.' if p.endswith('.en.md') else '用户可在支持且已授权的路线间切换主要交互输入和 AI 播音设备。'
 checks[p+'_primary_device_switch_preserved']=switch_clause in s
task=content('docs/tasks.md');oldtask=git('show',BASE+':docs/tasks.md').decode()
checks['same_task_cards']=re.findall(r'^## (?:P0-\S+|SUP-\S+).*',task,re.M)==re.findall(r'^## (?:P0-\S+|SUP-\S+).*',oldtask,re.M)
checks['same_23_phase_rows']=re.findall(r'^\| (P[1-4]-\d{2}) ',task,re.M)==re.findall(r'^\| (P[1-4]-\d{2}) ',oldtask,re.M)
checks['matrix_statuses_unchanged']=all(json.loads(content(p))['rows']==json.loads(git('show',BASE+':'+p))['rows'] for p in ['docs/verification/platform/p0-03-capability-matrix.json','docs/verification/platform/p0-11-g7-matrix.json'])
def anchors(t):
 result=set(re.findall(r'<a\s+(?:id|name)="([^"]+)"',t));seen={}
 for h in re.findall(r'^#{1,6}\s+(.+?)(?:\s+#+)?$',t,re.M):
  h=re.sub(r'<[^>]+>','',h).strip().lower();h=''.join(c for c in h if c in '-_ ' or unicodedata.category(c)[0] in 'LN').replace(' ','-');n=seen.get(h,0);seen[h]=n+1;result.add(h if not n else h+'-'+str(n))
 return result
changed=set(git('diff',BASE,'--name-only').decode().splitlines())|set(git('ls-files','--others','--exclude-standard').decode().splitlines())
bad=[];count=0
for p in sorted(changed):
 if not p.endswith('.md'):continue
 for target in re.findall(r'(?<!!)\[[^\]\n]+\]\(([^)\n]+)\)',content(p)):
  target=target.strip('<>')
  if re.match(r'[a-z]+:',target):continue
  loc,_,frag=target.partition('#');dest=Path(p).parent/loc if loc else Path(p)
  if not dest.exists():bad.append([p,target,'missing'])
  elif frag and not re.match(r'L\d+$',frag) and dest.suffix=='.md' and frag not in anchors(dest.read_text()):bad.append([p,target,'anchor'])
  count+=1
checks['local_links_and_anchors']=not bad
checks['only_docs_changed']=all(p.startswith('docs/') or p in ['AGENTS.md','CLAUDE.md','TEAM.md'] for p in changed)
checks['diff_check']=subprocess.run(['git','diff','--check'],capture_output=True).returncode==0
result={'base':BASE,'source_binding':manifest['source_commit'] or 'pending content commit stamp','scope':'Documentation consistency; no product/device/provider acceptance','input_sha256':inputs,'checks':checks,'pairs':details,'local_links_checked':count,'broken_links':bad,'all_passed':all(checks.values())}
(OUT/'checks.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'all_passed':result['all_passed'],'failed':[k for k,v in checks.items() if not v],'pair_failures':[{**p,'checks':{k:v for k,v in p['checks'].items() if not (v['equal'] if isinstance(v,dict) else v)}} for p in details if not checks[p['english']]],'broken_links':bad,'links_checked':count},ensure_ascii=False,indent=2))
raise SystemExit(0 if result['all_passed'] else 1)
