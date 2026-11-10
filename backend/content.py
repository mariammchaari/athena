import re

LANG_NAMES = {"en": "English", "fr": "French", "ar": "Arabic"}

DEEP_MODES = {"rigorous", "example", "compare", "mistakes", "steps"}
_REASONING = re.compile(r"\b(why|how come|prove|proof|derive|compare|difference between|explain in detail|step by step|"
                        r"pourquoi|comment se fait|démontre|prouve|compare|différence|"
                        r"لماذا|برهن|الفرق|علاش|علاه)", re.I)
_CODE_MATH = re.compile(r"```|\bdef \w+\(|function\s*\w*\(|#include|=>|\\frac|\\int|∫|∑|√|\$[^$]+\$|\b\d+\s*[\^*/]\s*\d+|[a-z]\s*\^\s*\d")
_CONFUSED = re.compile(r"(don'?t (get|understand)|confus|lost|makes no sense|still not|i'?m stuck|"
                       r"pas compris|comprends pas|je suis perdu|toujours pas|"
                       r"ما فهمت|لم أفهم|ما فهمتش|مافهمتش|ما زلت)", re.I)

def route(content, mode, history):
    reasons = []
    if mode in DEEP_MODES: reasons.append("teaching approach")
    if len(content) > 350: reasons.append("long question")
    if _CODE_MATH.search(content): reasons.append("code or maths")
    if _REASONING.search(content): reasons.append("needs reasoning")
    recent_user = [m["content"] for m in history[-6:] if m["role"] == "user"]
    confused = sum(1 for t in recent_user if _CONFUSED.search(t))
    if confused: reasons.append("confusion detected")
    return ("large" if reasons else "fast"), reasons, confused > 0

STYLES = {
    "visual": "Use visual explanations: describe a diagram, use small tables or ASCII sketches and spatial metaphors.",
    "analogy": "Lead with a concrete everyday analogy, then say clearly where the analogy breaks down.",
    "steps": "Break things into short numbered steps and check understanding between the big ones.",
    "examples": "Show a worked example early, then generalise from it.",
    "practice": "Keep explanations short and give a small exercise to try; learning by doing and repetition.",
    "direct": "Be concise: the key idea and the reason, then stop. Offer more only if asked.",
}

def diag_free_text_heuristic(text):
    t = text.lower()
    rules = [("visual", r"draw|diagram|picture|schema|schéma|dessin|image|visual|رسم|صورة"),
             ("analogy", r"analog|compar|like a|comme |metaphor|مثل|تشبيه"),
             ("steps", r"step|étape|order|ordre|خطوة|مرحلة"),
             ("examples", r"example|exemple|instance|مثال"),
             ("practice", r"practi|exerci|try|repeat|répét|تمرين|نجرب|تكرار"),
             ("direct", r"short|direct|quick|bref|court|rapide|مختصر|مباشر")]
    for style, rx in rules:
        if re.search(rx, t):
            return style
    return None

def diagnostic_prompt():
    return ("TASK=DIAG\nYou classify how a learner prefers to be taught. Read their sentence and answer with JSON only: "
            '{"style": one of ["visual","analogy","steps","examples","practice","direct"], "confidence": number 0-1}.')

def tutor_system(u, mode_text, lang_rule, confused, tier):
    style = u.get("style") or ""
    style_lines = " ".join(STYLES[s] for s in style.split(",") if s in STYLES)
    return (
        "You are Pingo, ATHENA's patient, curious, honest study companion (a friendly penguin). Build understanding; "
        "don't just hand over answers. Be warm, never patronising; never pretend to be human. "
        f"Learner level: {u['level']}. Address them as {u['name']}.\n"
        f"Language: {lang_rule}\n"
        f"Teaching approach: {mode_text}\n"
        + (f"This learner's diagnosed learning style: {style_lines}\n" if style_lines else "")
        + ("The learner seems confused: change approach rather than rephrasing, start from what they already know, and end with one short check question.\n" if confused else "")
        + "Favour hints and reasoning over final answers for homework-style questions unless they ask for the answer. "
        "Say plainly when you're unsure. Never ask for personal information. "
        "Format: Markdown, short paragraphs, **bold** key terms, tables for comparisons; maths in LaTeX ($...$ inline, $$...$$ display)."
        + (" Keep it brief: at most about 150 words." if tier == "fast" else "")
    )

