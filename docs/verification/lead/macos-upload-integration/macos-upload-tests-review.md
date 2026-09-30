# Mac upload tests and fixture checker — fb1d1ed

**APPROVE this bounded test-source/checker slice with a P3 evidence-completeness finding.** No concrete compile-source blocker found in the reviewed tests; actual macOS compilation and execution remain pending. Production storage/batch/transport review belongs to the other reviewers. Candidate `fb1d1ed3f3f0d35f88367a03551c15ca705f6f12`, parent `64e2302a436c9c5731e530199c79dbb112c9b0a8`; exact export `/tmp/macos-upload-fb1d1ed-export`.

Reviewed the full new 932-line XCTest file and 311-line checker, the retained-test delta and transport report. Refreshed workflow/PONYTAIL LITE and affected original/English lifecycle, source/ink/gap and §7.1/7.2 boundaries. Translation source hashes match the manifest. Released 0.2.12, 0.2.2, 0.2.4 and 0.2.0 contract code in the export matches main `0704fff`.

## Meaningful coverage

- **55 declared XCTest methods in seven files**, eight new. Existing MacRetainedFramesTests only exposes four fixture helpers to the same test target; existing assertions are unchanged. No concrete Swift compile trap found from source. Package uses Swift 5 language mode with a macOS 15 floor; Linux stub type-check/run claims do not prove native API behavior.
- Builder tests assert supplied Process sequences101–108, null observation/media/clock, preserved mapper descriptors, pixel-producer vocabulary, deterministic bytes and exact ordered raw/composed/immutable-ink references. Fourteen distinct originals include two JSON snapshots; the shared snapshot is referenced by frames2/3 and the reopened one by frame6. Not-recorded and unavailable frames get no fabricated ink. Mutable `ink/ink.json` is explicitly excluded.
- Constructed retained-gap and gap-only cases check frameless unknown coverage, refusal of a gap absent from the session and retained unrepresented facts. The emitted successful fixture itself contains eight framed records, **not a gap upload transcript**; do not overstate its integration coverage.
- Uploader stand-in cases check exact original bytes, PUT-before-POST order, unchanged POST/key, first-200 receipt mismatch, lost answers, six malformed/non-corresponding ACKs, wrong error-family/status/retryability and doubt preservation. Stop/cancellation/expiry tests assert nothing further is sent, with already acknowledged originals and current in-doubt ID preserved. Local changed/missing/link/FIFO and between-check/upload mutation cases require zero or precisely bounded sends.
- The checker reuses released strict request/upload validators and independently compares native descriptors, immutable JSON and image originals, bindings, body bytes, headers and exact receipts/verified-only ACK. Its receipt/body comparison is separate from Swift's checker implementation. The stand-in still has no backend transaction, current-auth service or durable archive semantics; pure validation cannot prove these.
- The URLProtocol test exercises loading-system headers/body and reply-size classification. It deliberately does not trigger a real URLSession redirect callback; the delegate is asserted and invoked directly. The report correctly leaves real socket redirects, ATS and actual URLSession/macOS execution unverified. The unresumed dummy data task makes no network call.

## P3: fixture/checker do not verify actual HTTP reply status

`checks/validate_mac_upload.py:113` never consumes `exchange["status"]`. The fixture writer at `MacIngressUploadTests.swift:357` stores literal200 instead of the reply's observed status. Consequently, an otherwise unchanged success-body transcript marked HTTP403 is accepted for either the first PUT or POST.

Exact candidate reproduction: `/tmp/macos-upload-checker-probes.py`, observations `/tmp/macos-upload-checker-probes.json`. It reads the owner's existing explicitly **Python-simulated** fixture, mutates only an in-memory manifest, and confirms:

1. Baseline exchanges pass with14 distinct verified originals.
2. First PUT status200→403 still returns no problems.
3. POST status200→403 still returns no problems.
4. Changing the POST bearer is refused, confirming that the same checking path is active.

Minimal correction is to retain actual reply status beside each body, require committed exchanges to have HTTP200, and add both wrong-status controls. This is a gap in independent transcript verification, **not a demonstrated production uploader flaw**: production `Sender.send` separately requires `reply.status == 200` for accepted bodies. It does not block compiling the source. Until fixed, describe the Python check as request/body/metadata conformance rather than full HTTP-status parity.

## Checks run and evidence limits

The exact candidate Python checker ran once on `/tmp/lc-0212-sim/mac-upload-fixture`: **22 PASS checks including16 negative controls**, with40,320 timestamp verdicts. Log: `/tmp/macos-upload-checker-baseline.log`. That fixture and its timestamp verdicts were produced by a Python port; passing does **not** demonstrate Swift encoding or Swift timestamp parity. The four independent in-memory probes above and `ast.parse`/`git diff --check` are the remaining review checks. No whole suite ran.

The report's Linux Swift6.3.3 stubs, eight-new-test passes and52/55 aggregate are author/other-reviewer evidence only. Three reported failures in unchanged tests are not native acceptance and were not relabelled passed. Multiple-model agreement is not evidence. Hosted macOS must still compile the app/library, execute the actual55 XCTest names, emit the new `COMPANION_DESKTOP_MAC_UPLOAD_FIXTURE_DIR` fixture into a previously nonexistent directory, and run the checker over those actual bytes. Keep old fixture/checker families and51 retained refusals intact. Root owns this wiring and actual Swift→Backend composition.

Machine report: `/tmp/macos-upload-tests-review.json`. No Swift/macOS/native execution, real HTTP/socket/DB/provider operation, repository/worker edit or CI dispatch occurred here. This callable seam and synthetic evidence pass no real UI, capture-permission, continuous-AI, editable-reopen-on-device or Notability product gate.
