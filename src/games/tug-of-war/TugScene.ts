import type { Scene, View } from '../../engine/GameCanvas';
import { FloatTexts, Particles } from '../../engine/particles';
import { clamp, damp } from '../../engine/math';
import { drawBunting, drawCrowd, drawField, drawFlag, drawKrishnachura, drawSchool, drawShaheedMinar, drawSky } from '../../shared/scenery';
import { drawKid, LOOKS } from '../../shared/kid';
import { PARAMS, TugAI, TugModel, type InputResult, type Team } from './model';

const GROUND = 610;
const ROPE_Y = 528;
const CENTER = 640;
const FRONT = PARAMS.winDist; // front puller distance from the centre line
const GAP = 84;
const FONT = '"Baloo Da 2", sans-serif';

export interface TugTexts { perfect: string; good: string; slip: string; heave: string; chant: string; num: (n: number) => string }

export type TugEvent =
  | { type: 'input'; team: Team; r: InputResult }
  | { type: 'beat' }
  | { type: 'roundOver'; winner: Team | null };

export class TugScene implements Scene {
  designW = 1120;
  designH = 480;
  originX = 80;
  originY = 175;

  onResize(w: number, h: number) {
    const portrait = h > w * 1.1;
    this.designW = portrait ? 800 : 1120;
    this.originX = portrait ? 240 : 80;
    this.designH = portrait ? 520 : 480;
    this.originY = portrait ? 150 : 175;
  }
  model: TugModel;
  ai: TugAI | null;
  private fx = new Particles(300);
  private texts = new FloatTexts();
  private bg: HTMLCanvasElement | null = null;
  private bgKey = '';
  private time = 0;
  private lean: [number, number] = [0.3, 0.3];
  private beatFlash = 0;
  private endT = 0;
  private announced = false;
  /** Countdown seconds before the round starts. */
  countdown = 3;
  onEvent?: (e: TugEvent) => void;

  constructor(assist: boolean, ai: TugAI | null, private tx: TugTexts, private reducedMotion: boolean) {
    this.model = new TugModel(assist);
    this.ai = ai;
    this.model.onBeat = () => {
      this.beatFlash = 1;
      if (this.countdown <= 0) this.onEvent?.({ type: 'beat' });
    };
  }

  press(team: Team) {
    if (this.countdown > 0 || this.model.over) return;
    const r = this.model.input(team);
    this.feedback(team, r);
  }

  private feedback(team: Team, r: InputResult) {
    if (r.judgement === 'ignored') return;
    const fx = team === 0 ? CENTER - FRONT - GAP + this.model.x : CENTER + FRONT + GAP + this.model.x;
    if (r.slip) this.texts.add(fx, 380, this.tx.slip, '#ffd2c8', 30);
    else if (r.heave) this.texts.add(fx, 360, this.tx.heave, '#ffe27a', 40, 1.1);
    else if (r.judgement === 'perfect') this.texts.add(fx, 380, this.tx.perfect, '#ffffff', 30, 0.7);
    else if (r.judgement === 'good') this.texts.add(fx, 380, this.tx.good, '#e8f6ea', 26, 0.6);
    if (!r.slip && !this.reducedMotion) {
      const footX = team === 0 ? CENTER - FRONT + this.model.x : CENTER + FRONT + this.model.x;
      this.fx.burst(footX, GROUND, 6, { color: '#c7a978', speed: 160, angle: -Math.PI / 2 + (team === 0 ? -0.6 : 0.6), spread: 1, size: 7, gravity: 600, max: 0.5 });
    }
    this.onEvent?.({ type: 'input', team, r });
  }

  update(dt: number) {
    this.time += dt;
    if (this.countdown > 0) {
      this.countdown -= dt;
      return;
    }
    const m = this.model;
    if (!m.over) {
      if (this.ai) {
        const r = this.ai.update(m);
        if (r) this.feedback(1, r);
      }
      m.update(dt);
    } else {
      this.endT += dt;
      if (!this.announced) {
        this.announced = true;
        this.onEvent?.({ type: 'roundOver', winner: m.winner });
        if (m.winner !== null && !this.reducedMotion) {
          const lx = m.winner === 1 ? CENTER - FRONT + m.x : CENTER + FRONT + m.x;
          this.fx.burst(lx, GROUND - 10, 24, { color: '#c7a978', speed: 260, size: 9, gravity: 700, max: 0.9 });
        }
      }
    }
    for (const t of [0, 1] as Team[]) {
      const effort = clamp(m.surge[t], 0, 2);
      this.lean[t] = damp(this.lean[t], 0.28 + effort * 0.18, 10, dt);
    }
    this.beatFlash = Math.max(0, this.beatFlash - dt * 4);
    this.fx.update(dt);
    this.texts.update(dt);
  }

