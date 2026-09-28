"""Check the P0-03 iPad capability matrix against contract 0.1.0 and evidence rules.

Run from the repository root:

    .venv/bin/python apps/ios/tools/check_capability_matrix.py
    .venv/bin/python apps/ios/tools/check_capability_matrix.py --self-test
    .venv/bin/python apps/ios/tools/check_capability_matrix.py --write-md

Each row's `result` must be a valid `CapabilityResult`. On top of the shared
shape, this checker rejects the evidence confusions P0-03 must avoid:

- a documentation claim reported as implemented/compiled/device-verified, or an
  executed status (including `failed`) without matching `source:`/`exec:`/`device:`
  evidence;
- a status that disagrees with the row's documentation basis, or a
  `documented`/`documented_absent` basis that cites no research claim whose
  (verifier-corrected) status is `documented`, or whose sources are all third
  party or developer-forum posts;
- unknown research claims, sources without an ISO access date, a gate row
  without a fallback, and device tests missing from the checklist.

The Markdown matrix table is generated from the JSON and must stay in sync.
Passing this check proves only that the matrix is internally consistent; it
proves nothing about iPadOS behavior.
"""

import copy
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))

from packages.contracts import validate  # noqa: E402
from jsonschema import ValidationError  # noqa: E402

PLATFORM = ROOT / "docs/verification/platform"
MATRIX = PLATFORM / "p0-03-capability-matrix.json"
MATRIX_MD = PLATFORM / "p0-03-capability-matrix.md"
CHECKLIST = PLATFORM / "p0-03-device-checklist.md"
ARCHIVE = PLATFORM / "research/p0-03-verified-claims.json"
BEGIN, END = "<!-- matrix:begin (generated) -->", "<!-- matrix:end -->"

# Documentation basis → the only status it may carry before any execution.
BASIS_STATUS = {
    "documented": "documented",
    "documented_absent": "unsupported",
    "inferred": "not_tested",
    "undocumented": "not_tested",
    "third_party_only": "not_tested",
}
# Source kind → table label. Only DTS replies count as Apple statements among forum posts.
SOURCE_LABELS = {
    "apple_doc": "A", "wwdc": "W", "apple_support": "S", "apple_news": "N",
    "apple_forum_dts": "F", "apple_forum_staff": "E", "developer_forum": "D",
    "microsoft_learn": "M", "vendor_help": "V", "vendor_sdk_doc": "V",
    "third_party": "T", "local_command": "L",
}
NON_PRIMARY_KINDS = {"third_party", "developer_forum"}
STAGES = ("implementation", "compilation", "automated", "provider", "device")
STAGE_PREFIX = {"implementation": "source:", "compilation": "exec:", "automated": "exec:",
                "provider": "exec:", "device": "device:"}
# Status → check stage that must pass, proven by that stage's evidence prefix.
EXECUTED_PASS = {
    "implemented": "implementation",
    "compiled": "compilation",
    "automated_pass": "automated",
    "device_pass": "device",
}
EVIDENCE = re.compile(r"^(research|source|exec|device):\S+$")
ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class MatrixError(Exception):
    pass


def research_statuses() -> dict:
    """Research claim id → final (verifier-corrected) status."""
    archive = json.loads(ARCHIVE.read_text(encoding="utf-8"))
    claims = [c for d in archive["dimensions"] for c in d["claims"] + d["verifier_added"]]
    claims += archive["critic"]["claims"] + archive.get("review_addenda", {}).get("claims", [])
    return {c["id"]: c["status"] for c in claims}


def _has(evidence: list, prefix: str) -> bool:
    return any(item.startswith(prefix) for item in evidence)


