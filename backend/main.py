import asyncio, base64, hashlib, hmac, json, os, random, re, secrets, sqlite3, time
from contextlib import contextmanager
from typing import List, Optional

HERE = os.path.dirname(os.path.abspath(__file__))

def _load_env_file():
    path = os.path.join(HERE, ".env")
    if os.path.exists(path):
        for line in open(path, encoding="utf-8"):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                v = re.split(r"\s+#", v, maxsplit=1)[0]
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
_load_env_file()

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
import llm
import content as C

def _load_secret():
    if os.environ.get("ATHENA_SECRET"):
        return os.environ["ATHENA_SECRET"]
    path = os.path.join(HERE, ".secret")
    if not os.path.exists(path):
        with open(path, "w") as f:
            f.write(secrets.token_hex(32))
        os.chmod(path, 0o600)
    return open(path).read().strip()

DB_PATH = os.environ.get("ATHENA_DB", os.path.join(HERE, "athena.db"))
SECRET = _load_secret()
MAX_TOKENS = int(os.environ.get("ATHENA_MAX_TOKENS", "1500"))
AI_PER_MIN = int(os.environ.get("AI_REQUESTS_PER_MINUTE", "12"))
ORIGINS = os.environ.get("ATHENA_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
TOKEN_TTL = 60 * 60 * 24 * 14

app = FastAPI(title="ATHENA")
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=["*"], allow_headers=["*"])

@contextmanager
def db():
    con = sqlite3.connect(DB_PATH, timeout=10)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys=ON")
    try:
        yield con
        con.commit()
    finally:
        con.close()

def _add_column(c, table, col, decl):
    if col not in [r[1] for r in c.execute(f"PRAGMA table_info({table})")]:
        c.execute(f"ALTER TABLE {table} ADD COLUMN {col} {decl}")

def init_db():
    with db() as c:
        c.execute("PRAGMA journal_mode=WAL")
        c.executescript("""
        CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
          pw_hash TEXT NOT NULL, salt TEXT NOT NULL, ui_lang TEXT DEFAULT 'en', explain_lang TEXT DEFAULT 'auto',
          level TEXT DEFAULT 'undergraduate', created REAL);
        CREATE TABLE IF NOT EXISTS conversations(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title TEXT, created REAL);
        CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY, conv_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
          role TEXT NOT NULL, content TEXT NOT NULL, mode TEXT, created REAL);
        CREATE TABLE IF NOT EXISTS goals(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title TEXT NOT NULL, subject TEXT, mastery INTEGER DEFAULT 0, done INTEGER DEFAULT 0, created REAL);
        CREATE TABLE IF NOT EXISTS rooms(id INTEGER PRIMARY KEY, code TEXT UNIQUE NOT NULL, host_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          title TEXT, topic TEXT, lang TEXT, rounds TEXT, difficulty TEXT, teams INTEGER, prep_min INTEGER, compete_min INTEGER, quiz_n INTEGER,
          phase TEXT DEFAULT 'lobby', phase_started REAL, phase_ends REAL, content TEXT, created REAL);
        CREATE TABLE IF NOT EXISTS room_members(room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, team INTEGER, joined REAL, last_seen REAL, PRIMARY KEY(room_id, user_id));
        CREATE TABLE IF NOT EXISTS room_msgs(id INTEGER PRIMARY KEY, room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
          team INTEGER, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, kind TEXT, anon INTEGER DEFAULT 0, content TEXT, meta TEXT, phase TEXT, created REAL);
        CREATE TABLE IF NOT EXISTS room_subs(id INTEGER PRIMARY KEY, room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
          team INTEGER, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, round TEXT, item TEXT, answer TEXT,
          score REAL DEFAULT 0, max REAL DEFAULT 0, status TEXT DEFAULT 'done', feedback TEXT, created REAL);
        CREATE TABLE IF NOT EXISTS room_notes(room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE, team INTEGER,
          status TEXT, text TEXT, meta TEXT, PRIMARY KEY(room_id, team));
        CREATE INDEX IF NOT EXISTS ix_room_msgs ON room_msgs(room_id, id);
        CREATE TABLE IF NOT EXISTS room_docs(id INTEGER PRIMARY KEY, room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
          chunk TEXT NOT NULL, vec TEXT);
        """)
        _add_column(c, "users", "style", "TEXT DEFAULT ''")
        _add_column(c, "users", "diag_done", "INTEGER DEFAULT 0")
        _add_column(c, "messages", "meta", "TEXT")
init_db()
llm.init(DB_PATH)

def hash_pw(pw, salt):
    return hashlib.pbkdf2_hmac("sha256", pw.encode(), bytes.fromhex(salt), 240_000).hex()

def make_token(uid):
    body = base64.urlsafe_b64encode(json.dumps({"uid": uid, "exp": time.time() + TOKEN_TTL}).encode()).decode()
    sig = hmac.new(SECRET.encode(), body.encode(), hashlib.sha256).hexdigest()
    return f"{body}.{sig}"

def current_user(authorization: str = Header(default="")):
    try:
        body, sig = authorization.removeprefix("Bearer ").split(".")
        good = hmac.new(SECRET.encode(), body.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, good):
            raise ValueError
        data = json.loads(base64.urlsafe_b64decode(body))
        if data["exp"] < time.time():
            raise ValueError
    except Exception:
        raise HTTPException(401, "Please sign in again.")
    with db() as c:
        u = c.execute("SELECT * FROM users WHERE id=?", (data["uid"],)).fetchone()
    if not u:
        raise HTTPException(401, "Please sign in again.")
    return dict(u)

def public(u):
    return {"id": u["id"], "username": u["email"], "name": u["name"], "ui_lang": u["ui_lang"], "explain_lang": u["explain_lang"],
            "level": u["level"], "style": [s for s in (u.get("style") or "").split(",") if s], "diag_done": bool(u.get("diag_done"))}

_attempts = {}
def throttle(key):
    now = time.time()
    hits = [t for t in _attempts.get(key, []) if now - t < 300]
    if len(hits) >= 8:
        raise HTTPException(429, "Too many attempts. Wait a few minutes and try again.")
    _attempts[key] = hits + [now]

_ai_hits = {}
def ai_budget(uid):
    now = time.time()
    hits = [t for t in _ai_hits.get(uid, []) if now - t < 60]
    if len(hits) >= AI_PER_MIN:
        raise HTTPException(429, "You're asking very fast. Wait a few seconds so the shared AI quota lasts for everyone.")
    _ai_hits[uid] = hits + [now]

USERNAME = re.compile(r"^[A-Za-z0-9_.\-]{3,30}$")

class Register(BaseModel):
    username: str = Field(min_length=3, max_length=30)
    password: str = Field(min_length=8, max_length=200)
    nickname: str = Field(default="", max_length=40)
    ui_lang: str = Field(default="en", pattern="^(en|fr|ar)$")

