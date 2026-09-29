"""Original DP1 mutations, with the original source fixture envelope made real-document shaped."""
from copy import deepcopy
import json
from pathlib import Path
import sys

root = Path(sys.argv[1])
sys.path.insert(0, str(root))
from packages.contracts.document_preview import validate
from jsonschema import ValidationError

original = json.loads((root / "docs/verification/lead/p0-recovered-deliveries/document-preview-saved-positive.json").read_text())
try:
    validate("SavedPreview", original)
except ValidationError:
    print("unchanged_original_synthetic_fixture: REJECTED")
else:
    raise AssertionError("Corrected real-document envelope accepted old synthetic fixture")

original["source"]["type"] = "document"
original["source"]["provenance"] = {
    "origin": "user_authorized", "consent_scope": "learning",
    "attribution": "Imported by authenticated local user local-user",
    "license": "User-provided; rights not independently verified",
}
original["note"]["concept_ids"] = []
before = deepcopy(original)
validate("SavedPreview", original)
assert original == before
print("coherent_positive_original_bytes_requests_note: ACCEPTED_UNCHANGED")

wrong_owner = deepcopy(original)
wrong_owner["source"]["user_id"] = "other-owner"
wrong_observation = deepcopy(original)
wrong_observation["observation"]["source_id"] = "other-source"
wrong_observation["observation"]["frame_id"] = "other-frame"
ai_note = deepcopy(original)
ai_note["note"]["authorship"] = "assistant"
ai_note["note"]["blocks"] = [{
    "id": "ai-1", "layer": "ai_supplement", "format": "text",
    "content": "AI answer supplied by another path",
}]
for name, payload in (
    ("source_owner_mismatch", wrong_owner),
    ("observation_source_frame_mismatch", wrong_observation),
    ("assistant_note_with_provider_unavailable", ai_note),
):
    try:
        validate("SavedPreview", payload)
    except ValidationError:
        print(f"{name}: REJECTED")
    else:
        raise AssertionError(f"Invalid original mutation accepted: {name}")
