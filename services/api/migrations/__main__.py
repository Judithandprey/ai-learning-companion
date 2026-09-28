"""Read credentials only from the environment, never CLI arguments or logs."""

import argparse
import os
import sys

from . import migrate


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["apply", "rollback"])
    parser.add_argument("--database-env", default="LC_DATABASE_URL")
    parser.add_argument("--confirm-erasure", action="store_true", help="required for destructive rollback")
    args = parser.parse_args()
    dsn = os.environ.get(args.database_env)
    if not dsn:
        print("BLOCKED: required PostgreSQL DSN environment variable is absent", file=sys.stderr)
        return 2
    if args.action == "rollback" and not args.confirm_erasure:
        parser.error("rollback erases module tables; export originals and pass --confirm-erasure")
    try:
        changed = migrate(dsn, rollback=args.action == "rollback")
    except Exception as exc:
        # Connection exceptions can include a hostname/user/DSN: never print them.
        print("FAILED: PostgreSQL migration (" + type(exc).__name__ + ")", file=sys.stderr)
        return 1
    print(args.action + ": " + (", ".join(changed) or "no pending migration"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