  private background(ctx: CanvasRenderingContext2D, v: View) {
    const key = `${v.cssW}x${v.cssH}@${v.dpr}`;
    if (this.bgKey !== key) {
      this.bgKey = key;
      const c = document.createElement('canvas');
      c.width = Math.ceil(v.cssW * v.dpr);
      c.height = Math.ceil(v.cssH * v.dpr);
      const g = c.getContext('2d')!;
      g.setTransform(v.dpr * v.scale, 0, 0, v.dpr * v.scale, v.dpr * v.ox, v.dpr * v.oy);
      drawSky(g, v.left, v.top, v.right, v.bottom, 380);
      drawSchool(g, 250, 382, 780, 190);
      drawShaheedMinar(g, 140, 392, 0.9);
      drawKrishnachura(g, 1150, 400, 1.1);
      drawField(g, v.left, v.right, 380, v.bottom);
      // Chalk lines: centre line and the two side marks
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.lineWidth = 6;
      g.setLineDash([18, 12]);
      g.beginPath(); g.moveTo(CENTER, 470); g.lineTo(CENTER, v.bottom); g.stroke();
      g.setLineDash([]);
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(255,255,255,0.55)';
      for (const dx of [-FRONT, FRONT]) { g.beginPath(); g.moveTo(CENTER + dx, 560); g.lineTo(CENTER + dx, 660); g.stroke(); }
      this.bg = c;
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.bg!, 0, 0);
    ctx.restore();
  }

