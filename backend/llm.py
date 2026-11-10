import asyncio, hashlib, json, math, os, re, sqlite3, time
import httpx


def _env(k, d=""):
    return os.environ.get(k, "").strip() or d


BASE_URL = _env("LLM_BASE_URL").rstrip("/")
API_KEY = _env("LLM_API_KEY")
FAST_MODEL = _env("COMPACT_MODEL") or _env("FAST_MODEL")
LARGE_MODEL = _env("MIDSIZE_MODEL") or _env("LARGE_MODEL")
EMBED_MODEL = _env("EMBED_MODEL")
FAST_MODEL = FAST_MODEL or LARGE_MODEL
LARGE_MODEL = LARGE_MODEL or FAST_MODEL
CONCURRENCY = {"fast": int(_env("COMPACT_CONCURRENCY", _env("FAST_CONCURRENCY", "2"))),
               "large": int(_env("MIDSIZE_CONCURRENCY", _env("LARGE_CONCURRENCY", "1")))}
MAX_CONCURRENT = int(_env("LLM_MAX_CONCURRENT", "2"))
TIMEOUT = {"fast": float(_env("COMPACT_TIMEOUT", _env("FAST_TIMEOUT", "60"))),
           "large": float(_env("MIDSIZE_TIMEOUT", _env("LARGE_TIMEOUT", "180"))), "embed": 60.0}
JSON_MODE = _env("LLM_JSON_MODE", "0") == "1"
CIRCUIT_SECONDS = float(_env("MIDSIZE_COOLDOWN", _env("LARGE_COOLDOWN", "60")))
CACHE_DAYS = float(_env("LLM_CACHE_DAYS", "14"))
QUOTA_MAX_WAIT = float(_env("QUOTA_MAX_WAIT", "90"))
LOW_QUOTA = float(_env("LOW_QUOTA_THRESHOLD", "5"))
LOG_DAYS = 30


def configured():
    return bool(BASE_URL and FAST_MODEL)


def models():
    return {"compact": FAST_MODEL or None, "midsize": LARGE_MODEL or None, "embeddings": EMBED_MODEL or None}


class Unavailable(Exception):
    def __init__(self, msg, status=None):
        super().__init__(msg)
        self.status = status


class _Quota(Exception):
    def __init__(self, msg, wait):
        super().__init__(msg)
        self.wait = wait


class _Saturated(Exception):
    def __init__(self, msg, wait=None, status=None):
        super().__init__(msg)
        self.wait = wait
        self.status = status


class _Ceiling(Exception):
    pass


class Job:
    def __init__(self):
        self.stage = "starting"
        self.tier = None
        self.position = 0
        self.retry_in = 0
        self.fallback = False
        self.cached = False
        self.note = ""

    def snapshot(self):
        return {"stage": self.stage, "tier": self.tier, "position": self.position, "retry_in": self.retry_in,
                "fallback": self.fallback, "cached": self.cached, "note": self.note}


QUOTA = {"remaining": None, "limit": None, "reset": None, "updated": 0.0}
_waiting = {"fast": 0, "large": 0}
_sems = {}
_large_down_until = 0.0
_models_cache = {"at": 0.0, "data": None}
_ceiling = {"max_tokens": int(_env("LLM_MAX_TOKENS_CEILING", "0")) or None}
_db_path = None


def _sem(name):
    if name not in _sems:
        size = MAX_CONCURRENT if name == "all" else CONCURRENCY.get(name, 1)
        _sems[name] = asyncio.Semaphore(max(1, size))
    return _sems[name]


def init(db_path):
    global _db_path
    _db_path = db_path
    con = sqlite3.connect(db_path)
    con.executescript("""
    CREATE TABLE IF NOT EXISTS llm_cache(key TEXT PRIMARY KEY, text TEXT NOT NULL, tier TEXT, created REAL);
    CREATE TABLE IF NOT EXISTS llm_calls(id INTEGER PRIMARY KEY, ts REAL, tier TEXT, model TEXT, status INTEGER,
      in_tok INTEGER DEFAULT 0, out_tok INTEGER DEFAULT 0, handled TEXT, ms INTEGER DEFAULT 0);
    CREATE INDEX IF NOT EXISTS ix_llm_calls_ts ON llm_calls(ts);
    """)
    con.execute("DELETE FROM llm_cache WHERE created < ?", (time.time() - CACHE_DAYS * 86400,))
    con.execute("DELETE FROM llm_calls WHERE ts < ?", (time.time() - LOG_DAYS * 86400,))
    con.commit()
    con.close()


