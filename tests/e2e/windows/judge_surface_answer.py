#!/usr/bin/env python3
"""Judges a model's answer about the QA test surface (surface.html), by rules fixed before any real call.

  judge_surface_answer.py --self-test
  judge_surface_answer.py <truth.json> <circled index,index> <answer.txt>

The surface shows twelve cards (a colored shape and a 4-digit number each), drawn at random as pixels only. QA circles
TWO of them with the pen, selects the whole grid with ASK and asks for the circled cards only: each one's number, and
its shape and the shape's color. Naming exactly the two circled numbers needs the pixels (the numbers are nowhere else)
and the ink (twelve cards are shown; an ink-blind reader names the right pair with probability 1 in 66).

A matcher pass is necessary, never sufficient: the mere occurrence of the right numbers does not show that the answer
asserts them. An answer that negates, refuses or hedges ("are NOT 4271 or 8830", "I cannot see the image. Perhaps ...")
is `held`, never a pass, and every matcher pass still needs a person to read the full answer, which is kept verbatim.

Outcomes, most to least:
  identified          both circled numbers and no other card's number; each card's shape and color right        matcher PASS
  numbers_identified  both circled numbers and no other; a shape or color is not stated (none is stated wrong)   matcher PASS on
                      the image-only criterion, reported with "shape/color not confirmed"
  held                the numbers match, but the answer holds a negation, refusal or uncertainty marker          not a pass;
                      the full answer goes to semantic review
  contradicted        both circled numbers and no other, but a stated shape or color of a circled card is wrong   not a pass
  several_cards       both circled numbers are named, together with other cards' numbers                          not a pass
  wrong_cards         numbers of the surface are named, but not both circled ones                                 fail
  not_identified      no number of the surface is named (a misread digit counts here)                             fail
  no_answer           empty text                                                                                  fail

The truth (what the page drew) comes from the page through the harness; it is never part of the question, the prompt,
a file name or a fixture reply. `leaks` looks for it in whatever texts it is given.
"""
import json
import re
import sys

SHAPE_WORDS = {"square": ["square"], "triangle": ["triangle"], "star": ["star"], "heart": ["heart"], "diamond": ["diamond", "rhombus"]}
COLOR_WORDS = {"red": ["red"], "blue": ["blue", "navy"], "green": ["green"], "orange": ["orange"]}
# Conservative on purpose: any of these anywhere in the answer holds a matcher pass (a false hold costs a human reading; a
# false pass would accept a guess, a refusal or a denial). Not a language model, only a tripwire.
HOLD = [
    ("negation", r"\bnot\b|n['\u2019]t\b|\bcannot\b|\bneither\b|\bnor\b|\bnever\b|\bnone\b|\bwithout\b"),
    ("refusal", r"\bunable\b|\bsorry\b|\bno (?:image|picture|screenshot|attachment|circle|circles|ink|mark|marks)\b|\brefuse|\bdecline"),
    ("uncertainty", r"\bperhaps\b|\bmaybe\b|\bmight\b|\bpossibl[ey]\b|\bprobabl[ey]\b|\blikely\b|\bguess\w*|\bunsure\b|\buncertain\w*|\bunclear\b|\bassum\w*"
                    r"|\bappears?\b|\bseems?\b|\bi think\b|\bi believe\b|\bhard to\b|\bdifficult to\b|\bapproximately\b|\bif\b|\bcould be\b|\bor\b|\?"),
]


def hold_markers(answer):
    low = answer.lower()
    return [[kind, m.group(0)] for kind, pattern in HOLD for m in re.finditer(pattern, low)]


def number_spans(text):
    """(number, start, end) for 4-digit numbers: 4271, '4,271', '4 271' and digit by digit ('4 2 7 1', '4-2-7-1')."""
    spans = []
    for m in re.finditer(r"(?<![\d,.])(\d)[ \-]?(\d)[ \-]?(\d)[ \-]?(\d)(?![\d])|(?<!\d)(\d)[,\u202f\u00a0 ](\d{3})(?!\d)", text):
        digits = "".join(g for g in m.groups() if g)
        if len(digits) == 4:
            spans.append((int(digits), m.start(), m.end()))
    return spans


def word_spans(text, vocabulary):
    low = text.lower()
    return sorted((m.start(), key) for key, forms in vocabulary.items() for f in forms for m in re.finditer(rf"\b{f}s?\b", low))


def about(text, shape, color):
    """What a piece of text says of one card: 'right', 'wrong' (another shape, or the shape with another color nearest
    to it) or 'missing' (no shape of the vocabulary, or the shape without any color)."""
    shapes, colors = word_spans(text, SHAPE_WORDS), word_spans(text, COLOR_WORDS)
    if not shapes:
        return "missing"
    if {k for _, k in shapes} != {shape}:
        return "wrong"
    if not colors:
        return "missing"
    nearest = {min(colors, key=lambda c: abs(c[0] - pos))[1] for pos, _ in shapes}  # the color said closest to each mention of the shape
    return "right" if nearest == {color} else "wrong"


