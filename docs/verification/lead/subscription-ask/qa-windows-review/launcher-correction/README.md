# Launcher cleanup correction — source review HOLD

QA delivered code `85d79e629068da017604386bcbf41a444e9c3149` and report
`a926e91a2f4dcc883e3061fdd9730099619e2557` through
`handoff_79bca0d3984b2239ef4f0e17031851eb`. Neither leaf is integrated into main.
The new private check directory usefully separates the user's entry/profile;
the held-image and budget wording is consistent with Lead's decisions. The
process identity boundary still requires one narrow correction before reuse.
[Independent review](independent-review.md) retains exact source locations.

Three [pure exact-source observations](identity-probe.json), with the
[archived probe](identity-probe.mjs), reproduce:

1. The cleanup snapshots numeric PIDs, then sends a PID-only termination request.
   Reuse between observation and action can target an unrelated replacement.
2. A previously owned process with unreadable command line and no listener is
   reclassified as foreign, allowing `exit:confirmed` and folder deletion despite
   that process remaining alive.
3. The current substring predicate for `--qa-check-port=43000` also admits an
   unrelated executable/script with `--qa-check-port=430009`.

The probe never launches, inspects or terminates a Windows process. Its `/tmp`
source export is the exact delivered candidate; its recorded observations are
source/helper simulations, not evidence of actual damage or a GUI run.

Lead executed the exact pure helper tests in a temporary export. Initial default
Node isolation reported only one file-level result; that is retained in
[initial-test-run.txt](initial-test-run.txt), not represented as21 cases. With
`--test-isolation=none`, all **21 named cases passed** in25.26ms:
[actual output](focused-tests.txt). Those tests inject ownership classification
and do not cover the three failing identity transitions above. Scoped diffs pass
`git diff --check`.

The [actual correction receipt](receipt.json) is accepted, initially unread;
acceptance does not establish execution. QA owns the same bounded task: bind
the precise launched process identity; preserve previously observed identity as
unknown when it cannot be revalidated; never terminate a stale PID or delete a
folder while identity/exit is uncertain. If safe termination cannot be established,
retain state and report not released. No new framework, service or full campaign.

No user's entry, profile, auth state, Windows display, provider or image allocation
was changed. The prepared user login entry and historical successful check remain
valid within their recorded scope. The automated checker stays on hold. Windows
product correction and user login still gate the first actual image turn; this
harness finding does not reopen already-passed product evidence.
