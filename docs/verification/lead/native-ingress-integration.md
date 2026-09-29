# Native original-byte consumer: integration checkpoint

Current state **HOLD for four bounded source corrections**, no integration or
hosted build yet. Actual iOS delivery `handoff_48dc2918c9a40153f38dc6a65b9ac7e3`
provides `7de89a67bd6f2d06e8cf12b38bc58f1fe44729ae`, parent `146ccaf` (normal
merge of assigned `1616cce`). The owner additionally read exact released ingress
`ddcae31` through git show and reports unchanged-wire consistency. This is a
substantive delivery/read receipt, not merely notification acceptance.

The app-target-only, uncalled consumer supplies exact retained PNG original
uploads, explicit in-memory authorization/injected transport, durable request
identities and matching receipt checks. It does not activate the capture-only UI,
add the uploader to BroadcastUpload, or establish network/device/provider evidence.
The author explicitly reports Swift **uncompiled**. Its Python fixture validator
ran against Python-simulated fixtures, not native output; those levels stay distinct.

[Independent source review](native-ingress-review.md) and lead reading identify:

1. An already-open instance overwrites subsequently malformed durable state.
2. Stale separate actors can replace newer source binding/queue/receipt state;
   a read-then-write Stop check is not atomic across actors.
3. Repeated Stop after a failed save can return true without persisting Stop.
4. Arbitrary NSError.domain from the injected transport can persist token text.

These are exact source traces, **not executed Swift reproductions**. Corrections
remain the original iOS task and write ownership. Native corrective messages
`handoff_063a7e1579386fc6d5ab50916ca781de` and
`handoff_255274a5dea2404ee450cdd269a1e4d0` were accepted/unread; no corrective
start or result is inferred from these receipts. Preserve originals/sidecars,
unchanged wire, no activation and bounded local error categories. The report also
records parsed-receipt/raw-parser limits without inventing another wire requirement.

## Lead-owned hosted check preparation

The local, deliberately **uncommitted** change to
`.github/workflows/ios-screen-observer.yml` awaits the corrected native source:

- Extend the existing path filter/source archive with CaptureIngressCheck and its
  released contract/lockfile inputs; retain both existing unsigned SDK builds.
- Compile/run the actual native check on the existing macos-26 job, then validate
  its emitted fixtures through the existing pinned uv and locked Python dependency.
- Keep native and Python results separate; failure remains failure through tee.
  Preserve partial fixture ZIP, logs, outcomes and hashes with the existing products.
- No signing, old Simulator campaign, new framework, provider or default activation.

Local verification: YAML/conditions, Bash and embedded Python syntax pass.
`python3 /tmp/check-native-ingress-workflow.py` passes four controlled workflow
stand-ins: compile failure, native-check failure, Python-contract failure and
success; failure codes/outcomes/logs/available fixtures survive each case. They
are **workflow control tests only**, not Swift compilation or contract fixtures.
The prepared diff is also retained at `/tmp/native-ingress-workflow.patch`.
No hosted build was dispatched against the held source.

Next owner: iOS supplies one corrective commit with decisive native regressions;
lead performs targeted source review, integrates the corrected source plus this
workflow, and observes one actual native-check/Python-fixture and both unsigned
SDK build run. Genuine compiler/check failures return to iOS once with logs.
The two core §7.1 gates, real AI/network, trusted bootstrap, frame/clock/orientation
mapping, signing/install, original-screen ink and Notability remain unaccepted.
