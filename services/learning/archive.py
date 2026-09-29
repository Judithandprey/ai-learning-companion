"""Read-only in-memory views of shared v0.1 archive records.

Snapshots validate supplied originals, not permission to acquire/use them. Backend
owns persistence and transactional authorization; fixture files are a test transport.
"""

from collections.abc import Mapping
from copy import deepcopy
from hashlib import sha256
import json
from pathlib import Path
from types import MappingProxyType

from packages.contracts import validate

from .timestamps import utc_instant_key


def digest(data: bytes) -> str:
    return sha256(data).hexdigest()


def canonical(data) -> bytes:
    return json.dumps(data, sort_keys=True, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode()


def source_key(record):
    return record["user_id"], record["source_id"], record["source_version"]


def event_key(record):
    return record["user_id"], record["event_id"]


def identity(record):
    return {k: record[k] for k in ("user_id", "source_id", "source_version", "event_id", "frame_id")}


class _ValidatedArchive:
    """Shared record validation/evidence logic; no acquisition or persistence."""

    def __init__(self, sources, frames, observations, artifacts, *, user_id=None):
        self.sources = {}
        self.frames = {}
        self.events = {}
        if not isinstance(artifacts, Mapping):
            raise ValueError("Artifacts must map existing artifact IDs to immutable bytes")
        artifact_bytes = dict(artifacts)
        for artifact_id, data in artifact_bytes.items():
            validate("Identifier", artifact_id)
            if not isinstance(data, bytes):
                raise ValueError("Artifact content must be immutable bytes")
        self.artifacts = MappingProxyType(artifact_bytes)
        records = deepcopy((sources, frames, observations))
        for name, items, target, key_fn in (
            ("SourceSnapshot", records[0], self.sources, source_key),
            ("Frame", records[1], self.frames, lambda r: (r["user_id"], r["frame_id"])),
            ("Observation", records[2], self.events, event_key),
        ):
            for record in items:
                validate(name, record)
                if user_id is not None and record["user_id"] != user_id:
                    raise ValueError(f"{name} owner differs from trusted snapshot user_id")
                key = key_fn(record)
                if key in target:
                    raise ValueError(f"Duplicate {name} identity: {key}")
                target[key] = record
        for source in self.sources.values():
            if digest(source["text"].encode()) != source["content_hash"]:
                raise ValueError("Source text hash mismatch")
        for frame in self.frames.values():
            if source_key(frame) not in self.sources:
                raise ValueError("Frame has no matching source version/owner")
            if frame["artifact_id"] not in self.artifacts:
                raise ValueError("Frame is missing required artifact bytes")
            if digest(self.artifacts[frame["artifact_id"]]) != frame["content_hash"]:
                raise ValueError("Frame artifact hash mismatch")
        sequences = set()
        for event in self.events.values():
            if source_key(event) not in self.sources:
                raise ValueError("Observation has no matching source version/owner")
            sequence = event["user_id"], event["device_id"], event["device_sequence"]
            if sequence in sequences:
                raise ValueError("Duplicate device sequence")
            sequences.add(sequence)
            if event["frame_id"] is not None:
                frame = self.frames.get((event["user_id"], event["frame_id"]))
                if frame is None:
                    raise ValueError("Observation has no matching frame/owner")
                for field in ("source_id", "source_version", "device_id", "session_id", "media_position"):
                    if event[field] != frame[field]:
                        raise ValueError(f"Observation/frame mismatch: {field}")
            if event["correction_of"] is not None:
                prior = self.events.get((event["user_id"], event["correction_of"]))
                if prior is None:
                    raise ValueError("Correction has no matching prior observation/owner")
                if prior["actor"] != event["actor"] or prior["source_id"] != event["source_id"]:
                    raise ValueError("Invalid correction ownership")
        # v0.1 stored capture clocks need not increase along correction links.
        # Check the actual dependency graph in linear time without recursion.
        completed = set()
        for key in self.events:
            path = set()
            current = key
            while current is not None and current not in completed:
                if current in path:
                    raise ValueError("Invalid correction cycle")
                path.add(current)
                event = self.events[current]
                current = (event["user_id"], event["correction_of"]) if event["correction_of"] is not None else None
            completed.update(path)
        self.fingerprint = digest(canonical({"sources": records[0], "frames": records[1], "observations": records[2]}))

    def evidence(self, key):
        event = self.events[tuple(key)]
        source = self.sources[source_key(event)]
        frame = self.frames.get((event["user_id"], event["frame_id"]))
        return deepcopy({**identity(event), "actor": event["actor"], "text": event["text"],
                         "captured_at": event["captured_at"], "media_position": event["media_position"],
                         "gap_flags": event["gap_flags"], "correction_of": event["correction_of"],
                         "project_id": source["project_id"], "original_url": source["original_url"],
                         "source_hash": source["content_hash"], "provenance": source["provenance"],
                         "frame": frame})


class ArchiveSnapshot(_ValidatedArchive):
    """Owner-scoped view of already acquired v0.1 records and exact artifact bytes.

    The trusted caller must acquire/recheck an authorized, complete snapshot
    transactionally and discard old contexts after changes/deletion/revocation.
    Provenance/consent labels are preserved, never treated as permission grants.
    Input records are copied; treat the resulting record maps as immutable, as
    with FixtureArchive. Context assembly checks their identity and fingerprint.
    Null frames and equal/backdated correction clocks retain their original gap
    flags/timestamps: capture time is not a causal-order validation rule.
    This class has no loader, writes, fetcher, identity store or provider client.
    """

    def __init__(self, sources, frames, observations, artifacts, *, user_id):
        validate("Identifier", user_id)
        self.user_id = user_id
        super().__init__(sources, frames, observations, artifacts, user_id=user_id)


class FixtureArchive(_ValidatedArchive):
    """Synthetic/test-only transport, including mixed-owner isolation fixtures."""

    def __init__(self, sources, frames, observations, artifacts):
        super().__init__(sources, frames, observations, artifacts)
        for source in self.sources.values():
            if source["provenance"]["origin"] != "synthetic" or source["provenance"]["consent_scope"] != "test_only":
                raise ValueError("Fixture adapter only accepts synthetic test-only records")
        # These stricter conventions belong to our authored fixtures, not to
        # every legal v0.1 record already accepted by the production archive.
        for event in self.events.values():
            if event["frame_id"] is None and "missing_frame" not in event["gap_flags"]:
                raise ValueError("Absent frame must be explicit")
            if event["correction_of"] is not None:
                prior = self.events[(event["user_id"], event["correction_of"])]
                if utc_instant_key(prior["captured_at"]) >= utc_instant_key(event["captured_at"]):
                    raise ValueError("Invalid correction ownership/order")

    @classmethod
    def load(cls, root: Path):
        root = root.resolve()
        manifest = json.loads((root / "manifest.json").read_text())
        files = {}
        for name, expected_hash in manifest["files"].items():
            path = (root / name).resolve()
            if not path.is_relative_to(root):
                raise ValueError("Fixture path leaves root")
            data = path.read_bytes()
            if digest(data) != expected_hash:
                raise ValueError(f"Fixture hash mismatch: {name}")
            files[name] = data
        bundle = json.loads(files["records.json"])
        artifacts = {key: files[path] for key, path in manifest["artifacts"].items()}
        for source in bundle["sources"]:
            path = manifest["source_texts"][f'{source["user_id"]}/{source["source_id"]}/{source["source_version"]}']
            if files[path].decode() != source["text"]:
                raise ValueError("Source original UTF-8 bytes differ from contract text")
        return cls(bundle["sources"], bundle["frames"], bundle["observations"], artifacts)
