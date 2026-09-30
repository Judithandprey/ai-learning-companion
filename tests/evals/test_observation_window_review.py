"""Independent synthetic window boundaries; not runtime/provider acceptance."""

from copy import deepcopy
from test_observation_window import selection, prepare
from test_process_context import supplied, metadata_size


def test_identical_domain_cannot_join_raw_callback_and_legacy_record_clock():
    snapshot, blobs = selection()
    raw = snapshot['frames'][1]
    _, _, legacy_frames, _ = supplied(display=True, data=blobs['f2'])
    legacy = legacy_frames[0]
    legacy.update(frame_id='f2', artifact_id='a2', width=3, height=2,
                  content_hash=raw['artifact']['sha256'], media_position=None)
    snapshot['frames'][1] = legacy
    snapshot['batch']['records'][1]['clock'] = deepcopy(raw['timing']['callback_clock'])
    result = prepare(snapshot, blobs)
    assert all(pair['clock_readings'] == {'status': 'unknown', 'reason': 'different_clock_basis'}
               for pair in result['observation_window']['comparisons'])
    assert result['items'][0]['pixel_orientation'] == 'raw_unapplied'
    assert 'pixel_orientation' not in result['items'][1]


def test_numeric_uncertainty_negative_safe_integer_delta_and_missing_frame():
    snapshot, blobs = selection(raw=False)
    first, second, third = snapshot['batch']['records']
    first['clock'].update(elapsed_ms=9007199254740991, uncertainty_ms=15)
    second['clock'].update(elapsed_ms=0, uncertainty_ms=25)
    snapshot['frames'] = [f for f in snapshot['frames'] if f['frame_id'] != 'f2']
    result = prepare(snapshot, blobs)
    comparison = result['observation_window']['comparisons'][0]
    assert comparison['clock_readings'] == {
        'status': 'comparable_readings', 'basis': 'record_clock', 'domain_id': 'one-clock',
        'right_minus_left_ms': -9007199254740991, 'left_uncertainty_ms': 15, 'right_uncertainty_ms': 25}
    assert comparison['retained_image_bytes'] == 'unknown'
    assert result['items'][1]['image'] == {'status': 'missing_frame'}
    assert result['observation_window']['capture_intervals'] == 'unknown'


def test_metadata_budget_never_returns_partial_records_or_exceeds_final_size():
    snapshot, blobs = selection()
    before = deepcopy(snapshot)
    full = prepare(snapshot, blobs)
    fullsize = metadata_size(full)
    successes = 0
    for limit in range(fullsize - 8, fullsize + 4):
        try:
            result = prepare(snapshot, blobs, max_metadata_bytes=limit)
        except ValueError as exc:
            assert 'withheld' in str(exc)
        else:
            successes += 1
            assert metadata_size(result) <= limit
            assert result['counts'] == {'supplied': 3, 'included': 3, 'omitted': 0}
            assert [i['record'] for i in result['items']] == snapshot['batch']['records']
    assert successes and snapshot == before
