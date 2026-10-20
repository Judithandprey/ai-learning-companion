"""Run the preserved S1 scenario once against the exact corrected source."""

import asyncio
import hashlib
import importlib.util
import json
from pathlib import Path
import sys


export = Path(sys.argv[1])
source = export / "services/worker/connectors/chatgpt_rpc.py"
probe = Path(__file__).with_name("pipe_close_timeout_4c5e071.py")
assert hashlib.sha256(source.read_bytes()).hexdigest() == "5793fa18b10ba6d1eb946cd2f27234e7bc2b6a7c8727ca871b3c050a75df6e4b"
assert hashlib.sha256(probe.read_bytes()).hexdigest() == "9d26049cdce02dc41e9e0fa6f8b43aca10afebb30dbe2334dfe8fe071625111e"
sys.path.insert(0, str(export))
spec = importlib.util.spec_from_file_location("preserved_s1_probe", probe)
original = importlib.util.module_from_spec(spec)
spec.loader.exec_module(original)
row = asyncio.run(original.scenario(
    original.load("corrected_connector", source), "correction-63ddf8e"
))
print(json.dumps({"python": sys.version, "row": row}, indent=2))
assert row["first_close"] == row["second_close_after_harness_reap"] == "returned"
assert row["returncode_at_first_close"] == row["harness_final_returncode"] == -9
assert row["process_wait_calls_at_first_close"] == 2
assert row["harness_final_transport_closing"]
assert row["loop_callback_errors"] == []