def room_content_prompt(topic, lang, difficulty, quiz_n, rounds, material=""):
    parts = ['"brief": {"summary": string (3-4 sentences), "key_points": [5 strings], "pitfalls": [3 common mistakes], '
             '"practice": [3 objects {"q": string, "a": string}]}']
    if "quiz" in rounds:
        parts.append(f'"quiz": [{quiz_n} objects {{"q": string, "options": [4 strings], "answer": index 0-3 of the correct option, "explain": one sentence}}]')
    if "open" in rounds:
        parts.append('"open": {"title": string, "prompt": an open problem a team can answer in 150-300 words, '
                     '"rubric": [3 objects {"name": short criterion name, "what": what earns full marks}]}')
    system = ("TASK=ROOM_CONTENT\nYou are Pingo, the AI facilitator of ATHENA team-learning hackathons. "
              f"Write everything in {LANG_NAMES.get(lang, 'English')}. Level: {difficulty}. "
              "Be accurate; quiz distractors must be plausible but clearly wrong to someone who understands. "
              "Vary the position of the correct answer. Output ONLY one JSON object, no prose.")
    source = (f"\nBase the brief, the questions and the problem on this course material (facts extracted from the host's documents):\n{material}\n"
              if material else "")
    user = f'Topic: "{topic}".{source}\nReturn JSON with exactly these keys:\n{{{", ".join(parts)}}}'
    return system, user


def chunk_text(text, size=700, overlap=120):
    text = re.sub(r"[ \t]+", " ", text.replace("\r", "")).strip()
    paras = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    chunks, buf = [], ""
    for p in paras:
        while len(p) > size:
            cut = p.rfind(". ", 0, size)
            cut = cut + 1 if cut > size // 2 else size
            if buf:
                chunks.append(buf); buf = ""
            chunks.append(p[:cut].strip()); p = p[max(0, cut - overlap):].strip()
        if len(buf) + len(p) + 1 > size and buf:
            chunks.append(buf); buf = p
        else:
            buf = (buf + "\n" + p).strip()
    if buf:
        chunks.append(buf)
    return [c for c in chunks if len(c) > 30][:200]


_WORD = re.compile(r"\w{3,}", re.U)


def keyword_rank(query, chunks, k):
    q = {w.lower() for w in _WORD.findall(query)}
    if not q:
        return chunks[:k]
    docs = [[w.lower() for w in _WORD.findall(c)] for c in chunks]
    df = {w: sum(1 for d in docs if w in d) for w in q}
    n = len(docs) or 1
    scored = []
    for c, d in zip(chunks, docs):
        score = sum(d.count(w) * (1 + (n / (1 + df[w]))) for w in q) / (1 + len(d) / 120)
        scored.append((score, c))
    scored.sort(key=lambda x: -x[0])
    return [c for s, c in scored[:k] if s > 0] or chunks[:k]


def narrow_prompt(topic, lang):
    return ("TASK=EXTRACT\nYou extract facts. From the excerpts, keep only facts, definitions, formulas and examples relevant to "
            f'"{topic}". Write them as a bullet list in {LANG_NAMES.get(lang, "English")}, max 250 words. '
            "Use only what the excerpts say; never add outside knowledge.")

def validate_room_content(d, rounds):
    assert isinstance(d["brief"]["key_points"], list) and d["brief"]["summary"]
    if "quiz" in rounds:
        assert len(d["quiz"]) >= 3
        for q in d["quiz"]:
            assert len(q["options"]) == 4 and int(q["answer"]) in (0, 1, 2, 3) and q["q"]
    if "open" in rounds:
        assert d["open"]["prompt"] and len(d["open"]["rubric"]) >= 2

