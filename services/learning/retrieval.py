"""Frozen BM25 + explicit metadata baseline, version 1.

No query-to-ID mapping, labels, embeddings, LLMs or implicit time interpretation.
Scores rank original observations, never synthesized recollections.
"""

from collections import Counter
import json
import math
from pathlib import Path
import re

from .archive import canonical, source_key

VERSION = "bm25-metadata-v1"
K1, B = 1.2, 0.75
STOP = frozenset("a an the is are was were be been of to in on at for and or i me my we our you your what which when where how did do does about that this it from as with said say please find recall remember".split())


def tokens(text):
    # Keep technical numbers/identifiers; Han characters are literal, not translated.
    return [t for t in re.findall(r"[a-z0-9]+|[\u3400-\u9fff]", text.casefold()) if t not in STOP]


class RetrievalIndex:
    def __init__(self, archive, payload=None):
        self.archive = archive
        if payload is None:
            docs = []
            for key, event in sorted(archive.events.items()):
                source = archive.sources[source_key(event)]
                counts = Counter(tokens(event["text"] + " " + source["text"]))
                docs.append({"key": list(key), "counts": dict(counts), "length": sum(counts.values())})
            payload = {"version": VERSION, "archive_fingerprint": archive.fingerprint, "docs": docs}
        if payload["version"] != VERSION or payload["archive_fingerprint"] != archive.fingerprint:
            raise ValueError("Stale or incompatible derived index; rebuild from current archive")
        expected_keys = set(archive.events)
        actual_keys = [tuple(doc["key"]) for doc in payload["docs"]]
        if len(actual_keys) != len(set(actual_keys)) or set(actual_keys) != expected_keys:
            raise ValueError("Index event set differs from archive")
        self.payload = payload

    def save(self, path: Path):
        path.write_bytes(canonical(self.payload) + b"\n")

    @classmethod
    def load(cls, archive, path: Path):
        return cls(archive, json.loads(path.read_text()))

    def search(self, query: dict, *, user_id: str, metadata=True, top_k=5):
        if not user_id or not 1 <= top_k <= 100:
            raise ValueError("Explicit user scope and bounded top_k required")
        mode = query.get("mode", "history")
        if mode not in ("current", "history"):
            raise ValueError("mode must be current or history")
        allowed = {"text", "mode", "project_id", "actor", "after", "before", "source_version"}
        if set(query) - allowed:
            raise ValueError("Unsupported query field")
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
                if query.get("after") and event["captured_at"] < query["after"]:
                    continue
                if query.get("before") and event["captured_at"] >= query["before"]:
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
