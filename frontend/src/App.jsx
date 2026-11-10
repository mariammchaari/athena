import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api, stream, setToken, hasToken } from "./api.js";
import { T, MODES, EXPLAIN_LANGS, LEVELS } from "./i18n.js";
import { Markdown } from "./md.jsx";
import { Pingo, Bubble, levelFor, crownTier, LEVEL_XP } from "./mascot.jsx";
import { GardenScene, Plant } from "./garden.jsx";
import { Petals, burst, burstFrom } from "./fx.jsx";
import { Hackathon, ModelBadge, AiUsage } from "./hackathon.jsx";
import { Diagnostic, STYLE_ICON } from "./diagnostic.jsx";
import { HK, DIAG } from "./i18n_hack.js";

const LANG_NAMES = { en: "English", fr: "Français", ar: "العربية" };
const modeLabel = (t, lang, k) => (k === "auto" ? t.auto : MODES[lang][k] || k);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const setDocLang = (l) => { document.documentElement.lang = l; document.documentElement.dir = l === "ar" ? "rtl" : "ltr"; };

function streakFrom(times = []) {
  const days = new Set(times.map((s) => new Date(s * 1000).toDateString()));
  const d = new Date(); let n = 0;
  if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1);
  while (days.has(d.toDateString())) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
const stageOf = (m, done) => (done ? 4 : m < 20 ? 0 : m < 45 ? 1 : m < 70 ? 2 : 3);

function useFlash() {
  const [flash, setFlash] = useState(null);
  const timer = useRef();
  const fire = (mood, line, ms = 2200) => { clearTimeout(timer.current); setFlash({ mood, line, k: Date.now() }); timer.current = setTimeout(() => setFlash(null), ms); };
  useEffect(() => () => clearTimeout(timer.current), []);
  return [flash, fire];
}

export default function App() {
  const [user, setUser] = useState(null);
  const [boot, setBoot] = useState(hasToken() ? "loading" : "ready");
  const [bootErr, setBootErr] = useState("");
  const loadMe = () => {
    setBoot("loading");
    api("/me").then((u) => { setUser(u); setBoot("ready"); }).catch((e) => {
      if (e.kind === "network" || e.kind === "proxy") { setBootErr(e.message); setBoot("down"); } else setBoot("ready");
    });
  };
  useEffect(() => {
    if (hasToken()) loadMe();
    const out = () => setUser(null);
    window.addEventListener("athena:signed-out", out);
    return () => window.removeEventListener("athena:signed-out", out);
  }, []);
  const lang = user?.ui_lang || "en";
  useEffect(() => { if (user) setDocLang(lang); }, [lang, user]);
  if (boot === "loading") return <div className="boot"><Pingo mood="waiting" size={140} interactive={false} /><span className="wordmark">Athena</span></div>;
  if (boot === "down") return (
    <main className="boot down">
      <Pingo mood="oops" size={150} interactive={false} />
      <h1>ATHENA can't reach its server</h1>
      <p>{bootErr}</p>
      <div className="row"><button className="btn3d" onClick={loadMe}>Try again</button>
        <button className="linkbtn" onClick={() => { setToken(""); setBoot("ready"); }}>Sign in with another account</button></div>
    </main>
  );
  return user ? <Shell user={user} setUser={setUser} lang={lang} /> : <Landing onAuth={setUser} />;
}

function Brand({ level = 1, t }) {
  return (
    <span className="brand">
      <span className="brand-mark"><Pingo still size={34} level={level} interactive={false} /></span>
      <span className="wordmark">{t?.brand || "Athena"}</span>
    </span>
  );
}

function ServerChip({ t, onState, compact }) {
  const [s, setS] = useState(null);
  const check = () => api("/health").then((h) => { setS({ up: true, ai: h.ai_configured }); onState?.(h.ai_configured); }).catch((e) => setS({ up: false, msg: e.message }));
  useEffect(() => { check(); const id = setInterval(check, 8000); return () => clearInterval(id); }, []);
  if (!s) return null;
  const label = s.up ? (s.ai ? t.aiOn : t.aiOff) : `${t.server} ${t.down}`;
  return (
    <p className={"chip " + (s.up ? (s.ai ? "ok" : "warn") : "bad") + (compact ? " compact" : "")} role="status" title={s.msg || label}>
      <span className="dot" /><span className="chip-label">{label}</span>
    </p>
  );
}

function Landing({ onAuth }) {
  const [lang, setLang] = useState(() => { const n = (navigator.language || "en").slice(0, 2); return T[n] ? n : "en"; });
  const t = T[lang];
  const [auth, setAuth] = useState(null);
  useEffect(() => { setDocLang(lang); }, [lang]);
  return (
    <div className="landing">
      <header className="lnav">
        <Brand t={t} />
        <nav className="lnav-links" aria-label="Sections">
          <a href="#what">{t.navWhat}</a><a href="#garden">{t.navGarden}</a><a href="#crowns">{t.navCrowns}</a>
        </nav>
        <div className="lnav-end">
          <label className="lang-pill">
            <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M2.5 10h15M10 2.5c2.4 2.4 2.4 12.6 0 15M10 2.5c-2.4 2.4-2.4 12.6 0 15" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
            <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Language">{Object.entries(LANG_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </label>
          <button className="btn3d ghost sm" onClick={() => setAuth("login")}>{t.signin}</button>
        </div>
      </header>
      <Hero t={t} onStart={() => setAuth("signup")} />
      <Features t={t} />
      <HackPromo lang={lang} onStart={() => setAuth("signup")} />
      <GardenDemo t={t} />
      <Crowns t={t} />
      <section className="cta-band">
        <div className="cta-copy"><h2>{t.ctaTitle}</h2><p>{t.ctaText}</p></div>
        <button className="btn3d white" onClick={() => setAuth("signup")}>{t.start}</button>
        <div className="cta-pingo"><Pingo mood="wave" size={150} level={3} /></div>
        <GardenScene tall={false} className="cta-scene" />
      </section>
      <footer className="lfoot"><Brand t={t} /><span>{t.tagline}</span><ServerChip t={t} /></footer>
      {auth && <AuthSheet t={t} lang={lang} mode={auth} setMode={setAuth} onAuth={onAuth} onClose={() => setAuth(null)} />}
    </div>
  );
}

