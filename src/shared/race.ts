import type { View } from '../engine/GameCanvas';
import type { ShellResult, ShellScene } from '../components/GameShell';
import { FloatTexts, Particles } from '../engine/particles';
import { clamp } from '../engine/math';
import { sfx } from '../platform/audio';

// Base class for side-view sports-day races (Sack Race, Three-Legged Race,
// Spoon & Marble Race, Elonti Belonti). One lane per racer, a camera per lane,
// a progress bar at the top, a countdown, and the finishing order.

export const LANE_H = 262;
export const GROUND_Y = 240; // ground line inside a lane
export const HUD_H = 56;
const FONT = '"Baloo Da 2", sans-serif';

export interface RacerBase {
  x: number;
  finished: boolean;
  finishT: number | null;
  name: string;
  /** Player index for humans (0 or 1). −1 for the computer. */
  player: number;
  color: string;
}

export interface RaceTexts {
  num: (n: number | string) => string;
  secs: (s: number) => string;
  place: (n: number) => string;
  dnf: string;
  won: (name: string) => string;
  ready: string;
}

export abstract class RaceScene<R extends RacerBase> implements ShellScene {
  designW = 900;
  designH = 720;
  originX = 0;
  originY = 0;
  racers: R[] = [];
  countdown = 3;
  t = 0;
  started = false;
  ended = false;
  startX = 90;
  trackLen = 1400;
  timeLimit = 90;
  grace = 8;
  protected firstFinishT: number | null = null;
  protected fx = new Particles(300);
  protected texts = new FloatTexts();
  protected time = 0;
  private cams: number[] = [];
  private tile: HTMLCanvasElement | null = null;
  private visW = 900;
  onOver?: (r: ShellResult) => void;

  constructor(protected rt: RaceTexts, protected reducedMotion: boolean) {}

  get finishX() {
    return this.startX + this.trackLen;
  }

  onResize(w: number, h: number) {
    const portrait = h > w * 0.95;
    this.designW = portrait ? 560 : 900;
    this.designH = HUD_H + LANE_H * Math.max(1, this.racers.length);
  }

  /** Move a racer by one fixed step. Called only after the start. */
  protected abstract stepRacer(r: R, dt: number): void;
  /** Draw a racer standing on the ground at (r.x, groundY) in lane space. */
  protected abstract drawRacer(ctx: CanvasRenderingContext2D, r: R, groundY: number): void;
  /** Extra result rows and achievements. */
  protected abstract extraRows(r: R): Array<[string, string | number]>;
  protected achievements(_standings: R[]): string[] {
    return [];
  }
  /** Called during the countdown too (for idle animation). */
  protected idle(_r: R, _dt: number) {}
  /** Optional world layer drawn behind the racers in each lane (lane space). */
  protected drawLaneProps(_ctx: CanvasRenderingContext2D, _lane: number) {}

  abstract control(player: number, action: string, down: boolean): void;

  update(dt: number) {
    this.time += dt;
    if (this.ended) { this.fx.update(dt); this.texts.update(dt); return; }
    if (this.countdown > 0) {
      const before = Math.ceil(this.countdown);
      this.countdown -= dt;
      if (Math.ceil(this.countdown) !== before && this.countdown > 0) sfx('tick');
      if (this.countdown <= 0) { this.started = true; sfx('whistle'); }
      for (const r of this.racers) this.idle(r, dt);
    } else {
      this.t += dt;
      for (const r of this.racers) {
        if (!r.finished) this.stepRacer(r, dt);
        else this.idle(r, dt);
        if (!r.finished && r.x >= this.finishX) {
          r.finished = true;
          r.finishT = this.t;
          if (this.firstFinishT === null) {
            this.firstFinishT = this.t;
            this.texts.add(this.finishX, 60, this.rt.place(1), '#ffe27a', 40, 1.5);
          }
          sfx(r.player >= 0 ? 'fanfare' : 'clap', { gain: r.player >= 0 ? 1 : 0.5 });
          if (!this.reducedMotion) this.fx.burst(this.finishX, 80, 26, { colors: ['#e3127d', '#ffc20e', '#009e96', '#e0333f', '#fff'], shape: 'rect', speed: 360, size: 9, gravity: 500, max: 1.3 });
        }
      }
      const humansDone = this.racers.filter((r) => r.player >= 0).every((r) => r.finished);
      const allDone = this.racers.every((r) => r.finished);
      const graceOver = this.firstFinishT !== null && this.t - this.firstFinishT > this.grace;
      if (allDone || (humansDone && this.racers.some((r) => r.player < 0)) || graceOver || this.t > this.timeLimit) this.finish();
    }
    this.fx.update(dt);
    this.texts.update(dt);
  }

