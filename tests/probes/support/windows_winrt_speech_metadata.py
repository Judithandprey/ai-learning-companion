"""Run the fixed metadata-only WinRT probe once; preserve a sanitized receipt."""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import subprocess


def run(output):
    script = Path(__file__).with_suffix(".ps1").read_bytes()
    command = ["/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe",
               "-NoProfile", "-NonInteractive", "-EncodedCommand",
               base64.b64encode(script.decode().encode("utf-16-le")).decode("ascii")]
    receipt = {
        "assigned_baseline": "3f4580b058555b54922a876df0a7f05df1096ac3",
        "probe_sha256": hashlib.sha256(script).hexdigest(),
        "runner_status": "failed",
        "native_process_exit_observed": False,
    }
    # Reserve the receipt before invoking Windows; never overwrite prior evidence.
    with output.open("x", encoding="utf-8") as destination:
        try:
            process = subprocess.run(command, capture_output=True, timeout=35, cwd="/mnt/c")
            receipt["native_process_exit_code"] = process.returncode
            receipt["native_process_exit_observed"] = True
            if process.returncode:
                receipt["failure"] = "native_deadline" if process.returncode == 124 else "native_nonzero_exit"
                receipt["stderr_bytes"] = len(process.stderr)
                receipt["stderr_sha256"] = hashlib.sha256(process.stderr).hexdigest()
            else:
                observed = json.loads(process.stdout.decode("utf-8-sig"))
                if (type(observed) is not dict or observed.get("status") != "metadata_completed"
                        or observed.get("recognizer_constructed") is not False
                        or observed.get("recognition_started") is not False):
                    raise ValueError("invalid_metadata_receipt")
                receipt["observations"] = observed
                receipt["runner_status"] = "completed"
        except subprocess.TimeoutExpired:
            # An outer WSL timeout is not proof that Windows exited. Do not retry.
            receipt["failure"] = "outer_timeout_native_cleanup_unobserved"
        except (UnicodeError, ValueError):
            receipt["failure"] = "invalid_metadata_receipt"
        except OSError:
            receipt["failure"] = "launcher_unavailable"
        json.dump(receipt, destination, indent=2, ensure_ascii=False)
        destination.write("\n")
    print(json.dumps({"runner_status": receipt["runner_status"], "output": str(output)}))
    return 0 if receipt["runner_status"] == "completed" else 2


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True, help="New metadata JSON path")
    raise SystemExit(run(parser.parse_args().output))