function Hero({ t, onStart }) {
  const [mood, setMood] = useState("wave");
  const [line, setLine] = useState(t.hello[0]);
  const [flash, fire] = useFlash();
  const i = useRef(0);
  useEffect(() => { const id = setTimeout(() => setMood("idle"), 2600); return () => clearTimeout(id); }, []);
  useEffect(() => {
    setLine(t.hello[0]); i.current = 0;
    const id = setInterval(() => { i.current = (i.current + 1) % t.hello.length; setLine(t.hello[i.current]); }, 4200);
    return () => clearInterval(id);
  }, [t]);
  const poke = (kind) => {
    if (kind === "spin") fire("celebrate", t.spun, 1400);
    else if (kind === "tickle") fire("happy", t.tickle, 1700);
    else fire(pick(["happy", "oops", "happy"]), pick(t.pokes), 1500);
  };
  return (
    <section className="hero">
      <Petals count={30} />
      <div className="hero-copy">
        <span className="pill">{t.heroPill}</span>
        <h1 className="hero-title"><span>{t.heroTitle[0]}</span> <span className="hl">{t.heroTitle[1]}</span></h1>
        <p className="hero-text">{t.heroText}</p>
        <div className="hero-ctas">
          <button className="btn3d big" onClick={onStart} onPointerEnter={() => setMood("happy")} onPointerLeave={() => setMood("idle")}>{t.start}</button>
          <a className="btn3d ghost big" href="#what">{t.seeWhat}</a>
        </div>
      </div>
      <div className="hero-stage">
        <div className="arch" aria-hidden="true">
          <svg viewBox="0 0 400 420" className="arch-svg">
            <defs><linearGradient id="archsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7FA4FF" /><stop offset=".55" stopColor="#B7C9FF" /><stop offset="1" stopColor="#FFE3C2" /></linearGradient></defs>
            <path d="M40 420 V190 A160 160 0 0 1 360 190 V420 Z" fill="url(#archsky)" />
            <circle cx="290" cy="150" r="34" fill="#FFE27A" opacity=".9" /><circle cx="290" cy="150" r="54" fill="#FFE27A" opacity=".25" />
            <path d="M40 360 C 120 330 200 350 260 340 C 310 332 340 340 360 336 V420 H40 Z" fill="#7EDCA2" />
            <path d="M40 392 C 140 370 260 384 360 372 V420 H40 Z" fill="#41C07D" />
            <path d="M20 420 V186 A180 180 0 0 1 380 186 V420" fill="none" stroke="#FFFDF7" strokeWidth="26" />
            <path d="M20 420 V186 A180 180 0 0 1 380 186 V420" fill="none" stroke="#EDE3CC" strokeWidth="2" strokeDasharray="2 22" />
            {[[30, 300], [24, 240], [40, 180], [70, 120], [372, 280], [376, 220], [360, 160], [334, 112], [118, 70], [290, 64]].map(([x, y], k) => (
              <g key={k} className="vine" style={{ animationDelay: k * 0.3 + "s", transformOrigin: `${x}px ${y}px` }}>
                <ellipse cx={x} cy={y} rx="10" ry="4.5" fill={k % 2 ? "#2FBF71" : "#56D68D"} transform={`rotate(${k * 37} ${x} ${y})`} />
                {k % 3 === 0 && <circle cx={x + 8} cy={y - 6} r="4" fill={k % 2 ? "#FF7EB6" : "#FFD25C"} />}
              </g>
            ))}
          </svg>
        </div>
        <div className="hero-pingo">
          <Bubble key={flash?.k || line} className="hero-bubble">{flash?.line || line}</Bubble>
          <Pingo mood={flash?.mood || mood} size={300} level={2} onPoke={poke} title="Pingo" />
        </div>
        <p className="poke-hint">{t.pokeHint}</p>
      </div>
      <GardenScene className="hero-scene" />
    </section>
  );
}

const FEATURE_ICONS = {
  simple: <path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V17h5.2v-1.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Zm-2.6 17h5.2" />,
  guide: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.6 2.6 0 1 1 3.7 2.3c-.8.4-1.2 1-1.2 1.8v.4M12 17.2v.1" /></>,
  mistake: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
  adapt: <path d="M12 3c.6 3.6 2.4 5.4 6 6-3.6.6-5.4 2.4-6 6-.6-3.6-2.4-5.4-6-6 3.6-.6 5.4-2.4 6-6ZM18.5 15.5c.3 1.5 1 2.2 2.5 2.5-1.5.3-2.2 1-2.5 2.5-.3-1.5-1-2.2-2.5-2.5 1.5-.3 2.2-1 2.5-2.5Z" />,
  lang: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.8 2.8 2.8 15.2 0 18M12 3c-2.8 2.8-2.8 15.2 0 18" /></>,
  notes: <><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4M10 12h5M10 16h5" /></>,
};

