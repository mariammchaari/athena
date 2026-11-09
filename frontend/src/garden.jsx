const cypress = (x, base, h, w = 15) =>
  `M${x} ${base} C ${x - w} ${base - h * 0.28} ${x - w * 0.85} ${base - h * 0.74} ${x} ${base - h} C ${x + w * 0.85} ${base - h * 0.74} ${x + w} ${base - h * 0.28} ${x} ${base} Z`;

function Cypress({ x, base, h, w, delay = 0 }) {
  return (
    <g className="sway" style={{ transformOrigin: `${x}px ${base}px`, animationDelay: delay + "s" }}>
      <path d={cypress(x, base, h, w)} fill="#1E9A60" />
      <path d={`M${x} ${base} C ${x + w} ${base - h * 0.28} ${x + w * 0.85} ${base - h * 0.74} ${x} ${base - h} Z`} fill="#167F4E" />
    </g>
  );
}
function Olive({ x, base, s = 1, delay = 0 }) {
  return (
    <g className="sway slow" style={{ transformOrigin: `${x}px ${base}px`, animationDelay: delay + "s" }} transform={`translate(${x} ${base}) scale(${s}) translate(${-x} ${-base})`}>
      <path d={`M${x - 3} ${base} C ${x - 4} ${base - 20} ${x + 6} ${base - 28} ${x + 2} ${base - 44} L ${x + 8} ${base - 44} C ${x + 12} ${base - 26} ${x + 4} ${base - 18} ${x + 5} ${base} Z`} fill="#8A6A4A" />
      <circle cx={x - 18} cy={base - 52} r="20" fill="#A7CF84" />
      <circle cx={x + 20} cy={base - 54} r="22" fill="#9CC77A" />
      <circle cx={x + 2} cy={base - 70} r="24" fill="#B6DA92" />
      <circle cx={x - 6} cy={base - 60} r="5" fill="#5B4A86" opacity=".7" />
      <circle cx={x + 18} cy={base - 64} r="4.5" fill="#5B4A86" opacity=".7" />
    </g>
  );
}
function Column({ x, base, h, broken }) {
  return (
    <g>
      <rect x={x - 11} y={base - h} width="22" height={h} fill="#FFFDF7" />
      {[-6, 0, 6].map((d) => <line key={d} x1={x + d} y1={base - h + 4} x2={x + d} y2={base - 2} stroke="#E6DDCB" strokeWidth="1.6" />)}
      {!broken && <rect x={x - 15} y={base - h - 6} width="30" height="7" rx="2" fill="#F4EEDF" />}
      {broken && <path d={`M${x - 11} ${base - h} L ${x - 4} ${base - h - 6} L ${x + 3} ${base - h + 2} L ${x + 11} ${base - h - 3} L ${x + 11} ${base - h} Z`} fill="#FFFDF7" />}
      <rect x={x - 14} y={base - 4} width="28" height="5" rx="1.5" fill="#F4EEDF" />
    </g>
  );
}
function Flower({ x, y, c, s = 1, delay = 0 }) {
  return (
    <g className="bob" style={{ animationDelay: delay + "s", transformOrigin: `${x}px ${y + 10}px` }}>
      <path d={`M${x} ${y + 12} Q ${x - 2} ${y + 6} ${x} ${y}`} stroke="#2E9E5E" strokeWidth="1.8" fill="none" />
      {[0, 72, 144, 216, 288].map((a) => <ellipse key={a} cx={x} cy={y - 4.5 * s} rx={3 * s} ry={4.5 * s} fill={c} transform={`rotate(${a} ${x} ${y})`} />)}
      <circle cx={x} cy={y} r={2.4 * s} fill="#FFC53D" />
    </g>
  );
}
function Butterfly({ path, dur, c, delay = 0 }) {
  return (
    <g>
      <g className="butterfly">
        <path className="wing l" d="M0 0 C -9 -10 -14 -2 -10 4 C -7 8 -2 5 0 0 Z" fill={c} />
        <path className="wing r" d="M0 0 C 9 -10 14 -2 10 4 C 7 8 2 5 0 0 Z" fill={c} />
        <ellipse cx="0" cy="1" rx="1.2" ry="4" fill="#3A2A55" />
      </g>
      <animateMotion dur={dur + "s"} begin={delay + "s"} repeatCount="indefinite" path={path} rotate="0" />
    </g>
  );
}

