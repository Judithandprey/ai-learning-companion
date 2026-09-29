"""Judge one QA preview-recovery run (result.json from run.mjs). The criteria were written before
the run. Prints PASS/FAIL per check and exits 1 on any FAIL.

Usage: python analyze.py <evidence dir>
"""

import base64
import json
import sys
from pathlib import Path

result = json.loads(Path(sys.argv[1], "result.json").read_text())
v = result.get("values") or {}
checks = []


def check(name, ok, detail=""):
    checks.append((bool(ok), name, detail))


def text(key, field):
    return str((v.get(key) or {}).get(field) or "")


check("run completed without harness/browser errors", result.get("passed") and not (result.get("browser") or {}).get("errors"), result.get("error", ""))
check("dedicated database verified", (result.get("database") or {}).get("verified_actual_target"))
ids = result.get("ids") or {}
X, Y, Z = ids.get("x"), ids.get("y"), ids.get("z")
check("three distinct note ids", X and Y and Z and len({X, Y, Z}) == 3, str(ids))
check("document registered with the exact original sha256", text("connected", "sourceState") == "registered"
      and (v.get("connected") or {}).get("renderedSha") == result["document"]["sha256"])

# X: commit happened, answer lost -> unknown with retry/discard, same id kept
relay = result.get("relay_log") or []
x_drops = [e for e in relay if e.get("condition", "") and "drop_after_commit" in e["condition"] and (e.get("upstream_receipt") or {}).get("note_id") == X]
check("X: relay forwarded the save, API committed (200 server_committed), answer was cut", x_drops and all(e["upstream_status"] == 200 and e["upstream_receipt"]["persistence"] == "server_committed" for e in x_drops), f"{len(x_drops)} dropped answer(s)")
ux = v.get("unknownX") or {}
check("X: UI shows Outcome unknown, not saved", (ux.get("attempt") or {}).get("status") == "unknown" and ux.get("saveStatus", "").startswith("Outcome unknown"), ux.get("saveStatus", ""))
check("X: Retry and Discard offered, Close disabled", (ux.get("buttons") or {}).get("retry") and (ux.get("buttons") or {}).get("discard") and not (ux.get("buttons") or {}).get("close"))
check("X: typed request/note kept in the payload exactly", (v.get("payloadX") or {}).get("request_text") == "Is my determinant step right? 只检查这一步。" and (v.get("payloadX") or {}).get("user_note") == "My attempt: λ = 2 or λ = 3.\nKeep my words exactly. 🙂  ")
snap = (result.get("db_snapshots") or {})
check("X: storage already holds exactly one note (the lost answer's commit)", (snap.get("db-after-unknown-x") or {}).get("inventory", {}).get("note") == 1)

# Guards while X is unknown
check("guard: beforeunload handler prevents leaving with an unknown outcome", v.get("guardUnloadX") is True)
go = v.get("guardOpenX") or {}
check("guard: opening another file is refused and the original stays", go.get("openStatus", "").startswith("Not opened: save, retry or discard") and (go.get("document") or {}).get("sha256") == result["document"]["sha256"], go.get("openStatus", ""))
gs = v.get("guardSelectX") or {}
check("guard: a new selection is not bound to the unknown item", "not added" in gs.get("notice", "") and gs.get("selectedText") == "eigenvalue check", gs.get("notice", ""))  # refused phrase: rank condition

# Retry -> replayed receipt, same id, no duplicate
rx = v.get("retriedX") or {}
check("X: Retry confirmed the same note, no duplicate made", (rx.get("attempt") or {}).get("status") == "committed" and (rx.get("attempt") or {}).get("item_id") == X
      and "no duplicate made" in rx.get("saveStatus", "") and X in rx.get("saveStatus", ""), rx.get("saveStatus", ""))
check("X: storage still holds exactly one note after the retry", (snap.get("db-after-retry-x") or {}).get("inventory", {}).get("note") == 1)

# Typed draft guard
check("guard: typed-but-unsaved words block leaving", v.get("guardUnloadTyped") is True)
gt = v.get("guardOpenTyped") or {}
check("guard: typed-but-unsaved words block opening another file", gt.get("openStatus", "").startswith("Not opened: save, retry or discard") and gt.get("requestText") == "Only a hint, please; let me try first.", gt.get("openStatus", ""))

