// A drawn hand that shows a number from 1 to 6 (0 = closed fist).
// Convention used in Bangladeshi and Indian school hand cricket:
// 1–4 = that many fingers, 5 = open hand, 6 = thumb only.

const SKIN = '#c98a5c';
const SKIN_DARK = '#7a4426';
const NAIL = '#e9b996';

export function fingersFor(n: number): { thumb: boolean; f: [boolean, boolean, boolean, boolean] } {
  switch (n) {
    case 1: return { thumb: false, f: [true, false, false, false] };
    case 2: return { thumb: false, f: [true, true, false, false] };
    case 3: return { thumb: false, f: [true, true, true, false] };
    case 4: return { thumb: false, f: [true, true, true, true] };
    case 5: return { thumb: true, f: [true, true, true, true] };
    case 6: return { thumb: true, f: [false, false, false, false] };
    default: return { thumb: false, f: [false, false, false, false] };
  }
}

const FINGERS = [
  { x: 34, len: 50 }, // index
  { x: 52, len: 56 }, // middle
  { x: 70, len: 51 }, // ring
  { x: 87, len: 40 }, // little
];

export function Hand({ n, mirror = false, cuff = '#1f3a8a', className, label }: { n: number; mirror?: boolean; cuff?: string; className?: string; label?: string }) {
  const { thumb, f } = fingersFor(n);
  return (
    <svg viewBox="0 0 120 170" className={className} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <g transform={mirror ? 'translate(120 0) scale(-1 1)' : undefined}>
        {FINGERS.map((fg, i) => {
          const up = f[i];
          const len = up ? fg.len : 12;
          const top = 74 - len;
          return (
            <g key={i}>
              <rect x={fg.x - 8} y={top} width={16} height={len + 14} rx={8} fill={SKIN} stroke={SKIN_DARK} strokeWidth={2.4} />
              {up && <ellipse cx={fg.x} cy={top + 7} rx={4.5} ry={5} fill={NAIL} />}
              {up && <path d={`M${fg.x - 5} ${top + len * 0.55} q5 3 10 0`} stroke={SKIN_DARK} strokeWidth={1.4} fill="none" opacity={0.6} />}
            </g>
          );
        })}
        {/* palm */}
        <path d="M24 70 C 24 64 98 64 98 70 L 100 118 C 100 136 88 146 64 146 C 40 146 24 136 22 118 Z" fill={SKIN} stroke={SKIN_DARK} strokeWidth={2.6} />
        {/* folded finger tips across the palm */}
        {f.map((up, i) => (!up ? <path key={i} d={`M${FINGERS[i].x - 7} 84 q7 6 14 0`} stroke={SKIN_DARK} strokeWidth={1.8} fill="none" /> : null))}
        {/* thumb */}
        {thumb ? (
          <g transform="rotate(-12 19 118)">
            <rect x={10} y={54} width={19} height={66} rx={9.5} fill={SKIN} stroke={SKIN_DARK} strokeWidth={2.4} />
            <ellipse cx={19.5} cy={63} rx={5} ry={5.5} fill={NAIL} />
            <path d="M14 92 q6 3 11 0" stroke={SKIN_DARK} strokeWidth={1.4} fill="none" opacity={0.6} />
          </g>
        ) : (
          <path d="M26 104 C 34 96 52 96 62 100 C 66 104 62 110 56 110 C 46 110 36 112 28 116 Z" fill={SKIN} stroke={SKIN_DARK} strokeWidth={2.2} />
        )}
        <path d="M40 126 q12 6 30 2" stroke={SKIN_DARK} strokeWidth={1.4} fill="none" opacity={0.55} />
        {/* school shirt sleeve with a coloured cuff */}
        <path d="M28 138 L 96 138 L 100 170 L 24 170 Z" fill="#f7f7f2" stroke="#9aa0a6" strokeWidth={2} />
        <rect x={26} y={140} width={72} height={9} fill={cuff} opacity={0.9} />
      </g>
    </svg>
  );
}
