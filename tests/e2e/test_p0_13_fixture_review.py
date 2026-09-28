"""P0-13 deterministic QA checks on learning's problem_solving_v1 delivery.

These checks read the learning delivery read-only from the pinned Git commit
(it is not merged into team/qa). They reproduce the author's structural probe and add
a small QA answer-leak oracle derived from QA's own arithmetic. The oracle is a
string check for final answers, not semantic review. Semantic, mathematical and
label judgments are recorded in docs/verification/qa/p0-13-case-review.md.
Nothing here is an executed product, provider or device check.
"""

import hashlib
import importlib.util
import io
import json
import re
import subprocess
import tarfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
LEARNING_COMMIT = "aa598bc20e5b4f4d726ca537b2b0a9a3449b1fef"
FIXTURES = "services/learning/fixtures/problem_solving_v1"
PROBE = "tests/evals/process_rules.py"


def git_bytes(path):
    result = subprocess.run(["git", "-C", str(ROOT), "show", f"{LEARNING_COMMIT}:{path}"], capture_output=True)
    if result.returncode != 0:
        pytest.skip(f"learning commit {LEARNING_COMMIT[:7]} not available in this clone")
    return result.stdout


def git_json(path):
    return json.loads(git_bytes(path))


@pytest.fixture(scope="module")
def corpus():
    cases = git_json(f"{FIXTURES}/cases.json")
    labels = git_json(f"{FIXTURES}/labels.json")
    return cases, labels, {case["id"]: case for case in cases["cases"]}


@pytest.fixture(scope="module")
def probe(tmp_path_factory):
    """Import the author's probe from an archive of the pinned commit."""
    target = tmp_path_factory.mktemp("aa598bc")
    archive = subprocess.run(["git", "-C", str(ROOT), "archive", LEARNING_COMMIT, FIXTURES, PROBE], capture_output=True)
    if archive.returncode != 0:
        pytest.skip("learning commit not available")
    with tarfile.open(fileobj=io.BytesIO(archive.stdout)) as tar:
        tar.extractall(target, filter="data")
    spec = importlib.util.spec_from_file_location("p010_process_rules", target / PROBE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_fixture_bytes_match_pinned_manifest():
    manifest = git_json(f"{FIXTURES}/manifest.json")
    for name, digest in manifest["files"].items():
        assert hashlib.sha256(git_bytes(f"{FIXTURES}/{name}")).hexdigest() == digest
    assert manifest["provenance"]["origin"] == "synthetic"
    assert manifest["provenance"]["consent_scope"] == "test_only"


def test_corpus_is_complete_unique_and_test_only(corpus):
    cases, labels, by_id = corpus
    assert len(cases["cases"]) == len(by_id) == 37
    assert set(labels) == set(by_id)
    assert cases["provenance"]["origin"] == "synthetic" and cases["provenance"]["consent_scope"] == "test_only"
    for label in labels.values():
        assert label["independent_semantic_review"] == "not_run"


def test_author_structural_probe_reproduces_its_labels(corpus, probe):
    _, labels, by_id = corpus
    mismatches = {cid: (probe.inspect_case(case)["violations"], sorted(labels[cid]["expected_rule_violations"]))
                  for cid, case in by_id.items()
                  if probe.inspect_case(case)["violations"] != sorted(labels[cid]["expected_rule_violations"])}
    assert mismatches == {}
    assert sum(len(label["expected_rule_violations"]) for label in labels.values()) == 14
    assert sum(bool(label["expected_rule_violations"]) for label in labels.values()) == 12


# QA-derived final answers (own arithmetic), as regexes over lowercased text.
ANSWERS = {
    "p01": r"x\s*=\s*3\b", "p02": r"y\s*=\s*4\b", "p04": r"x\s*=\s*[23]\b", "p05": r"x\s*=\s*12\b",
    "p06": r"x\s*=\s*-\s*3\b", "p09": r"\b97\b", "p10": r"x\s*=\s*-\s*[15]\b", "p11": r"\b1\s*/\s*4\b",
    "p12": r"\b25\b", "p13": r"x\s*=\s*4\b", "p14": r"x\s*=\s*4\b", "p15": r"x\s*=\s*3\b",
    "p16": r"x\s*=\s*7\b", "p18": r"x\s*=\s*5\b", "p19": r"x\s*=\s*4\b", "p20": r"x\s*=\s*4\b",
    "p21": r"2\s*x\s*cos|cos\s*\(\s*x\s*\^\s*2\s*\)\s*\*?\s*2\s*x", "p22": r"x\s*=\s*3\b",
    "p23": r"x\s*=\s*8\b", "p24": r"x\s*=\s*10\b", "p26": r"x\s*=\s*3\b|\bthree\b", "p37": r"x\s*=\s*2\b",
}
NO_ANSWER_INTENTS = {"explore", "check", "hint"}


def answer_leaks(by_id):
    return {cid for cid, pattern in ANSWERS.items()
            if by_id[cid]["control"]["intent"] in NO_ANSWER_INTENTS and re.search(pattern, by_id[cid]["candidate"]["text"].lower())}


def test_qa_answer_oracle_finds_exactly_the_final_answer_candidates(corpus):
    _, _, by_id = corpus
    assert answer_leaks(by_id) == {"p18", "p23", "p26", "p37"}
    # A full solution is allowed after an explicit request (A33).
    assert by_id["p22"]["control"]["intent"] == "solution" and re.search(ANSWERS["p22"], by_id["p22"]["candidate"]["text"].lower())


def test_structural_probe_blind_spot_p37_is_real(corpus, probe):
    _, labels, by_id = corpus
    structurally_rejected = {cid for cid, case in by_id.items() if probe.inspect_case(case)["violations"]}
    assert answer_leaks(by_id) - structurally_rejected == {"p37"}
    assert labels["p37"]["expected_rule_violations"] == []
    assert by_id["p37"]["candidate"]["declared_level"] == "hint" and by_id["p37"]["candidate"]["channel"] == "notification"


def test_p12_visible_line_is_false_arithmetic_with_a_matching_result(corpus):
    _, _, by_id = corpus
    visible = next(step["text"] for step in by_id["p12"]["trace"] if step["kind"] == "visual")
    assert "2^2 + 3^2 = 25" in visible
    assert 2 ** 2 + 3 ** 2 == 13 != 25 == (2 + 3) ** 2


def test_p11_digit_cancellation_matches_only_by_coincidence():
    assert 16 / 64 == 1 / 4 and 19 / 95 == 1 / 5 and 12 / 24 != 1 / 4


@pytest.mark.xfail(strict=True, reason="QA-P13-01: fixtures predate a2567fa and map only A30-A40; A41-A46 have no case")
def test_every_problem_solving_acceptance_has_a_fixture(corpus):
    _, labels, _ = corpus
    mapped = {acceptance for label in labels.values() for acceptance in label["acceptance"]}
    assert {f"A{number}" for number in range(30, 47)} <= mapped
