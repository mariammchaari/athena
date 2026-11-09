// Renders the video frame by frame. node capture.mjs [--from 0] [--to 90] [--step 1]
import { spawn, execFileSync } from "node:child_process"; import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url)), arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? +process.argv[i + 1] : d; };
const FROM = arg("from", 0), TO = arg("to", 90), STEP = arg("step", 1), FPS = 30, out = path.join(here, STEP > 1 ? "build/preview" : "build/frames");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
const seed = (c) => execFileSync("/usr/bin/python3", ["-I", path.join(here, "seed.py"), c]);
seed("reset");
const lines = JSON.parse(fs.readFileSync(path.join(here, "build/timeline.json"))); 
const prof = path.join(here, "build/edge"); fs.rmSync(prof, { recursive: true, force: true });
const edge = spawn("/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge", ["--headless=new", "--remote-debugging-port=9333", "--user-data-dir=" + prof, "--no-first-run", "--hide-scrollbars", "--force-device-scale-factor=1", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "about:blank"], { stdio: "ignore" });
let ws; for (let i = 0; i < 60; i++) { try { const l = await (await fetch("http://127.0.0.1:9333/json")).json(); const p = l.find((x) => x.type === "page"); if (p) { ws = new WebSocket(p.webSocketDebuggerUrl); break; } } catch {} await sleep(300); }
await new Promise((r) => (ws.onopen = r)); let id = 0; const wait = new Map(), errs = [];
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id) { wait.get(m.id)(m); wait.delete(m.id); } else if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errs.push(m.params.args.map((a) => a.value || a.description).join(" ").slice(0, 300)); else if (m.method === "Runtime.exceptionThrown") errs.push(JSON.stringify(m.params.exceptionDetails).slice(0, 400)); };
const cdp = (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => { const r = await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 700)); return r.result?.result?.value; };
await cdp("Page.enable"); await cdp("Runtime.enable");
await cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 810, deviceScaleFactor: 4 / 3, mobile: false });
await cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
await cdp("Page.addScriptToEvaluateOnNewDocument", { source: `window.__AMP=${JSON.stringify(lines.amp)};window.__LINES=${JSON.stringify(lines.lines)};` + fs.readFileSync(path.join(here, "clock.js"), "utf8") });
const overlay = "/@fs" + encodeURI(path.join(here, "overlay.jsx"));
async function load(t, clearToken) {
  await cdp("Page.navigate", { url: "http://localhost:5174/" });
  for (let i = 0; i < 400; i++) { await sleep(100); const ok = await ev(`!!document.querySelector('#root > *') && document.readyState==='complete' && document.fonts.status==='loaded'`).catch(() => false); if (ok) break; }
  await sleep(600); await ev(`import("${overlay}").then(m=>m.start(${t}))`);
  for (let i = 0; i < 12; i++) { await ev(`__tick(16)`); await sleep(40); }
}
await load(FROM);
const settle = async () => { for (let i = 0; i < 300; i++) { await sleep(i ? 6 : 3); if ((await ev("__pending()")) === 0) break; } };
let didTeam = false, n = 0;
const last = Math.round(TO * FPS);
for (let f = Math.round(FROM * FPS); f < last; f++) {
  const t = f / FPS;
  if (!didTeam && t > 60 && (await ev("!!window.__seedTeam"))) { didTeam = true; await settle(); seed("team"); }
  await ev(`__tick(${1000 / FPS});__frame(${t})`); await settle();
  if ((f - Math.round(FROM * FPS)) % STEP === 0) { const r = await cdp("Page.captureScreenshot", { format: "jpeg", quality: 93, optimizeForSpeed: false }); fs.writeFileSync(path.join(out, String(f).padStart(5, "0") + ".jpg"), Buffer.from(r.result.data, "base64")); n++; if (n % 150 === 0) console.log(new Date().toISOString().slice(11, 19), t.toFixed(1)); }
}
console.log("frames", n, "errors", errs.length); [...new Set(errs)].slice(0, 20).forEach((e) => console.log("ERR", e)); edge.kill(); process.exit(0);
