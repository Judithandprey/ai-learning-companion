"""Read-only committed log/fixture audit; no DB/socket/subprocess/native/provider."""
import hashlib,json,sys
from pathlib import Path
from unittest.mock import patch
sys.dont_write_bytecode=True
root=Path('/tmp/backend-windows-postgres-ea692bc')
sys.path.insert(0,str(root))

def forbidden(*args,**kwargs):
    raise AssertionError('audit cannot reach external boundary')

with patch('psycopg.connect',forbidden), patch('socket.socket',forbidden), patch('subprocess.Popen',forbidden):
    from services.api.tests.postgres_desktop_runtime_check import scenario
    from services.api.tests.postgres_ingress_http_check import _digest
    raw=(root/'docs/verification/backend/windows-runtime-postgres-run.txt').read_bytes()
    rows=[(kind,json.loads(body)) for kind,body in (line.split(' ',1) for line in raw.decode().splitlines())]
    receipt=next(body for kind,body in rows if kind=='PASS')
    assert [body for kind,body in rows if kind=='CHECK']==receipt['http']
    assert [body for kind,body in rows if kind=='PROCESS_EXIT']==receipt['processes']
    c=scenario(receipt['actor'],windows=True)
    assert receipt['artifacts']==[c.ref,c.composed_ref,c.ink_ref]
    expected={'png_sha256':hashlib.sha256(c.data).hexdigest(),
              'composed_png_sha256':hashlib.sha256(c.composed_data).hexdigest(),
              'editable_ink_sha256':hashlib.sha256(c.ink_data).hexdigest(),
              'frame_sha256':_digest(c.windows_frame),'envelope_sha256':_digest(c.envelope)}
    assert all(receipt[key]==value for key,value in expected.items())
    assert c.data!=c.composed_data and receipt['source']==c.source
    assert len(receipt['http'])==len({r['check'] for r in receipt['http']})==30
    assert len(receipt['groups'])==len(set(receipt['groups']))==6
    assert len(receipt['processes'])==2 and len({p['pid'] for p in receipt['processes']})==2
    assert all(p['host']=='127.0.0.1' and p['returncode']==-15 for p in receipt['processes'])
    assert [p['fresh_consent'] for p in receipt['processes']]==[True,False]
    starts=[i for i,(kind,_) in enumerate(rows) if kind=='PROCESS']
    exits=[i for i,(kind,_) in enumerate(rows) if kind=='PROCESS_EXIT']
    assert starts[0]<exits[0]<starts[1]<exits[1]<len(rows)-1
    assert receipt['cleanup']=='own actor only, completed'
    result={'commit':'ea692bc91b5aff70804d80dbbe52afc4816ca989',
        'scope':'read-only log and synthetic MemoryStore fixture recomputation; real database not accessed',
        'log_sha256':hashlib.sha256(raw).hexdigest(),'http_count':30,'group_count':6,
        'processes':receipt['processes'],'ordered_confirmed_exits_and_cleanup_receipt':True,
        'source_exact':True,'fixture_artifacts_exact':True,'recomputed_hashes':expected,
        'original_bytes':[len(c.data),len(c.composed_data),len(c.ink_data)],
        'dynamic_receipt_descriptor_storage_hashes':'retained author evidence; not independently regenerated from DB'}
Path('/tmp/backend-windows-postgres-review-evidence.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
