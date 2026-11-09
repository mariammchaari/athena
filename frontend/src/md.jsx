import katex from "katex";

function TeX({ src, display }) {
  let html = null;
  try { html = katex.renderToString(src, { displayMode: display, throwOnError: false, trust: false, strict: "ignore" }); } catch { }
  if (!html) return <code>{src}</code>;
  return <span className={display ? "tex-block" : "tex"} dir="ltr" dangerouslySetInnerHTML={{ __html: html }} />;
}

const INLINE = /(`[^`]+`|\$\$[^$]+\$\$|\\\([\s\S]+?\\\)|\$[^$\s](?:[^$\n]*?[^$\s\\])?\$(?!\d)|\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g;
const inline = (t, k) => t.split(INLINE).map((p, i) => {
  const key = k + "-" + i;
  if (!p) return null;
  if (p.startsWith("`")) return <code key={key}>{p.slice(1, -1)}</code>;
  if (p.startsWith("$$")) return <TeX key={key} src={p.slice(2, -2)} display={false} />;
  if (p.startsWith("\\(")) return <TeX key={key} src={p.slice(2, -2)} display={false} />;
  if (p.startsWith("$") && p.length > 2) return <TeX key={key} src={p.slice(1, -1)} display={false} />;
  if (p.startsWith("**")) return <strong key={key}>{inline(p.slice(2, -2), key)}</strong>;
  if (p.startsWith("*") && p.length > 2) return <em key={key}>{p.slice(1, -1)}</em>;
  return p;
});

const LIST = /^\s*(\d+[.)]|[-*•])\s+/;
const BLOCK_START = /^(```|\$\$|\\\[|#{1,4}\s|>\s?|\|)/;
const cells = (row) => row.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

export function Markdown({ text }) {
  const out = []; const lines = text.split("\n"); let i = 0, n = 0;
  while (i < lines.length) {
    const l = lines[i];
    const t = l.trim();
    if (t.startsWith("```")) {
      const buf = []; i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) buf.push(lines[i++]);
      i++; out.push(<pre key={n++} dir="ltr"><code>{buf.join("\n")}</code></pre>);
    } else if (t.startsWith("$$") || t.startsWith("\\[")) {
      const close = t.startsWith("$$") ? "$$" : "\\]";
      const first = t.slice(2);
      if (first.trim().endsWith(close) && first.trim().length > close.length) {
        out.push(<TeX key={n++} src={first.trim().slice(0, -close.length)} display />); i++;
      } else {
        const buf = [first]; i++;
        while (i < lines.length && !lines[i].trim().endsWith(close)) buf.push(lines[i++]);
        if (i < lines.length) { buf.push(lines[i].trim().slice(0, -close.length)); i++; out.push(<TeX key={n++} src={buf.join("\n")} display />); }
        else out.push(<p key={n++} className="pending-tex" dir="ltr">{buf.join(" ")}</p>);
      }
    } else if (t.startsWith("|") && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const head = cells(l); i += 2; const rows = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(cells(lines[i++]));
      out.push(
        <div key={n++} className="table-wrap"><table>
          <thead><tr>{head.map((c, j) => <th key={j}>{inline(c, "h" + j)}</th>)}</tr></thead>
          <tbody>{rows.map((r, a) => <tr key={a}>{head.map((_, b) => <td key={b}>{inline(r[b] || "", a + "." + b)}</td>)}</tr>)}</tbody>
        </table></div>);
    } else if (/^>\s?/.test(t)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) buf.push(lines[i++].trim().replace(/^>\s?/, ""));
      out.push(<blockquote key={n++}>{inline(buf.join(" "), "q" + n)}</blockquote>);
    } else if (LIST.test(l)) {
      const ord = /^\s*\d/.test(l); const items = [];
      while (i < lines.length && LIST.test(lines[i])) items.push(lines[i++].replace(LIST, ""));
      const L = items.map((x, j) => <li key={j}>{inline(x, "l" + j)}</li>);
      out.push(ord ? <ol key={n++}>{L}</ol> : <ul key={n++}>{L}</ul>);
    } else if (/^#{1,4}\s/.test(t)) {
      out.push(<h4 key={n++}>{inline(t.replace(/^#+\s/, ""), "h" + n)}</h4>); i++;
    } else if (!t) i++;
    else {
      const buf = [];
      while (i < lines.length && lines[i].trim() && !BLOCK_START.test(lines[i].trim()) && !LIST.test(lines[i])) buf.push(lines[i++]);
      if (!buf.length) buf.push(lines[i++]);
      out.push(<p key={n++}>{inline(buf.join(" "), "p" + n)}</p>);
    }
  }
  return <>{out}</>;
}