def pieces(answer, targets):
    """For each circled number, the pieces of the answer that may describe its card: its own line when it is alone on
    it; otherwise the text from the number to the next circled number, or from the previous one up to the number."""
    lines = [l for l in re.split(r"[\r\n]+", answer) if l.strip()]
    out = {}
    for n in targets:
        mine = [l for l in lines if n in [x for x, _, _ in number_spans(l)]]
        alone = [l for l in mine if {x for x, _, _ in number_spans(l)} & set(targets) == {n}]
        if alone:
            out[n] = [" ".join(alone)]
            continue
        line = " ".join(mine)
        marks = sorted((s, e, x) for x, s, e in number_spans(line) if x in targets)
        after, before = [], []
        for i, (s, e, x) in enumerate(marks):
            if x == n:
                after.append(line[e:marks[i + 1][0]] if i + 1 < len(marks) else line[e:])
                before.append(line[marks[i - 1][1]:s] if i else line[:s])
        out[n] = [" ".join(after), " ".join(before)]
    return out


def judge(truth, circled, answer):
    cards = truth["cards"]
    targets = [cards[i] for i in circled]
    wanted = sorted(c["number"] for c in targets)
    on_surface = {c["number"] for c in cards}
    if not isinstance(answer, str) or not answer.strip():
        return {"outcome": "no_answer", "pass": False}
    found = [n for n, _, _ in number_spans(answer)]
    named = sorted(set(found) & on_surface)
    result = {"expected": [{k: c[k] for k in ("index", "number", "shape", "color")} for c in targets], "surface_numbers_named": named,
              "other_4_digit_numbers": sorted(set(found) - on_surface)}
    if named != wanted:
        outcome = "several_cards" if set(wanted) <= set(named) else "wrong_cards" if named else "not_identified"
        return {"outcome": outcome, "pass": False, **result}
    where = pieces(answer, wanted)
    # One reading for the whole answer: the description follows each number, or precedes it.
    readings = [{c["number"]: about(where[c["number"]][min(k, len(where[c["number"]]) - 1)], c["shape"], c["color"]) for c in targets} for k in (0, 1)]
    rank = lambda r: (sum(v == "right" for v in r.values()), -sum(v == "wrong" for v in r.values()))
    best = max(readings, key=rank)
    outcome = "identified" if all(v == "right" for v in best.values()) else "contradicted" if "wrong" in best.values() else "numbers_identified"
    held = hold_markers(answer) if outcome != "contradicted" else []
    if held:
        return {"outcome": "held", "pass": False, "matcher_alone": outcome, "hold_markers": held, "shape_and_color": best, **result,
                "semantic_review": "required: the answer negates, refuses or hedges; it is not a pass unless a person reads it as a plain assertion"}
    return {"outcome": outcome, "pass": outcome in ("identified", "numbers_identified"), "shape_and_color": best, **result,
            **({"semantic_review": "required: a matcher pass is not the acceptance; read the full answer"} if outcome != "contradicted" else {})}


def leaks(truth, texts):
    """Which given texts (name -> text) hold a card number of the surface, also written with single separators.

    Long hex runs, UUIDs and ISO timestamps are masked first: four digits inside a hash or a time are not the number.
    A hit in free text (a question, a prompt, a file name, a title, a URL, DOM text, a log message) voids a pass; a hit in a
    named numeric field (a size, a count, a sequence) is listed with its field and does not. Never give base64.
    """
    hits = {}
    for name, text in texts.items():
        clean = re.sub(r"\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b|\b[0-9a-fA-F]{16,}\b|\d{4}-\d\d-\d\dT[\d:.]+(?:Z|[+-]\d\d:\d\d)?", " ", text or "")
        found = []
        for c in truth["cards"]:
            d = str(c["number"])
            if re.search(rf"(?<!\d){d[0]}[\s.,_'\-]?{d[1]}[\s.,_'\-]?{d[2]}[\s.,_'\-]?{d[3]}(?!\d)", clean):
                found.append(c["number"])
        if found:
            hits[name] = sorted(found)
    return hits


