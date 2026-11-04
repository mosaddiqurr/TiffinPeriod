import type { Scene, View } from '../../engine/GameCanvas';
import { FloatTexts, Particles } from '../../engine/particles';
import { clamp } from '../../engine/math';
import { drawKid, LOOKS } from '../../shared/kid';
import { BODY, BiscuitAI, BiscuitRaceModel, COURSE, STRING, type Difficulty } from './model';
import type { Rng } from '../../engine/rng';

const LANE_H = 380;
const GROUND = 360; // ground line inside a lane (from the lane top)
const FONT = '"Baloo Da 2", sans-serif';

export interface BiscuitTexts { bump: string; nom: string; first: string; start: string; finish: string; names: string[]; num: (n: number) => string; secs: (s: number) => string; ready: string }

export class BiscuitScene implements Scene {
  designW = 1100;
  designH = LANE_H * 2;
  model: BiscuitRaceModel;
  ai: BiscuitAI | null;
  countdown = 3;
  /** Lane 0 is drawn at the top. The human Player 1 is always the bottom lane. */
  private cam: number[] = [0, 0];
  private follow = false;
  private fx = new Particles(300);
  private texts = new FloatTexts();
  private time = 0;
  private bg: HTMLCanvasElement | null = null;
  private bgKey = '';
  onEvent?: (e: { type: string; lane: number }) => void;
  started = false;
  /** Model time when the whistle blew. */
  raceStart = 0;

  constructor(public lanesN: 2, diff: Difficulty, rng: Rng, aiLane: number | null, private tx: BiscuitTexts, private reducedMotion: boolean) {
    this.model = new BiscuitRaceModel(lanesN, diff, rng);
    this.ai = aiLane === null ? null : new BiscuitAI(aiLane, diff, rng);
  }

  onResize(w: number, h: number) {
    const portrait = h > w * 0.9;
    this.follow = portrait;
    this.designW = portrait ? 640 : 1100;
    this.designH = LANE_H * this.lanesN;
  }

  update(dt: number) {
    this.time += dt;
    if (this.countdown > 0) {
      this.countdown -= dt;
      if (this.countdown <= 0) { this.started = true; this.raceStart = this.model.t; this.onEvent?.({ type: 'go', lane: -1 }); }
      // The biscuits already swing during the countdown.
      this.model.lanes.forEach((l) => { l.racer.ctl.left = l.racer.ctl.right = l.racer.ctl.jump = false; });
    } else {
      this.ai?.update(this.model, dt);
    }
    this.model.update(dt);
    for (const e of this.model.takeEvents()) {
      const l = this.model.lanes[e.lane];
      const top = e.lane * LANE_H;
      const b = this.model.biscuit(l);
      if (e.type === 'bump') {
        this.texts.add(b.x, top + GROUND - b.h - 30, this.tx.bump, '#fff3c4', 30);
        if (!this.reducedMotion) this.fx.burst(b.x, top + GROUND - b.h, 8, { color: '#d9a44a', shape: 'crumb', speed: 220, size: 5, gravity: 1200, max: 0.8 });
      }
      if (e.type === 'catch') {
        this.texts.add(b.x, top + GROUND - b.h - 30, this.tx.nom, '#ffffff', 36, 1.1);
        if (!this.reducedMotion) this.fx.burst(b.x, top + GROUND - b.h, 14, { color: '#e9b25d', shape: 'crumb', speed: 260, size: 5, gravity: 1200, max: 0.9 });
      }
      if (e.type === 'land' && !this.reducedMotion) this.fx.burst(l.racer.x, top + GROUND, 4, { color: '#c7a978', speed: 120, angle: -Math.PI / 2, spread: 2.4, size: 6, gravity: 600, max: 0.4 });
      if (e.type === 'finish') {
        const firstDone = this.model.lanes.filter((o) => o.racer.finished).length === 1;
        if (firstDone) this.texts.add(COURSE.finish, top + 120, this.tx.first, '#ffe27a', 44, 1.6);
        if (!this.reducedMotion) this.fx.burst(COURSE.finish, top + 140, 30, { colors: ['#e3127d', '#ffc20e', '#009e96', '#e0333f', '#fff'], shape: 'rect', speed: 380, size: 9, gravity: 500, max: 1.4 });
      }
      this.onEvent?.(e);
    }
    this.fx.update(dt);
    this.texts.update(dt);
  }

