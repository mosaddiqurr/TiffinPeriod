import type { Scene, View } from '../../engine/GameCanvas';
import type { Rng } from '../../engine/rng';
import { sfx, vibrate } from '../../platform/audio';
import { AIRTIME, GROUPS, WINDOW, advance, aiChance, backHandCatch, newProgress, scatter, type Level, type Progress, type Stone } from './model';

export type Phase = 'ready' | 'air' | 'bReady' | 'bAir' | 'bReady2' | 'bAir2' | 'banner' | 'over';
export interface FiveHud { player: number; phase: Phase; progress: Progress[]; lives: number; need: number; picked: number; message: string | null; catchable: boolean }
export type FiveMsg = 'caught' | 'perfect' | 'early' | 'dropped' | 'tooMany' | 'tooFew' | 'stage' | 'backCaught' | 'backMissed' | 'yourTurn' | 'theirTurn' | 'turnOf' | 'cleared';

const W = 600, H = 760, FLOOR_TOP = 40, FLOOR_BOTTOM = 560, HAND = { x: 300, y: 668 };
const PEAK = 330;

export class FiveScene implements Scene {
  designW = W;
  designH = H;
  progress: Progress[];
  private cur = 0;
  phase: Phase = 'banner';
  private stones: Stone[] = [];
  private t = 0;
  private air = 1.2;
  private time = 0;
  private picked = 0;
  private lives = 3;
  private msg: { text: string; t: number; good: boolean } | null = null;
  private after: (() => void) | null = null;
  private wait = 0;
  private aiPlan: { ok: boolean; picks: number[]; catchAt: number; extra: boolean } | null = null;
  private flying: Array<{ s: Stone; t: number; fx: number; fy: number }> = [];
  private backCaught = 0;
  private flip = 0;
  private bg: HTMLCanvasElement | null = null;
  private ended = false;

  constructor(private players: number, private ai: boolean, private level: Level, private rng: Rng, private say: (m: FiveMsg, v?: Record<string, string | number>) => string, private onHud: (h: FiveHud) => void, private onEnd: (p: Progress[], lives: number) => void) {
    this.progress = Array.from({ length: players }, newProgress);
    this.air = AIRTIME[level];
    this.later(0.5, () => this.startTurn());
  }

  private get p() { return this.progress[this.cur]; }
  private isAI() { return this.ai && this.cur === 1; }
  private need() { return this.p.stage < GROUPS.length ? GROUPS[this.p.stage][this.p.group] : 0; }

  private later(sec: number, fn: () => void) { this.after = fn; this.wait = sec; this.phase = 'banner'; this.emit(); }
  private flash(text: string, good: boolean, t = 1.3) { this.msg = { text, t, good }; this.emit(); }

  private emit() {
    this.onHud({ player: this.cur, phase: this.phase, progress: this.progress.map((p) => ({ ...p })), lives: this.lives, need: this.need(), picked: this.picked, message: this.msg?.text ?? null, catchable: this.catchable() });
  }

  private startTurn() {
    if (this.players > 1) this.flash(this.ai ? this.say(this.cur === 0 ? 'yourTurn' : 'theirTurn') : this.say('turnOf', { n: this.cur + 1 }), true);
    this.setupStage();
  }

  /** Lay out the floor stones still to pick in this stage. */
  private setupStage() {
    const p = this.p;
    if (p.stage >= GROUPS.length) { this.phase = 'bReady'; this.flip = 0; this.stones = []; this.planAI(); this.emit(); return; }
    const done = GROUPS[p.stage].slice(0, p.group).reduce((a, b) => a + b, 0);
    this.stones = scatter(this.rng, W, FLOOR_TOP, FLOOR_BOTTOM, 1).slice(0, 4 - done);
    sfx('crunch', { gain: 0.6 });
    this.picked = 0;
    this.phase = 'ready';
    this.planAI();
    this.emit();
  }

