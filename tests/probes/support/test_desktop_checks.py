"""Workflow orchestration only: fake OS/build tools, real Git/Node/Python/ZIP.

Run: python3 -m unittest discover -s tests/probes/support -p test_desktop_checks.py -v
Requires Node on PATH. No network, native app build, launch or permission proof.
"""

import hashlib
import json
import os
from pathlib import Path
import plistlib
import shutil
import subprocess
import sys
import tarfile
import tempfile
import unittest
import zipfile


ROOT = Path(__file__).resolve().parents[3]
BUILD_FILES = ["scripts/desktop-checks.sh", ".github/workflows/desktop-checks.yml"]
STUB = r'''#!/usr/bin/env python3
import json, os, pathlib, shutil, struct, sys, zipfile, zlib
name = pathlib.Path(sys.argv[0]).name
args = sys.argv[1:]
cwd = pathlib.Path.cwd()
with open(os.environ['PROBE_TRACE'], 'a') as trace:
    trace.write(json.dumps({'tool': name, 'args': args, 'cwd': str(cwd)}) + '\n')
failed = os.environ.get('FAIL_COMMAND') == name + ' ' + ' '.join(args)
if failed and not (name == 'swift' and args and args[0] == 'test'):
    print('injected failure', file=sys.stderr)
    sys.exit(17)
if name == 'uname':
    system = 'MINGW64_NT-10.0' if os.environ['FAKE_OS'] == 'windows' else 'Darwin'
    print(system if args == ['-s'] else system + ' fixture-architecture')
elif name == 'npm':
    if args[0] == 'ci':
        module = cwd / 'node_modules/electron'
        runtime = module / 'dist'
        (runtime / 'resources').mkdir(parents=True)
        (runtime / 'locales').mkdir()
        for item in ['electron.exe', 'test.dll', 'resources/default_app.asar', 'locales/en-US.pak']:
            (runtime / item).write_text('stub runtime')
        (module / 'index.js').write_text('module.exports = ' + json.dumps(str(runtime / 'electron.exe')))
    elif args == ['run', 'build']:
        (cwd / 'dist').mkdir()
        (cwd / 'dist/main.js').write_text('stub built entry')
        shutil.copy2(cwd / 'page.html', cwd / 'dist/page.html')
    print('stub npm ' + ' '.join(args))
elif name == 'swift':
    binary = cwd / '.build/release'
    if args == ['package', 'describe', '--type', 'json']:
        targets = ['DesktopCapture', 'CompanionDesktop', 'DesktopCaptureTests']
        if os.environ.get('FIXTURE_CASE') == 'missing-target':
            targets.remove('DesktopCaptureTests')
        print(json.dumps({'targets': [{'name': name} for name in targets],
                          'products': [{'name': 'CompanionDesktop'}]}))
    elif '--show-bin-path' in args:
        print(binary)
    elif args and args[0] == 'build':
        binary.mkdir(parents=True)
        (binary / 'CompanionDesktop').write_text('stub executable')
        (binary / 'CompanionDesktop').chmod(0o755)
    elif args and args[0] == 'test':
        def chunk(kind, data):
            return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))
        png = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 4, 2, 8, 6, 0, 0, 0))
               + chunk(b'IDAT', zlib.compress((b'\0' + b'\xff\0\0\xff' * 4) * 2)) + chunk(b'IEND', b''))
        if os.environ.get('FIXTURE_CASE') != 'missing-fixture':
            session = pathlib.Path(os.environ['COMPANION_DESKTOP_FIXTURE_DIR']) / 'synthetic-session'
            (session / 'frames').mkdir(parents=True)
            (session / 'status.json').write_text(json.dumps({'keptFrames': 2}))
            (session / 'events.jsonl').write_text(json.dumps({'event': 'stub-synthetic'}) + '\n')
            for frame in ['00000001.png', '00000004.png']:
                (session / 'frames' / frame).write_bytes(png)
            if os.environ.get('FIXTURE_CASE') == 'bad-json':
                (session / 'status.json').write_text('invalid JSON')
            if os.environ.get('FIXTURE_CASE') == 'missing-png':
                (session / 'frames/00000004.png').unlink()
        if os.environ.get('FIXTURE_CASE') != 'missing-ingress-fixture':
            ingress = pathlib.Path(os.environ['COMPANION_DESKTOP_INGRESS_FIXTURE_DIR'])
            assert not ingress.exists(), 'the ingress owner requires a new output directory'
            session = ingress / 'native/synthetic-session'
            (session / 'frames').mkdir(parents=True)
            (session / 'status.json').write_text(json.dumps({'stub': True}))
            (session / 'events.jsonl').write_text(json.dumps({'event': 'stub-ingress'}) + '\n')
            (session / 'frames/00000001.png').write_bytes(png)
            (ingress / 'requests').mkdir()
            (ingress / 'requests/mixed.json').write_text(json.dumps({'stub': True}))
            (ingress / 'manifest.json').write_text(json.dumps({
                'native_session': 'native/synthetic-session', 'body': 'requests/mixed.json'}))
            if os.environ.get('FIXTURE_CASE') == 'bad-ingress-fixture':
                (ingress / 'requests/mixed.json').write_text('invalid JSON')
        if os.environ.get('FIXTURE_CASE') != 'missing-composed-fixture':
            composed = pathlib.Path(os.environ['COMPANION_DESKTOP_COMPOSED_FIXTURE_DIR'])
            assert not composed.exists(), 'the composed owner requires a new output directory'
            session = composed / 'synthetic-session'
            session.mkdir(parents=True)
            (session / 'events.jsonl').write_text(json.dumps({'event': 'stub-composed'}) + '\n')
            (session / 'raw.png').write_bytes(png)
            (session / 'composed.png').write_bytes(png)
            (session / 'ink.json').write_text(json.dumps({'stub': True}))
            if os.environ.get('FIXTURE_CASE') == 'bad-composed-fixture':
                (session / 'events.jsonl').write_text('invalid JSON')
        print('stub Swift tests in ' + str(cwd))
        if os.environ.get('FIXTURE_CASE') != 'missing-mac-frame-fixture':
            retained = pathlib.Path(os.environ['COMPANION_DESKTOP_MAC_FRAME_FIXTURE_DIR'])
            assert not retained.exists(), 'the mapper owner requires a new output directory'
            session = retained / 'native/synthetic-session'
            session.mkdir(parents=True)
            (session / 'raw.png').write_bytes(png)
            (retained / 'manifest.json').write_text(json.dumps({'stub': True}))
            if os.environ.get('FIXTURE_CASE') == 'bad-mac-frame-fixture':
                (retained / 'manifest.json').write_text('invalid JSON')
        if failed:
            print('injected test failure after fixture write', file=sys.stderr)
            sys.exit(17)
    else:
        print('stub Swift ' + ' '.join(args))
elif name == 'ditto':
    source, dest = map(pathlib.Path, args[-2:])
    if '-c' in args:
        with zipfile.ZipFile(dest, 'w') as archive:
            for path in source.rglob('*'):
                if path.is_file():
                    archive.write(path, path.relative_to(source.parent))
    elif source.is_dir():
        shutil.copytree(source, dest)
    else:
        shutil.copy2(source, dest)
else:
    print('stub ' + name)
'''

