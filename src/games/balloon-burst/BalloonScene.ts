import type { Scene, View } from '../../engine/GameCanvas';
import { FloatTexts, Particles } from '../../engine/particles';
import { createRng } from '../../engine/rng';
import { drawBunting } from '../../shared/scenery';
import { BalloonAI, Field, type Balloon, type BColor, type Difficulty, type HitResult } from './field';

const FONT = '"Baloo Da 2", sans-serif';
export const PAINT: Record<BColor, [string, string]> = {
  red: ['#e5383b', '#a4161a'], yellow: ['#ffd23f', '#d19a00'], green: ['#2bb673', '#137a4a'],
  blue: ['#3a86ff', '#1d4fbf'], pink: ['#ff5fa2', '#c2185b'], orange: ['#ff8c2b', '#c75d00'],
};

export interface BalloonTexts {
  pop: string; miss: string; cloud: string; time: string; colorName: Record<BColor, string>; targetFmt: (c: string) => string;
  num: (n: number) => string; players: string[];
}

export type BalloonEvent = { type: 'hit'; r: HitResult; human: boolean } | { type: 'over' } | { type: 'go' };

interface Lane { field: Field; x: number; y: number; w: number; h: number; s: number; owner: number }

export class BalloonScene implements Scene {
  designW = 800;
  designH = 600;
  lanes: Lane[] = [];
  ai: BalloonAI | null = null;
  countdown = 3;
  private fx = new Particles(500);
  private texts = new FloatTexts();
  private taps: Array<{ x: number; y: number; life: number; ok: boolean }> = [];
  private bgCache = new Map<string, HTMLCanvasElement>();
  private ended = false;
  private wentGo = false;
  private time = 0;
  cross: { x: number; y: number; on: boolean } = { x: 0, y: 0, on: false };
  onEvent?: (e: BalloonEvent) => void;

  constructor(private mode: 'solo' | 'ai' | 'local2p', private diff: Difficulty, private duration: number, private tx: BalloonTexts, private seed = (Math.random() * 2 ** 31) | 0) {}

  onResize(w: number, h: number) {
    this.designW = w;
    this.designH = h;
    const split = this.mode === 'local2p';
    const portrait = h > w;
    const rects = split
      ? portrait ? [{ x: 0, y: h / 2, w, h: h / 2 }, { x: 0, y: 0, w, h: h / 2 }] : [{ x: 0, y: 0, w: w / 2, h }, { x: w / 2, y: 0, w: w / 2, h }]
      : [{ x: 0, y: 0, w, h }];
    if (this.lanes.length === 0) {
      // Fields keep their first size. Later resizes only rescale the drawing.
      this.lanes = rects.map((r, i) => ({
        field: new Field(r.w, r.h, createRng(this.seed), this.mode === 'ai' ? 2 : 1, this.duration, this.mode === 'solo'),
        ...r, s: 1, owner: i,
      }));
      if (this.mode === 'ai') this.ai = new BalloonAI(1, this.diff, createRng(this.seed ^ 0x5bd1), w, h);
      this.cross = { x: w / 2, y: h * 0.55, on: false };
    } else {
      this.lanes.forEach((l, i) => {
        const r = rects[i];
        l.s = Math.min(r.w / l.field.w, r.h / l.field.h);
        l.x = r.x + (r.w - l.field.w * l.s) / 2;
        l.y = r.y + (r.h - l.field.h * l.s) / 2;
        l.w = l.field.w * l.s;
        l.h = l.field.h * l.s;
      });
    }
  }

  get fields() {
    return this.lanes.map((l) => l.field);
  }

  get over() {
    return this.lanes.length > 0 && this.lanes.every((l) => l.field.over);
  }

  private laneAt(x: number, y: number) {
    return this.lanes.find((l) => x >= l.x && x < l.x + l.w && y >= l.y && y < l.y + l.h) ?? null;
  }

