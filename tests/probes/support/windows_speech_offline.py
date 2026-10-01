"""Run the adjacent synthetic-only Windows probe from WSL, with a fixed deadline."""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import subprocess


def run(output):
    script = Path(__file__).with_suffix(".ps1").read_bytes()
    command = ["powershell.exe", "-NoProfile", "-NonInteractive", "-EncodedCommand",
               base64.b64encode(script.decode("utf-8").encode("utf-16le")).decode("ascii")]
    receipt = {
        "probe_sha256": hashlib.sha256(script).hexdigest(),
        "assigned_baseline": "d37f7a442a78122fb351a7aab83ffdff8aec1448",
        "runner_status": "failed", "native_process_cleanup": "not_separately_observed",
    }
    # No GUI, device capture, credentials, service installation or user-app control.
    try:
        result = subprocess.run(command, cwd="/mnt/c", capture_output=True, timeout=60)
        receipt["owned_process_exit_code"] = result.returncode
        if result.returncode:
            receipt["failure"] = "powershell_nonzero_exit"
            receipt["stderr_bytes"] = len(result.stderr)
            receipt["stderr_sha256"] = hashlib.sha256(result.stderr).hexdigest()
        else:
            payload = json.loads(result.stdout.decode("utf-8-sig"))
            if type(payload) is not dict or type(payload.get("trials")) is not list:
                raise ValueError("invalid_probe_receipt")
            receipt.update(payload)
            receipt["runner_status"] = "completed"
    except subprocess.TimeoutExpired:
        receipt["failure"] = "wsl_launcher_timeout"
        # Killing/reaping a WSL launcher is not proof the native child exited.
    except (UnicodeError, ValueError):
        receipt["failure"] = "invalid_probe_receipt"
    except OSError:
        receipt["failure"] = "launcher_unavailable"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"runner_status": receipt["runner_status"], "output": str(output)}))
    return 0 if receipt["runner_status"] == "completed" else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    raise SystemExit(run(args.output))


if __name__ == "__main__":
    main()
