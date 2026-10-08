# QA-internal read-only reviews of correction r2 — 2026-10-08

These reviews were run by QA. Each reviewer was a separate instance of the same model (Claude Opus 5.5) with a read-only
brief. They give another perspective, not acceptance, and do not replace Support's independent review.

The reviewers had these limits:
- no write to the worktree;
- no PowerShell, `.exe`, Edge, Electron, or Windows process, window or display query;
- nothing created under `/mnt/c`.

They ran Node only, in `/tmp` copies.

## Review 1 — intermediate r2 (workflow `wf_8db240be-627`)

It covered emitted runner `2c27df9b00e5e4b0394dbf0d688f511b43869cd93b10029373f61039ce20c061`, which is not this
package. It used two lenses, closure of R1–R3 and adversarial refutation.

- **Result:** R1–R3 closed in that runner.
- **Must-fix:** that package's `candidate.json` pinned an older generator, so the wrapper would refuse it. Resolved:
  the generator was frozen, and this package was prepared from it.
- **Optional notes**, all applied in this package except `edgeClose`, which is kept as documented in the README:
  - `edgeClose` keeps only the target check;
  - a reload between the page check and the scan, and the order around the full-screen write;
  - an ended Edge waiting for the 20 s target timeout;
  - code -1 where the window was no longer owned;
  - comments, `runner_delta`, an unused constant, and an empty-after-failure replay row.

## Review 2 — this package (workflow `wf_e29f2750-f88`)

It covered emitted runner `301b5053e758938df97059fa52a60715d6ed7d9423a7e44de5e30df681c59dfa`, candidate
`03344f776afb4ff2110e7450b8c48d86fd0b9d7b394e5473e3ccd7959770cde9` and generator
`3070bad0a46c3987eb36fce6ab657852c19a429b746c60b2dd516098c5a6a059`. It used two lenses.

**Emitted PowerShell/C#.** No must-fix and no should-fix. It checked:
- the scoping of the full-screen guard;
- that no recursion arises;
- that `Caption` compiles as C# 5 (by reading; no compiler);
- that every Edge window mutation goes through the page check, `edgeClose` excepted as documented;
- that a healthy run is not refused by the new checks.

It left three notes, all taken into the README:
- **The last instant inside `Caption`.** A window gone after the read returns -1, not -2. The wording is now precise;
  the code is unchanged, and either code refuses.
- **The unreadable-caption assumption.** It also applies at every later lookup. The assumption is widened.
- **The added lookup cost.** It is not measured. Now listed among the limits.

**Evidence and test honesty.** It reproduced:
- the hashes, line references and counts;
- the 28 mutants;
- Support's probe before (exit 0) and after (exit 1 at line 35).

Its findings:
- **must-fix:** the README linked an `artifacts.json` not yet written. It is now written.
- **must-fix:** the README read the probe's after-run as showing R1 fixed. The refusal is an input-format mismatch
  (`target is not known`, the same for an unchanged target), and the probe's line-23 source check still passes on r2.
  The README now says this. Support's R1 fixture was added to the suite in the model's `{target, page}` input: the
  control raises, the changed target is refused.
- **should-fix:** the suite's R1 "before" pattern was also false for r2. It now includes `Assert-QaEdgeSurfacePage`
  and is asserted true for r2 and false for `b9ce4cc`.
- **should-fix:** the cited review covered an intermediate runner. This record now states what each review covered.
- **note:** some earlier independent assertions had been dropped. Restored: the socket and bind throw order, the
  replaced-Edge action case, the over-long caption and the missing-identity line.
- **note:** "zero caption reads" holds for Support's injected sequence, but a Win32 race remains. The claim is now
  qualified in the README.

After review 2, only `test_qa_tts_output_candidate.mjs` and the files in this folder changed. The generator, the
candidate payload and `candidate.json`, the wrapper and its test are byte-identical to what review 2 covered. The
suite (41) and the mutants (28/28) were rerun on the final tests.