def check_row(row: dict, research: dict) -> None:
    rid = row.get("id", "<missing id>")
    for field in ("id", "requirement_ids", "role", "doc_basis", "sources", "result", "device_tests"):
        if field not in row:
            raise MatrixError(f"{rid}: missing {field}")
    if row["role"] not in {"preferred", "fallback", "limitation", "environment"}:
        raise MatrixError(f"{rid}: unknown role {row['role']!r}")
    basis = row["doc_basis"]
    if basis not in BASIS_STATUS:
        raise MatrixError(f"{rid}: unknown doc_basis {basis!r}")
    try:
        validate("CapabilityResult", row["result"])
    except ValidationError as error:
        raise MatrixError(f"{rid}: CapabilityResult invalid: {error.message}") from error

    if not row["sources"]:
        raise MatrixError(f"{rid}: at least one source is required")
    for source in row["sources"]:
        for field in ("url", "title", "kind", "page_date", "accessed"):
            if not source.get(field):
                raise MatrixError(f"{rid}: source missing {field}")
        if source["kind"] not in SOURCE_LABELS:
            raise MatrixError(f"{rid}: unknown source kind {source['kind']!r}")
        if source["kind"] != "local_command" and not source["url"].startswith("https://"):
            raise MatrixError(f"{rid}: source URL must be https")
        if not ISO_DATE.match(source["accessed"]):
            raise MatrixError(f"{rid}: source accessed date must be YYYY-MM-DD")

    result = row["result"]
    status, checks, evidence = result["status"], result["checks"], result["evidence"]
    if not result["fallback"].strip():
        raise MatrixError(f"{rid}: row needs a fallback")
    bad = [e for e in evidence if not EVIDENCE.match(e)]
    if bad:
        raise MatrixError(f"{rid}: malformed evidence {bad}")

    # Every executed stage outcome needs matching executed evidence.
    for stage in STAGES:
        if checks[stage] in {"pass", "fail"} and not _has(evidence, STAGE_PREFIX[stage]):
            raise MatrixError(f"{rid}: checks.{stage}={checks[stage]} without '{STAGE_PREFIX[stage]}' evidence")
    executed = [s for s in STAGES if checks[s] in {"pass", "fail"}]

    if status in EXECUTED_PASS:
        if checks[EXECUTED_PASS[status]] != "pass":
            raise MatrixError(f"{rid}: status {status} needs checks.{EXECUTED_PASS[status]}=pass")
    elif status == "failed":
        if not any(checks[s] == "fail" for s in STAGES):
            raise MatrixError(f"{rid}: failed needs a stage with checks=fail")
    elif status == "needs_auth":
        if checks["provider"] == "pass" or not _has(evidence, "exec:"):
            raise MatrixError(f"{rid}: needs_auth needs a non-passing provider check and exec: evidence")
    elif status == "unsupported" and executed:
        if not any(checks[s] == "fail" for s in STAGES):
            raise MatrixError(f"{rid}: executed unsupported needs a stage with checks=fail")
    else:  # documentation-only statuses: documented, unsupported, not_tested
        if executed:
            raise MatrixError(f"{rid}: {status} cannot carry executed stages {executed}")
        if status != BASIS_STATUS[basis]:
            raise MatrixError(f"{rid}: doc_basis {basis} cannot carry status {status}")
        wants_doc = "pass" if status in {"documented", "unsupported"} else "not_tested"
        if checks["documentation"] != wants_doc:
            raise MatrixError(f"{rid}: {status} requires documentation={wants_doc}")

    refs = [e.split(":", 1)[1] for e in evidence if e.startswith("research:")]
    if not refs:
        raise MatrixError(f"{rid}: no research claim reference")
    unknown = [r for r in refs if r not in research]
    if unknown:
        raise MatrixError(f"{rid}: unknown research claims {unknown}")
    if basis in {"documented", "documented_absent"}:
        if not any(research[r] == "documented" for r in refs):
            raise MatrixError(f"{rid}: {basis} basis cites no documented research claim")
        if all(s["kind"] in NON_PRIMARY_KINDS for s in row["sources"]):
            raise MatrixError(f"{rid}: {basis} basis needs a primary (non third-party/forum) source")


def check_matrix(matrix: dict) -> Counter:
    if matrix.get("contract_version") != "0.1.0":
        raise MatrixError("matrix must declare contract_version 0.1.0")
    research = research_statuses()
    checklist = CHECKLIST.read_text(encoding="utf-8")
    seen, counts = set(), Counter()
    for row in matrix["rows"]:
        if row.get("id") in seen:
            raise MatrixError(f"duplicate row id {row.get('id')}")
        seen.add(row.get("id"))
        check_row(row, research)
        missing = [t for t in row["device_tests"] if f"#### {t} " not in checklist]
        if missing:
            raise MatrixError(f"{row['id']}: device tests not in checklist: {missing}")
        counts[(row["result"]["gate"], row["result"]["status"])] += 1
    return counts


def _cell(text: str) -> str:
    return text.replace("|", "\\|").replace("\n", " ")


