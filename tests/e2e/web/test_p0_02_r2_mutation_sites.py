"""Keep the P0-02 round-2 mutation harness honest: every QA revert site exists once.

The browser mutation runs themselves are recorded evidence (docs/verification/qa/
p0-02-r2/qa-mutations.json); this check only fails if the fixed code moves so the
recorded reverts would no longer apply.
"""

import importlib.util
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("qa_p0_02_mutations", HERE / "run_p0_02_r2_mutations.py")
harness = importlib.util.module_from_spec(spec)
spec.loader.exec_module(harness)


@pytest.mark.parametrize("mutation_id", sorted(harness.MUTATIONS))
def test_mutation_site_is_unique_in_current_code(mutation_id):
    for rel, old, _new in harness.MUTATIONS[mutation_id]["edits"]:
        assert (harness.MODULE / rel).read_text().count(old) == 1, (mutation_id, rel)
