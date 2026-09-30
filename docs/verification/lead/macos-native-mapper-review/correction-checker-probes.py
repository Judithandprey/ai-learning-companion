"""Bounded Python checker retest; NOT new Swift mapper or native execution.
The original probe is executed unchanged except its export ROOT and six-value
native_session unpack. Its former false-positive assertion must now fail.
"""
import copy
import hashlib
import io
import json
from contextlib import redirect_stdout
from pathlib import Path

OLD = Path('/tmp/macos-native-df581-checker-probes.py')
ORIGINAL = OLD.read_bytes()
ROOT = Path('/tmp/lc-macos-mapper-49e')
BASE = Path('/tmp/macos-mapper-49e-checker-review')
source = ORIGINAL.decode().replace(
    "ROOT=Path('/tmp/lc-macos-native-df581')", "ROOT=Path('/tmp/lc-macos-mapper-49e')"
).replace(
    'status,kept,outcomes,filters=checker.native_session(native)',
    'status,kept,outcomes,filters,ended,streams=checker.native_session(native)'
)
assert sum(a != b for a, b in zip(ORIGINAL.decode().splitlines(), source.splitlines())) == 2
namespace = {'__name__': 'preserved_original_probe', '__file__': str(OLD)}
try:
    exec(compile(source, str(OLD), 'exec'), namespace)
except AssertionError:
    # Require failure at precisely the now-obsolete false-positive expectation,
    # after all original validation and corruption controls have succeeded.
    assert namespace.get('code') == 1
    failures = namespace['failures']
    assert len(failures) == 2, failures
    assert any('unrepresented facts equal' in f for f in failures), failures
    assert any('not vacuous' in f for f in failures), failures
    assert len(namespace['mutations']) == 78
    assert len(namespace['results']) == 10
    assert all(r['pass'] for r in namespace['results'])
else:
    raise AssertionError('old false-positive assertion unexpectedly survived')

checker = namespace['checker']
wrapped = namespace['wrapped']
BASE.with_suffix('.old-wrapper.log').write_text(namespace['out'].getvalue())
args = checker.native_session(wrapped / 'native')
expected = checker.expected_unrepresented(wrapped / 'native', *args)
old_problems = checker.unrepresented_problems(namespace['facts'], expected)
assert [p.split(' facts ')[0] for p in old_problems] == ['ending', 'filter', 'ink'], old_problems
results = [
    {'name': 'preserved original controls', 'passed': True, 'frames': 7,
     'fragment_bound_mutations': 78, 'original_probe_groups_passed': 10},
    {'name': 'original malformed wrapper now fails relevant category check', 'passed': True,
     'failed_categories': ['ending', 'filter', 'ink'], 'overall_exit': 1,
     'separate_non_vacuity_still_fails': True},
]

# A corrected synthetic wrapper tests only the Python check and its source-file
# comparisons. It remains deliberately incomplete for new Swift fixture coverage.
facts = [line for lines in expected.values() for line in lines]
assert checker.unrepresented_problems(facts, expected) == []
manifest = copy.deepcopy(namespace['manifest'])
manifest['synthetic'] = 'Corrected independent Python wrapper over audited old buffers; NOT new Swift mapper output'
for case in manifest['cases']:
    if case['type'] == 'mapping':
        case['mapping']['unrepresented'] = facts
(wrapped / 'manifest.json').write_text(json.dumps(manifest))
out = io.StringIO()
with redirect_stdout(out):
    code = checker.main(wrapped)
failed = [line for line in out.getvalue().splitlines() if line.startswith('FAIL ')]
assert code == 1 and len(failed) == 1 and 'not vacuous' in failed[0], failed
assert 'PASS mapping every_kept_frame: unrepresented facts equal' in out.getvalue()
BASE.with_suffix('.corrected-wrapper.log').write_text(out.getvalue())
results.append({'name': 'correct source-fact wrapper control', 'passed': True,
                'relevant_check_passes': True, 'overall_exit': 1,
                'sole_failure': 'required new Swift fixture families absent'})

# Isolate each regression: the baseline category check is passing before exactly
# one source line is omitted, changed or invented. An unrelated failure cannot
# satisfy these controls.
mutations = []
for category in ('ending', 'filter', 'ink'):
    for line in expected[category]:
        for operation in ('omit', 'change'):
            changed = ([f for f in facts if f != line] if operation == 'omit'
                       else [f + ' (changed)' if f == line else f for f in facts])
            problems = checker.unrepresented_problems(changed, expected)
            assert len(problems) == 1 and problems[0].startswith(category + ' facts '), problems
            mutations.append({'category': category, 'operation': operation})
for category, invented in (
    ('ending', 'the session ended (invented); no descriptor carries the ending'),
    ('ink', 'ink documents invented/ink/ink.json; not an immutable editable original'),
):
    problems = checker.unrepresented_problems(facts + [invented], expected)
    assert len(problems) == 1 and problems[0].startswith(category + ' facts '), problems
    mutations.append({'category': category, 'operation': 'invent'})
results.append({'name': 'specific omissions changes and inventions rejected from passing baseline',
                'passed': True, 'mutations': mutations})

# Source-reviewed Swift expected strings are used as independent literals for
# the correction's agreeing/disagreeing ending cases, with small exact hosts.
status = copy.deepcopy(args[0])
status['ending'] = {'reason': 'user_stop', 'liveEndedHost': 201.0}
ended = [{'detail': {'callbacks_after_live_ended': '0', 'live_ended_host': '201.0', 'reason': 'user_stop'}}]
ending_args = (status, args[1], args[2], args[3], ended, [])
agree = checker.expected_unrepresented(wrapped / 'native', *ending_args)['ending']
assert agree == [
    'the session ended (user_stop; live claims ended at host 201.0 s); no descriptor carries the ending',
    'events.jsonl records an ending (callbacks_after_live_ended=0; live_ended_host=201.0; reason=user_stop); no descriptor carries the ending',
], agree
ended[0]['detail'].update(reason='stream_error', detail='synthetic other detail', live_ended_host='202.5')
differ = checker.expected_unrepresented(wrapped / 'native', *ending_args)['ending']
assert differ == [agree[0],
    'events.jsonl records an ending (callbacks_after_live_ended=0; detail=synthetic other detail; live_ended_host=202.5; reason=stream_error); no descriptor carries the ending',
    'the endings recorded in status.json and events.jsonl disagree on reason, detail, live_ended_host; both are kept above and neither is chosen',
], differ
results.append({'name': 'Python expected endings match the literal corrected Swift regression strings',
                'passed': True, 'swift_execution': 'NOT_RUN'})
assert OLD.read_bytes() == ORIGINAL
receipt = {
    'candidate': '49e5b75fe7a0ddda5aa2f82930fa0ea3a6512107',
    'export': str(ROOT), 'synthetic_wrapper': str(wrapped),
    'scope': 'Python checker only; audited old buffers and synthetic descriptors/wrapper; no new Swift execution',
    'original_probe_sha256': hashlib.sha256(ORIGINAL).hexdigest(),
    'probe_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
    'results': results, 'passed': len(results), 'failed': 0,
    'audited_expected_facts': expected,
}
BASE.with_suffix('.probes.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt, indent=2))
