"""Executable private-seam examples; no device/provider/entitlement claims."""
from copy import deepcopy
import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, ValidationError

from packages.contracts.live_companion import SCHEMA, VERSION, validate, validate_request
from services.learning.subscription_ask import prepare_subscription_ask

ROOT = Path(__file__).parents[1] / 'live_companion'
REQUEST = json.loads((ROOT / 'examples/focus.json').read_text())


def turn():
    return deepcopy(REQUEST['params'])


def test_schema_example_and_existing_png_validation():
    Draft202012Validator.check_schema(SCHEMA)
    assert json.loads((ROOT / 'schema.json').read_text()) == SCHEMA
    assert validate_request(REQUEST) == REQUEST
    t = turn()
    prepared = prepare_subscription_ask(dict(request_id=t['request_id'], question='Small hint for the highlighted focus',
        assistance='hint', image=t['image'], context=t['context']))
    assert prepared['provenance']['image']['width'] == 400
    assert t['focus']['region_px']['width'] == 80  # Whole PNG remains full size.


def test_followup_can_retain_focus_without_replacing_frame():
    t = turn()
    t.update(trigger='text_followup', user_text='Explain just the symbol, please.')
    copied = validate('Turn', t)
    copied['context']['frame_seq'] = 10
    assert t['context']['frame_seq'] == 3


def test_observation_needs_no_selection_or_question_and_cannot_present():
    t = turn()
    t.update(trigger='observation', focus=None, allowed_assistance='none', presentation='none')
    validate('Turn', t)
    t['presentation'] = 'silent'
    with pytest.raises(ValidationError):
        validate('Turn', t)


@pytest.mark.parametrize('field,value', [
    ('epoch', 0), ('permission_revision', True), ('request_id', ' '),
    ('request_id', '\ud800'), ('presentation', 'speech_only'),
    ('allowed_assistance', 'automatic_solution'), ('focus', None),
])
def test_invalid_turn_fields(field, value):
    t = turn()
    t[field] = value
    with pytest.raises(ValidationError):
        validate('Turn', t)


@pytest.mark.parametrize('part,field,value', [
    ('image','width',80), ('focus','frame_seq',2), ('context','ink_revision',None),
])
def test_crop_stale_focus_and_unbound_ink_are_rejected(part, field, value):
    t = turn()
    t['context']['ink_sha256'] = 'a' * 64
    t[part][field] = value
    with pytest.raises(ValidationError):
        validate('Turn', t)


@pytest.mark.parametrize('value', [float('nan'), float('inf'), 0, 1e-320])
def test_unsafe_display_ratio(value):
    t = turn()
    t['context']['display']['bounds']['width'] = value
    t['context']['region_dip']['width'] = value
    # Keep a valid contained focus so even a subnormal ratio gets rejected safely.
    t['focus']['region_dip'].update(x=0, width=value)
    with pytest.raises(ValidationError):
        validate('Turn', t)


def test_focus_dpi_mapping_is_checked_against_actual_frame_not_nominal_scale():
    t = turn()
    t['context']['display']['scale_factor'] = 1.25
    validate('Turn', t)
    t['focus']['region_px']['x'] += 1
    with pytest.raises(ValidationError):
        validate('Turn', t)


def test_unknown_audio_attribution_is_preserved_not_fabricated():
    t = turn()
    t.update(trigger='voice_followup', user_text='Which term is this?', audio_source={
        'source_id':'explicit-talk', 'track':'microphone', 'speaker':'unknown', 'attribution':'unknown',
        'started_at':None, 'ended_at':None})
    validate('Turn', t)
    t['audio_source'] = None
    with pytest.raises(ValidationError):
        validate('Turn', t)


def test_future_or_missing_transcript_evidence_and_budget_rejected():
    t = turn()
    row = dict(kind='source_transcript', text='visible unknown speaker', at=None, frame_seq=2,
               request_id=None, audio_source=None, presentation=None)
    t['history'] = [row]
    with pytest.raises(ValidationError):
        validate('Turn', t)
    row.update(kind='user', frame_seq=4)
    with pytest.raises(ValidationError):
        validate('Turn', t)
    row.update(frame_seq=2, text='x' * 4000)
    t['history'] = [deepcopy(row) for _ in range(9)]
    with pytest.raises(ValidationError):
        validate('Turn', t)


def test_gap_order_and_extent_are_not_fabricated():
    for start, end in [(3,2), (1,4)]:
        t = turn()
        t['gaps'][0].update(from_frame_seq=start, to_frame_seq=end)
        with pytest.raises(ValidationError):
            validate('Turn', t)


