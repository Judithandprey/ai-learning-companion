from services.api.storage import MemoryStore
from services.api.domain import key
from services.api.tests.test_learning_snapshot import seed_snapshot_history, USER

store = MemoryStore()
archive, _ = seed_snapshot_history(store, USER)
source_id, event_id = 'second-course', 'second-unknown'
before = archive.export_learning_snapshot(USER, [source_id])
with store.transaction(USER) as tx:
    event = tx.get('event', event_id)
    receipt_key = key(event['device_id'], event['device_sequence'])
    assert event['correction_of'] is None
    assert tx.get('event_sequence', receipt_key)['event_id'] == event_id
    assert tx.get('event_tombstone', event_id) is None
    tx.delete('event', event_id)
after = archive.export_learning_snapshot(USER, [source_id])
print('before observations:', [r['event_id'] for r in before['observations']])
print('after observations:', [r['event_id'] for r in after['observations']])
with store.transaction(USER) as tx:
    print('dangling receipt:', tx.get('event_sequence', receipt_key))
    print('explicit deletion tombstone:', tx.get('event_tombstone', event_id))
print('BUG: export succeeded with a known committed original omitted')
