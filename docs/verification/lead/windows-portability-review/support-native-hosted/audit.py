"""Audit retained hosted diagnostic evidence, without rerunning Windows."""
from pathlib import Path
import gzip
import hashlib
import json
import re
import subprocess

HERE = Path(__file__).resolve().parent
HEAD = "66e6be339eaad1f55691a069c76ed3ccf8ee1ac2"
RUN = 36769242351
URL = f"https://github.com/Judithandprey/ai-learning-companion/actions/runs/{RUN}"


def digest(data):
    return hashlib.sha256(data).hexdigest()


run = json.loads((HERE / "run.json").read_text())
artifacts = json.loads((HERE / "artifacts.json").read_text())
payload = "\n".join(line[2:] for line in (HERE / "probe.tap").read_text().splitlines()
                    if line.startswith("# "))
report, _ = json.JSONDecoder().raw_decode(payload)
assert run["headSha"] == HEAD and run["url"] == URL
assert run["status"] == "completed" and run["conclusion"] == "success"
assert len(run["jobs"]) == 1 and run["jobs"][0]["databaseId"] == 110071118357
assert run["jobs"][0]["conclusion"] == "success"
assert (HERE / "source.txt").read_text().splitlines() == [
    f"commit={HEAD}", f"run={URL}", "attempt=1"]
assert (HERE / "exit-code.txt").read_text().strip() == "0"
assert artifacts["total_count"] == 1
artifact, = artifacts["artifacts"]
assert artifact["id"] == 11121519239
assert artifact["workflow_run"]["id"] == RUN
assert artifact["workflow_run"]["head_sha"] == HEAD
assert artifact["name"] == f"windows-share-lock-{HEAD}-1"

hashes = {}
for line in (HERE / "SOURCE_SHA256SUMS").read_text().splitlines():
    match = re.fullmatch(r"([0-9a-f]{64}) [ *](.+)", line)
    assert match, line
    actual, path = match.groups()
    raw = subprocess.check_output(["git", "show", f"{HEAD}:{path}"])
    assert actual in {digest(raw), digest(raw.replace(b"\n", b"\r\n"))}, path
    hashes[path] = {"executed_sha256": actual, "git_sha256": digest(raw),
                    "representation": "raw" if actual == digest(raw) else "LF to CRLF"}
probe = gzip.decompress((HERE / "probe.mjs.gz").read_bytes())
assert digest(probe) == report["probe_sha256"]
assert digest(probe) == hashes["tests/probes/support/windows_share_lock.mjs"]["executed_sha256"]
assert report["parent"]["node"] == "v24.21.0" and report["parent"]["platform"] == "win32"
assert [arm["name"] for arm in report["results"]] == ["identity-share-none", "byte-range"]
original = report["target"]
assert original["bytes"] == 35
for arm in report["results"]:
    events = {event["event"]: event for event in arm["events"]}
    assert arm["held_identity_matches"] and arm["open_identities_match"]
    assert not events["held"]["closed"]
    assert arm["completed"] and arm["normal_release_passed"] and arm["stderr"] == ""
    assert arm["exit"] == {"code": 0, "signal": None}
    assert events["parent_release"]["at_ms"] < events["input_returned"]["at_ms"] <= events["disposed"]["at_ms"]
    assert events["input_returned"]["value"] == "release-probe"
    assert arm["after_release"] == {"denied": False, "bytes": 35, "sha256": original["sha256"]}
    for point in ("after_ready", "helper_path", "after_150ms"):
        observation = arm[point]
        opened = observation["open"]
        assert not opened["denied"] and opened["dev"] == original["dev"] and opened["ino"] == original["ino"]
        for read in (opened["fd_read"], observation["read"]):
            if arm["name"] == "byte-range":
                assert read["denied"] and read["code"] == "EBUSY" and read["syscall"] == "read"
            else:
                assert read == arm["after_release"]
    native = [event["result"] for event in arm["events"] if event["event"] == "native_open"]
    assert {(row["access"], row["flags"]) for row in native} == {
        (access, flags) for access in (2147483648, 1179785) for flags in (128, 33554560)}
    for row in native:
        if arm["name"] == "identity-share-none" and row["flags"] == 128:
            assert not row["opened"] and row["open_error"] == 32
            continue
        assert row["opened"] and row["identity"]["dev"] == original["dev"] and row["identity"]["ino"] == original["ino"]
        if arm["name"] == "byte-range":
            assert not row["read_ok"] and row["read_error"] == 33 and row["bytes_read"] == 0
        else:
            assert row["read_ok"] and row["bytes_read"] == 35
    if arm["name"] == "byte-range":
        assert arm["byte_range_precondition_passed"] and events["held"]["byte_range_locked"]
        assert events["input_returned"]["at_ms"] <= events["unlocked"]["at_ms"] <= events["disposed"]["at_ms"]
    for process in ("helper_privileges", "parent_privileges"):
        for privilege in ("SeBackupPrivilege", "SeRestorePrivilege"):
            assert events["opening"][process][privilege] == {"present": True, "enabled": True, "attributes": 2}
for key in ("own_temp_removed", "observation_complete", "identity_checks_passed",
            "byte_range_precondition_passed", "normal_release_passed"):
    assert report[key] is True
result = {"status": "PASS hosted diagnostic evidence audit; NOT uploader or product acceptance",
          "head": HEAD, "run": RUN, "source_hashes": hashes,
          "probe_decoded_sha256": digest(probe), "actual_module_tests": 1, "diagnostic_arms": 2,
          "byte_range_fd_and_path_read_denial": True, "same_file_identities": True,
          "normal_release_original_recovery": True,
          "limitation": "Backup-semantics flag effect observed with enabled privileges; privileges were not changed, so independent privilege causality is not established."}
(HERE / "audit.json").write_text(json.dumps(result, indent=2) + "\n")
(HERE / "report.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(result, indent=2))