export function GardenScene({ tall = true, className = "" }) {
  return (
    <svg className={"garden-scene " + className} viewBox="0 0 1440 320" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <path d="M0 214 C 200 156 380 172 560 192 C 760 214 900 150 1100 160 C 1250 168 1350 190 1440 182 V320 H0 Z" fill="#C6EFD2" />
      {tall && (
        <g className="temple" transform="translate(1030 0)">
          <rect x="-6" y="96" width="132" height="10" rx="2" fill="#F4EEDF" />
          <path d="M-12 96 L60 70 L132 96 Z" fill="#FFFDF7" />
          <path d="M8 92 L60 76 L112 92 Z" fill="#F1E9D6" />
          <Column x={10} base={168} h={62} /><Column x={46} base={168} h={62} /><Column x={82} base={168} h={62} /><Column x={118} base={168} h={44} broken />
          <rect x="-10" y="166" width="140" height="8" rx="2" fill="#EDE5D2" />
        </g>
      )}
      <Cypress x={180} base={210} h={110} w={13} delay={0.2} />
      <Cypress x={206} base={214} h={84} w={11} delay={0.9} />
      {tall && <Cypress x={1300} base={196} h={120} w={14} delay={0.5} />}
      {tall && <Cypress x={1330} base={200} h={88} w={11} delay={1.2} />}
      <path d="M0 252 C 240 206 420 226 640 240 C 860 254 1040 212 1240 222 C 1340 228 1400 240 1440 236 V320 H0 Z" fill="#86DDA5" />
      <Olive x={420} base={248} s={1.05} delay={0.4} />
      <Olive x={900} base={244} s={0.9} delay={1.4} />
      {tall && <Olive x={70} base={262} s={1.15} delay={0.8} />}
      <Cypress x={1180} base={236} h={130} w={15} delay={0.3} />
      <path d="M0 288 C 300 262 520 276 760 284 C 1000 292 1200 266 1440 274 V320 H0 Z" fill="#47C584" />
      <path d="M0 304 C 260 290 520 300 760 302 C 1000 304 1220 290 1440 296 V320 H0 Z" fill="#35AE6E" />
      {[[120, 282, "#FF7EB6"], [160, 290, "#FFFFFF"], [330, 280, "#FFD25C"], [560, 288, "#FF7EB6"], [620, 296, "#B79CFF"], [800, 290, "#FFFFFF"],
        [980, 286, "#FFD25C"], [1080, 280, "#FF7EB6"], [1250, 282, "#B79CFF"], [1370, 286, "#FFFFFF"], [700, 300, "#FFD25C"], [40, 296, "#B79CFF"]].map(([x, y, c], i) =>
        <Flower key={i} x={x} y={y} c={c} s={0.9 + (i % 3) * 0.15} delay={i * 0.37} />)}
      <Butterfly c="#FF5DA2" dur={14} path="M240 200 C 340 120 460 180 560 140 C 660 100 760 170 700 210 C 620 250 420 250 240 200 Z" />
      <Butterfly c="#FFC53D" dur={18} delay={3} path="M1000 180 C 1100 110 1220 160 1260 120 C 1320 80 1380 160 1300 200 C 1200 240 1080 230 1000 180 Z" />
      {tall && <Butterfly c="#22C1E6" dur={16} delay={6} path="M700 150 C 760 90 880 120 920 170 C 960 220 820 240 760 210 C 700 180 650 200 700 150 Z" />}
    </svg>
  );
}

export function Plant({ mastery = 0, done = false, size = 132 }) {
  const g = done ? 1 : Math.max(0, Math.min(1, mastery / 100));
  return (
    <svg className={"plant" + (done ? " bloomed" : "")} viewBox="0 0 120 140" width={size} height={(size * 140) / 120} style={{ "--g": g }} aria-hidden="true">
      <ellipse cx="60" cy="128" rx="44" ry="8" fill="#000" opacity=".08" />
      <g className="plant-sway">
        <path className="p-stem" d="M60 124 C 58 104 62 84 60 46" stroke="#3FA65E" strokeWidth="5" fill="none" strokeLinecap="round" />
        {[[0.32, -1, "#56D68D"], [0.32, 1, "#2FBF71"], [0.55, -1, "#2FBF71"], [0.55, 1, "#56D68D"], [0.76, -1, "#56D68D"]].map(([f, side, c], i) => (
          <g key={i} className="p-leaf" style={{ "--f": f, "--at": 0.06 + i * 0.09 }}>
            <ellipse cx={60 + side * 13} cy="124" rx="13" ry="5.5" fill={c} transform={`rotate(${side * -28} ${60 + side * 13} 124)`} />
          </g>
        ))}
        <g className="p-canopy">
          <circle cx="44" cy="52" r="17" fill="#A7CF84" /><circle cx="76" cy="50" r="19" fill="#9CC77A" /><circle cx="60" cy="36" r="21" fill="#B6DA92" />
          <g className="p-olives"><circle cx="50" cy="44" r="3.4" fill="#5B4A86" /><circle cx="72" cy="54" r="3.4" fill="#5B4A86" /><circle cx="64" cy="30" r="3" fill="#5B4A86" /></g>
          <g className="p-bloom">
            {[[42, 40], [78, 44], [58, 22], [66, 56], [36, 58]].map(([x, y], i) => (
              <g key={i} transform={`translate(${x} ${y})`}>{[0, 72, 144, 216, 288].map((a) => <ellipse key={a} cx="0" cy="-3.6" rx="2.6" ry="3.6" fill="#FFD25C" transform={`rotate(${a})`} />)}<circle r="1.8" fill="#FF8A3D" /></g>
            ))}
          </g>
        </g>
      </g>
      <path className="p-seed" d="M56 120 Q60 112 64 120 Q60 124 56 120 Z" fill="#8A6A4A" />
      <path d="M14 126 C 30 114 90 114 106 126 C 96 134 24 134 14 126 Z" fill="#9C6B43" />
      <path d="M22 124 C 36 116 84 116 98 124" stroke="#B9875B" strokeWidth="2" fill="none" />
    </svg>
  );
}
