# Windows context-picture correction integration

Actual delivery bb6761109cbca86c65e7b3f2e68deb95cab8b1d8 arrived in handoff_07fd98253e831656d6b6d23721e8670a. Lead reviewed its three-file delta, all four checker callers and owner recovery question. Independent read-only review approves; integration is96dae0d. Existing exceptions remain untouched, while good held pictures and editable strokes/history remain available for Export/Retry. Keeping an unexpected file in place is the assigned bounded engineering choice; automatic quarantine is not required or newly assigned.

[Independent review](review.md):30 named tests and three actual-filesystem probe groups pass, and the same probe fails on e7bdbde at the old false-save-success. No new overwrite or silent loss path was found. This uses a fake Electron boundary and real Linux files, not native desktop input. The inherited external-writer check/rename race remains a stated limit.

On integrated main, [106 named tests](main-named-tests.txt) pass in4087.68ms and [TypeScript/static build](main-build.txt) passes. The initial default Node subprocess run printed only11 file processes; it is preserved as [initial output](main-file-process-tests.txt) and is not counted as106 named checks. The explicit --test-isolation=none run records all106 cases. No dependencies installed or services/display started.

The prior independent44-pass native alignment run tested55478f0, not this later code. Next QA targets actual frame-bound originals and this recovery/reopen change on the published candidate, with isolated test-only data and no repeat alignment campaign. Existing user preview/database and Paperclip remain untouched. Real provider, physical pen, Mac, both core gates and Notability stay separately unverified.