def judge_prompt(lang, problem, answer):
    rubric = "\n".join(f"- {r['name']}: {r['what']}" for r in problem["rubric"])
    system = ("TASK=JUDGE\nYou are a fair, encouraging hackathon judge for a learning competition. Score only the content, "
              "never the writer's language level, region or background. Answer in "
              f"{LANG_NAMES.get(lang, 'English')}. Output ONLY JSON: "
              '{"scores": [{"name": criterion, "score": integer 0-10, "comment": one sentence}], '
              '"strength": one sentence, "improve": one sentence}.')
    user = f"Problem: {problem['title']}\n{problem['prompt']}\n\nRubric:\n{rubric}\n\nTeam answer:\n{answer[:4000]}"
    return system, user

def notes_prompt(lang, topic, brief, mistakes, judge_fb, questions):
    system = ("TASK=NOTES\nYou are Pingo. Write short revision notes for a study team after a learning hackathon, in "
              f"{LANG_NAMES.get(lang, 'English')}. Markdown with these sections: key ideas (4-6 bullets), "
              "the team's mistakes and how to fix them, two practice questions with answers, and one suggested next learning step. "
              "Max 320 words. Maths in LaTeX.")
    user = (f"Topic: {topic}\nKey points: {'; '.join(brief.get('key_points', []))}\n"
            f"Quiz questions the team missed: {mistakes or 'none'}\n"
            f"Judge feedback on their open answer: {judge_fb or 'n/a'}\n"
            f"Questions the team asked while preparing: {questions or 'none'}")
    return system, user

def team_chat_system(lang, topic, phase, members, confused, tier, excerpts=None):
    roster = ", ".join(f"{m['name']} (prefers {m['style'] or 'unknown'})" for m in members)
    rule = ("The team is in the COMPETITION phase: do NOT give answers to quiz, coding or open-problem items. "
            "Only explain concepts, give small hints, and encourage teamwork." if phase == "compete" else
            "The team is PREPARING: explain, ask guiding questions, give hints before answers, and invite quieter members in.")
    return ("TASK=TEAM_CHAT\nYou are Pingo, a friendly penguin who facilitates a small study team in an ATHENA hackathon. "
            f"Topic: {topic}. Team: {roster}. Reply in {LANG_NAMES.get(lang, 'the language of the last message')} "
            "(or the language of the last message if different). "
            f"{rule} If someone's explanation contains a mistake, point it out kindly and explain why. "
            + ("Someone seems confused: try a different explanation style. " if confused else "")
            + (("Relevant passages from the team's course material (prefer them over general knowledge and say so when you use them):\n"
                + "\n---\n".join(excerpts) + "\n") if excerpts else "")
            + "Address people by their pseudonym. Never ask for personal information. "
            f"Keep replies under {120 if tier == 'fast' else 200} words. Markdown; maths in LaTeX.")

def check_explanation_system(lang, excerpts=None):
    return (("Course material to check against:\n" + "\n---\n".join(excerpts) + "\n") if excerpts else "") + ("TASK=CHECK\nYou are Pingo. A learner explained a concept to their team. Check it carefully. "
            f"Answer in {LANG_NAMES.get(lang, 'English')}: start with ✅ (correct), ⚠️ (partly right) or ❌ (incorrect), "
            "then say what is right, what is wrong and why, and give the corrected key sentence. Be kind; max 150 words.")

def hint_system(lang):
    return ("TASK=HINT\nYou are Pingo, a coding coach in a timed competition. Give ONE short hint (max 2 sentences) in "
            f"{LANG_NAMES.get(lang, 'English')}. Never write the solution or any code.")

def review_system(lang):
    return ("TASK=REVIEW\nYou are Pingo. Review a learner's solution in max 90 words, in "
            f"{LANG_NAMES.get(lang, 'English')}: one thing done well, one concrete improvement (readability, edge case or complexity). "
            "Don't rewrite the whole solution.")

