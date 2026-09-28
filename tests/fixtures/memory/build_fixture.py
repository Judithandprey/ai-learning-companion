"""Compile project-authored synthetic scenarios into immutable contract fixtures.

Query texts and relevance judgments are authored separately in evaluation_spec.py.
This compiler does not import the retriever or read its results.
"""

from datetime import datetime, timedelta, timezone
from hashlib import sha256
from html import escape
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent

# scene | project | teacher | user | assistant
SCENES = """
01|robotics|Two coordinate axes describe one vector. The violet chalk mark labels the body frame.|I confuse left and right multiplication when moving between the two coordinate systems.|Write the frame labels on both sides of the transform before multiplying.
02|algebra|A change of basis changes coordinates, not the underlying vector.|I think changing the basis rotates the physical arrow.|Keep the arrow fixed and compare its coordinate columns.
03|probability|In Bayes' rule the denominator normalizes the posterior. The jar contains seven amber beads.|I forgot why the evidence probability is in the denominator.|Sum the posterior probabilities across the mutually exclusive hypotheses.
04|circuits|The calibration handout version one uses a 220 ohm resistor in the bridge.|I wrote 220 ohms beside the original bridge diagram.|Preserve the handout version when citing the resistor value.
05|calculus|The derivative is a local rate. A tangent touches the blue curve at the marked point.|I read the slope as the height of the blue curve.|Compare the tangent's rise and run near that point.
06|statistics|Standard deviation has the original measurement units; variance has squared units.|I reported variance in meters instead of square meters.|Track the units through the squared deviations.
07|programming|A stack removes the newest item first. The red tray is on top.|I mixed up stack and queue order in the tray example.|Trace push then pop using three labeled trays.
08|robotics|A Jacobian maps joint velocities to end-effector velocity near a configuration.|I asked whether a singular arm can move in every direction.|At singularity the columns lose independence and some local motions disappear.
09|algebra|An eigenvector keeps its direction under the matrix, up to a scale factor.|I thought every vector keeps its direction under the shear.|Apply the matrix to two candidate directions and compare.
10|probability|The two coin tosses are independent in this stated model.|I said the second toss must compensate for the first.|Independence leaves the second toss probability unchanged.
11|circuits|Kirchhoff's current law balances signed currents at the junction.|I added both outgoing currents as positive inflows.|Choose one sign convention and keep it for every branch.
12|calculus|Integration by parts follows from the product rule. The board pairs u with dv.|I swapped u and du while copying the product-rule derivation.|Differentiate the chosen u explicitly before integrating dv.
13|statistics|A confidence interval procedure has a repeated-sampling coverage interpretation.|I described the fixed parameter as randomly moving into the interval.|Simulate repeated samples and count which intervals cover the fixed parameter.
14|programming|Binary search requires a sorted sequence. The midpoint card shows 37.|I searched an unsorted list using the midpoint rule.|Check the ordering precondition before discarding half the sequence.
15|robotics|The wheel encoder counts ticks; its observed offset was minus three ticks.|I recorded the rare minus-three encoder offset on the first practice day.|Keep the calibration observation separate from later planned exercises.
16|algebra|The null space consists of vectors mapped to zero.|I called the null space the set of output vectors.|Check the domain of the vectors before applying the matrix.
17|probability|The lesson's green tree marks conditional branches, not equally likely outcomes.|I counted the green leaves without multiplying branch probabilities.|Compute each path probability before summing disjoint outcomes.
18|circuits|Capacitor voltage cannot jump in the ideal finite-current model.|I expected an instantaneous voltage jump when the switch closed.|Relate current to the time derivative of capacitor voltage.
19|calculus|The alternating-series remainder is bounded by the next omitted term under its assumptions.|I used the whole partial sum as the error bound.|Check decreasing term magnitudes and identify the first omitted term.
20|statistics|The regression residual is observed minus fitted response.|I drew residuals horizontally instead of vertically.|For this ordinary least-squares model, compare response values at a fixed input.
21|programming|A shallow copy shares nested mutable objects with its original.|I said changing the nested list could not affect the original.|Draw references for the outer list and the nested list separately.
22|robotics|The planner samples a narrow passage between two rectangular obstacles.|I remember the tiny corridor but the captured frame is missing.|The transcript mentions a narrow passage; no image was captured for it.
23|algebra|Only the slide title, Orthogonal projection, was captured; the lecture audio is unavailable.|I asked about the projection shadow after the audio stopped.|The missing audio cannot establish what the teacher said next.
24|probability|The likelihood compares parameter values for fixed observed data.|I mistook likelihood for a normalized probability distribution over parameters.|Keep the observed data fixed while changing the parameter argument.
25|circuits|The calibration handout version two replaces the bridge resistor with 330 ohms.|I updated my bridge annotation to 330 ohms in the revised handout.|An old note must still cite version one rather than silently rebinding.
26|calculus|The chain rule multiplies the outer derivative by the inner derivative.|I forgot the inner derivative for the nested sine example.|Draw the composition as two linked functions and differentiate each link.
27|statistics|A scheduled review of covariance is a plan, not evidence of understanding.|I put covariance review on Friday's calendar but have not studied it.|Record scheduled study separately from demonstrated application.
28|programming|Watching the recursion demonstration records exposure to the example.|I watched the recursive call animation twice without attempting the exercise.|Repeated exposure alone does not demonstrate independent application.
29|robotics|Explaining the transform in one's own words is a self-report until checked by a task.|I feel I understand homogeneous transforms now.|Invite an optional new transform problem; do not mark mastery from this statement alone.
30|algebra|The learner independently solved a new two-by-two basis conversion and checked the result.|I converted the unseen vector without hints and verified it in the original basis.|Retain this demonstrated application as evidence, separate from mere exposure.
""".strip()