  private planAI() {
    if (!this.isAI()) { this.aiPlan = null; return; }
    const ok = this.rng.chance(aiChance(this.level, this.p.stage));
    const n = this.need();
    const picks: number[] = [];
    for (let i = 0; i < n; i++) picks.push(this.air * (0.18 + (i * 0.42) / Math.max(1, n)));
    this.aiPlan = { ok, picks, catchAt: this.air * (1 - WINDOW[this.level] * 0.25), extra: !ok && this.rng.chance(0.3) && this.stones.length > n };
    this.after = () => this.toss();
    this.wait = 0.9;
  }

  // ---------- Actions ----------

  toss() {
    if (this.phase === 'ready') { this.phase = 'air'; this.t = 0; this.picked = 0; sfx('whoosh', { gain: 0.5 }); this.emit(); return; }
    if (this.phase === 'bReady' || this.phase === 'bReady2') {
      this.phase = this.phase === 'bReady' ? 'bAir' : 'bAir2'; this.t = 0; sfx('whoosh'); this.emit();
      if (this.isAI()) { const err = this.rng.gauss() * (this.level === 'hard' ? 0.06 : this.level === 'medium' ? 0.1 : 0.14); this.after = () => this.catchNow(err); this.wait = this.air + err; this.phase = this.phase; }
    }
  }

  private pick(s: Stone) {
    if (this.phase !== 'air' || s.held) return;
    s.held = true;
    this.picked++;
    this.flying.push({ s, t: 0, fx: s.x, fy: s.y });
    sfx('click', { pitch: 0.7 + this.picked * 0.1 });
    vibrate(6);
    this.emit();
  }

  private catchable() {
    if (this.phase !== 'air') return false;
    return this.t > this.air / 2 && this.height() < PEAK * WINDOW[this.level];
  }

  private height() { const u = Math.min(1, this.t / this.air); return 4 * PEAK * u * (1 - u); }

  private catchNow(errOverride?: number) {
    if (this.phase === 'air') {
      if (!this.catchable()) { this.fail(this.say('early')); return; }
      const need = this.need();
      sfx('pop', { pitch: 0.8 });
      if (this.picked < need) { this.fail(this.say('tooFew', { n: need })); return; }
      if (this.picked > need) { this.fail(this.say('tooMany', { n: need })); return; }
      const perfect = this.height() < PEAK * WINDOW[this.level] * 0.35;
      this.flash(perfect ? this.say('perfect') : this.say('caught'), true, 0.9);
      sfx('good', { pitch: perfect ? 1.25 : 1 });
      const before = this.p.stage;
      this.progress[this.cur] = advance(this.p);
      if (this.p.stage !== before) {
        this.flash(this.say('stage', { n: before + 1 }), true, 1.5);
        sfx('fanfare');
        this.later(1.4, () => this.setupStage());
      } else {
        this.stones = this.stones.filter((s) => !s.held);
        this.picked = 0;
        this.phase = 'ready';
        this.planAI();
        this.emit();
      }
      return;
    }
    if (this.phase === 'bAir' || this.phase === 'bAir2') {
      const err = errOverride ?? (this.t - this.air);
      const got = backHandCatch(err);
      if (this.phase === 'bAir') {
        this.backCaught = got;
        if (got === 0) { this.fail(this.say('backMissed')); return; }
        this.flash(this.say('backCaught', { n: got }), true);
        sfx('clap');
        this.flip = 1;
        this.phase = 'bReady2';
        if (this.isAI()) { this.after = () => this.toss(); this.wait = 0.9; }
        this.emit();
      } else {
        const final = Math.min(this.backCaught, got);
        if (final < 2) { this.fail(this.say('backMissed')); return; }
        this.progress[this.cur] = { ...this.p, points: this.p.points + final * 20, done: true, stage: GROUPS.length + 1 };
        this.flash(this.say('cleared', { n: final }), true, 2);
        sfx('fanfare'); setTimeout(() => sfx('clap'), 300);
        this.finishCheck(true);
      }
    }
  }