def _sql(query, args=(), fetch=False):
    if not _db_path:
        return [] if fetch else None
    con = sqlite3.connect(_db_path, timeout=10)
    try:
        cur = con.execute(query, args)
        rows = cur.fetchall() if fetch else None
        con.commit()
        return rows
    finally:
        con.close()


def _log(tier, model, status, handled, in_tok=0, out_tok=0, ms=0):
    _sql("INSERT INTO llm_calls(ts,tier,model,status,in_tok,out_tok,handled,ms) VALUES(?,?,?,?,?,?,?,?)",
         (time.time(), tier, model, status, in_tok, out_tok, handled, ms))


def MODEL_FOR(tier):
    return LARGE_MODEL if tier == "large" else EMBED_MODEL if tier == "embed" else FAST_MODEL


def _key(tier, system, messages, max_tokens, json_mode):
    raw = json.dumps([tier, MODEL_FOR(tier), system, messages, max_tokens, json_mode], ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(raw.encode()).hexdigest()


def _cache_get(key):
    rows = _sql("SELECT text, tier FROM llm_cache WHERE key=?", (key,), fetch=True)
    return rows[0] if rows else None


def _cache_put(key, text, tier):
    _sql("INSERT OR REPLACE INTO llm_cache(key,text,tier,created) VALUES(?,?,?,?)", (key, text, tier, time.time()))


def _seconds(value):
    if value is None:
        return None
    v = str(value).strip().lower()
    try:
        return float(v)
    except ValueError:
        pass
    total, found = 0.0, False
    for num, unit in re.findall(r"([\d.]+)\s*(ms|h|m|s)", v):
        found = True
        total += float(num) * {"ms": 0.001, "s": 1, "m": 60, "h": 3600}[unit]
    return total if found else None


def _read_quota(headers):
    remaining = limit = reset = None
    for k, v in headers.items():
        kl = k.lower()
        if not re.search(r"ratelimit|rate-limit|quota", kl) or re.search(r"token|parallel|concurren", kl):
            continue
        kl = kl.replace("ratelimit", "").replace("rate-limit", "")
        if "remaining" in kl:
            m = re.match(r"\s*([\d.]+)", v)
            if m:
                n = float(m.group(1))
                remaining = n if remaining is None else min(remaining, n)
        elif "reset" in kl or "refill" in kl:
            reset = _seconds(v)
        elif "limit" in kl:
            m = re.match(r"\s*([\d.]+)", v)
            if m:
                limit = float(m.group(1))
    if remaining is not None:
        QUOTA.update(remaining=remaining, limit=limit, reset=reset, updated=time.time())


def quota_low():
    return QUOTA["remaining"] is not None and time.time() - QUOTA["updated"] < 120 and QUOTA["remaining"] <= LOW_QUOTA


def _detail(r):
    try:
        err = r.json().get("error", {})
        return err.get("message", "") if isinstance(err, dict) else str(err)
    except Exception:
        return r.text[:300]


def _wait_from(r, detail, default):
    w = _seconds(r.headers.get("retry-after"))
    if w is None:
        m = re.search(r"(\d+(?:\.\d+)?)\s*(?:s\b|sec|second)", detail or "", re.I)
        w = float(m.group(1)) if m else None
    return default if w is None else max(0.5, w)


def _headers():
    return {"content-type": "application/json", **({"authorization": "Bearer " + API_KEY} if API_KEY else {})}


async def _post(tier, system, messages, max_tokens, json_mode, temperature):
    model = MODEL_FOR(tier)
    body = {"model": model, "max_tokens": max_tokens, "temperature": temperature,
            "messages": [{"role": "system", "content": system}] + messages}
    if json_mode and JSON_MODE:
        body["response_format"] = {"type": "json_object"}
    t0 = time.time()
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(TIMEOUT[tier], connect=10.0)) as client:
            r = await client.post(BASE_URL + "/chat/completions", headers=_headers(), json=body)
    except httpx.TimeoutException:
        _log(tier, model, 0, "timeout", ms=int((time.time() - t0) * 1000))
        raise _Saturated(f"The {tier} model took too long to answer")
    except httpx.HTTPError as e:
        _log(tier, model, 0, "network", ms=int((time.time() - t0) * 1000))
        raise _Saturated(f"Could not reach the AI service ({type(e).__name__})")
    ms = int((time.time() - t0) * 1000)
    _read_quota(r.headers)
    if r.status_code == 200:
        data = r.json()
        usage = data.get("usage") or {}
        choice = (data.get("choices") or [{}])[0]
        text = (choice.get("message") or {}).get("content") or choice.get("text") or ""
        text = re.sub(r"<think>.*?</think>", "", text, flags=re.S).strip()
        _log(tier, model, 200, "ok", usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0), ms)
        if not text:
            raise _Saturated(f"The {tier} model returned an empty answer")
        return text
    detail = _detail(r)
    if r.status_code == 429:
        _log(tier, model, 429, "quota", ms=ms)
        raise _Quota(f"Team quota exhausted. {detail}".strip(), _wait_from(r, detail, 5.0))
    if r.status_code == 400 and re.search(r"ceiling|max[_ ]?tokens|too (long|large|many)|length|concurren|limit", detail, re.I):
        _log(tier, model, 400, "ceiling", ms=ms)
        raise _Ceiling(detail)
    if r.status_code in (408, 409, 425, 500, 502, 503, 504, 529):
        _log(tier, model, r.status_code, "saturated", ms=ms)
        raise _Saturated(f"The {tier} model is saturated ({r.status_code}). {detail}".strip(), _wait_from(r, detail, None), r.status_code)
    _log(tier, model, r.status_code, "error", ms=ms)
    hint = {401: " Check LLM_API_KEY.", 403: " Check LLM_API_KEY.", 404: f" Check the {tier} model name."}.get(r.status_code, "")
    raise Unavailable(f"AI service error {r.status_code}: {detail}.{hint}", r.status_code)


