// Reads voice WAVs and writes durations + a 30fps loudness track used for beak sync.
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url)); export const lines = JSON.parse(fs.readFileSync(path.join(here, "lines.json")));
export function wav(p) { const b = fs.readFileSync(p); let o = 12; while (b.toString("latin1", o, o + 4) !== "data") o += 8 + b.readUInt32LE(o + 4); const n = b.readUInt32LE(o + 4) / 2, x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = b.readInt16LE(o + 8 + i * 2) / 32768; return x; }
const amp = new Array(2700).fill(0);
for (const l of lines) { const x = wav(path.join(here, "build/voice", l.id + ".wav")); let e = x.length; while (e > 0 && Math.abs(x[e - 1]) < 0.01) e--; l.dur = e / 44100; const a = Math.round(l.start * 30); for (let f = 0; f < l.dur * 30; f++) { let s = 0; const st = Math.floor(f * 1470), N = 1470; for (let i = 0; i < N; i++) s += (x[st + i] || 0) ** 2; amp[a + f] = +Math.sqrt(s / N).toFixed(3); } if (l.dur > l.max) console.log("TOO LONG", l.id, l.dur); }
if (process.argv[1].endsWith("timeline.mjs")) { fs.writeFileSync(path.join(here, "build/timeline.json"), JSON.stringify({ lines, amp })); console.log(lines.map((l) => l.id + " " + l.start + "+" + l.dur.toFixed(2)).join("  ")); }
