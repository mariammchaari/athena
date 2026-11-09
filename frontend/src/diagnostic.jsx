import { useState } from "react";
import { api } from "./api.js";
import { DIAG } from "./i18n_hack.js";
import { Pingo, Bubble } from "./mascot.jsx";
import { burst } from "./fx.jsx";

const STYLE_ICON = { visual: "🎨", analogy: "🍕", steps: "🪜", examples: "🧩", practice: "🔁", direct: "🎯" };

export function Diagnostic({ lang, level, onDone, onSkip }) {
  const d = DIAG[lang] || DIAG.en;
  const [step, setStep] = useState(0);
  const [choices, setChoices] = useState([]);
  const [ex, setEx] = useState(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");
  const total = 5;
  const pick = (style) => { const c = [...choices]; c[step] = style; setChoices(c); setTimeout(() => setStep(step + 1), 260); };
  const finish = async () => {
    setBusy(true); setErr("");
    try {
      const r = await api("/diagnostic", "POST", { choices: [...choices.filter(Boolean), ex?.[1]].filter(Boolean), exercise_correct: ex ? ex[2] : null, text });
      setResult(r); burst(innerWidth / 2, innerHeight * 0.4, 1.1);
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  let mood = "wave", line = d.title;
  if (result) { mood = "celebrate"; line = null; }
  else if (busy) { mood = "thinking"; line = d.analyzing; }
  else if (step === 3) { mood = ex ? (ex[2] ? "happy" : "oops") : "thinking"; line = null; }
  else if (step === 4) { mood = text ? "listening" : "idle"; line = null; }
  else if (step > 0) { mood = "listening"; line = null; }
  return (
    <div className="diag-backdrop">
      <div className="diag" role="dialog" aria-modal="true" aria-labelledby="diag-title">
        <div className="diag-pingo">
          {line && <Bubble key={line} className="diag-bubble">{line}</Bubble>}
          <Pingo mood={mood} size={140} level={level} look={step === 4 && text ? { x: 0, y: 0.8 } : null} />
        </div>
        {!result ? (
          <>
            <div className="diag-progress" aria-hidden="true"><span style={{ width: (step / total) * 100 + "%" }} /></div>
            {step === 0 && <p className="faint diag-sub">{d.sub}</p>}
            <h2 id="diag-title">{step < 3 ? d.qs[step][0] : step === 3 ? d.exQ : d.textQ}</h2>
            {step < 3 && (
              <div className="diag-options">
                {d.qs[step][1].map(([label, style]) => (
                  <button key={label} className={"diag-opt" + (choices[step] === style ? " on" : "")} onClick={() => pick(style)}>
                    <span className="diag-emoji" aria-hidden="true">{STYLE_ICON[style]}</span>{label}
                  </button>
                ))}
              </div>
            )}
            {step === 3 && (
              <div className="diag-options">
                {d.ex.map((o) => (
                  <button key={o[0]} className={"diag-opt" + (ex === o ? (o[2] ? " right" : " wrongish") : "")} onClick={() => { setEx(o); setTimeout(() => setStep(4), 700); }}>{o[0]}</button>
                ))}
              </div>
            )}
            {step === 4 && (
              <div className="diag-text">
                <textarea dir="auto" rows={3} maxLength={300} value={text} placeholder={d.textPh} onChange={(e) => setText(e.target.value)} autoFocus />
                {err && <p className="err">{err}</p>}
                <button className="btn3d wide" disabled={busy} onClick={finish}>{d.finish}</button>
              </div>
            )}
            <div className="diag-nav">
              {step > 0 ? <button className="linkbtn" onClick={() => setStep(step - 1)}>{d.back}</button> : <span />}
              <button className="linkbtn" onClick={onSkip}>{d.skip}</button>
            </div>
          </>
        ) : (
          <div className="diag-result">
            <p className="faint">{d.resultTitle}</p>
            <div className="style-chips">{result.style.map((s) => <span key={s} className="style-chip"><span aria-hidden="true">{STYLE_ICON[s]}</span>{d.styles[s]}</span>)}</div>
            <p className="faint">{d.resultSub}</p>
            <button className="btn3d wide" onClick={() => onDone(result.user)}>{d.start}</button>
          </div>
        )}
      </div>
    </div>
  );
}

export { STYLE_ICON };