# Y: committed, answer lost, discarded while reads are cut -> pending in the list
y_drops = [e for e in relay if "drop_after_commit" in (e.get("condition") or "") and (e.get("upstream_receipt") or {}).get("note_id") == Y]
check("Y: API committed, answer cut", y_drops and all(e["upstream_status"] == 200 for e in y_drops), f"{len(y_drops)} dropped answer(s)")
check("Y: storage holds two notes after Y's lost answer", (snap.get("db-after-unknown-y") or {}).get("inventory", {}).get("note") == 2)
dy = v.get("discardedY") or {}
check("Y: after Discard with reads cut, Y stays listed as not confirmed", Y in (dy.get("savedItems") or []) and "not confirmed" in dy.get("savedStatus", ""), dy.get("savedStatus", ""))

# Z: never reached the API
z_cut = [e for e in relay if "drop_before_forward" in (e.get("condition") or "")]
check("Z: save was cut before reaching the API", z_cut and (v.get("unknownZ") or {}).get("attempt", {}).get("status") == "unknown", f"{len(z_cut)} cut request(s)")

# Reload + reconnect: pending recovered
rl = v.get("reloaded") or {}
check("reload: token forgotten, no document, nothing unsaved", (rl.get("api") or {}).get("status") == "disconnected" and rl.get("document") is None)
rc = v.get("reconnected") or {}
check("reconnect: list has X and Y saved, Z not confirmed", sorted(rc.get("savedItems") or []) == sorted([X, Y, Z]) and "2 saved item(s), 1 not confirmed" in rc.get("savedStatus", ""), rc.get("savedStatus", ""))
ry = v.get("reopenedY") or {}
check("reopen Y: exact original from storage, hashes verified", (ry.get("document") or {}).get("reopened") and ry.get("renderedSha") == result["document"]["sha256"]
      and "match their SHA-256" in ry.get("openStatus", ""), ry.get("openStatus", ""))
check("reopen Y: selection, request and note exact, user note separate from AI", "null space argument" in ry.get("reopened", "") and "Only a hint, please; let me try first." in ry.get("reopened", "")
      and "Idea: pick v with Av = 0.\n我自己的想法" in ry.get("reopened", "") and "not an AI response" in ry.get("reopened", "") and "provider unavailable" in ry.get("reopened", ""))
rz = v.get("reopenZ") or {}
check("reopen Z: not found yet, stays listed as not confirmed (no false drop)", "not found this note yet" in rz.get("openStatus", "") and Z in (rz.get("savedItems") or []), rz.get("openStatus", ""))

# Storage and direct readback (fresh client, bypassing the relay)
final = snap.get("db-final") or {}
check("final storage: exactly two notes, one revision each, two preview_save records", final.get("inventory", {}).get("note") == 2 and final.get("inventory", {}).get("note_revision") == 2 and final.get("inventory", {}).get("preview_save") == 2, str(final.get("inventory")))
rb = result.get("readback") or {}
for key, payload in (("x", v.get("payloadX") or {}), ("y", v.get("payloadY") or {})):
    body = (rb.get(key) or {}).get("body") or {}
    ok = (rb.get(key) or {}).get("status") == 200 and body.get("request_text") == payload.get("request_text") and body.get("user_note") == payload.get("user_note") \
        and body.get("frame") == payload.get("frame") and body.get("bridge_request") == payload.get("bridge_request") and body.get("request") == payload.get("request") \
        and base64.b64decode(body.get("content_base64", "")).decode("utf-8") == Path(f"/tmp/{result['run']}-original.txt").read_text(encoding="utf-8", newline="") \
        and body.get("note", {}).get("authorship") == "user" and body.get("ai_status") == "provider_unavailable"
    check(f"direct readback {key.upper()}: original, context and user text equal what was sent", ok)
check("direct readback Z: 404 not_found (never committed)", (rb.get("z") or {}).get("status") == 404, str(rb.get("z")))
check("cleanup: own actor removed; ports released", (result.get("cleanup") or {}).get("own_actor_removed") and result.get("ports_released"))

for ok, name, detail in checks:
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f" | {detail}" if detail else ""))
failed = sum(not ok for ok, _, _ in checks)
print(f"\n{len(checks) - failed} PASS, {failed} FAIL")
sys.exit(1 if failed else 0)
