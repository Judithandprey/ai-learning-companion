# Foreground desktop host integration

Backend's exact `deec5f4c8e3439c4ef05521ac442554a81415dbf` arrived through
`handoff_bf6c22b85bb600d137c16745868eadc6`, replying to the existing bounded
`handoff_7e680a6271cb7d90dec4e0b69560ed32` assignment. Stable mailbox read key:
`lead-backend-host-mail-20260930-1800`. Its normal baseline merge was `6a913a2`
of `ef487cf`; the actual start was already recorded. No duplicate host task.

The seven-file delivery was reviewed and cherry-picked normally as
`1f2a412`. The executable reuses the existing runtime, PostgreSQL actor store
and released control/original/ingress handlers. A trusted parent supplies a
single bounded private-pipe record with explicit authority and route flags;
the host reserves numeric loopback before provisioning and returns one
nonsecret readiness record. It has no public enrollment, provider activation,
new dependency, schema or migration. Parent EOF and signals end only its owned
process, with a watchdog for blocked work. Process exit never attests physical
Stop; missing READY never proves that provisioning did not commit.

## Review and executed evidence

Lead read the complete host, tests, DB runner, guard tests and documentation,
and reused the already reviewed runtime/control paths. Affected source/English
§3.9/§7.1, decisions and protocol clauses have no drift from the assigned
baseline. Both scoped independent reviews approve:

- [Configuration/auth review](auth-review.md): five independent groups cover
  strict secret-bearing input, default-off and explicit route errors, Host and
  browser refusals, real ASGI authentication and fixed CLI error redaction.
  Its 41-test subset is not added to the distinct suite count.
- [Lifecycle review](lifetime-review.md): six independent Linux process/socket
  interleavings cover loss during bind/provisioning, extra input, broken READY
  stdout, SIGINT and blocked startup. All children were reaped and ports
  reusable. Shortened test deadlines do not change production 10 s/5 s bounds.

Exact exported candidate check, with normal scoped approval for owned loopback
processes: **131 passed in 15.12 s**, no skips or expected failures:

```sh
PYTHONDONTWRITEBYTECODE=1 PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 \
  /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python \
  -m pytest -q -p no:cacheprovider \
  services/api/tests/test_desktop_local.py \
  services/api/tests/test_postgres_desktop_local_guard.py
```

[Output](portable-tests.txt). On integrated `1f2a412`, all seven delivered files
match their exact Git objects; the whole `services/api`, shared-contract and
Learning trees match this candidate. Six focused parser/authority integration
checks pass in 0.27 s (`-k 'exact_protocol or control_only or enabled_ingress'`).
The unchanged 131-check campaign was not repeated merely for integration.
[Machine receipt](integration.json), original independent probe sources/results
and source hashes are retained beside this report. The probes retain their
actual temporary export paths as execution provenance, not runtime dependencies.

The owner's separate real `lc_p0_test` evidence records **37 HTTP checks across
four executable processes**, with exact original/ACK recovery, token rotation,
Stop/withdrawal fences and normal owned EOF/TERM exits. Lead read the original
sanitized log and verified SHA-256
`26ef60bc6015c06129862654ed8f5ade6ff261ea03b9bca135352731d41b880f` and exact equality
of its PASS object with the committed
[owner evidence](../../backend/desktop-local-postgres-evidence.json).
This was not rerun by Lead or independent role-QA. Only the unique test actor
was cleaned after all children were reaped; existing migrations were checked,
not applied. No user-preview DB or service was touched.

## Concrete continuation

The host is an executable backend dependency for the next Windows trusted-parent
composition. It is not yet a connected desktop application. Support received
one bounded probe (`handoff_4eb0e0ac79d962b1684b87093c635f27`, baseline `8ea8fdf`)
for an existing Windows parent/runtime → private pipe → loopback → EOF path,
using only a disposable synthetic stdlib child. Receipt proves acceptance;
execution is not yet observed. No installation or actual product-host/DB run
is assigned to Support.

Web's held uploader correction `c09c151` has arrived through
`handoff_a43638b3601d3a700c732f2d78643c61`; its exact-source 19-test real HTTP
MemoryStore suite passes with no skips, while independent boundary review is
still underway. After corrected-source release, Lead will give the same owner
one bounded parent/control/upload continuation. QA has now delivered its Mac API pass as `4fd6b28` /
`handoff_3e64aef6c7eb358684607deb8790523b`: 40 acceptance cases and one
QA-MAC-01 actor-wide availability observation, awaiting Lead audit. The native
owner retains immutable frame-bound editable ink.

Windows/macOS native pipe, packaging and runtime behavior remain separately
unverified; Linux signals are not Windows `TerminateProcess`. Actual screen/pen,
real provider receipt/understanding, both per-OS §7.1 gates, audio and Notability
acceptance remain open. The disabled product provider and unconfirmed interactive
Mac are specific dependencies, not reasons to stop independent parent integration.

Publication and substantive dispatch receipts follow the actual operations;
no receipt or future check is represented as acceptance.
