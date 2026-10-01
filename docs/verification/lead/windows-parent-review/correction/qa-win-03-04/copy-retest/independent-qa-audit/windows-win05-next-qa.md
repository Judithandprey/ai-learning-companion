# P0-13 / QA-WIN-05 — one changed-path actual Windows check

Owner: existing QA; author remains Web. Exact candidate SHA is supplied after
ordinary main publication. Windows source equals owner `d295a51` (code `44fbd50`),
with tested integration `22d4e26`. Read current workflow and affected complete
source/English §7.1/7.2, R03/R07/R35/R36/R51/R52 and A12/A14/A27/A31.
Write only `tests/e2e/windows` and `docs/verification/qa` in the existing QA tree.

Use the existing native Windows app/host harness and a fresh bounded QA actor.
First verify current shared-display occupancy; prior release is not permission
to close unrelated apps. Stage exact reviewed main, record source/build hashes,
and use only proven own processes and authorized `lc_p0_test` resources. Do not
touch `lc_desktop_preview`, preview ports 4173/8174, Paperclip or private user data.
Preserve the existing private-DSN/database-name/actor guards; no migrations,
cluster/service restarts, new accounts/providers or credential publication.

1. Establish confirmed retained records. Pause only the proven QA-owned host or
   transport while keeping its pending request open, using the existing bounded
   harness. Observe the next send **before its timeout**: header and line state
   waiting/unconfirmed promptly; earlier confirmed counts do not increase or
   turn into an affirmative current-storage claim.
2. Resume that own host. Actual ACK increases the appropriate confirmed count;
   retain timing/status evidence. This must exercise actual application delivery,
   not manually assign a UI status or count a mock response as backend acceptance.
3. If the existing setup permits, Stop during one pending send and verify truthful
   unconfirmed outcome/no-live claim. Reuse only the changed path; do not expand
   into all Stop/quit recovery cases. Unexercised behavior stays not_run.
4. Keep no-AI labeling explicit. No need to wait another 182 seconds to reproduce
   the old timeout, refill disks, or repeat original pixel/ink/database campaigns.

Use minimal versioned assertions for this candidate; leave the historical
86d2405 analyzer/input artifacts unchanged. No new general harness or additional
mutation campaign. Source ENOSPC notification is already covered by independent
probes and focused main tests; physical disk-fault reproduction is not assigned.
Capture concise sanitized evidence of actual actions, outcomes and limitations;
keep raw screen/credentials private. Release own processes/display, with concrete
cleanup evidence, then deliver exact commit and results once. Lead reviews and
integrates; only concrete production defects return to Web. Physical pen, real
provider, macOS and full feature gates remain separate.