def _fix_ceiling(detail, max_tokens):
    if re.search(r"concurren", detail, re.I):
        return max_tokens, 2.0
    nums = [int(n) for n in re.findall(r"\b(\d{2,6})\b", detail) if 16 <= int(n) < max_tokens]
    return (max(nums) if nums else max(64, max_tokens // 2)), 0.0


async def _call(tier, system, messages, max_tokens, json_mode, temperature, job, patience):
    _waiting[tier] += 1
    job.stage, job.tier, job.position = "queued", tier, _waiting[tier]
    try:
        await _sem(tier).acquire()
        await _sem("all").acquire()
    except BaseException:
        _waiting[tier] -= 1
        raise
    _waiting[tier] -= 1
    try:
        job.stage, job.position = "running", 0
        if _ceiling["max_tokens"]:
            max_tokens = min(max_tokens, _ceiling["max_tokens"])
        attempts, quota_waited, fixed = 0, 0.0, False
        while True:
            if patience == "background" and quota_low():
                pause = min(15.0, QUOTA["reset"] or 3.0)
                job.stage, job.retry_in = "pacing", round(pause)
                await asyncio.sleep(pause)
                job.stage, job.retry_in = "running", 0
            try:
                return await _post(tier, system, messages, max_tokens, json_mode, temperature)
            except _Quota as e:
                if quota_waited + e.wait > QUOTA_MAX_WAIT:
                    _log(tier, MODEL_FOR(tier), 429, "quota_gave_up")
                    raise Unavailable(f"The team's AI quota is exhausted; it refills in about {round(e.wait)} s.", 429)
                job.stage, job.retry_in = "quota_wait", round(e.wait)
                await asyncio.sleep(e.wait)
                quota_waited += e.wait
                _log(tier, MODEL_FOR(tier), 429, "quota_waited")
                job.stage, job.retry_in = "running", 0
            except _Ceiling as e:
                if fixed:
                    raise Unavailable(f"Request rejected by a service ceiling: {e}", 400)
                max_tokens, pause = _fix_ceiling(str(e), max_tokens)
                if not pause:
                    _ceiling["max_tokens"] = max_tokens
                fixed = True
                job.note = "ceiling_fixed"
                _log(tier, MODEL_FOR(tier), 400, "ceiling_fixed")
                if pause:
                    await asyncio.sleep(pause)
            except _Saturated as e:
                limit = 1 if patience == "interactive" else 4
                wait = e.wait if e.wait is not None else 1.5 * 2 ** attempts
                if attempts >= limit or (patience == "interactive" and wait > 4):
                    raise Unavailable(str(e), e.status or 503)
                attempts += 1
                job.stage, job.retry_in = "retrying", round(wait)
                _log(tier, MODEL_FOR(tier), e.status or 0, "retried")
                await asyncio.sleep(min(wait, 30.0))
                job.stage, job.retry_in = "running", 0
    finally:
        _sem("all").release()
        _sem(tier).release()


async def complete(tier, system, messages, *, max_tokens=900, json_mode=False, temperature=0.4, job=None, cache=True, patience="interactive"):
    global _large_down_until
    job = job or Job()
    tier = "large" if tier == "large" else "fast"
    key = _key(tier, system, messages, max_tokens, json_mode)
    if cache:
        hit = _cache_get(key)
        if hit:
            _log(hit[1], MODEL_FOR(hit[1]), 0, "cache")
            job.stage, job.tier, job.cached = "done", hit[1], True
            return {"text": hit[0], "tier": hit[1], "cached": True, "fallback": False}
    order = [tier]
    if tier == "large" and FAST_MODEL != LARGE_MODEL:
        if time.time() < _large_down_until:
            order, job.fallback, job.note = ["fast"], True, "midsize_cooling_down"
        elif patience == "interactive" and quota_low():
            order, job.fallback, job.note = ["fast"], True, "quota_low"
            _log("large", LARGE_MODEL, 0, "downgraded")
        else:
            order = ["large", "fast"]
    last = None
    for t in order:
        if t != tier and not job.fallback:
            job.fallback, job.note = True, "midsize_saturated"
            _log("large", LARGE_MODEL, 503, "fell_back")
        if job.fallback:
            job.stage = "fallback"
        try:
            text = await _call(t, system, messages, max_tokens, json_mode, temperature, job, patience)
        except Unavailable as e:
            last = e
            if e.status == 429 or e.status in (400, 401, 403):
                break
            if t == "large":
                _large_down_until = time.time() + CIRCUIT_SECONDS
            continue
        if t == "large":
            _large_down_until = 0.0
        if cache and not job.fallback:
            _cache_put(key, text, t)
        job.stage, job.tier = "done", t
        return {"text": text, "tier": t, "cached": False, "fallback": job.fallback}
    job.stage = "failed"
    raise last or Unavailable("The AI service is unavailable.")


def parse_json(text):
    t = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M).strip()
    start, end = t.find("{"), t.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("no JSON object in answer")
    return json.loads(t[start:end + 1])


async def complete_json(tier, system, user, *, max_tokens=1600, job=None, validate=None, patience="interactive"):
    res = await complete(tier, system, [{"role": "user", "content": user}], max_tokens=max_tokens, json_mode=True,
                         temperature=0.3, job=job, patience=patience)
    try:
        data = parse_json(res["text"])
        if validate:
            validate(data)
        return data, res
    except (ValueError, KeyError, TypeError, AssertionError):
        fix = await complete("fast", "You repair malformed JSON. Output only one valid JSON object, nothing else.",
                             [{"role": "user", "content": "Fix this into valid JSON with the same content:\n" + res["text"][:6000]}],
                             max_tokens=max_tokens, json_mode=True, temperature=0, job=job, patience=patience)
        data = parse_json(fix["text"])
        if validate:
            validate(data)
        return data, {**res, "repaired": True}


async def embed(texts):
    if not (configured() and EMBED_MODEL):
        raise Unavailable("No embeddings model configured.")
    out = []
    for i in range(0, len(texts), 32):
        batch = texts[i:i + 32]
        for attempt in range(4):
            t0 = time.time()
            try:
                async with httpx.AsyncClient(timeout=httpx.Timeout(TIMEOUT["embed"], connect=10.0)) as client:
                    r = await client.post(BASE_URL + "/embeddings", headers=_headers(), json={"model": EMBED_MODEL, "input": batch})
            except httpx.HTTPError as e:
                _log("embed", EMBED_MODEL, 0, "network")
                if attempt == 3:
                    raise Unavailable(f"Embeddings unreachable ({type(e).__name__})")
                await asyncio.sleep(1.5 * 2 ** attempt)
                continue
            ms = int((time.time() - t0) * 1000)
            if r.status_code == 200:
                data = r.json()
                _log("embed", EMBED_MODEL, 200, "ok", (data.get("usage") or {}).get("prompt_tokens", 0), 0, ms)
                out += [d["embedding"] for d in sorted(data["data"], key=lambda d: d.get("index", 0))]
                break
            detail = _detail(r)
            _log("embed", EMBED_MODEL, r.status_code, "quota" if r.status_code == 429 else "error", ms=ms)
            if r.status_code in (429, 503) and attempt < 3:
                await asyncio.sleep(min(30.0, _wait_from(r, detail, 2.0 * (attempt + 1))))
                continue
            raise Unavailable(f"Embeddings error {r.status_code}: {detail}", r.status_code)
    return out


def cosine(a, b):
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else 0.0


async def list_models():
    if not configured():
        return {"reachable": False, "ids": []}
    if _models_cache["data"] and time.time() - _models_cache["at"] < 300:
        return _models_cache["data"]
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(10.0)) as client:
            r = await client.get(BASE_URL + "/models", headers=_headers())
        _read_quota(r.headers)
        ids = [m.get("id") for m in r.json().get("data", [])] if r.status_code == 200 else []
        data = {"reachable": r.status_code == 200, "ids": ids,
                "compact_ok": FAST_MODEL in ids, "midsize_ok": LARGE_MODEL in ids, "embeddings_ok": (EMBED_MODEL in ids) if EMBED_MODEL else None}
    except (httpx.HTTPError, ValueError):
        data = {"reachable": False, "ids": []}
    _models_cache.update(at=time.time(), data=data)
    return data


