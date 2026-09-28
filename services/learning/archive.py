"""Read-only fixture adapter for the shared archive contracts.

The JSON files here are a test transport, not a new production archive. A backend
adapter can supply the same SourceSnapshot, Frame and Observation records later.
"""

from copy import deepcopy
from hashlib import sha256
import json
from pathlib import Path

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


class FixtureArchive:
    """Validated snapshot of synthetic, test-only originals. Never writes to disk."""

    def __init__(self, sources, frames, observations, artifacts):
        self.sources = {}
        self.frames = {}
        self.events = {}
        records = deepcopy((sources, frames, observations))
        for name, items, target, key_fn in (
            ("SourceSnapshot", records[0], self.sources, source_key),
            ("Frame", records[1], self.frames, lambda r: (r["user_id"], r["frame_id"])),
            ("Observation", records[2], self.events, event_key),
        ):
            for record in items:
                validate(name, record)
                key = key_fn(record)
                if key in target:
                    raise ValueError(f"Duplicate {name} identity: {key}")
                target[key] = record
        for source in self.sources.values():
            if source["provenance"]["origin"] != "synthetic" or source["provenance"]["consent_scope"] != "test_only":
                raise ValueError("Fixture adapter only accepts synthetic test-only records")
            if digest(source["text"].encode()) != source["content_hash"]:
                raise ValueError("Source text hash mismatch")
        for frame in self.frames.values():
            if source_key(frame) not in self.sources:
                raise ValueError("Frame has no matching source version/owner")
            if digest(artifacts[frame["artifact_id"]]) != frame["content_hash"]:
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
                frame = self.frames[(event["user_id"], event["frame_id"])]
                for field in ("source_id", "source_version", "device_id", "session_id", "media_position"):
                    if event[field] != frame[field]:
                        raise ValueError(f"Observation/frame mismatch: {field}")
            elif "missing_frame" not in event["gap_flags"]:
                raise ValueError("Absent frame must be explicit")
            if event["correction_of"] is not None:
                prior = self.events[(event["user_id"], event["correction_of"])]
                if (prior["actor"] != event["actor"] or prior["source_id"] != event["source_id"]
                        or utc_instant_key(prior["captured_at"]) >= utc_instant_key(event["captured_at"])):
                    raise ValueError("Invalid correction ownership/order")
        self.fingerprint = digest(canonical({"sources": records[0], "frames": records[1], "observations": records[2]}))

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
