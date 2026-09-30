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

Status before publication: source integrated and workflow reviewed; new Swift
checks and builds **not yet executed**. Expected counts in the owner report are
not passes. Actual hosted run/SHA/results will be recorded after execution.
Trusted registration/bootstrap, explicit raw HTTP consumer, actual ReplayKit/device,
provider input/orientation handling, both core gates and Notability remain open.
