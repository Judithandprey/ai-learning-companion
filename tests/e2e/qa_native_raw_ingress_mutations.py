"""Mutation check for test_p0_13_native_raw_ingress_qa.py (QA evidence helper, not collected).

Copies packages/, services/ and the test into a temporary folder, applies one production
mutation at a time and runs the test there. The worktree itself is never modified.
Usage: QA_NATIVE_FIXTURES=<fixtures> .venv/bin/python tests/e2e/qa_native_raw_ingress_mutations.py
"""
import os
import pathlib
import shutil
import subprocess
import tempfile

SRC = pathlib.Path(__file__).resolve().parents[2]
WORK = pathlib.Path(tempfile.gettempdir()) / "qa-native-mut-work"
PY = str(SRC / ".venv/bin/python")
ENV = {**os.environ, "QA_NATIVE_FIXTURES": os.environ["QA_NATIVE_FIXTURES"],
       "PYTHONDONTWRITEBYTECODE": "1"}
TEST = "tests/e2e/test_p0_13_native_raw_ingress_qa.py"
M = {
 "reader authorizes once per instance": ("services/api/process_context.py",
    "                self._authorized(tx)\n                result = self._read(tx, record_ids, max_metadata_bytes, raw=raw)\n                # Token expiry/revocation may change independently of the actor\n                # lock. Recheck the caller before any detached result is returned.\n                self._authorized(tx)",
    "                if not getattr(self, '_qa_ok', False):\n                    self._authorized(tx)\n                    self._qa_ok = True\n                result = self._read(tx, record_ids, max_metadata_bytes, raw=raw)"),
 "reader drops post-read recheck": ("services/api/process_context.py",
    "                # lock. Recheck the caller before any detached result is returned.\n                self._authorized(tx)",
    "                # lock. Recheck the caller before any detached result is returned.\n                pass"),
 "prepare never compares re-read": ("services/learning/process_context.py",
    "if canonical(final_snapshot) != original_metadata:", "if False:"),
 "packet batch identity forged": ("services/learning/process_context.py",
    '"batch": {key: value for key, value in batch.items() if key != "records"},',
    '"batch": {**{key: value for key, value in batch.items() if key != "records"}, "batch_id": "forged"},'),
 "item source altered": ("services/learning/process_context.py",
    'item = {"record": record, "source": source_map[source_key(record["source"])],',
    'item = {"record": record, "source": {**source_map[source_key(record["source"])], "source_timezone": "Asia/Tokyo"},'),
 "attached_bytes zeroed": ("services/learning/process_context.py",
    'packet["attached_bytes"] = total', 'packet["attached_bytes"] = 0'),
 "reader relabels live": ("services/api/process_context.py",
    '**identity, "delivery_mode": "historical", "records": [record]}',
    '**identity, "delivery_mode": "live", "records": [record]}'),
 "replay recomputes received_at": ("services/api/capture.py",
    'received_at = old["received_at"] if old else self.archive._timestamp()',
    'received_at = self.archive._timestamp()'),
 "resolver returns other bytes": ("services/api/image_resolver.py",
    'return {"status": "available", "frame": deepcopy(frame), "media_type": "image/png", "data": data}',
    'return {"status": "available", "frame": deepcopy(frame), "media_type": "image/png", "data": data[:-1] + b"x"}'),
}


def copy():
    shutil.rmtree(WORK, ignore_errors=True); WORK.mkdir()
    for part in ("packages", "services", "pyproject.toml"):
        (shutil.copytree if (SRC / part).is_dir() else shutil.copy2)(SRC / part, WORK / part)
    (WORK / "tests/e2e").mkdir(parents=True); shutil.copy2(SRC / TEST, WORK / TEST)


def run():
    out = subprocess.run([PY, "-m", "pytest", "-p", "no:cacheprovider", "-q", TEST], cwd=WORK, env=ENV,
                         capture_output=True, text=True)
    return out.stdout.strip().splitlines()[-1]


copy(); print("baseline:", run())
for name, (path, old, new) in M.items():
    copy(); target = WORK / path; text = target.read_text()
    if text.count(old) != 1: print(name, ": PATTERN NOT FOUND"); continue
    target.write_text(text.replace(old, new)); print(f"{name}: {run()}")
shutil.rmtree(WORK, ignore_errors=True)
