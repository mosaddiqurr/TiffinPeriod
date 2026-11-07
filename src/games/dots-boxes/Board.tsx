import { useState } from 'react';
import { lineGeom, type DBState } from './model';

export const INK = ['#1f3a93', '#c62f2f'];

/** The dotted page: drawn lines, won boxes with initials, and tap areas for free lines. */
export function DBBoard({ st, canPlay, recent, initials, onPlay, label }: {
  st: DBState; canPlay: boolean; recent: number[]; initials: string[]; onPlay: (l: number) => void; label: (l: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const pad = 0.5;
  const R = st.board.rows, C = st.board.cols;
  return (
    <div className="db-paper">
      <svg className="db-svg" viewBox={`${-pad} ${-pad} ${C + pad * 2} ${R + pad * 2}`} data-testid="board" onPointerLeave={() => setHover(null)}>
        {st.owner.map((o, b) => {
          if (o < 0) return null;
          const r = Math.floor(b / C), c = b % C;
          return (
            <g key={`b${b}`} className="db-box">
              <rect x={c + 0.06} y={r + 0.06} width={0.88} height={0.88} fill={INK[o]} opacity={0.13} rx={0.06} />
              <text x={c + 0.5} y={r + 0.66} textAnchor="middle" fontSize={0.5} fontWeight={800} fill={INK[o]} fontFamily="var(--font-display)" transform={`rotate(-6 ${c + 0.5} ${r + 0.5})`}>{initials[o]}</text>
            </g>
          );
        })}
        {st.drawn.map((d, l) => {
          const ge = lineGeom(st.board, l);
          const drawn = d >= 0;
          const isRecent = recent.includes(l) || st.last === l;
          return (
            <g key={l}>
              {drawn ? (
                <line x1={ge.x1} y1={ge.y1} x2={ge.x2} y2={ge.y2} stroke={INK[d]} strokeWidth={isRecent ? 0.11 : 0.085} strokeLinecap="round" className={isRecent ? 'db-new' : ''} />
              ) : hover === l && canPlay ? (
                <line x1={ge.x1} y1={ge.y1} x2={ge.x2} y2={ge.y2} stroke={INK[st.turn]} strokeWidth={0.07} strokeLinecap="round" opacity={0.35} strokeDasharray="0.12 0.1" />
              ) : null}
              {!drawn && (
                <rect x={ge.y1 === ge.y2 ? ge.x1 + 0.14 : ge.x1 - 0.21} y={ge.y1 === ge.y2 ? ge.y1 - 0.21 : ge.y1 + 0.14} width={ge.y1 === ge.y2 ? 0.72 : 0.42} height={ge.y1 === ge.y2 ? 0.42 : 0.72} fill="transparent" className="db-hit"
                  onPointerEnter={() => setHover(l)} onClick={() => canPlay && onPlay(l)} data-testid={`line-${l}`}
                  role="button" aria-label={label(l)} />
              )}
            </g>
          );
        })}
        {Array.from({ length: (R + 1) * (C + 1) }, (_, i) => <circle key={`d${i}`} cx={i % (C + 1)} cy={Math.floor(i / (C + 1))} r={0.075} fill="#23253a" pointerEvents="none" />)}
      </svg>
    </div>
  );
}
