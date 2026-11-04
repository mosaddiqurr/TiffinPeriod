import Matter from 'matter-js';
import type { Scene, View } from '../../engine/GameCanvas';
import type { GameProps } from '../../platform/registry';
import { useT, fmtNum, type StringTable } from '../../platform/i18n';
import { sfx, vibrate } from '../../platform/audio';
import { createRng, type Rng } from '../../engine/rng';
import { FloatTexts, Particles } from '../../engine/particles';
import { GameShell, type PadDef, type ShellConfig, type ShellResult, type ShellScene } from '../../components/GameShell';
import { BENCH, PEN, PenAI, PenWorld, START, type Flick, type PenPose } from './model';

const S: StringTable<'title' | 'lede' | 'r1' | 'r2' | 'r3' | 'r4' | 'turn' | 'aim' | 'thinking' | 'point' | 'won' | 'score' | 'flicks' | 'target' | 'pts' | 'keys'> = {
  en: {
    title: 'Pen Fight', lede: 'Two pens on the bench. One flick at a time. Push the other pen off!',
    r1: 'On your turn, touch YOUR pen, pull back and let go. The arrow shows the direction and the power.', r2: 'Flick near the end of the pen to spin it. Flick the middle to push it straight.',
    r3: 'If the other pen falls off the bench, you win the point. If your own pen falls, the other player wins the point.', r4: 'The first to the target score wins.',
    turn: '{name}: your turn', aim: 'Touch your pen, pull back, let go', thinking: 'The computer is thinking…', point: 'Point to {name}!', won: '{name} wins the pen fight!', score: 'Score', flicks: 'Flicks', target: 'Points to win', pts: '{n} points', keys: 'Keys: ← → aim, ↑ ↓ grab point, hold Space for power',
  },
  bn: {
    title: 'কলম যুদ্ধ', lede: 'বেঞ্চে দুটো কলম। পালা করে টোকা। অন্যটাকে ফেলে দাও!',
    r1: 'তোমার পালায় নিজের কলমে আঙুল রাখো, পেছনে টেনে ছেড়ে দাও। তীর দেখাবে দিক আর জোর।', r2: 'কলমের মাথার দিকে টোকা দিলে ঘুরবে। মাঝখানে দিলে সোজা যাবে।',
    r3: 'অন্য কলম বেঞ্চ থেকে পড়লে পয়েন্ট তোমার। নিজের কলম পড়লে পয়েন্ট অন্যজনের।', r4: 'যে আগে লক্ষ্য পয়েন্টে পৌঁছাবে, সে জিতবে।',
    turn: '{name}: তোমার পালা', aim: 'কলমে আঙুল রাখো, টেনে ছাড়ো', thinking: 'কম্পিউটার ভাবছে…', point: 'পয়েন্ট {name}-এর!', won: '{name} কলম যুদ্ধে জিতেছে!', score: 'পয়েন্ট', flicks: 'টোকা', target: 'জিততে পয়েন্ট', pts: '{n} পয়েন্ট', keys: 'কী-বোর্ড: ← → দিক, ↑ ↓ টোকার জায়গা, স্পেস চেপে জোর',
  },
};
type Txt = ReturnType<typeof useT<'turn' | 'aim' | 'thinking' | 'point' | 'won' | 'score' | 'flicks'>>;
const FONT = '"Baloo Da 2", sans-serif';
const CAPS = ['#c0392b', '#1f4e9c'];

class PenScene implements Scene, ShellScene {
  designW = 1000;
  designH = 630;
  onOver?: (r: ShellResult) => void;
  private w = new PenWorld(START);
  private turn = 0;
  private phase: 'aim' | 'moving' | 'point' | 'done' = 'aim';
  private phaseT = 0;
  private drag: { t: number; x: number; y: number } | null = null;
  private kb = { dir: 0, t: 0, power: 0, charging: false, used: false };
  private scores = [0, 0];
  private flicks = [0, 0];
  private ai: PenAI | null;
  private aiPlanning = false;
  private fx = new Particles(200);
  private texts = new FloatTexts();
  private fall: Array<{ pose: PenPose; i: number; t: number }> = [];
  private lastHit = 0;
  private target: number;
  private starter = 0;

  constructor(private cfg: ShellConfig, private tx: Txt, rng: Rng) {
    this.ai = cfg.mode === 'ai' ? new PenAI(1, cfg.diff, rng) : null;
    this.target = Number(cfg.opts.target ?? 3);
    this.resetKb();
    onCollide(this.w, () => this.hit());
  }

  private hit() {
    if (this.w.engine.timing.timestamp - this.lastHit < 120) return;
    this.lastHit = this.w.engine.timing.timestamp;
    sfx('click', { pitch: 1.6, gain: 0.8 });
  }