@app.post("/api/auth/register")
def register(b: Register):
    username = b.username.strip().lower()
    if not USERNAME.match(username):
        raise HTTPException(422, "Usernames use 3-30 letters, digits, dots, dashes or underscores.")
    salt = secrets.token_hex(16)
    try:
        with db() as c:
            uid = c.execute("INSERT INTO users(email,name,pw_hash,salt,ui_lang,created) VALUES(?,?,?,?,?,?)",
                            (username, b.nickname.strip() or username, hash_pw(b.password, salt), salt, b.ui_lang, time.time())).lastrowid
    except sqlite3.IntegrityError:
        raise HTTPException(409, "That username is taken. Try another one.")
    with db() as c:
        u = dict(c.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone())
    return {"token": make_token(uid), "user": public(u)}

class LoginCred(BaseModel):
    username: str = Field(default="", max_length=200)
    email: str = Field(default="", max_length=200)
    password: str = Field(min_length=1, max_length=200)

@app.post("/api/auth/login")
def login(b: LoginCred):
    key = (b.username or b.email).strip().lower()
    throttle(key)
    with db() as c:
        u = c.execute("SELECT * FROM users WHERE email=?", (key,)).fetchone()
    if not u or not hmac.compare_digest(hash_pw(b.password, u["salt"]), u["pw_hash"]):
        raise HTTPException(401, "Username or password is incorrect.")
    _attempts.pop(key, None)
    return {"token": make_token(u["id"]), "user": public(dict(u))}

class Profile(BaseModel):
    name: Optional[str] = Field(default=None, max_length=40)
    ui_lang: Optional[str] = Field(default=None, pattern="^(en|fr|ar)$")
    explain_lang: Optional[str] = Field(default=None, max_length=40)
    level: Optional[str] = Field(default=None, max_length=40)

@app.get("/api/me")
def me(u=Depends(current_user)):
    return public(u)

@app.patch("/api/me")
def update_me(p: Profile, u=Depends(current_user)):
    changes = {k: v for k, v in p.model_dump().items() if v is not None}
    if changes:
        with db() as c:
            c.execute(f"UPDATE users SET {','.join(k + '=?' for k in changes)} WHERE id=?", (*changes.values(), u["id"]))
    with db() as c:
        return public(dict(c.execute("SELECT * FROM users WHERE id=?", (u["id"],)).fetchone()))

@app.delete("/api/me")
def delete_me(u=Depends(current_user)):
    with db() as c:
        c.execute("DELETE FROM users WHERE id=?", (u["id"],))
    return {"ok": True}

@app.get("/api/health")
async def health():
    return {"ok": True, "ai_configured": llm.configured(), "ai": {**llm.health(), "models_check": await llm.list_models()}}


@app.get("/api/ai/metrics")
def ai_metrics(u=Depends(current_user)):
    return llm.metrics()

class Diagnostic(BaseModel):
    choices: List[str] = Field(default_factory=list, max_length=10)
    exercise_correct: Optional[bool] = None
    text: str = Field(default="", max_length=500)

@app.post("/api/diagnostic")
async def diagnostic(d: Diagnostic, u=Depends(current_user)):
    score = {s: 0.0 for s in C.STYLES}
    for ch in d.choices:
        if ch in score: score[ch] += 1
    source = "answers"
    if d.text.strip():
        style = None
        if llm.configured():
            try:
                ai_budget(u["id"])
                data, _ = await llm.complete_json("fast", C.diagnostic_prompt(), llm.scrub(d.text.strip()), max_tokens=60,
                                                  validate=lambda x: x["style"] in C.STYLES)
                style, source = data["style"], "ai"
            except (llm.Unavailable, ValueError, KeyError, TypeError, AssertionError, HTTPException):
                style = None
        if not style:
            style = C.diag_free_text_heuristic(d.text)
            if style: source = "heuristic"
        if style: score[style] += 2
    if d.exercise_correct is False:
        score["steps"] += 0.5; score["examples"] += 0.5
    top = [s for s, v in sorted(score.items(), key=lambda kv: -kv[1]) if v > 0][:2] or ["examples", "steps"]
    with db() as c:
        c.execute("UPDATE users SET style=?, diag_done=1 WHERE id=?", (",".join(top), u["id"]))
        user = public(dict(c.execute("SELECT * FROM users WHERE id=?", (u["id"],)).fetchone()))
    return {"style": top, "source": source, "user": user}

MODES = {
    "auto": "Choose the teaching approach that fits the student's message (and their learning style).",
    "simple": "Explain it simply, in plain language, with minimal jargon.",
    "steps": "Teach step by step. Number the steps and check understanding between major steps.",
    "intuition": "Build an intuitive explanation first; formalism only afterwards.",
    "analogy": "Use a concrete real-world analogy, then say where the analogy breaks down.",
    "rigorous": "Explain the theory rigorously, with precise definitions and justification.",
    "example": "Show a fully worked example, narrating the reasoning at each move.",
    "quiz": "Test the student's understanding with one question at a time. Wait for their answer before continuing.",
    "discover": "Do not give the answer directly. Guide with questions and hints so the student finds it themselves.",
    "mistakes": "Find and explain the student's mistakes: what went wrong, why, and how to avoid it.",
    "compare": "Compare the different approaches, with trade-offs and when to use each.",
    "summary": "Give a concise summary with the key points only, as revision notes.",
}

def lang_rule(u):
    lang = u["explain_lang"]
    if lang == "auto":
        return ("Reply in the language of the student's latest message (Arabic, Tunisian Darija, French or English). If they mix "
                "languages, pick the one that best serves their meaning. Follow explicit language requests. Don't claim perfect dialect fluency.")
    return f"Explain in {lang} unless the student explicitly asks otherwise. Keep standard technical terms recognizable."

OFFLINE = {
    "en": "**Offline mode: the AI service isn't configured**, so this isn't a real tutor reply. Set LLM_BASE_URL, LLM_API_KEY, COMPACT_MODEL and MIDSIZE_MODEL in backend/.env and restart.\n\nMeanwhile, a way to study \"{q}\":\n1. Write what you already know in two sentences.\n2. Name the one part that confuses you.\n3. Explain it aloud to a teammate.",
    "fr": "**Mode hors ligne : le service d'IA n'est pas configuré**, ceci n'est donc pas une vraie réponse. Renseignez LLM_BASE_URL, LLM_API_KEY, COMPACT_MODEL et MIDSIZE_MODEL dans backend/.env puis redémarrez.\n\nEn attendant, pour étudier « {q} » :\n1. Écrivez ce que vous savez en deux phrases.\n2. Identifiez ce qui vous bloque.\n3. Expliquez-le à voix haute à un coéquipier.",
    "ar": "**وضع غير متصل: خدمة الذكاء الاصطناعي غير مُعدّة**، لذلك هذا ليس ردّاً حقيقياً. اضبط LLM_BASE_URL وLLM_API_KEY وCOMPACT_MODEL وMIDSIZE_MODEL في backend/.env ثم أعد التشغيل.\n\nفي الأثناء، لدراسة «{q}»:\n1. اكتب ما تعرفه في جملتين.\n2. حدّد الجزء الذي يربكك.\n3. اشرحه بصوت عالٍ لزميل.",
}

