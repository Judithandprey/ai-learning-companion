"""Frozen BM25 + explicit metadata baseline, version 1.

No query-to-ID mapping, labels, embeddings, LLMs or implicit time interpretation.
Scores rank original observations, never synthesized recollections.
"""

from collections import Counter
import json
import math
import os
from pathlib import Path
import re
import tempfile

from .archive import canonical, source_key
from .timestamps import utc_instant_key

VERSION = "bm25-metadata-v1"
K1, B = 1.2, 0.75
STOP = frozenset("a an the is are was were be been of to in on at for and or i me my we our you your what which when where how did do does about that this it from as with said say please find recall remember".split())


def tokens(text):
    # Keep technical numbers/identifiers; Han characters are literal, not translated.
    return [t for t in re.findall(r"[a-z0-9]+|[\u3400-\u9fff]", text.casefold()) if t not in STOP]


class InvalidIndexError(ValueError):
    """Unusable derived snapshot; the validated archive remains authoritative."""


def _build_payload(archive):
    docs = []
    for key, event in sorted(archive.events.items()):
        source = archive.sources[source_key(event)]
        counts = Counter(tokens(event["text"] + " " + source["text"]))
        docs.append({"key": list(key), "counts": dict(counts), "length": sum(counts.values())})
    return {"version": VERSION, "archive_fingerprint": archive.fingerprint, "docs": docs}


def _validate_payload(payload, expected):
    if not isinstance(payload, dict) or set(payload) != set(expected):
        raise InvalidIndexError("Invalid index envelope")
    if payload["version"] != VERSION or payload["archive_fingerprint"] != expected["archive_fingerprint"]:
        raise InvalidIndexError("Stale or incompatible derived index; rebuild from current archive")
    if not isinstance(payload["docs"], list):
        raise InvalidIndexError("Index docs must be an array")
    actual = {}
    for doc in payload["docs"]:
        if not isinstance(doc, dict) or set(doc) != {"key", "counts", "length"}:
            raise InvalidIndexError("Invalid index document")
        key, counts, length = doc["key"], doc["counts"], doc["length"]
        if not isinstance(key, list) or len(key) != 2 or any(not isinstance(k, str) for k in key):
            raise InvalidIndexError("Invalid index event key")
        if (not isinstance(counts, dict)
                or any(not isinstance(t, str) or not t or type(n) is not int or n <= 0 for t, n in counts.items())
                or type(length) is not int or length < 0 or length != sum(counts.values())):
            raise InvalidIndexError("Invalid index term counts or length")
        if tuple(key) in actual:
            raise InvalidIndexError("Duplicate index event key")
        actual[tuple(key)] = doc
    # A matching fingerprint alone cannot detect plausible but altered term counts.
    # Re-derive from originals even on load; this cache does not promise faster startup.
    if actual != {tuple(doc["key"]): doc for doc in expected["docs"]}:
        raise InvalidIndexError("Index documents differ from archive-derived terms")


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise InvalidIndexError("Duplicate JSON member in index")
        result[key] = value
    return result


class RetrievalIndex:
    def __init__(self, archive, payload=None):
        self.archive = archive
        expected = _build_payload(archive)
        if payload is not None:
            _validate_payload(payload, expected)
        self.payload = expected
        self._captured_at = {key: utc_instant_key(event["captured_at"]) for key, event in archive.events.items()}

    def save(self, path: Path):
        """Publish a complete cache atomically; pre-replacement failures keep the old one."""
        _validate_payload(self.payload, _build_payload(self.archive))
        data = canonical(self.payload) + b"\n"
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(mode="wb", dir=path.parent, prefix=f".{path.name}.",
                                             suffix=".tmp", delete=False) as stream:
                temporary = Path(stream.name)
                stream.write(data)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, path)
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)

    @classmethod
    def load(cls, archive, path: Path):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=_unique_object)
        except (ValueError, UnicodeError, RecursionError) as error:
            raise InvalidIndexError("Malformed index JSON; rebuild from archive") from error
        # JSON null must not become the constructor's 'build a new index' sentinel.
        if not isinstance(payload, dict):
            raise InvalidIndexError("Invalid index envelope")
        return cls(archive, payload)

    @classmethod
    def load_or_rebuild(cls, archive, path: Path):
        """Recover an explicit cache path, never use it as an archive location.

        Only absence/invalid content triggers rebuilding. Permission, storage and
        replacement errors propagate; callers must not report an unsaved cache as saved.
        Abruptly interrupted saves can leave temporary files, which are never loaded.
        """
        try:
            return cls.load(archive, path)
        except (FileNotFoundError, InvalidIndexError):
            index = cls(archive)
            index.save(path)
            return index

    def search(self, query: dict, *, user_id: str, metadata=True, top_k=5):
        if not user_id or not 1 <= top_k <= 100:
            raise ValueError("Explicit user scope and bounded top_k required")
        mode = query.get("mode", "history")
        if mode not in ("current", "history"):
            raise ValueError("mode must be current or history")
        allowed = {"text", "mode", "project_id", "actor", "after", "before", "source_version"}
        if set(query) - allowed:
            raise ValueError("Unsupported query field")
        after = utc_instant_key(query["after"]) if metadata and query.get("after") is not None else None
        before = utc_instant_key(query["before"]) if metadata and query.get("before") is not None else None
        qterms = set(tokens(query["text"]))
        scope = [d for d in self.payload["docs"] if d["key"][0] == user_id]
        df = Counter(t for d in scope for t in d["counts"])
        avgdl = sum(d["length"] for d in scope) / max(len(scope), 1) or 1
        superseded = {e["correction_of"] for e in self.archive.events.values() if e["user_id"] == user_id}
        latest = {}
        for source in self.archive.sources.values():
            if source["user_id"] == user_id:
                latest[source["source_id"]] = max(latest.get(source["source_id"], 0), source["source_version"])
        scored = []
        for doc in scope:
            event = self.archive.events[tuple(doc["key"])]
            source = self.archive.sources[source_key(event)]
            if source["access_status"] != "ready":
                continue
            if mode == "current" and (event["event_id"] in superseded or event["source_version"] != latest[event["source_id"]]):
                continue
            if metadata:
                if any(query.get(k) is not None and query[k] != actual for k, actual in (
                    ("project_id", source["project_id"]), ("actor", event["actor"]), ("source_version", event["source_version"])
                )):
                    continue
                captured_at = self._captured_at[tuple(doc["key"])]
                if after is not None and captured_at < after:
                    continue
                if before is not None and captured_at >= before:
                    continue
            score = 0.0
            for term in sorted(qterms):
                tf = doc["counts"].get(term, 0)
                if tf:
                    idf = math.log(1 + (len(scope) - df[term] + 0.5) / (df[term] + 0.5))
                    score += idf * tf * (K1 + 1) / (tf + K1 * (1 - B + B * doc["length"] / avgdl))
            if score > 0:
                scored.append((score, tuple(doc["key"])))
        scored.sort(key=lambda item: (-item[0], item[1]))
        hits = [{"score": round(score, 8), **self.archive.evidence(key)} for score, key in scored[:top_k]]
        # This is an evidence candidate state, not an answer or confidence estimate.
        state = "not_found" if not hits else "ambiguous" if len(scored) > 1 and abs(scored[0][0] - scored[1][0]) < 1e-9 else "candidates"
        return {"status": state, "hits": hits}
