# P0-09 audio/screen persistence increment

2026-09-28 UTC. **Design and synthetic transaction schedules only; not implemented.**
All associated AVTEST cases remain `not_run`. No capture, audio/model call,
recording, migration, endpoint or shared contract is introduced.

## Scope and actual reading

Assigned specification/task baseline:
`89602e742aea9c6ef6b6ec6a76c371e20bff2edf` (content `7f43b593`). Read the complete
original-English `docs/requirements/audio-screen-interpretation.md`, including
all four user quotations, AUDIO-01–15 and AVTEST-01–12; R60/A47–49 in the main
original/English specification; D-AUDIO-SCREEN and the intent record; current
AGENTS/TEAM/backend guidance, P0-09 and audio coordination, ADR 0002 §11;
relevant companion evidence/disclosure and V-SourceTimeRelations clauses.
The English policy adopted at `6efa59e338d80e5373aad71c0db4e0774ed11bfb` applies;
all four source and four translation hashes match the current source manifest.
Originals and later user decisions remain authoritative.

This extends the existing [process design](p0-09-process-design.md),
[C1–C4 follow-up](p0-09-consumer-intent-followup.md) and
[ADR review](p0-08-adr-backend-review.md). Their original vectors/evidence remain
unchanged. New [audio schedules](p0-09-audio-screen-vectors.json) cover the assigned
AUDIO-02–04/07–08/13–15 and AVTEST-01/02/05/07/08/11. They support the persistence
portion of A47/A48, not complete live-device or quality-comparison acceptance.
A49/provider comparison remains with its assigned owners. P1-03 live evidence,
P1-04 source recovery and P3-01 cross-source understanding remain the phase homes.

PONYTAIL LITE reuses the authoritative archive, actor transaction lock and C1–C4
invalidation. No separate audio identity store or local wire-format extension.
The worktree starts clean at `9e60468dac27ca2b77dc9202324b51d0230026fc`; the new
specification is read with `git show`, without changing or resetting the branch.

## Current code boundary

`Archive.events` in `services/api/domain.py` validates 0.1.0, deduplicates immutable
events and requires a correction's source/actor to match its predecessor. Frame
references must match source/version/device/session/media position. Those checks
must remain intact. They cannot express changing an uncertain speaker assessment
or linking independent microphone and screen sources.

At the assigned baseline, `services/learning/archive.py` also requires a correction
to have a later `captured_at`; `retrieval.py` excludes every `correction_of` target
from a current query. Mapping a proposed or rejected ASR repair onto that relation
would hide original evidence. Moving capture time to the later correction time
would destroy the utterance's historical screen alignment. These are existing
contract limits, not new runtime failures observed in this design task.

## Relationships to represent in the lead-owned contract

Names below are design vocabulary, not new v0.1.0 fields.

| Retained relation | Required distinctions |
| --- | --- |
| Captured span and source track | Reuse authenticated owner/device/session/source and persisted stream identity. Preserve original capture interval/clock domain, received time and known media position/seek epoch. Microphone, app playback, camera audio, displayed camera pixels and digital screen are distinct source evidence. A track is not a person. |
| Bounded audio evidence | Raw and processed spans reference one another with actual processing provenance, availability/gaps and the authorized buffer policy/deadline. Neither a meter, subtitle nor hash proves actual audio availability. No saved lecture file or permanent audio archive is required. |
| Transcript hypotheses | Preserve exact original-language candidates, alternatives, producer/model revision, ambiguous/missing spans and their evidence. An ASR output is a hypothesis, not guaranteed verbatim speech. Reading/translation views are derivatives, not replacements. |
| Correction decision history | Pin the original hypothesis/span, changed range, proposed replacement, supporting evidence with its actual time, author/provenance, assessment time and causal decision revision. Distinguish contemporaneous context from later clarification; neither is backdated. Proposed, uncertain, rejected and confirmed histories remain distinguishable. A model confidence value cannot claim user confirmation. Reversal appends a decision; it does not rewrite the previous decision or hypothesis. |
| Oral process | Actual later speech, self-correction, negation, abandoned alternatives and reasons are new observed utterances/branches. An ASR repair concerns what was said earlier; a conceptual correction concerns its meaning/truth and is a separate diagnosis. Do not erase a genuine mistake or claim that a later correct statement was said earlier. |
| Speaker/addressee assessment | Version interval-scoped teacher/user/assistant/bystander/unknown attribution and overlap independently of capture producer, track and transcript bytes. A role correction may change dependent reasoning, but does not authenticate a user request or grant help permission. No clean speaker separation is claimed from diarization. |
| Audio-to-screen alignment | Version relations to exact frame/source/ink/crop and time intervals with actual clock mapping and uncertainty. Use media seek/speed epochs, not a single wall-clock ordering. Camera-view provenance and legibility stay explicit. Later screenshots cannot prove what was visible during earlier speech. |

