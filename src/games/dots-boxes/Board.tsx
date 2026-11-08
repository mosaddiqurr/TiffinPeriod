import { useRef, useState } from 'react';
import { lineGeom, type DBState } from './model';

export const INK = ['#1f3a93', '#c62f2f'];

/** How close (in box widths) a press must be to a dot to start a drag from it. */
const GRAB = 0.34;
/** How far the finger must travel from the dot before a line is picked. */
const PICK = 0.42;

interface Drag { id: number; r: number; c: number; x: number; y: number; line: number | null; moved: boolean }

/**
 * The dotted page: drawn lines, won boxes with initials, and two ways to play a line:
 * tap the gap between two dots, or press a dot and drag towards the next dot.
 */
export function DBBoard({ st, canPlay, recent, initials, onPlay, label }: {
  st: DBState; canPlay: boolean; recent: number[]; initials: string[]; onPlay: (l: number) => void; label: (l: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [drag, setDragState] = useState<Drag | null>(null);
  // Fast moves arrive before React re-renders, so the handlers read the drag from a ref.
  const dragRef = useRef<Drag | null>(null);
  const setDrag = (d: Drag | null) => { dragRef.current = d; setDragState(d); };
  const svgRef = useRef<SVGSVGElement>(null);
  // After a drag, the browser still sends a click; it must not also play the line under the finger.
  const justDragged = useRef(false);
  const pad = 0.5;
  const R = st.board.rows, C = st.board.cols;
  const H = (R + 1) * C;

  const toBoard = (e: React.PointerEvent): [number, number] | null => {
    const m = svgRef.current?.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return [p.x, p.y];
  };

  /** The free line from dot (r, c) towards where the finger is, or null. */
  const lineToward = (r: number, c: number, x: number, y: number): number | null => {
    const dx = x - c, dy = y - r;
    if (Math.hypot(dx, dy) < PICK) return null;
    let l: number | null = null;
    if (Math.abs(dx) >= Math.abs(dy)) {
      if (dx > 0 && c < C) l = r * C + c;
      else if (dx < 0 && c > 0) l = r * C + c - 1;
    } else {
      if (dy > 0 && r < R) l = H + r * (C + 1) + c;
      else if (dy < 0 && r > 0) l = H + (r - 1) * (C + 1) + c;
    }
    return l !== null && st.drawn[l] < 0 ? l : null;
  };

  const onDown = (e: React.PointerEvent<SVGSVGElement>) => {
    justDragged.current = false;
    if (!canPlay || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const p = toBoard(e);
    if (!p) return;
    const c = Math.round(p[0]), r = Math.round(p[1]);
    if (r < 0 || r > R || c < 0 || c > C || Math.hypot(p[0] - c, p[1] - r) > GRAB) return;
    setDrag({ id: e.pointerId, r, c, x: p[0], y: p[1], line: null, moved: false });
  };

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || e.pointerId !== drag.id) return;
    const p = toBoard(e);
    if (!p) return;
    const moved = drag.moved || Math.hypot(p[0] - drag.c, p[1] - drag.r) > 0.18;
    if (moved && !drag.moved) {
      // Keep following this finger even if it leaves the board.
      try { svgRef.current?.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    }
    const line = moved ? lineToward(drag.r, drag.c, p[0], p[1]) : null;
    setDrag({ ...drag, x: p[0], y: p[1], line, moved });
    setHover(line);
  };

  const onUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || e.pointerId !== drag.id) return;
    if (drag.moved) {
      justDragged.current = true;
      if (drag.line !== null && canPlay) onPlay(drag.line);
    }
    setDrag(null);
    setHover(null);
  };

  const cancel = () => { setDrag(null); setHover(null); };

  const dragging = drag?.moved && canPlay ? drag : null;

  return (
    <div className="db-paper">
      <svg ref={svgRef} className="db-svg" viewBox={`${-pad} ${-pad} ${C + pad * 2} ${R + pad * 2}`} data-testid="board"
        onPointerLeave={() => { if (!dragRef.current) setHover(null); }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={cancel}>
        {st.owner.map((o, b) => {
          if (o < 0) return null;
          const r = Math.floor(b / C), c = b % C;
          return (
            <g key={`b${b}`} className="db-box" pointerEvents="none">
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
                <line x1={ge.x1} y1={ge.y1} x2={ge.x2} y2={ge.y2} stroke={INK[d]} strokeWidth={isRecent ? 0.11 : 0.085} strokeLinecap="round" pointerEvents="none" className={isRecent ? 'db-new' : ''} />
              ) : hover === l && canPlay ? (
                <line x1={ge.x1} y1={ge.y1} x2={ge.x2} y2={ge.y2} stroke={INK[st.turn]} strokeWidth={0.07} strokeLinecap="round" opacity={dragging ? 0.6 : 0.35} strokeDasharray="0.12 0.1" pointerEvents="none" />
              ) : null}
              {!drawn && (
                <rect x={ge.y1 === ge.y2 ? ge.x1 + 0.14 : ge.x1 - 0.21} y={ge.y1 === ge.y2 ? ge.y1 - 0.21 : ge.y1 + 0.14} width={ge.y1 === ge.y2 ? 0.72 : 0.42} height={ge.y1 === ge.y2 ? 0.42 : 0.72} fill="transparent" className="db-hit"
                  onPointerEnter={() => { if (!dragRef.current) setHover(l); }}
                  onClick={() => { if (justDragged.current) { justDragged.current = false; return; } if (canPlay) onPlay(l); }}
                  data-testid={`line-${l}`} role="button" aria-label={label(l)} />
              )}
            </g>
          );
        })}
        {dragging && (
          // The pencil line following the finger.
          <line x1={dragging.c} y1={dragging.r} x2={dragging.x} y2={dragging.y} stroke={INK[st.turn]} strokeWidth={0.05} strokeLinecap="round" opacity={0.45} pointerEvents="none" />
        )}
        {Array.from({ length: (R + 1) * (C + 1) }, (_, i) => {
          const cx = i % (C + 1), cy = Math.floor(i / (C + 1));
          const held = drag && drag.r === cy && drag.c === cx && canPlay;
          return <circle key={`d${i}`} cx={cx} cy={cy} r={held ? 0.12 : 0.075} fill={held ? INK[st.turn] : '#23253a'} pointerEvents="none" />;
        })}
      </svg>
    </div>
  );
}
