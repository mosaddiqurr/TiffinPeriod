import type { Scene, View } from '../../engine/GameCanvas';
import type { GameProps } from '../../platform/registry';
import { useT, fmtNum, type StringTable } from '../../platform/i18n';
import { sfx, vibrate } from '../../platform/audio';
import { createRng, type Rng } from '../../engine/rng';
import { FloatTexts, Particles } from '../../engine/particles';
import { GameShell, type PadDef, type ShellConfig, type ShellResult, type ShellScene } from '../../components/GameShell';
import { BandWorld, HAND, LEVELS, MAX_PULL, POINTS, ROOM, aiPull, previewPath, type Target } from './model';

const S: StringTable<'title' | 'lede' | 'r1' | 'r2' | 'r3' | 'r4' | 'level' | 'bands' | 'turn' | 'aim' | 'thinking' | 'clear' | 'won' | 'draw' | 'score' | 'guide' | 'on' | 'off' | 'fan' | 'total'> = {
  en: {
    title: 'Rubber Band Shooting', lede: 'A rubber band on your fingers. Paper cups and chalk on the desks. Aim!',
    r1: 'Touch your hand, pull back and let go. Pull further for more power.', r2: 'Knock targets OFF the desk: cup 10, chalk 15, book 20, pencil box 30, paper bird 50.',
    r3: 'You have 5 bands per level. Unused bands give a bonus when the desk is clear.', r4: 'Level 3: the ceiling fan blows your bands down. Aim higher!',
    level: 'Level {n}', bands: 'Bands', turn: '{name}’s turn', aim: 'Pull back from the hand and let go', thinking: 'The computer is aiming…', clear: 'Desk clear! +{n}', won: '{name} wins!', draw: 'A draw!', score: 'Score', guide: 'Aim guide', on: 'On', off: 'Off', fan: 'Fan on!', total: 'Total',
  },
  bn: {
    title: 'রাবার ব্যান্ড শুটিং', lede: 'আঙুলে রাবার ব্যান্ড। বেঞ্চে কাগজের কাপ আর চক। তাক করো!',
    r1: 'হাতে আঙুল রাখো, পেছনে টেনে ছাড়ো। বেশি টানলে বেশি জোর।', r2: 'নিশানা বেঞ্চ থেকে ফেলে দাও: কাপ ১০, চক ১৫, বই ২০, পেন্সিল বক্স ৩০, কাগজের পাখি ৫০।',
    r3: 'প্রতি লেভেলে ৫টা ব্যান্ড। বেঞ্চ খালি করলে বাকি ব্যান্ডের জন্য বোনাস।', r4: 'লেভেল ৩: মাথার উপর ফ্যান চলছে, ব্যান্ড নিচে নামিয়ে দেবে। একটু উঁচুতে তাক করো!',
    level: 'লেভেল {n}', bands: 'ব্যান্ড', turn: '{name}-এর পালা', aim: 'হাত থেকে পেছনে টেনে ছাড়ো', thinking: 'কম্পিউটার তাক করছে…', clear: 'বেঞ্চ খালি! +{n}', won: '{name} জিতেছে!', draw: 'সমান সমান!', score: 'পয়েন্ট', guide: 'তাক করার রেখা', on: 'চালু', off: 'বন্ধ', fan: 'ফ্যান চলছে!', total: 'মোট',
  },
};
type Txt = ReturnType<typeof useT<'level' | 'bands' | 'turn' | 'aim' | 'thinking' | 'clear' | 'won' | 'draw' | 'score' | 'fan' | 'total'>>;
const FONT = '"Baloo Da 2", sans-serif';
const BANDS = 5;

class BandScene implements Scene, ShellScene {
  designW = ROOM.w;
  designH = ROOM.h;
  onOver?: (r: ShellResult) => void;
  private players: Array<{ name: string; ai: boolean; scores: number[] }> = [];
  private level = 0;
  private cur = 0;
  private w: BandWorld;
  private left = BANDS;
  private drag: { x: number; y: number } | null = null;
  private phase: 'aim' | 'flying' | 'between' | 'done' = 'between';
  private phaseT = 0;
  private fx = new Particles(250);
  private texts = new FloatTexts();
  private time = 0;
  private aiShotAt = 0;

  constructor(private cfg: ShellConfig, private tx: Txt, private rng: Rng, private guide: boolean) {
    this.players.push({ name: cfg.names[0], ai: false, scores: [] });
    if (cfg.mode !== 'solo') this.players.push({ name: cfg.names[1], ai: cfg.mode === 'ai', scores: [] });
    this.w = new BandWorld(LEVELS[0]);
    this.phaseT = -0.6;
  }

  private get p() {
    return this.players[this.cur];
  }

