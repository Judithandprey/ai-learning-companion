# Raw native mapper integration checkpoint

Exact iOS delivery `6a33b87fb88bf416c84b01694e01597170fcbf27` integrates as
`fe5feac`. The pure, currently uncalled mapper preserves the kept PNG binding,
raw dimensions/orientation, buffer sequence, unknown capture/course time and
separately labelled callback estimate. It neither sends nor grants producer access.
Full source/call-flow review and the existing contract compatibility review found
no blocker to hosted compilation; [owner evidence](../platform/raw-capture-frame-mapper.md).

Independent source review at `/tmp/ios-raw-frame-mapper-review.md` ran 104 simulated
Python fixture checks, seven corruptions and six numeric guard simulations. Those
are **not actual Swift output**. Lead checked the three integrated source/check
files byte-for-byte against the reviewed commit and parsed the Python validator.

The existing ScreenObserver workflow now adds the native mapper executable,
validation of its actual Swift-emitted fixtures against 0.2.5, retained partial
fixtures/logs, explicit outcomes and exact-source archive coverage. It reuses the
pinned uv environment and existing unsigned device/simulator builds. Independent
workflow review parsed YAML, all 10 Bash blocks and both embedded Python blocks;
failed compile/check steps remain fatal and both fixture families survive failure.
No new dependency, workflow framework, signing or simulator campaign was added.

The source-review-only checkpoint is superseded by actual hosted execution at
**`2a5e6bcc6c6ff73ff0148d8b6e88ffd257eac253`**:
[run36670348178](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36670348178)
completed successfully at 2026-09-30 04:51:02 UTC (4m30s). Actual results:
**40 native mapper assertions,104 Python assertions on15 real Swift fixtures**;
existing99 native upload/42 ingress-fixture/15 retention assertions pass separately.
Both unsigned device/simulator SDK26.5 apps and embedded extensions compile.
The same SHA's normal P0 CI36670348197 passes both matrices.

Independent artifact audit verifies all15 retained artifact hashes and102 exact
archived source files, and reruns the validator successfully on actual Swift
fixtures. [Selected original logs/results](raw-native-hosted/) are preserved;
SHA256SUMS covers the complete downloaded GitHub artifact, not just this selected
subset. Full products/fixture archive remain in the run and locally at
`/tmp/native-raw-2a5e6bc-evidence`. Native status is now compiled/tested for this
bounded hosted path; it is still not installed or verified on a physical device.

The next existing-card iOS task was actually accepted as
`handoff_63bc0c142d28c594c19f5d6fafe8d405`: one framed provisional sample's durable
0.2.6 request/retry/verified process ACK, following the original-byte receipt,
using supplied trusted identities/sequence and injected transport. No UI or
BroadcastUpload activation/default endpoint/credential. Initial receipt was
unread/not started; an accepted delivery is not implementation evidence.
Trusted registration/bootstrap, explicit raw HTTP consumer, actual ReplayKit/device,
provider input/orientation handling, both core gates and Notability remain open.
