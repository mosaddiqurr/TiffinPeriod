import type { Scene, View } from '../../engine/GameCanvas';
import type { Rng } from '../../engine/rng';
import { sfx, vibrate } from '../../platform/audio';
import { DESK, EH, EW, aiFlick, busy, flick, landingPoint, newEraser, step, type Eraser, type World } from './model';
import { flickScore, type Level } from './levels';

export interface EFHud { mode: 'duel' | 'challenge'; turn: 0 | 1; phase: 'aim' | 'moving' | 'wait' | 'over'; rounds: [number, number]; round: number; flicksLeft: number; total: number; scores: number[]; message: string | null }
export type EFMsg = 'onTop' | 'fell' | 'stand' | 'yourTurn' | 'theirTurn' | 'turnOf' | 'points' | 'drawRound' | 'round';

const COLORS: [[string, string], [string, string]] = [['#2f6fd6', '#f7f4ea'], ['#e3127d', '#fff3c4']];
const TEACHER: [string, string] = ['#6b4a1f', '#e9e1cf'];
const MAX_TURNS = 14;

export class EraserScene implements Scene {
  designW = 600;
  designH = 820;
  w: World;
  phase: EFHud['phase'] = 'wait';
  private turn: 0 | 1 = 0;
  private rounds: [number, number] = [0, 0];
  private round = 1;
  private turns = 0;
  private flicksLeft = 3;
  private scores: number[] = [];
  private drag: { sx: number; sy: number; x: number; y: number } | null = null;
  private kb = { angle: -Math.PI / 2, power: 0.5, on: false };
  private msg: { text: string; t: number; good: boolean } | null = null;
  private after: (() => void) | null = null;
  private wait = 0;
  private time = 0;
  private bg: HTMLCanvasElement | null = null;
  private ended = false;
  private trail: Array<[number, number]> = [];

  constructor(
    private mode: 'duel' | 'challenge',
    private vsAI: boolean,
    private skill: number,
    private level: Level | null,
    private rng: Rng,
    private say: (m: EFMsg, v?: Record<string, string | number>) => string,
    private onHud: (h: EFHud) => void,
    private onEnd: (r: { rounds: [number, number]; scores: number[]; total: number }) => void,
    private firstTo = 3,
  ) {
    this.w = { erasers: [], boxes: level?.boxes ?? [], t: 0, events: [] };
    this.reset();
    this.later(0.5, () => this.beginTurn());
  }

  private reset() {
    if (this.mode === 'challenge' && this.level) {
      const L = this.level;
      this.w.erasers = [newEraser(0, L.start.x, L.start.y, L.start.a, COLORS[0])];
      if (L.zone.kind === 'top') this.w.erasers.push(newEraser(9, L.zone.x, L.zone.y, L.zone.a, TEACHER, true));
    } else {
      this.w.erasers = [newEraser(0, 300 + this.rng.range(-70, 70), 610, this.rng.range(-0.3, 0.3), COLORS[0]), newEraser(1, 300 + this.rng.range(-70, 70), 240, this.rng.range(-0.3, 0.3), COLORS[1])];
    }
    this.turns = 0;
    this.trail = [];
  }

  private later(sec: number, fn: () => void) { this.after = fn; this.wait = sec; this.phase = 'wait'; this.emit(); }
  private flash(text: string, good: boolean, t = 1.4) { this.msg = { text, t, good }; this.emit(); }
  private me() { return this.w.erasers.find((e) => e.id === this.turn)!; }
  private isAI() { return this.mode === 'duel' && this.vsAI && this.turn === 1; }

  private emit() {
    this.onHud({ mode: this.mode, turn: this.turn, phase: this.phase, rounds: [...this.rounds] as [number, number], round: this.round, flicksLeft: this.flicksLeft, total: this.scores.reduce((a, b) => a + b, 0), scores: [...this.scores], message: this.msg?.text ?? null });
  }

