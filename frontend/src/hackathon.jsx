import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api } from "./api.js";
import { HK, DIAG } from "./i18n_hack.js";
import { Markdown } from "./md.jsx";
import { Pingo, Bubble } from "./mascot.jsx";
import { burst, burstFrom } from "./fx.jsx";
import { runTests, starter } from "./runner.js";
import { STYLE_ICON } from "./diagnostic.jsx";

const readLS = (k) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
const writeLS = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { } };
const hue = (id) => (id * 67) % 360;
const PHASES = ["lobby", "prep", "compete", "results"];
const ROUND_ICON = { quiz: "❓", coding: "⌨️", open: "📝" };

function useFlash() {
  const [flash, setFlash] = useState(null);
  const t = useRef();
  const fire = (mood, line, ms = 2200) => { clearTimeout(t.current); setFlash({ mood, line, k: Date.now() }); t.current = setTimeout(() => setFlash(null), ms); };
  useEffect(() => () => clearTimeout(t.current), []);
  return [flash, fire];
}

export function ModelBadge({ meta, h }) {
  if (!meta || !meta.tier) return null;
  const m = h.model;
  const label = meta.tier === "large" ? "🧠 " + m.large : meta.tier === "fast" ? "⚡ " + m.fast : meta.tier === "offline" ? m.offline : null;
  if (!label) return null;
  return (
    <span className={"model-badge " + meta.tier} title={meta.reasons?.length ? meta.reasons.join(", ") : undefined}>
      {label}{meta.cached ? " · ↺ " + m.cache : ""}{meta.note === "quota_low" ? " · " + m.saving : meta.fallback ? " · " + m.fallback : ""}
    </span>
  );
}

function aiLine(h, st) {
  if (!st) return null;
  if (st.stage === "indexing") return h.ai.indexing;
  if (st.stage === "quota_wait") return h.ai.quota(st.retry_in);
  if (st.stage === "pacing") return h.ai.pacing;
  if (st.stage === "queued" && st.position > 1) return h.ai.queued(st.position);
  if (st.stage === "retrying") return h.ai.retrying(st.retry_in);
  if (st.fallback) return h.ai.fallback;
  return st.tier === "large" ? h.ai.runningLarge : h.ai.running;
}

function Avatar({ m, size = 34 }) {
  return (
    <span className={"avatar-dot" + (m.online ? " online" : "")} style={{ "--h": hue(m.id), width: size, height: size }} title={m.name}>
      {(m.name || "?").slice(0, 1).toUpperCase()}
    </span>
  );
}

export function Hackathon({ lang, level, onEarned }) {
  const [code, setCode] = useState(() => readLS("athena_room") || null);
  const open = (c) => { setCode(c); writeLS("athena_room", c || ""); };
  return code
    ? <Room key={code} code={code} lang={lang} level={level} onLeave={() => open(null)} onEarned={onEarned} />
    : <HackHome lang={lang} level={level} onOpen={open} />;
}