  private resetKb() {
    const me = this.w.pose(this.turn), op = this.w.pose(1 - this.turn);
    this.kb = { dir: Math.atan2(op.y - me.y, op.x - me.x), t: 0.2, power: 0, charging: false, used: false };
  }

  private isHuman(i: number) {
    return !(this.ai && i === 1);
  }

  control(_player: number, action: string, down: boolean) {
    if (this.phase !== 'aim' || !this.isHuman(this.turn)) return;
    if (action === 'left' && down) { this.kb.dir -= 0.08; this.kb.used = true; }
    if (action === 'right' && down) { this.kb.dir += 0.08; this.kb.used = true; }
    if (action === 'up' && down) { this.kb.t = Math.min(0.45, this.kb.t + 0.1); this.kb.used = true; }
    if (action === 'down' && down) { this.kb.t = Math.max(-0.45, this.kb.t - 0.1); this.kb.used = true; }
    if (action === 'power') {
      this.kb.used = true;
      if (down) { this.kb.charging = true; this.kb.power = 0; }
      else if (this.kb.charging) { this.kb.charging = false; this.doFlick({ t: this.kb.t, dir: this.kb.dir, power: Math.max(0.15, this.kb.power) }); }
    }
  }

  pointerDown(x: number, y: number) {
    if (this.phase !== 'aim' || !this.isHuman(this.turn)) return;
    const g = this.w.grabAt(this.turn, x, y);
    if (g !== null) this.drag = { t: g, x, y };
  }
  pointerMove(x: number, y: number) {
    if (this.drag) { this.drag.x = x; this.drag.y = y; }
  }
  pointerUp(x: number, y: number) {
    if (!this.drag) return;
    const f = this.dragFlick(x, y);
    this.drag = null;
    if (f) this.doFlick(f);
  }

  private grabPoint(i: number, t: number) {
    const p = this.w.pose(i);
    return { x: p.x + Math.cos(p.angle) * t * PEN.len, y: p.y + Math.sin(p.angle) * t * PEN.len };
  }

  private dragFlick(x: number, y: number): Flick | null {
    if (!this.drag) return null;
    const g = this.grabPoint(this.turn, this.drag.t);
    const dx = g.x - x, dy = g.y - y;
    const len = Math.hypot(dx, dy);
    if (len < 18) return null;
    return { t: this.drag.t, dir: Math.atan2(dy, dx), power: Math.min(1, len / 170) };
  }

  private doFlick(f: Flick) {
    this.w.flick(this.turn, f);
    this.flicks[this.turn]++;
    this.phase = 'moving';
    this.phaseT = 0;
    sfx('click', { pitch: 0.7 + f.power * 0.6 });
    vibrate(15);
  }

  update(dt: number) {
    this.fx.update(dt);
    this.texts.update(dt);
    this.fall = this.fall.filter((f) => (f.t += dt) < 0.8);
    this.phaseT += dt;
    if (this.phase === 'aim') {
      if (this.kb.charging) this.kb.power = Math.min(1, this.kb.power + dt * 0.9);
      if (!this.isHuman(this.turn) && this.ai) {
        if (!this.aiPlanning && this.phaseT > 0.4) { this.ai.start([this.w.pose(0), this.w.pose(1)]); this.aiPlanning = true; }
        if (this.aiPlanning && this.phaseT > 0.9) {
          const f = this.ai.work(10);
          if (f) { this.aiPlanning = false; this.doFlick(f); }
        }
      }
      return;
    }
    if (this.phase === 'moving') {
      const before = [...this.w.out];
      const steps = Math.round((dt * 1000) / (1000 / 120));
      for (let s = 0; s < Math.max(1, steps); s++) this.w.step();
      this.w.out.forEach((o, i) => {
        if (o && !before[i]) {
          const b = this.w.pens[i];
          this.fall.push({ pose: { x: b.position.x, y: b.position.y, angle: b.angle }, i, t: 0 });
          sfx('thud', { pitch: 1.5 });
        }
      });
      if ((this.phaseT > 0.3 && this.w.settled()) || this.phaseT > 6) this.resolve();
      return;
    }
    if (this.phase === 'point' && this.phaseT > 1.6) {
      if (this.scores.some((s) => s >= this.target)) this.finish();
      else this.newRound();
    }
  }

