# SUP-01: existing Windows parent → Python development paths

Checked 2026-09-30. Assigned main: `8ea8fdf7edb236fa996389de9cbd7dbc7e08ca9b`.
Backend host interface read at `deec5f4c8e3439c4ef05521ac442554a81415dbf`, still
under Lead review. This probe never imported or started that host.

**Result:** native Windows Node can use an existing Python private FIFO and
numeric loopback HTTP. Under the tested isolated startup, that native interpreter
could not find `uvicorn` or `psycopg`; non-isolated/user-site availability was not
inventoried.
The existing WSL project environment has those packages; its child pipe also
works, and Windows reached its loopback HTTP after a single one-second diagnostic
delay. Immediate requests after Linux readiness were refused. The current
development route therefore needs bounded Windows-side connection readiness
handling; Linux readiness alone did not establish Windows reachability.

No installation, network/runtime setting change, proxy, GUI, screen capture,
product host, database, provider or real credential was used. Ports were allocated
by the OS on `127.0.0.1`; ports 4173/8174 and user applications were untouched.
All probe launches stayed in the foreground and their owned children were reaped.
This is not a native Windows distributable or Electron-main integration result.

## Installed runtimes and exact paths

The project playbooks and Windows staging helpers were read first. They can
download, overwrite staging paths or detach a GUI, so none was invoked. Standard
Windows command discovery initially found only generic Store aliases. A read-only
PEP 514 registry query then found the actual installed Python package.

| Item | Actual observation |
| --- | --- |
| Native parent | `C:\Program Files\nodejs\node.exe`, Windows Node **24.19.0**; not the repo's pinned Linux Node and not Electron main |
| Installed native Python launch path | `C:\Program Files\WindowsApps\PythonSoftwareFoundation.Python.3.13_3.13.3824.0_x64__qbz5n2kfra8p0\python3.13.exe` |
| Native Python reports | `win32`, **3.13.14**; `sys.executable` is `C:\Users\ROG\AppData\Local\Microsoft\WindowsApps\PythonSoftwareFoundation.Python.3.13_qbz5n2kfra8p0\python.exe` |
| Native dependency discovery | `importlib.util.find_spec("uvicorn")` and `find_spec("psycopg")` both false with isolated startup; no package imports or installation attempted |
| Existing WSL | Distribution `Ubuntu`, user `agentsdock`; `/home/agentsdock/Projects/learning-companion/repo/.venv/bin/python`, **3.14.4**; both above package specs found |
| Existing Electron | `C:\Users\ROG\AppData\Local\Temp\lc-electron-44.5.1-win32-x64\electron.exe` exists; it was not launched |

Direct WSL execution of the protected `C:\Program Files\WindowsApps\…` file
returned permission denied. Launching that same installed executable from native
Windows Node succeeded. This was a launch-path distinction; no ACL was changed.
Generic Store aliases were never executed and no Store installation was opened.
The package-version path is this machine's discovered path, not a distributable
runtime location or an assumed permanent path.

Both native parent and spawned Windows children used `C:\Windows\System32` as
their cwd, with `shell:false`, `windowsHide:true`, and three private pipes.
No child was detached. The synthetic Python file was read through this translation:

```text
/home/agentsdock/Projects/learning-companion/wt-support/tests/probes/support/private_pipe_child.py
→ \\wsl.localhost\Ubuntu\home\agentsdock\Projects\learning-companion\wt-support\tests\probes\support\private_pipe_child.py
```

Native Python argument array:

```text
["-I", "-B", "-u", "-X", "utf8", "<the UNC probe path above>"]
```

For the WSL development route, the Windows parent spawned exactly:

```text
executable: C:\Windows\System32\wsl.exe
arguments:
  --distribution Ubuntu --user agentsdock
  --cd /home/agentsdock/Projects/learning-companion/repo
  --exec /home/agentsdock/Projects/learning-companion/repo/.venv/bin/python
  -I -B -u -X utf8
  /home/agentsdock/Projects/learning-companion/wt-support/tests/probes/support/private_pipe_child.py
```

These are separate `spawn` arguments, not a shell command string. `-I` is for
this absolute-file stdlib probe; it removes the current-directory module lookup
needed by a source-tree `python -m services.api.desktop_local` launch. Lead owns
the later reviewed host/module/dependency launch contract.

## Actual observations

The parent sent a 139-byte UTF-8 JSON/LF record in normal cases (143 bytes for
the EOF-ignoring mode), containing synthetic Greek, Chinese and emoji text,
deliberately split inside one multibyte code point.
Both Python runtimes reported `stat.S_ISFIFO=True`, `isatty=False`, matching byte
length and SHA-256, and exactly one readiness record. Stdin stayed open through
HTTP. No input record or credential was printed; the payload contains no credential.

