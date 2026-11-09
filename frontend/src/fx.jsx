import { useEffect, useRef } from "react";

const reduced = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };
const COLORS = ["#FFC53D", "#FFD25C", "#2FBF71", "#56D68D", "#FF5DA2", "#FF9BC8", "#3D5BFF", "#22C1E6", "#9BC53D"];

function drawShape(ctx, p) {
  const flip = Math.cos(p.flip);
  ctx.save();
  ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, flip);
  ctx.fillStyle = p.color; ctx.globalAlpha = p.alpha;
  if (p.kind === 0) { ctx.beginPath(); ctx.ellipse(0, 0, p.size, p.size * 0.42, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = "rgba(0,0,0,.12)"; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(-p.size, 0); ctx.lineTo(p.size, 0); ctx.stroke(); }
  else if (p.kind === 1) { ctx.beginPath(); ctx.moveTo(0, -p.size); ctx.bezierCurveTo(p.size, -p.size * 0.6, p.size * 0.7, p.size * 0.8, 0, p.size); ctx.bezierCurveTo(-p.size * 0.7, p.size * 0.8, -p.size, -p.size * 0.6, 0, -p.size); ctx.fill(); }
  else if (p.kind === 2) { const s = p.size; ctx.beginPath(); ctx.moveTo(0, -s); ctx.quadraticCurveTo(s * 0.15, -s * 0.15, s, 0); ctx.quadraticCurveTo(s * 0.15, s * 0.15, 0, s); ctx.quadraticCurveTo(-s * 0.15, s * 0.15, -s, 0); ctx.quadraticCurveTo(-s * 0.15, -s * 0.15, 0, -s); ctx.fill(); }
  else { ctx.fillRect(-p.size * 0.5, -p.size * 0.3, p.size, p.size * 0.6); }
  ctx.restore();
}

let canvas = null, ctx = null, parts = [], running = false;
function ensureCanvas() {
  if (canvas) return;
  canvas = document.createElement("canvas");
  canvas.className = "fx-canvas"; canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas); ctx = canvas.getContext("2d");
  const size = () => { const d = Math.min(2, devicePixelRatio || 1); canvas.width = innerWidth * d; canvas.height = innerHeight * d; ctx.setTransform(d, 0, 0, d, 0, 0); };
  size(); addEventListener("resize", size);
}
function loop(last) {
  running = true;
  requestAnimationFrame((now) => {
    const dt = Math.min(0.033, (now - last) / 1000);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    parts = parts.filter((p) => p.life > 0 && p.y < innerHeight + 40);
    for (const p of parts) {
      p.vy += 820 * dt * p.weight; p.vx *= 1 - 1.6 * dt; p.vy *= 1 - (p.kind === 0 || p.kind === 1 ? 2.4 : 1.1) * dt;
      p.x += (p.vx + Math.sin(p.flip * 0.5) * 30 * (p.kind < 2 ? 1 : 0.3)) * dt; p.y += p.vy * dt;
      p.rot += p.vr * dt; p.flip += p.vf * dt; p.life -= dt;
      p.alpha = Math.min(1, p.life * 1.6);
      drawShape(ctx, p);
    }
    if (parts.length) loop(now); else { running = false; ctx.clearRect(0, 0, innerWidth, innerHeight); }
  });
}
export function burst(x = innerWidth / 2, y = innerHeight / 2, power = 1) {
  if (reduced()) return;
  ensureCanvas();
  const n = Math.round(70 * power);
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.15;
    const v = (380 + Math.random() * 520) * (0.75 + power * 0.25);
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 10,
      flip: Math.random() * 6, vf: 4 + Math.random() * 8, size: 5 + Math.random() * 6, kind: Math.floor(Math.random() * 4),
      color: COLORS[Math.floor(Math.random() * COLORS.length)], life: 2.2 + Math.random() * 1.6, weight: 0.55 + Math.random() * 0.5, alpha: 1 });
  }
  if (!running) loop(performance.now());
}
export function burstFrom(el, power = 1) {
  if (!el) return burst(undefined, undefined, power);
  const r = el.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2, power);
}

export function Petals({ count = 26 }) {
  const ref = useRef(null);
  useEffect(() => {
    if (reduced()) return;
    const c = ref.current, x = c.getContext("2d");
    let w = 0, h = 0, raf = 0, visible = true, last = performance.now();
    const d = Math.min(2, devicePixelRatio || 1);
    const size = () => { w = c.clientWidth; h = c.clientHeight; c.width = w * d; c.height = h * d; x.setTransform(d, 0, 0, d, 0, 0); };
    size();
    const ro = new ResizeObserver(size); ro.observe(c);
    const n = innerWidth < 700 ? Math.round(count * 0.5) : count;
    const ps = Array.from({ length: n }, (_, i) => ({
      x: Math.random() * w, y: Math.random() * h, s: 3 + Math.random() * 5, vy: 10 + Math.random() * 18, vx: 6 + Math.random() * 14,
      sway: Math.random() * 6, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 1.5, flip: Math.random() * 6,
      kind: i % 5 === 0 ? "mote" : i % 2 ? "petal" : "leaf",
      color: i % 2 ? (Math.random() < 0.5 ? "#FF9BC8" : "#FFC2DC") : (Math.random() < 0.5 ? "#8FD694" : "#B5D86A"),
    }));
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !raf) { last = performance.now(); raf = requestAnimationFrame(tick); } });
    io.observe(c);
    function tick(now) {
      raf = 0;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      x.clearRect(0, 0, w, h);
      for (const p of ps) {
        p.sway += dt; p.flip += dt * 2.2; p.rot += p.vr * dt;
        p.y += p.vy * dt; p.x += (p.vx + Math.sin(p.sway * 1.3) * 22) * dt;
        if (p.y > h + 12) { p.y = -12; p.x = Math.random() * w - 40; }
        if (p.x > w + 20) p.x = -20;
        if (p.kind === "mote") {
          const a = 0.45 + 0.4 * Math.sin(p.sway * 2.4);
          const g = x.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.s * 2.2);
          g.addColorStop(0, `rgba(255,226,122,${a})`); g.addColorStop(1, "rgba(255,226,122,0)");
          x.fillStyle = g; x.beginPath(); x.arc(p.x, p.y, p.s * 2.2, 0, Math.PI * 2); x.fill();
        } else {
          drawShape(x, { x: p.x, y: p.y, rot: p.rot, flip: p.flip, size: p.s, kind: p.kind === "leaf" ? 0 : 1, color: p.color, alpha: 0.8 });
        }
      }
      if (visible && !document.hidden) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); };
  }, [count]);
  return <canvas ref={ref} className="petals" aria-hidden="true" />;
}
