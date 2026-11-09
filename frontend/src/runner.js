const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";

const JS_WORKER = `
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
self.onmessage = (e) => {
  const { code, fn, tests } = e.data;
  let f;
  try { f = new Function(code + "\\n;return typeof " + fn + " === 'function' ? " + fn + " : undefined;")(); }
  catch (err) { postMessage({ fatal: String(err) }); return; }
  if (!f) { postMessage({ fatal: "Define a function named " + fn + "(…)" }); return; }
  const results = tests.map(([args, expected]) => {
    try { const got = f(...JSON.parse(JSON.stringify(args))); return { ok: same(got, expected), got }; }
    catch (err) { return { ok: false, error: String(err) }; }
  });
  postMessage({ results });
};`;

const PY_WORKER = `
importScripts("${PYODIDE}pyodide.js");
const ready = loadPyodide({ indexURL: "${PYODIDE}" });
const HARNESS = \`
import json, traceback
def __athena_run(code, fn, tests_json):
    ns = {}
    try:
        exec(code, ns)
    except Exception:
        return json.dumps({"fatal": traceback.format_exc(limit=1).strip().splitlines()[-1]})
    f = ns.get(fn)
    if not callable(f):
        return json.dumps({"fatal": "Define a function named " + fn + "(…)"})
    out = []
    for args, expected in json.loads(tests_json):
        try:
            got = json.loads(json.dumps(f(*args)))
            out.append({"ok": got == expected, "got": got})
        except Exception as e:
            out.append({"ok": False, "error": type(e).__name__ + ": " + str(e)})
    return json.dumps({"results": out})
\`;
self.onmessage = async (e) => {
  try {
    const py = await ready;
    if (!self.__harness) { py.runPython(HARNESS); self.__harness = true; postMessage({ loaded: true }); }
    const run = py.globals.get("__athena_run");
    const { code, fn, tests } = e.data;
    postMessage(JSON.parse(run(code, fn, JSON.stringify(tests))));
  } catch (err) { postMessage({ fatal: String(err) }); }
};`;

const blobURL = (src) => URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
let pyWorker = null, pyLoaded = false;

export function runTests({ lang, code, fn, tests, timeout, onLoading }) {
  return new Promise((resolve) => {
    let worker;
    if (lang === "python") {
      if (!pyWorker) { pyWorker = new Worker(blobURL(PY_WORKER)); pyLoaded = false; }
      worker = pyWorker;
      if (!pyLoaded) onLoading?.(true);
    } else {
      worker = new Worker(blobURL(JS_WORKER));
    }
    const limit = timeout ?? (lang === "python" && !pyLoaded ? 60000 : 5000);
    const timer = setTimeout(() => {
      worker.terminate();
      if (worker === pyWorker) { pyWorker = null; pyLoaded = false; }
      onLoading?.(false);
      resolve({ fatal: "Time limit exceeded: is there an infinite loop?", passed: 0, total: tests.length });
    }, limit);
    worker.onmessage = (e) => {
      if (e.data.loaded) { pyLoaded = true; onLoading?.(false); return; }
      clearTimeout(timer);
      if (lang !== "python") worker.terminate();
      const results = e.data.results || [];
      resolve({ ...e.data, results, passed: results.filter((r) => r.ok).length, total: tests.length });
    };
    worker.onerror = (e) => {
      clearTimeout(timer);
      if (worker === pyWorker) { pyWorker.terminate(); pyWorker = null; pyLoaded = false; }
      onLoading?.(false);
      const offline = /importScripts|NetworkError|Failed to fetch|load/i.test(e.message || "");
      resolve({ fatal: lang === "python" && offline ? "Couldn't download the Python runner (it needs internet the first time). Try again, or switch to JavaScript."
        : e.message || "Could not start the code runner.", passed: 0, total: tests.length });
    };
    worker.postMessage({ code, fn, tests });
  });
}

export function starter(lang, fn, params) {
  return lang === "python"
    ? `def ${fn}(${params.join(", ")}):\n    # your code here\n    pass\n`
    : `function ${fn}(${params.join(", ")}) {\n  // your code here\n}\n`;
}
