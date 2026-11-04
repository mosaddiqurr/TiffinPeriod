// Shared, original scenery for school sports-day games (Canvas 2D).
// Bangladesh-specific details: a cream two-storey school building with green
// windows, the national flag, a small Shaheed Minar, a krishnachura tree in
// bloom, paper bunting, and a chalk-lined school field.

export function drawSky(ctx: CanvasRenderingContext2D, l: number, t: number, r: number, b: number, horizon: number) {
  const g = ctx.createLinearGradient(0, t, 0, horizon);
  g.addColorStop(0, '#9fd3ef');
  g.addColorStop(1, '#e8f4ee');
  ctx.fillStyle = g;
  ctx.fillRect(l, t, r - l, horizon - t + 1);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (const [cx, cy, s] of [[180, 90, 1], [760, 60, 1.3], [1120, 110, 0.9]] as const) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, 60 * s, 18 * s, 0, 0, 6.283);
    ctx.ellipse(cx + 35 * s, cy - 12 * s, 38 * s, 20 * s, 0, 0, 6.283);
    ctx.ellipse(cx - 34 * s, cy - 6 * s, 30 * s, 14 * s, 0, 0, 6.283);
    ctx.fill();
  }
  void b;
}

export function drawFlag(ctx: CanvasRenderingContext2D, poleX: number, groundY: number, poleH: number, w: number, wave: number) {
  ctx.strokeStyle = '#8a8f96';
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(poleX, groundY); ctx.lineTo(poleX, groundY - poleH); ctx.stroke();
  ctx.fillStyle = '#c9ccd1';
  ctx.beginPath(); ctx.arc(poleX, groundY - poleH - 3, 4, 0, 6.283); ctx.fill();
  // Bangladesh flag: 10:6, red disc offset toward the hoist (centre at 9/20 of the length), radius 1/5 of the length.
  const h = w * 0.6;
  const top = groundY - poleH + 4;
  ctx.save();
  ctx.translate(poleX + 2, top);
  ctx.beginPath();
  const steps = 12;
  ctx.moveTo(0, 0);
  for (let i = 1; i <= steps; i++) { const x = (w * i) / steps; ctx.lineTo(x, Math.sin(wave + i * 0.6) * 2.5 * (i / steps)); }
  for (let i = steps; i >= 0; i--) { const x = (w * i) / steps; ctx.lineTo(x, h + Math.sin(wave + i * 0.6) * 2.5 * (i / steps)); }
  ctx.closePath();
  ctx.fillStyle = '#006a4e';
  ctx.fill();
  ctx.fillStyle = '#f42a41';
  ctx.beginPath(); ctx.arc(w * 0.45, h / 2 + Math.sin(wave + 5) * 1.2, w * 0.2, 0, 6.283); ctx.fill();
  ctx.restore();
}

export function drawSchool(ctx: CanvasRenderingContext2D, x: number, groundY: number, w: number, h: number) {
  // Building body
  ctx.fillStyle = '#efdfae';
  ctx.fillRect(x, groundY - h, w, h);
  ctx.fillStyle = '#d9c48b';
  ctx.fillRect(x, groundY - h / 2 - 4, w, 8); // floor band
  ctx.fillStyle = '#b5483a';
  ctx.fillRect(x, groundY - 14, w, 14); // brick plinth
  ctx.fillStyle = '#c95f4c';
  ctx.fillRect(x - 10, groundY - h - 12, w + 20, 14); // parapet
  // Windows: green frames with bars
  const cols = Math.floor(w / 70);
  for (let row = 0; row < 2; row++) {
    for (let c = 0; c < cols; c++) {
      const wx = x + 22 + c * 70;
      const wy = groundY - h + 22 + row * (h / 2);
      ctx.fillStyle = '#2f7d55';
      ctx.fillRect(wx, wy, 34, h / 2 - 48);
      ctx.fillStyle = '#244f3a';
      for (let b = 1; b < 4; b++) ctx.fillRect(wx + b * 8.5 - 1, wy + 2, 2, h / 2 - 52);
      ctx.fillStyle = '#e4cf93';
      ctx.fillRect(wx - 4, wy - 6, 42, 5); // sunshade
    }
  }
  // Name board
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x + w / 2 - 110, groundY - h + 6, 220, 26);
  ctx.strokeStyle = '#2f7d55'; ctx.lineWidth = 2;
  ctx.strokeRect(x + w / 2 - 110, groundY - h + 6, 220, 26);
  ctx.fillStyle = '#2f7d55';
  ctx.font = '700 17px "Baloo Da 2", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('টিফিন পিরিয়ড উচ্চ বিদ্যালয়', x + w / 2, groundY - h + 20);
}