function HackHome({ lang, level, onOpen }) {
  const h = HK[lang];
  const [rooms, setRooms] = useState(null);
  const [join, setJoin] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ title: "", topic: "", lang, rounds: ["quiz", "coding", "open"], difficulty: "undergraduate", teams: 2, prep_min: 15, compete_min: 20, quiz_n: 6, material: "" });
  const loadFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setF((x) => ({ ...x, material: String(reader.result || "").slice(0, 60000) }));
    reader.readAsText(file);
    e.target.value = "";
  };
  useEffect(() => { api("/rooms").then(setRooms).catch(() => setRooms([])); }, []);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const toggle = (r) => setF({ ...f, rounds: f.rounds.includes(r) ? f.rounds.filter((x) => x !== r) : [...f.rounds, r] });
  const doJoin = async (e) => { e.preventDefault(); setErr(""); try { onOpen((await api("/rooms/join", "POST", { code: join.trim() })).code); } catch (x) { setErr(x.message); } };
  const doCreate = async (e) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try { onOpen((await api("/rooms", "POST", { ...f, teams: +f.teams, prep_min: +f.prep_min, compete_min: +f.compete_min, quiz_n: +f.quiz_n })).code); }
    catch (x) { setErr(x.message); setBusy(false); }
  };
  return (
    <section className="page hack-home">
      <div className="hk-hero">
        <div className="hk-hero-copy">
          <h1>{h.title}</h1>
          <p>{h.lede}</p>
          <ol className="hk-steps">{["prep", "compete", "results"].map((p, i) => <li key={p}><b>{i + 1}</b>{h.phases[p]}</li>)}</ol>
        </div>
        <div className="hk-hero-pingo"><Pingo mood="wave" size={170} level={Math.max(level, 4)} /></div>
      </div>
      {err && <p className="err center" role="alert">{err}</p>}
      <div className="hk-grid">
        <form className="card hk-join" onSubmit={doJoin}>
          <h2>{h.join}</h2>
          <input className="code-input" value={join} maxLength={6} placeholder={h.codePh} aria-label={h.join}
            onChange={(e) => setJoin(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} />
          <button className="btn3d wide" disabled={join.length < 6}>{h.joinBtn}</button>
          {rooms?.length > 0 && <h3 className="hk-yours">{h.yours}</h3>}
          <ul className="room-list">
            {rooms?.map((r) => (
              <li key={r.code}><button onClick={() => onOpen(r.code)}>
                <strong dir="auto">{r.title}</strong><span dir="auto">{r.topic}</span>
                <span className={"phase-pill " + r.phase}>{h.phases[r.phase]}</span>
              </button></li>
            ))}
          </ul>
          {rooms?.length === 0 && <p className="faint small">{h.none}</p>}
        </form>
        <form className="card hk-create" onSubmit={doCreate}>
          <h2>{h.create}</h2>
          <label>{h.fTitle}<input required maxLength={80} value={f.title} placeholder={h.fTitlePh} onChange={set("title")} dir="auto" /></label>
          <label>{h.fTopic}<input required minLength={2} maxLength={160} value={f.topic} placeholder={h.fTopicPh} onChange={set("topic")} dir="auto" /></label>
          <label>{h.fMaterial}
            <textarea rows={4} maxLength={60000} value={f.material} placeholder={h.fMaterialHint} onChange={set("material")} dir="auto" />
            <span className="material-row">
              <span className="file-btn"><input type="file" accept=".txt,.md,.markdown,.csv,text/plain" onChange={loadFile} aria-label={h.upload} />📄 {h.upload}</span>
              {f.material && <small className="faint">{f.material.length.toLocaleString()} / 60 000</small>}
            </span>
          </label>
          <fieldset className="rounds-pick">
            <legend>{h.fRounds}</legend>
            {["quiz", "coding", "open"].map((r) => (
              <button type="button" key={r} className={"round-opt" + (f.rounds.includes(r) ? " on" : "")} aria-pressed={f.rounds.includes(r)} onClick={() => toggle(r)}>
                <span aria-hidden="true">{ROUND_ICON[r]}</span><strong>{h.rounds[r]}</strong><small>{h.roundDesc[r]}</small>
              </button>
            ))}
          </fieldset>
          <div className="form-row">
            <label>{h.fLang}<select value={f.lang} onChange={set("lang")}><option value="en">English</option><option value="fr">Français</option><option value="ar">العربية</option></select></label>
            <label>{h.fLevel}<select value={f.difficulty} onChange={set("difficulty")}>{Object.entries(h.levels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          </div>
          <div className="form-row four">
            <label>{h.fTeams}<input type="number" min="1" max="6" value={f.teams} onChange={set("teams")} /></label>
            <label>{h.fPrep}<input type="number" min="1" max="240" value={f.prep_min} onChange={set("prep_min")} /></label>
            <label>{h.fCompete}<input type="number" min="1" max="240" value={f.compete_min} onChange={set("compete_min")} /></label>
            {f.rounds.includes("quiz") && <label>{h.fQuizN}<input type="number" min="3" max="12" value={f.quiz_n} onChange={set("quiz_n")} /></label>}
          </div>
          <button className="btn3d gold wide" disabled={busy || !f.rounds.length}>{h.createBtn}</button>
        </form>
      </div>
    </section>
  );
}

function useRoom(code) {
  const [s, setS] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [err, setErr] = useState(null);
  const since = useRef(0); const poke = useRef(() => {});
  useEffect(() => {
    let alive = true, timer;
    const tick = async () => {
      clearTimeout(timer);
      try {
        const st = await api(`/rooms/${code}?since=${since.current}`);
        if (!alive) return;
        if (st.messages.length) { since.current = st.messages[st.messages.length - 1].id; setMsgs((m) => [...m, ...st.messages]); }
        setS(st); setErr(null);
      } catch (e) { if (alive) setErr(e); }
      finally { if (alive) timer = setTimeout(tick, document.hidden ? 5000 : 1500); }
    };
    poke.current = tick; tick();
    return () => { alive = false; clearTimeout(timer); };
  }, [code]);
  return { s, msgs, err, refresh: () => poke.current() };
}

function useCountdown(ends, serverNow) {
  const [now, setNow] = useState(Date.now());
  const offset = useRef(0);
  useEffect(() => { if (serverNow) offset.current = serverNow * 1000 - Date.now(); }, [serverNow]);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  if (!ends) return null;
  return Math.max(0, Math.round(ends - (now + offset.current) / 1000));
}
const mmss = (sec) => `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;

function Room({ code, lang, level, onLeave, onEarned }) {
  const h = HK[lang];
  const { s, msgs, err, refresh } = useRoom(code);
  const [flash, fire] = useFlash();
  const [copied, setCopied] = useState(false);
  const left = useCountdown(s?.phase_ends, s?.now);
  const prevPhase = useRef(null);
  useEffect(() => {
    if (!s) return;
    if (prevPhase.current && prevPhase.current !== s.phase) {
      if (s.phase === "compete") fire("celebrate", h.phases.compete + "!", 2400);
      if (s.phase === "results") onEarned?.();
    }
    prevPhase.current = s.phase;
  }, [s?.phase]);
  if (!s) {
    return (
      <section className="page center-page">
        <Pingo mood={err ? "oops" : "waiting"} size={130} level={level} />
        {err && <><p className="err">{err.message}</p><button className="btn3d" onClick={onLeave}>{h.back}</button></>}
      </section>
    );
  }
  const next = { lobby: "prep", prep: "compete", compete: "results" }[s.phase];
  const nextLabel = { prep: h.startPrep, compete: h.startCompete, results: h.finish }[next];
  const advance = async () => { try { await api(`/rooms/${code}/phase`, "POST", { phase: next }); refresh(); } catch (x) { fire("oops", x.message, 3000); } };
  const copy = () => { navigator.clipboard?.writeText(s.code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {}); };
  const ctx = { h, s, msgs, code, refresh, lang, level, fire, flash, onEarned };
  return (
    <section className={"room phase-" + s.phase}>
      <header className="room-head">
        <button className="iconbtn back" onClick={onLeave} aria-label={h.back}>
          <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M12.5 4.5 7 10l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <div className="room-title"><h1 dir="auto">{s.title}</h1><p dir="auto">{s.topic}</p></div>
        <ol className="stepper" aria-label="Phases">
          {PHASES.map((p, i) => {
            const idx = PHASES.indexOf(s.phase);
            return <li key={p} className={i < idx ? "done" : i === idx ? "now" : ""} aria-current={i === idx ? "step" : undefined}><span>{i < idx ? "✓" : i + 1}</span>{h.phases[p]}</li>;
          })}
        </ol>
        {left !== null && <div className={"timer" + (left < 60 ? " hurry" : "")} role="timer" aria-label={mmss(left) + " " + h.left}>⏱ {mmss(left)}</div>}
        <button className="code-chip" onClick={copy} title={h.share}>{copied ? h.copied : s.code}</button>
        {s.is_host && next && <button className="btn3d sm gold" onClick={advance}>{nextLabel}</button>}
      </header>
      {s.phase === "lobby" && <Lobby {...ctx} />}
      {s.phase === "prep" && <Prep {...ctx} />}
      {s.phase === "compete" && <Compete {...ctx} />}
      {s.phase === "results" && <Results {...ctx} />}
    </section>
  );
}

function Lobby({ h, s, code, refresh, lang, level, fire, flash }) {
  const d = DIAG[lang];
  const st = s.content.status;
  const gen = s.generating;
  const line = st !== "ready" ? (gen && ["indexing", "quota_wait", "pacing", "retrying"].includes(gen.stage) ? aiLine(h, gen) : gen?.stage === "queued" && gen.position > 1 ? h.genQueued(gen.position) : h.generating)
    : s.content.offline ? h.genOffline : s.content.meta?.fallback ? h.genFallback : h.genReady;
  const switchTeam = async (t) => { try { await api(`/rooms/${code}/team`, "POST", { team: t }); refresh(); } catch (x) { fire("oops", x.message, 2600); } };
  return (
    <div className="lobby">
      <div className="team-grid">
        {Array.from({ length: s.teams }, (_, i) => i + 1).map((t) => {
          const mem = s.members.filter((m) => m.team === t);
          const mine = t === s.my_team;
          return (
            <div key={t} className={"team-card" + (mine ? " mine" : "")} style={{ "--th": (t * 83) % 360 }}>
              <div className="team-head"><h3>{h.team(t)}</h3>{mine && <span className="you-pill">{h.yourTeam}</span>}</div>
              <ul>
                {mem.map((m) => (
                  <li key={m.id}><Avatar m={m} /><span className="m-name" dir="auto">{m.name}{m.id === s.me ? ` (${h.you})` : ""}{m.host ? ` · ${h.host}` : ""}</span>
                    <span className="m-style" title={m.style.map((x) => d.styles[x]).join(", ")}>{m.style.map((x) => STYLE_ICON[x]).join(" ")}</span></li>
                ))}
                {Array.from({ length: Math.max(0, 3 - mem.length) }, (_, k) => <li key={"e" + k} className="empty-seat"><span className="avatar-dot empty" /></li>)}
              </ul>
              {!mine && (mem.length < 3 ? <button className="btn3d ghost sm wide" onClick={() => switchTeam(t)}>{h.joinTeam}</button> : <span className="faint small">{h.full}</span>)}
            </div>
          );
        })}
      </div>
      <aside className="card lobby-side">
        <div className="lobby-pingo">
          <Bubble key={flash?.k || line}>{flash?.line || line}</Bubble>
          <Pingo mood={flash?.mood || (st === "ready" ? "happy" : "thinking")} size={150} level={level} />
        </div>
        {s.content.material && <p className="material-info">{h.materialInfo(s.content.material.chunks, s.content.material.search)}</p>}
        <ul className="round-list">
          {s.rounds.map((r) => <li key={r}><span aria-hidden="true">{ROUND_ICON[r]}</span><div><strong>{h.rounds[r]}</strong><small>{h.roundDesc[r]}</small></div></li>)}
        </ul>
        <p className="share-line">{h.share}: <b className="big-code">{s.code}</b></p>
        {!s.is_host && <p className="faint center">{h.waitHost}</p>}
      </aside>
    </div>
  );
}

function Brief({ h, brief }) {
  const [shown, setShown] = useState({});
  if (!brief) return null;
  return (
    <div className="card brief">
      <h2>{h.brief}</h2>
      <div className="brief-sum"><Markdown text={brief.summary || ""} /></div>
      <h3>{h.keyPoints}</h3>
      <ul className="kp">{(brief.key_points || []).map((k, i) => <li key={i}><Markdown text={k} /></li>)}</ul>
      {brief.pitfalls?.length > 0 && <><h3>{h.pitfalls}</h3><ul className="pit">{brief.pitfalls.map((k, i) => <li key={i}><Markdown text={k} /></li>)}</ul></>}
      {brief.practice?.length > 0 && <><h3>{h.practice}</h3>
        <ol className="prac">{brief.practice.map((p, i) => (
          <li key={i}><Markdown text={p.q} />
            {shown[i] ? <div className="prac-a"><Markdown text={p.a} /></div> : <button className="linkbtn" onClick={() => setShown({ ...shown, [i]: true })}>{h.reveal}</button>}</li>
        ))}</ol></>}
    </div>
  );
}

function Participation({ h, s, level }) {
  const mine = s.members.filter((m) => m.team === s.my_team);
  const max = Math.max(1, ...mine.map((m) => m.messages));
  return (
    <div className="card participation">
      <h3>{h.participation}</h3>
      <ul>{mine.map((m) => (
        <li key={m.id}><Avatar m={m} size={28} /><span className="m-name" dir="auto">{m.name}</span>
          <span className="pbar"><span style={{ width: (m.messages / max) * 100 + "%", background: `hsl(${hue(m.id)} 70% 55%)` }} /></span><b>{m.messages}</b></li>
      ))}</ul>
      <p className="faint small">{h.balanceHint}</p>
    </div>
  );
}

function TeamChat({ h, s, msgs, code, refresh, lang, level, fire, compact }) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState("none");
  const [anon, setAnon] = useState(false);
  const [busy, setBusy] = useState(false);
  const list = useRef(); const ta = useRef();
  useEffect(() => { const el = list.current; if (el) el.scrollTop = el.scrollHeight; }, [msgs.length, s.ai_status]);
  useLayoutEffect(() => { const el = ta.current; if (!el) return; el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 160) + "px"; }, [text]);
  const send = async () => {
    const content = text.trim(); if (!content || busy) return;
    setBusy(true);
    try { await api(`/rooms/${code}/msg`, "POST", { content, anon, ai: mode }); setText(""); refresh(); }
    catch (x) { fire("oops", x.message, 3000); } finally { setBusy(false); }
  };
  const status = aiLine(h, s.ai_status);
  return (
    <div className={"card team-chat" + (compact ? " compact" : "")}>
      <h3>{h.teamChat} <span className="faint small">{h.team(s.my_team)}</span></h3>
      <div className="tc-list" ref={list} aria-live="polite">
        {msgs.map((m) => {
          if (m.kind === "chat") return (
            <div key={m.id} className={"tc-msg" + (m.mine ? " mine" : "")}>
              <span className="tc-author">{m.anon ? <i>🕶️ {m.mine ? `${h.you} (${h.anonTag})` : h.anonTag}</i> : m.mine ? h.you : m.author}
                {m.meta?.ai === "ask" && <span className="tc-tag">🐧 {h.askPingo}</span>}{m.meta?.ai === "check" && <span className="tc-tag">✅ {h.check}</span>}</span>
              <p dir="auto">{m.content}</p>
            </div>);
          return (
            <div key={m.id} className={"tc-msg pingo " + m.kind}>
              <span className="tc-pingo"><Pingo still size={26} level={level} interactive={false} /></span>
              <div className="tc-body" dir="auto"><Markdown text={m.content} /><ModelBadge meta={m.meta} h={h} /></div>
            </div>);
        })}
        {status && <div className="tc-msg pingo thinking"><span className="tc-pingo"><Pingo mood="thinking" size={30} level={level} interactive={false} /></span><div className="tc-body"><p>{status}</p></div></div>}
      </div>
      <div className="tc-compose">
        <div className="seg" role="radiogroup" aria-label={h.teamChat}>
          {[["none", "💬 " + h.teamChat], ["ask", "🐧 " + h.askPingo], ["check", "✅ " + h.check]].map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={mode === k} className={mode === k ? "on" : ""} onClick={() => setMode(k)}>{label}</button>
          ))}
        </div>
        <div className="tc-input">
          <textarea ref={ta} dir="auto" rows={1} value={text} placeholder={h.modeHint[mode]} aria-label={h.modeHint[mode]} maxLength={3000}
            onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} />
          <button className="send" disabled={!text.trim() || busy} onClick={send} aria-label={h.send}>
            <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M10 15.5V4.5M5 9.5l5-5 5 5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>
        <label className={"anon-toggle" + (anon ? " on" : "")}><input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} />🕶️ {h.anon}</label>
      </div>
    </div>
  );
}

function Prep(ctx) {
  const { h, s, level, flash } = ctx;
  return (
    <div className="prep">
      <Brief h={h} brief={s.content.brief} />
      <TeamChat {...ctx} />
      <div className="prep-side">
        <div className="card side-pingo">
          {flash && <Bubble key={flash.k}>{flash.line}</Bubble>}
          <Pingo mood={flash?.mood || (s.ai_status ? "thinking" : "listening")} size={120} level={level} />
        </div>
        <Participation h={h} s={s} level={level} />
      </div>
    </div>
  );
}

function Scoreboard({ h, s }) {
  const max = Math.max(1, ...s.scoreboard.map((t) => t.score));
  return (
    <div className="card scoreboard">
      <h3>🏆 {h.scoreboard}</h3>
      <ol>{s.scoreboard.map((t, i) => (
        <li key={t.team} className={t.team === s.my_team ? "mine" : ""}>
          <span className="rank">{["🥇", "🥈", "🥉"][i] || i + 1}</span>
          <span className="sb-name">{h.team(t.team)}{t.team === s.my_team && <small> · {h.yourTeam}</small>}</span>
          <span className="sb-bar"><span style={{ width: (t.score / max) * 100 + "%" }} /></span>
          <b>{t.score}</b>
        </li>
      ))}</ol>
    </div>
  );
}

function QuizRound({ h, s, code, refresh, fire, onEarned }) {
  const quiz = s.content.quiz || [];
  const [pending, setPending] = useState(null);
  const answer = async (i, choice, el) => {
    setPending(i);
    try {
      const r = await api(`/rooms/${code}/quiz`, "POST", { item: i, choice });
      if (r.correct) { fire("happy", h.correct, 1800); burstFrom(el, 0.6); onEarned?.(); } else fire("oops", h.wrong, 1800);
      refresh();
    } catch (x) { fire("oops", x.message, 2600); } finally { setPending(null); }
  };
  return (
    <div className="quiz">
      <p className="lock-note">🤝 {h.lockNote}</p>
      {quiz.map((q, i) => {
        const sub = s.subs[`quiz:${i}`];
        const chosen = sub ? +sub.answer : null;
        return (
          <div key={i} className={"quiz-card" + (sub ? (sub.score > 0 ? " right" : " wrong") : "")}>
            <div className="qn">{i + 1}</div>
            <div className="qbody">
              <div className="qtext" dir="auto"><Markdown text={q.q} /></div>
              <div className="qopts">
                {q.options.map((o, k) => (
                  <button key={k} disabled={!!sub || pending === i} dir="auto"
                    className={"qopt" + (sub && k === q.answer ? " correct" : "") + (sub && k === chosen && k !== q.answer ? " chosen-wrong" : "")}
                    onClick={(e) => answer(i, k, e.currentTarget)}>
                    <span className="qkey">{"ABCD"[k]}</span><Markdown text={o} />
                  </button>
                ))}
              </div>
              {sub && <p className="qexplain" dir="auto">{sub.score > 0 ? "✓" : "✗"} {q.explain} <small className="faint">({h.answeredBy(sub.by || "?")})</small></p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const fmtArg = (v, lang) => lang === "python" ? JSON.stringify(v).replace(/\btrue\b/g, "True").replace(/\bfalse\b/g, "False").replace(/\bnull\b/g, "None") : JSON.stringify(v);

function CodingRound({ h, s, code, refresh, lang: uiLang, fire, onEarned }) {
  const probs = s.content.coding || [];
  const [sel, setSel] = useState(probs[0]?.id);
  const [plang, setPlang] = useState(() => readLS("athena_plang") || "python");
  const p = probs.find((x) => x.id === sel) || probs[0];
  const key = (pid, l) => `athena_code_${code}_${pid}_${l}`;
  const [src, setSrc] = useState("");
  const [res, setRes] = useState(null);
  const [running, setRunning] = useState(false);
  const [loadingPy, setLoadingPy] = useState(false);
  const [coach, setCoach] = useState(null);
  useEffect(() => { if (p) { setSrc(readLS(key(p.id, plang)) || starter(plang, p.fn, p.params)); setRes(null); setCoach(null); } }, [p?.id, plang]);
  if (!p) return null;
  const edit = (v) => { setSrc(v); writeLS(key(p.id, plang), v); };
  const run = async () => { setRunning(true); const r = await runTests({ lang: plang, code: src, fn: p.fn, tests: p.tests, onLoading: setLoadingPy }); setRes(r); setRunning(false); return r; };
  const submit = async (e) => {
    const el = e.currentTarget;
    const r = await run();
    try {
      const out = await api(`/rooms/${code}/code`, "POST", { item: p.id, lang: plang, code: src, passed: r.passed, total: r.total });
      if (r.passed === r.total) { fire("celebrate", h.submitted(out.score, out.max), 2400); burstFrom(el, 0.9); onEarned?.(); }
      else fire(r.passed ? "happy" : "oops", h.submitted(out.score, out.max), 2200);
      refresh();
    } catch (x) { fire("oops", x.message, 2600); }
  };
  const ask = async (kind) => {
    setCoach({ kind, text: null });
    try { const r = await api(`/rooms/${code}/coach?kind=${kind}`, "POST", { item: p.id, code: src, lang: plang }); setCoach({ kind, text: r.text, meta: r.meta }); }
    catch (x) { setCoach({ kind, text: x.message, error: true }); }
  };
  const onKey = (e) => {
    if (e.key !== "Tab") return;
    e.preventDefault();
    const t = e.currentTarget, a = t.selectionStart, b = t.selectionEnd, ind = plang === "python" ? "    " : "  ";
    const v = src.slice(0, a) + ind + src.slice(b); edit(v);
    requestAnimationFrame(() => { t.selectionStart = t.selectionEnd = a + ind.length; });
  };
  const sub = s.subs[`coding:${p.id}`];
  const L = (o) => o[uiLang] || o.en;
  return (
    <div className="coding">
      <div className="prob-tabs">
        {probs.map((x) => {
          const b = s.subs[`coding:${x.id}`];
          return (
            <button key={x.id} className={"prob-tab" + (x.id === p.id ? " on" : "") + (b && b.score === b.max ? " solved" : "")} onClick={() => setSel(x.id)}>
              <strong>{L(x.title)}</strong><span>{b ? `${Math.round(b.score)}/${x.points}` : `${x.points} ${h.pts}`}</span>
            </button>
          );
        })}
      </div>
      <div className="prob">
        <div className="prob-text">
          <h3>{L(p.title)}</h3>
          <div dir="auto"><Markdown text={L(p.text)} /></div>
          <h4>{h.examples}</h4>
          <ul className="examples">
            {p.tests.slice(0, 2).map(([args, exp], i) => <li key={i} dir="ltr"><code>{p.fn}({args.map((a) => fmtArg(a, plang)).join(", ")})</code> → <code>{fmtArg(exp, plang)}</code></li>)}
          </ul>
          <p className="faint small">{h.hidden(p.tests.length - 2)}</p>
          {sub && <p className="best">{h.best}: <b>{Math.round(sub.score)}/{p.points}</b></p>}
        </div>
        <div className="editor">
          <div className="editor-bar">
            <div className="seg small">{["python", "javascript"].map((l) => <button key={l} className={plang === l ? "on" : ""} onClick={() => { setPlang(l); writeLS("athena_plang", l); }}>{l === "python" ? "Python" : "JavaScript"}</button>)}</div>
            <div className="editor-actions">
              <button className="btn3d ghost sm" onClick={() => ask("hint")}>💡 {h.hint}</button>
              <button className="btn3d ghost sm" onClick={() => ask("review")}>🔍 {h.review}</button>
            </div>
          </div>
          <textarea className="code-editor" dir="ltr" spellCheck={false} autoCapitalize="off" autoCorrect="off" value={src}
            onChange={(e) => edit(e.target.value)} onKeyDown={onKey} aria-label={L(p.title)} />
          <div className="editor-run">
            <button className="btn3d ghost sm" disabled={running} onClick={run}>▶ {h.run}</button>
            <button className="btn3d green sm" disabled={running} onClick={submit}>{h.submit}</button>
            {loadingPy && <span className="faint small">{h.loadingPy}</span>}
          </div>
          {res && (
            <div className={"test-results" + (res.passed === res.total ? " allgood" : "")}>
              <strong>{res.fatal ? "⚠️ " + res.fatal : h.passed(res.passed, res.total)}</strong>
              {!res.fatal && <ul>{res.results.map((r, i) => (
                <li key={i} className={r.ok ? "ok" : "ko"} dir="ltr">{r.ok ? "✓" : "✗"} {i < 2
                  ? <><code>{p.fn}({p.tests[i][0].map((a) => fmtArg(a, plang)).join(", ")})</code>{!r.ok && <> → <code>{r.error || fmtArg(r.got, plang)}</code> ≠ <code>{fmtArg(p.tests[i][1], plang)}</code></>}</>
                  : <>{h.hiddenTest} #{i + 1}{!r.ok && r.error ? <> → <code>{r.error}</code></> : ""}</>}</li>
              ))}</ul>}
            </div>
          )}
          {coach && (
            <div className="coach">
              <span className="tc-pingo"><Pingo mood={coach.text ? "talking" : "thinking"} size={30} interactive={false} /></span>
              <div>{coach.text ? <><Markdown text={coach.text} /><ModelBadge meta={coach.meta} h={h} /></> : <p className="faint">{h.ai.running}</p>}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function OpenRound({ h, s, code, refresh, level, fire }) {
  const prob = s.content.open;
  const sub = s.subs["open:0"];
  const [text, setText] = useState(() => readLS(`athena_open_${code}`));
  const [busy, setBusy] = useState(false);
  const prevStatus = useRef(sub?.status);
  useEffect(() => {
    if (prevStatus.current === "judging" && sub?.status === "done") {
      const pct = sub.score / sub.max;
      fire(pct >= 0.7 ? "celebrate" : pct >= 0.4 ? "happy" : "oops", `${Math.round(sub.score)}/${sub.max} ${h.pts}`, 2800);
      if (pct >= 0.7) burst(innerWidth / 2, innerHeight / 2, 1);
    }
    prevStatus.current = sub?.status;
  }, [sub?.status]);
  if (!prob) return null;
  const submit = async () => {
    setBusy(true);
    try { await api(`/rooms/${code}/open`, "POST", { answer: text.trim() }); refresh(); } catch (x) { fire("oops", x.message, 3000); } finally { setBusy(false); }
  };
  return (
    <div className="open-round">
      <div className="open-prob">
        <h3 dir="auto">{prob.title}</h3>
        <div dir="auto"><Markdown text={prob.prompt} /></div>
        <h4>{h.rubric}</h4>
        <ul className="rubric">{prob.rubric.map((r, i) => <li key={i}><strong dir="auto">{r.name}</strong><span dir="auto">{r.what}</span></li>)}</ul>
      </div>
      {!sub ? (
        <div className="open-answer">
          <p className="faint small">{h.oneShot}</p>
          <textarea dir="auto" rows={9} value={text} placeholder={h.openPh} maxLength={6000} onChange={(e) => { setText(e.target.value); writeLS(`athena_open_${code}`, e.target.value); }} />
          <button className="btn3d gold" disabled={busy || text.trim().length < 20} onClick={submit}>{h.submitOpen}</button>
        </div>
      ) : sub.status === "judging" ? (
        <div className="judging"><Pingo mood="thinking" size={120} level={level} /><p>{aiLine(h, s.ai_status) || h.judging}</p></div>
      ) : (
        <div className="verdict">
          <div className="verdict-score"><b>{Math.round(sub.score)}</b>/{sub.max} {h.pts}</div>
          <ul>{(sub.feedback?.scores || []).map((x, i) => (
            <li key={i}><span dir="auto">{x.name}</span><span className="vbar"><span style={{ width: x.score * 10 + "%" }} /></span><b>{x.score}/10</b><small dir="auto">{x.comment}</small></li>
          ))}</ul>
          {sub.feedback?.strength && <p dir="auto"><b>💪 {h.strength}:</b> {sub.feedback.strength}</p>}
          {sub.feedback?.improve && <p dir="auto"><b>🎯 {h.improve}:</b> {sub.feedback.improve}</p>}
          <ModelBadge meta={sub.feedback?.meta} h={h} />
        </div>
      )}
    </div>
  );
}

function Compete(ctx) {
  const { h, s, level, flash } = ctx;
  const [tab, setTab] = useState(s.rounds[0]);
  const mine = s.scoreboard.find((t) => t.team === s.my_team) || {};
  return (
    <div className="compete">
      <div className="compete-main">
        <div className="round-tabs" role="tablist">
          {s.rounds.map((r) => (
            <button key={r} role="tab" aria-selected={tab === r} className={tab === r ? "on" : ""} onClick={() => setTab(r)}>
              <span aria-hidden="true">{ROUND_ICON[r]}</span>{h.rounds[r]}<b>{mine[r] || 0}</b>
            </button>
          ))}
        </div>
        <div className="round-body card">
          {tab === "quiz" && <QuizRound {...ctx} />}
          {tab === "coding" && <CodingRound {...ctx} />}
          {tab === "open" && <OpenRound {...ctx} />}
        </div>
      </div>
      <aside className="compete-side">
        <div className="card side-pingo">
          {flash && <Bubble key={flash.k}>{flash.line}</Bubble>}
          <Pingo mood={flash?.mood || "idle"} size={110} level={level} />
        </div>
        <Scoreboard h={h} s={s} />
        <TeamChat {...ctx} compact />
      </aside>
    </div>
  );
}

function Results({ h, s, level, lang }) {
  const board = s.scoreboard;
  const winner = board[0];
  const iWon = winner && winner.team === s.my_team && winner.score > 0;
  useEffect(() => { const id = setTimeout(() => burst(innerWidth / 2, innerHeight * 0.35, iWon ? 2 : 1), 400); return () => clearTimeout(id); }, []);
  const podium = [board[1], board[0], board[2]].filter(Boolean);
  const totals = (t) => s.members.filter((m) => m.team === t.team);
  const maxMsg = Math.max(1, ...s.members.map((m) => m.messages));
  return (
    <div className="results">
      <div className="podium">
        {podium.map((t) => {
          const place = board.indexOf(t) + 1;
          return (
            <div key={t.team} className={"pod p" + place + (t.team === s.my_team ? " mine" : "")}>
              {place === 1 && <Pingo mood="celebrate" size={150} level={Math.max(5, level)} />}
              <div className="pod-names" dir="auto">{totals(t).map((m) => m.name).join(", ")}</div>
              <div className="pod-block"><span className="medal">{["🥇", "🥈", "🥉"][place - 1]}</span><strong>{h.team(t.team)}</strong><b>{t.score} {h.pts}</b></div>
            </div>
          );
        })}
      </div>
      <div className="results-grid">
        <div className="card notes">
          <h2>📒 {h.notes}</h2>
          {!s.notes || s.notes.status !== "ready"
            ? <div className="judging"><Pingo mood="thinking" size={90} level={level} /><p>{h.notesWriting}</p></div>
            : <><div dir="auto"><Markdown text={s.notes.text || ""} /></div><ModelBadge meta={s.notes.meta} h={h} /></>}
        </div>
        <div className="card analytics">
          <h2>📊 {h.analytics}</h2>
          <table className="rtable">
            <thead><tr><th></th>{s.rounds.map((r) => <th key={r}>{ROUND_ICON[r]} {h.rounds[r]}</th>)}<th>Σ</th></tr></thead>
            <tbody>{board.map((t) => <tr key={t.team} className={t.team === s.my_team ? "mine" : ""}><th>{h.team(t.team)}</th>{s.rounds.map((r) => <td key={r}>{t[r]}</td>)}<td><b>{t.score}</b></td></tr>)}</tbody>
          </table>
          <h3>{h.participation}</h3>
          <ul className="part-all">{s.members.map((m) => (
            <li key={m.id}><Avatar m={m} size={26} /><span className="m-name" dir="auto">{m.name}</span><small className="faint">{h.team(m.team)}</small>
              <span className="pbar"><span style={{ width: (m.messages / maxMsg) * 100 + "%", background: `hsl(${hue(m.id)} 70% 55%)` }} /></span>
              <b title={h.messages}>{m.messages}</b><small className="faint" title={h.askedAi}>🐧 {m.asked_ai}</small></li>
          ))}</ul>
        </div>
      </div>
    </div>
  );
}

export function AiUsage({ lang }) {
  const h = HK[lang] || HK.en;
  const x = h.mx;
  const [m, setM] = useState(null);
  const [health, setHealth] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = () => {
      api("/ai/metrics").then((d) => alive && setM(d)).catch(() => {});
      api("/health").then((d) => alive && setHealth(d.ai)).catch(() => {});
    };
    load();
    const id = setInterval(load, 10000);
    return () => { alive = false; clearInterval(id); };
  }, []);
  if (!m) return null;
  const check = health?.models_check;
  const modelLine = (label, name, ok) => (
    <li key={label}><span>{label}</span><code>{name || "–"}</code>
      {name && check && <b className={ok ? "ok" : "ko"}>{!check.reachable ? x.unreachable : ok ? "✓ " + x.found : "✗ " + x.missing}</b>}</li>
  );
  const ref = (label, n, parts) => (
    <li key={label}><span>{label}</span><b>{n}</b>{parts.filter(([, v]) => v).map(([k, v]) => <small key={k}>{v} {k}</small>)}</li>
  );
  return (
    <section className="card ai-usage">
      <h2>{x.title}</h2>
      <p className="faint small">{x.sub}</p>
      <div className="mx-grid">
        <div className="mx-tile"><span>{x.calls}</span><b>{m.calls.compact + m.calls.midsize}</b><small>{x.compact} {m.calls.compact} · {x.midsize} {m.calls.midsize}</small></div>
        <div className="mx-tile"><span>{x.cache}</span><b>{m.cache_hits}</b></div>
        <div className="mx-tile"><span>{x.tokens}</span><b>{(m.tokens.compact[0] + m.tokens.midsize[0]).toLocaleString()} / {(m.tokens.compact[1] + m.tokens.midsize[1]).toLocaleString()}</b></div>
        <div className="mx-tile"><span>{x.remaining}</span><b className={m.quota_low ? "low" : ""}>{m.quota.remaining ?? "–"}{m.quota.limit ? " / " + m.quota.limit : ""}</b></div>
      </div>
      <div className="mx-split" aria-label={x.split}>
        <span style={{ width: (m.split.compact || 0) + "%" }}>{m.split.compact ? `${x.compact} ${m.split.compact}%` : ""}</span>
        <span style={{ width: (m.split.midsize || 0) + "%" }}>{m.split.midsize ? `${x.midsize} ${m.split.midsize}%` : ""}</span>
      </div>
      <p className="faint small">{x.latency}: {x.compact} {m.latency_ms.compact} ms · {x.midsize} {m.latency_ms.midsize} ms · {x.embeds}: {m.calls.embeddings}</p>
      <h3>{x.refusals}</h3>
      <ul className="mx-list">
        {ref(x.quota, m.refusals.quota, [[x.waited, m.handled.quota_waited], [x.gaveUp, m.handled.quota_gave_up]])}
        {ref(x.saturated, m.refusals.saturated, [[x.retried, m.handled.retried], [x.fellBack, m.handled.fell_back]])}
        {ref(x.ceiling, m.refusals.ceiling, [[x.fixed, m.handled.ceiling_fixed]])}
        {m.downgraded > 0 && <li><span>{x.downgraded}</span><b>{m.downgraded}</b></li>}
      </ul>
      {health && (
        <>
          <h3>{x.models}</h3>
          <ul className="mx-list">
            {modelLine(x.compact, health.compact, check?.compact_ok)}
            {modelLine(x.midsize, health.midsize, check?.midsize_ok)}
            {health.embeddings && modelLine(x.embeddings, health.embeddings, check?.embeddings_ok)}
          </ul>
        </>
      )}
    </section>
  );
}
