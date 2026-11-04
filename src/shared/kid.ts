// A reusable 2D school kid for canvas games (Tug of War, Biscuit Race, later
// Sack Race and others). Drawn with simple shapes so it stays fast on low-end phones.
// Uniform: white shirt, navy trousers or skirt, a house-colour sports vest.

export interface KidLook {
  skin: string;
  hair: string;
  vest: string;      // house colour
  girl?: boolean;    // braids with red ribbons
}

export interface KidPose {
  /** Lean angle in radians. Positive = leaning back (away from facing). */
  lean: number;
  /** Walk/run cycle phase in radians. */
  step: number;
  /** 0..1 stride size. */
  stride: number;
  /** Vertical offset (jumping), negative = up. */
  lift: number;
  /** 'hold' = arms forward to a point, 'up' = arms raised, 'back' = hands behind the back. */
  arms: 'hold' | 'up' | 'back';
  /** World point that the hands hold (for 'hold'). */
  hand?: { x: number; y: number };
  mouthOpen?: number; // 0..1
  /** Head tilt back (looking up), radians. */
  look?: number;
  cheeks?: boolean;
}

export const LOOKS: KidLook[] = [
  { skin: '#c98a5c', hair: '#1d140e', vest: '#c0392b' },
  { skin: '#b67a4d', hair: '#20160f', vest: '#c0392b', girl: true },
  { skin: '#d39a6a', hair: '#17110c', vest: '#c0392b' },
  { skin: '#bd8152', hair: '#1d140e', vest: '#1f4e9c' },
  { skin: '#c48656', hair: '#20160f', vest: '#1f4e9c', girl: true },
  { skin: '#a96f45', hair: '#17110c', vest: '#1f4e9c' },
];

const LINE = '#3a2516';

function limb(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, w: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
}

/** Two-segment leg from hip to foot with a knee that bends forward. */
function leg(ctx: CanvasRenderingContext2D, hx: number, hy: number, fx: number, fy: number, len: number, color: string, facing: number) {
  const dx = fx - hx, dy = fy - hy;
  const d = Math.min(Math.hypot(dx, dy), len * 1.98);
  const mx = hx + dx / 2, my = hy + dy / 2;
  const bend = Math.sqrt(Math.max(0, len * len - (d / 2) ** 2));
  const nx = (-dy / (Math.hypot(dx, dy) || 1)) * bend * facing;
  const ny = (dx / (Math.hypot(dx, dy) || 1)) * bend * facing;
  const kx = mx - nx, ky = my - ny;
  limb(ctx, hx, hy, kx, ky, 11, color);
  limb(ctx, kx, ky, fx, fy, 10, color);
  ctx.fillStyle = '#1b1b1b';
  ctx.beginPath(); ctx.ellipse(fx + 5 * facing, fy - 2, 9, 5, 0, 0, 6.283); ctx.fill();
}

/**
 * Draw a kid standing at (x, footY) facing +1 (right) or −1 (left).
 * Height is about 160 world units.
 */