  private beginTurn() {
    if (this.mode === 'duel') this.flash(this.vsAI ? this.say(this.turn === 0 ? 'yourTurn' : 'theirTurn') : this.say('turnOf', { n: this.turn + 1 }), true, 1);
    this.phase = 'aim';
    const me = this.me();
    const other = this.w.erasers.find((e) => e !== me);
    this.kb.angle = other ? Math.atan2(other.y - me.y, other.x - me.x) : -Math.PI / 2;
    this.emit();
    if (this.isAI()) this.later(0.8, () => { const m = aiFlick(this.w, 1, 0, this.skill, this.rng); this.doFlick(m.angle, m.power); });
  }

  private doFlick(angle: number, power: number) {
    flick(this.me(), angle, power);
    this.phase = 'moving';
    this.drag = null; this.kb.on = false;
    this.trail = [];
    sfx('click', { pitch: 0.5 + power * 0.6 }); vibrate(8);
    this.emit();
  }

  private resolve() {
    const me = this.me();
    if (this.mode === 'challenge') {
      const L = this.level!;
      const pts = flickScore(L, me, L.zone.kind === 'top' ? 9 : null);
      this.scores.push(pts);
      this.flicksLeft--;
      if (me.stand) this.flash(this.say('stand'), true);
      else if (me.fallen) this.flash(this.say('fell'), false);
      else if (me.onTop !== null) this.flash(this.say('onTop'), true);
      else this.flash(this.say('points', { n: pts }), pts > 0);
      if (pts >= 100) sfx('fanfare'); else if (pts > 0) sfx('good'); else sfx('bad');
      if (this.flicksLeft <= 0) { this.finish(); return; }
      this.later(1.3, () => { this.reset(); this.beginTurn(); });
      return;
    }
    // Duel
    const other = this.w.erasers.find((e) => e !== me)!;
    let winner: 0 | 1 | null = null;
    if (me.onTop !== null) winner = this.turn;
    else if (me.fallen && other.fallen) winner = null;
    else if (me.fallen) winner = other.id as 0 | 1;
    else if (other.fallen) winner = this.turn;
    this.turns++;
    if (winner !== null || me.fallen) {
      if (winner !== null) {
        this.rounds[winner]++;
        this.flash(me.onTop !== null ? this.say('onTop') : this.say('fell'), winner === 0 || !this.vsAI, 1.8);
        if (me.onTop !== null) { sfx('fanfare'); vibrate([30, 40, 60]); } else sfx('bad');
      }
      this.nextRound();
      return;
    }
    if (me.stand) { this.flash(this.say('stand'), true); sfx('six'); }
    if (this.turns >= MAX_TURNS) { this.flash(this.say('drawRound'), true, 1.6); this.nextRound(); return; }
    this.turn = this.turn === 0 ? 1 : 0;
    this.later(0.6, () => this.beginTurn());
  }

  private nextRound() {
    this.emit();
    if (this.rounds[0] >= this.firstTo || this.rounds[1] >= this.firstTo) { this.finish(); return; }
    this.round++;
    this.later(1.9, () => { this.reset(); this.turn = (this.round % 2 === 0 ? 1 : 0); this.flash(this.say('round', { n: this.round }), true, 1); this.beginTurn(); });
  }

  private finish() {
    if (this.ended) return;
    this.ended = true;
    this.phase = 'over';
    this.emit();
    setTimeout(() => this.onEnd({ rounds: [...this.rounds] as [number, number], scores: [...this.scores], total: this.scores.reduce((a, b) => a + b, 0) }), 1500);
  }

  // ---------- Input ----------

  private human() { return this.phase === 'aim' && !this.isAI(); }

