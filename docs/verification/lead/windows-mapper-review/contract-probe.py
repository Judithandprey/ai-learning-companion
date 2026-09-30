"""Validate only mapper metadata against exact released contracts; no file or service acceptance."""
from pathlib import Path
from packages.contracts.windows_capture_ingress import decode_request, validate_frame_batch
from jsonschema import ValidationError
root=Path('/tmp/windows-mapper-review-cases')
accepted=0
for file in sorted(root.glob('*.json')):
    try:
        request=decode_request('WindowsFrameBatchRequest',file.read_bytes())
        validate_frame_batch(request,user_id='example-user')
    except ValidationError as exc:
        assert file.name=='source-extra-field.json',(file.name,str(exc))
        assert 'source_timezone' in str(exc)
        print(file.name,'REJECTED:',str(exc).splitlines()[0])
    else:
        assert file.name!='source-extra-field.json'
        print(file.name,'ACCEPTED as declared metadata')
        accepted+=1
assert accepted==9,accepted
print('PASS diagnostic: 9 valid-shaped outputs including 5 corruption cases; 1 extra-source-field output rejected. No file verification or ingestion.')