  private resolve() {
    const me = this.turn, op = 1 - me;
    const [oOut, mOut] = [this.w.out[op], this.w.out[me]];
    let winner: number | null = null;
    if (mOut) winner = op;          // your own pen fell (even if both fell)
    else if (oOut) winner = me;
    if (winner === null) {
      this.turn = op;
      this.phase = 'aim';
      this.phaseT = 0;
      this.resetKb();
      return;
    }
    this.scores[winner]++;
    this.texts.add(500, 300, this.tx('point', { name: this.cfg.names[winner] }), '#ffe27a', 40, 1.6);
    sfx(this.isHuman(winner) ? 'good' : 'bad');
    if (this.isHuman(winner)) this.fx.burst(500, 300, 26, { colors: ['#e3127d', '#ffc20e', '#009e96', '#fff'], shape: 'rect', speed: 340, size: 8, gravity: 300, max: 1.2 });
    this.phase = 'point';
    this.phaseT = 0;
  }

  private newRound() {
    this.w = new PenWorld(START);
    onCollide(this.w, () => this.hit());
    this.starter = 1 - this.starter;
    this.turn = this.starter;
    this.phase = 'aim';
    this.phaseT = 0;
    this.resetKb();
  }

  private finish() {
    this.phase = 'done';
    const w = this.scores[0] > this.scores[1] ? 0 : 1;
    const n = (v: number) => fmtNum(v, this.cfg.lang);
    this.onOver?.({
      outcome: this.cfg.mode === 'ai' ? (w === 0 ? 'win' : 'loss') : 'none',
      title: this.tx('won', { name: this.cfg.names[w] }),
      rows: [
        [this.tx('score'), `${n(this.scores[0])} — ${n(this.scores[1])}`],
        [`${this.cfg.names[0]} — ${this.tx('flicks')}`, this.flicks[0]],
        [`${this.cfg.names[1]} — ${this.tx('flicks')}`, this.flicks[1]],
      ],
      score: this.cfg.mode === 'ai' ? this.scores[0] - this.scores[1] : undefined,
      achievements: [...(this.cfg.mode === 'ai' && w === 0 ? ['pf-win'] : []), ...(this.cfg.mode === 'ai' && w === 0 && this.cfg.diff === 'hard' ? ['pf-hard'] : [])],
    });
  }