def health():
    return {"configured": configured(), **models(), "queue": dict(_waiting),
            "midsize_available": time.time() >= _large_down_until,
            "quota": {k: QUOTA[k] for k in ("remaining", "limit", "reset")}, "quota_low": quota_low()}


def metrics(since=0.0):
    rows = _sql("SELECT tier, handled, status, COUNT(*), COALESCE(SUM(in_tok),0), COALESCE(SUM(out_tok),0), COALESCE(AVG(NULLIF(ms,0)),0) "
                "FROM llm_calls WHERE ts>=? GROUP BY tier, handled, status", (since,), fetch=True)
    m = {"calls": {"compact": 0, "midsize": 0, "embeddings": 0}, "tokens": {"compact": [0, 0], "midsize": [0, 0], "embeddings": [0, 0]},
         "latency_ms": {"compact": 0, "midsize": 0}, "cache_hits": 0, "downgraded": 0, "fell_back": 0,
         "refusals": {"quota": 0, "saturated": 0, "ceiling": 0, "errors": 0},
         "handled": {"quota_waited": 0, "quota_gave_up": 0, "retried": 0, "fell_back": 0, "ceiling_fixed": 0}}
    name = {"fast": "compact", "large": "midsize", "embed": "embeddings"}
    lat = {"compact": [0, 0], "midsize": [0, 0]}
    for tier, handled, status, n, tin, tout, avg in rows:
        t = name.get(tier, tier)
        if handled == "ok":
            m["calls"][t] = m["calls"].get(t, 0) + n
            m["tokens"][t][0] += tin
            m["tokens"][t][1] += tout
            if t in lat:
                lat[t][0] += avg * n
                lat[t][1] += n
        elif handled == "cache":
            m["cache_hits"] += n
        elif handled == "downgraded":
            m["downgraded"] += n
        elif handled == "quota":
            m["refusals"]["quota"] += n
        elif handled == "saturated" or handled in ("timeout", "network"):
            m["refusals"]["saturated"] += n
        elif handled == "ceiling":
            m["refusals"]["ceiling"] += n
        elif handled == "error":
            m["refusals"]["errors"] += n
        if handled in m["handled"]:
            m["handled"][handled] += n
    for t, (s, n) in lat.items():
        m["latency_ms"][t] = round(s / n) if n else 0
    gen = m["calls"]["compact"] + m["calls"]["midsize"]
    m["split"] = {"compact": round(100 * m["calls"]["compact"] / gen) if gen else 0, "midsize": round(100 * m["calls"]["midsize"] / gen) if gen else 0}
    m["fell_back"] = m["handled"]["fell_back"]
    m["quota"] = {k: QUOTA[k] for k in ("remaining", "limit", "reset")}
    m["quota_low"] = quota_low()
    return m


_PII = [re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+"),
        re.compile(r"(?<![\w.])(?:\+\d{1,3}[\s.-]?)?\(?\d{2,4}\)?(?:[\s.-]\d{2,4}){2,4}(?![\w.])")]


def scrub(text):
    text = _PII[0].sub("[email]", text)

    def phone(m):
        g = m.group()
        if re.fullmatch(r"\d{4}[-./]\d{1,2}[-./]\d{1,2}|\d{1,2}[-./]\d{1,2}[-./]\d{4}", g):
            return g
        return "[phone]" if sum(ch.isdigit() for ch in g) >= 8 else g
    return _PII[1].sub(phone, text)
