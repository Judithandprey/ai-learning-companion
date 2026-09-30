"""Mutation check for test_p0_13_native_raw_ingress_qa.py (QA evidence helper, not collected).

Each run creates its own private temporary folder (tempfile.TemporaryDirectory) and copies
packages/, services/, pyproject.toml and the test into a baseline subfolder. Each mutation gets
a new copy of that same snapshot, has exactly one production edit applied there and runs the test
with a JUnit XML report. Only that owned folder is created and removed; the worktree and every
preexisting path are left untouched.

The exit status is 0 only if the unmutated baseline is clean (exactly BASELINE passed/xfailed,
no failure, error or skip, modules imported from the copy) and every selected mutation applies
exactly once and makes exactly its EXPECTED_FAILURES fail, with the xfails unchanged. Anything
else, including a missing pattern, pytest error, unreadable report or timeout, is reported and the
exit status is 1. The child runs without inherited PYTHON*/PYTEST_* settings and with TMPDIR inside
the owned folder. An interrupted or killed run may leave its own qa-native-mut-* folder behind.

Usage: QA_NATIVE_FIXTURES=<fixtures> .venv/bin/python tests/e2e/qa_native_raw_ingress_mutations.py [NAME ...]
"""

import os
import pathlib
import shutil
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET

SRC = pathlib.Path(__file__).resolve().parents[2]
TEST = "tests/e2e/test_p0_13_native_raw_ingress_qa.py"
BASELINE = {"passed": 37, "xfailed": 5}
TIMEOUT_SECONDS = 600
MUTATED_MODULES = ("services.api.process_context", "services.learning.process_context",
                   "services.api.capture", "services.api.image_resolver")

MUTATIONS = {
    "reader authorizes once per instance": ("services/api/process_context.py",
        "                self._authorized(tx)\n"
        "                result = self._read(tx, record_ids, max_metadata_bytes, raw=raw)\n"
        "                # Token expiry/revocation may change independently of the actor\n"
        "                # lock. Recheck the caller before any detached result is returned.\n"
        "                self._authorized(tx)",
        "                if not getattr(self, '_qa_ok', False):\n"
        "                    self._authorized(tx)\n"
        "                    self._qa_ok = True\n"
        "                result = self._read(tx, record_ids, max_metadata_bytes, raw=raw)"),
    "reader drops post-read recheck": ("services/api/process_context.py",
        "                # lock. Recheck the caller before any detached result is returned.\n"
        "                self._authorized(tx)",
        "                # lock. Recheck the caller before any detached result is returned.\n"
        "                pass"),
    "prepare never compares re-read": ("services/learning/process_context.py",
        "if canonical(final_snapshot) != original_metadata:", "if False:"),
    "packet batch identity forged": ("services/learning/process_context.py",
        '"batch": {key: value for key, value in batch.items() if key != "records"},',
        '"batch": {**{key: value for key, value in batch.items() if key != "records"}, "batch_id": "forged"},'),
    "item source altered": ("services/learning/process_context.py",
        'item = {"record": record, "source": source_map[source_key(record["source"])],',
        'item = {"record": record, "source": {**source_map[source_key(record["source"])], '
        '"source_timezone": "Asia/Tokyo"},'),
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
        'return {"status": "available", "frame": deepcopy(frame), "media_type": "image/png", '
        '"data": data[:-1] + b"x"}'),
}

EXACT = {f"test_exact_native_bytes_commit_read_twice_replay_and_stop[{mode}]" for mode in ("live", "historical")}
MID_PREPARE = "test_revocation_during_preparation_withholds_the_whole_packet[{}-{}]"
OPEN_READ = "test_revocation_inside_an_open_read_is_rechecked_before_return"
RE_READ = "test_metadata_change_during_preparation_withholds_the_whole_packet"
TWO_ORIGINALS = "test_two_native_originals_keep_selection_order_and_image_correspondence"
SAVED_ACK = {f"test_malformed_saved_ack_or_original_is_never_served[saved_ack_{case}]"
             for case in ("extra_receipt", "other_received_at", "other_sha256")}
CALLER_MID_PREPARE = {MID_PREPARE.format(case, when) for case in ("token_revoked-401", "account_disabled-403")
                      for when in ("before_image", "after_image")}