def render_markdown(matrix: dict) -> str:
    """One table per gate present; source links are labeled by kind."""
    counts = Counter(r["result"]["status"] for r in matrix["rows"])
    lines = ["Row counts: " + ", ".join(f"{status} {n}" for status, n in sorted(counts.items()))
             + f" (total {len(matrix['rows'])}).", ""]
    for gate in sorted({r["result"]["gate"] for r in matrix["rows"]}):
        lines += [f"### {gate}", "",
                  "| ID | Capability | OS / SDK | Basis → status | Role | Limitation → fallback | Device tests | Sources |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- |"]
        for r in (r for r in matrix["rows"] if r["result"]["gate"] == gate):
            res = r["result"]
            links = " ".join(f"[{SOURCE_LABELS[s['kind']]}{i}]({s['url']})"
                             for i, s in enumerate(r["sources"], 1))
            lines.append("| " + " | ".join(_cell(x) for x in (
                r["id"], res["capability"], r["os_sdk"], f"{r['doc_basis']} → **{res['status']}**",
                r["role"], f"{res['limitation']} → {res['fallback']}",
                ", ".join(r["device_tests"]) or "—", links)) + " |")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def sync_markdown(matrix: dict, write: bool) -> None:
    text = MATRIX_MD.read_text(encoding="utf-8")
    head, begin, rest = text.partition(BEGIN + "\n")
    _, end, tail = rest.partition(END)
    if not begin or not end:
        raise MatrixError(f"{MATRIX_MD.name} lacks generated-table markers")
    expected = head + BEGIN + "\n" + render_markdown(matrix) + END + tail
    if write:
        MATRIX_MD.write_text(expected, encoding="utf-8")
    elif expected != text:
        raise MatrixError(f"{MATRIX_MD.name} table is out of sync; run --write-md")


def self_test(matrix: dict) -> None:
    """Known-bad mutations must be rejected; a well-formed device failure must be accepted."""
    research = research_statuses()
    base = next(r for r in matrix["rows"] if r["result"]["status"] == "documented")
    inferred_ref = next(i for i, s in research.items() if s == "inferred")

    def device_claim(row):
        row["result"]["status"] = "device_pass"
        row["result"]["checks"]["device"] = "pass"

    def compile_claim(row):
        row["result"]["checks"]["compilation"] = "pass"

    def bare_device_prefix(row):
        device_claim(row)
        row["result"]["evidence"].append("device:")

    def no_source_date(row):
        row["sources"][0]["page_date"] = ""

    def undated_access(row):
        row["sources"][0]["accessed"] = "someday"

    def no_fallback(row):
        row["result"]["fallback"] = " "

    def bad_contract(row):
        row["result"]["status"] = "works"

    def doc_without_doc(row):
        row["result"]["checks"]["documentation"] = "not_tested"

    def inferred_as_documented(row):
        row["doc_basis"] = "inferred"

    def unknown_research(row):
        row["result"]["evidence"] = ["research:D9-99"]

    def documented_citing_inferred(row):
        row["result"]["evidence"] = [f"research:{inferred_ref}"]

    def documented_third_party_only(row):
        for source in row["sources"]:
            source["kind"] = "third_party"

    def failed_without_evidence(row):
        row["result"]["status"] = "failed"
        row["result"]["checks"]["device"] = "fail"

    rejects = (device_claim, compile_claim, bare_device_prefix, no_source_date, undated_access,
               no_fallback, bad_contract, doc_without_doc, inferred_as_documented,
               unknown_research, documented_citing_inferred, documented_third_party_only,
               failed_without_evidence)
    for mutate in rejects:
        row = copy.deepcopy(base)
        mutate(row)
        try:
            check_row(row, research)
        except MatrixError:
            print(f"self-test reject {mutate.__name__}: ok")
            continue
        raise SystemExit(f"self-test FAILED: {mutate.__name__} was accepted")

    row = copy.deepcopy(base)
    row["result"]["status"] = "failed"
    row["result"]["checks"]["device"] = "fail"
    row["result"]["evidence"].append("device:docs/verification/platform/device/example/log.jsonl")
    check_row(row, research)
    print("self-test accept device-evidenced failure: ok")


def main() -> None:
    matrix = json.loads(MATRIX.read_text(encoding="utf-8"))
    try:
        counts = check_matrix(matrix)
        sync_markdown(matrix, write="--write-md" in sys.argv)
    except MatrixError as error:
        raise SystemExit(f"capability matrix INVALID: {error}")
    print(f"capability matrix valid: {sum(counts.values())} rows, contract 0.1.0, markdown in sync")
    for (gate, status), count in sorted(counts.items()):
        print(f"  {gate} {status}: {count}")
    if "--self-test" in sys.argv:
        self_test(matrix)


if __name__ == "__main__":
    main()
