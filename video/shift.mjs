import fs from "node:fs"; const [,, a, b, r] = process.argv, d = fs.readFileSync(a), R = +r;
let o = 12; while (d.toString("latin1", o, o + 4) !== "data") o += 8 + d.readUInt32LE(o + 4);
const n = d.readUInt32LE(o + 4) / 2, g = (i) => (i < 0 || i >= n ? 0 : d.readInt16LE(o + 8 + i * 2)), m = Math.floor(n / R), out = Buffer.alloc(44 + m * 2);
out.write("RIFF", 0); out.writeUInt32LE(36 + m * 2, 4); out.write("WAVEfmt ", 8); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22); out.writeUInt32LE(44100, 24); out.writeUInt32LE(88200, 28); out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34); out.write("data", 36); out.writeUInt32LE(m * 2, 40);
for (let i = 0; i < m; i++) { const x = i * R, k = Math.floor(x), f = x - k, p0 = g(k - 1), p1 = g(k), p2 = g(k + 1), p3 = g(k + 2), v = p1 + 0.5 * f * (p2 - p0 + f * (2 * p0 - 5 * p1 + 4 * p2 - p3 + f * (3 * (p1 - p2) + p3 - p0))); out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v))), 44 + i * 2); }
fs.writeFileSync(b, out);
