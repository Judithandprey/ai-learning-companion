"""Authored queries and judgments; never imported by retrieval code.

Judgments are fixed independently of ranked results, but have not been reviewed
by an independent human annotator. This synthetic benchmark is not user testing.
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent

# scene | exact teacher query | exact user/correction query | user target suffix
EXACT = """
01|What did the teacher label with the violet chalk mark?|I confuse left and right multiplication between coordinate systems.|u
02|What changes during a change of basis?|Correction physical arrow stays fixed only coordinates change.|c
03|Why does the denominator normalize the posterior in Bayes rule?|I forgot the evidence probability in the denominator.|u
04|What resistor did version one of the calibration handout use?|I wrote 220 ohms beside the original bridge diagram.|u
05|What does the tangent on the blue curve represent?|I read slope as height of the blue curve.|u
06|Which units belong to variance and standard deviation?|Correction variance result square meters not meters.|c
07|Which tray is removed first by a stack?|I mixed up stack and queue order in the tray example.|u
08|What does the robot Jacobian map?|I asked whether a singular arm can move in every direction.|u
09|Which vectors keep their direction under the matrix?|I thought every vector keeps its direction under the shear.|u
10|How were the two coin tosses modeled?|Correction independent coin toss does not compensate.|c
11|What does Kirchhoff current law balance at the junction?|I added both outgoing currents as positive inflows.|u
12|Where does integration by parts come from?|I swapped u and du in the product-rule derivation.|u
13|What is the confidence interval coverage interpretation?|I described the fixed parameter as randomly moving into the interval.|u
14|What precondition does binary search require?|I searched an unsorted list using the midpoint rule.|u
15|What rare encoder offset was observed?|I recorded the minus-three encoder offset on the first practice day.|u
16|Which vectors belong to the null space?|What was my original claim about null space output vectors?|u
17|What do the green conditional tree branches mean?|I counted green leaves without multiplying branch probabilities.|u
18|What cannot jump in the ideal finite-current capacitor model?|I expected an instantaneous voltage jump when the switch closed.|u
19|What bounds the alternating-series remainder?|I used the whole partial sum as the error bound.|u
20|How is a regression residual defined?|I drew residuals horizontally instead of vertically.|u
21|What does a shallow copy share?|Correction shallow copy nested list can affect original.|c
22|Where did the motion planner sample near the obstacles?|I remember the tiny corridor but the captured frame is missing.|u
23|What slide title survived when lecture audio was unavailable?|I asked about the projection shadow after audio stopped.|u
24|What does likelihood compare for fixed data?|I mistook likelihood for a normalized distribution over parameters.|u
25|What resistor replaced the bridge resistor in handout version two?|I updated my bridge annotation to 330 ohms.|u
""".strip()

# scene | fuzzy query | target event suffixes | mode | broad early time clue
FUZZY = """
01|Last winter there were two coordinate axes and I got left versus right multiplication mixed up.|t,u|history|yes
02|What do I now say about changing basis and the physical arrow?|c|current|yes
03|上次讲分母归一化时那个装琥珀珠子的罐子，我问了什么？|t,u|history|yes
04|Find the older bridge handout with the smaller resistor and my annotation.|t,u|history|yes
05|The blue curve lesson where I confused vertical position with steepness.|t,u|history|yes
06|Find my wrong units for variance and the later correction.|u,c|history|yes
07|That red pile example where last in comes out first and I mixed the orders.|t,u|history|yes
08|The arm that loses a direction of motion near a singular configuration.|t,u|history|yes
09|Find the arrow that didn't turn under a matrix, and my mistaken generalization.|t,u|history|yes
10|What is my corrected view of coin toss compensation?|c|current|yes
11|I counted flow leaving a junction as if it were entering.|t,u|history|yes
12|I remember a board with u and dv and copying the wrong differential.|t,u|history|yes
13|That interval question where I made the unknown parameter move around.|t,u|history|yes
14|The midpoint card in the search lesson where I forgot to sort.|t,u|history|yes
15|There was a tiny negative wheel tick offset early on. Find the original detail and my note.|t,u|history|yes
16|Show my original null space statement next to my correction.|u,c|history|yes
17|The green branching picture where I just counted leaves.|t,u|history|yes
18|That switch and storage-component discussion where I expected an immediate jump.|t,u|history|yes
19|The plus-minus series where I chose the wrong error size.|t,u|history|yes
20|The fitted line picture where I drew the gaps sideways.|t,u|history|yes
21|What did I correct about a shallow copy and the nested list?|c|current|yes
22|机器人走两块障碍物中间的小缝，那次没有留下画面。|u|history|yes
23|What is actually preserved from the projection lesson after the sound disappeared?|t,u|history|yes
24|那个固定观测数据后换参数的量，我误以为已经归一化。|t,u|history|yes
25|The revised bridge sheet with the bigger resistance and my updated annotation.|t,u|history|yes
26|A function inside another function, where I dropped a multiplier.|t,u|history|yes
27|Did I merely schedule covariance review on Friday or actually study it?|t,u|history|yes
28|Did watching recursion twice establish independent application?|t,u|history|yes
29|那次我说自己觉得懂了齐次变换，但还没做新题。|u|history|yes
30|Find the unseen basis conversion I solved without hints and checked.|t,u|history|yes
""".strip()

PROJECTS = ("robotics algebra probability circuits calculus statistics programming "
            "robotics algebra probability circuits calculus statistics programming "
            "robotics algebra probability circuits calculus statistics programming "
            "robotics algebra probability circuits calculus statistics programming robotics algebra").split()


def label(scene, suffix):
    return {"user_id": "synthetic-learner", "source_id": "e-source-" + ("04" if scene == "25" else scene),
            "source_version": 2 if scene == "25" else 1, "event_id": f"e-{scene}-{suffix}",
            "frame_id": None if scene == "22" else f"e-{scene}-frame"}


def build():
    queries, judgments = [], {}
    for line in EXACT.splitlines():
        scene, teacher, user, suffix = line.split("|")
        for index, text, target, actor in ((1, teacher, "t", "teacher"), (2, user, suffix, "user")):
            qid = f"exact-{scene}-{index}"
            query = {"text": text, "project_id": PROJECTS[int(scene) - 1], "actor": actor, "mode": "history"}
            if scene in ("04", "25"):
                query["source_version"] = 2 if scene == "25" else 1
            queries.append({"id": qid, "group": "exact", "query": query})
            judgments[qid] = {"required": [label(scene, target)], "rationale": "Original named speaker and exact episode/version, not a later review."}
    for line in FUZZY.splitlines():
        scene, text, targets, mode, early = line.split("|")
        qid = f"fuzzy-{scene}"
        query = {"text": text, "project_id": PROJECTS[int(scene) - 1], "mode": mode}
        if early == "yes":
            query["before"] = "2025-02-15T00:00:00Z"
        queries.append({"id": qid, "group": "fuzzy", "query": query})
        judgments[qid] = {"required": [label(scene, suffix) for suffix in targets.split(",")],
                          "rationale": "All specified original event anchors are required; a same-topic result is insufficient."}
    # Development probes are distinct from the scored set. No parameter search is
    # implemented; textbook BM25 constants were chosen before any scored run.
    dev = [{"id": "dev-" + scene, "query": {"text": text, "actor": "assistant", "project_id": PROJECTS[int(scene) - 1]}}
           for scene, text in (("01", "frame labels both sides"), ("03", "sum mutually exclusive hypotheses"),
                               ("07", "trace push pop trays"), ("15", "calibration separate planned exercises"),
                               ("21", "draw references outer nested list"), ("27", "scheduled study demonstrated application"))]
    for name, data in (("queries.json", queries), ("labels.json", judgments), ("dev_queries.json", dev)):
        (ROOT / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"exact_queries": 50, "fuzzy_queries": 30, "development_queries": len(dev)}))


if __name__ == "__main__":
    build()