NUDGES = {
    "quiet": {"en": "{name}, I'd love to hear your take: what do you think so far? (You can also ask anonymously 🕶️)",
              "fr": "{name}, j'aimerais avoir ton avis : qu'en penses-tu ? (Tu peux aussi poser ta question anonymement 🕶️)",
              "ar": "{name}، يهمّني رأيك: ما رأيك حتى الآن؟ (يمكنك أيضاً السؤال دون ذكر اسمك 🕶️)"},
    "dominant": {"en": "Great energy, {name}! Let's hear from {others} before the next idea.",
                 "fr": "Super énergie, {name} ! Écoutons {others} avant la prochaine idée.",
                 "ar": "حماس رائع يا {name}! لنسمع من {others} قبل الفكرة التالية."},
    "welcome": {"en": "Hi team {team}! I'm Pingo. Read the brief, ask me anything with **Ask Pingo**, and try explaining ideas to each other. I'll check your explanations.",
                "fr": "Salut l'équipe {team} ! Je suis Pingo. Lisez la fiche, posez-moi vos questions avec **Demander à Pingo**, et expliquez-vous les idées : je vérifierai vos explications.",
                "ar": "مرحباً فريق {team}! أنا بينغو. اقرؤوا الملخّص، واسألوني عبر **اسأل بينغو**، واشرحوا الأفكار لبعضكم وسأتحقّق من شروحكم."},
    "compete": {"en": "The competition has started! I can still explain concepts, but I won't give answers. Good luck, team {team}! 🏆",
                "fr": "La compétition commence ! Je peux encore expliquer des notions, mais pas donner les réponses. Bonne chance, équipe {team} ! 🏆",
                "ar": "بدأت المنافسة! ما زلت أستطيع شرح المفاهيم لكن لن أعطي الأجوبة. بالتوفيق يا فريق {team}! 🏆"},
}
def nudge(kind, lang, **kw):
    return NUDGES[kind].get(lang, NUDGES[kind]["en"]).format(**kw)

