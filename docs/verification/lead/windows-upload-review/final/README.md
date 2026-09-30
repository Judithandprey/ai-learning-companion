# Windows uploader final corrected integration

Actual final correction `f21b2c3e078d5ffd44b102ef1d2c2e32a3451777` arrived as
`handoff_6872be95e9edc0d0ae7a5092856d6adb`. Lead read the complete base/correction
and minimal final delta. Finite known failure-code/error-name lists now prevent
arbitrary diagnostic strings from carrying the supported bearer. All response,
uncertainty, original-byte and current-permission behavior stays intact.

The preserved base `6c4ac03`, correction `c09c151` and final fix `f21b2c3`
integrate normally as `fe7c556`, `2d0d1ac`, `0e65b17`. The entire integrated
`apps/windows` tree equals the reviewed candidate:
`40f28da291a62719d226715db2400f08afcde79e`.

- Exact final candidate: **20/20 real loopback HTTP checks**, no skips,
  6.920 s. Existing actual Backend source from `0c08415` runs with MemoryStore
  and synthetic authority in an owned foreground test process; all children
  are reaped. [Execution](actual-http-tests.txt) and exact synthetic receipts
  are retained. No DB, display or provider is involved.
- [Independent final review](review.md): **13/13 injected-response groups**,
  including the unchanged former failing bearer case and added local-error
  names after partial/uncertain sends. Previous failed evidence is preserved.
- Integrated TypeScript build and static resource copy pass. The one integrated
  multi-token privacy regression passes in 157 ms. Initial sandbox `listen EPERM`
  and the same command's normally approved pass are both retained; assertions
  and runtime permissions were not weakened.

The bounded HTTP/identity/privacy HOLD is closed. The explicitly documented
multi-flip hostile-directory containment limitation remains: this consumer is
for the trusted main process and its app-owned capture folder, not an atomic
sandbox against a concurrent hostile local writer. Expected hash/length still
fence outgoing bytes. Linux filesystem tests are not native Windows evidence.

The callable alone does not start transport or create authority. Web has ONE
existing app integration task `handoff_661e0a4cb6a23819b96b2e1e112673b4` at host
baseline `aebd668`, and the final correction delivery explicitly says it is
continuing that task. Exact host/contracts reading and a later substantive
boundary report are still pending; no app completion is inferred. The next
observable outcome connects explicit isolated development Start, current
control/source state, successive retained frames and editable originals, honest
stored/unknown status and Stop. Support supplies the existing executable/pipe
bridge evidence. Lead reviews the resulting candidate before independent QA.

Separately, Backend actually started the QA-MAC-01 target/dependency correction
as `handoff_3f27e0d186dfa6ea9db2916c3a4e4aaf`, normal merge `daacde7` of published
`0c08415`. Conditional QA retest `handoff_1ef0062c0533e8cd7059b7905874fdd3` waits
for its reviewed exact release; no repeat full campaign is scheduled.

No physical pen, actual-provider receipt/understanding, interactive Mac, audio,
Notability or either full desktop §7.1 gate is passed by this release. Current
user preview and Paperclip remain untouched. Publication and platform build
results are recorded only after their actual operations.