def quota(balance=None, allowed=False):
    return dict(available=True, ordinary_usage_allowed=allowed, windows=[dict(limit_id='normal', normal_model_slug=None,
        primary=dict(used_percent=100, window_duration_mins=300, resets_at=None), secondary=None,
        credits=dict(has_credits=True, unlimited=False, balance=balance), rate_limit_reached_type=None,
        spend_control_reached=None, individual_limit=None)])


@pytest.mark.parametrize('balance', [None, '0', '12.000000000000000000001', 'unparsed server display'])
def test_exact_credit_strings_do_not_rewrite_server_permission(balance):
    q = quota(balance)
    assert validate('Quota', q) == q
    assert validate('Quota', q)['ordinary_usage_allowed'] is False


@pytest.mark.parametrize('balance', [0, 1.25, False])
def test_credit_numbers_are_not_coerced(balance):
    with pytest.raises(ValidationError):
        validate('Quota', quota(balance))


def test_unknown_allowance_is_distinct_from_zero():
    q = dict(available=False, ordinary_usage_allowed=None, windows=[])
    validate('Quota', q)
    q['ordinary_usage_allowed'] = False
    with pytest.raises(ValidationError):
        validate('Quota', q)


@pytest.mark.parametrize('code', ['rate_limited','allowance_exhausted','ordinary_usage_not_allowed','workspace_limit','allowance_unknown'])
def test_error_categories_preserve_submission_uncertainty(code):
    validate('Error', {'code':code, 'submission':'unknown'})


def test_result_binds_full_context_and_remains_non_presentation_authority():
    p = turn()
    del p['image']['png_base64']
    result = dict(request_id=p['request_id'], text='First inspect the highlighted term.', provenance=p,
                  model='example-only', auth_mode='chatgpt', latency_ms=500, thread_id='synthetic-thread',
                  turn_id='synthetic-turn', kind='generated_assistance')
    validate('Result', result)
    result['request_id'] = 'other'
    with pytest.raises(ValidationError):
        validate('Result', result)


@pytest.mark.parametrize('method,params', [
    ('connection/read',{}), ('connection/login/start',{}),
    ('connection/login/cancel',{'login_id':'login'}),
    ('companion/interrupt',{'session_id':'session','epoch':1,'request_id':None}),
    ('companion/stop',{'session_id':'session','epoch':1}),
])
def test_all_control_requests_reject_invalid_unicode_and_legacy_version(method, params):
    r = dict(version=VERSION, id='id', method=method, params=params)
    validate_request(r)
    for key,value in [('id','\ud800'),('version','lc-subscription-ask/1')]:
        bad = {**r, key:value}
        with pytest.raises(ValidationError):
            validate_request(bad)


def test_start_budget_permissions_and_closed_fields():
    value=dict(session_id='session',capture_session_id='capture',epoch=1,model='example',
        policy=dict(max_submissions=12,max_session_ms=300000,min_observation_interval_ms=10000),
        permissions=dict(screen=True,microphone=False,system_audio=False))
    validate('Start', value)
    value['policy']['max_submissions']=0
    with pytest.raises(ValidationError):
        validate('Start', value)
    value['policy']['max_submissions']=12
    value['token']='not permitted'
    with pytest.raises(ValidationError):
        validate('Start', value)


def test_hash_newline_and_observation_subnormal_ratio_match_learning_boundary():
    t = turn()
    t['image']['sha256'] += '\n'
    with pytest.raises(ValidationError):
        validate('Turn', t)
    t = turn()
    t.update(trigger='observation', focus=None, allowed_assistance='none', presentation='none')
    t['context']['display']['bounds']['width'] = 1e-320
    t['context']['region_dip']['width'] = 1e-320
    with pytest.raises(ValidationError):
        validate('Turn', t)


def test_circle_does_not_reuse_old_full_solution_allowance():
    t = turn()
    t['allowed_assistance'] = 'full_solution'
    with pytest.raises(ValidationError):
        validate('Turn', t)


def test_current_state_includes_full_retained_provenance_not_only_request_id():
    p = turn()
    del p['image']['png_base64']
    state = dict(active=True,cancelled=False,provenance=p)
    assert validate('CurrentState',state) == state
    del state['provenance']['image']['sha256']
    with pytest.raises(ValidationError):
        validate('CurrentState',state)


@pytest.mark.parametrize('field', ['request_id','timestamp','source_url'])
def test_trailing_newline_ids_times_and_blank_source_are_rejected(field):
    r = deepcopy(REQUEST)
    if field == 'request_id':
        r['id'] = 'request\n'
    elif field == 'timestamp':
        r['params']['context']['frame_captured_at'] += '\n'
    else:
        r['params']['context']['source_url'] = '   '
    with pytest.raises(ValidationError):
        validate_request(r)