BOUNDARIES = "test_current_revocation_deletion_and_withdraw_at_http_reader_resolver_boundaries[{}]"
# prepare refuses a non-historical selection, so every test that prepares a packet from readable
# history fails; tests whose reader refuses first (403/404/503) keep their outcome.
PREPARES_READABLE_PACKET = (
    EXACT | SAVED_ACK | CALLER_MID_PREPARE | {RE_READ, TWO_ORIGINALS}
    | {MID_PREPARE.format("source_revoked-403", when) for when in ("before_image", "after_image")}
    | {BOUNDARIES.format(case) for case in ("account_disabled", "membership_deactivated", "source_deleted",
                                            "source_revoked", "stream_withdrawn", "token_revoked")}
    | {"test_known_stop_boundary_admits_only_historical_through_it[101-True]",
       "test_malformed_saved_ack_or_original_is_never_served[original_bytes_swapped]"})
# Every test that must fail under each mutation, and no other. A source revocation is still
# caught by the reader's source row check when the caller decision is cached.
EXPECTED_FAILURES = {
    "reader authorizes once per instance": CALLER_MID_PREPARE | {OPEN_READ},
    "reader drops post-read recheck": {OPEN_READ},
    "prepare never compares re-read": {RE_READ},
    "packet batch identity forged": EXACT,
    "item source altered": EXACT,
    "attached_bytes zeroed": EXACT,
    "reader relabels live": PREPARES_READABLE_PACKET,
    "replay recomputes received_at": EXACT,
    # Prepare's hash check turns the altered bytes into an image gap wherever one was attached.
    "resolver returns other bytes": EXACT | SAVED_ACK | {TWO_ORIGINALS},
}


def prepare_copy(root, name):
    """Copy the tested tree into a new subfolder of the owned temporary root."""
    work = pathlib.Path(root) / name
    work.mkdir()  # Fails if it already exists; nothing is ever overwritten.
    ignore = shutil.ignore_patterns("__pycache__", "*.pyc")
    for part in ("packages", "services"):
        shutil.copytree(SRC / part, work / part, ignore=ignore)
    shutil.copy2(SRC / "pyproject.toml", work / "pyproject.toml")
    (work / "tests/e2e").mkdir(parents=True)
    shutil.copy2(SRC / TEST, work / TEST)
    return work


def copy_baseline(root, name):
    """Give each mutation the same source snapshot as the baseline, without its report."""
    work = pathlib.Path(root) / name
    shutil.copytree(pathlib.Path(root) / "00-baseline", work,
                    ignore=shutil.ignore_patterns("junit.xml", "__pycache__", "*.pyc"))
    return work


def mutate(work, path, old, new):
    target = work / path
    text = target.read_text()
    count = text.count(old)
    if count != 1:
        return f"pattern found {count} times in {path}"
    target.write_text(text.replace(old, new))
    return None


def child_env(fixtures, root):
    env = {k: v for k, v in os.environ.items() if not k.startswith(("PYTHON", "PYTEST_"))}
    tmp = pathlib.Path(root) / "tmp"
    tmp.mkdir()
    env.update(QA_NATIVE_FIXTURES=fixtures, PYTHONDONTWRITEBYTECODE="1", TMPDIR=str(tmp))
    return env


def run(label, command, work, env):
    """Run one child; a timeout is returned as a problem instead of hanging the helper."""
    try:
        return subprocess.run(command, cwd=work, env=env, capture_output=True, text=True,
                              timeout=TIMEOUT_SECONDS), None
    except subprocess.TimeoutExpired:
        return None, f"{label} timed out after {TIMEOUT_SECONDS} s"


def import_origins(work, env):
    """Every mutated module must load from the copy, not from the worktree."""
    code = "import importlib\nfor name in %r:\n    print(importlib.import_module(name).__file__)" % (MUTATED_MODULES,)
    out, problem = run("import check", [sys.executable, "-c", code], work, env)
    if problem:
        return [problem]
    if out.returncode != 0:
        return [f"import check exited {out.returncode}: {out.stderr.strip()[-300:]}"]
    paths = out.stdout.splitlines()
    if len(paths) != len(MUTATED_MODULES):
        return [f"import check printed {len(paths)} paths for {len(MUTATED_MODULES)} modules"]
    return [f"{path} is outside the copy" for path in paths
            if not pathlib.Path(path).resolve().is_relative_to(work.resolve())]


