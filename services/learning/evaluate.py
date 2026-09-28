"""Reproduce the frozen local baseline and retain every ranked result/failure."""

import argparse
from collections import Counter
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import platform
import subprocess
import sys
import tempfile
from time import perf_counter

from .archive import FixtureArchive, canonical, digest, identity
from .retrieval import B, K1, VERSION, RetrievalIndex

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / "tests/fixtures/memory"


def hashes(root):
    return {str(p.relative_to(root)): digest(p.read_bytes()) for p in sorted(root.rglob("*"))
            if p.is_file() and "__pycache__" not in p.parts}


def percentile(values, p):
    return sorted(values)[max(0, math.ceil(p * len(values)) - 1)]


def signatures(index, queries):
    return {q["id"]: [identity(h) for h in index.search(q["query"], user_id="synthetic-learner")["hits"]]
            for q in queries}


def run_candidate(index, queries, labels, metadata):
    results = []
    for item in queries:
        started = perf_counter()
        found = index.search(item["query"], user_id="synthetic-learner", metadata=metadata)
        elapsed = (perf_counter() - started) * 1000
        targets = labels[item["id"]]["required"]
        observed = [identity(h) for h in found["hits"]]
        recalled = [target for target in targets if target in observed]
        results.append({**item, "expected": targets, "status": found["status"], "hits": found["hits"],
                        "latency_ms": elapsed, "evidence_recall_at_5": len(recalled) / len(targets),
                        "all_required_at_5": len(recalled) == len(targets),
                        "failure": None if len(recalled) == len(targets) else {
                            "missing": [t for t in targets if t not in observed],
                            "reason": "no_lexical_match" if not observed else "required_evidence_outside_top_5"}})
    summary = {}
    for group in ("exact", "fuzzy"):
        rows = [r for r in results if r["group"] == group]
        times = [r["latency_ms"] for r in rows]
        summary[group] = {"sample_count": len(rows), "all_required_count": sum(r["all_required_at_5"] for r in rows),
                          "all_required_rate": sum(r["all_required_at_5"] for r in rows) / len(rows),
                          "mean_evidence_recall_at_5": sum(r["evidence_recall_at_5"] for r in rows) / len(rows),
                          "latency_ms": {"sample_count": len(times), "p50": percentile(times, .5), "p95": percentile(times, .95), "max": max(times)},
                          "failure_ids": [r["id"] for r in rows if r["failure"]]}
    return {"summary": summary, "results": results}


