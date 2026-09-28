"""Install the pinned Linux x64 Node toolchain locally after verifying SHA-256."""

import hashlib
import io
from pathlib import Path
import platform
import tarfile
import urllib.request

VERSION = "24.21.0"
SHA256 = "fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6"
ROOT = Path(__file__).resolve().parents[1]


def main():
    if platform.system() != "Linux" or platform.machine() != "x86_64":
        raise SystemExit(f"Install Node {VERSION} for your platform using nodejs.org; this helper targets Linux x64 only.")
    name = f"node-v{VERSION}-linux-x64"
    target = ROOT / ".tools" / name
    if target.exists():
        raise SystemExit(f"Already exists: {target}. No files changed.")
    with urllib.request.urlopen(f"https://nodejs.org/dist/v{VERSION}/{name}.tar.xz", timeout=60) as response:
        archive = response.read()
    if hashlib.sha256(archive).hexdigest() != SHA256:
        raise SystemExit("Node archive checksum mismatch; refusing extraction")
    target.parent.mkdir(exist_ok=True)
    with tarfile.open(fileobj=io.BytesIO(archive), mode="r:xz") as tar:
        tar.extractall(target.parent, filter="data")
    print(f"Verified Node {VERSION}; add {target / 'bin'} to PATH for this shell.")


if __name__ == "__main__":
    main()