  render(ctx: CanvasRenderingContext2D, v: View) {
    this.background(ctx, v);
    const m = this.model;
    const t = this.time;
    drawFlag(ctx, 640, 382, 150, 64, t * 3);
    drawBunting(ctx, v.left - 20, Math.max(v.top + 6, 150), 640, Math.max(v.top + 30, 176), 18, t * 2);
    drawBunting(ctx, 640, Math.max(v.top + 30, 176), v.right + 20, Math.max(v.top + 6, 150), 18, t * 2 + 1);
    drawCrowd(ctx, 250, 1030, 402, m.over && m.winner !== null ? t * 2.5 : t * 0.6);

    const x = m.x;
    const leftEnd = CENTER - FRONT - GAP * 2 - 70 + x;
    const rightEnd = CENTER + FRONT + GAP * 2 + 70 + x;
    // Rope with sag that drops as the tension drops
    const tension = clamp(0.4 + (m.surge[0] + m.surge[1]) * 0.35, 0.4, 1.5);
    const sag = 22 / tension;
    const vib = m.over ? 0 : Math.sin(t * 40) * Math.min(3, Math.abs(m.v) * 0.05);
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#a0773c';
    ctx.lineWidth = 11;
    ctx.beginPath(); ctx.moveTo(leftEnd, ROPE_Y + 6); ctx.quadraticCurveTo(CENTER + x, ROPE_Y + sag + vib, rightEnd, ROPE_Y + 6); ctx.stroke();
    ctx.strokeStyle = '#d8b26e';
    ctx.lineWidth = 3;
    ctx.setLineDash([7, 9]);
    ctx.beginPath(); ctx.moveTo(leftEnd, ROPE_Y + 4); ctx.quadraticCurveTo(CENTER + x, ROPE_Y + sag - 2 + vib, rightEnd, ROPE_Y + 4); ctx.stroke();
    ctx.setLineDash([]);
    // Red cloth on the middle of the rope
    const rx = CENTER + x, ry = ROPE_Y + sag / 2 + 3 + vib / 2;
    ctx.fillStyle = '#d62a2a';
    ctx.beginPath(); ctx.moveTo(rx - 7, ry); ctx.lineTo(rx + 7, ry); ctx.lineTo(rx + 4 + Math.sin(t * 6) * 3, ry + 34); ctx.lineTo(rx - 6 + Math.sin(t * 6) * 3, ry + 30); ctx.closePath(); ctx.fill();

    // Kids: three per team. Front kid is nearest the centre.
    const ropeYAt = (px: number) => {
      const tt = (px - leftEnd) / (rightEnd - leftEnd);
      return (1 - tt) * (1 - tt) * (ROPE_Y + 6) + 2 * (1 - tt) * tt * (ROPE_Y + sag) + tt * tt * (ROPE_Y + 6);
    };
    for (const team of [0, 1] as Team[]) {
      const facing = team === 0 ? 1 : -1;
      const dragged = (team === 0 ? m.v : -m.v) > 8; // being pulled toward the other side
      const won = m.over && m.winner === team;
      const lost = m.over && m.winner !== null && m.winner !== team;
      for (let i = 2; i >= 0; i--) {
        const kx = team === 0 ? CENTER - FRONT - GAP * i + x : CENTER + FRONT + GAP * i + x;
        const look = LOOKS[team * 3 + i];
        if (won) {
          const hop = Math.abs(Math.sin(this.endT * 7 + i)) * 26;
          drawKid(ctx, kx, GROUND, facing as 1 | -1, look, { lean: 0, step: 0, stride: 0, lift: -hop, arms: 'up', mouthOpen: 0.9 });
        } else if (lost) {
          const fall = Math.min(1, this.endT * 2.5);
          drawKid(ctx, kx, GROUND, facing as 1 | -1, look, { lean: -fall * 1.1, step: 0, stride: 0, lift: 0, arms: 'hold', hand: { x: kx + facing * 40, y: GROUND - 60 + fall * 40 }, mouthOpen: 0.6 });
        } else {
          const hand = { x: kx + facing * 34, y: ropeYAt(kx + facing * 34) };
          const step = dragged ? t * 14 + i : 0;
          drawKid(ctx, kx, GROUND, facing as 1 | -1, look, {
            lean: this.lean[team] + (i === 0 ? 0.03 : 0), step, stride: dragged ? 0.5 : 0.08 * Math.sin(t * 2 + i), lift: 0,
            arms: 'hold', hand, mouthOpen: m.surge[team] > 0.5 ? 0.7 : 0.1, cheeks: m.surge[team] > 0.8,
          });
        }
      }
    }

    this.fx.draw(ctx);
    this.texts.draw(ctx, FONT);
    if (this.countdown <= 0 && !m.over) this.drawBeatRings(ctx, v);
    // Distance bar at the top: how close each team is to winning
    this.drawProgress(ctx, v);
    if (this.countdown > 0) {
      const n = Math.ceil(this.countdown);
      ctx.fillStyle = 'rgba(20, 30, 20, 0.35)';
      ctx.fillRect(v.left, v.top, v.right - v.left, v.bottom - v.top);
      ctx.fillStyle = '#fff';
      ctx.font = `800 140px ${FONT}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(this.tx.num(n), 640, 300);
      ctx.font = `700 40px ${FONT}`;
      ctx.fillText(this.tx.chant, 640, 400);
    }
  }

  private drawBeatRings(ctx: CanvasRenderingContext2D, v: View) {
    const m = this.model;
    if (m.assist) return;
    const toNext = m.nextBeat - m.t;
    const p = clamp(toNext / m.interval, 0, 1);
    const top = Math.max(v.top + 90, 120);
    for (const [cx, col] of [[Math.max(v.left + 90, 120), '#c0392b'], [Math.min(v.right - 90, 1160), '#1f4e9c']] as const) {
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(cx, top, 34, 0, 6.283); ctx.fill();
      ctx.beginPath(); ctx.arc(cx, top, 34 + p * 60, 0, 6.283); ctx.stroke();
      const f = this.beatFlash;
      if (f > 0) { ctx.fillStyle = `rgba(255, 226, 122, ${f})`; ctx.beginPath(); ctx.arc(cx, top, 34 + (1 - f) * 20, 0, 6.283); ctx.fill(); }
      ctx.fillStyle = '#fff';
      ctx.font = `800 22px ${FONT}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(this.tx.chant, cx, top + 2);
    }
  }

  private drawProgress(ctx: CanvasRenderingContext2D, v: View) {
    const m = this.model;
    const w = 420, h = 14, x0 = 640 - w / 2, y0 = Math.max(v.top + 14, 18);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.roundRect?.(x0 - 3, y0 - 3, w + 6, h + 6, 10); ctx.fill();
    ctx.fillStyle = '#c0392b'; ctx.fillRect(x0, y0, w / 2, h);
    ctx.fillStyle = '#1f4e9c'; ctx.fillRect(x0 + w / 2, y0, w / 2, h);
    const px = 640 + (m.x / PARAMS.winDist) * (w / 2);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(px, y0 + h / 2, 11, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#d62a2a';
    ctx.beginPath(); ctx.arc(px, y0 + h / 2, 6, 0, 6.283); ctx.fill();
    // Round timer
    const left = Math.max(0, Math.ceil(PARAMS.roundTime - m.t));
    ctx.fillStyle = '#fff';
    ctx.font = `700 20px ${FONT}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(this.tx.num(left), 640, y0 + h + 8);
  }
}
