# Executed Mac mapper and HTTP-to-Learning composition

Source **`775436f7870abc786b6b50e0dfb54bf7bff84af0`**, ordinary origin/main push.
Hosted macOS-only [run 36711170163](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36711170163)
succeeded on 2026-09-30, 11:52:15Z–11:53:58Z. The `.app` development artifact is
on that run; no binary is committed here. This is not an interactive Mac test.

- Actual macOS 26.6.2, Xcode 26.6, Swift 6.3.3, arm64.
- Release compilation/package succeeded. **27 XCTest cases**, zero failures,
  include the linked-original and missing-event-payload regressions. The separate
  empty SwiftTesting suite is not counted as additional tests.
- The actual Swift test generated three requests, three retained PNG frames and
  explicit gaps. The released Python contract/fixture checker passed **81 checks**
  on those actual bytes. These are native-generated synthetic buffers/events,
  not ScreenCaptureKit observations of a real learning screen.
- Lead executed [the composition probe](../macos-ingress-context-probes.py) on
  the downloaded files unchanged. All three historical request bodies pass the
  trusted runtime HTTP path; 15 original records (eight frameless), three frames
  and exact PNGs survive stored-reader/Learning composition and runtime recreation.
  UInt64 decimal text, negative PTS, null versus empty arrays and unknown chronology
  remain intact. Unknown-boundary Stop retains history and refuses new live input
  and historical retry without a replay grant. Inputs are not rewritten to pass.
- The HTTP/service/Learning execution is in-process over MemoryStore with explicit
  synthetic identity/consent/token. It is not a database or OS process restart;
  those have [separate independent QA evidence](../../qa/p0-13-desktop-runtime-4fa592d.md).
  `provider_receipt:not_attested` and `presentation_permission:not_granted` remain.

The nine-file `macos-ingress-fixture.zip` retains the actual generated fixture,
SHA-256 **`daa355d6a0e3dfa5f9f7898461522cb590f9bf99cf5fd6887bce9db0de88f1b5`**.
`SHA256SUMS` is the complete downloaded artifact's original manifest; this directory
keeps selected original logs and the fixture archive, not every large build file.
`composition.log` was produced by Lead after download. The temporary complete
artifact is `/tmp/lc-macos-36711170163`; its source archive is the reviewed SHA.

To reproduce the composition in the existing locked Python environment, extract
the hash-checked fixture archive into a fresh temporary directory and run:

```sh
.venv/bin/python docs/verification/lead/macos-ingress-context-probes.py /path/to/macos-ingress-fixture
```

No app launch, screen/microphone permission interaction, real provider, user preview,
Paperclip or database change occurred. Both §7.1 gates, physical input, audio,
original-screen anchoring and Notability remain independently open. Next Native
work is the bounded original-screen editable-ink interaction; Lead owns its later
host/contract integration. Interactive Mac access is still unconfirmed.

Independent artifact audit approved this bounded build: **29/29 original checksums**
match, all **1,548 archived source blobs/modes** (including 22 macOS files) match
Git exactly, and the complete arm64 Mach-O `.app` has the exact committed plist
and executable permissions. The fixture retains callbacks 1/3/6, three distinct
4×2 PNGs totaling 538 bytes and all four documented gaps. Audit report/results
remain at `/tmp/lc-macos-36711170163-audit.md` and `-audit.json`; no app was launched.