  standings(): R[] {
    return [...this.racers].sort((a, b) => {
      if (a.finishT !== null && b.finishT !== null) return a.finishT - b.finishT;
      if (a.finishT !== null) return -1;
      if (b.finishT !== null) return 1;
      return b.x - a.x;
    });
  }

  protected finish() {
    if (this.ended) return;
    this.ended = true;
    const st = this.standings();
    const humans = this.racers.filter((r) => r.player >= 0);
    const vsAI = this.racers.some((r) => r.player < 0);
    const winner = st[0];
    const p1 = this.racers.find((r) => r.player === 0)!;
    const p1Place = st.indexOf(p1) + 1;
    const outcome = vsAI && humans.length === 1 ? (p1Place === 1 && p1.finished ? 'win' : 'loss') : 'none';
    const rows: Array<[string, string | number]> = [];
    st.forEach((r, i) => {
      rows.push([`${this.rt.place(i + 1)} — ${r.name}`, r.finishT !== null ? this.rt.secs(r.finishT) : this.rt.dnf]);
      if (r.player >= 0) rows.push(...this.extraRows(r));
    });
    this.onOver?.({
      outcome,
      title: winner.finished ? this.rt.won(winner.name) : this.rt.dnf,
      rows,
      score: vsAI && p1.finishT !== null ? Math.round(p1.finishT * 10) / 10 : undefined,
      lowerIsBetter: true,
      achievements: this.achievements(st),
    });
  }

