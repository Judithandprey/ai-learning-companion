"""P0-13 deterministic QA checks on learning's problem_solving_v1 delivery.

The reviewed learning commits (aa598bc, fb445ed, 7da2298) are not ancestors of
main, so a fresh clone lacks their Git objects. The exact pinned bytes are kept in
tests/e2e/sources/p0_13 (content-addressed, SHA-256 verified, built by
build_archive.py). Every read verifies the blob hash and, when this clone has the
original Git object, compares it byte-for-byte. A missing or drifted source fails;
nothing is skipped. They reproduce the author's structural probe and add
a small QA answer-leak oracle derived from QA's own arithmetic. The oracle is a
string check for final answers, not semantic review. Semantic, mathematical and
label judgments are recorded in docs/verification/qa/p0-13-case-review.md.
Nothing here is an executed product, provider or device check.
"""

import copy
import functools
import hashlib
import importlib.util
import json
import os
import re
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
LEARNING_COMMIT = "aa598bc20e5b4f4d726ca537b2b0a9a3449b1fef"
FIXTURES = "services/learning/fixtures/problem_solving_v1"
PROBE = "tests/evals/process_rules.py"


ARCHIVE = ROOT / "tests/e2e/sources/p0_13"
PINNED = {(e["commit"], e["path"]): e for e in json.loads((ARCHIVE / "manifest.json").read_text())["entries"]}


@functools.lru_cache(maxsize=None)
def original_object(commit, path):
    """The original Git object, or None when this clone does not have it.

    QA_P013_ARCHIVE_ONLY=1 forces the fresh-clone path for demonstration.
    """
    if os.environ.get("QA_P013_ARCHIVE_ONLY") == "1":
        return None
    result = subprocess.run(["git", "-C", str(ROOT), "show", f"{commit}:{path}"], capture_output=True)
    return result.stdout if result.returncode == 0 else None


@functools.lru_cache(maxsize=None)
def pinned(commit, path):
    """Exact pinned bytes, verified; fails (never skips) on a missing or drifted source."""
    entry = PINNED.get((commit, path))
    if entry is None:
        pytest.fail(f"{commit[:7]}:{path} is not in the P0-13 source archive")
    data = (ARCHIVE / "blobs" / entry["sha256"]).read_bytes()
    assert hashlib.sha256(data).hexdigest() == entry["sha256"], f"archive blob drift: {commit[:7]}:{path}"
    original = original_object(commit, path)
    if original is not None:
        assert original == data, f"archive differs from Git object {commit[:7]}:{path}"
    return data


def materialize(target, commit, paths):
    for path in paths:
        out = target / path
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(pinned(commit, path))


def import_probe(target, rel, name):
    spec = importlib.util.spec_from_file_location(name, target / rel)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def git_bytes(path):
    return pinned(LEARNING_COMMIT, path)


def git_json(path):
    return json.loads(git_bytes(path))


@pytest.fixture(scope="module")
def corpus():
    cases = git_json(f"{FIXTURES}/cases.json")
    labels = git_json(f"{FIXTURES}/labels.json")
    return cases, labels, {case["id"]: case for case in cases["cases"]}


@pytest.fixture(scope="module")
def probe(tmp_path_factory):
    """Import the author's probe from the pinned bytes, laid out as in the commit."""
    target = tmp_path_factory.mktemp("aa598bc")
    materialize(target, LEARNING_COMMIT, [f"{FIXTURES}/{n}" for n in ("cases.json", "labels.json", "manifest.json", "author_cases.py")] + [PROBE])
    return import_probe(target, PROBE, "p010_process_rules")


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


@pytest.mark.xfail(strict=True, reason="QA-P13-01: problem_solving_v1 predates a2567fa and maps only A30-A40 (surfaces_v1 in fb445ed adds A42-A46; A41 is device-only)")
def test_every_problem_solving_acceptance_has_a_fixture(corpus):
    _, labels, _ = corpus
    mapped = {acceptance for label in labels.values() for acceptance in label["acceptance"]}
    assert {f"A{number}" for number in range(30, 47)} <= mapped


# --- problem_solving_surfaces_v1 (learning fb445ed) -----------------------------

SURFACES_COMMIT = "fb445edda3f96d561c27029075008922d2033eb9"
SURFACES = "services/learning/fixtures/problem_solving_surfaces_v1"
SURFACE_PROBE = "tests/evals/surface_rules.py"


def surfaces_bytes(path):
    return pinned(SURFACES_COMMIT, path)


@pytest.fixture(scope="module")
def surfaces():
    return json.loads(surfaces_bytes(f"{SURFACES}/cases.json")), json.loads(surfaces_bytes(f"{SURFACES}/labels.json"))


