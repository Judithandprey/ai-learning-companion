"""Judge one QA-P07-01 reselect run (result.json from run.mjs with QA_SCENARIO=reselect).
Criteria written before the run. Prints PASS/FAIL per check; exits 1 on any FAIL.

Usage: python analyze_reselect.py <evidence dir> <expected baseline sha>
"""

import base64
import json
import sys
from pathlib import Path

result = json.loads(Path(sys.argv[1], "result.json").read_text())
expected_baseline = sys.argv[2]
v = result.get("values") or {}
checks = []
PHRASE_A, PHRASE_B, PHRASE_C = "eigenvalue check", "null space argument", "rank condition"
REQ_X, NOTE_X = "Is my determinant step right? 只检查这一步。", "My attempt: λ = 2 or λ = 3.\nKeep my words exactly. 🙂  "
NOTE_B = "Idea: pick v with Av = 0.\n我自己的想法"


def check(name, ok, detail=""):
    checks.append((bool(ok), name, detail))


def st(key):
    return v.get(key) or {}


prov = result.get("provenance") or {}
check("provenance: tested copy equals the exact candidate for apps/safari-extension, services, packages",
      prov.get("commit") == expected_baseline == result.get("baseline") and prov.get("files_checked", 0) > 0 and prov.get("mismatches") == [],
      f"{prov.get('files_checked')} files, commit {prov.get('commit')}")
check("run completed without harness/browser errors", result.get("passed") and not (result.get("browser") or {}).get("errors"), result.get("error", ""))
check("dedicated database verified", (result.get("database") or {}).get("verified_actual_target"))
ids = result.get("ids") or {}
X, B = ids.get("x"), ids.get("b")

relay = result.get("relay_log") or []
x_answers = [e.get("upstream_receipt") or {} for e in relay if "drop_after_commit" in (e.get("condition") or "")]
check("X: API committed and the answer was cut (first answer replayed=false)", x_answers and x_answers[0].get("note_id") == X
      and x_answers[0].get("persistence") == "server_committed" and x_answers[0].get("replayed") is False, f"{len(x_answers)} cut answer(s)")
ux = st("unknownX")
check("X: UI shows Outcome unknown with Retry", (ux.get("attempt") or {}).get("status") == "unknown" and ux.get("saveStatus", "").startswith("Outcome unknown")
      and (ux.get("buttons") or {}).get("retry"))
check("X: storage holds exactly one note while the outcome is unknown", (result["db_snapshots"].get("db-after-unknown-x") or {}).get("inventory", {}).get("note") == 1)

rb = st("refusedB")
check("while unknown, the second phrase is refused with the retry/discard notice", "not added: retry or discard the unsaved item first" in rb.get("notice", ""), rb.get("notice", ""))
check("the refusal keeps X's attempt, id and exact typed words", (rb.get("attempt") or {}) == {"status": "unknown", "item_id": X} and rb.get("selectedText") == PHRASE_A
      and rb.get("requestText") == REQ_X and rb.get("noteText") == NOTE_X)
check("the refused words are not left selected", v.get("selectionAfterRefusalB") == "", repr(v.get("selectionAfterRefusalB")))

rx = st("retriedX")
check("Retry confirms the same note, no duplicate made", (rx.get("attempt") or {}) == {"status": "committed", "item_id": X} and "no duplicate made" in rx.get("saveStatus", ""), rx.get("saveStatus", ""))
check("storage still holds exactly one note after Retry", (result["db_snapshots"].get("db-after-retry-x") or {}).get("inventory", {}).get("note") == 1)

ag = st("againB")
events = v.get("eventsAgain") or []
asked = [e for e in events if e.get("type") == "ask" and e.get("outcome") == "submitted"]
check("NAV -> ASK and a drag over exactly the refused phrase gives a new draft of it", ag.get("selectedText") == PHRASE_B and ag.get("attempt") is None
      and ag.get("saveStatus") == "Not saved yet.", f"selected={ag.get('selectedText')!r} attempt={ag.get('attempt')} status={ag.get('saveStatus')!r}")
check("the probe submitted that selection (no silent cancel)", asked and ((asked[-1].get("detail") or {}).get("selection") or {}).get("selected_text") == PHRASE_B
      and not any(e.get("type") == "capture_aborted" for e in events), json.dumps([e.get("type") for e in events]))
check("the new draft has its own request, not X's", ag.get("requestState", "") and ag.get("requestState") != rx.get("requestState"), ag.get("requestState", ""))

rc = st("refusedC")
check("with a note typed on the new draft, a third phrase is refused with the typed-words notice", "save or discard your typed words first (they are kept)" in rc.get("notice", ""), rc.get("notice", ""))
check("the typed note and the draft survive that refusal", rc.get("selectedText") == PHRASE_B and rc.get("noteText") == NOTE_B and rc.get("attempt") is None)
check("the third phrase is not left selected after its refusal", v.get("selectionAfterRefusalC") == "", repr(v.get("selectionAfterRefusalC")))

sb = st("savedB")
check("the new draft saves normally as a different note", (sb.get("attempt") or {}).get("status") == "committed" and B and B != X, sb.get("saveStatus", ""))
check("control: words selected in NAV, then clicked (no drag) in ASK, are asked about", v.get("selectionNavC") == PHRASE_C and st("clickedC").get("selectedText") == PHRASE_C,
      f"nav selection={v.get('selectionNavC')!r} draft={st('clickedC').get('selectedText')!r}")

final = (result["db_snapshots"].get("db-final") or {}).get("inventory", {})
check("final storage: exactly two notes and two revisions", final.get("note") == 2 and final.get("note_revision") == 2, str(final))
readback = result.get("readback") or {}
original = Path(f"/tmp/{result['run']}-original.txt").read_text(encoding="utf-8", newline="")
for key, phrase, note_text, payload in (("x", PHRASE_A, NOTE_X, v.get("payloadX") or {}), ("b", PHRASE_B, NOTE_B, v.get("payloadB") or {})):
    body = (readback.get(key) or {}).get("body") or {}
    check(f"direct readback {key.upper()}: exact original, selection, note and request as sent", (readback.get(key) or {}).get("status") == 200
          and base64.b64decode(body.get("content_base64", "")).decode("utf-8") == original
          and ((body.get("bridge_request") or {}).get("selection") or {}).get("selected_text") == phrase
          and body.get("user_note") == note_text and body.get("request") == payload.get("request") and body.get("frame") == payload.get("frame")
          and (body.get("note") or {}).get("authorship") == "user" and body.get("ai_status") == "provider_unavailable")
check("cleanup: own actor removed; ports released", (result.get("cleanup") or {}).get("own_actor_removed") and result.get("ports_released"))

for ok, name, detail in checks:
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f" | {detail}" if detail else ""))
failed = sum(not ok for ok, _, _ in checks)
print(f"\n{len(checks) - failed} PASS, {failed} FAIL")
sys.exit(1 if failed else 0)