def run_tests(work, env):
    """Run the test; return (exit code, outcome per test id, last stdout line)."""
    report = work / "junit.xml"
    out, problem = run("pytest", [sys.executable, "-m", "pytest", "-p", "no:cacheprovider", "-q",
                        f"--junitxml={report}", TEST], work, env)
    if problem:
        return None, {f"<{problem}>": "error"}, "timed out"
    outcomes = {}
    try:
        cases = list(ET.parse(report).getroot().iter("testcase")) if report.exists() else []
    except ET.ParseError:
        cases, outcomes = [], {"<unreadable junit report>": "error"}
    for case in cases:
        test_id = case.get("name")
        outcome = "passed"
        for child in case:
            if child.tag == "failure":
                outcome = "failed"
            elif child.tag == "error":
                outcome = "error"
            elif child.tag == "skipped":
                outcome = "xfailed" if child.get("type") == "pytest.xfail" else "skipped"
        outcomes[test_id] = outcome if test_id not in outcomes else "error"  # A duplicate id is an error.
    lines = out.stdout.strip().splitlines()
    return out.returncode, outcomes, lines[-1] if lines else ""


def counts(outcomes):
    result = {}
    for outcome in outcomes.values():
        result[outcome] = result.get(outcome, 0) + 1
    return result


def check_baseline(code, outcomes):
    problems = []
    if code != 0:
        problems.append(f"pytest exited {code}, expected 0")
    if counts(outcomes) != BASELINE:
        problems.append(f"outcomes {counts(outcomes)}, expected {BASELINE}")
    return problems


def check_mutation(code, outcomes, baseline, expected):
    problems = []
    if code != 1:
        problems.append(f"pytest exited {code}, expected 1 (test failures only)")
    if set(outcomes) != set(baseline):
        problems.append("collected tests differ from the baseline")
    failed = {test for test, outcome in outcomes.items() if outcome == "failed"}
    if failed != expected:
        problems.append(f"unexpected failures {sorted(failed - expected)}; "
                        f"missing failures {sorted(expected - failed)}")
    for test, outcome in outcomes.items():
        if outcome not in ("failed", baseline.get(test)):
            problems.append(f"{test}: {outcome}, baseline {baseline.get(test)}")
    return problems


def main(names):
    fixtures = os.environ.get("QA_NATIVE_FIXTURES")
    if not fixtures or not pathlib.Path(fixtures).is_dir():
        print("QA_NATIVE_FIXTURES must name the run 36677566096 fixture folder", file=sys.stderr)
        return 1
    unknown = [name for name in names if name not in MUTATIONS]
    if unknown:
        print(f"unknown mutations: {unknown}", file=sys.stderr)
        return 1
    if pathlib.Path(tempfile.gettempdir()).resolve().is_relative_to(SRC):
        print("the temporary folder is inside the worktree; set TMPDIR elsewhere", file=sys.stderr)
        return 1
    selected = names or list(MUTATIONS)
    failures = 0
    with tempfile.TemporaryDirectory(prefix="qa-native-mut-") as root:
        env = child_env(fixtures, root)
        work = prepare_copy(root, "00-baseline")
        problems = import_origins(work, env)
        code, baseline, summary = run_tests(work, env)
        problems += check_baseline(code, baseline)
        print(f"baseline: {'OK' if not problems else 'FAIL'} | {summary}")
        for problem in problems:
            print(f"  - {problem}")
        if problems:
            return 1
        for index, name in enumerate(selected, 1):
            work = copy_baseline(root, f"{index:02d}-mutation")
            problems = [p for p in [mutate(work, *MUTATIONS[name])] if p]
            summary = "not run"
            if not problems:
                code, outcomes, summary = run_tests(work, env)
                problems = check_mutation(code, outcomes, baseline, EXPECTED_FAILURES[name])
            failures += bool(problems)
            print(f"{name}: {'caught as expected' if not problems else 'UNEXPECTED'} | {summary}")
            for problem in problems:
                print(f"  - {problem}")
    print(f"{len(selected) - failures}/{len(selected)} mutations gave exactly their expected failures")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
