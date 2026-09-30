#!/usr/bin/env python3
"""Bounded read-only source provenance and Linux link(2) primitive probes.

These checks DO NOT execute, compile, simulate, or establish correctness of Swift.
Only the POSIX placement primitive is exercised, in disposable /tmp directories.
"""
import argparse
import errno
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile

REPO = Path('/home/agentsdock/Projects/learning-companion/repo')
TIP = '35c75a45b1a29c3e069e061e077b45f820cfee1e'
CODE = '89edd5c499a80ffe7454a0924881eec63e79f195'
BASE = 'a84289eb8497a97006e43fcfc953d9229abf51f0'

def git(*args):
    return subprocess.check_output(['git', '-C', str(REPO), *args])

def digest(value):
    return hashlib.sha256(value).hexdigest()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('export', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    assert git('rev-parse', TIP + '^').decode().strip() == CODE
    assert git('rev-parse', CODE + '^').decode().strip() == BASE
    paths = git('diff', '--name-only', BASE, TIP).decode().splitlines()
    files = []
    for name in paths:
        actual = (args.export / name).read_bytes()
        expected = git('show', TIP + ':' + name)
        assert actual == expected, name
        files.append({'path': name, 'sha256': digest(actual), 'export_equals_git': True})
    source_paths = [p for p in paths if '/Sources/' in p]
    assert len(source_paths) == 7
    assert git('rev-parse', TIP + ':apps/macos') == git('rev-parse', CODE + ':apps/macos')
    manifest = json.loads((args.export / 'docs/requirements/english-translation-manifest.json').read_text())
    requirements = []
    for entry in manifest['files']:
        for label in ('source', 'translation'):
            path = entry[label + '_path']
            actual = digest((args.export / path).read_bytes())
            assert actual == entry[label + '_sha256'], path
            requirements.append({'path': path, 'sha256': actual, 'manifest_match': True})
    outcomes = []
    with tempfile.TemporaryDirectory(prefix='mac-ink-link-primitive-', dir='/tmp') as temp:
        root = Path(temp)
        for variant in ('success', 'raced_regular_file', 'raced_symlink', 'raced_directory'):
            folder = root / variant
            folder.mkdir()
            data = b'{"original":"new frozen document"}'
            target = folder / (digest(data) + '.json')
            staging = folder / '.staging-own-probe.json'
            with staging.open('xb') as handle:
                handle.write(data)
            existing = b'previous original; never replace'
            outside = root / ('outside-' + variant)
            if variant == 'raced_regular_file':
                target.write_bytes(existing)
            elif variant == 'raced_symlink':
                outside.write_bytes(existing)
                target.symlink_to(outside)
            elif variant == 'raced_directory':
                target.mkdir()
            try:
                os.link(staging, target)
                linked, error = True, None
            except OSError as exc:
                linked, error = False, exc.errno
            staging.unlink()
            assert not staging.exists()
            if variant == 'success':
                assert linked and target.read_bytes() == data
                assert target.stat().st_nlink == 1
            else:
                assert not linked and error == errno.EEXIST
                if variant == 'raced_directory':
                    assert target.is_dir() and list(target.iterdir()) == []
                else:
                    assert target.read_bytes() == existing
                    assert target.is_symlink() == (variant == 'raced_symlink')
            outcomes.append({'case': variant, 'result': 'PASS', 'linked': linked, 'errno': error})
    result = {
        'review_scope': 'source storage/lifecycle only; no Swift execution',
        'export': str(args.export), 'tip': TIP, 'code': CODE, 'base': BASE,
        'files': files, 'changed_production_source_count': len(source_paths),
        'followup_docs_only_for_apps': True, 'requirements': requirements,
        'primitive_platform': 'Linux; Python os.link/os.unlink, not macOS Foundation',
        'primitive_results': outcomes, 'primitive_pass': len(outcomes),
        'swift_compile': 'NOT_RUN', 'swift_tests': 'NOT_RUN',
    }
    args.output.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'export_files_equal': len(files), 'manifest_entries_equal': len(requirements),
                      'primitive_pass': len(outcomes), 'swift': 'NOT_RUN'}))

if __name__ == '__main__':
    main()
