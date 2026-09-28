# QA design review: ADR 0002 (P0-08 candidate)

Subject: `119108569377edccb606d148436c6962cb418ea6`. Files:
- `docs/adr/0002-process-evidence-and-presentation.md` (status: proposed);
- `docs/adr/p0-08-consumer-review-inputs.md`;
- `docs/verification/lead/p0-08-design-review.md`.

Normative baseline: `9ce270c`. This is a single bounded design review. No schema,
protocol or client exists yet, so **nothing here is a run or a PASS**. QA's earlier
65-case, 32-row and INTENT reviews are reused, not repeated.

The ADR already closes most gaps QA reported:
- fail-open vocabularies (§2, unknown kinds never fall back);
- self-declared actors (§3, producer authority from the authenticated server);
- tag-only disclosure (§3, "a `hint` enum does not prove content is a hint");
- p06 premise versus target (§6);
- the p29 label-versus-utterance conflict (§6, minimum clarification or a narrower
  result);
- receipt separation (§7);
- missing-frame honesty (§1, QA-09);
- causal refusal handling (§8).

Three short counterexample traces show where it still leaves an acceptance gap.

## T1. The export carries AI help that no presenter checked, and the import receipt hides the exposure

Trace:
1. Q1/A1: the learner finishes a wrong answer and chooses layout-only organization.
2. The organized artifact X5 contains AI layer L2 with the corrected answer. The
   preview hides L2, as §8 requires.
3. Dispatch rechecks "choice/source/version/purpose and target permission" (§8) and
   sends X5 to Notability. The import is observed (§7).
4. Q1/A2 is a retry with no in-app presentation receipts.

- **Clauses:**
  - §6 lists the channels the final presenter checks: card, title, notification,
    diagram, organized preview, queued audio. Export/share dispatch is not one of
    them.
  - §8's dispatch recheck covers destination permission, not disclosure.
  - §7: "importing an artifact does not prove the learner read it."
- **Gap:** §3/§8 bind confirmation to the exact manifest, but they do not require
  that each AI layer in the manifest passed the current disclosure check, or that
  the learner confirmed that layer. So an answer-bearing AI layer can leave the
  product under layout-only consent without a disclosure check. After import, nothing records any exposure, so
  A2 can look unassisted. This conflicts with:
  - the disclosure rule of the process spec §3 ("卡片标题、通知预览、AI 补图、复盘摘要…一致的披露规则");
  - the decision record ("AI 建议／修改…可预览；改变用户解答内容须可确认");
  - A37.
- **Expected:**
  - Every AI layer included in an export passes the same current disclosure check
    as a presentation, and was actually previewed and confirmed against the pinned
    manifest.
  - An observed or unknown import or share of help-bearing content records
    **external exposure = unknown** for that problem. Later same-problem work
    cannot default to unaided.
- **Revision:** add export/share to the §6 channel list and to the §8 dispatch
  preconditions. In §3/§7, map destination outcomes of help-bearing artifacts to
  unknown exposure in LearningEvidence.

## T2. A legacy AI write plus a legacy read of a linked note bypasses current permission

Trace:
1. Note N is linked to active problem Q1. The learner has said "let me try"
   (explore).
2. A 0.1.0 client or service writes `PUT /v1/notes/N` with the assistant actor. It
   keeps the user originals and ink unchanged and adds an `ai_supplement` block
   containing the full solution. CAS passes.
3. An old client then calls `GET /v1/notes/N` and shows the note.

- **Clauses:** §2 allows "a valid old note edit … with its original CAS/ink
  protection and atomic invalidation of affected v2 work", and says legacy entry
  points must enforce *resource associations*.
- **Current call flow at this commit:**
  - `services/api/domain.py:366-386` protects only user-original blocks, ink, kind
    and context against assistant writes. An added AI block is a valid edit.
  - `get_note` (`:388-398`) returns every block of the revision.
  - This is correct for v1 alone. With v2 present, it lets content that no v2
    presenter checked reach a client that cannot enforce policy.
- **Gap:** §2 constrains legacy *writes* and client capability. It does not
  constrain legacy *reads* of disclosure-restricted layers, or legacy AI-authored
  additions to linked notes. "Client UI/version negotiation alone is not the
  security boundary" is stated, but not applied to this path.
- **Expected:** for a note linked to a v2 problem:
  - legacy AI-authored layer writes are rejected as unsupported, or stored as
    non-presentable until assessed under current permission;
  - legacy reads return the user originals and ink, but withhold or redact AI
    layers whose current disclosure permission is not established. A reason code
    tells the client to use the v2 path.

  User edits through v1 keep CAS, keep the retained revision history, and invalidate
  pinned previews and confirmations (already in §8).
