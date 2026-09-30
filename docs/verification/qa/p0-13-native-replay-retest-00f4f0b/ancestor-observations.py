"""Observed ancestor-row outcomes at main 00f4f0b (QA evidence script, not a test).

Run from the worktree: QA_NATIVE_FIXTURES=<fixtures> PYTHONPATH=.:tests/e2e .venv/bin/python <this file>
Uses the committed test module's rig and QA-derived child; direct storage mutations only.
"""
import json
import os
from pathlib import Path

import test_p0_13_native_raw_ingress_qa as T
from services.api.errors import DomainError

native = {p.name: p.read_bytes() for p in Path(os.environ["QA_NATIVE_FIXTURES"]).iterdir()}
record_row = ("capture_record", T.RECORD)
CASES = {
    **T.ANCESTOR_DIVERGENCE,
    "record_reserialized": lambda rows, native: rows[record_row].update(
        canonical_json=json.dumps(json.loads(rows[record_row]["canonical_json"]))),
    "record_method_edited": lambda rows, native: rows[record_row].update(
        canonical_json=rows[record_row]["canonical_json"].replace('"method":"visual"', '"method":"structured"')),
}


def status(response):
    body = json.loads(response.content)
    if response.status_code == 200:
        return f"200 {body['acknowledged'][0]['disposition']}"
    return f"{response.status_code} {body['error']}"


def read(rig, record_id):
    try:
        method = rig.reader().read_raw([record_id])["batch"]["records"][0]["method"]
        return f"ok method={method}"
    except DomainError as error:
        return str(error.status)


print("parent row changed | child same-key | child new-key | read child | read parent | same-key left store unchanged")
for name, change in CASES.items():
    rig = T.Rig()
    T.committed(rig, native, "live")
    body = T.commit_child(rig, native, cross_source=False)
    change(rig.store._documents[T.USER], native)
    before = rig.documents()
    same = status(rig.post(body, key=T.CHILD_KEY))
    unchanged = rig.documents() == before
    new = status(rig.post(body, key="qa-child-new-key"))
    print(f"{name} | {same} | {new} | {read(rig, T.CHILD)} | {read(rig, T.RECORD)} | {unchanged}")