  pointerDown(x: number, y: number) {
    if (this.countdown > 0) return;
    const lane = this.laneAt(x, y);
    if (!lane) return;
    this.tapAt(lane, x, y);
  }

  private tapAt(lane: Lane, x: number, y: number) {
    const f = lane.field;
    const lx = (x - lane.x) / lane.s;
    const ly = (y - lane.y) / lane.s;
    const r = f.hit(0, lx, ly);
    if (r.type === 'ignored') return;
    this.taps.push({ x, y, life: 0.35, ok: r.type !== 'miss' });
    this.react(lane, r, true);
  }

  /** Keyboard crosshair (solo and against the computer). */
  moveCross(dx: number, dy: number) {
    const l = this.lanes[0];
    if (!l) return;
    this.cross.on = true;
    this.cross.x = Math.max(l.x, Math.min(l.x + l.w, this.cross.x + dx));
    this.cross.y = Math.max(l.y, Math.min(l.y + l.h, this.cross.y + dy));
  }
  fireCross() {
    if (this.countdown > 0 || !this.lanes[0]) return;
    this.cross.on = true;
    this.tapAt(this.lanes[0], this.cross.x, this.cross.y);
  }

  private react(lane: Lane, r: HitResult, human: boolean) {
    const toWorld = (b: Balloon) => ({ x: lane.x + b.x * lane.s, y: lane.y + b.y * lane.s });
    if (r.type === 'pop') {
      const p = toWorld(r.b);
      const [c1, c2] = r.b.kind === 'gold' ? ['#ffd23f', '#fff3b0'] : PAINT[r.b.color];
      this.fx.burst(p.x, p.y, r.b.kind === 'gold' ? 26 : 16, { colors: [c1, c2], shape: 'shred', speed: 420, size: 12, gravity: 700, max: 0.7 });
      if (r.b.kind === 'gold' || r.target) this.fx.burst(p.x, p.y, 18, { colors: ['#e3127d', '#ffc20e', '#009e96', '#ffffff'], shape: 'rect', speed: 360, size: 9, gravity: 500, max: 1.1 });
      this.texts.add(p.x, p.y - 10, `${this.tx.pop} +${this.tx.num(r.points)}`, human ? '#ffffff' : '#e7d4ff', r.target ? 34 : 28);
    } else if (r.type === 'damage') {
      const p = toWorld(r.b);
      this.fx.burst(p.x, p.y, 6, { color: '#ffffff', speed: 200, size: 6, max: 0.4 });
    } else if (r.type === 'cloud') {
      const p = toWorld(r.b);
      this.fx.burst(p.x, p.y, 24, { color: '#7fb6ff', speed: 300, size: 7, gravity: 900, max: 0.9 });
      this.texts.add(p.x, p.y, `${this.tx.cloud} ${this.tx.num(r.points)}`, '#bcd9ff', 30);
    }
    this.onEvent?.({ type: 'hit', r, human });
  }

  update(dt: number) {
    this.time += dt;
    if (this.countdown > 0) {
      this.countdown -= dt;
      return;
    }
    if (!this.wentGo) { this.wentGo = true; this.onEvent?.({ type: 'go' }); }
    for (const lane of this.lanes) lane.field.update(dt);
    if (this.ai && this.lanes[0]) {
      const r = this.ai.update(this.lanes[0].field, dt);
      if (r && r.type !== 'ignored' && r.type !== 'miss') this.react(this.lanes[0], r, false);
    }
    this.fx.update(dt);
    this.texts.update(dt);
    this.taps = this.taps.filter((t) => (t.life -= dt) > 0);
    if (this.over && !this.ended) { this.ended = true; this.onEvent?.({ type: 'over' }); }
  }