  private fail(text: string) {
    sfx('bad'); vibrate([20, 30, 20]);
    this.flash(text, false, 1.5);
    this.flip = 0;
    if (this.players === 1) {
      this.lives--;
      if (this.lives <= 0) { this.finishCheck(false); return; }
      this.later(1.4, () => this.setupStage());
      return;
    }
    this.later(1.5, () => { this.cur = (this.cur + 1) % this.players; this.startTurn(); });
  }

  private finishCheck(cleared: boolean) {
    if (this.players > 1 && !cleared) return;
    if (this.ended) return;
    this.ended = true;
    this.phase = 'over';
    this.emit();
    setTimeout(() => this.onEnd(this.progress.map((p) => ({ ...p })), this.lives), 1600);
  }

  // ---------- Input ----------

  private human() { return !this.isAI() && this.phase !== 'banner' && this.phase !== 'over'; }

  pointerDown(x: number, y: number) {
    if (!this.human()) return;
    if (this.phase === 'ready' || this.phase === 'bReady' || this.phase === 'bReady2') { this.toss(); return; }
    if (this.phase === 'air') {
      const s = this.stones.filter((q) => !q.held).find((q) => Math.hypot(q.x - x, q.y - y) < q.r + 22);
      if (s && y < FLOOR_BOTTOM + 10) { this.pick(s); return; }
      this.catchNow();
      return;
    }
    if (this.phase === 'bAir' || this.phase === 'bAir2') this.catchNow();
  }

  key(code: string): boolean {
    if (!this.human()) return false;
    if (code === 'Space' || code === 'Enter') {
      if (this.phase === 'air' || this.phase === 'bAir' || this.phase === 'bAir2') this.catchNow(); else this.toss();
      return true;
    }
    if (code === 'KeyP' && this.phase === 'air') {
      const s = this.stones.filter((q) => !q.held).sort((a, b) => Math.hypot(a.x - HAND.x, a.y - HAND.y) - Math.hypot(b.x - HAND.x, b.y - HAND.y))[0];
      if (s) this.pick(s);
      return true;
    }
    return false;
  }

  /** Test hook: play one perfect toss for the human. */
  testPerfect() {
    if (!this.human()) return false;
    if (this.phase === 'ready') { this.toss(); }
    if (this.phase === 'air') {
      const need = this.need();
      this.stones.filter((s) => !s.held).slice(0, need).forEach((s) => this.pick(s));
      this.t = this.air * 0.93;
      this.catchNow();
      return true;
    }
    if (this.phase === 'bReady' || this.phase === 'bReady2') { this.toss(); this.t = this.air; this.catchNow(0); return true; }
    return false;
  }

  // ---------- Loop ----------

  update(dt: number) {
    this.time += dt;
    if (this.msg) { this.msg.t -= dt; if (this.msg.t <= 0) { this.msg = null; this.emit(); } }
    for (const f of this.flying) f.t += dt * 3.2;
    this.flying = this.flying.filter((f) => f.t < 1);
    if (this.after) {
      this.wait -= dt;
      if (this.wait <= 0) { const f = this.after; this.after = null; f(); }
    }
    if (this.phase === 'air') {
      const was = this.catchable();
      this.t += dt;
      if (this.aiPlan && this.isAI()) {
        while (this.aiPlan.picks.length && this.t >= this.aiPlan.picks[0]) {
          this.aiPlan.picks.shift();
          const s = this.stones.find((q) => !q.held);
          if (s) this.pick(s);
        }
        if (this.aiPlan.extra && this.t > this.air * 0.6) { this.aiPlan.extra = false; const s = this.stones.find((q) => !q.held); if (s) this.pick(s); }
        if (this.aiPlan.ok && this.t >= this.aiPlan.catchAt) { this.aiPlan = null; this.catchNow(); return; }
      }
      if (this.catchable() !== was) this.emit();
      if (this.t >= this.air) { this.t = this.air; this.fail(this.say('dropped')); }
    }
    if (this.phase === 'bAir' || this.phase === 'bAir2') {
      this.t += dt;
      if (this.t > this.air + 0.3) this.fail(this.say('backMissed'));
    }
  }

