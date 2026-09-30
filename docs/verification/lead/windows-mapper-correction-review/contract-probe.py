"""Only pure released metadata validation of independent mapper outputs."""
from pathlib import Path
from packages.contracts.windows_capture_ingress import decode_request, validate_frame_batch
folder=Path('/tmp/windows-mapper-correction-cases')
files=sorted(folder.glob('*.json'))
assert len(files)==10
for file in files:
    request=decode_request('WindowsFrameBatchRequest',file.read_bytes())
    validate_frame_batch(request,user_id='example-user')
    assert all(r['surface']=='external_app' for r in request['batch']['records'])
print('PASS: 10 independent prepared envelopes satisfy released pure 0.2.9/0.2.10 checks; no file, HTTP, stored-source or provider attestation.')
