#!/usr/bin/env python3
"""Bounded checker probes. Python-created association, NOT new Swift output or native tests.
Uses immutable bytes from the previously audited Swift fixture; creates all modifications under /tmp.
"""
from pathlib import Path
import copy
import hashlib
import importlib.util
import json
import sys
import tempfile

ROOT = Path('/tmp/lc-macos-ink-89')
AUDITED = Path('/tmp/lc-macos-36752548728/macos-retained-frame-fixture')
sys.path.insert(0, str(ROOT))
spec = importlib.util.spec_from_file_location('candidate_checker', ROOT / 'apps/macos/CompanionDesktop/checks/validate_mac_retained_frames.py')
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)
manifest = json.loads((AUDITED / 'manifest.json').read_bytes())
native = AUDITED / manifest['native_session']
status, kept, outcomes, filters, ended, streams = c.native_session(native)
item = copy.deepcopy(next(x for x in manifest['cases'][0]['mapping']['described'] if x['callback_sequence'] == 6))
composed = copy.deepcopy(c.single_composed(outcomes, kept)[6])
content = (native / 'ink/ink.json').read_bytes()
document = json.loads(content)
sha = hashlib.sha256(content).hexdigest()
original = {'status': 'retained', 'file': f'ink-originals/{sha}.json', 'sha256': sha, 'byteLength': len(content),
            'mediaType': 'application/json', 'reused': False, 'documentFile': composed['ink']['document']['file'],
            'createdInSession': document['createdInSession'], 'documentRevision': document['revision'], 'frozenHost': 106.7,
            'pairedRevision': composed['ink']['revision'], 'pendingGesture': False, 'pendingAskRegion': False,
            'limits': [c.ORIGINAL_BASE_LIMIT, c.ORIGINAL_REOPENED_LIMIT]}
composed['inkOriginal'] = original
binding = {'contract_version': '0.2.2', 'kind': 'editable_ink', 'source': copy.deepcopy(item['frame']['source']),
           'artifact': {'artifact_id': 'synthetic-review-ink', 'sha256': sha, 'byte_length': len(content), 'media_type': 'application/json'}}
item['ink_original_bindings'] = [binding]
results = []
def note(group, **facts):
    results.append({'group': group, **facts})
    print('PASS', group)

def must_refuse(got, text):
    assert any(text in s for s in got), (text, got)