For a current reading view, keep the initial hypothesis retrievable; visibly label
an unconfirmed candidate as such. A proposal/rejection never silently supersedes
the observed transcript. Confirmed corrections select a versioned interpretation
with its actual confirmation basis. Concurrent confirmations compare the decision
head; conflicts preserve both attributed histories as unresolved, not last-arrival
truth. A later causal reversal changes selection without erasing either history.
Confirmation of a word does not confirm speaker identity, emotional state,
reasoning correctness, mastery or permission to answer.

## Transaction, buffer and stop boundaries

Persist originals and decision records with stable identities and atomic batch
ACKs. Changed-content replay conflicts; a new receipt timestamp cannot create a
new utterance. Unresolved relations are not applied or claimed fully preserved.
Under the same actor transaction, change the relevant evidence/interpretation
revision and invalidate current dependent diagnoses, search views, summaries and
cached eligibility; fence in-flight jobs. Include provisional/session scopes for
previously missing role/alignment/correction evidence. Job-first then correction
invalidates the result; correction-first rejects the old job. Duplicate replay
does not advance the evidence revision. These extend C1 rather than bypass it.

Capture, interpretation and response permission remain separate. Quiet teaching
retains authorized professor content and unknown/overlapping turns. Source audio
or a later role label cannot synthesize a current user request. A corrected role
or interpretation rechecks pending eligibility; an already observed partial reply
remains an exposure fact, never a fictitious rollback. All final channels still
use the current help policy, attempt and preference checks.

| Lifecycle action | Durable evidence and allowed future work |
| --- | --- |
| Ordinary return to course | Does not end the session or restart an explicitly stopped source. Continue only existing authorized sources. |
| Stop one source | Fence further live capture/transmission for that source and retain its final pre-stop boundary. Other independently authorized tracks remain separate. Pre-stop historical sync requires still-valid authorization; label late text/frame/role records historical, never newly live or a new request. |
| End session | Stop that session's live sources/response queues. Preserve required source text, key images, oral process and allowed history; do not equate session end with deletion or cancel independently authorized preparation by accident. |
| Withdraw permission | Reject new transmissions/processing prohibited by that grant, including offline envelopes under its old generation. Preserve permitted local history. Later permission is a new scoped generation, not implicit authorization to replay old live actions. |
| Audio buffer expiry | Remove raw/processed temporary bytes and stale access paths at the recorded deadline; neither retry nor late arrival refreshes the window. Preserve required transcript candidates, key images, oral/correction/role/alignment history and explicit audio-unavailable evidence. Do not reconstruct expired sound or infer new prosody from text. |
| Explicit deletion | Purge scoped originals and dependent corrections/interpretations/search/replay content and fence old jobs/backfill. Traverse cross-source dependencies without deleting unrelated originals. Keep only necessary non-content lifecycle markers; mixed inseparable originals remain an honest conflict, as in the existing design. Remote cleanup is pending until evidenced. |

The buffer has a documented finite duration/size and versioned engineering policy,
whose numeric values must be calibrated before real capture; this task chooses
no undocumented default and does not reopen the closed recording question. Capture
time/deadline, not time of upload or processing retry, governs retention. When age
cannot be established safely, do not assume permission for a fresh raw-audio window.
Restart/expiry/revocation checks cover every temporary copy, processing cache and
pending upload. A processing lease cannot extend retention indefinitely.

Expiry of bytes is not retrospective deletion of lawful transcript output. Text
computed while evidence use was allowed may arrive late only if current scope
allows historical persistence and its dependencies have not been deleted; retain
its original time and unavailable-audio limitation. An old result must not reinsert
raw bytes, claim acoustics were rechecked, restore capture or revive help. If required
words were never obtained before expiry, record the actual gap rather than fabricate
recovery or silently keep recording. User deletion/revocation adds its own stronger
fences; it is not equivalent to routine buffer expiry.

## New schedules and future execution

| Local schedule | Behavior-specific check | Existing foundation |
| --- | --- | --- |
| AU01 | Original mixed-language candidate, proposed/rejected/confirmed/reversed correction and stale decision CAS | V12; C1-V12 |
| AU02 | Negation, units, wrong reasoning, later oral correction and abandoned branch survive tidy views | V03/V04/V17 |
| AU03 | Mixed classroom track, interval role correction/overlap, unknown bystander and quiet professor retention | V05/V12; C1-V12 |
| AU04 | Earlier utterance versus later interpretation time, seeks/speed changes, delayed camera/digital frames | V05/V21/V24 |
| AU05 | Finite raw/processed buffer expiry races delayed ASR, read leases and restart | V13/V14 |
| AU06 | Independent source stop versus session end and historical text, without dropped professor content | V14/V23 |
| AU07 | Revocation/deletion versus late corrections, raw upload, cached response and rebuild | V08/V13; C3-V13 |
| AU08 | Out-of-order candidates/decisions, exact replay and mixed-validity atomic batch | V01/V02/V14 |
| AU09 | Camera preview/caption available while audio is absent; headphones do not prove playback capture | V05/V22/V24 |
| AU10 | New role/alignment/correction evidence invalidates committed and in-flight consumers without granting help | C1-V06/V12/V16; C2-V20 |

