"""Review-only wall-clock replay: change only QA's imported read-guard utc_now.

Product runtime/HTTP still receive the exact test's fixed NOW clock.
"""
from datetime import timedelta

def pytest_collection_modifyitems(items):
    for item in items:
        if item.module.__name__.endswith('test_p0_13_pixel_admission_qa'):
            item.module.utc_now = lambda: item.module.NOW + timedelta(hours=2)