  pointerDown(x: number, y: number) {
    if (!this.human()) return;
    const me = this.me();
    if (Math.hypot(me.x - x, me.y - y) > 70) return;
    this.drag = { sx: me.x, sy: me.y, x, y };
  }
  pointerMove(x: number, y: number) { if (this.drag) { this.drag.x = x; this.drag.y = y; } }
  pointerUp() {
    if (!this.drag) return;
    const a = this.aim();
    this.drag = null;
    if (a.power > 0.05) this.doFlick(a.angle, a.power);
  }
  key(code: string): boolean {
    if (!this.human()) return false;
    if (code === 'ArrowLeft') this.kb.angle -= 0.04;
    else if (code === 'ArrowRight') this.kb.angle += 0.04;
    else if (code === 'ArrowUp') this.kb.power = Math.min(1, this.kb.power + 0.04);
    else if (code === 'ArrowDown') this.kb.power = Math.max(0.05, this.kb.power - 0.04);
    else if (code === 'Space' || code === 'Enter') { this.doFlick(this.kb.angle, this.kb.power); return true; }
    else return false;
    this.kb.on = true;
    return true;
  }
  testFlick(angle: number, power: number) { if (!this.human()) return false; this.doFlick(angle, power); return true; }

  private aim() {
    if (this.drag) {
      const dx = this.drag.sx - this.drag.x, dy = this.drag.sy - this.drag.y;
      return { angle: Math.atan2(dy, dx), power: Math.min(1, Math.max(0, (Math.hypot(dx, dy) - 12) / 200)) };
    }
    return { angle: this.kb.angle, power: this.kb.on ? this.kb.power : 0 };
  }

  // ---------- Loop ----------

  update(dt: number) {
    this.time += dt;
    if (this.msg) { this.msg.t -= dt; if (this.msg.t <= 0) { this.msg = null; this.emit(); } }
    if (this.after) { this.wait -= dt; if (this.wait <= 0) { const f = this.after; this.after = null; f(); } }
    if (this.phase === 'moving') {
      step(this.w, dt);
      const me = this.me();
      if (me.air && this.trail.length < 400) this.trail.push([me.x, me.y]);
      for (const ev of this.w.events) {
        if (ev.startsWith('land')) sfx('thud', { gain: 0.6, pitch: 1.6 });
        else if (ev === 'knock') sfx('tick', { gain: 0.6 });
        else if (ev.startsWith('fall')) sfx('whoosh');
        else if (ev.startsWith('top')) sfx('pop');
      }
      this.w.events = [];
      if (!busy(this.w)) this.resolve();
    }
  }

  // ---------- Drawing ----------

