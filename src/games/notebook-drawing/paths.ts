// Pure helpers for drawings, with no browser needed (the online stand-in and the tests use them).

/** One pen stroke on the 200 × 200 khata page. */
export type Stroke = { color: string; w: number; pts: Array<[number, number]> };

export const COLORS = ['#1f3a93', '#1b1b1b', '#c62f2f', '#127a59'];
export const PAPER = '#fbf7ea';

type P = [number, number];

/** Points along a line, about `step` apart (the start point is not included). */
function along(from: P, to: P, step: number): P[] {
  const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const n = Math.max(1, Math.round(len / step));
  return Array.from({ length: n }, (_, i) => {
    const k = (i + 1) / n;
    return [from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k] as P;
  });
}

/**
 * Turn SVG path data (absolute M, L, Q, A and Z, as in the doodles) into a point list, about
 * `step` units apart: the same shape the browser's own SVG geometry gives.
 */
export function samplePath(d: string, step = 3): P[] {
  const tok = d.match(/[MLQAZmlqaz]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  const out: P[] = [];
  let i = 0;
  let cmd = '';
  let cur: P = [0, 0];
  let start: P = [0, 0];
  const num = () => Number(tok[i++]);
  while (i < tok.length) {
    if (/[A-Za-z]/.test(tok[i])) cmd = tok[i++].toUpperCase();
    if (cmd === 'Z') {
      out.push(...along(cur, start, step));
      cur = start;
      continue;
    }
    if (cmd === 'M') {
      cur = [num(), num()];
      start = cur;
      out.push(cur);
      cmd = 'L'; // further pairs after M are lines
    } else if (cmd === 'L') {
      const to: P = [num(), num()];
      out.push(...along(cur, to, step));
      cur = to;
    } else if (cmd === 'Q') {
      const c: P = [num(), num()];
      const to: P = [num(), num()];
      const len = Math.hypot(c[0] - cur[0], c[1] - cur[1]) + Math.hypot(to[0] - c[0], to[1] - c[1]);
      const n = Math.max(2, Math.round(len / step));
      const a = cur;
      for (let k = 1; k <= n; k++) {
        const t = k / n, u = 1 - t;
        out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * to[0], u * u * a[1] + 2 * u * t * c[1] + t * t * to[1]]);
      }
      cur = to;
    } else if (cmd === 'A') {
      let rx = Math.abs(num()), ry = Math.abs(num());
      const phi = (num() * Math.PI) / 180;
      const fa = num() !== 0, fs = num() !== 0;
      const to: P = [num(), num()];
      const [x1, y1] = cur, [x2, y2] = to;
      const cos = Math.cos(phi), sin = Math.sin(phi);
      const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
      const xp = cos * dx + sin * dy, yp = -sin * dx + cos * dy;
      const lam = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
      if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
      const num2 = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp;
      const den = rx * rx * yp * yp + ry * ry * xp * xp;
      const coef = (fa !== fs ? 1 : -1) * Math.sqrt(Math.max(0, num2 / (den || 1)));
      const cxp = (coef * rx * yp) / ry, cyp = (-coef * ry * xp) / rx;
      const cx = cos * cxp - sin * cyp + (x1 + x2) / 2, cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
      const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
      const t1 = ang(1, 0, (xp - cxp) / rx, (yp - cyp) / ry);
      let dt = ang((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry);
      if (!fs && dt > 0) dt -= 2 * Math.PI;
      if (fs && dt < 0) dt += 2 * Math.PI;
      const n = Math.max(4, Math.round((Math.abs(dt) * Math.max(rx, ry)) / step));
      for (let k = 1; k <= n; k++) {
        const th = t1 + (dt * k) / n;
        out.push([cx + rx * Math.cos(th) * cos - ry * Math.sin(th) * sin, cy + rx * Math.cos(th) * sin + ry * Math.sin(th) * cos]);
      }
      cur = to;
    } else {
      i++; // unknown token: skip it
    }
  }
  return out;
}

/** Total length of the ink on a page, in page units. */
export function inkLength(strokes: Stroke[]): number {
  let s = 0;
  for (const st of strokes) for (let i = 1; i < st.pts.length; i++) s += Math.hypot(st.pts[i][0] - st.pts[i - 1][0], st.pts[i][1] - st.pts[i - 1][1]);
  return s;
}