CODING = [
    {"id": "sum_evens", "points": 100, "fn": "sum_evens", "params": ["nums"],
     "title": {"en": "Sum of evens", "fr": "Somme des pairs", "ar": "مجموع الأعداد الزوجية"},
     "text": {"en": "Return the sum of the even numbers in the list `nums`.", "fr": "Renvoie la somme des nombres pairs de la liste `nums`.", "ar": "أعد مجموع الأعداد الزوجية في القائمة `nums`."},
     "tests": [[[[1, 2, 3, 4]], 6], [[[]], 0], [[[7, 9]], 0], [[[-2, 5, 10]], 8], [[[0, 0, 1]], 0]]},
    {"id": "is_palindrome", "points": 100, "fn": "is_palindrome", "params": ["s"],
     "title": {"en": "Palindrome", "fr": "Palindrome", "ar": "الكلمة المتناظرة"},
     "text": {"en": "Return true if `s` reads the same backwards, ignoring case, spaces and punctuation.", "fr": "Renvoie vrai si `s` se lit pareil à l'envers, sans tenir compte de la casse, des espaces et de la ponctuation.", "ar": "أعد true إذا كانت `s` تُقرأ بالعكس بنفس الطريقة، مع تجاهل حالة الأحرف والمسافات وعلامات الترقيم."},
     "tests": [[["Kayak"], True], [["hello"], False], [["A man, a plan, a canal: Panama"], True], [[""], True], [["ab"], False]]},
    {"id": "count_vowels", "points": 100, "fn": "count_vowels", "params": ["s"],
     "title": {"en": "Count the vowels", "fr": "Compter les voyelles", "ar": "عدّ الحروف الصوتية"},
     "text": {"en": "Return how many vowels (a, e, i, o, u, any case) are in `s`.", "fr": "Renvoie le nombre de voyelles (a, e, i, o, u, majuscules comprises) dans `s`.", "ar": "أعد عدد الحروف الصوتية (a, e, i, o, u بأي حالة) في `s`."},
     "tests": [[["Pingo"], 2], [["rhythm"], 0], [["AEIOU"], 5], [[""], 0], [["Athena loves olives"], 8]]},
    {"id": "fizzbuzz", "points": 200, "fn": "fizzbuzz", "params": ["n"],
     "title": {"en": "FizzBuzz", "fr": "FizzBuzz", "ar": "FizzBuzz"},
     "text": {"en": "Return a list of strings for 1..n: \"Fizz\" for multiples of 3, \"Buzz\" for 5, \"FizzBuzz\" for both, otherwise the number.", "fr": "Renvoie une liste de chaînes pour 1..n : \"Fizz\" pour les multiples de 3, \"Buzz\" pour 5, \"FizzBuzz\" pour les deux, sinon le nombre.", "ar": "أعد قائمة نصوص من 1 إلى n: \"Fizz\" لمضاعفات 3، و\"Buzz\" لمضاعفات 5، و\"FizzBuzz\" لكليهما، وإلا الرقم نفسه."},
     "tests": [[[5], ["1", "2", "Fizz", "4", "Buzz"]], [[1], ["1"]], [[15], ["1", "2", "Fizz", "4", "Buzz", "Fizz", "7", "8", "Fizz", "Buzz", "11", "Fizz", "13", "14", "FizzBuzz"]], [[0], []]]},
    {"id": "two_sum", "points": 200, "fn": "two_sum", "params": ["nums", "target"],
     "title": {"en": "Two sum", "fr": "Somme de deux", "ar": "مجموع عددين"},
     "text": {"en": "Return the indices [i, j] (i < j) of the first pair in `nums` that adds up to `target`, or [] if none.", "fr": "Renvoie les indices [i, j] (i < j) de la première paire de `nums` dont la somme vaut `target`, ou [] sinon.", "ar": "أعد المؤشّرين [i, j] (i < j) لأول زوج في `nums` مجموعه `target`، أو [] إن لم يوجد."},
     "tests": [[[[2, 7, 11, 15], 9], [0, 1]], [[[3, 2, 4], 6], [1, 2]], [[[1, 2], 7], []], [[[5, 5, 1], 10], [0, 1]], [[[0, -3, 3], 0], [1, 2]]]},
    {"id": "most_frequent", "points": 200, "fn": "most_frequent", "params": ["text"],
     "title": {"en": "Most frequent word", "fr": "Mot le plus fréquent", "ar": "الكلمة الأكثر تكراراً"},
     "text": {"en": "Return the most frequent word in `text` (lower-cased, words split on spaces). On a tie, return the alphabetically first.", "fr": "Renvoie le mot le plus fréquent de `text` (en minuscules, mots séparés par des espaces). En cas d'égalité, le premier dans l'ordre alphabétique.", "ar": "أعد الكلمة الأكثر تكراراً في `text` (بأحرف صغيرة، والكلمات مفصولة بمسافات). عند التعادل أعد الأسبق أبجدياً."},
     "tests": [[["the cat and the hat"], "the"], [["b a b a"], "a"], [["Pingo pingo PINGO owl"], "pingo"], [["solo"], "solo"]]},
    {"id": "max_subarray", "points": 300, "fn": "max_subarray", "params": ["nums"],
     "title": {"en": "Best streak", "fr": "Meilleure série", "ar": "أفضل سلسلة"},
     "text": {"en": "Return the largest sum of a contiguous, non-empty run of numbers in `nums`.", "fr": "Renvoie la plus grande somme d'une suite contiguë et non vide de `nums`.", "ar": "أعد أكبر مجموع لسلسلة متتالية وغير فارغة من الأعداد في `nums`."},
     "tests": [[[[-2, 1, -3, 4, -1, 2, 1, -5, 4]], 6], [[[1]], 1], [[[-3, -1, -2]], -1], [[[5, -2, 5]], 8], [[[2, 3, -10, 4]], 5]]},
    {"id": "balanced", "points": 300, "fn": "balanced", "params": ["s"],
     "title": {"en": "Balanced brackets", "fr": "Parenthèses équilibrées", "ar": "الأقواس المتوازنة"},
     "text": {"en": "Return true if every bracket in `s` — (), [] and {} — is closed in the right order.", "fr": "Renvoie vrai si chaque parenthèse de `s` — (), [] et {} — est fermée dans le bon ordre.", "ar": "أعد true إذا أُغلق كل قوس في `s` — () و[] و{} — بالترتيب الصحيح."},
     "tests": [[["([]{})"], True], [["(]"], False], [["((("], False], [[""], True], [["{[()()]}x"], True], [["}{"], False]]},
]
CODING_BY_ID = {p["id"]: p for p in CODING}