@pytest.fixture(scope="module")
def surface_probe(tmp_path_factory):
    target = tmp_path_factory.mktemp("fb445ed")
    materialize(target, SURFACES_COMMIT, [f"{SURFACES}/{n}" for n in ("cases.json", "labels.json", "manifest.json", "author_cases.py")] + [SURFACE_PROBE])
    return import_probe(target, SURFACE_PROBE, "p010_surface_rules")


def test_v1_corpus_is_unchanged_in_the_surfaces_commit():
    for name in ("cases.json", "labels.json", "author_cases.py", "manifest.json"):
        assert surfaces_bytes(f"{FIXTURES}/{name}") == git_bytes(f"{FIXTURES}/{name}")


def test_surfaces_bytes_match_pinned_manifest_and_are_test_only(surfaces):
    manifest = json.loads(surfaces_bytes(f"{SURFACES}/manifest.json"))
    for name, digest in manifest["files"].items():
        assert hashlib.sha256(surfaces_bytes(f"{SURFACES}/{name}")).hexdigest() == digest
    cases, labels = surfaces
    assert cases["provenance"]["origin"] == "synthetic" and cases["provenance"]["consent_scope"] == "test_only"
    assert len(cases["cases"]) == len({case["id"] for case in cases["cases"]}) == 28 == len(labels)


def test_surface_probe_reproduces_its_labels(surfaces, surface_probe):
    cases, labels = surfaces
    for case in cases["cases"]:
        actual, expected = surface_probe.inspect_case(case), labels[case["id"]]
        assert actual["violations"] == expected["expected_rule_violations"], case["id"]
        assert actual["known_edges"] == expected["known_edges"], case["id"]


def test_combined_corpora_map_every_problem_solving_acceptance_except_device_only_a41(corpus, surfaces):
    _, labels, _ = corpus
    cases, _ = surfaces
    mapped = {a for label in labels.values() for a in label["acceptance"]} | {a for case in cases["cases"] for a in case["acceptance"]}
    assert {f"A{number}" for number in range(30, 47)} - {"A41"} <= mapped


# Reproductions of confirmed surface-probe blind spots (QA review, owner learning).
# Each asserts the probe's current metadata-only answer on a QA mutation, so the
# evidence stays reproducible; see docs/verification/qa/p0-13-surfaces-review.md.

def surface_case(surfaces, case_id):
    cases, _ = surfaces
    return copy.deepcopy(next(case for case in cases["cases"] if case["id"] == case_id))


def test_blind_spot_mastery_gate_fails_open_on_other_tokens(surfaces, surface_probe):
    case = surface_case(surfaces, "s03")
    assert surface_probe.inspect_case(case)["violations"] == ["unsupported_independent_mastery"]
    case["candidate"]["mastery"] = "independent_mastery"
    assert surface_probe.inspect_case(case)["violations"] == []


def test_blind_spot_overwritten_earlier_choice_passes(surfaces, surface_probe):
    case = surface_case(surfaces, "s01")
    case["trace"][0].update(text="Select C.", after=["C"])
    case["trace"][1].update(text="(no-op)", before=["C"], after=["C"])
    assert surface_probe.inspect_case(case)["violations"] == []


def test_blind_spot_ai_answer_action_in_trace_is_ignored(surfaces, surface_probe):
    case = surface_case(surfaces, "s01")
    case["trace"].append({**case["trace"][-1], "id": "z", "parent": "c", "actor": "ai", "action": "submit", "text": "AI submits C."})
    assert surface_probe.inspect_case(case)["violations"] == []


def test_s09_positive_control_records_pixel_only_surfaces_without_gaps(surfaces):
    case = surface_case(surfaces, "s09")
    pixel_surfaces = {step["surface"] for step in case["trace"] if step["basis"] == "pixels"}
    assert {"formula_editor", "web_canvas", "external_notes"} <= pixel_surfaces
    assert case["gaps"] == []


# --- Learning reconciliation 7da2298 (32 review rows, 16 INTENT designs) ---------

RECONCILIATION_COMMIT = "7da229860e10a3525dbddd735a070acfe93d8913"
LEARNING_REVIEW = "docs/verification/learning"


def reconciliation_bytes(path):
    return pinned(RECONCILIATION_COMMIT, path)


@pytest.fixture(scope="module")
def reconciliation(tmp_path_factory):
    packet = json.loads(reconciliation_bytes(f"{LEARNING_REVIEW}/p0-10-review-revisions.json"))
    results = json.loads(reconciliation_bytes(f"{LEARNING_REVIEW}/p0-10-review-probe-results.json"))
    script = tmp_path_factory.mktemp("7da2298") / "review_probes.py"
    script.write_bytes(reconciliation_bytes(f"{LEARNING_REVIEW}/p0-10-review-probes.py"))
    spec = importlib.util.spec_from_file_location("p010_review_probes", script)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)  # top level defines functions only; run() is not called
    return packet, results, module.materialize