  // ---------- Drawing ----------

  private floor(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d')!;
    g.fillStyle = '#d9d2c3'; g.fillRect(0, 0, W, H);
    // Terrazzo chips of an old verandah floor
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = ['#b9ad98', '#8f8676', '#e9e3d6', '#a59a87', '#c7b9a0', '#7e766a'][i % 6];
      const x = rnd() * W, y = rnd() * H, s = 2 + rnd() * 6;
      g.beginPath(); g.ellipse(x, y, s, s * (0.5 + rnd() * 0.5), rnd() * 3, 0, Math.PI * 2); g.fill();
    }
    // Brass divider strips
    g.strokeStyle = 'rgba(160,120,50,0.5)'; g.lineWidth = 2;
    for (let x = 0; x <= W; x += 150) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (let y = 0; y <= H; y += 150) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    // Chalk circle where the game is played
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 3; g.setLineDash([10, 8]);
    g.beginPath(); g.ellipse(300, 300, 270, 230, 0, 0, Math.PI * 2); g.stroke();
    return c;
  }

  render(ctx: CanvasRenderingContext2D, view: View) {
    ctx.fillStyle = '#cfc7b6'; ctx.fillRect(view.left, view.top, view.right - view.left, view.bottom - view.top);
    if (!this.bg) this.bg = this.floor();
    ctx.drawImage(this.bg, 0, 0);

    // Floor stones
    for (const s of this.stones) if (!s.held) drawStone(ctx, s.x, s.y, s.r, s.tint, this.phase === 'air' && !this.isAI() ? 0.5 + 0.5 * Math.sin(this.time * 6) : 0);

    // Hand
    const back = this.phase === 'bReady2' || this.phase === 'bAir' || (this.phase === 'banner' && this.flip === 1);
    drawHand(ctx, HAND.x, HAND.y, back, this.catchable());

    // Stones flying to the hand
    for (const f of this.flying) {
      const u = f.t;
      drawStone(ctx, f.fx + (HAND.x - f.fx) * u, f.fy + (HAND.y - 30 - f.fy) * u - Math.sin(Math.PI * u) * 60, 14, f.s.tint, 0);
    }

    // Tosser / the five in stage 5
    if (this.phase === 'air' || this.phase === 'ready') {
      const h = this.phase === 'air' ? this.height() : 0;
      const sx = HAND.x + 4, sy = HAND.y - 46;
      ctx.fillStyle = `rgba(0,0,0,${0.25 - Math.min(0.2, h / 1500)})`;
      ctx.beginPath(); ctx.ellipse(sx, sy + 26, 14 - h / 60, 5, 0, 0, Math.PI * 2); ctx.fill();
      drawStone(ctx, sx, sy - h, 15 + h / 70, '#e58f7a', 0);
      if (this.phase === 'air') {
        const wy = sy - PEAK * WINDOW[this.level];
        ctx.strokeStyle = this.catchable() ? 'rgba(60,200,100,0.9)' : 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 3; ctx.setLineDash([6, 6]);
        ctx.beginPath(); ctx.moveTo(sx - 40, wy); ctx.lineTo(sx + 40, wy); ctx.stroke(); ctx.setLineDash([]);
      }
    }
    if (this.phase === 'bAir' || this.phase === 'bAir2') {
      const u = Math.min(1.3, this.t / this.air);
      const h = Math.max(-20, 4 * 230 * u * (1 - u));
      const n = this.phase === 'bAir' ? 5 : this.backCaught;
      for (let i = 0; i < n; i++) drawStone(ctx, HAND.x - 40 + i * 20, HAND.y - 50 - h - (i % 2) * 10, 13, '#c9b79c', 0);
      // Timing ring
      const k = Math.max(0, 1 - Math.abs(this.t - this.air) / 0.3);
      ctx.strokeStyle = `rgba(60,200,100,${k})`; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(HAND.x, HAND.y - 40, 60 - k * 20, 0, Math.PI * 2); ctx.stroke();
    }
    if (this.phase === 'bReady' || this.phase === 'bReady2') {
      const n = this.phase === 'bReady' ? 5 : this.backCaught;
      for (let i = 0; i < n; i++) drawStone(ctx, HAND.x - 40 + i * 20, HAND.y - 44 - (i % 2) * 8, 13, '#c9b79c', 0);
    }

    // Message
    if (this.msg) {
      ctx.font = '800 40px "Baloo Da 2", "Hind Siliguri", system-ui';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const tw = ctx.measureText(this.msg.text).width;
      ctx.fillStyle = 'rgba(255,253,246,0.94)';
      ctx.beginPath(); ctx.roundRect(300 - tw / 2 - 20, 270, tw + 40, 64, 14); ctx.fill();
      ctx.fillStyle = this.msg.good ? '#0b5d43' : '#c62f2f';
      ctx.fillText(this.msg.text, 300, 304);
    }
  }
}