  pointerDown(x: number, y: number) {
    if (this.phase !== 'aim' || this.p.ai) return;
    if (Math.hypot(x - HAND.x, y - HAND.y) < 120) this.drag = { x, y };
  }
  pointerMove(x: number, y: number) {
    if (this.drag) { this.drag.x = x; this.drag.y = y; }
  }
  pointerUp(x: number, y: number) {
    if (!this.drag) return;
    this.drag = null;
    this.fire(x - HAND.x, y - HAND.y);
  }
  control() {}

  private fire(px: number, py: number) {
    if (this.left <= 0) return;
    if (this.w.shoot(px, py)) {
      this.left--;
      this.phase = 'flying';
      this.phaseT = 0;
      sfx('boing', { pitch: 1.8, gain: 0.7 });
      vibrate(10);
    }
  }

  update(dt: number) {
    this.time += dt;
    this.fx.update(dt);
    this.texts.update(dt);
    this.phaseT += dt;
    if (this.phase === 'done') return;
    const steps = Math.max(1, Math.round(dt * 120));
    for (let s = 0; s < steps; s++) {
      for (const t of this.w.step()) this.onDown(t);
    }
    if (this.phase === 'between') {
      if (this.phaseT > 1.4) { this.phase = 'aim'; this.phaseT = 0; this.aiShotAt = 0.9 + this.rng.range(0, 0.5); }
      return;
    }
    if (this.phase === 'aim' && this.p.ai && this.phaseT > this.aiShotAt) {
      const [px, py] = aiPull(this.w, this.rng, this.cfg.diff);
      this.fire(px, py);
    }
    if (this.phase === 'flying' && this.phaseT > 0.4 && !this.w.busy) {
      if (this.w.cleared || this.left === 0) this.endTurn();
      else { this.phase = 'aim'; this.phaseT = 0; this.aiShotAt = 0.7 + this.rng.range(0, 0.4); }
    }
  }

  private onDown(t: Target) {
    const p = t.body.position;
    this.texts.add(p.x, p.y - 30, `+${fmtNum(POINTS[t.kind], this.cfg.lang)}`, '#ffe27a', 30);
    sfx(t.kind === 'bird' ? 'popBig' : 'thud', { gain: 0.6, pitch: t.kind === 'cup' ? 1.6 : 1 });
    if (t.kind === 'bird') this.fx.burst(p.x, p.y, 20, { colors: ['#fffdf6', '#e8e1cf'], shape: 'shred', speed: 260, size: 12, gravity: 300, max: 1 });
  }

  private endTurn() {
    let total = this.w.scored;
    if (this.w.cleared && this.left > 0) {
      const bonus = this.left * 10;
      total += bonus;
      this.texts.add(550, 260, this.tx('clear', { n: bonus }), '#ffffff', 36, 1.6);
      sfx('fanfare');
    }
    this.p.scores[this.level] = total;
    // Next player on the same level, or the next level.
    if (this.cur + 1 < this.players.length) this.cur++;
    else { this.cur = 0; this.level++; }
    if (this.level >= LEVELS.length) return this.finish();
    this.w = new BandWorld(LEVELS[this.level]);
    this.left = BANDS;
    this.phase = 'between';
    this.phaseT = 0;
  }

  private finish() {
    this.phase = 'done';
    const tot = this.players.map((p) => p.scores.reduce((a, b) => a + (b ?? 0), 0));
    const n = (v: number) => fmtNum(v, this.cfg.lang);
    const rows: Array<[string, string | number]> = [];
    this.players.forEach((p, i) => {
      rows.push([`${p.name} — ${this.tx('total')}`, tot[i]]);
      p.scores.forEach((s, l) => rows.push([`${p.name} — ${this.tx('level', { n: l + 1 })}`, n(s)]));
    });
    const two = this.players.length > 1;
    const win = two ? (tot[0] === tot[1] ? -1 : tot[0] > tot[1] ? 0 : 1) : 0;
    this.onOver?.({
      outcome: this.cfg.mode === 'ai' ? (win === 0 ? 'win' : win === 1 ? 'loss' : 'tie') : two && win === -1 ? 'tie' : 'none',
      title: !two ? `${this.tx('score')}: ${n(tot[0])}` : win === -1 ? this.tx('draw') : this.tx('won', { name: this.players[win].name }),
      rows,
      score: this.cfg.mode === 'solo' ? tot[0] : undefined,
      achievements: [...(this.players[0].scores.some((s, l) => s >= LEVELS[l].targets.reduce((a, t) => a + POINTS[t.kind], 0)) ? ['rb-clear'] : []), ...(tot[0] >= 250 ? ['rb-sniper'] : [])],
    });
  }