All ten are deterministic **planned schedules**, using symbolic synthetic inputs,
not recorded samples or executable transaction tests. Future domain tests need the
lead's formal wire baseline and must assert intermediate state, both commit orders,
restart/replay and raw-byte/history preservation. Real PostgreSQL tests must use
independent connections and distinguish transaction outcomes from in-memory checks.
Live AVTEST-05/07/11, actual playback/headphones and acoustic quality remain separate
device/provider evidence; these persistence assertions cannot pass them.

## Verification and remaining dependencies

Static JSON/source/manifest/reference/status checks and Git diff hygiene only;
the command below passed: 10 schedules, 8 assigned AUDIO references, 6 assigned
AVTEST references, both old vector files byte-identical to their pinned commits,
and 8 source/translation hashes matching. `LC_TEST_DATABASE_URL` is absent; its
value was not printed. No product suite or previous 25/65-case suite was run.
The old vector/evidence files and production/contracts paths remain unchanged.
An independent read-only review checked the lifecycle and correction boundaries.
It found and this delivery corrected an unreachable deletion race after prior
revocation (now independent variants), overly narrow contemporaneous-only
correction evidence, and an undefined utterance label. These were design defects,
not observed product failures.

Next dependency is the lead-owned versioned span/decision/role/alignment and
permission/ACK contract, followed by Backend's additive migration and transaction
implementation. Real PostgreSQL remains untested without a test DSN. Actual iPad
tracks, native audio, live diarization, screen input, quality, provider availability,
costs and G3/G4 remain unverified. Nothing here closes R59/A44/A46 or Notability
import. No new product question, provider choice, paid action or account change
is needed to complete this design increment.

Reproducible static command (run from the backend worktree; before commit):

```bash
python3 - <<'PY'
import hashlib
import json
import os
from pathlib import Path
import subprocess
root=Path('docs/verification/backend')
packet=json.loads((root/'p0-09-audio-screen-vectors.json').read_text())
rev=packet['specification_sha']
def obj(commit,path):
    return subprocess.check_output(['git','show',f'{commit}:{path}'])
base=packet['base_vectors']; consumer=packet['consumer_extensions']
for entry in (base,consumer):
    assert Path(entry['path']).read_bytes()==obj(entry['commit'],entry['path'])
base_ids={v['id'] for v in json.loads(Path(base['path']).read_text())['vectors']}
consumer_ids={v['id'] for v in json.loads(Path(consumer['path']).read_text())['consumer_extensions']}
rows=packet['vectors']
assert len(rows)==10 and len({v['id'] for v in rows})==10
assert {a for v in rows for a in v['audio']}==set(packet['assigned_audio'])
assert {a for v in rows for a in v['acceptance']}==set(packet['assigned_acceptance'])
source=obj(rev,packet['original_english_source']).decode()
for value in packet['assigned_audio']+packet['assigned_acceptance']:
    assert value in source
for v in rows:
    assert v['execution_status']=='not_run'
    assert v['preconditions'] and v['expected'] and v['schedule']
    assert [s['ordinal'] for s in v['schedule']]==list(range(1,len(v['schedule'])+1))
    assert set(v['base_vectors'])<=base_ids
    assert set(v['consumer_extensions'])<=consumer_ids
manifest=json.loads(obj(rev,'docs/requirements/english-translation-manifest.json'))
for entry in manifest['files']:
    for prefix in ('source','translation'):
        assert hashlib.sha256(obj(rev,entry[prefix+'_path'])).hexdigest()==entry[prefix+'_sha256']
allowed={str(root/'p0-09-audio-screen-design.md'),str(root/'p0-09-audio-screen-vectors.json')}
changed=set(subprocess.check_output(['git','diff','--name-only',packet['working_tree_start']],text=True).splitlines())
changed.update(subprocess.check_output(['git','ls-files','--others','--exclude-standard'],text=True).splitlines())
assert changed==allowed,changed
print(json.dumps({'static_check':'passed','vectors':len(rows),'audio_requirements':len(packet['assigned_audio']),'acceptance_references':len(packet['assigned_acceptance']),'old_vector_files_byte_unchanged':2,'source_and_translation_hashes_matched':2*len(manifest['files']),'executed_transactions':0,'product_tests_run':0,'test_dsn_present':bool(os.environ.get('LC_TEST_DATABASE_URL'))}))
PY
git diff --check
git status --short
```

These commands validate the design artifacts only, not the transaction behavior
described in them. All `vectors[*].execution_status` values stay `not_run`.
