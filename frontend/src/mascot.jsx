import { useEffect, useMemo, useRef } from "react";

const reduced = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };

export const LEVEL_XP = [0, 50, 150, 300, 500, 800, 1200, 1700, 2300, 3000];
export function levelFor(xp = 0) {
  let level = 1;
  for (let i = 0; i < LEVEL_XP.length; i++) if (xp >= LEVEL_XP[i]) level = i + 1;
  const floor = LEVEL_XP[level - 1] ?? 0;
  const next = LEVEL_XP[level] ?? floor + 800;
  return { level, floor, next, pct: Math.min(1, (xp - floor) / (next - floor)) };
}
export const crownTier = (level) => Math.min(5, Math.max(1, level));

const pointer = { x: -1, y: -1, moved: 0 };
let listening = false;
function listen() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  const on = (e) => { pointer.x = e.clientX; pointer.y = e.clientY; pointer.moved = performance.now(); };
  window.addEventListener("pointermove", on, { passive: true });
  window.addEventListener("pointerdown", on, { passive: true });
}

function wreath(count = 9) {
  const P0 = [56, 70], P1 = [100, 18], P2 = [144, 70];
  const leaves = [];
  for (let i = 0; i < count; i++) {
    const t = 0.04 + (i / (count - 1)) * 0.92;
    const x = (1 - t) ** 2 * P0[0] + 2 * (1 - t) * t * P1[0] + t * t * P2[0];
    const y = (1 - t) ** 2 * P0[1] + 2 * (1 - t) * t * P1[1] + t * t * P2[1];
    const dx = 2 * (1 - t) * (P1[0] - P0[0]) + 2 * t * (P2[0] - P1[0]);
    const dy = 2 * (1 - t) * (P1[1] - P0[1]) + 2 * t * (P2[1] - P1[1]);
    const a = (Math.atan2(dy, dx) * 180) / Math.PI;
    const side = t < 0.5 ? 1 : -1;
    leaves.push({ x, y, a: a + side * 32, k: i }, { x, y, a: a - side * 32 + 180, k: i + 0.5 });
  }
  return leaves;
}
const LEAVES = wreath();

function Crown({ tier }) {
  const gold = tier >= 3;
  return (
    <g className={"pg-crown tier-" + tier}>
      {tier === 1 && (
        <g className="pg-sprig" transform="translate(116 40) rotate(28)">
          <path d="M0 0 C 2 -10 4 -18 10 -26" fill="none" stroke="#1C8F52" strokeWidth="2.4" strokeLinecap="round" />
          <ellipse cx="-4" cy="-10" rx="7" ry="3.3" transform="rotate(-60 -4 -10)" fill="#2FBF71" />
          <ellipse cx="9" cy="-14" rx="7" ry="3.3" transform="rotate(-20 9 -14)" fill="#56D68D" />
          <ellipse cx="3" cy="-22" rx="6.5" ry="3" transform="rotate(-80 3 -22)" fill="#2FBF71" />
          <circle cx="12" cy="-27" r="3" fill="#9BC53D" />
        </g>
      )}
      {tier >= 2 && (
        <g className="pg-wreath">
          {LEAVES.map((l, i) => (
            <ellipse key={i} cx={l.x} cy={l.y} rx="8.5" ry="3.6" transform={`rotate(${l.a} ${l.x} ${l.y}) translate(5 0)`}
              fill={gold ? (i % 2 ? "#FFD25C" : "#F4B321") : (i % 2 ? "#56D68D" : "#2FBF71")}
              stroke={gold ? "#C98500" : "#1C8F52"} strokeWidth="0.8" />
          ))}
        </g>
      )}
      {tier >= 4 && (
        <g className="pg-gold-crown">
          <path d="M76 42 L79 16 L90 30 L100 8 L110 30 L121 16 L124 42 Q100 48 76 42 Z" fill="url(#pg-gold)" stroke="#C98500" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M78 38 Q100 44 122 38" fill="none" stroke="#C98500" strokeWidth="1.2" opacity=".6" />
          <circle cx="100" cy="30" r="4.2" fill="#FF5DA2" stroke="#fff" strokeWidth="1.2" />
          <circle cx="86" cy="35" r="2.6" fill="#22C1E6" /><circle cx="114" cy="35" r="2.6" fill="#22C1E6" />
          <circle cx="79" cy="16" r="2.4" fill="#FFF3C4" /><circle cx="100" cy="8" r="2.6" fill="#FFF3C4" /><circle cx="121" cy="16" r="2.4" fill="#FFF3C4" />
        </g>
      )}
      {tier >= 5 && (
        <g className="pg-halo">
          {[0, 1, 2].map((i) => <path key={i} className={"pg-orbit o" + i} d="M0 -5 L1.4 -1.4 L5 0 L1.4 1.4 L0 5 L-1.4 1.4 L-5 0 L-1.4 -1.4 Z" fill="#FFE27A" />)}
        </g>
      )}
    </g>
  );
}