CORRECTIONS = {
    "02": "Correction: the physical arrow stays fixed when I change basis; only its coordinates change.",
    "06": "Correction: my variance result has square meters as units, not meters.",
    "10": "Correction: the next independent coin toss does not compensate for a previous result.",
    "16": "Correction: the null space contains input vectors mapped to zero, not output vectors.",
    "21": "Correction: a shallow copy shares its nested list, so changing it can affect the original.",
}


def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def build(root=ROOT):
    sources, frames, observations = [], [], []
    files, artifacts, source_texts = {}, {}, {}
    sequence = 0

    def write(name, data):
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        files[name] = sha256(data).hexdigest()

    def episode(scene, project, teacher, user, assistant, *, prefix="e", days=0, missing=None):
        nonlocal sequence
        source_id = f"{prefix}-source-{('04' if scene == '25' else scene)}"
        version = 2 if scene == "25" else 1
        now = datetime(2025, 1, 1, tzinfo=timezone.utc) + timedelta(days=int(scene) + days)
        stamp = now.isoformat().replace("+00:00", "Z")
        event_root = f"{prefix}-{scene}"
        frame_id = None if missing == "missing_frame" else f"{event_root}-frame"
        base = {"user_id": "synthetic-learner", "source_id": source_id, "source_version": version}
        text_path = f"originals/{source_id}-v{version}.txt"
        write(text_path, teacher.encode())
        source_texts[f"synthetic-learner/{source_id}/{version}"] = text_path
        sources.append({**base, "project_id": project, "type": "synthetic",
                        "original_url": f"https://example.invalid/{project}/lesson?id={source_id}",
                        "canonical_url": f"https://example.invalid/{project}/lesson?id={source_id}",
                        "connection_id": None, "access_status": "ready", "content_hash": sha256(teacher.encode()).hexdigest(),
                        "fetched_at": stamp, "source_timezone": "America/Los_Angeles", "locator_schema": "source-frame-v1",
                        "text": teacher, "provenance": {"origin": "synthetic", "consent_scope": "test_only",
                        "attribution": "Project-authored P0 memory fixture; not real user history or a lecture capture.", "license": "project-test-fixture"}})
        if frame_id:
            artifact_id = f"{event_root}-svg"
            svg = ('<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="768">'
                   '<rect width="1024" height="768" fill="white"/>'
                   '<text x="24" y="40">SYNTHETIC TEST ILLUSTRATION - NOT A CAPTURE</text>'
                   '<path d="M100 600V130M100 600H900" stroke="purple" fill="none"/>'
                   f'<text x="24" y="80">{escape(teacher)}</text></svg>\n').encode()
            artifact_path = f"artifacts/{artifact_id}.svg"
            write(artifact_path, svg)
            artifacts[artifact_id] = artifact_path
            frames.append({**base, "frame_id": frame_id, "session_id": f"session-{event_root}", "device_id": "fixture-tablet",
                           "captured_at": stamp, "source_timezone": "America/Los_Angeles", "media_position": float(int(scene) * 13),
                           "width": 1024, "height": 768, "artifact_id": artifact_id, "content_hash": sha256(svg).hexdigest(),
                           "representation": "synthetic_fixture"})
        for suffix, actor, text in (("t", "teacher", teacher), ("u", "user", user), ("a", "assistant", assistant)):
            sequence += 1
            event = {**base, "event_id": f"{event_root}-{suffix}", "device_id": "fixture-tablet", "device_sequence": sequence,
                     "session_id": f"session-{event_root}", "captured_at": stamp, "received_at": None,
                     "source_timezone": "America/Los_Angeles", "actor": actor, "text": text, "frame_id": frame_id,
                     "media_position": float(int(scene) * 13), "confidence": 1.0, "gap_flags": [missing] if missing else [], "correction_of": None}
            observations.append(event)
            if suffix == "u" and prefix == "e" and scene in CORRECTIONS:
                sequence += 1
                observations.append({**event, "event_id": f"{event_root}-c", "device_sequence": sequence,
                                     "captured_at": (now + timedelta(hours=1)).isoformat().replace("+00:00", "Z"),
                                     "text": CORRECTIONS[scene], "correction_of": event["event_id"]})

    for line in SCENES.splitlines():
        scene, project, teacher, user, assistant = line.split("|")
        missing = "missing_frame" if scene == "22" else "missing_audio" if scene == "23" else None
        episode(scene, project, teacher, user, assistant, missing=missing)
        # Similar original wording in a different project, plus another day in the
        # same project. These are independent synthetic records, never aliases.
        episode(scene, "workshop", teacher.replace("The ", "Our workshop's "), user, assistant, prefix="d", days=60)
        episode(scene, project, teacher, "During a later review: " + user, assistant, prefix="r", days=120)
    # Later material exceeds a small context window without replacing early files.
    # Synthetic repetition is a preservation stressor, not realistic learning data.
    for i in range(600):
        sequence += 1
        observations.append({**observations[-1], "event_id": f"later-{i:04d}", "device_sequence": sequence,
                             "captured_at": "2026-01-01T00:00:00Z", "actor": "assistant", "correction_of": None,
                             "text": f"Later practice log {i}: " + "Review the exercise assumptions, check the units, and record unresolved questions. " * 30})
    bundle = {"sources": sources, "frames": frames, "observations": observations}
    write("records.json", (json.dumps(bundle, indent=2, ensure_ascii=False) + "\n").encode())
    dump(root / "manifest.json", {"format": "synthetic-memory-v1", "contract_version": "0.1.0", "files": files,
                                  "artifacts": artifacts, "source_texts": source_texts})
    print(json.dumps({"sources": len(sources), "frames": len(frames), "observations": len(observations)}))


if __name__ == "__main__":
    build()