  private background(lane: Lane, v: View): HTMLCanvasElement {
    const key = `${lane.w}x${lane.h}@${v.dpr}`;
    let c = this.bgCache.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = Math.ceil(lane.w * v.dpr);
    c.height = Math.ceil(lane.h * v.dpr);
    const g = c.getContext('2d')!;
    g.scale(v.dpr, v.dpr);
    const { w, h } = lane;
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#8fd0f0');
    sky.addColorStop(0.7, '#f4efd9');
    sky.addColorStop(1, '#e9d8a8');
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    // Ferris wheel (nagordola) of the village fair
    const wx = w * 0.78, wy = h - 150, wr = Math.min(110, w * 0.2);
    g.strokeStyle = 'rgba(120, 90, 60, 0.35)'; g.lineWidth = 4;
    g.beginPath(); g.arc(wx, wy, wr, 0, 6.283); g.stroke();
    for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283; g.beginPath(); g.moveTo(wx, wy); g.lineTo(wx + Math.cos(a) * wr, wy + Math.sin(a) * wr); g.stroke(); }
    g.beginPath(); g.moveTo(wx - wr * 0.6, h - 40); g.lineTo(wx, wy); g.lineTo(wx + wr * 0.6, h - 40); g.stroke();
    // Fair stalls with striped canopies
    const cols = ['#e3127d', '#009e96', '#ffc20e', '#e0333f'];
    for (let x = -20, i = 0; x < w; x += 150, i++) {
      g.fillStyle = 'rgba(120, 80, 40, 0.25)';
      g.fillRect(x + 20, h - 70, 110, 70);
      for (let k = 0; k < 6; k++) { g.fillStyle = k % 2 ? '#fff6e0' : cols[i % cols.length]; g.fillRect(x + 12 + k * 21, h - 92, 21, 26); }
      g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x + 12, h - 66, 126, 4);
    }
    drawBunting(g, -10, 24, w + 10, 24, 16, 0);
    this.bgCache.set(key, c);
    return c;
  }

  private drawBalloon(ctx: CanvasRenderingContext2D, b: Balloon, s: number, t: number) {
    const r = b.r * s;
    const x = b.x, y = b.y;
    // String
    ctx.strokeStyle = 'rgba(80, 60, 40, 0.7)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x, y + r * 1.2);
    for (let k = 1; k <= 4; k++) ctx.lineTo(x + Math.sin(t * 4 + k + b.phase) * 4, y + r * 1.2 + k * r * 0.35);
    ctx.stroke();
    let [c1, c2] = PAINT[b.color];
    if (b.kind === 'gold') [c1, c2] = ['#ffe066', '#c99700'];
    if (b.kind === 'cloud') [c1, c2] = ['#9aa5b1', '#59636e'];
    if (b.kind === 'clock') [c1, c2] = ['#e8f1ff', '#7da2d6'];
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.45, r * 0.1, x, y, r * 1.25);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.18, c1);
    g.addColorStop(1, c2);
    ctx.fillStyle = g;
    if (b.kind === 'cloud') {
      ctx.beginPath();
      ctx.arc(x - r * 0.45, y + r * 0.1, r * 0.55, 0, 6.283);
      ctx.arc(x + r * 0.45, y + r * 0.1, r * 0.55, 0, 6.283);
      ctx.arc(x, y - r * 0.25, r * 0.7, 0, 6.283);
      ctx.fill();
      ctx.fillStyle = '#2a3038';
      ctx.beginPath(); ctx.arc(x - r * 0.22, y - r * 0.08, r * 0.08, 0, 6.283); ctx.arc(x + r * 0.22, y - r * 0.08, r * 0.08, 0, 6.283); ctx.fill();
      ctx.strokeStyle = '#2a3038'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(x, y + r * 0.32, r * 0.2, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
      ctx.strokeStyle = '#7fb6ff'; ctx.lineWidth = 2;
      for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(x + k * r * 0.35, y + r * 0.75); ctx.lineTo(x + k * r * 0.35 - 4, y + r * 1.05); ctx.stroke(); }
      return;
    }
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 1.18, 0, 0, 6.283); ctx.fill();
    // Knot
    ctx.fillStyle = c2;
    ctx.beginPath(); ctx.moveTo(x - r * 0.12, y + r * 1.26); ctx.lineTo(x + r * 0.12, y + r * 1.26); ctx.lineTo(x, y + r * 1.12); ctx.closePath(); ctx.fill();
    // Shine
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath(); ctx.ellipse(x - r * 0.38, y - r * 0.42, r * 0.16, r * 0.3, -0.5, 0, 6.283); ctx.fill();
    if (b.kind === 'gold') {
      ctx.fillStyle = '#fff';
      star(ctx, x, y + r * 0.1, r * 0.45);
    } else if (b.kind === 'tough') {
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(x, y, r * 0.82, r * 0.97, 0, 0, 6.283); ctx.stroke();
      if (b.hp === 1) { ctx.strokeStyle = 'rgba(40,20,20,0.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + r * 0.1, y - r * 0.6); ctx.lineTo(x - r * 0.1, y - r * 0.2); ctx.lineTo(x + r * 0.15, y + r * 0.1); ctx.stroke(); }
      if (b.hitFlash > 0) { ctx.fillStyle = `rgba(255,255,255,${b.hitFlash * 0.6})`; ctx.beginPath(); ctx.ellipse(x, y, r, r * 1.18, 0, 0, 6.283); ctx.fill(); }
    } else if (b.kind === 'clock') {
      ctx.strokeStyle = '#1d4fbf'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, r * 0.5, 0, 6.283); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - r * 0.35); ctx.moveTo(x, y); ctx.lineTo(x + r * 0.25, y + r * 0.1); ctx.stroke();
    } else if (b.kind === 'family') {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.arc(x + k * r * 0.32, y + r * 0.2, r * 0.12, 0, 6.283); ctx.fill(); }
    }
  }

  render(ctx: CanvasRenderingContext2D, v: View) {
    ctx.fillStyle = '#e9d8a8';
    ctx.fillRect(v.left, v.top, v.right - v.left, v.bottom - v.top);
    for (const lane of this.lanes) {
      const f = lane.field;
      ctx.save();
      ctx.beginPath(); ctx.rect(lane.x, lane.y, lane.w, lane.h); ctx.clip();
      ctx.drawImage(this.background(lane, v), lane.x, lane.y, lane.w, lane.h);
      ctx.translate(lane.x, lane.y);
      ctx.scale(lane.s, lane.s);
      for (const b of f.balloons) this.drawBalloon(ctx, b, 1, this.time);
      ctx.restore();
      this.drawHud(ctx, lane);
      const rain = f.scorers[0].rain;
      if (rain > 0) {
        ctx.save();
        ctx.beginPath(); ctx.rect(lane.x, lane.y, lane.w, lane.h); ctx.clip();
        ctx.fillStyle = `rgba(60, 100, 160, ${Math.min(0.35, rain * 0.3)})`;
        ctx.fillRect(lane.x, lane.y, lane.w, lane.h);
        ctx.strokeStyle = `rgba(200, 225, 255, ${Math.min(0.8, rain)})`; ctx.lineWidth = 2;
        for (let i = 0; i < 60; i++) {
          const rx = lane.x + ((i * 97 + this.time * 40) % lane.w);
          const ry = lane.y + ((i * 53 + this.time * 900) % lane.h);
          ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx - 4, ry + 16); ctx.stroke();
        }
        ctx.restore();
      }
    }
    if (this.lanes.length === 2) {
      const a = this.lanes[0], b = this.lanes[1];
      ctx.fillStyle = '#3a2516';
      if (a.y !== b.y) ctx.fillRect(v.left, Math.min(a.y, b.y) + Math.min(a.h, b.h) - 2, v.right - v.left, 4);
      else ctx.fillRect(b.x - 2, v.top, 4, v.bottom - v.top);
    }
    this.fx.draw(ctx);
    this.texts.draw(ctx, FONT);
    for (const tp of this.taps) {
      ctx.strokeStyle = tp.ok ? 'rgba(255,255,255,0.9)' : 'rgba(198,47,47,0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(tp.x, tp.y, 14 + (0.35 - tp.life) * 60, 0, 6.283); ctx.stroke();
    }
    if (this.ai) this.drawPin(ctx, this.ai.x, this.ai.y, '#7d3c98');
    if (this.cross.on) {
      ctx.strokeStyle = '#c62f2f'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(this.cross.x, this.cross.y, 16, 0, 6.283);
      ctx.moveTo(this.cross.x - 24, this.cross.y); ctx.lineTo(this.cross.x + 24, this.cross.y);
      ctx.moveTo(this.cross.x, this.cross.y - 24); ctx.lineTo(this.cross.x, this.cross.y + 24); ctx.stroke();
    }
    if (this.countdown > 0) {
      ctx.fillStyle = 'rgba(30, 20, 10, 0.35)';
      ctx.fillRect(v.left, v.top, v.right - v.left, v.bottom - v.top);
      ctx.fillStyle = '#fff';
      ctx.font = `800 120px ${FONT}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(this.tx.num(Math.ceil(this.countdown)), (v.left + v.right) / 2, (v.top + v.bottom) / 2);
    }
  }

  private drawPin(ctx: CanvasRenderingContext2D, x: number, y: number, head: string) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.6);
    ctx.strokeStyle = '#8a8f96'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 34); ctx.stroke();
    ctx.fillStyle = head;
    ctx.beginPath(); ctx.arc(0, 36, 8, 0, 6.283); ctx.fill();
    ctx.restore();
  }

  private drawHud(ctx: CanvasRenderingContext2D, lane: Lane) {
    const f = lane.field;
    const x0 = lane.x + 10, y0 = lane.y + 44;
    ctx.textBaseline = 'middle';
    // Score chips: one per scorer in this field
    const players = this.mode === 'local2p' ? [this.tx.players[lane.owner]] : this.tx.players;
    let x = x0;
    f.scorers.forEach((s, i) => {
      const label = `${players[i] ?? ''} ${this.tx.num(s.score)}`;
      ctx.font = `800 22px ${FONT}`;
      const w = ctx.measureText(label).width + 24;
      ctx.fillStyle = i === 1 && this.mode === 'ai' ? 'rgba(125, 60, 152, 0.92)' : 'rgba(11, 93, 67, 0.92)';
      roundRectFill(ctx, x, y0 - 18, w, 36, 18);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'left';
      ctx.fillText(label, x + 12, y0 + 1);
      if (s.combo >= 3 && f.t - s.lastHit < 1.2) {
        ctx.font = `800 18px ${FONT}`;
        ctx.fillStyle = '#ffd23f';
        ctx.fillText(`×${this.tx.num(s.combo)}`, x + w + 6, y0 + 1);
      }
      x += w + 52;
    });
    // Timer
    ctx.font = `800 26px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillStyle = f.timeLeft < 6 ? '#c62f2f' : '#3a2516';
    ctx.fillText(`${this.tx.time} ${this.tx.num(Math.ceil(f.timeLeft))}`, lane.x + lane.w - 12, y0 + 1);
    // Target colour banner
    const fresh = f.t - f.lastTargetChange < 0.8 ? 1 + (0.8 - (f.t - f.lastTargetChange)) * 0.4 : 1;
    const label = this.tx.targetFmt(this.tx.colorName[f.targetColor]);
    ctx.font = `800 ${Math.round(20 * fresh)}px ${FONT}`;
    const bw = ctx.measureText(label).width + 50;
    const bx = lane.x + lane.w / 2 - bw / 2, by = lane.y + 84;
    ctx.fillStyle = 'rgba(255, 253, 246, 0.94)';
    roundRectFill(ctx, bx, by, bw, 34, 17);
    ctx.fillStyle = PAINT[f.targetColor][0];
    ctx.beginPath(); ctx.ellipse(bx + 20, by + 17, 9, 11, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#3a2516'; ctx.textAlign = 'left';
    ctx.fillText(label, bx + 36, by + 18);
  }
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

function roundRectFill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}
