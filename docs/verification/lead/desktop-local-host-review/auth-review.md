# APPROVE — bounded local-host configuration/auth boundary

Candidate `deec5f4c8e3439c4ef05521ac442554a81415dbf`, exact export `/tmp/lc-desktop-local-deec`. Reviewed complete `services/api/desktop_local.py`, its portable tests, startup/ready documentation, and the existing runtime/control/ingress authentication call paths. PONYTAIL LITE applied: use the existing validators and authority model, inspect the actual boundary, run focused negative controls. No repository/worker changes.

No blocking defect found in this assigned scope. Process lifetime and the PostgreSQL runner remain with their separate reviewer; no PostgreSQL or actual localhost listener was used here.

## Findings and checked limits

- The startup parser requires the exact complete key set, one finite UTF-8 JSON object and one final LF within 65,536 bytes. Duplicate members, non-finite numeric overflow, invalid Unicode, invalid expiry, malformed registration pins, extra authority, duplicate scopes/capabilities and missing fields refuse with fixed `invalid_startup`. No absent flag or consent field becomes permission. The closed parser preserves the full registration; only explicit collections/expiry are normalized.
- The host accepts no CLI configuration and requires FIFO stdin before provisioning. It reserves numeric `127.0.0.1` before constructing the existing PostgreSQL runtime. Trusted-parent ownership/privacy of the pipe remains an integration premise; FIFO possession is not OS or user-consent attestation. Parent credential delivery must remain out of renderer/course content.
- Readiness emits only format/status/origin/start_status. It does not contain token, DSN, registration or source data, nor a `live` or permission assertion. Pending/consumed are start-grant reconciliation states. The parent still must replay the exact registration, read current state and respect stopped/withdrawn state before production. Source inspection shows the emitted record follows successful server startup. Actual ready-process behavior is left to the lifecycle reviewer.
- `_ParentOnly` requires exactly one numeric Host, rejecting foreign/absent/duplicate Host, every Origin including empty/null and case-insensitive `sec-fetch-*` metadata before the child app. This does not substitute for bearer authentication: correct Host with missing/malformed/duplicate/revoked credentials is still refused by the real existing API. No CORS response is emitted. Uvicorn configuration disables proxy-header trust/access logging, websocket handling and extra workers; these settings were source-reviewed, not claimed as a new socket execution.
- Forbidden host/browser requests retain control 0.2.1 and enabled raw/desktop/Windows/Mac 0.2.6/0.2.8/0.2.10/0.2.12 closed error formats. Disabled family routes stay absent and use the existing 0.2.4 fallback error. Proper local requests still reach existing strict body/auth validation; the wrapper grants no source/producer authority.
- The runtime is reused with explicit trusted `desktop_pixels` admission. In an actual MemoryStore/ASGI control flow, pending setup does not register a stream (GET is 404); explicit authenticated registration succeeds, while the session's physical `live_capture` stays false. Revoking the token refuses cached registration without changing stored state. Host exit is not described as physical Stop or product acceptance.

## Executed evidence

Focused portable subset: **41 passed, 56 deselected in 0.39 s**:

```sh
cd /tmp/lc-desktop-local-deec
PYTHONDONTWRITEBYTECODE=1 PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python -m pytest -q -p no:cacheprovider services/api/tests/test_desktop_local.py -k 'exact_protocol or every_key or invalid_or_ambiguous_config or enabled_ingress or duplicate_members or control_only'
```

Five independent result groups passed:

1. JSON-escaped duplicate token key, `1e999` numeric overflow and isolated unpaired-Unicode DSN refuse with fixed classification; false consent/disabled gates remain explicit.
2. All optional ingress flags disabled: 25 header refusals plus four absent-route controls, correct errors, no writes.
3. All flags explicitly enabled: 25 header refusals plus four closed-body controls, correct versioned errors, no writes.
4. Actual ASGI auth: six malformed/duplicate/missing credential controls, four missing-token ingress checks, forwarded-header non-authority, pending state, explicit registration, and revoked exact retry.
5. An actual CLI subprocess receives a complete secret-bearing **synthetic** startup record with invalid boolean port: exits 1, stdout empty, stderr exactly fixed `invalid_startup`; no credential or exception disclosure. Parsing fails before socket/store setup.

```sh
PYTHONDONTWRITEBYTECODE=1 /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python /tmp/desktop-local-deec-auth-probes.py > /tmp/desktop-local-deec-auth-probes.log 2>&1
```

The probe contains no listener or database. Port 43129 is only an ASGI Host string. The original first probe run passed; the isolated Unicode control was subsequently tightened to vary only its DSN field, and the bounded probe rerun passed. These runs are not added together as separate coverage totals.

`git diff --check` passes. Exact exported bytes match all seven changed Git objects. The four source/English pairs match their recorded hashes; affected §3.9/§7.1, current decisions and workflow were refreshed. Evidence paths:

- `/tmp/desktop-local-deec-auth-tests.log`
- `/tmp/desktop-local-deec-auth-probes.py`
- `/tmp/desktop-local-deec-auth-probes.log`
- `/tmp/desktop-local-deec-auth-probes.json`
- `/tmp/desktop-local-deec-auth-review.json` — hashes, commands and exact source receipt

No full 131-test replay, DB access, new listener, native/display/provider run, dependency installation or source fix was performed. This approval concerns the local configuration/auth/request wrapper, not Windows/macOS packaging or the independent physical capture/AI gates. Root owns integration, full focused verification and trusted-parent activation after the other review completes.