export function drawKid(ctx: CanvasRenderingContext2D, x: number, footY: number, facing: 1 | -1, look: KidLook, pose: KidPose) {
  const lean = pose.lean;
  const base = footY + pose.lift;
  const hipH = 72;
  // Body axis: rotate about the feet. Leaning back moves the top opposite to facing.
  const sin = Math.sin(lean), cos = Math.cos(lean);
  const at = (h: number) => ({ x: x - facing * sin * h, y: base - cos * h });
  const hip = at(hipH);
  const shoulder = at(124);
  const neck = at(134);
  const head = at(150);

  // Legs
  const s = pose.stride;
  const f1 = x + facing * (14 + Math.sin(pose.step) * 22 * s);
  const f2 = x + facing * (-6 - Math.sin(pose.step) * 22 * s);
  const lift1 = Math.max(0, Math.cos(pose.step)) * 10 * s;
  const lift2 = Math.max(0, -Math.cos(pose.step)) * 10 * s;
  leg(ctx, hip.x, hip.y, f2, base - lift2, 38, '#1c2d57', facing);
  // Back arm (behind the body)
  const armColor = look.skin;
  if (pose.arms === 'back') {
    limb(ctx, shoulder.x, shoulder.y, hip.x - facing * 14, hip.y + 4, 9, '#f2f2ee');
  }
  leg(ctx, hip.x, hip.y, f1, base - lift1, 38, '#1c2d57', facing);

  // Torso: white shirt with a house-colour vest
  ctx.save();
  ctx.translate(hip.x, hip.y);
  ctx.rotate(-facing * lean);
  ctx.fillStyle = '#f4f4ef';
  roundRect(ctx, -17, -58, 34, 62, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = look.vest;
  roundRect(ctx, -14, -52, 28, 44, 6);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = '700 13px "Baloo Da 2", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.restore();

  // Neck and head
  limb(ctx, neck.x, neck.y + 4, neck.x, neck.y - 2, 9, look.skin);
  ctx.save();
  ctx.translate(head.x, head.y);
  ctx.rotate(-facing * (lean * 0.6 + (pose.look ?? 0)));
  ctx.scale(facing, 1);
  ctx.fillStyle = look.skin;
  ctx.beginPath(); ctx.arc(0, 0, 17, 0, 6.283); ctx.fill();
  ctx.strokeStyle = LINE; ctx.lineWidth = 1.5; ctx.stroke();
  // Hair
  ctx.fillStyle = look.hair;
  ctx.beginPath(); ctx.arc(-2, -4, 17.5, Math.PI * 0.95, Math.PI * 2.08); ctx.closePath(); ctx.fill();
  if (look.girl) {
    ctx.beginPath(); ctx.ellipse(-15, 8, 5, 12, 0.3, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#e0333f';
    ctx.beginPath(); ctx.arc(-16, 18, 4, 0, 6.283); ctx.fill();
  }
  // Eye, cheek, mouth
  ctx.fillStyle = '#1b1b1b';
  ctx.beginPath(); ctx.arc(7, -1, 2.2, 0, 6.283); ctx.fill();
  if (pose.cheeks) { ctx.fillStyle = 'rgba(230, 90, 80, 0.45)'; ctx.beginPath(); ctx.arc(6, 7, 4.5, 0, 6.283); ctx.fill(); }
  const mo = pose.mouthOpen ?? 0;
  if (mo > 0.05) {
    ctx.fillStyle = '#6b1f1a';
    ctx.beginPath(); ctx.ellipse(11, 8, 3 + mo * 2, 1.5 + mo * 4.5, 0, 0, 6.283); ctx.fill();
  } else {
    ctx.strokeStyle = LINE; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(8, 9); ctx.lineTo(13, 8); ctx.stroke();
  }
  ctx.restore();

  // Front arm
  if (pose.arms === 'hold' && pose.hand) {
    const mx = (shoulder.x + pose.hand.x) / 2;
    const my = (shoulder.y + pose.hand.y) / 2 + 6;
    limb(ctx, shoulder.x, shoulder.y, mx, my, 9, '#f2f2ee');
    limb(ctx, mx, my, pose.hand.x, pose.hand.y, 8, armColor);
    ctx.fillStyle = armColor;
    ctx.beginPath(); ctx.arc(pose.hand.x, pose.hand.y, 6, 0, 6.283); ctx.fill();
  } else if (pose.arms === 'up') {
    for (const dir of [-1, 1]) {
      const hx = shoulder.x + dir * 18, hy = shoulder.y - 46;
      limb(ctx, shoulder.x, shoulder.y, shoulder.x + dir * 12, shoulder.y - 22, 9, '#f2f2ee');
      limb(ctx, shoulder.x + dir * 12, shoulder.y - 22, hx, hy, 8, armColor);
    }
  } else {
    limb(ctx, shoulder.x, shoulder.y, hip.x - facing * 10, hip.y + 2, 9, '#f2f2ee');
  }
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