# Only verifies invocation, interpreter selection and failure propagation. The
# production script calls the actual owner's checker from the committed archive.
INGRESS_CHECK = r'''import json, os, pathlib, sys
with open(os.environ['PROBE_TRACE'], 'a') as trace:
    trace.write(json.dumps({'tool': 'ingress-validator', 'args': sys.argv[1:],
        'cwd': str(pathlib.Path.cwd()), 'python': sys.executable, 'source': __file__}) + '\n')
if os.environ.get('FAIL_COMMAND') == 'ingress-validator':
    print('injected validator failure', file=sys.stderr)
    sys.exit(23)
root = pathlib.Path(sys.argv[1])
manifest = json.loads((root / 'manifest.json').read_text())
json.loads((root / manifest['body']).read_text())
session = root / manifest['native_session']
json.loads((session / 'status.json').read_text())
for line in (session / 'events.jsonl').read_text().splitlines():
    json.loads(line)
assert (session / 'frames/00000001.png').read_bytes().startswith(b'\x89PNG\r\n\x1a\n')
print('stub ingress validator invoked; not Swift or contract validation evidence')
'''

COMPOSED_CHECK = r'''import json, os, pathlib, sys
with open(os.environ['PROBE_TRACE'], 'a') as trace:
    trace.write(json.dumps({'tool': 'composed-validator', 'args': sys.argv[1:],
        'cwd': str(pathlib.Path.cwd()), 'python': sys.executable, 'source': __file__}) + '\n')
if os.environ.get('FAIL_COMMAND') == 'composed-validator':
    print('injected composed validator failure', file=sys.stderr)
    sys.exit(29)
root = pathlib.Path(sys.argv[1])
sessions = list(root.iterdir())
assert len(sessions) == 1
session = sessions[0]
for line in (session / 'events.jsonl').read_text().splitlines():
    json.loads(line)
json.loads((session / 'ink.json').read_text())
for name in ['raw.png', 'composed.png']:
    assert (session / name).read_bytes().startswith(b'\x89PNG\r\n\x1a\n')
print('stub composed validator invoked; not Swift output or rendering acceptance')
'''