| Case | Native Windows Python | Windows → WSL Python |
| --- | --- | --- |
| Ready → parent HTTP | Immediate HTTP 200 from the Windows process | Two immediate connections refused; three separate one-second-delayed requests returned HTTP 200 |
| Normal EOF | Exit 0 after 64 ms; following request `ECONNREFUSED` | Confirmed run: exit 0 after 69 ms, normal EOF marker; following Windows request `ECONNRESET` |
| Incomplete JSON/LF + EOF | No readiness; exit 2 | No readiness; exit 2 |
| Further stdin byte | Fixed unexpected-input marker; exit 2 after 63 ms | Confirmed delayed run reached this step; exit 2 after 68 ms |
| Deliberately EOF-ignoring child | After 400 ms, force-killed only the directly owned Python PID, verified equal to `ChildProcess.pid`; close event `{code:null, signal:"SIGTERM"}`, HTTP refused | Not attempted: terminating `wsl.exe` is not proof of terminating a Linux grandchild |

The one-second delay is a **diagnostic observation, not a latency guarantee or
production fix**. The demonstrated boundary is that a Linux listening/readiness
record can precede Windows reachability. WSL forwarding startup is a plausible
cause; its exact internal timing was not inspected or proven. No retries or
availability-polling loop were added. The experiment used one request per child
before shutdown and one after shutdown.

After the WSL child exits, the Windows forwarding listener may remain and reset
connections to the closed Linux backend. Its removal is not established and was
not attempted. Microsoft's [WSL networking documentation](https://learn.microsoft.com/en-us/windows/wsl/networking)
describes Windows access to Linux apps through localhost; it does not turn this
installation's readiness timing into a guaranteed bound.

Windows `child.kill("SIGTERM")` was an abnormal fallback in the synthetic native
case, not execution of Python's graceful SIGTERM handler. This matches
[Node's Windows signal documentation](https://nodejs.org/api/child_process.html#subprocesskillsignal).
Normal cleanup should close the owned stdin pipe and wait for that child; force
only the still-owned process on a bounded abnormal path. Never terminate WSL,
its distribution, a process-name group, or an unrelated PID. Host exit is not a
control Stop or physical capture-stop receipt.

## Evidence and bounded corrections

- [Initial seven cases](windows-private-pipe-observed.json): four native cases
  passed, WSL incomplete EOF passed, and two WSL cases stopped at refused HTTP.
  The original WSL extra-input stage was **not reached**.
- [One delayed diagnostic](windows-wsl-delayed-observed.json): HTTP 200 and EOF
  exit 0, but the harness rejected `ECONNRESET` because it incorrectly required
  the native same-host `ECONNREFUSED` code. This failing record is preserved.
- [Corrected WSL confirmation](windows-wsl-confirmed-observed.json): normal EOF
  and the previously unreached extra-input case pass with one delayed request
  each. The check now distinguishes Python exit/no serving response from closure
  of WSL's Windows forwarding listener; native refusal assertions are unchanged.

The [child](../../../tests/probes/support/private_pipe_child.py) has a 12-second
self-exit failsafe and uses only Python's standard library. The
[parent](../../../tests/probes/support/windows_private_pipe.mjs) uses Node built-ins.
Read-only review prompted bounded output capture and retaining earlier results if
cleanup observation times out. Syntax checks passed. The final WSL checks ran
after those harness corrections; the already-passed native cases were not repeated.
The probe has its own synthetic schema and error codes and does not substitute
for the host's authority parser, 10-second startup or 5-second shutdown tests.

For an explicitly requested reproduction, pass JSON containing `routes` from an
evidence file into the native parent's stdin. Start it using the existing Windows
Node executable and the `wslpath -w` translation of its `.mjs` file, from
`/mnt/c/Windows/System32`. Keep the launching subprocess in the foreground and
capture stdout JSON. No config, credential or synthetic record belongs in an
executable command string. The retained JSON specifies each tested cwd/argv/delay.

## Remaining owner action

Lead/Web can integrate a foreground Windows→WSL development launch using the
existing project environment, with bounded Windows-side connectivity handling
after the single private startup record. Do not resend credentials/configuration
or create fresh consent merely because the first TCP connection is refused.
Apply the real host's reconciliation/Stop rules after unknown outcomes.

A native Windows host still needs a reviewed Windows-compatible project runtime
and dependencies; uvicorn/psycopg were not discoverable in the tested isolated
native Python startup. This does not establish absence from every Windows Python
environment or from user-site packages.
Windows database connectivity, real backend startup and production dependencies
were not tested. No Linux venv is a Windows distributable. Actual Electron main
integration, protected credentials, OS consent, real source/AI transport and
R01/R02/R03/R35/R36, A12/A14/A16 and both §7.1 gates remain owner acceptance work.
Support stops at this evidence-backed handoff. Primary references read 2026-09-30.
