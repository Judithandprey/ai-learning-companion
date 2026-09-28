# English working language and faithful translation

The user authorized this development-team preference on 2026-09-28 UTC:

> but, you can translate what I said in to english. if that will help agents work, please do that.

Use English for technical task instructions, design discussions, implementation notes,
and substantive agent handoffs where it helps precision. The user may continue to
explain requirements in Chinese, English, or a mixture. Do not make the user translate
their own requests. This is a working-language preference, not evidence of measured
quality improvement or token savings and not a change to the product requirements.

## Reading and authority

The complete English working translations are:

| Source specification | English working translation |
| --- | --- |
| [Main specification](../requirements.md) | [Main specification in English](../requirements.en.md) |
| [Problem-solving companion](problem-solving-companion.md) | [Problem-solving companion in English](problem-solving-companion.en.md) |
| [Intent and confirmed decisions](intent-and-decisions.md) | [Intent and confirmed decisions in English](intent-and-decisions.en.md) |
| [Original-goal verification](original-goal-verification.md) | [Original-goal verification in English](original-goal-verification.en.md) |

The [audio/screen interpretation addendum](audio-screen-interpretation.md), R60/A47–A49, is an original English user-source document, not a fifth translation. Read it alongside the relevant original clauses and four working translations. It preserves four exact quotes and closes the obsolete recording-choice question: required live listening is distinct from permanent recording. All twelve AVTEST cases remain not_run.

The translations accompany the source specifications. Read the relevant English
clauses for implementation, and check their source clauses and latest explicit user
decisions before changing scope, designing acceptance, or resolving ambiguity. Keep
the original-language specifications and actual user statements intact. The latest
explicit user decision governs its scope; unaffected prior requirements remain valid.
If an English translation conflicts with the applicable source, correct the translation.
Do not silently change the source to match a convenient English interpretation.

The source revision and hashes are recorded in `english-translation-manifest.json`.
Check that the relevant source has not changed since that translation. A newer overall
repository commit alone does not make a translation stale; compare the source content.
When it has changed, read the changed source immediately and update the corresponding
English clauses before relying on the older translation. Preserve historical provenance
and distinguish pending translation from changed product scope.

## Future requests and task handoffs

1. Preserve the user's actual words or a stable reference to them. Translate the complete
   relevant meaning into English before assigning technical work; translate only the
   relevant new or changed material, without repeatedly retranslating the whole project.
2. Keep the existing requirement and acceptance identifiers, technical terms, API names,
   code, error messages, units, currencies, limits, dates, and evidence references. Retain
   obligations, permissions, conditions, exceptions, uncertainty, and negative cases.
   Label translated quotations as translations; never present an edited paraphrase as
   a verbatim user quotation.
3. Check the scenario, operation location, input, automation, retained originals,
   destination, completion evidence, platform, fallback, and phase. A shorter English
   task card may reference the full clauses; it must not replace them or narrow them.
   Counts of requirement IDs alone do not prove a faithful translation.
4. Preserve product intent separately from engineering defaults, capability findings,
   implementation status, and external-action authorization. Translate uncertainty as
   uncertainty. If a real semantic ambiguity cannot be resolved from the original and
   confirmed decisions, ask one focused question and continue independent authorized
   work. Do not reopen already answered questions merely because wording is translated.
5. The lead maintains both versions of affected specification clauses and the source
   manifest in the same scoped change, along with affected traceability, task, and
   acceptance references. Workers report suspected translation gaps to the lead and
   preserve their own assigned scope. Do not duplicate the full specification in every
   role prompt or automatically send two full language copies in every handoff.

## Fidelity checkpoints for this project

- Writing on the original shared live learning screen is distinct from an app-owned
  canvas, a frozen capture, or a side-by-side draft. A fallback retains its own status.
- Content-anchored and screen-fixed ink are both required. Display mode, content purpose,
  and archive destination are independent; do not infer one from another.
- Context distinguishes learning notes, scratch work, and final answers. Learning notes
  enter the Notability flow; scratch work remains in the process archive. On completion
  of a screen answer, promptly offer the user actual available organization destinations.
  Preserve the complete applicable confirmation, correction, and non-submission rules.
- Preserve the observable exploration process and original evidence. Unknown motives,
  missing observations, and uncertain capability remain unknown. Help-disclosure limits
  apply across presentation channels without disabling unrelated authorized teaching.
- Retain R01-R60, A01-A49, G1-G7, phase exits, all V-* cases and INTENT-* cases. Keep
  measurements and negative cases. Translation neither implements nor verifies them.
- Development-agent Astra `ultra` / Claude `ultracode` preferences are separate from
  product model routing and the product's RMB API budget. Subscription purchases do
  not revise that product budget. Keep current models, permissions, ownership and tasks.

User-facing project updates can follow the user's current language. Product course
explanations and study materials continue to follow R57: English-first with original
technical terms and brief Chinese hints where useful. This working-language policy
does not translate away original user records, lecture sources, or handwriting.