- **Revision:** add a legacy-read rule and a legacy AI-layer rule to §2. Put both on
  the §10 migration test list ("old API … on the upgraded server").

## T3. Presentation after a retraction whose order is unknown across devices

Trace:
1. The iPad is the active presenter for Q1 and holds a claim for hint H under policy
   revision r5.
2. On the iPhone, which is offline, the learner says "actually, let me try". The
   utterance is queued locally.
3. The iPad presents H, including queued audio.
4. The iPhone reconnects. The retraction arrives with no causal link to the
   presentation, because they are different streams (§3).

- **Clauses:**
  - §6: cancel on new remote intent; "client disconnection or uncertain authority
    cannot permit higher disclosure"; revocation can race with a started display.
  - §3: cross-stream order is unknown without causal references.
  - Process spec §3: "用户在另一设备更改帮助程度时，要同步到同一题目会话；暂时失联则不能基于过时许可主动播出答案".
- **Gap:** the ADR ties staleness to the *presenter's* connectivity. Here the
  presenter is connected, and the stale party is a disconnected same-problem device
  that accepts intent input. The exposure record pins content and policy revision,
  but not whether the presentation may have followed a not-yet-synced retraction.
  QA therefore cannot classify it for the zero-premature-disclosure target.
- **Expected:**
  - The presentation fact records the server-known intent revision and whether any
    same-problem intent-capable device was known unsynced at claim time.
  - A retraction whose order is unknown takes effect on arrival for all remaining
    segments and presenters, which is covered. Its relation to the earlier
    presentation stays "unknown order", never "compliant".
  - QA counts such cases in a separate race denominator, alongside the
    zero-disclosure count, not inside it.
- **Recommendation (engineering, to be measured):** while an intent-capable
  same-problem device is known unsynced, do not *proactively* escalate disclosure.
  Explicit, fresh requests on the presenter still proceed.
- **The inverse case is already covered.** A late help request arriving after a
  retraction cannot widen permission (§3 "unknown/conflicting intent cannot authorize
  a larger answer"; §4 replay).

## Coverage check against A30–A46, the INTENT cases and QA findings

| Item | ADR status | QA note |
| --- | --- | --- |
| A30/A31/A42/A43 | §3, §4, §9 row 1 | Covered in design. **Missing:** an explicit rule that no v2 command lets AI select, fill or submit on a website. §8 only denies bCourses submission, while R51/A42 ("不推定 AI 获准代填或提交") and the surfaces review (AI answer actions ignored in traces) need it. An AI-attributed site input should be a violation fact, not a record kind. |
| A32–A34 | §6, §9 | See T1 and T3. |
| A35/A36/A38 | §3, §5, §6 | Covered. |
| A37 | §3, §5, §9 | See T1: external exposure must not read as none. |
| A39/A40, A41 | §9 | Covered as unexecuted plans. |
| A44/A45 | §7, §9 | Behavior-based eligibility with separate platforms, and no fallback counts. Good. |
| A46/A26–A28 | §7, §9 | Covered. T1 adds the disclosure check on the exported AI layer. |
| INTENT-INK-MODES | §3 InkContext, §9 A44/A45 row | Covered in substance; §9 has no row of its own. |
| INTENT-ANSWER-PROMPT / HOMEWORK-CHOICE | §8, §9 | Covered. §8 says only "a causally later reopening supersedes"; it should also state that an **unknown** order between a refusal and a reopening keeps the refusal, as the consumer inputs already do. |
| INTENT-NOTE-CLASSIFICATION / FAITHFUL-EXPORT | §8, §9 | Covered, apart from T1. |
| QA-10 CapabilityResult | §1 (cannot express new behavior) | The replacement capability record should forbid pass states that contradict their own checks or evidence. |
| Cross-revision note guard (P0-06A, untested high risk) | §2 "original CAS/ink protection" | v1 protects originals only against the assistant actor. User-actor edits are legitimate, and history is retained. Keep a transaction test that pins InkContext to the note revision (see T2). |

## Decision

- **No blocking contradiction with the confirmed intent.**
- **Three design gaps to close before the 0.2.0 schema baseline:**
  - T1: export is an unchecked disclosure channel, and external exposure is not
    recorded;
  - T2: legacy read and AI-write bypass on linked notes;
  - T3: the ordering status of presentations relative to unsynced intent.
- **Two wording additions:** an explicit ban on AI website input, and unknown
  refusal/reopen order kept restrictive.
- Owners: lead (ADR and contract), backend (legacy adapter, receipts, transactions),
  web/iOS (final presentation and export), learning (exposure evidence).
- Status: unverified.
  - The ADR is proposed only.
  - QA executed 0 protocol, concurrency, client, provider or device checks.
  - The v1 behavior cited in T2 comes from reading the code at `1191085`, not from a
    new test.