function drawStone(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, tint: string, glow: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(x + 3, y + r * 0.55, r, r * 0.45, 0, 0, Math.PI * 2); ctx.fill();
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, '#fffaf0'); g.addColorStop(0.35, tint); g.addColorStop(1, shade(tint));
  ctx.fillStyle = g;
  ctx.beginPath();
  for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; const rr = r * (0.88 + 0.12 * Math.sin(i * 2.7 + x)); ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.85); }
  ctx.closePath(); ctx.fill();
  if (glow > 0) { ctx.strokeStyle = `rgba(255,214,77,${glow * 0.8})`; ctx.lineWidth = 3; ctx.stroke(); }
}

function shade(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(v * 0.62);
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function drawHand(ctx: CanvasRenderingContext2D, x: number, y: number, back: boolean, glow: boolean) {
  ctx.save();
  ctx.translate(x, y);
  if (glow) { ctx.fillStyle = 'rgba(60,200,100,0.25)'; ctx.beginPath(); ctx.arc(0, -10, 92, 0, Math.PI * 2); ctx.fill(); }
  const skin = back ? '#b77a4e' : '#c98a5c', line = '#7a4426';
  // sleeve
  ctx.fillStyle = '#f4f4f0'; ctx.fillRect(-56, 40, 112, 60);
  ctx.fillStyle = '#1f3a8a'; ctx.fillRect(-56, 40, 112, 10);
  // fingers
  ctx.fillStyle = skin; ctx.strokeStyle = line; ctx.lineWidth = 3;
  const fingers = [[-46, -40, 20, 58], [-22, -58, 21, 74], [3, -60, 21, 76], [27, -50, 20, 64]];
  for (const [fx, fy, w, h] of fingers) { ctx.beginPath(); ctx.roundRect(fx, fy, w, h, 10); ctx.fill(); ctx.stroke(); }
  // thumb
  ctx.beginPath(); ctx.ellipse(60, 4, 15, 34, -0.7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // palm
  ctx.beginPath(); ctx.roundRect(-52, -14, 104, 64, 26); ctx.fill(); ctx.stroke();
  if (back) {
    ctx.strokeStyle = 'rgba(80,40,20,0.5)'; ctx.lineWidth = 2;
    for (const kx of [-36, -12, 13, 37]) { ctx.beginPath(); ctx.arc(kx, -10, 6, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
  } else {
    ctx.strokeStyle = 'rgba(80,40,20,0.45)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-40, 6); ctx.quadraticCurveTo(0, 20, 40, 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-36, 24); ctx.quadraticCurveTo(-4, 30, 22, 44); ctx.stroke();
  }
  ctx.restore();
}