with tempfile.TemporaryDirectory(prefix='macos-ink-89-checker-') as path:
    session = Path(path)
    (session / 'ink-originals').mkdir()
    target = session / original['file']
    target.write_bytes(content)
    assert c.ink_original_problems(item, composed, session) == []
    c.validate_original('OriginalArtifactBinding', binding)
    batch, record_id = c.batch_for(item['frame'])
    batch['records'][0]['artifacts'].append(copy.deepcopy(binding['artifact']))
    c.validate_binding(batch, record_id, item['frame'], manifest['display_source'], item['bindings'])
    assert 'ink_original_bindings' not in item['frame']
    note('positive_existing_wire_seam', bytes=len(content), snapshot_revision=document['revision'],
         paired_revision=original['pairedRevision'], source='existing audited Swift bytes; new association/binding synthetic')

    expected = {
      'one byte of the file changed': 'recorded SHA-256 and length',
      "the binding's SHA-256 changed": 'binding does not name exactly',
      'the binding given as a screen image': 'refused by the released contract',
      'the binding dropped': '0 editable_ink bindings',
      'the binding given twice': '2 editable_ink bindings',
      'the paired revision changed': 'not the frozen document',
      'the document revision changed': 'not the frozen document',
      'a limitation dropped': 'limitations are not',
      'the pending-gesture flag flipped': 'limitations are not',
      'the pending ASK region flag flipped': 'limitations are not',
    }
    controls = []
    for label, changed_item, changed, reader in c.ink_original_controls(item, composed, session):
        got = c.ink_original_problems(changed_item, changed, session, reader)
        fragment = expected.get(label, 'does not give the frame\'s strokes' if label.startswith('operation ') else '')
        assert fragment, label
        must_refuse(got, fragment)
        controls.append({'control': label, 'expected_fragment': fragment, 'actual': got})
    assert len(controls) == 11
    note('candidate_negative_controls_with_reason_specificity', controls=controls)

    checks = []
    for change in ['foreign_source', 'other_document_file', 'other_created_session', 'negative_paired_revision']:
        i, p = copy.deepcopy(item), copy.deepcopy(composed)
        if change == 'foreign_source':
            i['ink_original_bindings'][0]['source']['source_id'] = 'other-source'
            fragment = 'binding does not name exactly'
        else:
            key, value = {'other_document_file': ('documentFile', 'other/ink/ink.json'),
                          'other_created_session': ('createdInSession', 'other-session'),
                          'negative_paired_revision': ('pairedRevision', -1)}[change]
            p['inkOriginal'][key] = value
            fragment = 'not the frozen document'
        got = c.ink_original_problems(i, p, session)
        must_refuse(got, fragment)
        checks.append({'control': change, 'actual': got})
    target.write_bytes(content[:-1] + bytes([content[-1] ^ 1]))
    must_refuse(c.ink_original_problems(item, composed, session), 'recorded SHA-256 and length')
    target.write_bytes(content)
    note('independent_binding_and_actual_bytes_negatives', controls=checks, actual_file_byte_flip_refused=True)

    forms = [
        ('legacy_unknown', None, composed['ink']),
        ('unavailable', {'status': 'unavailable', 'problem': 'synthetic refusal', 'pairedRevision': 2,
                         'limits': [c.ORIGINAL_UNAVAILABLE_LIMIT]}, composed['ink']),
        ('no_document', {'status': 'no_document', 'limits': [c.NO_DOCUMENT_LIMIT]}, {'document': None, 'revision': None, 'strokes': []}),
    ]
    for label, o, ink in forms:
        p = {'ink': ink}
        if o is not None: p['inkOriginal'] = o
        i = dict(item, ink_original_bindings=[])
        assert c.ink_original_problems(i, p, session) == [], label
        must_refuse(c.ink_original_problems(item, p, session), 'without a retained ink original')
    note('status_no_false_empty_or_binding', statuses=[x[0] for x in forms], checks=6)

    synthetic_outcomes = copy.deepcopy(outcomes)
    synthetic_outcomes[6][0][1]['composed'] = composed
    facts = c.expected_unrepresented(session, status, kept, synthetic_outcomes, filters, ended, streams)
    lines = [line for category in facts.values() for line in category]
    assert c.unrepresented_problems(lines, facts) == []
    assert len(facts['ink_original']) == 2
    assert 'frozen at host 106.7 s' in facts['ink_original'][1]
    for line in facts['ink_original']:
        assert c.unrepresented_problems([x for x in lines if x != line], facts)
        assert c.unrepresented_problems([x + ' altered' if x == line else x for x in lines], facts)
    assert c.unrepresented_problems(lines + ['ink originals: invented'], facts)
    old = c.ink_original_coverage(c.single_composed(outcomes, kept), session)
    assert old['not_recorded'] == 6 and old['gesture'] == old['frozen_host'] == old['selections'] == old['interrupted'] == 0
    note('reported_facts_and_old_fixture_coverage', ink_lines=facts['ink_original'], tamper_controls=5,
         old_fixture_coverage={k: sorted(v) if isinstance(v,set) else v for k,v in old.items()})

receipt = {'candidate': '35c75a45b1a29c3e069e061e077b45f820cfee1e', 'production_commit': '89edd5c499a80ffe7454a0924881eec63e79f195',
           'scope': 'Python helper/contract checks only; NOT Swift execution or a newly generated native fixture',
           'audited_input_sha256': {str(native/'ink/ink.json'):sha,
                                   str(AUDITED/'manifest.json'):hashlib.sha256((AUDITED/'manifest.json').read_bytes()).hexdigest()},
           'groups': results}
Path('/tmp/macos-ink-89-mapper-probes.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(f'{len(results)} focused groups passed; no Swift tests executed')
