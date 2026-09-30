"""Execute only the audit's environment/receipt gates on explicit test doubles.
No artifact audit, build, native execution, network, or composition test is performed.
"""
import ast
import copy
import hashlib
import json
from pathlib import Path
import re
import tempfile

REPO = Path('/home/agentsdock/Projects/learning-companion/repo')
AUDIT = REPO / 'docs/verification/lead/macos-ink-originals-integration/artifact-audit.py'
source = AUDIT.read_text()
tree = ast.parse(source)
# Extract exact statements; no duplicate implementation of the admission rules.
env_start = next(i for i,n in enumerate(tree.body) if isinstance(n,ast.Expr) and isinstance(n.value,ast.Call)
                 and len(n.value.args)>1 and isinstance(n.value.args[1],ast.Constant)
                 and n.value.args[1].value == 'Build environment run URL differs')
env_stop = next(i for i,n in enumerate(tree.body[env_start:],env_start) if isinstance(n,ast.Assign)
                and isinstance(n.targets[0],ast.Name) and n.targets[0].id=='build_log')
receipt_start = next(i for i,n in enumerate(tree.body) if isinstance(n,ast.Assign) and isinstance(n.targets[0],ast.Name)
                     and n.targets[0].id=='run' and isinstance(n.value,ast.Call))
receipt_stop = next(i for i,n in enumerate(tree.body[receipt_start:],receipt_start) if isinstance(n,ast.Assign)
                    and isinstance(n.targets[0],ast.Subscript) and isinstance(n.targets[0].slice,ast.Constant)
                    and n.targets[0].slice.value=='anomalies')
compiled = compile(ast.Module(body=tree.body[env_start:env_stop]+tree.body[receipt_start:receipt_stop],type_ignores=[]),str(AUDIT),'exec')
SHA = 'd49d101cd8d378e57ea54da6cb38fb89b80bb72c'
RUN = 36764195464
URL = f'https://github.com/Judithandprey/ai-learning-companion/actions/runs/{RUN}'
STEPS = ['Check and package exact desktop source','Upload available source, checks and development artifacts']

def baseline():
    jobs = [{'name': f'desktop ({platform})', 'status': 'completed', 'conclusion': 'success',
             'url': URL+f'/job/{number}', 'databaseId': number,
             'steps': [{'name': name, 'conclusion': 'success'} for name in STEPS]}
            for platform,number in [('windows',100),('macos',101)]]
    artifacts = [{'name':f'desktop-{platform}-{SHA}-1', 'expired':False,
                  'workflow_run': {'id':RUN,'head_sha':SHA,'head_branch':'main'}} for platform in ['windows','macos']]
    return {'run':{'headSha':SHA,'status':'completed','conclusion':'success','url':URL,'jobs':jobs},
            'artifacts':{'total_count':2,'artifacts':artifacts},
            'environment':f'run={URL}\nattempt=1\n',
            'hosted':{'state':'checks-completed','exit_code':0,'last_phase':'complete',
                      'interactive_runtime_verified':False,'provider_verified':False,'project_signing_performed':False}}

cases=[]
def add(label, mutate, fragment=None): cases.append((label,mutate,fragment))
add('both_platforms_mac_second',lambda x:None)
def mac_only(x):
    x['run']['jobs']=x['run']['jobs'][1:]
    x['artifacts']['artifacts']=x['artifacts']['artifacts'][1:]
    x['artifacts']['total_count']=1
add('mac_only',mac_only)
def attempt_two(x):
    x['environment']=f'run={URL}\nattempt=2\n'
    x['artifacts']['artifacts'][1]['name']=f'desktop-macos-{SHA}-2'
add('both_second_attempt',attempt_two)
add('foreign_run_receipt',lambda x:x['run'].update(url=URL.replace(str(RUN),'1')),'Run receipt URL differs')
add('foreign_repository_receipt',lambda x:x['run'].update(url=URL.replace('Judithandprey','different-owner')),'Run receipt URL differs')
add('foreign_environment_run',lambda x:x.update(environment='run='+URL.replace(str(RUN),'1')+'\nattempt=1\n'),'Build environment run URL differs')
add('duplicate_environment_run',lambda x:x.update(environment=x['environment']+'run='+URL+'\n'),'Build environment run URL differs')
add('invalid_environment_attempt',lambda x:x.update(environment=f'run={URL}\nattempt=01\n'),'Build environment run attempt differs')
def sibling_failed(x):
    x['run']['conclusion']='failure'
    x['run']['jobs'][0]['conclusion']='failure'