function Features({ t }) {
  const [active, setActive] = useState(0);
  const [touched, setTouched] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => { if (touched) return; const id = setInterval(() => setActive((a) => (a + 1) % t.features.length), 3600); return () => clearInterval(id); }, [touched, t]);
  const f = t.features[active];
  useEffect(() => { if (f[3] !== "talking") return; const id = setInterval(() => setTick((x) => x + 1), 110); return () => clearInterval(id); }, [f]);
  return (
    <section className="features" id="what">
      <header className="sec-head"><span className="eyebrow">{t.whatEyebrow}</span><h2>{t.whatTitle}</h2><p className="faint">{t.whatHint}</p></header>
      <div className="features-wrap">
        <div className="feature-grid">
          {t.features.map(([key, title, desc], i) => (
            <button key={key} className={"fcard" + (i === active ? " on" : "")} onPointerEnter={() => { setTouched(true); setActive(i); }} onFocus={() => { setTouched(true); setActive(i); }} onClick={() => { setTouched(true); setActive(i); }}>
              <span className={"ficon i-" + key}><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{FEATURE_ICONS[key]}</svg></span>
              <strong>{title}</strong><span>{desc}</span>
            </button>
          ))}
        </div>
        <div className="stage">
          <div className="stage-pad">
            <Bubble key={active} className="stage-bubble">{f[4]}</Bubble>
            <Pingo mood={f[3]} size={230} level={3} talkTick={tick} />
          </div>
          <div className="stage-floor" />
        </div>
      </div>
    </section>
  );
}

function HackPromo({ lang, onStart }) {
  const h = HK[lang];
  const steps = [["prep", "📚", h.brief + " · " + h.askPingo], ["compete", "🏆", ["quiz", "coding", "open"].map((r) => h.rounds[r]).join(" · ")], ["results", "📒", h.notes]];
  return (
    <section className="hack-promo" id="hackathon">
      <div className="hp-copy">
        <span className="eyebrow light">{h.tab}</span>
        <h2>{h.title}</h2>
        <p>{h.lede}</p>
        <button className="btn3d gold" onClick={onStart}>{h.create}</button>
      </div>
      <ol className="hp-steps">
        {steps.map(([p, icon, sub], i) => <li key={p} style={{ "--i": i }}><span className="hp-icon" aria-hidden="true">{icon}</span><strong>{h.phases[p]}</strong><small>{sub}</small></li>)}
      </ol>
      <div className="hp-pingo"><Pingo mood="celebrate" size={150} level={5} /></div>
    </section>
  );
}

function GardenDemo({ t }) {
  const [m, setM] = useState(35);
  const done = m >= 100;
  const ref = useRef();
  useEffect(() => { if (done) burstFrom(ref.current, 0.8); }, [done]);
  return (
    <section className="gdemo" id="garden">
      <div className="gdemo-copy">
        <span className="eyebrow">{t.gardenEyebrow}</span>
        <h2>{t.gardenTitle}</h2>
        <p>{t.gardenText}</p>
      </div>
      <div className="gdemo-card" ref={ref}>
        <div className="gdemo-plants">
          <Plant mastery={m} done={done} size={190} />
        </div>
        <strong className="gdemo-goal">{t.demoGoal}</strong>
        <span className={"stage-pill s" + stageOf(m, done)}>{t.stages[stageOf(m, done)]}</span>
        <label className="grow">
          <span>{t.gardenDrag}</span>
          <input type="range" min="0" max="100" value={m} onChange={(e) => setM(+e.target.value)} style={{ "--m": m + "%" }} />
        </label>
      </div>
    </section>
  );
}

