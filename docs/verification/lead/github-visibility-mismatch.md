# GitHub visibility mismatch

Status: resolved by the user's direct confirmation on 2026-09-28 UTC.

Observed on 2026-09-28 UTC, before attempting the next milestone push.

The current runtime project instructions describe an authorized **private** remote:
`https://github.com/Judithandprey/ai-learning-companion.git`.
The actual configured fetch/push origin matches that repository.

Two independent authenticated reads returned:

```text
gh repo view Judithandprey/ai-learning-companion --json nameWithOwner,isPrivate
{"isPrivate":false,"nameWithOwner":"Judithandprey/ai-learning-companion"}

gh api repos/Judithandprey/ai-learning-companion --jq '{full_name: .full_name, private: .private, visibility: .visibility, default_branch: .default_branch}'
{"default_branch":"main","full_name":"Judithandprey/ai-learning-companion","private":false,"visibility":"public"}
```

`git ls-remote origin refs/heads/main` returned
`d951b401b22c13c41da0b6e46797607cef576c83`.
The local main already contains additional backend-toolchain and task-state commits.

No push or visibility mutation was performed during this check. The user was asked
whether to make the repository private before syncing the tested milestone, or to
continue locally without changing GitHub. The observed public state is not treated
as authorization for additional public publication. Do not infer who changed the
visibility or when from this observation.

## Resolution

The user subsequently confirmed: “我自己改成公开的，想开源，没事”. The public
visibility is intentional and this project's publication is authorized. Preserve
the public setting and resume reviewed/tested milestone pushes to `origin/main`.
This confirmation applies to this project, not unrelated repositories or account
settings. The earlier pause and observations above remain as historical evidence.
