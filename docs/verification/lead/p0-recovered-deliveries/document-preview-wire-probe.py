"""Reproduce DP1 against the exact f0ecfe1 temporary package overlay."""

from copy import deepcopy
import json
from pathlib import Path
import sys

sys.path.insert(0, sys.argv[1])  # Exact extracted candidate package root.
from packages.contracts.document_preview import validate
from jsonschema import ValidationError

original = json.loads(Path(__file__).with_name("document-preview-saved-positive.json").read_text())
validate("SavedPreview", original)
print("coherent_saved_preview: ACCEPTED")

wrong_owner = deepcopy(original)
wrong_owner["source"]["user_id"] = "other-owner"

wrong_observation = deepcopy(original)
wrong_observation["observation"]["source_id"] = "other-source"
wrong_observation["observation"]["frame_id"] = "other-frame"

ai_note = deepcopy(original)
ai_note["note"]["authorship"] = "assistant"
ai_note["note"]["blocks"] = [{
    "id": "ai-1",
    "layer": "ai_supplement",
    "format": "text",
    "content": "AI answer supplied by another path",
}]

for label, payload in (
    ("source_owner_mismatch", wrong_owner),
    ("observation_source_frame_mismatch", wrong_observation),
    ("assistant_note_with_provider_unavailable", ai_note),
):
    try:
        validate("SavedPreview", payload)
    except ValidationError:
        print(f"{label}: REJECTED")
    else:
        print(f"{label}: ACCEPTED")
