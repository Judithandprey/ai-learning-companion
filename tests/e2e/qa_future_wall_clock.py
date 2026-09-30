"""pytest plugin (QA check only): after collection, every services module's wall clock `utc_now` returns a time
two days after the test's fixed NOW (2026-09-30T13:00Z), past the 1-hour test token expiry. Test code that passes
an explicit clock is unaffected; anything still reading the wall clock sees the future."""
import sys
from datetime import datetime, timezone

FUTURE = datetime(2026, 10, 2, 12, 0, tzinfo=timezone.utc)


def pytest_collection_finish(session):
    patched = []
    for name, module in list(sys.modules.items()):
        if (name.startswith("services.") or name.startswith("test_p0_13")) and callable(getattr(module, "utc_now", None)):
            module.utc_now = lambda: FUTURE
            patched.append(name)
    print(f"\nqa_future_wall_clock: utc_now -> {FUTURE.isoformat()} in {len(patched)} modules: {sorted(patched)}")