MAC_FRAME_CHECK = r'''import json, os, pathlib, sys
with open(os.environ['PROBE_TRACE'], 'a') as trace:
    trace.write(json.dumps({'tool': 'mac-frame-validator', 'args': sys.argv[1:],
        'cwd': str(pathlib.Path.cwd()), 'python': sys.executable, 'source': __file__}) + '\n')
if os.environ.get('FAIL_COMMAND') == 'mac-frame-validator':
    print('injected Mac frame validator failure', file=sys.stderr)
    sys.exit(31)
root = pathlib.Path(sys.argv[1])
json.loads((root / 'manifest.json').read_text())
assert (root / 'native/synthetic-session/raw.png').read_bytes().startswith(b'\x89PNG\r\n\x1a\n')
print('stub Mac frame validator invoked; not Swift or contract validation evidence')
'''


class DesktopChecks(unittest.TestCase):
    def setUp(self):
        if not shutil.which("node"):
            self.fail("Node must be on PATH; do not turn a missing test prerequisite into a pass")
        self.temp = tempfile.TemporaryDirectory(prefix="desktop probe ")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "checkout with spaces"
        self.root.mkdir()
        self.out = Path(self.temp.name) / "evidence with spaces"
        self.bin = Path(self.temp.name) / "stub tools"
        self.bin.mkdir()
        for name in ["uname", "npm", "swift", "ditto", "sw_vers", "xcodebuild", "plutil"]:
            path = self.bin / name
            path.write_text(STUB)
            path.chmod(0o755)
        for name in BUILD_FILES:
            target = self.root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ROOT / name, target)
        (self.root / ".gitignore").write_text("node_modules/\ndist/\n.build/\n.venv/\n")
        interpreter = self.root / ".venv/bin/python"
        interpreter.parent.mkdir(parents=True)
        interpreter.symlink_to(sys.executable)
        self.git("init", "-q")
        self.git("config", "user.name", "Probe")
        self.git("config", "user.email", "probe@example.invalid")

    def git(self, *args):
        return subprocess.run(["git", *args], cwd=self.root, check=True,
                              text=True, capture_output=True).stdout

    def commit(self):
        self.git("add", ".")
        self.git("commit", "-qm", "probe inputs")

    def source(self, platform):
        if platform == "windows":
            source = self.root / "apps/windows"
            source.mkdir(parents=True)
            manifest = {"main": "dist/main.js", "type": "module",
                        "scripts": {"build": "tsc", "test": "node --test"},
                        "devDependencies": {"electron": "44.5.1", "typescript": "7.0.2"}}
            (source / "package.json").write_text(json.dumps(manifest))
            (source / "package-lock.json").write_text("{}")
            (source / "page.html").write_text("owner asset")
            shared = self.root / "apps/safari-extension/src"
            shared.mkdir(parents=True)
            for name in ["ink.ts", "mode.ts"]:
                (shared / name).write_text("export const value = 'committed';\n")
        else:
            source = self.root / "apps/macos/CompanionDesktop"
            source.mkdir(parents=True)
            (source / "Package.swift").write_text("// fixture, not compiled")
            (self.root / "pyproject.toml").write_text("# stub dependency input, not installed\n")
            (self.root / "uv.lock").write_text("# stub locked input, not installed\n")
            (source / "checks").mkdir()
            (source / "checks/validate_desktop_ingress.py").write_text(INGRESS_CHECK)
            (source / "checks/validate_composed_frames.py").write_text(COMPOSED_CHECK)
            (source / "checks/validate_mac_retained_frames.py").write_text(MAC_FRAME_CHECK)
            # Byte-for-byte owner package-app.sh at 7efa46a. Execute it against
            # stub Swift/plutil here; it remains the owner's production script.
            shutil.copyfile(ROOT / "tests/probes/support/fixtures/macos-package-app.sh", source / "package-app.sh")
            (source / "package-app.sh").chmod(0o755)
            (source / "Packaging").mkdir()
            (source / "Packaging/Info.plist").write_bytes(plistlib.dumps({
                "CFBundleExecutable": "CompanionDesktop", "CFBundleIdentifier": "example.fixture.only",
            }))
        return source

    def run_checks(self, platform, failure="", fixture_case=""):
        env = {**os.environ, "PATH": str(self.bin) + os.pathsep + os.environ["PATH"],
               "PYTHON": sys.executable, "FAKE_OS": platform, "FAIL_COMMAND": failure,
               "FIXTURE_CASE": fixture_case, "PROBE_TRACE": str(Path(self.temp.name) / "trace.jsonl")}
        result = subprocess.run(["bash", str(self.root / BUILD_FILES[0]), platform, str(self.out)],
                                env=env, text=True, capture_output=True)
        status = json.loads((self.out / "result.json").read_text())
        self.assertEqual(status["exit_code"], result.returncode, result.stdout + result.stderr)
        self.assertFalse(status["interactive_runtime_verified"])
        self.assertFalse(status["provider_verified"])
        for line in (self.out / "SHA256SUMS").read_text().splitlines():
            digest, name = line.split("  ", 1)
            self.assertEqual(hashlib.sha256((self.out / name).read_bytes()).hexdigest(), digest)
        return result, status

    def test_missing_source_is_failure_with_evidence(self):
        self.commit()
        for platform in ["windows", "macos"]:
            with self.subTest(platform=platform):
                self.out = Path(self.temp.name) / platform
                result, status = self.run_checks(platform)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(status["state"], "source-not-ready")

    def test_existing_evidence_is_preserved(self):
        self.out.mkdir()
        marker = self.out / "existing.txt"
        marker.write_text("preserve me")
        result = subprocess.run(["bash", str(self.root / BUILD_FILES[0]), "macos", str(self.out)],
                                capture_output=True, env={**os.environ, "PYTHON": sys.executable})
        self.assertEqual(result.returncode, 2)
        self.assertEqual(list(self.out.iterdir()), [marker])
        self.assertEqual(marker.read_text(), "preserve me")

    def test_dirty_build_input_is_preserved_and_rejected(self):
        source = self.source("windows")
        self.commit()
        (source / "page.html").write_text("unsaved owner work")
        result, status = self.run_checks("windows")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(status["state"], "source-not-ready")
        self.assertEqual((source / "page.html").read_text(), "unsaved owner work")

    def test_windows_distribution_keeps_runtime_and_app(self):
        self.source("windows")
        self.commit()
        result, status = self.run_checks("windows")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(status["state"], "checks-completed")
        with zipfile.ZipFile(self.out / "WindowsDesktop.zip") as archive:
            names = archive.namelist()
            for name in ["electron.exe", "test.dll", "locales/en-US.pak", "resources/app/dist/main.js", "resources/app/dist/page.html"]:
                self.assertIn("WindowsDesktop/" + name, names)
            self.assertFalse(any("node_modules" in name for name in names))
            self.assertNotIn("WindowsDesktop/resources/app/page.html", names)
        self.assertFalse((self.root / "apps/windows/node_modules").exists())
        self.assertFalse((self.root / "apps/windows/dist").exists())

    def test_ignored_private_and_stale_files_never_enter_artifacts(self):
        source = self.source("windows")
        (self.root / ".gitignore").write_text("node_modules/\ndist/\n.build/\n.env\n.venv/\n")
        (source / "local-notes.txt").write_text("committed but not a runtime asset")
        self.commit()
        (source / ".env").write_text("FAKE_PRIVATE_TEST_VALUE=never-package")
        (source / "dist").mkdir()
        (source / "dist/stale.txt").write_text("old local output")
        result, _ = self.run_checks("windows")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        with tarfile.open(self.out / "source.tar.gz") as archive:
            self.assertNotIn("apps/windows/.env", archive.getnames())
            self.assertNotIn("apps/windows/dist/stale.txt", archive.getnames())
        with zipfile.ZipFile(self.out / "WindowsDesktop.zip") as archive:
            self.assertFalse(any(name.endswith((".env", "local-notes.txt", "stale.txt")) for name in archive.namelist()))
        self.assertEqual((source / ".env").read_text(), "FAKE_PRIVATE_TEST_VALUE=never-package")
        self.assertEqual((source / "dist/stale.txt").read_text(), "old local output")

    def test_changed_or_missing_known_sibling_fails_without_touching_it(self):
        self.source("windows")
        self.commit()
        shared = self.root / "apps/safari-extension/src"
        for name in ["ink.ts", "mode.ts"]:
            for kind in ["changed", "deleted"]:
                with self.subTest(name=name, kind=kind):
                    path = shared / name
                    if kind == "changed":
                        path.write_text("uncommitted owner work")
                    else:
                        path.unlink()
                    self.out = Path(self.temp.name) / (name + kind)
                    result, status = self.run_checks("windows")
                    self.assertNotEqual(result.returncode, 0)
                    self.assertEqual(status["state"], "source-not-ready")
                    if kind == "changed":
                        self.assertEqual(path.read_text(), "uncommitted owner work")
                    else:
                        self.assertFalse(path.exists())
                    path.write_text("export const value = 'committed';\n")

    def test_snapshot_contains_committed_transitive_sibling_and_preserves_mode(self):
        self.source("windows")
        helper = self.root / "shared/helper.ts"
        helper.parent.mkdir()
        helper.write_text("export const value = 'committed dependency';")
        executable = self.root / "scripts/owner-helper.sh"
        executable.write_text("#!/bin/sh\nexit 0\n")
        executable.chmod(0o755)
        self.commit()
        helper.write_text("uncommitted transitive work")
        stub_path = self.bin / "npm"
        stub_path.write_text(stub_path.read_text().replace(
            "(cwd / 'dist/main.js').write_text('stub built entry')",
            "(cwd / 'dist/main.js').write_text((cwd.parents[1] / 'shared/helper.ts').read_text())"))
        result, _ = self.run_checks("windows")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        with tarfile.open(self.out / "source.tar.gz") as archive:
            self.assertIn("apps/safari-extension/src/ink.ts", archive.getnames())
            self.assertIn("apps/safari-extension/src/mode.ts", archive.getnames())
            self.assertEqual(archive.extractfile("shared/helper.ts").read(), b"export const value = 'committed dependency';")
        with zipfile.ZipFile(self.out / "WindowsDesktop.zip") as archive:
            self.assertEqual(archive.read("WindowsDesktop/resources/app/dist/main.js"), b"export const value = 'committed dependency';")
        self.assertEqual(helper.read_text(), "uncommitted transitive work")
        self.assertTrue((self.out / "work/source/scripts/owner-helper.sh").stat().st_mode & 0o111)

    def test_missing_committed_sibling_fails_clearly(self):
        self.source("windows")
        (self.root / "apps/safari-extension/src/mode.ts").unlink()
        self.commit()
        result, status = self.run_checks("windows")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(status["state"], "source-not-ready")
        self.assertIn("apps/safari-extension/src/mode.ts", (self.out / "error.txt").read_text())

    def test_committed_dist_is_not_accepted_as_fresh_output(self):
        source = self.source("windows")
        (source / "dist").mkdir()
        (source / "dist/stale.txt").write_text("tracked stale output")
        self.git("add", "-f", "apps/windows/dist/stale.txt")
        self.commit()
        result, status = self.run_checks("windows")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(status["state"], "source-not-ready")
        self.assertFalse((self.out / "WindowsDesktop.zip").exists())

    def test_snapshot_preserves_internal_symlinks(self):
        self.source("macos")
        (self.root / "linked-workflow.yml").symlink_to(".github/workflows/desktop-checks.yml")
        self.commit()
        result, _ = self.run_checks("macos")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        link = self.out / "work/source/linked-workflow.yml"
        self.assertTrue(link.is_symlink())
        self.assertEqual(link.read_text(), (self.root / BUILD_FILES[1]).read_text())

    def test_snapshot_rejects_links_outside_committed_inputs(self):
        self.source("macos")
        outside = Path(self.temp.name) / "private-local.txt"
        outside.write_text("FAKE_PRIVATE_TEST_VALUE=do-not-read")
        (self.root / "outside-link").symlink_to(outside)
        self.commit()
        result, status = self.run_checks("macos")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(status["last_phase"], "snapshot")
        self.assertFalse((self.out / "MacDesktop.zip").exists())
        self.assertEqual(outside.read_text(), "FAKE_PRIVATE_TEST_VALUE=do-not-read")

    def test_windows_unknown_runtime_dependency_fails(self):
        source = self.source("windows")
        path = source / "package.json"
        manifest = json.loads(path.read_text())
        manifest["dependencies"] = {"unhandled": "1.0.0"}
        path.write_text(json.dumps(manifest))
        self.commit()
        result, status = self.run_checks("windows")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(status["last_phase"], "manifest")
        self.assertFalse((self.out / "WindowsDesktop.zip").exists())

    def test_build_failure_remains_failure_and_retains_log(self):
        self.source("windows")
        self.commit()
        result, status = self.run_checks("windows", "npm run build")
        self.assertEqual(result.returncode, 17)
        self.assertEqual(status["last_phase"], "build")
        self.assertIn("injected failure", (self.out / "build.log").read_text())

    def test_mac_owner_bundle_fixture_and_release_reuse(self):
        self.source("macos")
        self.commit()
        result, _ = self.run_checks("macos")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        with zipfile.ZipFile(self.out / "MacDesktop.zip") as archive:
            self.assertIn("CompanionDesktop.app/Contents/Info.plist", archive.namelist())
            self.assertTrue(archive.getinfo("CompanionDesktop.app/Contents/MacOS/CompanionDesktop").external_attr >> 16 & 0o111)
        self.assertFalse((self.root / "apps/macos/CompanionDesktop/.build").exists())
        fixture = self.out / "macos-fixture/synthetic-session"
        self.assertEqual(json.loads((fixture / "status.json").read_text())["keptFrames"], 2)
        for file in ["status.json", "events.jsonl", "frames/00000001.png", "frames/00000004.png"]:
            self.assertIn(f"macos-fixture/synthetic-session/{file}", (self.out / "SHA256SUMS").read_text())
        trace = [json.loads(line) for line in (Path(self.temp.name) / "trace.jsonl").read_text().splitlines()]
        builds = [call for call in trace if call["tool"] == "swift" and call["args"][0] == "build" and "--show-bin-path" not in call["args"]]
        self.assertEqual(len(builds), 1)
        self.assertIn("release", builds[0]["args"])
        self.assertTrue(any(call["args"] == ["test", "--configuration", "release"] for call in trace))
        self.assertTrue(any(call["tool"] == "ditto" and "--sequesterRsrc" in call["args"] for call in trace))
        self.assertTrue(all(str(self.out / "work/source") in call["cwd"] for call in trace if call["tool"] == "swift"))
        validators = [call for call in trace if call["tool"] == "ingress-validator"]
        self.assertEqual(len(validators), 1)
        self.assertEqual(validators[0]["args"], [str(self.out / "macos-ingress-fixture")])
        self.assertEqual(validators[0]["python"], str(self.root / ".venv/bin/python"))
        self.assertEqual(Path(validators[0]["source"]).resolve(),
                         self.out / "work/source/apps/macos/CompanionDesktop/checks/validate_desktop_ingress.py")
        self.assertGreater(trace.index(validators[0]), next(i for i, call in enumerate(trace)
                           if call["tool"] == "swift" and call["args"][0] == "test"))
        for file in ["manifest.json", "requests/mixed.json", "native/synthetic-session/status.json",
                     "native/synthetic-session/events.jsonl", "native/synthetic-session/frames/00000001.png"]:
            self.assertIn(f"macos-ingress-fixture/{file}", (self.out / "SHA256SUMS").read_text())
        composed = [call for call in trace if call["tool"] == "composed-validator"]
        self.assertEqual(len(composed), 1)
        self.assertEqual(composed[0]["args"], [str(self.out / "macos-composed-fixture")])
        self.assertEqual(composed[0]["python"], str(self.root / ".venv/bin/python"))
        self.assertEqual(Path(composed[0]["source"]).resolve(),
                         self.out / "work/source/apps/macos/CompanionDesktop/checks/validate_composed_frames.py")
        self.assertGreater(trace.index(composed[0]), trace.index(validators[0]))
        for file in ["events.jsonl", "raw.png", "composed.png", "ink.json"]:
            self.assertIn(f"macos-composed-fixture/synthetic-session/{file}",
                          (self.out / "SHA256SUMS").read_text())
        mapped = [call for call in trace if call["tool"] == "mac-frame-validator"]
        self.assertEqual(len(mapped), 1)
        self.assertEqual(mapped[0]["args"], [str(self.out / "macos-retained-frame-fixture")])
        self.assertEqual(mapped[0]["python"], str(self.root / ".venv/bin/python"))
        self.assertEqual(Path(mapped[0]["source"]).resolve(),
                         self.out / "work/source/apps/macos/CompanionDesktop/checks/validate_mac_retained_frames.py")
        self.assertGreater(trace.index(mapped[0]), trace.index(composed[0]))
        for file in ["manifest.json", "native/synthetic-session/raw.png"]:
            self.assertIn(f"macos-retained-frame-fixture/{file}",
                          (self.out / "SHA256SUMS").read_text())

    def test_mac_missing_bad_retained_frame_or_validator_failure_remains_failure(self):
        self.source("macos")
        self.commit()
        for case, failure in [("missing-mac-frame-fixture", ""), ("bad-mac-frame-fixture", ""),
                              ("validator-failure", "mac-frame-validator")]:
            with self.subTest(case=case):
                self.out = Path(self.temp.name) / case
                result, status = self.run_checks("macos", failure, case)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(status["last_phase"], "mac-frame-fixture")
                self.assertTrue((self.out / "MacDesktop.zip").is_file())
                self.assertTrue((self.out / "mac-frame-fixture.log").read_text())
                if case != "missing-mac-frame-fixture":
                    self.assertIn("macos-retained-frame-fixture/native/synthetic-session/raw.png",
                                  (self.out / "SHA256SUMS").read_text())
                if failure:
                    self.assertEqual(result.returncode, 31)

    def test_mac_missing_bad_composed_or_validator_failure_remains_failure(self):
        self.source("macos")
        self.commit()
        for case, failure in [("missing-composed-fixture", ""), ("bad-composed-fixture", ""),
                              ("validator-failure", "composed-validator")]:
            with self.subTest(case=case):
                self.out = Path(self.temp.name) / case
                result, status = self.run_checks("macos", failure, case)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(status["last_phase"], "composed-fixture")
                self.assertTrue((self.out / "MacDesktop.zip").is_file())
                self.assertTrue((self.out / "composed-fixture.log").read_text())
                if case != "missing-composed-fixture":
                    self.assertIn("macos-composed-fixture/synthetic-session/ink.json",
                                  (self.out / "SHA256SUMS").read_text())
                if failure:
                    self.assertEqual(result.returncode, 29)

    def test_mac_missing_or_invalid_fixture_fails_and_keeps_app(self):
        self.source("macos")
        self.commit()
        for case in ["missing-fixture", "missing-png", "bad-json"]:
            with self.subTest(case=case):
                self.out = Path(self.temp.name) / case
                result, status = self.run_checks("macos", fixture_case=case)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(status["last_phase"], "fixture")
                self.assertTrue((self.out / "MacDesktop.zip").is_file())

    def test_mac_missing_test_target_or_package_script_fails(self):
        source = self.source("macos")
        self.commit()
        result, status = self.run_checks("macos", fixture_case="missing-target")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(status["last_phase"], "targets")
        (source / "package-app.sh").unlink()
        self.git("add", "-u")
        self.commit()
        self.out = Path(self.temp.name) / "missing-script"
        result, status = self.run_checks("macos")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(status["state"], "source-not-ready")

    def test_mac_missing_bad_ingress_or_validator_failure_remains_failure(self):
        self.source("macos")
        self.commit()
        for case, failure in [("missing-ingress-fixture", ""), ("bad-ingress-fixture", ""),
                              ("validator-failure", "ingress-validator")]:
            with self.subTest(case=case):
                self.out = Path(self.temp.name) / case
                result, status = self.run_checks("macos", failure, case)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(status["last_phase"], "ingress-fixture")
                self.assertTrue((self.out / "MacDesktop.zip").is_file())
                self.assertTrue((self.out / "ingress-fixture.log").read_text())
                self.assertIn("macos-fixture/synthetic-session/status.json", (self.out / "SHA256SUMS").read_text())
                if case != "missing-ingress-fixture":
                    self.assertIn("macos-ingress-fixture/requests/mixed.json", (self.out / "SHA256SUMS").read_text())
                if failure:
                    self.assertEqual(result.returncode, 23)
                    self.assertIn("injected validator failure", (self.out / "ingress-fixture.log").read_text())

    def test_mac_changed_dependency_lock_is_rejected_without_installing(self):
        self.source("macos")
        self.commit()
        (self.root / "uv.lock").write_text("uncommitted dependency change")
        result, status = self.run_checks("macos")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(status["state"], "source-not-ready")
        self.assertEqual((self.root / "uv.lock").read_text(), "uncommitted dependency change")

    def test_owner_test_failure_retains_each_platform_package(self):
        for platform, command, archive in [("windows", "npm test", "WindowsDesktop.zip"),
                                            ("macos", "swift test --configuration release", "MacDesktop.zip")]:
            with self.subTest(platform=platform):
                self.source(platform)
                self.commit()
                self.out = Path(self.temp.name) / platform
                result, status = self.run_checks(platform, command)
                self.assertEqual(result.returncode, 17)
                self.assertEqual(status["last_phase"], "tests")
                self.assertEqual(status["state"], "failed")
                self.assertTrue((self.out / archive).is_file())
                if platform == "macos":
                    self.assertTrue((self.out / "macos-fixture/synthetic-session/frames/00000001.png").is_file())
                    self.assertIn("macos-fixture/synthetic-session/status.json", (self.out / "SHA256SUMS").read_text())
                    self.assertIn("macos-ingress-fixture/native/synthetic-session/frames/00000001.png",
                                  (self.out / "SHA256SUMS").read_text())
                    self.assertIn("macos-composed-fixture/synthetic-session/composed.png",
                                  (self.out / "SHA256SUMS").read_text())
                    self.assertFalse((self.out / "ingress-fixture.log").exists())
                    self.assertFalse((self.out / "composed-fixture.log").exists())
                    self.assertIn("macos-retained-frame-fixture/native/synthetic-session/raw.png",
                                  (self.out / "SHA256SUMS").read_text())
                    self.assertFalse((self.out / "mac-frame-fixture.log").exists())

    def test_mac_toolchain_failure_is_not_hidden_by_later_command(self):
        self.source("macos")
        self.commit()
        result, status = self.run_checks("macos", "xcodebuild -version")
        self.assertEqual(result.returncode, 17)
        self.assertEqual(status["last_phase"], "toolchain")
        self.assertNotIn("stub Swift", (self.out / "toolchain.log").read_text())


if __name__ == "__main__":
    unittest.main()