  private buildTile() {
    const W = 600;
    const c = document.createElement('canvas');
    c.width = W * 2;
    c.height = LANE_H * 2;
    const g = c.getContext('2d')!;
    g.scale(2, 2);
    const sky = g.createLinearGradient(0, 0, 0, 80);
    sky.addColorStop(0, '#b9e0f2'); sky.addColorStop(1, '#e9f4ea');
    g.fillStyle = sky; g.fillRect(0, 0, W, 80);
    // Crowd behind a rope fence
    const cols = ['#f2f2ee', '#1f3a8a', '#c0392b', '#f2f2ee', '#127a59', '#f3b61f'];
    for (let x = 8, i = 0; x < W; x += 22, i++) {
      g.fillStyle = cols[(i * 7) % cols.length];
      g.beginPath(); g.ellipse(x, 66, 9, 13, 0, 0, 6.283); g.fill();
      g.fillStyle = '#22160f';
      g.beginPath(); g.arc(x, 49, 7, 0, 6.283); g.fill();
    }
    const fg = g.createLinearGradient(0, 74, 0, LANE_H);
    fg.addColorStop(0, '#93c556'); fg.addColorStop(1, '#6ea23a');
    g.fillStyle = fg; g.fillRect(0, 74, W, LANE_H - 74);
    g.strokeStyle = '#7a5530'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, 78); g.lineTo(W, 78); g.stroke();
    for (let x = 0; x < W; x += 150) { g.fillStyle = '#7a5530'; g.fillRect(x, 66, 4, 18); }
    g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, GROUND_Y + 10); g.lineTo(W, GROUND_Y + 10); g.stroke();
    g.strokeStyle = 'rgba(40, 80, 20, 0.3)'; g.lineWidth = 2;
    for (let x = 11; x < W; x += 41) { const y = 110 + ((x * 13) % 90); g.beginPath(); g.moveTo(x, y); g.lineTo(x - 3, y - 7); g.moveTo(x, y); g.lineTo(x + 3, y - 7); g.stroke(); }
    this.tile = c;
  }

  render(ctx: CanvasRenderingContext2D, v: View) {
    if (!this.tile) this.buildTile();
    const visW = v.right - v.left;
    this.visW = visW;
    ctx.fillStyle = '#5d8a30';
    ctx.fillRect(v.left, v.top, visW, v.bottom - v.top);
    this.drawHud(ctx, v);
    this.racers.forEach((r, i) => {
      const top = HUD_H + i * LANE_H;
      const target = clamp(r.x - visW * 0.38, 0, Math.max(0, this.finishX + 160 - visW));
      if (this.cams[i] === undefined) this.cams[i] = target;
      this.cams[i] += (target - this.cams[i]) * 0.15;
      const cam = this.cams[i];
      ctx.save();
      ctx.beginPath(); ctx.rect(v.left, top, visW, LANE_H); ctx.clip();
      ctx.translate(v.left - cam, top);
      const tileW = 600;
      for (let x = Math.floor(cam / tileW) * tileW; x < cam + visW + tileW; x += tileW) ctx.drawImage(this.tile!, x, 0, tileW, LANE_H);
      // Start and finish
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(this.startX - 4, GROUND_Y - 120, 6, 136);
      for (let k = 0; k < 7; k++) { ctx.fillStyle = k % 2 ? '#222' : '#fff'; ctx.fillRect(this.finishX, GROUND_Y - 150 + k * 24, 10, 24); }
      ctx.fillStyle = '#e0333f';
      ctx.beginPath(); ctx.moveTo(this.finishX + 10, GROUND_Y - 150); ctx.lineTo(this.finishX + 46, GROUND_Y - 138); ctx.lineTo(this.finishX + 10, GROUND_Y - 126); ctx.fill();
      // Distance marks every 200 units
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = `700 12px ${FONT}`;
      ctx.textAlign = 'center';
      for (let d = 200; d < this.trackLen; d += 200) ctx.fillText(this.rt.num(d / 10), this.startX + d, GROUND_Y + 19);
      this.drawLaneProps(ctx, i);
      this.drawRacer(ctx, r, GROUND_Y);
      ctx.restore();
      // Lane label
      ctx.font = `800 18px ${FONT}`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      const label = `${r.name}${r.finishT !== null ? '  ' + this.rt.secs(r.finishT) : ''}`;
      const w = ctx.measureText(label).width + 20;
      ctx.fillStyle = r.color;
      ctx.beginPath(); ctx.roundRect?.(v.left + 8, top + 8, w, 28, 14); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(label, v.left + 18, top + 23);
      if (i > 0) { ctx.fillStyle = '#4d7a28'; ctx.fillRect(v.left, top - 2, visW, 4); }
    });
    // Effects are drawn in lane 0 camera space near the finish only; texts on top.
    ctx.save();
    ctx.translate(v.left - (this.cams[0] ?? 0), HUD_H);
    this.fx.draw(ctx);
    this.texts.draw(ctx, FONT);
    ctx.restore();
    if (this.countdown > 0) {
      ctx.fillStyle = 'rgba(20, 30, 20, 0.35)';
      ctx.fillRect(v.left, v.top, visW, v.bottom - v.top);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `800 110px ${FONT}`;
      ctx.fillText(this.rt.num(Math.ceil(this.countdown)), (v.left + v.right) / 2, this.designH / 2 - 10);
      ctx.font = `700 30px ${FONT}`;
      ctx.fillText(this.rt.ready, (v.left + v.right) / 2, this.designH / 2 + 70);
    }
  }

  private drawHud(ctx: CanvasRenderingContext2D, v: View) {
    const x0 = v.left + 24, x1 = v.right - 90, y = 26;
    ctx.fillStyle = '#24392d';
    ctx.fillRect(v.left, 0, this.visW, HUD_H);
    ctx.strokeStyle = 'rgba(233, 239, 230, 0.5)'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.fillRect(x1 - 2, y - 12, 4, 24);
    for (const r of this.racers) {
      const p = clamp((r.x - this.startX) / this.trackLen, 0, 1);
      ctx.fillStyle = r.color;
      ctx.beginPath(); ctx.arc(x0 + (x1 - x0) * p, y, 10, 0, 6.283); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.fillStyle = '#e9efe6';
    ctx.font = `800 20px ${FONT}`;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(this.rt.secs(this.t), v.right - 12, y);
  }
}

export const RACER_COLORS = ['#c0392b', '#1f4e9c', '#127a59', '#7d3c98'];