def materialized_rows(reconciliation, corpus, surfaces):
    packet, _, materialize = reconciliation
    process = corpus[2]
    surface = {case["id"]: case for case in surfaces[0]["cases"]}
    return {row["id"]: (row, materialize((process if row["corpus"] == "process" else surface)[row["base_case"]], row["changes"]))
            for row in packet["rows"]}


def test_reconciliation_preserves_original_corpora_and_pins_its_packet(reconciliation):
    packet, results, _ = reconciliation
    for name in ("problem_solving_v1/cases.json", "problem_solving_v1/labels.json",
                 "problem_solving_surfaces_v1/cases.json", "problem_solving_surfaces_v1/labels.json"):
        assert reconciliation_bytes(f"services/learning/fixtures/{name}") == surfaces_bytes(f"services/learning/fixtures/{name}")
    assert hashlib.sha256(reconciliation_bytes(f"{LEARNING_REVIEW}/p0-10-review-revisions.json")).hexdigest() == results["revisions_sha256"]
    assert packet["provenance"]["origin"] == "synthetic" and packet["provenance"]["consent_scope"] == "test_only"
    assert results["groups"] == {"revision": 5, "counterexample": 25, "control": 2} and results["matches"] == 32
    assert results["independent_revision_semantic_acceptance"] == "not_run" and results["g7"] == "not_passed"


def test_reconciliation_rows_reproduce_legacy_probe_output(reconciliation, corpus, surfaces, probe, surface_probe):
    for row_id, (row, case) in materialized_rows(reconciliation, corpus, surfaces).items():
        inspect = probe.inspect_case if row["corpus"] == "process" else surface_probe.inspect_case
        assert inspect(case)["violations"] == row["expected_legacy_rule_violations"], row_id


ROW_ANSWERS = {"p01": r"x\s*=\s*3\b", "p37": r"x\s*=\s*2\b", "p20": r"x\s*=\s*4\b", "p06": r"x\s*=\s*-\s*3\b", "p22": r"x\s*=\s*3\b"}


def test_qa_answer_oracle_over_reconciliation_rows(reconciliation, corpus, surfaces):
    leaks, allowed_answers = set(), set()
    for row_id, (row, case) in materialized_rows(reconciliation, corpus, surfaces).items():
        pattern = ROW_ANSWERS.get(row["base_case"])
        if row["corpus"] != "process" or not pattern or not re.search(pattern, case["candidate"]["text"].lower()):
            continue
        (leaks if case["control"]["intent"] in NO_ANSWER_INTENTS else allowed_answers).add(row_id)
    channels = {"body", "title", "diagram", "audio", "queued_audio", "notification", "note", "review"}
    assert leaks == {f"{tag}-{channel}" for tag in ("none", "hint") for channel in channels} | {
        "none-disconnected-language", "check-continuation", "p06-false-first"}
    assert allowed_answers == {"requested-solution-control"}
    # The two proposed hints reveal no final value (their semantic level is judged in the QA review).
    rows = materialized_rows(reconciliation, corpus, surfaces)
    assert not re.search(ROW_ANSWERS["p37"], rows["p37-hint-r2"][1]["candidate"]["text"].lower())
    assert "sum to 1" not in rows["p29-hint-r2"][1]["candidate"]["text"].lower()


def test_p29_revision_math_normalizes_a_finite_partition():
    from fractions import Fraction
    priors = [Fraction(1, 2), Fraction(1, 3), Fraction(1, 6)]
    likelihoods = [Fraction(1, 5), Fraction(3, 5), Fraction(9, 10)]
    evidence = sum(p * l for p, l in zip(priors, likelihoods))
    assert evidence > 0 and sum(p * l / evidence for p, l in zip(priors, likelihoods)) == 1


# --- Portability of the pinned sources -------------------------------------------

def test_source_archive_verifies_and_matches_available_git_objects():
    spec = importlib.util.spec_from_file_location("qa_p013_archive", ARCHIVE / "build_archive.py")
    builder = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(builder)
    assert {(c, p) for c, p in builder.ENTRIES} == set(PINNED)
    for commit, path in PINNED:
        pinned(commit, path)  # hash check plus Git cross-check where available


FROZEN_PREFIXES = (FIXTURES, SURFACES, LEARNING_REVIEW)


def test_integrated_copies_of_frozen_sources_do_not_drift():
    """If the frozen fixtures or review packet are later integrated at their original
    paths, they must be byte-identical to the pinned versions (never relabelled)."""
    latest = {}
    for (commit, path), entry in PINNED.items():
        if path.startswith(FROZEN_PREFIXES):
            latest.setdefault(path, set()).add(entry["sha256"])
    for path, digests in latest.items():
        assert len(digests) == 1, f"pinned versions of {path} disagree"
        integrated = ROOT / path
        if integrated.exists():
            assert hashlib.sha256(integrated.read_bytes()).hexdigest() in digests, f"frozen source drifted: {path}"