def evaluate(output: Path):
    output = output.resolve()
    if output == FIXTURES or output.is_relative_to(FIXTURES):
        raise ValueError("Evaluation output cannot overwrite fixtures")
    output.mkdir(parents=True, exist_ok=True)
    before = hashes(FIXTURES)
    queries = json.loads((FIXTURES / "queries.json").read_text())
    labels = json.loads((FIXTURES / "labels.json").read_text())
    if Counter(q["group"] for q in queries) != Counter({"exact": 50, "fuzzy": 30}):
        raise ValueError("Unexpected benchmark size")
    if len({q["id"] for q in queries}) != len(queries) or set(labels) != {q["id"] for q in queries}:
        raise ValueError("Query/label identities differ")
    start = perf_counter()
    archive = FixtureArchive.load(FIXTURES)
    load_ms = (perf_counter() - start) * 1000
    actual = [identity(e) for e in archive.events.values()]
    if any(target not in actual for label in labels.values() for target in label["required"]):
        raise ValueError("A judgment names a nonexistent original anchor")
    start = perf_counter()
    index = RetrievalIndex(archive)
    build_ms = (perf_counter() - start) * 1000
    # Freeze inputs and implementation before the first scored query.
    preflight = {"fixture_file_hashes": before, "implementation_hashes": hashes(ROOT / "services/learning"),
                 "algorithm": VERSION, "k1": K1, "b": B, "tuning": "none; constants fixed before scored run"}
    (output / "preflight.json").write_bytes(canonical(preflight) + b"\n")
    candidates = {"lexical_only": run_candidate(index, queries, labels, False),
                  "lexical_metadata": run_candidate(index, queries, labels, True)}
    with tempfile.TemporaryDirectory(prefix="p005-index-") as temp:
        index_path = Path(temp) / "index.json"
        index.save(index_path)
        index_hash = digest(index_path.read_bytes())
        # Fresh OS process, no inherited Python state or model context.
        child = subprocess.run([sys.executable, "-m", "services.learning.evaluate", "--restart-probe", str(index_path)],
                               cwd=ROOT, capture_output=True, text=True, check=True)
        restarted = json.loads(child.stdout)
        fresh = RetrievalIndex(FixtureArchive.load(FIXTURES))
        fresh.save(index_path)
        deterministic = digest(index_path.read_bytes()) == index_hash
        signature = digest(canonical(signatures(index, queries)))
        restart_ok = restarted["signature"] == signature
        rebuild_ok = digest(canonical(signatures(fresh, queries))) == signature
    after = hashes(FIXTURES)
    preservation = {"file_hashes_unchanged": before == after, "deterministic_index_bytes": deterministic,
                    "restart_rankings_equal": restart_ok, "rebuild_rankings_equal": rebuild_ok,
                    "restart_process_executed": True, "result_signature": signature,
                    "archive_fingerprint": archive.fingerprint,
                    "later_observations": sum(k[1].startswith("later-") for k in archive.events),
                    "early_detail_retrieved": next(r["all_required_at_5"] for r in candidates["lexical_metadata"]["results"] if r["id"] == "exact-15-1"),
                    "model_switch_tested": False, "context_compaction_tested": False}
    if not all((before == after, deterministic, restart_ok, rebuild_ok)):
        raise AssertionError("Preservation or reproducibility regression")
    report = {"task": "P0-05", "created_at": datetime.now(timezone.utc).isoformat(),
              "baseline_commit": "91019c3fd548e47aca632136012bb961c4af07cb", "contract_version": "0.1.0",
              "environment": {"python": sys.version, "platform": platform.platform()}, "preflight": preflight,
              "counts": {"sources": len(archive.sources), "frames": len(archive.frames), "observations": len(archive.events), "queries": len(queries)},
              "timing_ms": {"archive_load_and_validate": load_ms, "index_build": build_ms},
              "usage": {"provider_calls": 0, "paid_api_calls": 0, "provider_tokens": 0, "api_cost_cny_fen": 0,
                        "local_compute_cost": "not priced; timings reported", "reason": "No provider/network clients in evaluated retrieval path"},
              "preservation": preservation, "candidates": candidates,
              "g6": {"status": "incomplete", "graphiti": "not_run", "reason": "No executed Graphiti comparison; dependency/model/budget plan requires lead coordination"},
              "limitations": ["Synthetic English-first authored benchmark; not independently human-labeled or representative of real users.",
                              "No semantic/vector retrieval, translation, natural-language metadata extraction, notes integration or image recognition.",
                              "Source links and SVGs are synthetic; no course/provider/device connected.",
                              "Current mode uses latest source versions and explicit correction links; history retains originals.",
                              "Large later fixture material tests preservation, not actual model context compaction or model switching."]}
    (output / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    failures = [{"candidate": name, **row} for name, candidate in candidates.items() for row in candidate["results"] if row["failure"]]
    (output / "failures.json").write_text(json.dumps(failures, ensure_ascii=False, indent=2) + "\n")
    summary = {"counts": report["counts"], "candidates": {k: v["summary"] for k, v in candidates.items()},
               "preservation": preservation, "usage": report["usage"], "g6": report["g6"]}
    (output / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=Path("/tmp/p005-evaluation"))
    parser.add_argument("--restart-probe", type=Path)
    args = parser.parse_args()
    if args.restart_probe:
        archive = FixtureArchive.load(FIXTURES)
        queries = json.loads((FIXTURES / "queries.json").read_text())
        index = RetrievalIndex.load(archive, args.restart_probe)
        print(json.dumps({"signature": digest(canonical(signatures(index, queries)))}))
    else:
        evaluate(args.output)
