import { createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { Pingo } from "/src/mascot.jsx";
import { GardenScene } from "/src/garden.jsx";
import { Petals, burst } from "/src/fx.jsx";
import { T } from "/src/i18n.js";

const W = 1440, H = 810, t0 = T.en;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ss = (a, b, x) => { const p = clamp((x - a) / (b - a)); return p * p * (3 - 2 * p); };
const lerp = (a, b, p) => a + (b - a) * p;
const pop = (a, d, x) => { const p = clamp((x - a) / d); return 1 + 2.7 * Math.pow(p - 1, 3) + 1.7 * Math.pow(p - 1, 2); };
function keys(list, t) {
  if (t <= list[0][0]) return list[0].slice(1);
  for (let i = 0; i < list.length - 1; i++) if (t < list[i + 1][0]) { const p = ss(list[i][0], list[i + 1][0], t); return list[i].slice(1).map((v, k) => lerp(v, list[i + 1][k + 1], p)); }
  return list[list.length - 1].slice(1);
}
const WIN = { x: 22, y: 14, s: 0.86 };

// t, x, y, s of the camera inside the site window (site coordinates).
const CAM = [[22, 0, 0, 1], [36.9, 0, 0, 1], [37.0, 0, 0, 1], [42.6, 0, 0, 1], [43.6, 330, 60, 1.4], [45.1, 330, 60, 1.4], [45.7, 0, 0, 1],
  [56.0, 0, 0, 1], [64.6, 0, 0, 1], [65.4, 180, 120, 1.3], [69.2, 180, 120, 1.3], [69.9, 0, 0, 1]];
const CL = -2.2; // the closing starts 2.2 s earlier than in the first cut

const ACTIONS = window.__ACTIONS = [
  { t: 23.4, bodyScroll: "#what", d: 1.1 }, { t: 25.0, bodyScroll: "#crowns", d: 1.0 }, { t: 26.5, bodyScroll: 0, d: 0.7 },
  { t: 27.0, move: ".hero-ctas button.btn3d.big", d: 0.5 }, { t: 27.6, click: ".hero-ctas button.btn3d.big" },
  { t: 28.2, type: [".sheet form input", 0], text: "lina.codes", d: 0.9 },
  { t: 29.3, type: [".sheet form input", 1], text: "Lina", d: 0.5 },
  { t: 30.0, type: [".sheet form input", 2], text: "demo-only-pw", d: 0.7 },
  { t: 30.8, move: ".sheet form button.btn3d.wide", d: 0.4 }, { t: 31.3, click: ".sheet form button.btn3d.wide" },
  { t: 32.6, move: [".diag-opt", 1], d: 0.35 }, { t: 33.0, click: [".diag-opt", 1] },
  { t: 33.5, move: [".diag-opt", 2], d: 0.3 }, { t: 33.9, click: [".diag-opt", 2] },
  { t: 34.4, move: [".diag-opt", 0], d: 0.3 }, { t: 34.8, click: [".diag-opt", 0] },
  { t: 35.3, move: [".diag-opt", 1], d: 0.3 }, { t: 35.7, click: [".diag-opt", 1] },
  { t: 36.6, type: [".diag-text textarea", 0], text: "I learn best from worked examples.", d: 0.8 },
  { t: 37.5, move: ".diag-text .btn3d", d: 0.3 }, { t: 37.8, click: ".diag-text .btn3d" },
  { t: 38.9, move: ".diag-result .btn3d", d: 0.4 }, { t: 39.4, click: ".diag-result .btn3d" },
  { t: 39.8, move: ".approach-btn", d: 0.4 }, { t: 40.3, click: ".approach-btn" },
  { t: 40.7, move: [".approach-pop button", 8], d: 0.4 }, { t: 41.2, click: [".approach-pop button", 8] },
  { t: 41.4, type: [".tablet textarea", 0], text: "I don't get multiplexers. Can you help?", d: 1.0 },
  { t: 42.1, move: ".tablet .send", d: 0.35 }, { t: 42.6, click: ".tablet .send" },
  { t: 45.6, move: [".tabs button", 1], d: 0.4 }, { t: 46.1, click: [".tabs button", 1] },
  { t: 46.6, type: ["#newgoal", 0], text: "Binary numbers", d: 0.7 },
  { t: 47.4, move: ".plant-form button", d: 0.3 }, { t: 47.8, click: ".plant-form button" },
  { t: 48.5, move: ".bed input[type=range]", d: 0.4 }, { t: 49.0, slide: ".bed input[type=range]", to: 80, d: 0.8 },
  { t: 50.0, move: ".bed-actions .btn3d.green", d: 0.4 }, { t: 50.5, click: ".bed-actions .btn3d.green" },
  { t: 55.0, move: ".levelup button", d: 0.4 }, { t: 55.5, click: ".levelup button" },
  { t: 56.1, move: [".tabs button", 2], d: 0.4 }, { t: 56.6, click: [".tabs button", 2] },
  { t: 57.1, type: [".hk-create input", 0], text: "Calculus Cup", d: 0.6 },
  { t: 57.8, type: [".hk-create input", 1], text: "Calculus basics", d: 0.6 },
  { t: 58.5, move: [".round-opt", 0], d: 0.3 }, { t: 58.8, click: [".round-opt", 0] },
  { t: 59.1, move: [".round-opt", 1], d: 0.25 }, { t: 59.4, click: [".round-opt", 1] },
  { t: 59.8, move: ".hk-create button.btn3d.wide", d: 0.4 }, { t: 60.3, click: ".hk-create button.btn3d.wide", seedTeam: true },
  { t: 62.0, move: ".room-head .btn3d.gold", d: 0.5 }, { t: 62.6, click: ".room-head .btn3d.gold" },
  { t: 65.0, move: [".seg button", 1], d: 0.4 }, { t: 65.4, click: [".seg button", 1] },
  { t: 65.7, type: [".tc-input textarea", 0], text: "Explique simplement ce qu'est une dérivée ?", d: 1.1, noMove: true },
  { t: 66.9, move: ".tc-input .send", d: 0.3 }, { t: 67.2, click: ".tc-input .send" },
  { t: 70.4, move: ".room-head .btn3d.gold", d: 0.5 }, { t: 71.0, click: ".room-head .btn3d.gold" },
];
const MOODS = [[0, "idle"], [22.4, "wave"], [23.4, "idle"], [27.6, "happy"], [28.2, "listening"], [31.3, "celebrate"], [32.4, "listening"], [38.0, "celebrate"], [39.4, "idle"], [41.4, "listening"], [42.7, "thinking"], [43.4, "happy"], [45, "idle"], [47.8, "happy"], [48.5, "listening"], [50.5, "celebrate"], [56, "idle"], [60.3, "thinking"], [61, "happy"], [62.6, "idle"], [65.4, "listening"], [67.3, "thinking"], [67.9, "happy"], [69, "idle"], [71.0, "celebrate"], [72.4, "wave"]];
const mood = (t) => { let m = "idle"; for (const [a, b] of MOODS) if (t >= a) m = b; return m; };

const el = (s) => Array.isArray(s) ? document.querySelectorAll(s[0])[s[1]] : document.querySelector(s);
const center = (e) => { const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
function setVal(e, v) { const p = e.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(p, "value").set.call(e, v); e.dispatchEvent(new Event("input", { bubbles: true })); }

const STATE = { cursor: [1050, 640], from: null, to: null, a: 0, b: 0, clickAt: -9, typing: null, done: new Set(), tick: 0, scroll: null };
const AMP = window.__AMP, LINES = window.__LINES;
function speaking(t) { const f = Math.floor(t * 30); return (AMP[f] || 0) > 0.05; }
function caption(t) {
  for (const l of LINES) if (t >= l.start - 0.05 && t <= l.start + l.dur + 0.25) {
    const parts = l.text.match(/[^.!?:,]+[.!?:,]+\s*/g).reduce((o, s) => { const c = o[o.length - 1]; if (c && (c + s).length < 48) o[o.length - 1] = c + s; else o.push(s); return o; }, []);
    let acc = 0; const total = l.text.length, p = clamp((t - l.start) / l.dur);
    for (const s of parts) { acc += s.length; if (p * total <= acc) return s.trim(); }
    return parts[parts.length - 1].trim();
  }
  return null;
}
function runActions(t) {
  const S = STATE;
  for (const a of ACTIONS) {
    if (t < a.t || S.done.has(a)) continue; S.done.add(a); if (a.fallback) continue;
    const target = a.move || a.click || (a.type && !a.noMove && a.type);
    if (a.move || (a.type && !a.noMove)) { const e = el(target); if (e) { S.from = S.cursor; S.to = center(e); S.a = t; S.b = t + (a.move ? a.d : 0.3); } else console.error("missing", target); }
    if (a.click) { const e = el(a.click); if (e) { if (!a.silent) S.clickAt = t; e.click(); } else console.error("missing", a.click); }
    if (a.type) { const e = el(a.type); if (e) { e.focus({ preventScroll: true }); S.typing = { e, text: a.text, a: t + 0.05, d: a.d, last: 0 }; } else console.error("missing", a.type); }
    if (a.seedTeam) window.__seedTeam = true;
    if (a.slide) { const e = el(a.slide); S.slide = { e, a: t, d: a.d, from: +e.value, to: a.to, last: -1 }; }
    if (a.bodyScroll !== undefined) { const b = document.body, target = a.bodyScroll ? el(a.bodyScroll) : null; b.style.scrollBehavior = "auto"; S.scroll = { el: b, a: t, d: a.d, from: S.bodyTop || 0, to: target ? (S.bodyTop || 0) + (target.getBoundingClientRect().top - WIN.y) / WIN.s - 10 : 0, body: true }; }
    if (a.roomScroll !== undefined) { const c = document.querySelector(".room"); if (c) { c.style.scrollBehavior = "auto"; S.scroll = { el: c, a: t, d: a.d, from: c.scrollTop, to: a.roomScroll ? c.scrollHeight - c.clientHeight : 0 }; } }
    if (a.scrollTo) { const box = el(a.scrollTo).closest(".round-body") || document.scrollingElement; S.scroll = { el: findScroller(el(a.scrollTo)), a: t, d: 1.0, from: 0, to: 0, first: true, target: el(a.scrollTo) }; }
  }
  if (S.to) { const p = ss(S.a, S.b, t); S.cursor = [lerp(S.from[0], S.to[0], p), lerp(S.from[1], S.to[1], p)]; if (p >= 1) S.to = null; }
  if (S.typing) { const y = S.typing, n = Math.round(clamp((t - y.a) / y.d) * y.text.length); if (n !== y.last) { setVal(y.e, y.text.slice(0, n)); y.last = n; } if (n >= y.text.length) S.typing = null; }
  if (S.slide) { const c = S.slide, v = Math.round(lerp(c.from, c.to, ss(c.a, c.a + c.d, t)) / 5) * 5; if (v !== c.last) { setVal(c.e, String(v)); c.last = v; } if (t > c.a + c.d) S.slide = null; }
  if (S.scroll && S.scroll.body) { const c = S.scroll; S.bodyTop = lerp(c.from, c.to, ss(c.a, c.a + c.d, t)); if (t > c.a + c.d) S.scroll = null; }
  else if (S.scroll) { const c = S.scroll; if (c.first) { c.first = false; c.from = c.el.scrollTop; c.to = c.from + c.target.getBoundingClientRect().top / camScale() - c.el.getBoundingClientRect().top / camScale() - 8; } c.el.scrollTop = lerp(c.from, c.to, ss(c.a, c.a + c.d, t)); if (t > c.a + c.d) S.scroll = null; }
}
let lastCam = 1; const camScale = () => lastCam * WIN.s;
function findScroller(e) { for (let n = e.parentElement; n; n = n.parentElement) { const o = getComputedStyle(n).overflowY; if ((o === "auto" || o === "scroll") && n.scrollHeight > n.clientHeight + 2) return n; } return document.scrollingElement; }

const KNOCKS = window.__KNOCKS = [12.0, 12.36, 12.72, 18.9];
const ring = (t, x, y, at, max, color, life = 0.75) => { const p = (t - at) / life; if (p < 0 || p > 1) return null; return h("div", { key: at + "-" + x, style: { position: "absolute", left: x, top: y, width: max * 2, height: max * 2, marginLeft: -max, marginTop: -max, borderRadius: "50%", border: `5px solid ${color}`, transform: `scale(${0.08 + p * 0.92})`, opacity: 1 - p, boxShadow: `0 0 26px ${color}, inset 0 0 26px ${color}` } }); };

function Sky({ t }) { return h("div", { style: { position: "absolute", inset: 0, background: "linear-gradient(180deg,#7FA4FF 0%,#B7C9FF 58%,#FFE3C2 100%)" } },
  h("div", { style: { position: "absolute", left: 1100, top: 90, width: 170, height: 170, borderRadius: "50%", opacity: 1 - ss(76.3, 77.8, t), background: "#FFE27A", boxShadow: "0 0 0 42px rgba(255,226,122,.25)" } })); }
function Garden({ t }) { return h("div", { style: { position: "absolute", left: 0, bottom: 0, width: W, height: 520 } }, h(GardenScene, { tall: t < 40, className: "vid-g" })); }

const CROWNS = [1, 2, 3, 4, 5];
function Gallery({ t }) {
  const a = 58.6, e = 64.0; if (t < a || t > e + 0.6) return null;
  const o = ss(a, a + 0.5, t) * (1 - ss(e, e + 0.5, t));
  return h("div", { style: { position: "absolute", left: WIN.x, top: WIN.y, width: W * WIN.s, height: H * WIN.s, borderRadius: 26, display: "grid", placeItems: "center", opacity: o, background: "rgba(18,26,74,.72)" } },
    h("div", { style: { background: "linear-gradient(180deg,#F7F9FF,#FFF5E8)", borderRadius: 30, padding: "24px 26px 26px", width: 1130, transform: `scale(${0.92 + o * 0.08})`, textAlign: "center" } },
      h("span", { className: "eyebrow" }, t0.crownsEyebrow), h("h2", { style: { margin: "2px 0 14px", fontSize: 40, fontWeight: 900 } }, t0.crownsTitle),
      h("div", { style: { display: "flex", justifyContent: "space-between" } }, CROWNS.map((l, i) => {
        const at = a + 0.5 + i * 0.75, p = pop(at, 0.5, t), on = t >= at && t < at + 0.75 || (i === 4 && t >= at);
        return h("div", { key: l, style: { width: 208, opacity: clamp((t - at) * 5), transform: `translateY(${(1 - p) * 40}px) scale(${on ? 1.1 : 1})`, transition: "none" } },
          h("div", { style: { height: 200, display: "grid", placeItems: "end center", filter: on ? "drop-shadow(0 0 20px #FFC53D)" : "none" } }, h(Pingo, { still: true, size: 150, level: l, interactive: false })),
          h("strong", { style: { display: "block", fontSize: 21, marginTop: 6 } }, t0.crownNames[i]), h("span", { style: { color: "#58628F", fontSize: 16 } }, [0, 50, 150, 300, 500].map((x, k) => `${t0.levelN(k + 1)} · ${x} XP`)[i]));
      }))));
}

function View({ t }) {
  const S = STATE, talk = speaking(t);
  if (talk) S.tick = Math.floor(t * 12);
    const showGarden = t < 22.0 || t > 74.0, closeG = ss(74.1, 75.3, t);
  let px, py, ps, rot = 0, m = "idle", lk = null, lvl = 1, footL = 0, footR = 0, op = 1;
  const camS = t < 11 ? lerp(1, 1.42, ss(7.8, 11, t)) : lerp(1.42, 1.65, ss(11, 13, t));
  if (t < 7.6) {
    const walk = (t < 3.3) ? lerp(150, 520, t / 3.3) : (t < 4.7) ? 520 : lerp(520, 720, ss(4.7, 7.5, t));
    const moving = t < 3.3 || (t > 4.7 && t < 7.4); const phase = t * 6.2;
    px = walk; py = 740 - (moving ? Math.abs(Math.sin(phase)) * 11 : 0); ps = 215; rot = moving ? Math.sin(phase) * 7 : Math.sin(t * 3.4) * 1.2;
    footL = moving ? Math.max(0, Math.sin(phase)) * -9 : 0; footR = moving ? Math.max(0, -Math.sin(phase)) * -9 : 0;
    lk = t > 3.3 && t < 4.7 ? { x: -0.25, y: 1 } : t > 2 && t < 3.3 ? { x: 0.9, y: -0.4 } : { x: 0.85, y: 0 }; m = t > 3.5 && t < 4.5 ? "happy" : "idle";
  } else if (t < 11) {
    px = 720; py = 740; ps = 215 * camS; py = lerp(740, 835, ss(7.8, 11, t)); rot = lerp(0, 9, ss(8.2, 9, t)); lk = { x: 0, y: -0.05 }; m = t > 8.9 ? "listening" : "idle";
  } else if (t < 18.9) {
    const k = KNOCKS.filter((x) => t >= x).pop() ?? -9, kp = clamp((t - k) / 0.2), kick = Math.sin(kp * Math.PI);
    const hops = 3, hp = clamp((t - 11) / 0.95), hop = Math.abs(Math.sin(hp * Math.PI * hops));
    ps = lerp(305, 740, ss(11, 11.95, t)) * (1 + kick * 0.035); px = 720; py = lerp(835, 1130, ss(11, 11.95, t)) - (hp < 1 ? hop * 90 : 0); rot = lerp(9, 0, ss(11, 11.5, t)) + Math.sin(t * 2.1) * 2.2; lk = { x: 0, y: 0.08 };
    m = talk ? "talking" : t < 12.85 ? "wave" : "listening";
  } else if (t < 19.4) {
    px = 720; py = 1130; ps = 740; m = talk ? "talking" : "happy"; lk = { x: 0, y: 0 };
  } else if (t < 20.65) {
    const p = ss(19.4, 20.65, t); px = 720; py = lerp(1130, 468, p) - Math.sin(p * Math.PI) * 90; ps = lerp(740, 22, 1 - Math.pow(1 - p, 2.2)); rot = p * 380; m = "celebrate";
  } else op = 0;
  let gx = 1263, gy = 797, gs = 150, gOp = t > 22.4 && t <= 74.1 ? 1 : 0;
  const gh = pop(22.4, 0.5, t), guideMood = t > 0 ? (talk ? "talking" : mood(t)) : "idle", gL = t > 50.9 ? 2 : 1;
  if (t > 74.1) {
    const p = ss(74.1, 75.1, t), q = ss(76.2, 77.4, t);
    px = lerp(lerp(1345, 720, p), 330, q); py = lerp(797, 760, p) - Math.abs(Math.sin(clamp((t - 74.1) / 1) * Math.PI * 3)) * 70 * (t < 75.1 ? 1 : 0); ps = lerp(150, lerp(330, 370, q), p); op = 1; lvl = t > 75.5 ? 5 : 2; lk = { x: 0, y: 0 }; m = talk ? "talking" : (t > 84 ? "wave" : t > 75.5 && t < 76.4 ? "celebrate" : "happy");
  }
  const portalR = t < 20.1 ? lerp(0, 150, ss(18.9, 20.1, t)) : lerp(150, 1100, Math.pow(clamp((t - 20.4) / 1.6), 2.2));
  const mask = t >= 18.9 && t < 22.0 ? `radial-gradient(circle ${portalR}px at 720px 430px, transparent 97%, #000 100%)` : "none";
  const sh = KNOCKS.reduce((v, k) => { const p = (t - k) / 0.14; return p >= 0 && p <= 1 ? (1 - p) * 5 : v; }, 0) * (Math.round(t * 30) % 2 ? 1 : -1);
  const cap = caption(t), capWide = t < 22.3 || t > 74.1;
  const gardenLayer = showGarden && (t < 22.0 || closeG > 0) && h("div", { key: "g", style: { position: "absolute", inset: 0, opacity: t > 74 ? closeG : 1, WebkitMaskImage: mask, maskImage: mask, transform: `translate(${sh}px,0)` } },
    h("div", { style: { position: "absolute", inset: 0, transformOrigin: "720px 760px", transform: `scale(${t > 74 ? 1 : camS})` } }, h(Sky, { t }), h(Garden, { t }), h("div", { style: { position: "absolute", inset: 0 } }, h(Petals, { count: 26 }))),
  );
  return h("div", { style: { position: "absolute", inset: 0 }, className: "vid-root" },
    gardenLayer,
    t >= 18.9 && t < 22.0 && h("div", { style: { position: "absolute", left: 720 - portalR, top: 430 - portalR, width: portalR * 2, height: portalR * 2, borderRadius: "50%", boxShadow: "0 0 0 8px #FFE27A, 0 0 60px 26px #7B61FF, inset 0 0 60px 14px rgba(255,226,122,.75)" } }),
    t >= 11.9 && t < 19.8 && h("div", { style: { position: "absolute", inset: 0, overflow: "hidden" } }, KNOCKS.map((k) => ring(t, 985, 395, k, k === 18.9 ? 360 : 190, k === 18.9 ? "#FFE27A" : "rgba(255,255,255,.9)"))),
    op > 0 && t < 21.4 + (t > 74 ? 99 : 0) && h("div", { key: "main", className: "vid-p", style: { position: "absolute", left: px, top: py, width: 0, height: 0, "--vfl": footL + "px", "--vfr": footR + "px" } },
      h("div", { style: { position: "absolute", left: -ps / 2, bottom: 0, transformOrigin: "50% 92%", transform: `rotate(${rot}deg)`, width: ps, height: ps * 1.25 } }, h("div", { style: { transformOrigin: "0 0", transform: `scale(${ps / 800})`, width: 800 } }, h(Pingo, { mood: m, size: 800, level: lvl, look: lk, talkTick: S.tick, interactive: false })))),
    t > 75.4 && t < 77.2 && h("div", { style: { position: "absolute", left: 0, top: 0, inset: 0 } }, ring(t, px, py - ps * 1.05, 75.5, 280, "#FFC53D", 1)),
    gOp > 0 && h("div", { key: "guide", className: "vid-guide", style: { position: "absolute", left: gx, top: gy, width: 165, height: 0 } },
      h("div", { style: { position: "absolute", left: 0, bottom: 0, width: 165, transformOrigin: "50% 100%", transform: `scale(${gh})` } }, h(Pingo, { mood: guideMood, size: 165, level: gL, look: guideMood === "talking" ? { x: -0.5, y: -0.1 } : { x: -0.75, y: -0.15 }, talkTick: S.tick, interactive: false }))),
    t > 22.3 && t < 74.6 && h("div", { style: { position: "absolute", left: S.cursor[0] - 4, top: S.cursor[1] - 2, width: 38, height: 38, opacity: t < 23.2 ? ss(22.6, 23.2, t) : 1 - ss(73.6, 74.2, t), filter: "drop-shadow(0 3px 5px rgba(18,26,74,.4))" } }, h("svg", { viewBox: "0 0 24 24", width: 38, height: 38 }, h("path", { d: "M5 3 L19 12 L12.5 13.5 L10 20 Z", fill: "#fff", stroke: "#121A4A", strokeWidth: 1.8, strokeLinejoin: "round" }))),
    t - S.clickAt < 0.5 && ring(t, S.cursor[0] + 1, S.cursor[1] + 2, S.clickAt, 38, "#3D5BFF", 0.45),
    t > 77 && h(Closing, { t }),
    cap && h("div", { key: cap, style: { position: "absolute", left: capWide ? 120 : 22, right: capWide ? 120 : 214, bottom: capWide ? 26 : 12, textAlign: "center" } },
      h("span", { style: { display: "inline-block", background: "rgba(255,255,255,.96)", color: "#121A4A", font: "800 26px/1.2 var(--font)", padding: "9px 22px", borderRadius: 20, boxShadow: "0 5px 0 #BFCFFF" } }, cap)),
  );
}
function meter(t) {
  if (t < 51.1 || t > 53.5) return null; const e = document.querySelector(".xpmeter"); if (!e) return null; const r = e.getBoundingClientRect(), o = ss(51.1, 51.5, t);
  const pad = 12, up = t > 52.45 ? clamp((t - 52.45) / 0.9) : -1;
  return h("div", { key: "m" }, h("div", { style: { position: "absolute", left: r.left - pad, top: r.top - pad, width: r.width + pad * 2, height: r.height + pad * 2, borderRadius: 22, border: "4px solid #FFC53D", boxShadow: "0 0 26px #FFC53D", opacity: o } }),
    up >= 0 && h("div", { style: { position: "absolute", left: r.right - 150, top: r.bottom + 34 - up * 22, font: "900 46px var(--font)", color: "#E59A00", opacity: 1 - Math.pow(up, 4), transform: `scale(${pop(52.45, 0.3, t)})`, textShadow: "0 3px 0 #fff" } }, "+10 XP"));
}
function Closing({ t }) {
  const f = (a) => ({ opacity: ss(a, a + 0.5, t), transform: `translateY(${(1 - ss(a, a + 0.5, t)) * 22}px)` });
  return h("div", { style: { position: "absolute", left: 590, right: 60, top: 118, textAlign: "center", color: "#121A4A" } },
    h("div", { style: { ...f(79.6), font: "900 44px/1.15 var(--font)" } }, "Your learning journey starts here."),
    h("div", { style: { ...f(80.8), marginTop: 22, display: "flex", justifyContent: "center", alignItems: "center", gap: 14 } }, h("span", {}, h(Pingo, { still: true, size: 92, level: 5, interactive: false })), h("span", { className: "wordmark", style: { fontSize: 92, lineHeight: 1 } }, "ATHENA")),
    h("div", { style: { ...f(81.7), font: "800 29px/1.2 var(--font)", color: "#2A3FD6", marginTop: 10 } }, "Learn. Play. Progress. Connect."),
    h("div", { style: { ...f(82.6), marginTop: 22 } }, h("span", { className: "btn3d gold", style: { fontSize: 26 } }, "Join Athena and discover your potential!")),
    h("div", { style: { ...f(83.5), marginTop: 26, display: "flex", justifyContent: "center", gap: 24 } }, CROWNS.map((l) => h(Pingo, { key: l, still: true, size: 62, level: l, interactive: false }))));
}

export function start(t) {
  const st = document.createElement("style");
  st.textContent = `html{overflow:hidden;background:linear-gradient(180deg,#7FA4FF 0%,#B7C9FF 58%,#FFE3C2 100%)!important}
  body{position:relative;z-index:1;width:${W}px;height:${H}px;background:linear-gradient(180deg,#DCE7FF 0%,#EDF2FF 38%,#F6F3FF 70%,#FFF5E8 100%);transform-origin:0 0;overflow:hidden}
  #root{transform-origin:0 0}
  #vid-back,#vid-top{position:fixed;left:0;top:0;width:${W}px;height:${H}px;pointer-events:none;overflow:hidden;contain:strict}
  #vid-back{z-index:0}#vid-top{z-index:2}
  .vid-g.garden-scene{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;opacity:1!important}
  .vid-p .pg-foot.l{transform:translateY(var(--vfl,0))}.vid-p .pg-foot.r{transform:translateY(var(--vfr,0))}`;
  document.head.appendChild(st);
  const back = document.createElement("div"); back.id = "vid-back"; const top = document.createElement("div"); top.id = "vid-top";
  document.documentElement.appendChild(back); document.documentElement.appendChild(top);
  createRoot(back).render(h("div", { style: { position: "absolute", left: 0, bottom: -8, width: W, height: 150 } }, h(GardenScene, { tall: false, className: "vid-g" })));
  const root = createRoot(top);
  for (const a of ACTIONS) if (a.t < t) STATE.done.add(a);
  const hold = document.createElement("style"); document.head.appendChild(hold); let burstDone = t > 53.55;
  window.__frame = (t) => {
    runActions(t); document.body.scrollTop = STATE.bodyTop || 0; document.documentElement.scrollTop = 0;
    const lg = document.querySelector(".opening")?.parentElement; if (lg) { lg.style.scrollBehavior = "auto"; lg.scrollTop = 0; }
    
    const w = t < 21.8 ? 0 : t < 74.0 ? ss(21.8, 22.8, t) : 1;
    let sc = lerp(1, WIN.s, w), x = lerp(0, WIN.x, w), y = lerp(0, WIN.y, w), o = 1;
    if (t >= 74.0) { const p = ss(74.0, 75.2, t); sc = lerp(WIN.s, 0.4, p); x = lerp(WIN.x, 430, p); y = lerp(WIN.y, 210, p); o = 1 - ss(74.6, 75.3, t); }
    const b = document.body.style; b.transform = `translate(${x}px,${y}px) scale(${sc})`; b.borderRadius = w * 26 / WIN.s + "px"; b.opacity = o; b.boxShadow = w ? "0 18px 40px rgba(18,26,74,.32)" : "none";
    const zoomIn = t < 22.4 ? lerp(1.4, 1, ss(20.4, 22.1, t)) : 1;
    const [cx, cy, cs] = keys(CAM, t); lastCam = cs * zoomIn;
    const r = document.getElementById("root"); if (r) { r.style.transform = t < 22.4 ? `scale(${zoomIn})` : `translate(${-cx * cs + (cs > 1 ? 0 : 0)}px,${-cy * cs}px) scale(${cs})`; r.style.transformOrigin = t < 22.4 ? "720px 405px" : "0 0"; }
    flushSync(() => root.render(h(View, { t })));
  };
}