export function Pingo({ mood = "idle", size = 220, level = 1, look = null, talkTick = 0, interactive = true, onPoke, still = false, className = "", title }) {
  const svg = useRef(null);
  const st = useRef({ lx: 0, ly: 0, vx: 0, vy: 0, lid: 0, beak: 0, lastTalk: 0, blinkAt: 0, blinkT: -1, glance: null, glanceUntil: 0, spin: -1, rect: null, rectAt: 0, visible: true });
  const moodRef = useRef(mood); moodRef.current = mood;
  const lookRef = useRef(look); lookRef.current = look;
  const uid = useMemo(() => "pg" + Math.random().toString(36).slice(2, 8), []);

  useEffect(() => { st.current.lastTalk = performance.now(); }, [talkTick]);

  useEffect(() => {
    if (still) return;
    listen();
    const el = svg.current; const s = st.current; let raf = 0, last = performance.now();
    const calm = reduced();
    const io = new IntersectionObserver(([e]) => { s.visible = e.isIntersecting; if (s.visible && !raf) raf = requestAnimationFrame(tick); }, { rootMargin: "80px" });
    io.observe(el);
    s.blinkAt = last + 1200 + Math.random() * 2000;
    function tick(now) {
      raf = 0;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const m = moodRef.current;
      if (!s.rect || now - s.rectAt > 300) { s.rect = el.getBoundingClientRect(); s.rectAt = now; }
      const r = s.rect, cx = r.left + r.width / 2, cy = r.top + r.height * 0.38;
      let tx = 0, ty = 0;
      const L = lookRef.current;
      if (L) { tx = L.x; ty = L.y; }
      else if (m === "thinking") { tx = 0.55; ty = -0.85; }
      else if (m === "sleep" || m === "shy") { tx = 0; ty = 0.25; }
      else if (pointer.x >= 0 && now - pointer.moved < 2600) {
        tx = Math.max(-1, Math.min(1, (pointer.x - cx) / Math.max(260, r.width * 1.6)));
        ty = Math.max(-1, Math.min(1, (pointer.y - cy) / Math.max(220, r.height * 1.4)));
      } else if (!calm) {
        if (!s.glance || now > s.glanceUntil) {
          s.glance = Math.random() < 0.45 ? { x: 0, y: 0.1 } : { x: Math.random() * 1.6 - 0.8, y: Math.random() * 0.9 - 0.5 };
          s.glanceUntil = now + 1100 + Math.random() * 2200;
        }
        tx = s.glance.x; ty = s.glance.y;
      }
      const k = 90, d = 13;
      s.vx += ((tx - s.lx) * k - s.vx * d) * dt; s.vy += ((ty - s.ly) * k - s.vy * d) * dt;
      s.lx += s.vx * dt; s.ly += s.vy * dt;
      if (now > s.blinkAt && s.blinkT < 0 && m !== "sleep") { s.blinkT = now; s.blinkAt = now + 2200 + Math.random() * 3400 + (Math.random() < 0.15 ? -1800 : 0); }
      let blink = 0;
      if (s.blinkT >= 0) { const p = (now - s.blinkT) / 170; blink = p < 0.5 ? p * 2 : 2 - p * 2; if (p >= 1) { s.blinkT = -1; blink = 0; } }
      const baseLid = m === "sleep" ? 0.92 : m === "waiting" ? 0.38 : m === "thinking" ? 0.18 : 0;
      s.lid += (Math.max(baseLid, blink) - s.lid) * Math.min(1, dt * 30);
      const talking = Math.max(0, 1 - (now - s.lastTalk) / 260) * (m === "talking" ? 1 : 0);
      const baseBeak = m === "celebrate" ? 0.85 : m === "happy" ? 0.55 : m === "oops" ? 0.5 : m === "wave" ? 0.35 : 0;
      const beakT = Math.max(baseBeak, talking * (0.3 + 0.7 * Math.abs(Math.sin(now / 62))));
      s.beak += (beakT - s.beak) * Math.min(1, dt * 22);
      let sx = 1, back = false;
      if (s.spin >= 0) {
        const p = Math.min(1, (now - s.spin) / 950);
        const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
        const ang = e * Math.PI * 2; sx = Math.cos(ang); back = sx < 0;
        sx = Math.sign(sx || 1) * Math.max(0.04, Math.abs(sx));
        if (p >= 1) { s.spin = -1; sx = 1; back = false; }
      }
      const css = el.style;
      css.setProperty("--lx", s.lx.toFixed(3)); css.setProperty("--ly", s.ly.toFixed(3));
      css.setProperty("--turn", Math.max(-1.1, Math.min(1.1, s.lx)).toFixed(3));
      css.setProperty("--tilt", (s.lx * 5 + (m === "thinking" ? 6 : 0) + (m === "sleep" ? -8 : 0)).toFixed(2) + "deg");
      css.setProperty("--lid", s.lid.toFixed(3)); css.setProperty("--beak", s.beak.toFixed(3)); css.setProperty("--sx", sx.toFixed(3));
      if (back) el.setAttribute("data-back", ""); else el.removeAttribute("data-back");
      if (s.visible && !document.hidden) raf = requestAnimationFrame(tick);
    }
    const vis = () => { if (!document.hidden && !raf) { last = performance.now(); raf = requestAnimationFrame(tick); } };
    document.addEventListener("visibilitychange", vis);
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); io.disconnect(); document.removeEventListener("visibilitychange", vis); };
  }, [still]);

  const poke = (e) => {
    if (!interactive) return;
    const el = svg.current;
    if (e.detail >= 2) { st.current.spin = performance.now(); onPoke?.("spin"); return; }
    el.classList.remove("pg-poked"); void el.getBoundingClientRect(); el.classList.add("pg-poked");
    clearTimeout(el._pokeT); el._pokeT = setTimeout(() => el.classList.remove("pg-poked"), 560);
    const r = el.getBoundingClientRect();
    const onBelly = e.clientY > r.top + r.height * 0.55;
    if (onBelly) { el.classList.remove("pg-hearts"); void el.getBoundingClientRect(); el.classList.add("pg-hearts"); clearTimeout(el._heartT); el._heartT = setTimeout(() => el.classList.remove("pg-hearts"), 1400); }
    onPoke?.(onBelly ? "tickle" : "poke");
  };

  const tier = crownTier(level);
  return (
    <svg ref={svg} className={"pingo " + className + (still ? " pg-still" : "") + (interactive ? " pg-interactive" : "")}
      data-mood={mood} viewBox="0 -14 200 250" width={size} height={(size * 250) / 200}
      role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true} onClick={poke}>
      <defs>
        <radialGradient id={uid + "-body"} cx="38%" cy="28%" r="80%">
          <stop offset="0" stopColor="#6C86FF" /><stop offset=".55" stopColor="#3D5BFF" /><stop offset="1" stopColor="#2A3FD6" />
        </radialGradient>
        <linearGradient id={uid + "-belly"} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#F4F7FF" /><stop offset="1" stopColor="#D5E0FF" /></linearGradient>
        <linearGradient id={uid + "-mask"} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#9DB0FF" /><stop offset="1" stopColor="#7C95FF" /></linearGradient>
        <linearGradient id="pg-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFE680" /><stop offset=".6" stopColor="#FFC53D" /><stop offset="1" stopColor="#F29A00" /></linearGradient>
        <clipPath id={uid + "-el"}><ellipse cx="80" cy="86" rx="15.5" ry="17" /></clipPath>
        <clipPath id={uid + "-er"}><ellipse cx="120" cy="86" rx="15.5" ry="17" /></clipPath>
      </defs>

      <ellipse className="pg-shadow" cx="100" cy="226" rx="50" ry="7" />
      <g className="pg-all">
        <g className="pg-feet">
          <ellipse className="pg-foot l" cx="78" cy="214" rx="19" ry="8.5" fill="#FF9F1C" />
          <ellipse className="pg-foot r" cx="122" cy="214" rx="19" ry="8.5" fill="#FF9F1C" />
        </g>
        <g className="pg-spin">
          <g className="pg-lean">
            <path className="pg-body" d="M100 36 C 150 36 168 82 168 132 C 168 182 140 212 100 212 C 60 212 32 182 32 132 C 32 82 50 36 100 36 Z" fill={`url(#${uid}-body)`} />
            <path className="pg-sheen" d="M62 66 C 72 50 88 44 100 44" fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth="5" strokeLinecap="round" />
            <g className="pg-back-detail"><path d="M84 196 Q100 206 116 196" fill="none" stroke="#2236B8" strokeWidth="3" strokeLinecap="round" /></g>
            <g className="pg-front">
              <ellipse className="pg-belly" cx="100" cy="158" rx="44" ry="48" fill={`url(#${uid}-belly)`} />
              <g className="pg-face">
                <path className="pg-mask" d="M100 64 C 112 52 142 50 149 74 C 156 99 139 116 120 114 C 111 113 105 110 100 107 C 95 110 89 113 80 114 C 61 116 44 99 51 74 C 58 50 88 52 100 64 Z" fill={`url(#${uid}-mask)`} />
                <ellipse className="pg-cheek l" cx="62" cy="108" rx="8" ry="6" />
                <ellipse className="pg-cheek r" cx="138" cy="108" rx="8" ry="6" />
                {[["l", 80], ["r", 120]].map(([side, x]) => (
                  <g key={side} className={"pg-eye " + side}>
                    <g className="pg-eye-open" clipPath={`url(#${uid}-e${side})`}>
                      <ellipse cx={x} cy="86" rx="15.5" ry="17" fill="#fff" />
                      <g className="pg-pupil">
                        <circle cx={x + 1} cy="88" r="8.2" fill="#10153D" />
                        <circle cx={x + 4} cy="84" r="2.8" fill="#fff" />
                        <circle cx={x - 1.5} cy="92" r="1.2" fill="#fff" opacity=".8" />
                      </g>
                      <rect className="pg-lid" x={x - 17} y="68" width="34" height="36" fill="#8AA1FF" />
                    </g>
                    <path className="pg-eye-happy" d={`M${x - 12} 90 Q${x} 74 ${x + 12} 90`} fill="none" stroke="#10153D" strokeWidth="5" strokeLinecap="round" />
                  </g>
                ))}
                <g className="pg-beak">
                  <ellipse className="pg-tongue" cx="100" cy="114" rx="6" ry="5" fill="#FF6B8B" />
                  <path className="pg-beak-low" d="M90 108 Q100 113 110 108 Q107 121 100 123 Q93 121 90 108 Z" fill="#FF9F1C" />
                  <path className="pg-beak-up" d="M86 102 Q100 95 114 102 Q106 112 100 113 Q94 112 86 102 Z" fill="#FFC53D" />
                </g>
                <path className="pg-sweat" d="M152 58 C 156 66 158 70 155 73 C 152 76 147 73 148 69 C 149 66 150 63 152 58 Z" fill="#7FD8FF" />
              </g>
            </g>
            <g className="pg-crown-wrap"><Crown tier={tier} /></g>
            <g className="pg-arm l"><path className="pg-flip l" d="M52 114 C 30 122 17 148 19 172 C 21 179 28 179 32 172 C 40 158 48 142 56 130 Z" fill="#2A3FD6" /></g>
            <g className="pg-arm r"><path className="pg-flip r" d="M148 114 C 170 122 183 148 181 172 C 179 179 172 179 168 172 C 160 158 152 142 144 130 Z" fill="#2A3FD6" /></g>
          </g>
        </g>
      </g>

      <g className="pg-fx">
        <g className="pg-dots">{[86, 100, 114].map((x, i) => <circle key={x} cx={x} cy="-2" r="4.5" style={{ animationDelay: i * 0.15 + "s" }} />)}</g>
        <g className="pg-thought">
          <circle cx="152" cy="34" r="4" /><circle cx="164" cy="18" r="6.5" /><circle cx="180" cy="-2" r="9.5" />
        </g>
        <g className="pg-zzz">{["z", "z", "Z"].map((z, i) => <text key={i} x={146 + i * 9} y={30 - i * 10} style={{ animationDelay: i * 0.7 + "s" }}>{z}</text>)}</g>
        <g className="pg-sparkles">
          {[[22, 40, 1], [178, 30, 0.8], [12, 120, 0.7], [190, 110, 1], [100, -6, 0.9]].map(([x, y, s], i) => (
            <path key={i} transform={`translate(${x} ${y}) scale(${s})`} style={{ animationDelay: i * 0.22 + "s" }}
              d="M0 -10 C 1 -3 3 -1 10 0 C 3 1 1 3 0 10 C -1 3 -3 1 -10 0 C -3 -1 -1 -3 0 -10 Z" />
          ))}
        </g>
        <g className="pg-heart-burst">
          {[[70, 150], [100, 140], [130, 150]].map(([x, y], i) => (
            <path key={i} transform={`translate(${x} ${y})`} style={{ animationDelay: i * 0.12 + "s" }}
              d="M0 4 C -8 -2 -9 -9 -4 -10 C -1 -11 0 -8 0 -7 C 0 -8 1 -11 4 -10 C 9 -9 8 -2 0 4 Z" />
          ))}
        </g>
      </g>
    </svg>
  );
}

export function Bubble({ children, side = "top", className = "" }) {
  return <div className={"bubble " + side + " " + className} role="status">{children}</div>;
}
