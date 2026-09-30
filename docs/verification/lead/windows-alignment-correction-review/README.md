# Windows alignment correction — historical cap residual

Current disposition: the [separate cap correction](../windows-cap-correction/README.md)
is source-approved and integrated as c753c23. Historical failures below remain
unchanged; independent native QA-WIN-01 is still open.

Exact owner **e03fefcc9d68676f172993ac18545091d3c8c4f3**, delivered as
**handoff_6e023e769030b65726fe92cf092adb87**, follows preserved80da708/85de89e.
The author explicitly released Windows at14:31:45 UTC. No new independent native
run has been made. Reviewed mapper/alignment repairs now integrate through bf25413;
the inherited cap-count defect below remains open and assigned, not accepted.

The [bounded independent source review](independent-review.md) confirms the old pointer-exemption defect
is corrected: a sign/digit change and two separate changed regions are retained
as a new writing context, drawn dashed and excluded from VERIFIED composition.
Nine deterministic source-path cases preserve positive/legacy controls. Moving
pointer pixels are now conservatively changed; pixels alone do not identify a
pointer. The original [negative evidence](../windows-alignment-review/README.md)
remains intact. This is source/synthetic correction evidence, not independent
closure of the full native QA-WIN-01 gate.

## One inherited P2 saved-evidence residual

After eight retained writing contexts, the next frame is compared with the last
**retained** frame, rather than the previously observed frame. The saved
`changes_not_kept` field promises material changes, not repeated frames that differ
from one old context. Through actual overlay/main save and strict reread:

| Local sequence after retained140 | Actual local transitions | Persisted count |
| --- | ---: | ---: |
| 140 →160 →160 | 1 | 2 |
| 140 →160 →140 | 2 | 1 |

Every frame also changes outside the stroke, so a global frame deduplication
shortcut cannot explain away the repeated local pixels. Stop settles the open
stroke; eleven points, one history entry and eight contexts remain saved, with
successful Stop acknowledgement. The defect is the persisted process count, not
loss of editable stroke points. See [probe](cap-save-probe.mjs),
[actual output](cap-save-results.txt) and both saved JSON originals.

Next owner: Web, one bounded residual correction **after its current mapper
checkpoint**. Preserve the cap, all pinned originals/history and Stop behavior;
count real observed local transitions, including a return, without inventing
missing chronology or growing the retained context set. Keep this separate from
already fixed sign/digit alignment. Focused counter/control checks suffice; no
new native campaign is requested. Lead then combines approved commits and releases
one exact candidate for independent Windows behavior retest after current API QA.

## Fixture preservation and limits

Lead compared e03fefc's relocated historical native mapper fixture to80da708:
request body, manifest and seven distinct PNGs are byte-identical. Only fixture
location and explanatory note changed. The placeholder editable-ink binding still
has no supplied original and cannot prove native HTTP acceptance. New self-test
screenshots are author evidence; author76 portable/45 native counts are not
independent passes. Synthetic canvas/PNG stand-ins in these probes prove source
behavior and metadata, not actual graphics, hardware pen, provider, audio,
Notability or either complete desktop product gate. No service, preview DB,
Paperclip, account or runtime setting was touched.

The evidence commit **aec50d27d848b705e55e21663b1099dfc7131c02** was pushed.
Native dispatch **handoff_972d055de5d958c7eb6b249fc2de9e06** accepted this as
Web's one **next** action after its current mapper checkpoint; receipt was unread
and does not prove the counter correction has started. Current mapper start is
already evidenced separately. No duplicate task or display campaign was sent.
