"""Versioned PostgreSQL migrations, transaction-safe and serialized per database."""

from hashlib import sha256
from pathlib import Path


MIGRATIONS = Path(__file__).parent
MIGRATION_LOCK = 583908261004


def migrate(dsn: str, *, rollback: bool = False) -> list[str]:
    """Apply pending migrations or roll back the newest; caller authorizes erasure."""
    import psycopg

    if not dsn or not dsn.strip():
        raise ValueError("a PostgreSQL DSN is required")
    changed = []
    with psycopg.connect(dsn, connect_timeout=5) as connection:
        connection.execute("SELECT pg_advisory_xact_lock(%s)", (MIGRATION_LOCK,))
        connection.execute("CREATE SCHEMA IF NOT EXISTS lc_backend")
        connection.execute(
            "CREATE TABLE IF NOT EXISTS lc_backend.schema_migrations ("
            "version text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP)"
        )
        applied = dict(connection.execute("SELECT version, sha256 FROM lc_backend.schema_migrations").fetchall())
        files = {path.name.removesuffix(".up.sql"): path for path in sorted(MIGRATIONS.glob("*.up.sql"))}
        if set(applied) - set(files):
            raise RuntimeError("database contains unknown migrations; use the matching application revision")
        for version, digest in applied.items():
            if sha256(files[version].read_bytes()).hexdigest() != digest:
                raise RuntimeError("applied migration checksum changed: " + version)
        if rollback:
            if applied:
                version = max(applied)
                connection.execute((MIGRATIONS / (version + ".down.sql")).read_text())
                connection.execute("DELETE FROM lc_backend.schema_migrations WHERE version = %s", (version,))
                changed.append(version)
        else:
            for version, path in files.items():
                if version in applied:
                    continue
                connection.execute(path.read_text())
                connection.execute(
                    "INSERT INTO lc_backend.schema_migrations(version, sha256) VALUES (%s, %s)",
                    (version, sha256(path.read_bytes()).hexdigest()),
                )
                changed.append(version)
    return changed
