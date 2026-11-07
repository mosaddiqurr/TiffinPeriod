import { useCallback, useEffect, useRef, type PointerEvent as RPointerEvent } from 'react';
import { COLORS, PAPER, type Stroke } from './paths';

export { COLORS, PAPER, type Stroke };

// A tiny shared "current tool" (colour and width), set by the toolbar of the party game.
export const toolState = { color: COLORS[0], w: 2.2 };

/**
 * A ruled khata page canvas (200 × 200 page units whatever its size on screen). It draws the
 * given strokes and can accept drawing. With `onStroke` it keeps the stroke being drawn itself
 * and hands it over when the pen lifts (the party game). With `onBegin`/`onMove`/`onEnd` it only
 * reports the pen, and the caller puts the stroke into `strokes` as it grows (online play).
 */
export function Khata({ strokes, onStroke, enabled, onBegin, onMove, onEnd, className = '' }: {
  strokes: Stroke[]; onStroke?: (s: Stroke) => void; enabled: boolean;
  onBegin?: (p: [number, number]) => void; onMove?: (p: [number, number]) => void; onEnd?: () => void; className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef<Stroke | null>(null);
  const down = useRef(false);
  const paint = useCallback(() => {
    const c = ref.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const dpr = Math.min(2, devicePixelRatio || 1);
    if (c.width !== Math.round(r.width * dpr)) { c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr); }
    const g = c.getContext('2d')!;
    g.setTransform(dpr * r.width / 200, 0, 0, dpr * r.height / 200, 0, 0);
    g.fillStyle = PAPER; g.fillRect(0, 0, 200, 200);
    g.strokeStyle = '#c2d3e4'; g.lineWidth = 0.6;
    for (let y = 14; y < 200; y += 10) { g.beginPath(); g.moveTo(0, y); g.lineTo(200, y); g.stroke(); }
    g.strokeStyle = '#d9534f'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(16, 0); g.lineTo(16, 200); g.stroke();
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const s of [...strokes, ...(live.current ? [live.current] : [])]) {
      g.strokeStyle = s.color; g.lineWidth = s.w;
      g.beginPath();
      s.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      if (s.pts.length === 1) g.lineTo(s.pts[0][0] + 0.1, s.pts[0][1]);
      g.stroke();
    }
  }, [strokes]);
  useEffect(() => {
    paint();
    const ro = new ResizeObserver(paint);
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, [paint]);
  const pos = (e: RPointerEvent): [number, number] => {
    const r = ref.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * 200, ((e.clientY - r.top) / r.height) * 200];
  };
  const reporting = !!onBegin;
  return (
    <canvas
      ref={ref}
      className={`nd-canvas ${className}`}
      data-testid="khata"
      onPointerDown={(e) => {
        if (!enabled) return;
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        if (reporting) { down.current = true; onBegin!(pos(e)); return; }
        live.current = { color: toolState.color, w: toolState.w, pts: [pos(e)] }; paint();
      }}
      onPointerMove={(e) => {
        if (reporting) { if (down.current) onMove?.(pos(e)); return; }
        if (!live.current) return; live.current.pts.push(pos(e)); paint();
      }}
      onPointerUp={() => {
        if (reporting) { if (down.current) { down.current = false; onEnd?.(); } return; }
        if (live.current) { onStroke?.(live.current); live.current = null; }
      }}
      onPointerCancel={() => {
        if (reporting) { if (down.current) { down.current = false; onEnd?.(); } return; }
        live.current = null; paint();
      }}
    />
  );
}

/** Turn SVG path data into point lists (using the browser's SVG geometry). */
export function sample(d: string): Array<[number, number]> {
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', d);
  const len = p.getTotalLength();
  const n = Math.max(2, Math.round(len / 3));
  return Array.from({ length: n + 1 }, (_, i) => { const q = p.getPointAtLength((len * i) / n); return [q.x, q.y] as [number, number]; });
}
