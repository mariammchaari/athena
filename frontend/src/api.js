const BASE = import.meta.env?.VITE_API_URL || "";
const read = (k) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
let token = read("athena_token");
export const setToken = (t) => {
  token = t;
  try { t ? localStorage.setItem("athena_token", t) : localStorage.removeItem("athena_token"); } catch { }
};
export const hasToken = () => !!token;

export class ApiError extends Error { constructor(msg, kind, status) { super(msg); this.kind = kind; this.status = status; } }

const UNREACHABLE = "Can't reach the ATHENA server. Start the backend: uvicorn main:app --host 127.0.0.1 --port 8000";
const headers = () => ({ "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) });

async function request(path, method, body, signal) {
  try {
    return await fetch(BASE + "/api" + path, { method, headers: headers(), body: body ? JSON.stringify(body) : undefined, signal });
  } catch (e) {
    if (e.name === "AbortError") throw e;
    throw new ApiError(UNREACHABLE, "network");
  }
}

function failure(res, raw) {
  let data = null;
  try { data = raw ? JSON.parse(raw) : {}; } catch { }
  if (data === null || (res.status >= 500 && !raw)) {
    return new ApiError(`The page loaded, but the backend isn't answering (HTTP ${res.status}). Is uvicorn running on port 8000?`, "proxy", res.status);
  }
  if (res.status === 401 && token) { setToken(""); window.dispatchEvent(new Event("athena:signed-out")); }
  const d = data.detail;
  const msg = typeof d === "string" ? d : Array.isArray(d) ? d.map((x) => x.msg).join("; ") : `Request failed (${res.status}).`;
  return new ApiError(msg, "http", res.status);
}

export async function api(path, method = "GET", body) {
  const res = await request(path, method, body);
  const raw = await res.text();
  if (!res.ok) throw failure(res, raw);
  try { return raw ? JSON.parse(raw) : {}; } catch { throw failure(res, null); }
}

export async function stream(path, body, onDelta, signal, onStage) {
  const res = await request(path, "POST", body, signal);
  if (!res.ok || !(res.headers.get("content-type") || "").includes("ndjson")) throw failure(res, await res.text());
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "", done = null;
  const handle = (line) => {
    if (!line.trim()) return;
    const ev = JSON.parse(line);
    if (ev.t === "delta") onDelta(ev.text, ev);
    else if (ev.t === "stage") onStage?.(ev);
    else if (ev.t === "done") done = ev;
    else if (ev.t === "error") throw new ApiError(ev.message, "stream");
  };
  for (;;) {
    let chunk;
    try { chunk = await reader.read(); } catch (e) {
      if (e.name === "AbortError") throw e;
      throw new ApiError("The connection dropped in the middle of the reply.", "stream");
    }
    if (chunk.done) break;
    buf += dec.decode(chunk.value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) { handle(buf.slice(0, i)); buf = buf.slice(i + 1); }
  }
  handle(buf);
  if (!done) throw new ApiError("The reply was cut off before it finished.", "stream");
  return done;
}
