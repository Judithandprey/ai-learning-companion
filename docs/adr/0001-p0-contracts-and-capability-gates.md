# ADR 0001: P0 contracts and capability gates

Date: 2026-09-28 UTC. Status: accepted for P0 probes; provider and device decisions remain gated.

## Context

The user authorized P0 implementation and parallel team work. Baseline is
`4684b79ed979ad5162e1c86635a245d68601da84`. All six worktrees were at that baseline
and lead main was clean. The repository contained documents only. Local inspection
found Python 3.14.4 and uv 0.12.19; Node/npm were absent. No device, course account,
OAuth registration or macOS/Xcode access has been demonstrated in this run.

P0 exits with honest G1–G6 evidence, source fixtures, authentication/cost skeletons,
and documented preferred/fallback paths. P0 does not require pretending every
platform is supported. The actual-course daily loop is P1; an early P0 integration
probe does not satisfy that stage by itself.

## Decision

Retain the specified architecture: native SwiftUI/UIKit iPad client, TypeScript
Safari content script/native bridge, Python/FastAPI service, PostgreSQL source
archive and controlled object storage. Defer LiveKit/Redis/graph deployment until
bounded probes establish a need. Do not substitute a standalone document chatbot.

JSON Schema 2020-12 is the shared wire-format source of truth. P0 starts with named
source/frame/event/selection/note/auth/budget/job/bridge contracts and Python shape
and local-invariant validation. TypeScript is generated using a deliberately small
schema subset; it is structural typing, not authorization or runtime validation.
There is no independent JavaScript schema copy. HTTP endpoints and generated
OpenAPI are added with the backend skeleton after this baseline.

Dependencies are exact-pinned in pyproject/uv.lock and package/package-lock. Node
24.21.0 LTS is bootstrapped only into ignored `.tools` and checked against an
explicit official SHA-256. Python and JS tools do not install global services.
`jsonschema[format]` is explicit because formats otherwise need not be asserted.

Source and frame hashes refer to original bytes. Synthetic fixture provenance is
mandatory; fixture artifacts cannot be cited as real user history or true screen
capture. Corrections preserve originals. User ink and AI layers are separate.

API budget uses integer CNY fen (initial monthly limit 100,000); unknown prices,
FX, quotas and authentication cannot be treated as free. No paid product call is
enabled by this ADR. Backend must prove atomic reservation, settlement and retries
before connecting a paid provider. Development-tool subscription usage is separate.

## Work allocation and practical limits

First parallel batch: web selection/card probe, iOS documented capability matrix,
and learning fixed fixtures/retrieval baseline. Lead owns this contract and shared
tooling. Backend starts after contract review; QA independently reproduces a fixed
integrated candidate. Module tests use in-process fixtures or ephemeral ports;
web manual probe may bind loopback 4173, API 8173, QA 9173 only while explicitly
running a foreground check. No shared database or persistent service is launched.

No current evidence proves a Mac/Xcode/device route. iOS must investigate the
available project environment before concluding a path is absent, record precise
requirements, and avoid extensive uncompiled Swift. G1/G2/G3/G5 device tests and
G4 real OAuth depend on actual environments/accounts. Continue local independent
work; surface those concrete inputs after the respective capability reports.

## Sources checked

- [JSON Schema 2020-12](https://json-schema.org/draft/2020-12)
- [python-jsonschema validation and format behavior](https://python-jsonschema.readthedocs.io/en/stable/validate/)
- [FastAPI official documentation](https://fastapi.tiangolo.com/)
- [Node release lifecycle](https://nodejs.org/en/about/previous-releases)
- [Node 24.21.0 official checksums](https://nodejs.org/dist/v24.21.0/SHASUMS256.txt)
- [TypeScript package metadata](https://registry.npmjs.org/typescript/7.0.2)

These sources establish formats and tooling, not application/device success.