def friendly_unavailable(e, lang="en"):
    msg = {"en": "Pingo couldn't get an answer: the AI service is busy or unavailable right now (we retried and also tried the quick model). Your question wasn't saved twice — try again in a moment.",
           "fr": "Pingo n'a pas pu obtenir de réponse : le service d'IA est occupé ou indisponible (nous avons réessayé, aussi avec le modèle rapide). Réessayez dans un instant.",
           "ar": "لم يتمكّن بينغو من الحصول على جواب: خدمة الذكاء الاصطناعي مشغولة أو غير متاحة الآن (أعدنا المحاولة وجرّبنا النموذج السريع أيضاً). حاول بعد لحظات."}
    return msg.get(lang, msg["en"]) + (f" ({e})" if str(e) else "")

def clean_history(history):
    out = []
    for m in history:
        if not (m["content"] or "").strip():
            continue
        if not out and m["role"] != "user":
            continue
        if out and out[-1]["role"] == m["role"]:
            out[-1] = {"role": m["role"], "content": out[-1]["content"] + "\n\n" + m["content"]}
        else:
            out.append({"role": m["role"], "content": m["content"]})
    return out

def own_conv(c, cid, uid):
    row = c.execute("SELECT * FROM conversations WHERE id=? AND user_id=?", (cid, uid)).fetchone()
    if not row:
        raise HTTPException(404, "Conversation not found.")
    return row

@app.get("/api/conversations")
def list_convs(u=Depends(current_user)):
    with db() as c:
        return [dict(r) for r in c.execute(
            "SELECT c.id, c.title, c.created, COALESCE((SELECT MAX(m.created) FROM messages m WHERE m.conv_id=c.id), c.created) AS active "
            "FROM conversations c WHERE c.user_id=? ORDER BY active DESC", (u["id"],))]

@app.post("/api/conversations")
def new_conv(u=Depends(current_user)):
    with db() as c:
        cur = c.execute("INSERT INTO conversations(user_id,title,created) VALUES(?,?,?)", (u["id"], "New conversation", time.time()))
        return {"id": cur.lastrowid, "title": "New conversation"}

@app.get("/api/conversations/{cid}")
def get_conv(cid: int, u=Depends(current_user)):
    with db() as c:
        own_conv(c, cid, u["id"])
        rows = [dict(r) for r in c.execute("SELECT id,role,content,mode,meta FROM messages WHERE conv_id=? ORDER BY id", (cid,))]
    for r in rows:
        r["meta"] = json.loads(r["meta"]) if r["meta"] else None
    return rows

@app.delete("/api/conversations/{cid}")
def del_conv(cid: int, u=Depends(current_user)):
    with db() as c:
        own_conv(c, cid, u["id"])
        c.execute("DELETE FROM conversations WHERE id=?", (cid,))
    return {"ok": True}

class Msg(BaseModel):
    content: str = Field(min_length=1, max_length=6000)
    mode: str = "auto"

def record_question(cid, m, u):
    if m.mode not in MODES:
        raise HTTPException(422, "Unknown teaching approach.")
    with db() as c:
        conv = own_conv(c, cid, u["id"])
        mid = c.execute("INSERT INTO messages(conv_id,role,content,mode,created) VALUES(?,?,?,?,?)",
                        (cid, "user", m.content, m.mode, time.time())).lastrowid
        if conv["title"] == "New conversation":
            c.execute("UPDATE conversations SET title=? WHERE id=?", (m.content.strip()[:60], cid))
        rows = c.execute("SELECT role,content FROM messages WHERE conv_id=? ORDER BY id DESC LIMIT 16", (cid,)).fetchall()
    return mid, [dict(r) for r in reversed(rows)]

def drop_question(cid, mid, title_was_new):
    with db() as c:
        c.execute("DELETE FROM messages WHERE id=?", (mid,))
        if title_was_new and not c.execute("SELECT 1 FROM messages WHERE conv_id=?", (cid,)).fetchone():
            c.execute("UPDATE conversations SET title='New conversation' WHERE id=?", (cid,))

def save_reply(cid, text, mode, meta=None):
    with db() as c:
        return c.execute("INSERT INTO messages(conv_id,role,content,mode,meta,created) VALUES(?,?,?,?,?,?)",
                         (cid, "assistant", text, mode, json.dumps(meta) if meta else None, time.time())).lastrowid

def title_is_new(cid, uid):
    with db() as c:
        return own_conv(c, cid, uid)["title"] == "New conversation"

def _line(**kw):
    return json.dumps(kw, ensure_ascii=False) + "\n"