  private background(v: View) {
    const key = `${v.cssW}x${v.cssH}@${v.dpr}:${this.designW}`;
    if (this.bgKey === key && this.bg) return this.bg;
    this.bgKey = key;
    const W = 1100;
    const c = document.createElement('canvas');
    c.width = W * 2;
    c.height = LANE_H * 2;
    const g = c.getContext('2d')!;
    g.scale(2, 2);
    const sky = g.createLinearGradient(0, 0, 0, GROUND);
    sky.addColorStop(0, '#a9daf2'); sky.addColorStop(1, '#eef6ea');
    g.fillStyle = sky; g.fillRect(0, 0, W, LANE_H);
    // Distant school wall and trees
    g.fillStyle = '#e6d6a8'; g.fillRect(0, GROUND - 120, W, 70);
    g.fillStyle = '#c95f4c'; g.fillRect(0, GROUND - 124, W, 8);
    for (let x = 30; x < W; x += 140) { g.fillStyle = '#2f7d55'; g.fillRect(x, GROUND - 106, 28, 34); }
    g.fillStyle = '#5c9a44';
    for (let x = -20; x < W; x += 90) { g.beginPath(); g.arc(x, GROUND - 120, 40 + ((x * 7) % 18), Math.PI, 0); g.fill(); }
    // Spectators
    const cols = ['#f2f2ee', '#1f3a8a', '#c0392b', '#f2f2ee', '#127a59'];
    for (let x = 10, i = 0; x < W; x += 24, i++) {
      g.fillStyle = cols[i % cols.length];
      g.beginPath(); g.ellipse(x, GROUND - 52, 10, 14, 0, 0, 6.283); g.fill();
      g.fillStyle = '#22160f';
      g.beginPath(); g.arc(x, GROUND - 70, 7.5, 0, 6.283); g.fill();
    }
    // Field
    const fg = g.createLinearGradient(0, GROUND - 40, 0, LANE_H);
    fg.addColorStop(0, '#8cbf4e'); fg.addColorStop(1, '#6ea23a');
    g.fillStyle = fg; g.fillRect(0, GROUND - 40, W, LANE_H - GROUND + 40);
    g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, GROUND + 8); g.lineTo(W, GROUND + 8); g.stroke();
    // Start line
    g.fillStyle = '#fff'; g.fillRect(COURSE.start - 26, GROUND - 30, 6, 46);
    // Finish: checkered ribbon post
    for (let k = 0; k < 8; k++) { g.fillStyle = k % 2 ? '#222' : '#fff'; g.fillRect(COURSE.finish, GROUND - 180 + k * 24, 10, 24); }
    g.fillStyle = '#e0333f'; g.beginPath(); g.moveTo(COURSE.finish + 10, GROUND - 180); g.lineTo(COURSE.finish + 50, GROUND - 168); g.lineTo(COURSE.finish + 10, GROUND - 156); g.fill();
    // Bamboo gantry over the biscuit line
    const bamboo = (x0: number, y0: number, x1: number, y1: number, w: number) => {
      g.strokeStyle = '#b89545'; g.lineWidth = w; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      g.strokeStyle = '#8a6d2c'; g.lineWidth = 2;
      const n = Math.floor(Math.hypot(x1 - x0, y1 - y0) / 46);
      for (let k = 1; k < n; k++) { const tt = k / n; const x = x0 + (x1 - x0) * tt, y = y0 + (y1 - y0) * tt; g.beginPath(); if (x0 === x1) { g.moveTo(x - w / 2, y); g.lineTo(x + w / 2, y); } else { g.moveTo(x, y - w / 2); g.lineTo(x, y + w / 2); } g.stroke(); }
    };
    bamboo(COURSE.line + 90, GROUND - STRING.anchorH - 6, COURSE.line + 90, GROUND + 6, 12);
    bamboo(COURSE.line - 120, GROUND - STRING.anchorH, COURSE.line + 110, GROUND - STRING.anchorH, 10);
    // Biscuit line on the ground (chalk)
    g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 3; g.setLineDash([10, 8]);
    g.beginPath(); g.moveTo(COURSE.line + 40, GROUND - 26); g.lineTo(COURSE.line + 40, GROUND + 18); g.stroke(); g.setLineDash([]);
    this.bg = c;
    return c;
  }

  render(ctx: CanvasRenderingContext2D, v: View) {
    const visW = v.right - v.left;
    ctx.fillStyle = '#6ea23a';
    ctx.fillRect(v.left, v.top, visW, v.bottom - v.top);
    const bg = this.background(v);
    this.model.lanes.forEach((l, i) => {
      const r = l.racer;
      const top = i * LANE_H;
      // Camera follow in portrait; whole course in landscape.
      const target = this.follow ? clamp(r.x - visW * 0.42, 0, Math.max(0, 1100 - visW)) : 0;
      this.cam[i] += (target - this.cam[i]) * 0.12;
      const cx = this.follow ? this.cam[i] : 0;
      ctx.save();
      ctx.beginPath(); ctx.rect(v.left, top, visW, LANE_H); ctx.clip();
      // Continue the sky and the grass past the course edges on wide screens.
      ctx.fillStyle = '#d6ecf0'; ctx.fillRect(v.left, top, visW, GROUND - 40);
      ctx.fillStyle = '#7fb145'; ctx.fillRect(v.left, top + GROUND - 40, visW, LANE_H - GROUND + 40);
      ctx.translate(-cx + (this.follow ? v.left : 0), top);
      ctx.drawImage(bg, 0, 0, 1100, LANE_H);
      // String and biscuit
      const b = this.model.biscuit(l);
      const by = GROUND - b.h;
      const ay = GROUND - STRING.anchorH;
      ctx.strokeStyle = '#f4f0e6'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(l.pend.ax, ay);
      ctx.lineTo(l.taken ? l.pend.ax + Math.sin(l.pend.theta) * STRING.L * 0.7 : b.x, l.taken ? ay + Math.cos(l.pend.theta) * STRING.L * 0.7 : by - 12);
      ctx.stroke();
      ctx.fillStyle = '#7a5530'; ctx.beginPath(); ctx.arc(l.pend.ax, ay, 4, 0, 6.283); ctx.fill();
      if (!l.taken) this.drawBiscuit(ctx, b.x, by, l.pend.theta, r.chips);
      // Kid
      const m = this.model.mouth(r);
      const near = !l.taken && Math.abs(b.x - m.x) < 120;
      const lookUp = near ? 0.35 : 0;
      const look = LOOKS[i === this.lanesN - 1 ? 0 : 4];
      drawKid(ctx, r.x, GROUND, 1, look, {
        lean: r.hasBiscuit ? -0.12 : -0.04, step: r.step, stride: r.grounded ? clamp(Math.abs(r.vx) / BODY.maxSpeed, 0, 1) : 0.15,
        lift: -r.h, arms: 'back', mouthOpen: r.hasBiscuit ? 0 : !r.grounded && near ? 1 : near ? 0.4 : 0.05, look: lookUp, cheeks: r.hasBiscuit,
      });
      if (r.hasBiscuit) this.drawBiscuit(ctx, r.x + 26, GROUND - r.h - 140, 0.15, r.chips, 0.8);
      if (r.dizzy > 0) {
        for (let k = 0; k < 3; k++) {
          const a = this.time * 8 + (k * Math.PI * 2) / 3;
          ctx.fillStyle = '#ffd23f';
          ctx.beginPath(); ctx.arc(r.x + Math.cos(a) * 20, GROUND - r.h - 178 + Math.sin(a) * 6, 4, 0, 6.283); ctx.fill();
        }
      }
      ctx.restore();
      // Lane label
      ctx.save();
      ctx.font = `800 22px ${FONT}`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      const label = `${this.tx.names[i]}  ${r.finished ? this.tx.secs(r.finishTime! - this.raceStart) : this.started ? this.tx.secs(this.model.t - this.raceStart) : ''}`;
      const w = ctx.measureText(label).width + 22;
      ctx.fillStyle = i === this.lanesN - 1 ? 'rgba(192, 57, 43, 0.9)' : 'rgba(31, 78, 156, 0.9)';
      ctx.beginPath(); ctx.roundRect?.(v.left + 10, top + 12, w, 34, 17); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(label, v.left + 21, top + 30);
      ctx.restore();
      if (i < this.lanesN - 1) { ctx.fillStyle = '#4d7a28'; ctx.fillRect(v.left, top + LANE_H - 3, visW, 6); }
    });
    // Effects are in lane space for landscape (no camera). In portrait they follow lane 1's camera approximately.
    ctx.save();
    if (this.follow) ctx.translate(-this.cam[this.lanesN - 1] + v.left, 0);
    this.fx.draw(ctx);
    this.texts.draw(ctx, FONT);
    ctx.restore();
    if (this.countdown > 0) {
      ctx.fillStyle = 'rgba(20, 30, 20, 0.35)';
      ctx.fillRect(v.left, v.top, visW, v.bottom - v.top);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `800 120px ${FONT}`;
      ctx.fillText(this.tx.num(Math.ceil(this.countdown)), (v.left + v.right) / 2, this.designH / 2 - 20);
      ctx.font = `700 34px ${FONT}`;
      ctx.fillText(this.tx.ready, (v.left + v.right) / 2, this.designH / 2 + 70);
    }
  }

  private drawBiscuit(ctx: CanvasRenderingContext2D, x: number, y: number, rot: number, chips: number, s = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(s, s);
    const w = 44, h = 32;
    if (chips > 0) {
      // Bite marks: clip away semicircles from the bottom edge.
      ctx.beginPath();
      ctx.rect(-w, -h, w * 2, h * 2);
      for (let k = 0; k < chips; k++) { ctx.moveTo(w / 2 - 4 - k * 12 + 7, h / 2); ctx.arc(w / 2 - 4 - k * 12, h / 2, 7, 0, 6.283); }
      ctx.clip('evenodd');
    }
    ctx.fillStyle = '#e9b25d';
    ctx.strokeStyle = '#a8742d'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.roundRect?.(-w / 2, -h / 2, w, h, 5); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#b07a33';
    for (const hx of [-12, 0, 12]) for (const hy of [-6, 6]) { ctx.beginPath(); ctx.arc(hx, hy, 2, 0, 6.283); ctx.fill(); }
    ctx.restore();
  }
}