  private desk(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = 600; c.height = 820;
    const g = c.getContext('2d')!;
    g.fillStyle = '#4a3a2a'; g.fillRect(0, 0, 600, 820);
    g.fillStyle = '#a8744a'; g.fillRect(DESK.left, DESK.top, DESK.right - DESK.left, DESK.bottom - DESK.top);
    for (let i = 0; i < 90; i++) { g.strokeStyle = `rgba(80,45,20,${0.05 + (i % 4) * 0.02})`; g.lineWidth = 1 + (i % 3); g.beginPath(); const y = DESK.top + i * 8.6; g.moveTo(DESK.left, y); g.bezierCurveTo(200, y + 6, 400, y - 5, DESK.right, y + 3); g.stroke(); }
    // carved initials and an ink stain
    g.strokeStyle = 'rgba(60,30,10,0.45)'; g.lineWidth = 3; g.font = '700 38px "Baloo Da 2", system-ui';
    g.strokeText('রা + তা', 395, 760);
    g.fillStyle = 'rgba(31,58,147,0.25)'; g.beginPath(); g.ellipse(110, 110, 34, 22, 0.4, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#6b4424'; g.lineWidth = 8; g.strokeRect(DESK.left, DESK.top, DESK.right - DESK.left, DESK.bottom - DESK.top);
    // pen groove
    g.fillStyle = 'rgba(40,20,5,0.35)'; g.fillRect(DESK.left + 30, DESK.bottom - 22, DESK.right - DESK.left - 60, 10);
    const L = this.level;
    if (L) {
      const z = L.zone;
      if (z.kind === 'rect') {
        if (z.label === 'notebook') {
          g.fillStyle = '#fbf7ea'; g.fillRect(z.x, z.y, z.w, z.h);
          g.strokeStyle = '#c2d3e4'; g.lineWidth = 1;
          for (let y = z.y + 18; y < z.y + z.h; y += 14) { g.beginPath(); g.moveTo(z.x, y); g.lineTo(z.x + z.w, y); g.stroke(); }
          g.strokeStyle = '#d9534f'; g.beginPath(); g.moveTo(z.x + 30, z.y); g.lineTo(z.x + 30, z.y + z.h); g.stroke();
          g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2; g.strokeRect(z.x, z.y, z.w, z.h);
        } else {
          g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 4; g.setLineDash([12, 8]); g.strokeRect(z.x, z.y, z.w, z.h); g.setLineDash([]);
        }
      } else if (z.kind === 'rings') {
        z.r.forEach((r, i) => { g.strokeStyle = i === 0 ? '#c62f2f' : 'rgba(35,37,58,0.75)'; g.lineWidth = 3; g.beginPath(); g.arc(z.x, z.y, r, 0, Math.PI * 2); g.stroke(); });
        g.fillStyle = 'rgba(198,47,47,0.18)'; g.beginPath(); g.arc(z.x, z.y, z.r[0], 0, Math.PI * 2); g.fill();
      } else if (z.kind === 'edge') {
        for (let i = 0; i < 4; i++) { g.fillStyle = `rgba(243,182,31,${0.12 + i * 0.06})`; g.fillRect(DESK.left, DESK.top + i * 30, DESK.right - DESK.left, 30); }
      } else if (z.kind === 'coin') {
        const rg = g.createRadialGradient(z.x - 6, z.y - 6, 2, z.x, z.y, 18);
        rg.addColorStop(0, '#fff3b0'); rg.addColorStop(1, '#b8860b');
        g.fillStyle = rg; g.beginPath(); g.arc(z.x, z.y, 18, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#7a5600'; g.font = '800 16px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('৳', z.x, z.y + 1);
      }
      for (const b of L.boxes) drawBox(g, b);
    }
    return c;
  }

  render(ctx: CanvasRenderingContext2D, view: View) {
    ctx.fillStyle = '#3b2e22'; ctx.fillRect(view.left, view.top, view.right - view.left, view.bottom - view.top);
    if (!this.bg) this.bg = this.desk();
    ctx.drawImage(this.bg, 0, 0);
    // Trail
    if (this.trail.length > 2) {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 3; ctx.setLineDash([4, 8]);
      ctx.beginPath(); this.trail.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); ctx.setLineDash([]);
    }
    // Aim guide
    const human = this.human();
    if (human) {
      const me = this.me();
      const a = this.aim();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2; ctx.setLineDash([3, 5]);
      ctx.beginPath(); ctx.arc(me.x, me.y, 46 + Math.sin(this.time * 5) * 3, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      if (a.power > 0.03) {
        const lp = landingPoint(me, a.angle, a.power);
        const col = a.power < 0.5 ? '#7CFC9A' : a.power < 0.8 ? '#ffd34d' : '#ff6b5a';
        ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.setLineDash([10, 8]); ctx.lineDashOffset = -this.time * 30;
        ctx.beginPath(); ctx.moveTo(me.x, me.y); ctx.lineTo(lp.x, lp.y); ctx.stroke(); ctx.setLineDash([]);
        ctx.strokeStyle = col; ctx.lineWidth = 3;
        ctx.save(); ctx.translate(lp.x, lp.y); ctx.rotate(me.a); ctx.strokeRect(-EW / 2, -EH / 2, EW, EH); ctx.restore();
        ctx.fillStyle = col;
        ctx.fillRect(me.x - 40, me.y + 34, 80 * a.power, 7);
        ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1; ctx.strokeRect(me.x - 40, me.y + 34, 80, 7);
      }
    }
    // Erasers (bottom first, then the one on top, then flying ones)
    const order = [...this.w.erasers].sort((a, b) => (a.onTop !== null ? 1 : 0) + a.z / 100 - ((b.onTop !== null ? 1 : 0) + b.z / 100));
    for (const e of order) drawEraser(ctx, e, this.time);
    // Message
    if (this.msg) {
      ctx.font = '800 38px "Baloo Da 2", "Hind Siliguri", system-ui';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const tw = ctx.measureText(this.msg.text).width;
      ctx.fillStyle = 'rgba(255,253,246,0.94)';
      ctx.beginPath(); ctx.roundRect(300 - tw / 2 - 20, 380, tw + 40, 62, 14); ctx.fill();
      ctx.fillStyle = this.msg.good ? '#0b5d43' : '#c62f2f';
      ctx.fillText(this.msg.text, 300, 412);
    }
  }
}

function drawBox(g: CanvasRenderingContext2D, b: { x: number; y: number; w: number; h: number; kind: string }) {
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(b.x + 5, b.y + 6, b.w, b.h);
  if (b.kind === 'ruler') {
    g.fillStyle = '#e8d9a8'; g.fillRect(b.x, b.y, b.w, b.h);
    g.strokeStyle = '#6b5a2a'; g.lineWidth = 1;
    for (let x = b.x + 6; x < b.x + b.w; x += 8) { g.beginPath(); g.moveTo(x, b.y); g.lineTo(x, b.y + ((x - b.x) % 40 < 8 ? 10 : 5)); g.stroke(); }
    g.strokeRect(b.x, b.y, b.w, b.h);
  } else if (b.kind === 'pencil') {
    g.fillStyle = '#f3b61f'; g.fillRect(b.x, b.y, b.w - 14, b.h);
    g.fillStyle = '#e9c9a0'; g.beginPath(); g.moveTo(b.x + b.w - 14, b.y); g.lineTo(b.x + b.w, b.y + b.h / 2); g.lineTo(b.x + b.w - 14, b.y + b.h); g.fill();
    g.fillStyle = '#e88aa0'; g.fillRect(b.x - 8, b.y, 8, b.h);
  } else if (b.kind === 'sharpener') {
    g.fillStyle = '#c62f2f'; g.fillRect(b.x, b.y, b.w, b.h); g.fillStyle = '#ddd'; g.fillRect(b.x + 4, b.y + 4, b.w - 8, 5);
  } else {
    g.fillStyle = '#1f6f8b'; g.fillRect(b.x, b.y, b.w, b.h); g.fillStyle = '#2f8fb0'; g.fillRect(b.x + 4, b.y + 4, b.w - 8, b.h - 8);
    g.fillStyle = '#f3b61f'; g.fillRect(b.x + b.w / 2 - 10, b.y + b.h / 2 - 4, 20, 8);
  }
}

function drawEraser(ctx: CanvasRenderingContext2D, e: Eraser, time: number) {
  if (e.fallen) return;
  const lift = e.z + (e.onTop !== null ? 10 : 0);
  const s = 1 + lift / 260;
  ctx.fillStyle = `rgba(0,0,0,${0.3 - Math.min(0.2, lift / 400)})`;
  ctx.save(); ctx.translate(e.x + 4 + lift * 0.25, e.y + 6 + lift * 0.4); ctx.rotate(e.a); ctx.fillRect(-EW / 2, -EH / 2, EW, EH); ctx.restore();
  ctx.save();
  ctx.translate(e.x, e.y - lift * 0.3);
  ctx.rotate(e.a);
  ctx.scale(s, s);
  const face = e.stand ? 0.18 : Math.max(0.16, Math.abs(Math.cos(e.flip)));
  ctx.scale(1, face);
  const down = Math.cos(e.flip) < 0;
  // Rubber body
  ctx.fillStyle = down ? shade(e.color[1]) : e.color[1];
  ctx.beginPath(); ctx.roundRect(-EW / 2, -EH / 2, EW, EH, 6); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.5; ctx.stroke();
  // Paper sleeve
  ctx.fillStyle = down ? shade(e.color[0]) : e.color[0];
  ctx.fillRect(-EW / 2 + 16, -EH / 2, EW - 26, EH);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillRect(-EW / 2 + 22, -3, EW - 38, 6);
  if (e.stand) { ctx.strokeStyle = `rgba(255,214,77,${0.6 + Math.sin(time * 8) * 0.4})`; ctx.lineWidth = 4; ctx.strokeRect(-EW / 2 - 4, -EH / 2 - 4, EW + 8, EH + 8); }
  ctx.restore();
}

function shade(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(v * 0.72);
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
