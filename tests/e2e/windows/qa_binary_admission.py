"""Read the official launcher bytes and apply the released binary admission gate.

Run with the exact private services/packages copy as cwd. This never executes
Codex, constructs a client, enters managed state, or reads credentials.
"""

from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path.cwd()))
from services.worker.connectors import chatgpt_launch
from services.worker.connectors.chatgpt_rpc import RPCError


def observe(executable):
    launcher = Path(executable)
    resolved = launcher.resolve(strict=True)
    with resolved.open("rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    result = {
        "kind": "released-binary-admission-only",
        "observed_at": datetime.now(timezone.utc).isoformat(),
        "launcher": str(launcher),
        "resolved_executable": str(resolved),
        "actual_sha256": digest,
        "supported_version": chatgpt_launch.SUPPORTED_VERSION,
        "expected_linux_x86_64_sha256": chatgpt_launch.SUPPORTED_BINARY_SHA256,
        "client_created": False,
        "codex_executed": False,
        "managed_state_or_credentials_read": False,
        "account_lock_acquired": False,
        "provider_requests": 0,
    }
    try:
        result["identity"] = chatgpt_launch._binary_identity(str(launcher))
        result["admission"] = "accepted"
    except RPCError as error:
        result["admission"] = "rejected"
        result["error_code"] = error.code
    return result


if __name__ == "__main__":
    print(json.dumps(observe(sys.argv[1]), indent=2))