function Crowns({ t }) {
  return (
    <section className="crowns" id="crowns">
      <header className="sec-head"><span className="eyebrow">{t.crownsEyebrow}</span><h2>{t.crownsTitle}</h2><p>{t.crownsText}</p></header>
      <ol className="crown-ladder">
        {t.crownNames.map((name, i) => (
          <li key={name} style={{ "--i": i }}>
            <div className="crown-pingo"><Pingo still size={110} level={i + 1} interactive={false} /></div>
            <strong>{name}</strong>
            <span>{t.levelN(i + 1)} · {LEVEL_XP[i]} XP</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function AuthSheet({ t, lang, mode, setMode, onAuth, onClose }) {
  const [f, setF] = useState({ username: "", password: "", nickname: "" });
  const [focus, setFocus] = useState(null);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const [mood, setMood] = useState("wave");
  const first = useRef();
  useEffect(() => { first.current?.focus(); const id = setTimeout(() => setMood("idle"), 1600); const esc = (e) => e.key === "Escape" && onClose(); addEventListener("keydown", esc); return () => { clearTimeout(id); removeEventListener("keydown", esc); }; }, []);
  const dir = lang === "ar" ? -1 : 1;
  let look = null, m = mood;
  if (focus === "password") m = "shy";
  else if (focus === "username" || focus === "nickname") { const v = f[focus]; look = { x: dir * (-0.75 + Math.min(1, v.length / 26) * 1.5), y: 0.75 }; m = mood === "oops" ? "oops" : "listening"; }
  const submit = async (e) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      const r = await api(mode === "login" ? "/auth/login" : "/auth/register", "POST", mode === "login" ? { username: f.username, password: f.password } : { ...f, ui_lang: lang });
      setToken(r.token); setFocus(null); setMood("celebrate"); burst(innerWidth / 2, innerHeight * 0.35, 1.3);
      setTimeout(() => onAuth(r.user), 900);
    } catch (x) { setErr(x.message); setFocus(null); setMood("oops"); setTimeout(() => setMood("idle"), 2400); setBusy(false); }
  };
  return (
    <div className="sheet-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <div className="sheet-pingo"><Pingo mood={m} size={150} level={2} look={look} /></div>
        <button className="sheet-x" onClick={onClose} aria-label={t.close}>×</button>
        <form onSubmit={submit}>
          <h2 id="auth-title">{mode === "login" ? t.welcomeBack : t.joinTitle}</h2>
          <label>{t.username}<input ref={first} autoComplete="username" required minLength={3} maxLength={30} pattern="[A-Za-z0-9_.\-]{3,30}" spellCheck={false} autoCapitalize="off" value={f.username} onFocus={() => setFocus("username")} onBlur={() => setFocus(null)} onChange={(e) => setF({ ...f, username: e.target.value })} />
            {mode === "signup" && <small className="hint">🔒 {t.usernameHint}</small>}</label>
          {mode === "signup" && <label>{t.nickname}<input maxLength={40} value={f.nickname} onFocus={() => setFocus("nickname")} onBlur={() => setFocus(null)} onChange={(e) => setF({ ...f, nickname: e.target.value })} /></label>}
          <label>{t.password}<input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "signup" ? 8 : undefined} required value={f.password} onFocus={() => setFocus("password")} onBlur={() => setFocus(null)} onChange={(e) => setF({ ...f, password: e.target.value })} /></label>
          {err && <p className="err" role="alert">{err}</p>}
          <button className="btn3d wide" disabled={busy}>{mode === "login" ? t.signin : t.signup}</button>
          <button type="button" className="linkbtn" onClick={() => { setErr(""); setMode(mode === "login" ? "signup" : "login"); }}>{mode === "login" ? t.noAcct : t.haveAcct}</button>
        </form>
      </div>
    </div>
  );
}

function Shell({ user, setUser, lang }) {
  const t = T[lang];
  const [convs, setConvs] = useState([]);
  const [active, setActive] = useState(null);
  const [panel, setPanel] = useState("study");
  const [aiOn, setAiOn] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [draft, setDraft] = useState("");
  const [stats, setStats] = useState(null);
  const [levelUp, setLevelUp] = useState(null);
  const [diag, setDiag] = useState(() => { try { return !user.diag_done && !sessionStorage.getItem("athena_diag_skip"); } catch { return !user.diag_done; } });
  const prevLevel = useRef(null);
  const loadConvs = () => api("/conversations").then(setConvs).catch(() => {});
  const loadStats = () => api("/stats").then((s) => {
    const lv = levelFor(s.xp).level;
    if (prevLevel.current && lv > prevLevel.current) setLevelUp(lv);
    prevLevel.current = lv; setStats(s);
  }).catch(() => {});
  useEffect(() => { loadConvs(); loadStats(); }, []);
  const xp = stats?.xp ?? 0;
  const L = levelFor(xp);
  const streak = useMemo(() => streakFrom(stats?.activity), [stats]);
  const create = async () => (await api("/conversations", "POST")).id;
  const activate = (id) => { setActive(id); loadConvs(); };
  const go = (p, id = null) => { setPanel(p); if (p === "study") setActive(id); setDrawer(false); };
  const remove = async (id) => { await api("/conversations/" + id, "DELETE").catch(() => {}); if (active === id) setActive(null); loadConvs(); };
  const studyGoal = (title) => { setDraft(t.studyPrompt + title); go("study"); };
  const tabs = [["study", t.navStudy, "M4 5.5C4 4.7 4.7 4 5.5 4H11v15H5.5A1.5 1.5 0 0 1 4 17.5zM20 5.5c0-.8-.7-1.5-1.5-1.5H13v15h5.5c.8 0 1.5-.7 1.5-1.5z"],
    ["garden", t.navGarden2, "M12 21v-7M12 14c0-4 3-7 7-7 0 4-3 7-7 7ZM12 12c0-3.3-2.7-6-6-6 0 3.3 2.7 6 6 6Z"],
    ["hack", HK[lang].tab, "M7 4h10v4a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8M10 17h4"],
    ["settings", t.settings, "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14.2 3h-4l-.4 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z"]];
  return (
    <div className="app">
      <header className="topbar">
        {panel === "study" && <button className="iconbtn menu" aria-label={t.chats} onClick={() => setDrawer(true)}><span /><span /><span /></button>}
        <Brand level={L.level} t={t} />
        <nav className="tabs" aria-label="Main">
          {tabs.map(([k, label, d]) => (
            <button key={k} className={panel === k ? "on" : ""} aria-current={panel === k ? "page" : undefined} onClick={() => go(k, k === "study" ? active : null)}>
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" /></svg>
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="top-stats">
          <span className={"streak" + (streak ? " lit" : "")} title={t.streak(streak)}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path className="flame" d="M12 2c1 3.5 5 5.5 5 10.5A5 5 0 0 1 7 12.5c0-2 1-3.5 2-4.5.2 1.6 1 2.6 2 3 0-3 0-6 1-9Z" /><path className="flame-in" d="M12 12c.6 1.6 2.3 2.4 2.3 4.4a2.3 2.3 0 0 1-4.6 0c0-1.4.9-2.2 1.6-2.8.1.6.4 1 .7 1.2 0-1 0-2 0-2.8Z" /></svg>
            <b>{streak}</b><span className="sr">{t.streak(streak)}</span>
          </span>
          <span className="xpmeter" title={t.toNext(xp - L.floor, L.next - L.floor, L.level + 1)}>
            <span className="lv">{L.level}</span>
            <span className="bar"><span style={{ width: L.pct * 100 + "%" }} /></span>
            <b>{xp}<small> {t.xp}</small></b>
          </span>
          <ServerChip t={t} onState={setAiOn} compact />
        </div>
      </header>
      {!aiOn && <p className="banner">{t.offline}</p>}
      <main className="main">
        {panel === "study" && (
          <div className="study-wrap">
            <aside className={"convs" + (drawer ? " open" : "")} aria-label={t.chats}>
              <button className="btn3d wide sm" onClick={() => go("study")}>+ {t.newChat}</button>
              <nav className="conv-list">
                {convs.length === 0 && <p className="faint">{t.noChats}</p>}
                {convs.map((c) => (
                  <div key={c.id} className={"conv" + (c.id === active ? " on" : "")}>
                    <button onClick={() => go("study", c.id)} dir="auto" aria-current={c.id === active ? "page" : undefined}>{c.title}</button>
                    <button className="x" aria-label={t.del + ": " + c.title} onClick={() => remove(c.id)}>×</button>
                  </div>
                ))}
              </nav>
            </aside>
            {drawer && <div className="scrim" onClick={() => setDrawer(false)} />}
            <Study id={active} onCreate={create} onActivate={activate} t={t} lang={lang} user={user} level={L.level}
              onChanged={loadConvs} onEarned={loadStats} draft={draft} clearDraft={() => setDraft("")} />
          </div>
        )}
        {panel === "garden" && <GardenPage t={t} lang={lang} L={L} xp={xp} streak={streak} onStudy={studyGoal} onEarned={loadStats} />}
        {panel === "hack" && <Hackathon lang={lang} level={L.level} onEarned={loadStats} />}
        {panel === "settings" && <Settings user={user} setUser={setUser} t={t} L={L} onRetake={() => setDiag(true)} onSignOut={() => { setToken(""); setUser(null); }} />}
      </main>
      {levelUp && <LevelUp t={t} level={levelUp} onClose={() => setLevelUp(null)} />}
      {diag && <Diagnostic lang={lang} level={L.level} onDone={(u) => { setUser(u); setDiag(false); }}
        onSkip={() => { try { sessionStorage.setItem("athena_diag_skip", "1"); } catch { } setDiag(false); }} />}
    </div>
  );
}

function LevelUp({ t, level, onClose }) {
  const ref = useRef();
  useEffect(() => { const id = setTimeout(() => burstFrom(ref.current, 2), 150); ref.current?.querySelector("button")?.focus(); return () => clearTimeout(id); }, []);
  const crown = t.crownNames[crownTier(level) - 1];
  return (
    <div className="sheet-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="levelup" ref={ref} role="dialog" aria-modal="true" aria-labelledby="lvl-title">
        <div className="rays" aria-hidden="true" />
        <Pingo mood="celebrate" size={220} level={level} />
        <h2 id="lvl-title">{t.levelUp(level)}</h2>
        <p>{t.unlocked(crown)}</p>
        <button className="btn3d gold wide" onClick={onClose}>{t.keepGoing}</button>
      </div>
    </div>
  );
}

function Approach({ t, lang, mode, setMode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useEffect(() => {
    if (!open) return;
    ref.current?.querySelector(".approach-pop [aria-checked=true]")?.focus();
    const off = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") { setOpen(false); ref.current?.querySelector(".approach-btn")?.focus(); } };
    document.addEventListener("pointerdown", off); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", off); document.removeEventListener("keydown", esc); };
  }, [open]);
  const keys = ["auto", ...Object.keys(MODES[lang])];
  return (
    <div className="approach" ref={ref}>
      <button type="button" className="approach-btn" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen(!open)}>
        <span className="lbl">{t.approach}</span><span className="val">{modeLabel(t, lang, mode)}</span>
        <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M3 7.5 6 4.5 9 7.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
      </button>
      {open && (
        <div className="approach-pop" role="radiogroup" aria-label={t.approach}>
          {keys.map((k) => (
            <button type="button" role="radio" aria-checked={mode === k} key={k} className={mode === k ? "on" : ""} onClick={() => { setMode(k); setOpen(false); }}>
              <strong>{modeLabel(t, lang, k)}</strong><span>{t.approachDesc[k]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Reply({ m, t, lang, level }) {
  return (
    <article className="reply" dir="auto">
      <div className="reply-head">
        <span className="avatar"><Pingo still size={30} level={level} interactive={false} /></span>
        <strong>{t.pingo}</strong>
        {m.mode && m.mode !== "auto" && <span className="mode-tag">{modeLabel(t, lang, m.mode)}</span>}
        <ModelBadge meta={m.meta} h={HK[lang]} />
      </div>
      <div className="reply-body">{m.content ? <Markdown text={m.content} /> : <p className="thinking">{t.thinking}</p>}</div>
    </article>
  );
}

const QUICK = ["simple", "quiz", "mistakes", "summary"];

function Study({ id, onCreate, onActivate, t, lang, user, level, onChanged, onEarned, draft, clearDraft }) {
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const [mode, setMode] = useState("auto");
  const [live, setLive] = useState(null);
  const [err, setErr] = useState(null);
  const [focused, setFocused] = useState(false);
  const [asleep, setAsleep] = useState(false);
  const [talk, setTalk] = useState(0);
  const [xpPop, setXpPop] = useState(0);
  const [flash, fire] = useFlash();
  const [stage, setStage] = useState(null);
  const skip = useRef(false);
  const loadedFor = useRef(undefined);
  const ctrl = useRef(null);
  const log = useRef(); const ta = useRef(); const perch = useRef();
  const busy = live !== null;
  const dir = lang === "ar" ? -1 : 1;

  useEffect(() => {
    if (id !== null && id === loadedFor.current) return;
    ctrl.current?.abort(); ctrl.current = null;
    loadedFor.current = id; setErr(null); setLive(null);
    if (!id) { setMsgs([]); return; }
    let current = true;
    setMsgs([]);
    api("/conversations/" + id).then((m) => current && setMsgs(m)).catch((e) => current && setErr({ message: e.message }));
    return () => { current = false; };
  }, [id]);
  useEffect(() => () => ctrl.current?.abort(), []);
  useEffect(() => { if (draft) { setText(draft); clearDraft(); ta.current?.focus(); } }, [draft]);
  useEffect(() => {
    let timer;
    const wake = () => { setAsleep(false); clearTimeout(timer); timer = setTimeout(() => setAsleep(true), 45000); };
    wake();
    addEventListener("pointermove", wake, { passive: true }); addEventListener("keydown", wake);
    return () => { clearTimeout(timer); removeEventListener("pointermove", wake); removeEventListener("keydown", wake); };
  }, []);
  useLayoutEffect(() => { const el = ta.current; if (!el) return; el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 220) + "px"; }, [text]);
  const scrollDown = (force) => { const el = log.current; if (el && (force || el.scrollHeight - el.scrollTop - el.clientHeight < 180)) el.scrollTop = el.scrollHeight; };
  useEffect(() => scrollDown(false), [msgs, live]);

  const send = async (content) => {
    content = content.trim(); if (!content || busy) return;
    const c = new AbortController(); ctrl.current = c;
    setErr(null); setText("");
    setMsgs((m) => [...m, { id: "u" + Date.now(), role: "user", content }]);
    setLive({ content: "", mode });
    requestAnimationFrame(() => scrollDown(true));
    let acc = "", cid = id;
    try {
      if (cid == null) {
        cid = await onCreate();
        if (ctrl.current !== c) return;
        loadedFor.current = cid; onActivate(cid);
      }
      const done = await stream(`/conversations/${cid}/stream`, { content, mode }, (d) => { if (ctrl.current === c) acc += d; },
        c.signal, (ev) => { if (ctrl.current === c) setStage(ev); });
      if (ctrl.current !== c) return;
      await reveal(acc, c);
      if (ctrl.current !== c) return;
      setMsgs((m) => [...m, { id: done.id, role: "assistant", content: acc, mode, meta: done.meta }]);
      fire("happy", t.lines.happy, 2600); setXpPop((x) => x + 1); onEarned();
    } catch (x) {
      if (x.name === "AbortError") {
        if (ctrl.current === c) { setMsgs((m) => m.slice(0, -1)); setText(content); }
        return;
      }
      if (ctrl.current !== c) return;
      fire("oops", t.lines.oops, 3200);
      if (acc) { setMsgs((m) => [...m, { id: "a" + Date.now(), role: "assistant", content: acc, mode }]); setErr({ message: t.cutoffNote + " " + x.message }); }
      else { setMsgs((m) => m.slice(0, -1)); setErr({ message: x.message, retry: content }); }
    } finally {
      if (ctrl.current === c || ctrl.current === null) { ctrl.current = null; setLive(null); setStage(null); onChanged(); }
    }
  };
  const reveal = (full, c) => new Promise((resolve) => {
    const parts = full.split(/(\s+)/);
    let i = 0; skip.current = false;
    const step = Math.max(2, Math.ceil(parts.length / 70));
    setStage({ stage: "revealing" });
    const tick = () => {
      if (ctrl.current !== c) return resolve();
      i = skip.current ? parts.length : Math.min(parts.length, i + step);
      setLive({ content: parts.slice(0, i).join(""), mode }); setTalk((x) => x + 1);
      if (i < parts.length) requestAnimationFrame(tick); else resolve();
    };
    tick();
  });
  const stop = () => { if (stage?.stage === "revealing") skip.current = true; else ctrl.current?.abort(); };
  const stageLine = (s) => !s ? t.lines.thinking : s.stage === "quota_wait" ? t.lines.quotaWait(s.retry_in)
    : s.stage === "queued" && s.position > 1 ? t.lines.queued(s.position)
    : s.stage === "retrying" ? t.lines.retrying(s.retry_in) : s.fallback ? t.lines.fallback
    : s.tier === "large" ? t.lines.deep : s.tier === "fast" ? t.lines.quick : t.lines.thinking;
  const poke = (kind) => {
    if (kind === "spin") fire("celebrate", t.spun, 1400);
    else if (kind === "tickle") fire("happy", t.tickle, 1600);
    else fire("happy", pick(t.pokes), 1500);
  };

  let mood = "idle", line = null, look = null;
  if (flash) { mood = flash.mood; line = flash.line; }
  else if (busy) { mood = live.content ? "talking" : ["retrying", "quota_wait"].includes(stage?.stage) || stage?.fallback ? "waiting" : "thinking"; line = live.content ? null : stageLine(stage); look = live.content ? { x: dir * 0.7, y: -0.7 } : null; }
  else if (asleep) { mood = "sleep"; line = t.lines.sleep; }
  else if (focused && text.trim()) { mood = "listening"; line = t.lines.listening; look = { x: dir * (0.2 + Math.min(1, text.length / 60) * 0.8), y: 0.6 }; }
  else if (msgs.length === 0) { line = t.hiName(user.name); }

  return (
    <section className="study">
      <div className="log" ref={log}>
        {msgs.length === 0 && !busy && (
          <div className="opening">
            <h2 className="ask">{t.prompt}</h2>
            <p className="faint">{t.quick}</p>
            <div className="quick">
              {QUICK.map((k) => (
                <button key={k} className={"qcard" + (mode === k ? " on" : "")} onClick={() => { setMode(k); ta.current?.focus(); }}>
                  <strong>{MODES[lang][k]}</strong><span>{t.approachDesc[k]}</span>
                </button>
              ))}
            </div>
            <ul className="starters">{t.starters.map((s) => <li key={s}><button dir="auto" onClick={() => send(s)}>{s}</button></li>)}</ul>
          </div>
        )}
        <div className="thread" aria-live="polite">
          {msgs.map((m, i) => m.role === "user"
            ? <p key={m.id + "-" + i} className="note" dir="auto">{m.content}</p>
            : <Reply key={m.id + "-" + i} m={m} t={t} lang={lang} level={level} />)}
          {live && <Reply m={live} t={t} lang={lang} level={level} />}
          {err && (
            <div className="err box" role="alert"><p>{err.message}</p>
              {err.retry && <button className="linkbtn" onClick={() => send(err.retry)}>{t.retry}</button>}</div>
          )}
        </div>
      </div>
      <div className="composer">
        <div className="perch" ref={perch}>
          {line && <Bubble key={(flash?.k || "") + line} className="perch-bubble">{line}</Bubble>}
          {xpPop > 0 && <span key={xpPop} className="xp-pop">+10 XP</span>}
          <Pingo mood={mood} size={112} level={level} look={look} talkTick={talk} onPoke={poke} title="Pingo" />
        </div>
        <form className="tablet" onSubmit={(e) => { e.preventDefault(); send(text); }}>
          <textarea ref={ta} dir="auto" rows={1} value={text} placeholder={t.ask} aria-label={t.ask}
            onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(text); } }} />
          <div className="tablet-row">
            <Approach t={t} lang={lang} mode={mode} setMode={setMode} />
            {busy
              ? <button type="button" className="send stop" onClick={stop}><span className="sq" />{stage?.stage === "revealing" ? t.skip : t.stop}</button>
              : <button className="send" disabled={!text.trim()} aria-label={t.send}>
                  <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M10 15.5V4.5M5 9.5l5-5 5 5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>}
          </div>
        </form>
      </div>
    </section>
  );
}

function GoalCard({ g, t, act, onStudy, onBloom, onThink }) {
  const [m, setM] = useState(g.mastery);
  const [busy, setBusy] = useState(false);
  const timer = useRef(); const ref = useRef();
  useEffect(() => setM(g.mastery), [g.mastery]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const change = (v) => { setM(v); clearTimeout(timer.current); timer.current = setTimeout(() => act(api("/goals/" + g.id, "PATCH", { mastery: v }), false), 350); };
  const toggle = () => {
    const done = !g.done;
    act(api("/goals/" + g.id, "PATCH", done ? { done, mastery: 100 } : { done }));
    if (done) { burstFrom(ref.current, 1.1); onBloom(); }
  };
  const makePlan = async () => {
    setBusy(true); onThink(true);
    try { await act(api("/goals/" + g.id + "/plan", "POST")); } finally { setBusy(false); onThink(false); }
  };
  const tick = (i, done) => {
    const steps = g.plan.steps.map((x, j) => (j === i ? { ...x, done } : x));
    const n = steps.filter((x) => x.done).length;
    setM(Math.round((100 * n) / steps.length));
    if (n === steps.length) { burstFrom(ref.current, 1.1); onBloom(); }
    act(api("/goals/" + g.id + "/plan/" + i, "PATCH", { done }));
  };
  const s = stageOf(m, g.done);
  const plan = g.plan;
  const nDone = plan ? plan.steps.filter((x) => x.done).length : 0;
  return (
    <li className={"bed" + (g.done ? " done" : "") + (plan ? " has-plan" : "")} ref={ref}>
      <div className="bed-plant"><Plant mastery={m} done={!!g.done} size={150} /></div>
      <div className="bed-body">
        <div className="bed-top">
          <span className={"stage-pill s" + s}>{t.stages[s]}</span>
          <button className="x" aria-label={t.del + ": " + g.title} onClick={() => act(api("/goals/" + g.id, "DELETE"))}>×</button>
        </div>
        <h3 dir="auto">{g.title}</h3>
        {plan ? (
          <div className="plan">
            <div className="plan-head">
              <span className={"plan-src " + plan.source}>{plan.source === "ai" ? "✨ " + t.planAi : t.planOffline}</span>
              <span className="plan-count">{t.planDone(nDone, plan.steps.length)}</span>
            </div>
            <div className="bigbar sm"><span style={{ width: m + "%" }} /></div>
            <ol className="plan-steps">
              {plan.steps.map((x, i) => (
                <li key={i} className={x.done ? "done" : ""}>
                  <label>
                    <input type="checkbox" checked={!!x.done} onChange={(e) => tick(i, e.target.checked)} />
                    <span><b dir="auto">{x.t}</b>{x.why && <small dir="auto">{x.why}</small>}</span>
                  </label>
                  {!x.done && <button className="linkish" onClick={() => onStudy(x.t + " (" + g.title + ")")}>{t.askStep} →</button>}
                </li>
              ))}
            </ol>
          </div>
        ) : !g.done && (
          <>
            <label className="grow small"><span>{t.masteryQ} <b>{m}%</b></span>
              <input type="range" min="0" max="100" step="5" value={m} onChange={(e) => change(+e.target.value)} style={{ "--m": m + "%" }} /></label>
            <p className="plan-intro faint">{busy ? t.planning : t.planIntro}</p>
          </>
        )}
        <div className="bed-actions">
          {!g.done && !plan && <button className="btn3d sm violet" disabled={busy} onClick={makePlan}>{busy ? "…" : t.makePlan}</button>}
          {!g.done && !plan && <button className="btn3d sm" onClick={() => onStudy(g.title)}>{t.studyThis}</button>}
          {(!plan || g.done) && <button className={"btn3d sm " + (g.done ? "gold" : "green")} aria-pressed={!!g.done} onClick={toggle}>{g.done ? "✓ " + t.mastered : t.markMastered}</button>}
        </div>
      </div>
    </li>
  );
}

function GardenPage({ t, lang, L, xp, streak, onStudy, onEarned }) {
  const [goals, setGoals] = useState(null);
  const [title, setTitle] = useState(""); const [err, setErr] = useState("");
  const [flash, fire] = useFlash();
  const [thinking, setThinking] = useState(false);
  const load = () => api("/goals").then(setGoals).catch((e) => { setErr(e.message); setGoals([]); });
  useEffect(() => { load(); }, []);
  const act = (p, reload = true) => p.then(() => { setErr(""); if (reload) { load(); onEarned(); } }).catch((e) => setErr(e.message));
  const add = (e) => { e.preventDefault(); if (!title.trim()) return; act(api("/goals", "POST", { title: title.trim() })); setTitle(""); fire("happy", "🌱", 1400); };
  const bloomed = goals?.filter((g) => g.done).length || 0;
  const crown = t.crownNames[crownTier(L.level) - 1];
  return (
    <section className="page garden-page">
      <div className="ghero">
        <GardenScene tall={false} className="ghero-scene" />
        <div className="ghero-pingo">
          {flash && <Bubble key={flash.k} className="perch-bubble">{flash.line}</Bubble>}
          <Pingo mood={flash?.mood || (thinking ? "thinking" : "idle")} size={150} level={L.level} onPoke={() => fire("happy", pick(t.pokes), 1400)} />
        </div>
        <div className="ghero-info">
          <h1>{t.yourGarden}</h1>
          <p className="crown-line"><b>{t.levelN(L.level)}</b> {crown}</p>
          <div className="bigbar"><span style={{ width: L.pct * 100 + "%" }} /></div>
          <p className="faint">{t.toNext(xp - L.floor, L.next - L.floor, L.level + 1)}</p>
          <div className="ghero-stats">
            <span className="stat"><b>{streak}</b>{t.streakLbl}</span>
            <span className="stat"><b>{bloomed}</b>{t.bloomLbl}</span>
          </div>
        </div>
      </div>
      <form onSubmit={add} className="plant-form">
        <label htmlFor="newgoal" className="sr">{t.plantGoal}</label>
        <input id="newgoal" dir="auto" value={title} placeholder={t.goalPh} onChange={(e) => setTitle(e.target.value)} />
        <button className="btn3d green">{t.addGoal}</button>
      </form>
      {err && <p className="err" role="alert">{err}</p>}
      {goals?.length === 0 && <p className="empty-garden">{t.emptyGarden}</p>}
      <ul className="beds">{goals?.map((g) => <GoalCard key={g.id} g={g} t={t} act={act} onStudy={onStudy} onThink={(on) => setThinking(on)} onBloom={() => fire("celebrate", "+50 XP", 2400)} />)}</ul>
    </section>
  );
}

function Settings({ user, setUser, t, L, onSignOut, onRetake }) {
  const d = DIAG[user.ui_lang] || DIAG.en;
  const [del, setDel] = useState(false);
  const remove = async () => {
    if (!del) { setDel(true); setTimeout(() => setDel(false), 4000); return; }
    try { await api("/me", "DELETE"); onSignOut(); } catch (x) { setDel(false); }
  };
  const [f, setF] = useState({ name: user.name, ui_lang: user.ui_lang, explain_lang: user.explain_lang, level: user.level });
  const [saved, setSaved] = useState(false); const [err, setErr] = useState("");
  const save = async (e) => { e.preventDefault(); setErr(""); try { setUser(await api("/me", "PATCH", f)); setSaved(true); } catch (x) { setErr(x.message); } };
  const set = (k) => (e) => { setSaved(false); setF({ ...f, [k]: e.target.value }); };
  return (
    <section className="page">
      <form className="settings card" onSubmit={save}>
        <div className="settings-pingo"><Pingo mood={saved ? "happy" : "idle"} size={120} level={L.level} /></div>
        <h1>{t.settings}</h1>
        <div className="style-row">
          <span className="faint">{d.yourStyle}</span>
          <div className="style-chips">{user.style?.length ? user.style.map((s) => <span key={s} className="style-chip sm"><span aria-hidden="true">{STYLE_ICON[s]}</span>{d.styles[s]}</span>) : <span className="faint">–</span>}</div>
          <button type="button" className="linkbtn" onClick={onRetake}>{d.retake}</button>
        </div>
        <label>{t.nickname}<input value={f.name} maxLength={40} onChange={set("name")} /></label>
        <label>{t.uiLang}<select value={f.ui_lang} onChange={set("ui_lang")}>{Object.entries(LANG_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>{t.explainLang}<select value={f.explain_lang} onChange={set("explain_lang")}>{EXPLAIN_LANGS.map((l) => <option key={l} value={l}>{l === "auto" ? "Auto (follow my message)" : l}</option>)}</select></label>
        <label>{t.level}<select value={f.level} onChange={set("level")}>{LEVELS.map((l) => <option key={l}>{l}</option>)}</select></label>
        {err && <p className="err" role="alert">{err}</p>}
        <div className="row"><button className="btn3d">{saved ? "✓ " + t.saved : t.save}</button><button type="button" className="linkbtn" onClick={onSignOut}>{t.out}</button></div>
        <ServerChip t={t} />
        <div className="privacy">
          <p className="faint small">🔒 {t.privacyNote}</p>
          <button type="button" className={"danger-btn" + (del ? " armed" : "")} onClick={remove}>{del ? t.deleteConfirm : t.deleteAcct}</button>
        </div>
      </form>
      <AiUsage lang={user.ui_lang} />
    </section>
  );
}
