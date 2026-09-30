#!/usr/bin/env python3
"""Linux POSIX descriptor probes, not execution/simulation of the Swift product."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import tempfile
import time

REPO = '/home/agentsdock/Projects/learning-companion/repo'
SHA = 'fb1d1ed3f3f0d35f88367a03551c15ca705f6f12'

def sha(data):
    return hashlib.sha256(data).hexdigest()

def git(*args):
    return subprocess.check_output(['git', '-C', REPO, *args])

def read(root, length, expected, hook=None):
    root_fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC)
    parent_fd = descriptor = None
    read_count = 0
    try:
        parent_fd = os.open('frames', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=root_fd)
        if hook:
            hook('parent_opened')
        descriptor = os.open('00000001.png', os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC, dir_fd=parent_fd)
        info = os.fstat(descriptor)
        if not stat.S_ISREG(info.st_mode):
            return 'not_regular', read_count
        if info.st_size != length:
            return 'size_mismatch', read_count
        if hook:
            hook('before_read')
        data = os.read(descriptor, length + 1)
        read_count = len(data)
        return ('success' if len(data) == length and sha(data) == expected else 'bytes_mismatch'), read_count
    except OSError:
        return 'open_refused', read_count
    finally:
        for fd in (descriptor, parent_fd, root_fd):
            if fd is not None:
                os.close(fd)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('export', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    paths = git('diff', '--name-only', SHA + '^', SHA).decode().splitlines()
    files = []
    for name in paths:
        data = (args.export / name).read_bytes()
        assert data == git('show', SHA + ':' + name), name
        files.append({'path': name, 'sha256': sha(data), 'export_equals_git': True})
    manifest = json.loads((args.export / 'docs/requirements/english-translation-manifest.json').read_text())
    requirements = []
    for item in manifest['files']:
        for kind in ('source', 'translation'):
            p = item[kind + '_path']
            h = sha((args.export / p).read_bytes())
            assert h == item[kind + '_sha256'], p
            requirements.append({'path': p, 'sha256': h})
    cases = []
    with tempfile.TemporaryDirectory(prefix='mac-openat-probes-', dir='/tmp') as temp:
        data = b'retained original bytes'
        expected_hash = sha(data)
        for name in ('exact', 'size_mismatch', 'hash_mismatch', 'fifo', 'leaf_symlink', 'parent_symlink', 'parent_replaced_after_open', 'truncate_after_fstat', 'grow_after_fstat'):
            root = Path(temp) / name
            parent = root / 'frames'
            parent.mkdir(parents=True)
            file = parent / '00000001.png'
            outside = root / 'outside'
            outside.mkdir()
            external = outside / file.name
            external.write_bytes(b'outside original bytes')
            file.write_bytes(data)
            length = len(data)
            expected = 'success'
            supplied_hash = expected_hash
            hook = None
            if name == 'size_mismatch':
                length += 1
                expected = 'size_mismatch'
            elif name == 'hash_mismatch':
                supplied_hash = '0' * 64
                expected = 'bytes_mismatch'
            elif name == 'fifo':
                file.unlink()
                os.mkfifo(file)
                expected = 'not_regular'
            elif name == 'leaf_symlink':
                file.unlink()
                file.symlink_to(external)
                expected = 'open_refused'
            elif name == 'parent_symlink':
                parent.rename(root / 'retained-parent')
                parent.symlink_to(outside, target_is_directory=True)
                expected = 'open_refused'
            elif name == 'parent_replaced_after_open':
                def hook(phase):
                    if phase == 'parent_opened':
                        parent.rename(root / 'retained-parent')
                        parent.symlink_to(outside, target_is_directory=True)
            elif name in ('truncate_after_fstat', 'grow_after_fstat'):
                expected = 'bytes_mismatch'
                def hook(phase):
                    if phase == 'before_read':
                        file.write_bytes(b'' if name == 'truncate_after_fstat' else data + b'new bytes')
            started = time.monotonic()
            result, count = read(root, length, supplied_hash, hook)
            elapsed = time.monotonic() - started
            assert result == expected, (name, result, expected)
            assert count <= length + 1
            assert elapsed < 1
            assert external.read_bytes() == b'outside original bytes'
            cases.append({'case': name, 'result': 'PASS', 'classification': result, 'bytes_read': count, 'elapsed_seconds': elapsed})
    result = {'candidate': SHA, 'parent': git('rev-parse', SHA + '^').decode().strip(),
              'export': str(args.export), 'files': files, 'requirements': requirements,
              'platform': 'Linux Python os.open(dir_fd)/os.fstat/os.read; not Swift/Foundation/macOS',
              'primitive_cases': cases, 'primitive_passed': len(cases), 'swift_compiled': False,
              'swift_tests_run': False, 'repository_modified': False}
    args.output.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'source_files_equal': len(files), 'manifest_entries_equal': len(requirements), 'linux_primitive_cases_passed': len(cases), 'swift': 'NOT_RUN'}))

if __name__ == '__main__':
    main()