  render(ctx: CanvasRenderingContext2D, v: View) {
    // Classroom wall, blackboard, window, floor
    ctx.fillStyle = '#efe3bf'; ctx.fillRect(v.left, v.top, v.right - v.left, ROOM.floor - v.top);
    ctx.fillStyle = '#b9a27a'; ctx.fillRect(v.left, ROOM.floor - 70, v.right - v.left, 6);
    ctx.fillStyle = '#7a5530'; ctx.fillRect(360, 150, 420, 200);
    ctx.fillStyle = '#24392d'; ctx.fillRect(370, 160, 400, 180);
    ctx.fillStyle = 'rgba(233,239,230,0.85)'; ctx.font = `700 26px ${FONT}`; ctx.textAlign = 'left';
    ctx.fillText('বাড়ির কাজ: অনুশীলনী ৫.২', 392, 200);
    ctx.font = `600 20px ${FONT}`; ctx.fillText('ক্লাসে কথা বলা নিষেধ!', 392, 236);
    ctx.fillStyle = '#9ccbe3'; ctx.fillRect(140, 150, 140, 170); ctx.strokeStyle = '#2f7d55'; ctx.lineWidth = 6; ctx.strokeRect(140, 150, 140, 170);
    for (let i = 1; i < 5; i++) { ctx.fillStyle = '#2f7d55'; ctx.fillRect(140 + i * 28 - 1, 150, 3, 170); }
    ctx.fillStyle = '#8a6a48'; ctx.fillRect(v.left, ROOM.floor, v.right - v.left, v.bottom - ROOM.floor);
    // Ceiling fan
    const fanOn = this.w.fanOn;
    const fa = fanOn ? this.time * 18 : 0.3;
    ctx.fillStyle = '#6b6b6b'; ctx.fillRect(568, Math.max(v.top, 0) - 2, 4, 44);
    ctx.save(); ctx.translate(570, 44); ctx.scale(1, 0.25); ctx.rotate(fa);
    for (let k = 0; k < 3; k++) { ctx.rotate((Math.PI * 2) / 3); ctx.fillStyle = 'rgba(110, 110, 110, 0.9)'; ctx.fillRect(0, -10, 150, 20); }
    ctx.restore();
    ctx.fillStyle = '#555'; ctx.beginPath(); ctx.ellipse(570, 44, 18, 8, 0, 0, 6.283); ctx.fill();
    if (fanOn) {
      ctx.strokeStyle = 'rgba(80, 120, 180, 0.35)'; ctx.lineWidth = 2;
      for (let k = 0; k < 6; k++) { const yy = 80 + ((this.time * 220 + k * 50) % 280); ctx.beginPath(); ctx.moveTo(420 + k * 55, yy); ctx.lineTo(420 + k * 55, yy + 24); ctx.stroke(); }
    }
    // Desks
    for (const d of this.w.level.desks) {
      ctx.fillStyle = '#9a6a3c'; ctx.fillRect(d.x, d.y, d.w, 20);
      ctx.fillStyle = '#7a4a22'; ctx.fillRect(d.x + 8, d.y + 20, 10, ROOM.floor - d.y - 20); ctx.fillRect(d.x + d.w - 18, d.y + 20, 10, ROOM.floor - d.y - 20);
    }
    // Bird string
    if (this.w.bird && this.w.level.bird) { ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(this.w.level.bird.ax, this.w.level.bird.ay); ctx.lineTo(this.w.bird.position.x, this.w.bird.position.y); ctx.stroke(); }
    // Targets
    for (const t of this.w.targets) drawTarget(ctx, t);
    // Bands in flight
    for (const b of this.w.bands) {
      ctx.save(); ctx.translate(b.body.position.x, b.body.position.y); ctx.rotate(b.body.angle);
      ctx.strokeStyle = '#d4a017'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(0, 0, 13, 4, 0, 0, 6.283); ctx.stroke();
      ctx.restore();
    }
    // The hand with a stretched band (thumb and index finger)
    const pull = this.drag ? { x: this.drag.x - HAND.x, y: this.drag.y - HAND.y } : { x: 0, y: 0 };
    const pl = Math.min(MAX_PULL, Math.hypot(pull.x, pull.y));
    const pk = pl > 0 ? pl / Math.hypot(pull.x, pull.y) : 0;
    ctx.fillStyle = '#c98a5c'; ctx.strokeStyle = '#7a4426'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.roundRect?.(HAND.x - 60, HAND.y - 10, 70, 34, 14); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.roundRect?.(HAND.x, HAND.y - 22, 40, 12, 6); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.roundRect?.(HAND.x - 4, HAND.y - 48, 12, 34, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f7f7f2'; ctx.fillRect(HAND.x - 110, HAND.y - 8, 52, 30);
    ctx.strokeStyle = '#d4a017'; ctx.lineWidth = 3;
    const bx = HAND.x + 20 + pull.x * pk * 0.6, by = HAND.y - 30 + pull.y * pk * 0.6;
    ctx.beginPath(); ctx.moveTo(HAND.x + 38, HAND.y - 16); ctx.lineTo(bx, by); ctx.lineTo(HAND.x + 2, HAND.y - 46); ctx.stroke();
    if (this.drag && this.guide && pl > 12) {
      ctx.fillStyle = 'rgba(31, 58, 147, 0.55)';
      for (const [x, y] of previewPath(pull.x * pk, pull.y * pk, 40)) { ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 6.283); ctx.fill(); }
    }
    this.fx.draw(ctx);
    this.texts.draw(ctx, FONT);
    // HUD
    ctx.font = `800 22px ${FONT}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillStyle = '#1f3a93';
    ctx.fillText(`${this.tx('level', { n: this.level + 1 })}  ·  ${this.tx('turn', { name: this.p.name })}`, 20, Math.max(v.top + 26, 26));
    ctx.textAlign = 'right';
    ctx.fillText(`${this.tx('score')} ${fmtNum(this.w.scored, this.cfg.lang)}   ${this.tx('bands')} ${'⊂⊃'.repeat(this.left)}`, ROOM.w - 20, Math.max(v.top + 26, 26));
    ctx.textAlign = 'center'; ctx.font = `600 18px ${FONT}`; ctx.fillStyle = '#5b4636';
    if (this.phase === 'aim') ctx.fillText(this.p.ai ? this.tx('thinking') : this.tx('aim'), 300, ROOM.floor - 90);
    if (this.phase === 'between') {
      ctx.fillStyle = 'rgba(255,253,246,0.95)'; ctx.beginPath(); ctx.roundRect?.(350, 380, 400, 80, 20); ctx.fill();
      ctx.fillStyle = '#1f3a93'; ctx.font = `800 30px ${FONT}`;
      ctx.fillText(`${this.tx('level', { n: this.level + 1 })} — ${this.p.name}`, 550, 410);
      if (this.w.fanOn) { ctx.font = `700 20px ${FONT}`; ctx.fillStyle = '#c62f2f'; ctx.fillText(this.tx('fan'), 550, 442); }
    }
  }
}

function drawTarget(ctx: CanvasRenderingContext2D, t: Target) {
  const b = t.body;
  ctx.save();
  ctx.translate(b.position.x, b.position.y);
  ctx.rotate(b.angle);
  ctx.globalAlpha = t.down ? 0.6 : 1;
  if (t.kind === 'cup') { ctx.fillStyle = '#fffdf6'; ctx.beginPath(); ctx.moveTo(-13, -17); ctx.lineTo(13, -17); ctx.lineTo(10, 17); ctx.lineTo(-10, 17); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#c62f2f'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-12, -8); ctx.lineTo(12, -8); ctx.stroke(); }
  if (t.kind === 'chalk') { ctx.fillStyle = '#ffffff'; ctx.fillRect(-4.5, -21, 9, 42); ctx.fillStyle = 'rgba(0,0,0,0.1)'; ctx.fillRect(-4.5, -21, 3, 42); }
  if (t.kind === 'book') { ctx.fillStyle = '#c8a46a'; ctx.fillRect(-32, -7, 64, 14); ctx.fillStyle = '#fffdf6'; ctx.fillRect(-28, -3, 20, 6); }
  if (t.kind === 'box') { ctx.fillStyle = '#2b7bd8'; ctx.fillRect(-26, -9, 52, 18); ctx.fillStyle = '#ffd23f'; ctx.fillRect(-20, -4, 40, 3); }
  if (t.kind === 'bird') { ctx.fillStyle = '#fffdf6'; ctx.beginPath(); ctx.moveTo(-20, 0); ctx.lineTo(8, -11); ctx.lineTo(20, 0); ctx.lineTo(8, 11); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#999'; ctx.lineWidth = 1; ctx.stroke(); }
  ctx.restore();
}

export default function RubberBand({ onExit }: GameProps) {
  const t = useT(S);
  const pads = (): PadDef[] => [];
  return (
    <GameShell
      gameId="rubber-band" onExit={onExit} title={t('title')} lede={t('lede')}
      rules={[<b key="r1">{t('r1')}</b>, t('r2'), t('r3'), t('r4')]}
      modes={['solo', 'ai', 'local2p']} difficulty={(m) => m === 'ai'}
      options={[{ key: 'guide', label: t('guide'), def: 'on', choices: [{ v: 'on', label: t('on') }, { v: 'off', label: t('off') }] }]}
      createScene={(cfg: ShellConfig) => new BandScene(cfg, t, createRng(), cfg.opts.guide !== 'off')}
      pads={pads}
    />
  );
}
