// Synthesises original music and sound effects, then mixes them with Pingo's voice into build/mix.wav.
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url"; import { wav } from "./timeline.mjs";
const here = path.dirname(fileURLToPath(import.meta.url)), SR = 44100, D = 90, N = SR * D, L = new Float32Array(N), R = new Float32Array(N), TAU = Math.PI * 2;
const { lines } = JSON.parse(fs.readFileSync(path.join(here, "build/timeline.json")));
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5;
const put = (b, t, fn, dur, g, pan = 0) => { const s = Math.floor(t * SR), n = Math.floor(dur * SR); for (let i = 0; i < n && s + i < N; i++) { if (s + i < 0) continue; const v = fn(i / SR, i / n) * g; b[0][s + i] += v * (1 - pan) ; b[1][s + i] += v * (1 + pan); } };
const music = [new Float32Array(N), new Float32Array(N)], sfx = [L, R], f = (m) => 440 * 2 ** ((m - 69) / 12);
const pluck = (fr) => (t) => (Math.sin(TAU * fr * t) + 0.45 * Math.sin(TAU * 2 * fr * t) * Math.exp(-t * 7) + 0.18 * Math.sin(TAU * 3 * fr * t) * Math.exp(-t * 12)) * Math.exp(-t * 4.2) * Math.min(1, t * 500);
const bell = (fr) => (t) => (Math.sin(TAU * fr * t) + 0.3 * Math.sin(TAU * 2.76 * fr * t) * Math.exp(-t * 6)) * Math.exp(-t * 3.4) * Math.min(1, t * 600);
const pad = (fr) => (t, p) => (Math.sin(TAU * fr * t) + 0.35 * Math.sin(TAU * fr * 2.003 * t)) * Math.sin(Math.PI * p) ** 0.7;
const BEAT = 60 / 112, CH = [[60, 64, 67, 72], [55, 59, 62, 67], [57, 60, 64, 69], [53, 57, 60, 65]], MEL = [76, 79, 84, 79, 74, 79, 83, 79, 72, 76, 81, 76, 72, 77, 81, 84];
const energy = (t) => t < 11 ? 0.55 : t < 22 ? 0.75 : t < 38 ? 0.85 : t < 51 ? 0.95 : t < 56 ? 1.15 : t < 74 ? 1.0 : 0.95;
const LAST = 88.0;
for (let b = 0; ; b++) {
  const t = b * BEAT; if (t >= LAST) break; const bar = Math.floor(b / 4), ch = CH[bar % 4], e = energy(t), bb = b % 4;
  if (bb === 0) { put(music, t, pad(f(ch[0] - 12)), BEAT * 4, 0.05); put(music, t, pad(f(ch[1])), BEAT * 4, 0.022, -0.3); put(music, t, pad(f(ch[2])), BEAT * 4, 0.022, 0.3); }
  put(music, t, pluck(f(ch[0] - 12 + (bb === 2 ? 7 : 0))), 0.6, 0.11 * e);
  [0, 0.5].forEach((o, k) => put(music, t + o * BEAT, pluck(f(ch[(bb * 2 + k) % 4])), 0.7, 0.07 * e, k ? 0.35 : -0.35));
  if (t > 3 && (bar % 2 === 1 || t > 38) && (b % 2 === 0)) put(music, t, bell(f(MEL[(b / 2 + bar * 3) % 16 | 0])), 1.1, 0.05 * e, 0.15);
  if (t > 11) [0, 0.5].forEach((o) => put(music, t + o * BEAT, () => rnd() * 2, 0.04, (o ? 0.012 : 0.02) * e * (t >= 38 ? 1.3 : 1), 0.2));
  if (t >= 38 && t < 74 && bb === 0) put(music, t, (x) => Math.sin(TAU * 58 * x * Math.exp(-x * 5)) * Math.exp(-x * 11), 0.3, 0.13 * e);
}
[60, 64, 67, 72, 76].forEach((m, i) => put(music, LAST + i * 0.06, bell(f(m + 12)), 2.1, 0.08)); put(music, LAST, pluck(f(48)), 2, 0.16); put(music, LAST, pad(f(48)), 2, 0.05);
const speech = (t) => lines.some((l) => t > l.start - 0.1 && t < l.start + l.dur + 0.15); let duck = 1;
for (let i = 0; i < N; i++) { const t = i / SR, target = speech(t) ? 0.42 : 1; duck += (target - duck) * 0.0006; const fade = Math.min(1, t / 1.2) * Math.min(1, (D - t) / 0.5); L[i] = music[0][i] * duck * fade; R[i] = music[1][i] * duck * fade; }
const noise = (t, p) => rnd() * 2 * (1 - p) ** 3;
const S = {
  step: (t, g = 0.09) => put(sfx, t, (x, p) => Math.sin(TAU * 170 * x * (1 - p * 0.5)) * (1 - p) ** 2 + noise(x, p) * 0.2, 0.09, g),
  hop: (t, g = 0.16) => put(sfx, t, (x, p) => Math.sin(TAU * (240 + 520 * p) * x) * Math.sin(Math.PI * p), 0.2, g),
  knock: (t) => { put(sfx, t, (x, p) => (Math.sin(TAU * 310 * x) + 0.6 * Math.sin(TAU * 830 * x)) * Math.exp(-x * 42), 0.13, 0.42); put(sfx, t, noise, 0.02, 0.18); },
  click: (t) => put(sfx, t, (x) => Math.sin(TAU * 1250 * x) * Math.exp(-x * 90), 0.05, 0.16),
  ding: (t, m = 84, g = 0.22) => put(sfx, t, bell(f(m)), 0.9, g),
  chat: (t) => { put(sfx, t, bell(f(86)), 0.4, 0.17); put(sfx, t + 0.11, bell(f(91)), 0.5, 0.17); },
};
for (let k = 0; k * 0.5067 < 3.3; k++) S.step(k * 0.5067); for (let k = 10; k * 0.5067 < 7.4; k++) S.step(k * 0.5067);
[11, 11.32, 11.63].forEach((t) => S.hop(t)); [12, 12.36, 12.72, 18.9].forEach(S.knock);
put(sfx, 18.9, (x, p) => (Math.sin(TAU * (200 + 1000 * p * p) * x) * 0.5 + 0.5 * Math.sin(TAU * (300 + 1500 * p * p) * x)) * Math.sin(Math.PI * p) ** 1.5, 3.2, 0.14);
put(sfx, 19.45, (x, p) => rnd() * 2 * Math.sin(Math.PI * p) ** 2, 1.3, 0.09); [20.0, 20.25, 20.5, 20.75, 21.0].forEach((t, i) => S.ding(t, 79 + i * 3, 0.09));
S.hop(22.4, 0.11);
[27.6, 31.3, 33.0, 33.9, 34.8, 35.7, 37.8, 39.4, 40.3, 41.2, 42.6, 46.1, 47.8, 50.5, 55.5, 56.6, 58.8, 59.4, 60.3, 62.6, 65.4, 67.2, 71.0].forEach(S.click);
for (const [a, n, g] of [[28.2, 10, 0.9], [29.3, 4, 0.5], [30.0, 12, 0.7], [36.6, 20, 0.8], [41.4, 22, 1.0], [46.6, 14, 0.7], [57.1, 12, 0.6], [57.8, 15, 0.6], [65.7, 24, 1.1]]) for (let i = 0; i < n; i++) put(sfx, a + (g * i) / n, (x) => rnd() * 2 * Math.exp(-x * 240), 0.03, 0.045);
[0, 0.12, 0.24].forEach((o, i) => S.ding(31.4 + o, [72, 76, 79][i], 0.14)); [0, 0.1, 0.2].forEach((o, i) => S.ding(37.95 + o, [76, 79, 84][i], 0.13));
for (let i = 0; i < 5; i++) S.ding(43.3 + i * 0.07, 88 + i, 0.09); S.ding(47.9, 79, 0.12); S.ding(48.0, 84, 0.1);
for (let i = 0; i < 6; i++) S.ding(50.6 + i * 0.07, 84 + i * 2, 0.1);
[72, 76, 79, 84, 88, 91].forEach((m, i) => S.ding(51.0 + i * 0.1, m, 0.18)); put(sfx, 51.0, (x, p) => rnd() * 2 * (1 - p) ** 2, 1.2, 0.05);
[0, 0.08, 0.16, 0.24].forEach((o, i) => S.ding(60.5 + o, [79, 84, 88, 91][i], 0.1)); S.chat(67.7);
[72, 76, 79, 84].forEach((m, i) => S.ding(71.1 + i * 0.09, m, 0.15));
[74.1, 74.43, 74.76].forEach((t) => S.hop(t, 0.12)); [84, 88, 91, 96].forEach((m, i) => S.ding(75.5 + i * 0.06, m, 0.12)); [79, 84, 88, 91].forEach((m, i) => S.ding(80.8 + i * 0.08, m, 0.11));
for (const l of lines) { const x = wav(path.join(here, "build/voice", l.id + ".wav")), s = Math.floor(l.start * SR); let p = 0; for (const v of x) p = Math.max(p, Math.abs(v)); const g = 0.82 / p; for (let i = 0; i < x.length && s + i < N; i++) { L[s + i] += x[i] * g; R[s + i] += x[i] * g; } }
const out = Buffer.alloc(44 + N * 4); out.write("RIFF", 0); out.writeUInt32LE(36 + N * 4, 4); out.write("WAVEfmt ", 8); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(2, 22); out.writeUInt32LE(SR, 24); out.writeUInt32LE(SR * 4, 28); out.writeUInt16LE(4, 32); out.writeUInt16LE(16, 34); out.write("data", 36); out.writeUInt32LE(N * 4, 40);
let peak = 0, clip = 0; for (let i = 0; i < N; i++) for (const [b, c] of [[L, 0], [R, 1]]) { let v = b[i]; peak = Math.max(peak, Math.abs(v)); if (Math.abs(v) > 0.98) clip++; v = Math.tanh(v * 1.02); out.writeInt16LE(Math.round(v * 32000), 44 + i * 4 + c * 2); }
fs.writeFileSync(path.join(here, "build/mix.wav"), out); console.log("peak", peak.toFixed(2), "over", clip);
// loudness of music-only vs voice windows
const rms = (a, b) => { let s = 0; for (let i = a * SR; i < b * SR; i++) s += L[Math.floor(i)] ** 2; return (20 * Math.log10(Math.sqrt(s / ((b - a) * SR)))).toFixed(1); };
console.log("dB intro music", rms(2, 8), "| voice s5", rms(35, 42), "| music under chat gap", rms(73, 75));