export function drawShaheedMinar(ctx: CanvasRenderingContext2D, cx: number, groundY: number, s: number) {
  ctx.save();
  ctx.translate(cx, groundY);
  ctx.scale(s, s);
  ctx.fillStyle = '#e23b3b';
  ctx.beginPath(); ctx.arc(0, -70, 34, 0, 6.283); ctx.fill();
  ctx.fillStyle = '#f7f7f2';
  ctx.strokeStyle = '#9aa0a6'; ctx.lineWidth = 1.5;
  ctx.fillRect(-60, -10, 120, 10); ctx.strokeRect(-60, -10, 120, 10);
  // Side pillars
  for (const [px, ph] of [[-44, 58], [-26, 74], [26, 74], [44, 58]] as const) {
    ctx.fillRect(px - 5, -10 - ph, 10, ph); ctx.strokeRect(px - 5, -10 - ph, 10, ph);
  }
  // Central pillar with the bent top
  ctx.beginPath();
  ctx.moveTo(-14, -10); ctx.lineTo(-14, -96); ctx.lineTo(-8, -112); ctx.lineTo(14, -106); ctx.lineTo(14, -10); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.restore();
}

export function drawKrishnachura(ctx: CanvasRenderingContext2D, cx: number, groundY: number, s: number) {
  ctx.save();
  ctx.translate(cx, groundY);
  ctx.scale(s, s);
  ctx.fillStyle = '#6b4a2b';
  ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(-5, -90); ctx.lineTo(5, -90); ctx.lineTo(9, 0); ctx.fill();
  ctx.fillStyle = '#4f8a3a';
  for (const [x, y, r] of [[0, -120, 60], [-50, -100, 42], [50, -102, 44], [-20, -150, 40], [28, -148, 38]] as const) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill();
  }
  // Red-orange blossoms (deterministic positions)
  ctx.fillStyle = '#ea4a1f';
  let seed = 7;
  for (let i = 0; i < 70; i++) {
    seed = (seed * 9301 + 49297) % 233280;
    const a = (seed / 233280) * 6.283;
    seed = (seed * 9301 + 49297) % 233280;
    const r = Math.sqrt(seed / 233280) * 70;
    ctx.beginPath(); ctx.arc(Math.cos(a) * r * 1.2, -125 + Math.sin(a) * r * 0.75, 4, 0, 6.283); ctx.fill();
  }
  ctx.restore();
}

const BUNTING = ['#e3127d', '#ffc20e', '#009e96', '#e0333f', '#127a59', '#1f4e9c'];
export function drawBunting(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, sag: number, wave: number) {
  ctx.strokeStyle = '#6b5a3a'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + sag * 2, x1, y1); ctx.stroke();
  const n = Math.floor(Math.abs(x1 - x0) / 34);
  for (let i = 1; i < n; i++) {
    const tt = i / n;
    const x = (1 - tt) * (1 - tt) * x0 + 2 * (1 - tt) * tt * ((x0 + x1) / 2) + tt * tt * x1;
    const y = (1 - tt) * (1 - tt) * y0 + 2 * (1 - tt) * tt * ((y0 + y1) / 2 + sag * 2) + tt * tt * y1;
    const sw = Math.sin(wave + i) * 3;
    ctx.fillStyle = BUNTING[i % BUNTING.length];
    ctx.beginPath(); ctx.moveTo(x - 11, y); ctx.lineTo(x + 11, y); ctx.lineTo(x + sw, y + 22); ctx.closePath(); ctx.fill();
  }
}

export function drawField(ctx: CanvasRenderingContext2D, l: number, r: number, top: number, b: number) {
  const g = ctx.createLinearGradient(0, top, 0, b);
  g.addColorStop(0, '#8cbf4e');
  g.addColorStop(1, '#6ea23a');
  ctx.fillStyle = g;
  ctx.fillRect(l, top, r - l, b - top);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  for (let x = Math.floor(l / 120) * 120; x < r; x += 240) ctx.fillRect(x, top, 120, b - top);
  // Grass tufts
  ctx.strokeStyle = 'rgba(40, 80, 20, 0.35)'; ctx.lineWidth = 2;
  for (let x = Math.floor(l / 37) * 37; x < r; x += 37) {
    const y = top + 30 + ((x * 13) % (b - top - 40));
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 3, y - 8); ctx.moveTo(x, y); ctx.lineTo(x + 3, y - 8); ctx.stroke();
  }
}

/** Small spectators behind a rope fence, as simple silhouettes. */
export function drawCrowd(ctx: CanvasRenderingContext2D, l: number, r: number, y: number, t: number, colors = ['#f2f2ee', '#1f3a8a', '#f2f2ee', '#8b1e1e', '#f2f2ee', '#127a59']) {
  let i = 0;
  for (let x = l + 10; x < r; x += 26, i++) {
    const bob = Math.sin(t * 3 + i * 1.7) * (i % 3 === 0 ? 3 : 1.2);
    ctx.fillStyle = colors[i % colors.length];
    ctx.beginPath(); ctx.ellipse(x, y + 10 + bob, 11, 15, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = i % 4 === 1 ? '#3b2a1f' : '#2b1d14';
    ctx.beginPath(); ctx.arc(x, y - 10 + bob, 8, 0, 6.283); ctx.fill();
  }
}
