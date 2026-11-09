// Injected before the app loads. Replaces the page's clock so every frame renders identically and nothing is rushed.
(() => {
  const realST = window.setTimeout.bind(window); window.__realST = realST;
  let vt = 0, id = 1; const base = Date.now(), timers = new Map(); let raf = [];
  const RD = Date;
  class VDate extends RD { constructor(...a) { a.length ? super(...a) : super(base + vt); } static now() { return base + vt; } }
  window.Date = VDate; performance.now = () => vt;
  window.setTimeout = (f, d = 0, ...a) => { const i = id++; timers.set(i, { f, at: vt + Math.max(0, +d || 0), a }); return i; };
  window.setInterval = (f, d = 0, ...a) => { const i = id++; timers.set(i, { f, at: vt + Math.max(1, +d || 1), a, every: Math.max(1, +d || 1) }); return i; };
  window.clearTimeout = window.clearInterval = (i) => timers.delete(i);
  window.requestAnimationFrame = (f) => { const i = id++; raf.push([i, f]); return i; };
  window.cancelAnimationFrame = (i) => { raf = raf.filter((x) => x[0] !== i); };
  let pending = 0; const rf = window.fetch.bind(window);
  window.fetch = (...a) => { pending++; return rf(...a).finally(() => { realST(() => pending--, 0); }); };
  window.__pending = () => pending;
  window.__tick = (dt) => {
    const end = vt + dt;
    for (let guard = 0; guard < 2000; guard++) {
      let n = null, nk; for (const [k, t] of timers) if (t.at <= end && (!n || t.at < n.at)) { n = t; nk = k; }
      if (!n) break;
      vt = Math.max(vt, n.at); if (n.every) n.at += n.every; else timers.delete(nk);
      try { typeof n.f === "function" && n.f(...n.a); } catch (e) { console.error(e); }
    }
    vt = end; const q = raf; raf = []; for (const [, f] of q) { try { f(vt); } catch (e) { console.error(e); } }
    for (const a of document.getAnimations()) {
      if (!a.__v) { a.__v = 1; a.pause(); a.currentTime = 0; continue; }
      const end2 = a.effect?.getComputedTiming().endTime, next = (a.currentTime || 0) + dt;
      if (Number.isFinite(end2) && next >= end2) { try { a.finish(); } catch {} } else a.currentTime = next;
    }
    document.querySelectorAll("svg").forEach((s) => { if (s.querySelector("animateMotion")) { s.pauseAnimations(); s.setCurrentTime(vt / 1000); } });
  };
  Object.defineProperty(navigator, "language", { get: () => "en-US" });
})();