add('mac_success_windows_failure',sibling_failed)
add('whole_run_cancelled',lambda x:x['run'].update(conclusion='cancelled'),'Run source/result differs')
add('whole_run_timed_out',lambda x:x['run'].update(conclusion='timed_out'),'Run source/result differs')
add('mac_job_absent',lambda x:x['run'].update(jobs=x['run']['jobs'][:1]),'Expected exactly one macOS hosted job')
add('mac_job_duplicated',lambda x:x['run']['jobs'].append(copy.deepcopy(x['run']['jobs'][1])),'Expected exactly one macOS hosted job')
add('mac_job_failed',lambda x:x['run']['jobs'][1].update(conclusion='failure'),'macOS hosted job did not succeed')
add('foreign_mac_job_run',lambda x:x['run']['jobs'][1].update(url=URL.replace(str(RUN),'1')+'/job/101'),'macOS job run URL differs')
add('mac_required_step_failed',lambda x:x['run']['jobs'][1]['steps'][0].update(conclusion='failure'),'Required hosted step did not succeed')
add('incomplete_artifact_listing',lambda x:x['artifacts'].update(total_count=3),'Artifact receipt listing is incomplete')
add('mac_artifact_absent',lambda x:x['artifacts']['artifacts'][1].update(name=f'desktop-windows-{SHA}-1'),'Expected exactly one macOS artifact')
add('wrong_artifact_attempt',lambda x:x['artifacts']['artifacts'][1].update(name=f'desktop-macos-{SHA}-2'),'Expected exactly one macOS artifact')
def duplicate_artifact(x):
    x['artifacts']['artifacts'].append(copy.deepcopy(x['artifacts']['artifacts'][1])); x['artifacts']['total_count']=3
add('duplicate_mac_artifact',duplicate_artifact,'Expected exactly one macOS artifact')
add('wrong_artifact_run',lambda x:x['artifacts']['artifacts'][1]['workflow_run'].update(id=1),'Artifact source receipt differs')
add('wrong_artifact_sha',lambda x:x['artifacts']['artifacts'][1]['workflow_run'].update(head_sha='0'*40),'Artifact source receipt differs')
add('wrong_artifact_branch',lambda x:x['artifacts']['artifacts'][1]['workflow_run'].update(head_branch='other'),'Artifact source receipt differs')
add('expired_mac_artifact',lambda x:x['artifacts']['artifacts'][1].update(expired=True),'macOS artifact is expired or missing')
add('incomplete_hosted_result',lambda x:x['hosted'].update(state='failed',exit_code=1),'Hosted result incomplete')
add('false_provider_claim',lambda x:x['hosted'].update(provider_verified=True),'Unexpected runtime/provider/signing claim: provider_verified')

results=[]
with tempfile.TemporaryDirectory(prefix='macos-ink-audit-gates-') as tmp:
    p=Path(tmp)
    for label,mutate,fragment in cases:
        case=baseline(); mutate(case)
        for name in ['run','artifacts','hosted']:
            (p/('result.json' if name=='hosted' else name+'.json')).write_text(json.dumps(case[name]))
        issues=[]
        scope={'re':re,'RUN':RUN,'COMMIT':SHA,'RUN_URL':URL,'P':p,'run_path':p/'run.json','artifact_path':p/'artifacts.json',
               'environment':case['environment'],'result':{},'load':lambda path:json.loads(path.read_text()),
               'sha':lambda data:hashlib.sha256(data).hexdigest(),
               'check':lambda ok,message:issues.append(message) if not ok else None}
        exec(compiled,scope)
        if fragment is None:
            assert not issues,(label,issues)
            assert scope['mac_job']['name']=='desktop (macos)'
            assert scope['result']['hosted']['artifact_receipt']['name']==scope['expected_artifact_name']
            assert scope['result']['hosted']['overall_run_conclusion']==case['run']['conclusion']
            assert scope['result']['hosted']['overall_run_success']==(case['run']['conclusion']=='success')
            assert 'not an overall workflow gate pass' in scope['result']['hosted']['evidence_scope']
            if label=='mac_success_windows_failure':
                assert scope['result']['hosted']['sibling_jobs'][0]['name']=='desktop (windows)'
                assert scope['result']['hosted']['sibling_jobs'][0]['conclusion']=='failure'
                assert not scope['result']['hosted']['overall_run_success']
        else:
            assert any(fragment in message for message in issues),(label,fragment,issues)
        results.append({'case':label,'expected':'accept' if fragment is None else 'reject','issues':issues})
        print('PASS',label)
receipt={'scope':'Explicit environment/receipt test doubles only; actual gates extracted via AST, no full artifact or native PASS',
         'audit_sha256':hashlib.sha256(AUDIT.read_bytes()).hexdigest(),'positive':4,'negative':len(cases)-4,'cases':results}
Path('/tmp/macos-ink-audit-correction-probes.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(f'{len(results)} gate cases passed (4 positive, {len(cases)-4} negative)')