def coding_set(difficulty):
    pick = {"secondary": ["sum_evens", "count_vowels", "fizzbuzz"],
            "undergraduate": ["is_palindrome", "two_sum", "max_subarray"],
            "graduate": ["most_frequent", "max_subarray", "balanced"]}.get(difficulty, ["is_palindrome", "two_sum", "balanced"])
    return pick

OFFLINE_QUIZ = [
    {"q": "What is 7 × 8?", "options": ["54", "56", "64", "48"], "answer": 1, "explain": "7 × 8 = 56."},
    {"q": "Which of these is a prime number?", "options": ["21", "27", "29", "33"], "answer": 2, "explain": "29 has no divisors other than 1 and itself."},
    {"q": "Water boils at sea level at…", "options": ["90 °C", "100 °C", "110 °C", "120 °C"], "answer": 1, "explain": "At 1 atm, water boils at 100 °C."},
    {"q": "What is the derivative of x²?", "options": ["x", "2x", "x²/2", "2"], "answer": 1, "explain": "d/dx xⁿ = n·xⁿ⁻¹, so 2x."},
    {"q": "Which planet is closest to the Sun?", "options": ["Venus", "Earth", "Mercury", "Mars"], "answer": 2, "explain": "Mercury orbits closest to the Sun."},
    {"q": "1/2 + 1/4 = ?", "options": ["2/6", "3/4", "1/8", "2/4"], "answer": 1, "explain": "1/2 = 2/4, and 2/4 + 1/4 = 3/4."},
]
def offline_content(topic, rounds):
    d = {"brief": {"summary": f"Offline sample: the AI service isn't configured, so this brief is a template. Topic: {topic}.",
                   "key_points": ["Define the key terms in your own words.", "Find one everyday example.", "Explain it to a teammate.",
                                  "Write one question you still have.", "Try a practice problem."],
                   "pitfalls": ["Memorising without understanding.", "Skipping the definitions.", "Not checking your answer."],
                   "practice": [{"q": f"Explain {topic} in two sentences.", "a": "Compare your answer with a teammate's."}]},
         "offline": True}
    if "quiz" in rounds: d["quiz"] = OFFLINE_QUIZ
    if "open" in rounds:
        d["open"] = {"title": f"Teach it back: {topic}",
                     "prompt": f"Explain {topic} to a younger student, with one example and one common mistake to avoid.",
                     "rubric": [{"name": "Accuracy", "what": "The explanation is correct."},
                                {"name": "Clarity", "what": "A beginner could follow it."},
                                {"name": "Example", "what": "A concrete, well-chosen example."}]}
    return d

def offline_judge(problem, answer):
    words = len(answer.split())
    base = 3 if words < 40 else 5 if words < 120 else 6
    return {"scores": [{"name": r["name"], "score": base, "comment": "Estimated offline (no AI judge available)."} for r in problem["rubric"]],
            "strength": "You submitted a full answer.", "improve": "Ask the host to connect the AI service for a real review.", "offline": True}


def plan_prompt(goal, lang_rule_text, level, style):
    return ("TASK=STUDY_PLAN\nYou are Pingo, a friendly study coach. Turn the student's goal into a short study plan they can tick off. "
            f"Student level: {level or 'undergraduate'}. Preferred learning style: {style or 'not known'}. {lang_rule_text} "
            "Answer with JSON only: {\"steps\": [{\"t\": short action title (max 60 chars), \"why\": one sentence on what this step "
            "achieves}]} with 3 to 5 steps, ordered from basics to mastery, each doable in one sitting, the last one a self-test.")

def validate_plan(d):
    st = d["steps"]
    assert isinstance(st, list) and 3 <= len(st) <= 6
    for x in st:
        assert isinstance(x["t"], str) and x["t"].strip() and isinstance(x.get("why", ""), str)

def offline_plan(goal):
    return {"steps": [{"t": "Learn the key ideas", "why": f"Write what “{goal}” means in your own words."},
                      {"t": "Work through one example", "why": "See the idea in action, step by step."},
                      {"t": "Explain it to a friend", "why": "Teaching it shows what you really understand."},
                      {"t": "Test yourself", "why": "Answer a practice question without notes."}],
            "source": "offline"}