def _ndjson(gen):
    return StreamingResponse(gen, media_type="application/x-ndjson", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

@app.post("/api/conversations/{cid}/stream")
async def send_stream(cid: int, m: Msg, u=Depends(current_user)):
    was_new = title_is_new(cid, u["id"])
    if llm.configured():
        ai_budget(u["id"])
    mid, history = record_question(cid, m, u)
    tier, reasons, confused = C.route(m.content, m.mode, history)

    if not llm.configured():
        text = OFFLINE.get(u["ui_lang"], OFFLINE["en"]).format(q=m.content[:80])
        async def offline():
            rid = save_reply(cid, text, m.mode, {"tier": "offline"})
            yield _line(t="delta", text=text, whole=True)
            yield _line(t="done", id=rid, live_ai=False, meta={"tier": "offline"})
        return _ndjson(offline())

    job = llm.Job()
    system = C.tutor_system(u, MODES[m.mode], lang_rule(u), confused, tier)
    msgs = [{"role": h["role"], "content": llm.scrub(h["content"])} for h in clean_history(history)]
    task = asyncio.create_task(llm.complete(tier, system, msgs, max_tokens=700 if tier == "fast" else MAX_TOKENS, job=job))

    async def body():
        finished = False
        try:
            yield _line(t="stage", stage="routing", tier=tier, reasons=reasons, confused=confused)
            last = None
            while not task.done():
                snap = job.snapshot()
                if snap != last:
                    yield _line(t="stage", **snap); last = snap
                await asyncio.wait({task}, timeout=0.35)
            try:
                res = task.result()
            except llm.Unavailable as e:
                drop_question(cid, mid, was_new); finished = True
                yield _line(t="error", message=friendly_unavailable(e, u["ui_lang"]))
                return
            meta = {"tier": res["tier"], "cached": res["cached"], "fallback": res["fallback"], "reasons": reasons, "note": job.note}
            rid = save_reply(cid, res["text"], m.mode, meta); finished = True
            yield _line(t="delta", text=res["text"], whole=True)
            yield _line(t="done", id=rid, live_ai=True, meta=meta)
        finally:
            if not finished:
                drop_question(cid, mid, was_new)
    return _ndjson(body())

class Goal(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=120)
    subject: Optional[str] = Field(default=None, max_length=60)
    mastery: Optional[int] = Field(default=None, ge=0, le=100)
    done: Optional[bool] = None

@app.get("/api/goals")
def goals(u=Depends(current_user)):
    with db() as c:
        return [dict(r) for r in c.execute("SELECT id,title,subject,mastery,done FROM goals WHERE user_id=? ORDER BY done,id DESC", (u["id"],))]

@app.post("/api/goals")
def add_goal(g: Goal, u=Depends(current_user)):
    if not g.title:
        raise HTTPException(422, "Give the goal a title.")
    with db() as c:
        cur = c.execute("INSERT INTO goals(user_id,title,subject,created) VALUES(?,?,?,?)", (u["id"], g.title, g.subject or "", time.time()))
        return {"id": cur.lastrowid, "title": g.title, "subject": g.subject or "", "mastery": 0, "done": 0}

@app.patch("/api/goals/{gid}")
def edit_goal(gid: int, g: Goal, u=Depends(current_user)):
    ch = {k: (int(v) if k == "done" else v) for k, v in g.model_dump().items() if v is not None}
    with db() as c:
        if not c.execute("SELECT 1 FROM goals WHERE id=? AND user_id=?", (gid, u["id"])).fetchone():
            raise HTTPException(404, "Goal not found.")
        if ch:
            c.execute(f"UPDATE goals SET {','.join(k + '=?' for k in ch)} WHERE id=?", (*ch.values(), gid))
    return {"ok": True}

@app.delete("/api/goals/{gid}")
def del_goal(gid: int, u=Depends(current_user)):
    with db() as c:
        c.execute("DELETE FROM goals WHERE id=? AND user_id=?", (gid, u["id"]))
    return {"ok": True}

@app.get("/api/stats")
def stats(u=Depends(current_user)):
    since = time.time() - 120 * 86400
    with db() as c:
        q = c.execute("SELECT COUNT(*) FROM messages m JOIN conversations c ON c.id=m.conv_id WHERE c.user_id=? AND m.role='user'", (u["id"],)).fetchone()[0]
        done = c.execute("SELECT COUNT(*) FROM goals WHERE user_id=? AND done=1", (u["id"],)).fetchone()[0]
        hack = c.execute("SELECT COALESCE(SUM(score),0) FROM room_subs WHERE user_id=?", (u["id"],)).fetchone()[0]
        act = [r[0] for r in c.execute(
            "SELECT m.created FROM messages m JOIN conversations c ON c.id=m.conv_id WHERE c.user_id=? AND m.role='user' AND m.created>? "
            "UNION ALL SELECT created FROM room_msgs WHERE user_id=? AND created>? ORDER BY 1 DESC LIMIT 3000", (u["id"], since, u["id"], since))]
    return {"questions": q, "goals_done": done, "hackathon_points": hack, "xp": q * 10 + done * 50 + int(hack // 10), "activity": act}

ROUNDS = ("quiz", "coding", "open")
PHASES = ("lobby", "prep", "compete", "results")
TEAM_CAP = 3
OPEN_POINTS, QUIZ_POINTS = 300, 100
ROOM_JOBS, TEAM_JOBS, TEAM_LOCKS, NUDGED = {}, {}, {}, {}
_bg = set()

def spawn(coro):
    t = asyncio.create_task(coro); _bg.add(t); t.add_done_callback(_bg.discard)

class RoomIn(BaseModel):
    title: str = Field(min_length=1, max_length=80)
    topic: str = Field(min_length=2, max_length=160)
    lang: str = Field(default="en", pattern="^(en|fr|ar)$")
    rounds: List[str] = Field(default_factory=lambda: ["quiz"])
    difficulty: str = Field(default="undergraduate", pattern="^(secondary|undergraduate|graduate)$")
    teams: int = Field(default=2, ge=1, le=6)
    prep_min: int = Field(default=15, ge=1, le=240)
    compete_min: int = Field(default=20, ge=1, le=240)
    quiz_n: int = Field(default=6, ge=3, le=12)
    material: str = Field(default="", max_length=60000)

def _code():
    return "".join(random.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(6))

def room_by_code(c, code):
    r = c.execute("SELECT * FROM rooms WHERE code=?", (code.strip().upper(),)).fetchone()
    if not r:
        raise HTTPException(404, "No hackathon with that code.")
    return dict(r)

def membership(c, r, uid):
    m = c.execute("SELECT * FROM room_members WHERE room_id=? AND user_id=?", (r["id"], uid)).fetchone()
    if not m:
        raise HTTPException(403, "Join this hackathon with its code first.")
    return dict(m)

def team_sizes(c, r):
    sizes = {t: 0 for t in range(1, r["teams"] + 1)}
    for row in c.execute("SELECT team, COUNT(*) n FROM room_members WHERE room_id=? GROUP BY team", (r["id"],)):
        if row["team"] in sizes: sizes[row["team"]] = row["n"]
    return sizes

def post_msg(c, rid, team, user_id, kind, text, phase, anon=0, meta=None):
    return c.execute("INSERT INTO room_msgs(room_id,team,user_id,kind,anon,content,meta,phase,created) VALUES(?,?,?,?,?,?,?,?,?)",
                     (rid, team, user_id, kind, anon, text, json.dumps(meta) if meta else None, phase, time.time())).lastrowid

def room_content(r):
    try:
        return json.loads(r["content"] or "{}")
    except ValueError:
        return {}

def save_content(rid, data):
    with db() as c:
        c.execute("UPDATE rooms SET content=? WHERE id=?", (json.dumps(data, ensure_ascii=False), rid))

async def index_material(rid, text):
    chunks = C.chunk_text(text)
    vecs = None
    if chunks and llm.configured() and llm.EMBED_MODEL:
        try:
            vecs = await llm.embed([llm.scrub(c) for c in chunks])
        except llm.Unavailable:
            vecs = None
    with db() as c:
        c.executemany("INSERT INTO room_docs(room_id,chunk,vec) VALUES(?,?,?)",
                      [(rid, ch, json.dumps(vecs[i]) if vecs else None) for i, ch in enumerate(chunks)])
    return len(chunks), "vector" if vecs else "keyword"

async def retrieve(rid, query, k=3):
    with db() as c:
        rows = c.execute("SELECT chunk, vec FROM room_docs WHERE room_id=? ORDER BY id", (rid,)).fetchall()
    if not rows:
        return []
    chunks = [r["chunk"] for r in rows]
    if all(r["vec"] for r in rows) and llm.EMBED_MODEL:
        try:
            q = (await llm.embed([llm.scrub(query)[:2000]]))[0]
            ranked = sorted(((llm.cosine(q, json.loads(r["vec"])), r["chunk"]) for r in rows), key=lambda x: -x[0])
            return [ch for _, ch in ranked[:k]]
        except llm.Unavailable:
            pass
    return C.keyword_rank(query, chunks, k)

async def generate_room_content(rid):
    with db() as c:
        r = dict(c.execute("SELECT * FROM rooms WHERE id=?", (rid,)).fetchone())
    rounds = json.loads(r["rounds"])
    data, meta, material = None, {}, None
    content0 = room_content(r)
    digest = ""
    if content0.get("material_text"):
        job = llm.Job(); ROOM_JOBS[rid] = job; job.stage = "indexing"
        n, mode = await index_material(rid, content0["material_text"])
        material = {"chunks": n, "search": mode}
        top = await retrieve(rid, r["topic"], 8)
        if top and llm.configured():
            try:
                res = await llm.complete("fast", C.narrow_prompt(r["topic"], r["lang"]),
                                         [{"role": "user", "content": llm.scrub("\n---\n".join(top))[:9000]}],
                                         max_tokens=450, job=job, patience="background")
                digest = res["text"]
            except llm.Unavailable:
                digest = ""
        if not digest:
            digest = "\n".join(top[:4])[:2500]
    if llm.configured():
        job = ROOM_JOBS.get(rid) or llm.Job(); ROOM_JOBS[rid] = job
        system, user = C.room_content_prompt(r["topic"], r["lang"], r["difficulty"], r["quiz_n"], rounds, digest)
        try:
            data, res = await llm.complete_json("large", system, user, max_tokens=3000, job=job, patience="background",
                                                validate=lambda d: C.validate_room_content(d, rounds))
            meta = {"tier": res["tier"], "cached": res["cached"], "fallback": res["fallback"]}
        except (llm.Unavailable, ValueError, KeyError, TypeError, AssertionError) as e:
            data, meta = None, {"error": str(e)[:200]}
        finally:
            ROOM_JOBS.pop(rid, None)
    if not data:
        data = C.offline_content(r["topic"], rounds)
    if "quiz" in data:
        data["quiz"] = [{**q, "answer": int(q["answer"])} for q in data["quiz"]][: r["quiz_n"]]
    if "coding" in rounds:
        data["coding"] = C.coding_set(r["difficulty"])
    ROOM_JOBS.pop(rid, None)
    data["meta"] = meta; data["status"] = "ready"
    if material:
        data["material"] = material
    save_content(rid, data)

@app.post("/api/rooms")
async def create_room(b: RoomIn, u=Depends(current_user)):
    rounds = [x for x in ROUNDS if x in b.rounds]
    if not rounds:
        raise HTTPException(422, "Pick at least one competition round.")
    with db() as c:
        for _ in range(8):
            code = _code()
            if not c.execute("SELECT 1 FROM rooms WHERE code=?", (code,)).fetchone():
                break
        rid = c.execute("INSERT INTO rooms(code,host_id,title,topic,lang,rounds,difficulty,teams,prep_min,compete_min,quiz_n,phase,content,created) "
                        "VALUES(?,?,?,?,?,?,?,?,?,?,?,'lobby',?,?)",
                        (code, u["id"], b.title.strip(), b.topic.strip(), b.lang, json.dumps(rounds), b.difficulty, b.teams,
                         b.prep_min, b.compete_min, b.quiz_n,
                         json.dumps({"status": "generating", "material_text": b.material.strip()} if b.material.strip() else {"status": "generating"}),
                         time.time())).lastrowid
        c.execute("INSERT INTO room_members(room_id,user_id,team,joined,last_seen) VALUES(?,?,1,?,?)", (rid, u["id"], time.time(), time.time()))
    spawn(generate_room_content(rid))
    return {"code": code}

class JoinIn(BaseModel):
    code: str = Field(min_length=4, max_length=12)

@app.post("/api/rooms/join")
def join_room(b: JoinIn, u=Depends(current_user)):
    with db() as c:
        r = room_by_code(c, b.code)
        if c.execute("SELECT 1 FROM room_members WHERE room_id=? AND user_id=?", (r["id"], u["id"])).fetchone():
            return {"code": r["code"]}
        sizes = team_sizes(c, r)
        team = min(sizes, key=lambda t: (sizes[t], t))
        if sizes[team] >= TEAM_CAP:
            raise HTTPException(409, "Every team is full (3 people each).")
        c.execute("INSERT INTO room_members(room_id,user_id,team,joined,last_seen) VALUES(?,?,?,?,?)", (r["id"], u["id"], team, time.time(), time.time()))
    return {"code": r["code"]}

@app.get("/api/rooms")
def my_rooms(u=Depends(current_user)):
    with db() as c:
        return [dict(x) for x in c.execute(
            "SELECT r.code, r.title, r.topic, r.phase, r.created, r.host_id=? AS host FROM rooms r JOIN room_members m ON m.room_id=r.id "
            "WHERE m.user_id=? ORDER BY r.created DESC LIMIT 20", (u["id"], u["id"]))]

def _advance(c, r, to):
    now = time.time()
    ends = now + r["prep_min"] * 60 if to == "prep" else now + r["compete_min"] * 60 if to == "compete" else None
    c.execute("UPDATE rooms SET phase=?, phase_started=?, phase_ends=? WHERE id=?", (to, now, ends, r["id"]))
    teams = [t for t, n in team_sizes(c, r).items() if n]
    for t in teams:
        if to == "prep": post_msg(c, r["id"], t, None, "system", C.nudge("welcome", r["lang"], team=t), to)
        if to == "compete": post_msg(c, r["id"], t, None, "system", C.nudge("compete", r["lang"], team=t), to)
    if to == "results":
        for t in teams:
            c.execute("INSERT OR REPLACE INTO room_notes(room_id,team,status) VALUES(?,?,'writing')", (r["id"], t))
        spawn(generate_notes(r["id"], teams))
    r.update(phase=to, phase_started=now, phase_ends=ends)

class PhaseIn(BaseModel):
    phase: str = Field(pattern="^(prep|compete|results)$")

@app.post("/api/rooms/{code}/phase")
async def set_phase(code: str, b: PhaseIn, u=Depends(current_user)):
    with db() as c:
        r = room_by_code(c, code)
        if r["host_id"] != u["id"]:
            raise HTTPException(403, "Only the host can move the hackathon forward.")
        if PHASES.index(b.phase) <= PHASES.index(r["phase"]):
            raise HTTPException(409, "That phase has already started.")
        _advance(c, r, b.phase)
    return {"ok": True}

class TeamIn(BaseModel):
    team: int = Field(ge=1, le=6)

@app.post("/api/rooms/{code}/team")
def switch_team(code: str, b: TeamIn, u=Depends(current_user)):
    with db() as c:
        r = room_by_code(c, code); membership(c, r, u["id"])
        if r["phase"] != "lobby":
            raise HTTPException(409, "Teams are locked once preparation starts.")
        if b.team > r["teams"]:
            raise HTTPException(422, "No such team.")
        if team_sizes(c, r)[b.team] >= TEAM_CAP:
            raise HTTPException(409, "That team is full (3 people).")
        c.execute("UPDATE room_members SET team=? WHERE room_id=? AND user_id=?", (b.team, r["id"], u["id"]))
    return {"ok": True}

def _members(c, r):
    rows = c.execute("SELECT m.user_id, m.team, m.last_seen, u.name, u.style FROM room_members m JOIN users u ON u.id=m.user_id "
                     "WHERE m.room_id=? ORDER BY m.joined", (r["id"],)).fetchall()
    counts = {row["user_id"]: row["n"] for row in c.execute(
        "SELECT user_id, COUNT(*) n FROM room_msgs WHERE room_id=? AND kind='chat' GROUP BY user_id", (r["id"],))}
    asks = {row["user_id"]: row["n"] for row in c.execute(
        "SELECT user_id, COUNT(*) n FROM room_msgs WHERE room_id=? AND kind='chat' AND meta LIKE '%\"ai\": \"ask\"%' GROUP BY user_id", (r["id"],))}
    now = time.time()
    return [{"id": x["user_id"], "name": x["name"], "team": x["team"], "online": now - (x["last_seen"] or 0) < 20,
             "host": x["user_id"] == r["host_id"], "style": [s for s in (x["style"] or "").split(",") if s],
             "messages": counts.get(x["user_id"], 0), "asked_ai": asks.get(x["user_id"], 0)} for x in rows]

def _scoreboard(c, r):
    totals = {t: {"team": t, "score": 0, "quiz": 0, "coding": 0, "open": 0} for t in range(1, r["teams"] + 1)}
    for row in c.execute("SELECT team, round, SUM(score) s FROM room_subs WHERE room_id=? AND status='done' GROUP BY team, round", (r["id"],)):
        if row["team"] in totals:
            totals[row["team"]][row["round"]] = round(row["s"] or 0)
            totals[row["team"]]["score"] += round(row["s"] or 0)
    return sorted(totals.values(), key=lambda x: -x["score"])

@app.get("/api/rooms/{code}")
async def room_state(code: str, since: int = 0, u=Depends(current_user)):
    with db() as c:
        r = room_by_code(c, code)
        me = membership(c, r, u["id"])
        if r["phase"] in ("prep", "compete") and r["phase_ends"] and time.time() > r["phase_ends"]:
            _advance(c, r, "compete" if r["phase"] == "prep" else "results")
        c.execute("UPDATE room_members SET last_seen=? WHERE room_id=? AND user_id=?", (time.time(), r["id"], u["id"]))
        team = me["team"]
        members = _members(c, r)
        names = {m["id"]: m["name"] for m in members}
        msgs = []
        for x in c.execute("SELECT * FROM room_msgs WHERE room_id=? AND id>? AND (team IS NULL OR team=?) ORDER BY id LIMIT 300", (r["id"], since, team)):
            mine = x["user_id"] == u["id"]
            msgs.append({"id": x["id"], "kind": x["kind"], "content": x["content"], "phase": x["phase"], "created": x["created"],
                         "mine": mine, "anon": bool(x["anon"]), "author": None if x["user_id"] is None else (None if x["anon"] and not mine else names.get(x["user_id"], "?")),
                         "meta": json.loads(x["meta"]) if x["meta"] else None})
        subs = {}
        for s in c.execute("SELECT * FROM room_subs WHERE room_id=? AND team=? ORDER BY id", (r["id"], team)):
            subs[f"{s['round']}:{s['item']}"] = {"score": s["score"], "max": s["max"], "status": s["status"], "answer": s["answer"] if s["round"] != "coding" else None,
                                                  "feedback": json.loads(s["feedback"]) if s["feedback"] else None, "by": names.get(s["user_id"])}
        board = _scoreboard(c, r)
        notes = None
        if r["phase"] == "results":
            n = c.execute("SELECT * FROM room_notes WHERE room_id=? AND team=?", (r["id"], team)).fetchone()
            notes = {"status": n["status"], "text": n["text"], "meta": json.loads(n["meta"]) if n["meta"] else None} if n else None
    data = room_content(r)
    rounds = json.loads(r["rounds"])
    content = {"status": data.get("status", "generating"), "offline": data.get("offline", False), "meta": data.get("meta"),
               "material": data.get("material")}
    if r["phase"] != "lobby" or data.get("status") == "ready":
        content["brief"] = data.get("brief")
    if r["phase"] in ("compete", "results"):
        if "quiz" in data:
            content["quiz"] = [{"q": q["q"], "options": q["options"],
                                **({"answer": q["answer"], "explain": q.get("explain", "")} if f"quiz:{i}" in subs or r["phase"] == "results" else {})}
                               for i, q in enumerate(data["quiz"])]
        if "coding" in data:
            content["coding"] = [{k: v for k, v in C.CODING_BY_ID[pid].items()} for pid in data["coding"]]
        if "open" in data:
            content["open"] = data["open"]
    job = ROOM_JOBS.get(r["id"]); ai = TEAM_JOBS.get((r["id"], team))
    return {"code": r["code"], "title": r["title"], "topic": r["topic"], "lang": r["lang"], "rounds": rounds, "difficulty": r["difficulty"],
            "teams": r["teams"], "phase": r["phase"], "phase_ends": r["phase_ends"], "now": time.time(), "prep_min": r["prep_min"],
            "compete_min": r["compete_min"], "is_host": r["host_id"] == u["id"], "my_team": team, "me": u["id"], "members": members,
            "messages": msgs, "subs": subs, "scoreboard": board, "content": content, "notes": notes,
            "generating": job.snapshot() if job else None, "ai_status": ai.snapshot() if ai else None}

class RoomMsgIn(BaseModel):
    content: str = Field(min_length=1, max_length=3000)
    anon: bool = False
    ai: str = Field(default="none", pattern="^(none|ask|check)$")

def facilitate(c, r, team):
    if r["phase"] not in ("prep", "compete"):
        return
    rows = c.execute("SELECT user_id FROM room_msgs WHERE room_id=? AND team=? AND kind='chat' AND anon=0 AND created>=? ORDER BY id DESC LIMIT 10",
                     (r["id"], team, r["phase_started"] or 0)).fetchall()
    if len(rows) < 6:
        return
    now = time.time()
    members = [m for m in _members(c, r) if m["team"] == team]
    counts = {m["id"]: 0 for m in members}
    for x in rows:
        if x["user_id"] in counts: counts[x["user_id"]] += 1
    for m in members:
        key = (r["id"], team, "quiet", m["id"])
        if m["online"] and counts[m["id"]] == 0 and now - NUDGED.get(key, 0) > 180:
            NUDGED[key] = now
            post_msg(c, r["id"], team, None, "nudge", C.nudge("quiet", r["lang"], name=m["name"]), r["phase"]); return
    top = max(counts, key=counts.get) if counts else None
    others = [m["name"] for m in members if m["id"] != top and m["online"]]
    key = (r["id"], team, "dominant", top)
    if top and others and counts[top] / len(rows) >= 0.6 and now - NUDGED.get(key, 0) > 180:
        NUDGED[key] = now
        name = next(m["name"] for m in members if m["id"] == top)
        post_msg(c, r["id"], team, None, "nudge", C.nudge("dominant", r["lang"], name=name, others=", ".join(others)), r["phase"])

async def team_ai(rid, team, kind, trigger_id):
    lock = TEAM_LOCKS.setdefault((rid, team), asyncio.Lock())
    async with lock:
        job = llm.Job(); TEAM_JOBS[(rid, team)] = job
        try:
            with db() as c:
                r = dict(c.execute("SELECT * FROM rooms WHERE id=?", (rid,)).fetchone())
                members = [m for m in _members(c, r) if m["team"] == team]
                names = {m["id"]: m["name"] for m in members}
                trig = c.execute("SELECT * FROM room_msgs WHERE id=?", (trigger_id,)).fetchone()
                hist = list(reversed(c.execute("SELECT * FROM room_msgs WHERE room_id=? AND team=? AND id<=? AND kind IN ('chat','ai') "
                                               "ORDER BY id DESC LIMIT 14", (rid, team, trigger_id)).fetchall()))
            if not llm.configured():
                text, meta = OFFLINE.get(r["lang"], OFFLINE["en"]).format(q=trig["content"][:80]), {"tier": "offline"}
            else:
                excerpts = await retrieve(rid, trig["content"], 3)
                if kind == "check":
                    tier, system = "large", C.check_explanation_system(r["lang"], excerpts)
                    msgs = [{"role": "user", "content": llm.scrub(trig["content"])}]
                else:
                    turns = []
                    for h in hist:
                        if h["kind"] == "ai":
                            turns.append({"role": "assistant", "content": h["content"]})
                        else:
                            who = "Someone (anonymous)" if h["anon"] else names.get(h["user_id"], "Teammate")
                            turns.append({"role": "user", "content": f"{who}: {llm.scrub(h['content'])}"})
                    msgs = clean_history(turns)
                    tier, reasons, confused = C.route(trig["content"], "auto", [{"role": t["role"], "content": t["content"]} for t in turns])
                    system = C.team_chat_system(r["lang"], r["topic"], r["phase"], members, confused, tier, excerpts)
                try:
                    res = await llm.complete(tier, system, msgs, max_tokens=500 if tier == "fast" else 800, job=job)
                    text, meta = res["text"], {"tier": res["tier"], "cached": res["cached"], "fallback": res["fallback"], "note": job.note}
                except llm.Unavailable as e:
                    text, meta = friendly_unavailable(e, r["lang"]), {"tier": "none", "error": True}
            meta["reply_to"] = trigger_id
            with db() as c:
                post_msg(c, rid, team, None, "check" if kind == "check" else "ai", text, r["phase"], meta=meta)
        finally:
            TEAM_JOBS.pop((rid, team), None)

@app.post("/api/rooms/{code}/msg")
async def room_msg(code: str, b: RoomMsgIn, u=Depends(current_user)):
    with db() as c:
        r = room_by_code(c, code); me = membership(c, r, u["id"])
        if r["phase"] not in ("prep", "compete", "results"):
            raise HTTPException(409, "Team chat opens when preparation starts.")
        if b.ai != "none" and llm.configured():
            ai_budget(u["id"])
        mid = post_msg(c, r["id"], me["team"], u["id"], "chat", b.content.strip(), r["phase"], anon=int(b.anon),
                       meta={"ai": b.ai} if b.ai != "none" else None)
        facilitate(c, r, me["team"])
    if b.ai != "none":
        spawn(team_ai(r["id"], me["team"], b.ai, mid))
    return {"id": mid, "queued": (r["id"], me["team"]) in TEAM_JOBS}

def _compete_room(c, code, uid):
    r = room_by_code(c, code); me = membership(c, r, uid)
    if r["phase"] != "compete":
        raise HTTPException(409, "The competition isn't running right now.")
    return r, me, room_content(r)

class QuizIn(BaseModel):
    item: int = Field(ge=0, le=50)
    choice: int = Field(ge=0, le=3)

@app.post("/api/rooms/{code}/quiz")
def answer_quiz(code: str, b: QuizIn, u=Depends(current_user)):
    with db() as c:
        r, me, data = _compete_room(c, code, u["id"])
        quiz = data.get("quiz") or []
        if b.item >= len(quiz):
            raise HTTPException(404, "No such question.")
        q = quiz[b.item]
        prev = c.execute("SELECT * FROM room_subs WHERE room_id=? AND team=? AND round='quiz' AND item=?", (r["id"], me["team"], str(b.item))).fetchone()
        if prev:
            return {"correct": prev["score"] > 0, "answer": q["answer"], "explain": q.get("explain", ""), "already": True}
        correct = b.choice == q["answer"]
        c.execute("INSERT INTO room_subs(room_id,team,user_id,round,item,answer,score,max,created) VALUES(?,?,?,?,?,?,?,?,?)",
                  (r["id"], me["team"], u["id"], "quiz", str(b.item), str(b.choice), QUIZ_POINTS if correct else 0, QUIZ_POINTS, time.time()))
    return {"correct": correct, "answer": q["answer"], "explain": q.get("explain", "")}

class CodeIn(BaseModel):
    item: str = Field(max_length=40)
    lang: str = Field(pattern="^(python|javascript)$")
    code: str = Field(max_length=20000)
    passed: int = Field(ge=0, le=100)
    total: int = Field(ge=1, le=100)

@app.post("/api/rooms/{code}/code")
def submit_code(code: str, b: CodeIn, u=Depends(current_user)):
    with db() as c:
        r, me, data = _compete_room(c, code, u["id"])
        if b.item not in (data.get("coding") or []):
            raise HTTPException(404, "No such problem.")
        p = C.CODING_BY_ID[b.item]
        if b.total != len(p["tests"]) or b.passed > b.total:
            raise HTTPException(422, "Test counts don't match this problem.")
        score = round(p["points"] * b.passed / b.total)
        prev = c.execute("SELECT * FROM room_subs WHERE room_id=? AND team=? AND round='coding' AND item=?", (r["id"], me["team"], b.item)).fetchone()
        fb = json.dumps({"passed": b.passed, "total": b.total, "lang": b.lang})
        if not prev:
            c.execute("INSERT INTO room_subs(room_id,team,user_id,round,item,answer,score,max,feedback,created) VALUES(?,?,?,?,?,?,?,?,?,?)",
                      (r["id"], me["team"], u["id"], "coding", b.item, b.code, score, p["points"], fb, time.time()))
        elif score > prev["score"]:
            c.execute("UPDATE room_subs SET user_id=?, answer=?, score=?, feedback=?, created=? WHERE id=?", (u["id"], b.code, score, fb, time.time(), prev["id"]))
    return {"score": score, "best": max(score, prev["score"] if prev else 0), "max": p["points"]}

class CoachIn(BaseModel):
    item: str = Field(max_length=40)
    code: str = Field(default="", max_length=20000)
    lang: str = Field(default="python", pattern="^(python|javascript)$")

@app.post("/api/rooms/{code}/coach")
async def coding_coach(code: str, b: CoachIn, kind: str = "hint", u=Depends(current_user)):
    with db() as c:
        r, me, data = _compete_room(c, code, u["id"])
    if b.item not in (data.get("coding") or []):
        raise HTTPException(404, "No such problem.")
    if not llm.configured():
        return {"text": "Offline: no AI coach. Re-read the examples and test edge cases (empty input, negatives).", "meta": {"tier": "offline"}}
    ai_budget(u["id"])
    p = C.CODING_BY_ID[b.item]
    task = f"Problem: {p['title']['en']}. {p['text']['en']} Function: {p['fn']}({', '.join(p['params'])})."
    if kind == "review":
        system, msg = C.review_system(r["lang"]), f"{task}\nLanguage: {b.lang}\nCode:\n{b.code[:6000]}"
    else:
        system, msg = C.hint_system(r["lang"]), task
    try:
        res = await llm.complete("fast", system, [{"role": "user", "content": msg}], max_tokens=220)
    except llm.Unavailable as e:
        raise HTTPException(503, friendly_unavailable(e, r["lang"]))
    return {"text": res["text"], "meta": {"tier": res["tier"], "cached": res["cached"]}}

class OpenIn(BaseModel):
    answer: str = Field(min_length=20, max_length=6000)

async def judge_open(rid, sub_id):
    with db() as c:
        r = dict(c.execute("SELECT * FROM rooms WHERE id=?", (rid,)).fetchone())
        s = dict(c.execute("SELECT * FROM room_subs WHERE id=?", (sub_id,)).fetchone())
    problem = room_content(r)["open"]
    fb, meta = None, {}
    if llm.configured():
        job = llm.Job(); TEAM_JOBS[(rid, s["team"])] = job
        system, user = C.judge_prompt(r["lang"], problem, llm.scrub(s["answer"]))
        try:
            fb, res = await llm.complete_json("large", system, user, max_tokens=700, job=job, patience="background",
                                              validate=lambda d: [int(x["score"]) for x in d["scores"]] and d["scores"])
            meta = {"tier": res["tier"], "cached": res["cached"], "fallback": res["fallback"]}
        except (llm.Unavailable, ValueError, KeyError, TypeError) as e:
            fb, meta = None, {"error": str(e)[:160]}
        finally:
            TEAM_JOBS.pop((rid, s["team"]), None)
    if not fb:
        fb = C.offline_judge(problem, s["answer"])
    pct = sum(max(0, min(10, int(x["score"]))) for x in fb["scores"]) / (10 * max(1, len(fb["scores"])))
    fb["meta"] = meta
    with db() as c:
        c.execute("UPDATE room_subs SET score=?, status='done', feedback=? WHERE id=?", (round(OPEN_POINTS * pct), json.dumps(fb, ensure_ascii=False), sub_id))

@app.post("/api/rooms/{code}/open")
async def submit_open(code: str, b: OpenIn, u=Depends(current_user)):
    with db() as c:
        r, me, data = _compete_room(c, code, u["id"])
        if "open" not in data:
            raise HTTPException(404, "This hackathon has no open problem.")
        if c.execute("SELECT 1 FROM room_subs WHERE room_id=? AND team=? AND round='open'", (r["id"], me["team"])).fetchone():
            raise HTTPException(409, "Your team already submitted its answer.")
        if llm.configured():
            ai_budget(u["id"])
        sid = c.execute("INSERT INTO room_subs(room_id,team,user_id,round,item,answer,score,max,status,created) VALUES(?,?,?,?,?,?,?,?,?,?)",
                        (r["id"], me["team"], u["id"], "open", "0", b.answer, 0, OPEN_POINTS, "judging", time.time())).lastrowid
    spawn(judge_open(r["id"], sid))
    return {"ok": True}

async def generate_notes(rid, teams):
    with db() as c:
        r = dict(c.execute("SELECT * FROM rooms WHERE id=?", (rid,)).fetchone())
    data = room_content(r)
    for t in teams:
        with db() as c:
            wrong = []
            for s in c.execute("SELECT item FROM room_subs WHERE room_id=? AND team=? AND round='quiz' AND score=0", (rid, t)):
                q = (data.get("quiz") or [])[int(s["item"])]
                wrong.append(f"{q['q']} (answer: {q['options'][q['answer']]})")
            op = c.execute("SELECT feedback FROM room_subs WHERE room_id=? AND team=? AND round='open'", (rid, t)).fetchone()
            qs = [llm.scrub(x["content"])[:200] for x in c.execute(
                "SELECT content FROM room_msgs WHERE room_id=? AND team=? AND kind='chat' ORDER BY id DESC LIMIT 12", (rid, t))]
        judge_fb = ""
        if op and op["feedback"]:
            f = json.loads(op["feedback"]); judge_fb = f"{f.get('strength', '')} {f.get('improve', '')}"
        text, meta = None, {}
        if llm.configured():
            system, user = C.notes_prompt(r["lang"], r["topic"], data.get("brief") or {}, "; ".join(wrong), judge_fb, " | ".join(qs))
            try:
                res = await llm.complete("large", system, [{"role": "user", "content": user}], max_tokens=900, patience="background")
                text, meta = res["text"], {"tier": res["tier"], "cached": res["cached"], "fallback": res["fallback"]}
            except llm.Unavailable as e:
                meta = {"error": str(e)[:160]}
        if not text:
            kp = "\n".join(f"- {k}" for k in (data.get("brief") or {}).get("key_points", []))
            text = f"## {r['topic']}\n{kp}\n\n" + ("## To review\n" + "\n".join(f"- {w}" for w in wrong) if wrong else "")
            meta.setdefault("tier", "offline")
        with db() as c:
            c.execute("UPDATE room_notes SET status='ready', text=?, meta=? WHERE room_id=? AND team=?", (text, json.dumps(meta), rid, t))
