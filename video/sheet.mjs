// node sheet.mjs dir out.png [cols] [filter-from] [filter-to]: contact sheet for reviewing frames.
import fs from "node:fs"; import path from "node:path"; import { execFileSync } from "node:child_process";
const [,, dir, out, c = 6, a = 0, b = 9999] = process.argv, d = path.resolve(dir);
const fsx = fs.readdirSync(d).filter((f) => f.endsWith(".jpg") && +f.slice(0, 5) / 30 >= +a && +f.slice(0, 5) / 30 <= +b), w = Math.floor(1980 / c);
const html = `<body style="margin:0;background:#222;display:grid;grid-template-columns:repeat(${c},${w}px)">` + fsx.map((f) => `<div style="position:relative"><img src="file://${d}/${f}" width="${w}" style="display:block"><b style="position:absolute;left:4px;top:2px;background:#000;color:#fff;font:14px sans-serif;padding:1px 4px">${(+f.slice(0, 5) / 30).toFixed(1)}</b></div>`).join("");
const tmp = path.resolve("build/sheet.html"); fs.writeFileSync(tmp, html); const h = Math.ceil(fsx.length / c) * Math.round(w * 9 / 16);
execFileSync("/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge", ["--headless=new", "--user-data-dir=" + path.resolve("build/edge2"), "--allow-file-access-from-files", "--hide-scrollbars", `--window-size=${w * c},${h}`, "--virtual-time-budget=6000", "--screenshot=" + path.resolve(out), "file://" + tmp], { stdio: "ignore" });
