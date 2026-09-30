# Windows context-cap correction — source approved

Actual owner **f277362b5f13a0681a6cd9e5ea5f04e67b05ed86**, parent49305e3,
arrived as **handoff_1010c17470988dc1facadf8ca29977a5**. Lead reviewed the exact
small renderer/pin delta against [preserved failures](../windows-alignment-correction-review/README.md).

The extra `Gesture.seen` frame advances only on a counted local transition. It
is pinned before the prior comparison frame is unpinned; it never adds a ninth
saved context. The open-gesture guard makes release idempotent and clears seen.
Pointer-up, pointer cancellation, mode change, Stop and Open converge on the
existing finish/settle/commit path; success and error both release the gesture.
No stroke/history, wire, original context or default activation was removed.

Lead adapted a **new** probe without changing the historical one. Actual
renderer/main Stop→save→strict reread now records1 for140→160→160 and2 for
140→160→140. Both retain8contexts, all11points, one history entry, successful
Stop ACK and zero remaining frame pins. [Probe](probe.mjs), [output](results.txt),
and saved originals are retained. Exact candidate's alignment and Stop test files
also pass (2 reported files/0 failures,3.298s); these include owner onward/repeat,
below-cap and saved-context ordering cases. Synthetic canvas/PNG is explicit;
this is not a new native pixel or hardware test.

Lead resolves the owner's routine semantic question without a new product choice:
the field counts **observed local changes during an open writing gesture**. A
change after the latest point can be observed while the pen remains down; the
count does not assert a new user operation or that later ink covered the changed
content. Saved picture contexts still correspond to actual written segments.
This unchanged behavior preserves observations and must not be used as inferred
user reasoning, edit history or independent mastery. No historical data is rewritten.

The prior cap P2 is closed for these source/save cases. Next: normal integration,
focused resulting-main check/build, then ONE independent Windows QA-WIN-01
changed-behavior retest after current API QA. Neither §7.1 product gate is passed;
real provider/physical pen/interactive Mac/audio/Notability remain separate.