  render(ctx: CanvasRenderingContext2D, v: View) {
    // Classroom floor
    ctx.fillStyle = '#5b4636';
    ctx.fillRect(v.left, v.top, v.right - v.left, v.bottom - v.top);
    // Bench top with wood grain and old carvings
    const { x, y, w, h } = BENCH;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x + 8, y + 12, w, h);
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#b98552'); g.addColorStop(1, '#a5713f');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(90, 55, 25, 0.22)'; ctx.lineWidth = 2;
    for (let i = 0; i < 18; i++) { const yy = y + 14 + i * 26; ctx.beginPath(); ctx.moveTo(x, yy); ctx.bezierCurveTo(x + w * 0.3, yy + 8, x + w * 0.6, yy - 8, x + w, yy + 3); ctx.stroke(); }
    ctx.strokeStyle = '#7a4a22'; ctx.lineWidth = 6; ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = 'rgba(70, 40, 15, 0.35)'; ctx.font = `700 30px ${FONT}`; ctx.textAlign = 'center';
    ctx.fillText('রাফি + মিতু', x + w * 0.78, y + h * 0.86);
    ctx.beginPath(); ctx.arc(x + w * 0.15, y + h * 0.18, 26, 0, 6.283); ctx.strokeStyle = 'rgba(70, 40, 15, 0.3)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = 'rgba(31, 58, 147, 0.25)'; ctx.beginPath(); ctx.ellipse(x + w * 0.5, y + h * 0.15, 22, 12, 0.4, 0, 6.283); ctx.fill();
    // Pens
    this.w.pens.forEach((b, i) => { if (!this.w.out[i]) drawPen(ctx, b.position.x, b.position.y, b.angle, CAPS[i], 1); });
    for (const f of this.fall) drawPen(ctx, f.pose.x, f.pose.y, f.pose.angle + f.t * 3, CAPS[f.i], 1 - f.t);
    // Aim arrow
    if (this.phase === 'aim' && this.isHuman(this.turn)) {
      let flick: Flick | null = null;
      if (this.drag) flick = this.dragFlick(this.drag.x, this.drag.y);
      else if (this.kb.used) flick = { t: this.kb.t, dir: this.kb.dir, power: this.kb.charging ? this.kb.power : 0.3 };
      const gp = this.grabPoint(this.turn, this.drag?.t ?? this.kb.t);
      ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(gp.x, gp.y, 7, 0, 6.283); ctx.fill();
      if (flick) {
        const L = 40 + flick.power * 150;
        const ex = gp.x + Math.cos(flick.dir) * L, ey = gp.y + Math.sin(flick.dir) * L;
        ctx.strokeStyle = `rgba(255, ${Math.round(230 - flick.power * 180)}, 60, 0.95)`; ctx.lineWidth = 6; ctx.lineCap = 'round';
        ctx.setLineDash([10, 8]); ctx.beginPath(); ctx.moveTo(gp.x, gp.y); ctx.lineTo(ex, ey); ctx.stroke(); ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex - Math.cos(flick.dir - 0.4) * 18, ey - Math.sin(flick.dir - 0.4) * 18); ctx.lineTo(ex - Math.cos(flick.dir + 0.4) * 18, ey - Math.sin(flick.dir + 0.4) * 18); ctx.closePath(); ctx.fillStyle = ctx.strokeStyle; ctx.fill();
      }
    }
    this.fx.draw(ctx);
    this.texts.draw(ctx, FONT);
    // HUD
    ctx.textBaseline = 'middle';
    for (const i of [0, 1]) {
      const label = `${this.cfg.names[i]}  ${fmtNum(this.scores[i], this.cfg.lang)}`;
      ctx.font = `800 22px ${FONT}`;
      const tw = ctx.measureText(label).width + 26;
      const hx = i === 0 ? BENCH.x : BENCH.x + BENCH.w - tw;
      ctx.fillStyle = CAPS[i]; ctx.beginPath(); ctx.roundRect?.(hx, 22, tw, 38, 19); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText(label, hx + 13, 42);
    }
    const msg = this.phase === 'aim' ? (this.isHuman(this.turn) ? this.tx('turn', { name: this.cfg.names[this.turn] }) : this.tx('thinking')) : '';
    if (msg) {
      ctx.font = `700 20px ${FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = '#fff6df';
      ctx.fillText(msg, 500, 42);
      if (this.isHuman(this.turn)) { ctx.font = `600 16px ${FONT}`; ctx.fillText(this.tx('aim'), 500, BENCH.y + BENCH.h + 40); }
    }
  }
}

/** Click sound when the pens touch. */
function onCollide(w: PenWorld, fn: () => void) {
  Matter.Events.on(w.engine, 'collisionStart', fn);
}

function drawPen(ctx: CanvasRenderingContext2D, x: number, y: number, a: number, cap: string, alpha: number) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, alpha);
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.scale(alpha < 1 ? 0.6 + alpha * 0.4 : 1, alpha < 1 ? 0.6 + alpha * 0.4 : 1);
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.roundRect?.(-PEN.len / 2 + 4, -PEN.wid / 2 + 6, PEN.len, PEN.wid, 7); ctx.fill();
  const g = ctx.createLinearGradient(0, -PEN.wid / 2, 0, PEN.wid / 2);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#e9ecef'); g.addColorStop(1, '#c9ced3');
  ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect?.(-PEN.len / 2, -PEN.wid / 2, PEN.len - 26, PEN.wid, 6); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-PEN.len / 2 + 6, 0); ctx.lineTo(PEN.len / 2 - 32, 0); ctx.stroke();
  ctx.fillStyle = cap; ctx.beginPath(); ctx.roundRect?.(PEN.len / 2 - 44, -PEN.wid / 2 - 1, 44, PEN.wid + 2, 7); ctx.fill();
  ctx.fillRect(PEN.len / 2 - 40, -PEN.wid / 2 - 5, 30, 4);
  ctx.fillStyle = cap; ctx.beginPath(); ctx.arc(-PEN.len / 2 + 3, 0, 4, 0, 6.283); ctx.fill();
  ctx.restore();
}

export default function PenFight({ onExit }: GameProps) {
  const t = useT(S);
  const pads = (): PadDef[] => [
    { player: 0, action: 'left', label: '←', area: 'bl', hidden: true, keys: ['ArrowLeft', 'KeyA'] },
    { player: 0, action: 'right', label: '→', area: 'bl', hidden: true, keys: ['ArrowRight', 'KeyD'] },
    { player: 0, action: 'up', label: '↑', area: 'bl', hidden: true, keys: ['ArrowUp', 'KeyW'] },
    { player: 0, action: 'down', label: '↓', area: 'bl', hidden: true, keys: ['ArrowDown', 'KeyS'] },
    { player: 0, action: 'power', label: 'Space', area: 'bl', hidden: true, keys: ['Space'] },
  ];
  return (
    <GameShell
      gameId="pen-fight" onExit={onExit} title={t('title')} lede={t('lede')}
      rules={[<b key="r1">{t('r1')}</b>, t('r2'), t('r3'), t('r4')]}
      modes={['ai', 'local2p']} difficulty={(m) => m === 'ai'}
      options={[{ key: 'target', label: t('target'), def: 3, choices: [3, 5].map((v) => ({ v, label: t('pts', { n: v }) })) }]}
      hint={t('keys')}
      createScene={(cfg: ShellConfig) => new PenScene(cfg, t, createRng())}
      pads={pads}
      preferLandscape
    />
  );
}
