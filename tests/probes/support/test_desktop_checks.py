"""Workflow orchestration only: fake OS/build tools, real Git/Node/Python/ZIP.

Run: python3 -m unittest discover -s tests/probes/support -p test_desktop_checks.py -v
Requires Node on PATH. No network, native app build, launch or permission proof.
"""

import hashlib
import json
import os
from pathlib import Path
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
import json, os, pathlib, shutil, sys, zipfile
name = pathlib.Path(sys.argv[0]).name
args = sys.argv[1:]
cwd = pathlib.Path.cwd()
if os.environ.get('FAIL_COMMAND') == name + ' ' + ' '.join(args):
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
    if '--show-bin-path' in args:
        print(binary)
    elif args and args[0] == 'build':
        binary.mkdir(parents=True)
        (binary / 'CompanionDesktop').write_text('stub executable')
        (binary / 'CompanionDesktop').chmod(0o755)
        (binary / 'Assets.bundle').mkdir()
        (binary / 'Assets.bundle/image.txt').write_text('resource')
        (binary / 'libHelper.dylib').write_text('runtime library')
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
        for name in ["uname", "npm", "swift", "ditto", "sw_vers", "xcodebuild"]:
            path = self.bin / name
            path.write_text(STUB)
            path.chmod(0o755)
        for name in BUILD_FILES:
            target = self.root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ROOT / name, target)
        (self.root / ".gitignore").write_text("node_modules/\ndist/\n.build/\n")
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
        return source

    def run_checks(self, platform, failure=""):
        env = {**os.environ, "PATH": str(self.bin) + os.pathsep + os.environ["PATH"],
               "PYTHON": sys.executable, "FAKE_OS": platform, "FAIL_COMMAND": failure}
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
        (self.root / ".gitignore").write_text("node_modules/\ndist/\n.build/\n.env\n")
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

    def test_mac_distribution_keeps_resources_and_executable_mode(self):
        self.source("macos")
        self.commit()
        result, _ = self.run_checks("macos")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        with zipfile.ZipFile(self.out / "MacDesktop.zip") as archive:
            self.assertIn("MacDesktop/Assets.bundle/image.txt", archive.namelist())
            self.assertIn("MacDesktop/libHelper.dylib", archive.namelist())
            self.assertTrue(archive.getinfo("MacDesktop/CompanionDesktop").external_attr >> 16 & 0o111)
        self.assertFalse((self.root / "apps/macos/CompanionDesktop/.build").exists())

    def test_owner_test_failure_retains_each_platform_package(self):
        for platform, command, archive in [("windows", "npm test", "WindowsDesktop.zip"),
                                            ("macos", "swift test", "MacDesktop.zip")]:
            with self.subTest(platform=platform):
                self.source(platform)
                self.commit()
                self.out = Path(self.temp.name) / platform
                result, status = self.run_checks(platform, command)
                self.assertEqual(result.returncode, 17)
                self.assertEqual(status["last_phase"], "tests")
                self.assertEqual(status["state"], "failed")
                self.assertTrue((self.out / archive).is_file())

    def test_mac_toolchain_failure_is_not_hidden_by_later_command(self):
        self.source("macos")
        self.commit()
        result, status = self.run_checks("macos", "xcodebuild -version")
        self.assertEqual(result.returncode, 17)
        self.assertEqual(status["last_phase"], "toolchain")
        self.assertNotIn("stub Swift", (self.out / "toolchain.log").read_text())


if __name__ == "__main__":
    unittest.main()
