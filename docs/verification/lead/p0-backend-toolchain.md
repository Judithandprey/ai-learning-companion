# P0 backend toolchain preparation

Date: 2026-09-28 UTC. This is lead-owned dependency preparation, not a backend
implementation or database test. Exact release metadata was read from each
package's official PyPI JSON endpoint and pinned in `pyproject.toml` / `uv.lock`:

- [FastAPI 0.141.1](https://pypi.org/project/fastapi/0.141.1/)
- [Uvicorn 0.54.0](https://pypi.org/project/uvicorn/0.54.0/)
- [Psycopg 3.3.6](https://pypi.org/project/psycopg/3.3.6/) including binary extra
- [HTTPX 0.28.1](https://pypi.org/project/httpx/0.28.1/)

Install: `uv sync --frozen --extra backend --group backend-test`.
The optional group preserves the smaller default contract-only environment.

Executed in main's Python 3.14.4 virtual environment:

- Imported all four fixed packages: pass.
- A temporary in-memory FastAPI async `/probe` endpoint through
  `httpx.AsyncClient(transport=httpx.ASGITransport(app=app))`: HTTP 200 and exact
  JSON response assertion passed. No listener, database or external request.
- Existing `bash scripts/check.sh`: 42 tests passed and generated TypeScript
  matches; `tsc --noEmit` passed after the additional dependencies.

The initial `FastAPI TestClient` context probe did not complete and was interrupted.
It emitted a Starlette deprecation warning about HTTPX. The async ASGI transport
probe above passed. The cause of the synchronous probe hang is not established;
do not cite that path as tested. No application code was running in that probe.

Read-only environment checks found no docker, podman, psql, postgres or initdb on
PATH and no PostgreSQL binary installation under `/usr/lib/postgresql` or `/opt`.
Therefore no PostgreSQL connectivity, migration, persistence or concurrent budget
claim is made. Backend receives explicit separate domain/HTTP versus actual
PostgreSQL acceptance criteria in `docs/tasks.md`.