def self_test():
    cards = [{"index": i, "number": n, "shape": s, "color": c} for i, (n, s, c) in enumerate([
        (4271, "star", "blue"), (8830, "heart", "red"), (1946, "diamond", "green"), (5512, "square", "orange"),
        (7003, "triangle", "red"), (6628, "star", "green"), (3390, "heart", "blue"), (9154, "square", "red"),
        (2087, "diamond", "orange"), (4416, "triangle", "green"), (1205, "star", "red"), (7741, "heart", "orange")])]
    truth = {"cards": cards}
    A = [0, 1]  # 4271 blue star, 8830 red heart
    cases = [
        ("identified", A, "4271 - blue - star\n8830 - red - heart"),
        ("identified", A, "You circled two cards:\n- **4271**: a blue star\n- **8830**: a red heart"),
        ("identified", A, "The circled cards show 4271 with a blue star and 8830 with a red heart."),
        ("identified", A, "A blue star is next to 4271, and a red heart is next to 8830."),
        ("identified", A, "Inside your purple pen circles: 4,271 (blue star) and 8 8 3 0 (red heart)."),
        ("identified", A, "The card inside your first circle shows 4271, with a blue star next to it.\nThe second circled card shows 8830; its shape is a heart, and it is red."),
        ("identified", A, "Card 4271: the shape is a star. It sits to the left of the digits on a pale card with a thin grey border, inside your pen mark, and its color is navy.\nCard 8830: a red heart."),
        ("identified", [2, 8], "1946 has a green diamond (rhombus); 2087 has an orange diamond."),
        ("identified", A, "You circled 4271 (blue star) and 8830 (red heart). No other card is circled."),
        ("numbers_identified", A, "The two circled cards show the numbers 4271 and 8830."),
        # the lead's two cases, and their kin: the right numbers occur, but the answer does not assert them
        ("held", A, "The circled cards are NOT 4271 or 8830. I cannot identify them."),
        ("held", A, "I cannot see the image. Perhaps 4271 and 8830?"),
        ("held", A, "Maybe 4271 - blue - star\n8830 - red - heart"),
        ("held", A, "I'm guessing: 4271 (blue star) and 8830 (red heart)."),
        ("held", A, "Sorry, I am unable to view images. 4271 and 8830."),
        ("held", A, "It isn\u2019t clear, but it appears to be 4271 with a blue star and 8830 with a red heart."),
        ("held", A, "If I read the ink correctly, the cards are 4271 (blue star) and 8830 (red heart)."),
        ("held", A, "There are no circles in the picture. The first two cards are 4271 and 8830."),
        ("held", A, "4271 - blue - star\n8830 - red - heart\nIs that what you circled?"),
        ("numbers_identified", A, "4271 - star\n8830 - red heart"),                       # one color not stated
        ("contradicted", A, "4271 - red - star\n8830 - red - heart"),                       # wrong color
        ("contradicted", A, "4271 - blue - heart\n8830 - red - heart"),                     # wrong shape
        ("contradicted", A, "The card circled in ink shows 4271 and a red star. The other is 8830, a red heart."),
        ("several_cards", A, "I see 4271, 8830, 1946 and 5512. You circled 4271 (blue star) and 8830 (red heart)."),
        ("wrong_cards", A, "You circled 4271 (blue star) and 1946 (green diamond)."),
        ("wrong_cards", A, "The circled card is 4271, a blue star."),                      # only one of the two
        ("wrong_cards", A, "I cannot tell which cards are circled, but one of them shows 5512 with an orange square."),
        ("not_identified", A, "I cannot see which cards are circled."),
        ("not_identified", A, "The numbers are 4272 and 8831."),                            # misread
        ("not_identified", A, "The numbers are 42710 and 88300."),                          # longer digit runs are not card numbers
        ("no_answer", A, "   "),
    ]
    bad = [(want, text, judge(truth, idx, text)) for want, idx, text in cases if judge(truth, idx, text)["outcome"] != want]
    got = leaks(truth, {"question": "I circled two cards. For each, give its number, color and shape.", "prompt": "Cards 1946 and 8,830 are circled.", "file": "surface-4_2_7_1.png",
                        "provenance": '{"sha256":"9123800ab33126642a6845f2fa42ddc7a69a8a1093c2922e1f4541517c7508c4","frame_captured_at":"2026-10-01T04:42:71.5512Z","id":"00005512-1205-4416-9154-000077411946"}',
                        "words": "four two seven one", "size": '{"width": 1946}'})
    if got != {"prompt": [1946, 8830], "file": [4271], "size": [1946]}:
        bad.append(("leaks", got))
    print(json.dumps({"cases": len(cases), "failed": bad}, indent=1))
    return 1 if bad else 0


if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        raise SystemExit(self_test())
    truth_file, indexes, answer_file = sys.argv[1:4]
    with open(truth_file, encoding="utf-8") as f:
        truth = json.load(f)
    with open(answer_file, encoding="utf-8") as f:
        print(json.dumps(judge(truth, [int(i) for i in indexes.split(",")], f.read()), indent=1))
