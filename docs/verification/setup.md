# Setup verification

Status: **VERIFIED** at 2026-09-28T06:24:22+00:00. This verifies the development team, not the application.

| Check | Observed result |
| --- | --- |
| Repository and requirements | `/home/agentsdock/Projects/learning-companion/repo`; original requirements copied byte for byte, SHA-256 `c764160cde78c74d7dd76a950d593ecab45b390c7d9991b4db8ed5ad7f5dc9e4` |
| Six worktrees and role sessions | `docs/team-directory.json` matches actual configured sessions, branches, models, and working directories |
| Bootstrap | All six agents used tools to read their role rules, check cwd/branch, and list granted routes; all returned READY |
| Models | Three sessions call configured `gpt-6-astra`; three Claude runtime context snapshots report `claude-opus-5-5` |
| Persistent collaboration | Five bidirectional lead/worker connections, ten routes; all peers available |
| Legacy exchange | Lead → web → lead returned `TEAM_HANDOFF_OK`, exchange completed, both legs delivered. The lead initially omitted wait arguments, then corrected them and read the reply. |
| Desktop async path | Request and linked `ASYNC_TEAM_OK` reply were both read; automatic lead mailbox wake returned `ASYNC_ROUNDTRIP_OK` |
| Git delivery | Backend/Astra and QA/Opus each committed one assigned setup evidence file. Codex's first Git write hit protected metadata; its native on-request approval retry succeeded without changing sandbox settings. |
| Existing sessions | All 5 pre-existing session IDs and compared settings preserved |
| Credentials | Only project requirements, instructions, metadata, and evidence copied; no credential files or server token stored in the repository |

Exact nonsecret run/message/commit IDs are in `setup-evidence.json`.

Initial concurrency of three tasks is a team instruction, not a server-enforced quota. Git worktrees separate edits; they are not independent security sandboxes. Workers use their own branches and only the lead integrates into main.

Available devices: Windows, iPad, iPhone. No Mac/Xcode build, iPad installation, Pencil, Safari device behavior, audio, or native lifecycle has been validated here. Application implementation has not started. No purchases or product API calls were made by this setup.

## Subsequent support registration

The original six-role setup evidence above remains historical. The authorized
seventh on-demand support role, updated descriptive effort metadata and actual
native connectivity are recorded in [support registration](lead/support-registration.md).
This adds no product/device acceptance and does not repeat the initial smoke tasks.
