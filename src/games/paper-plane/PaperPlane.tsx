import type { Scene, View } from '../../engine/GameCanvas';
import type { GameProps } from '../../platform/registry';
import { useT, fmtNum, type StringTable } from '../../platform/i18n';
import { sfx, vibrate } from '../../platform/audio';
import { createRng, type Rng } from '../../engine/rng';
import { FloatTexts, Particles } from '../../engine/particles';
import { clamp } from '../../engine/math';
import { GameShell, type PadDef, type ShellConfig, type ShellResult, type ShellScene } from '../../components/GameShell';
import { PlaneAI, TYPES, WORLD, launch, makeCourse, stepPlane, throwScore, type Course, type HitKind, type Plane } from './model';

const S: StringTable<'title' | 'lede' | 'r1' | 'r2' | 'r3' | 'r4' | 'fold' | 'glider' | 'dart' | 'up' | 'upSub' | 'turn' | 'throwN' | 'best' | 'wind' | 'aim' | 'ring' | 'landed' | 'crash' | 'finish' | 'won' | 'draw' | 'score' | 'keys'> = {
  en: {
    title: 'Paper Airplane', lede: 'Fold a khata page. Throw it from the roof. How far will it fly?',
    r1: 'On the roof, pull back from the plane and let go to throw. Pull further for a faster throw.', r2: 'In the air, hold ▲ to raise the nose. Too much and the plane stalls and drops.',
    r3: 'Fly through rings (+50). Warm rooftops lift you. Wires, water tanks and kites end the flight.', r4: 'Three throws each. Your best throw counts. A soft landing on a roof gives +100.',
    fold: 'Plane fold', glider: 'Glider (wide wings)', dart: 'Dart (fast)', up: '▲', upSub: 'throw / nose up', turn: '{name}’s throw', throwN: 'Throw {n}/3', best: 'Best', wind: 'Wind',
    aim: 'Pull back from the plane and let go', ring: 'Ring! +50', landed: 'Landed on a roof! +100', crash: 'Crash!', finish: 'Over the whole para! +100', won: '{name} wins!', draw: 'A draw!', score: 'Score', keys: 'Keys: ← → angle, hold Space to throw, then Space for nose up',
  },
  bn: {
    title: 'কাগজের উড়োজাহাজ', lede: 'খাতার পাতা ভাঁজ করো। ছাদ থেকে ছুড়ে দাও। কতদূর যায়?',
    r1: 'ছাদে উড়োজাহাজ থেকে পেছনে টেনে ছেড়ে দাও। বেশি টানলে বেশি জোরে যাবে।', r2: 'আকাশে ▲ চেপে ধরলে নাক উঁচু হবে। বেশি উঁচু করলে থেমে পড়ে যাবে।',
    r3: 'বৃত্তের ভেতর দিয়ে গেলে +৫০। গরম ছাদের উপর বাতাস তুলে দেয়। তার, পানির ট্যাংক আর ঘুড়িতে লাগলে শেষ।', r4: 'প্রত্যেকে তিনবার ছুড়বে। সেরাটা গুনবে। ছাদে আস্তে নামলে +১০০।',
    fold: 'ভাঁজের ধরন', glider: 'গ্লাইডার (চওড়া ডানা)', dart: 'ডার্ট (দ্রুত)', up: '▲', upSub: 'ছোড়ো / নাক উঁচু', turn: '{name}-এর পালা', throwN: 'ছোড়া {n}/৩', best: 'সেরা', wind: 'বাতাস',
    aim: 'উড়োজাহাজ থেকে পেছনে টেনে ছাড়ো', ring: 'বৃত্ত! +৫০', landed: 'ছাদে নামলো! +১০০', crash: 'ধাক্কা!', finish: 'পুরো পাড়া পার! +১০০', won: '{name} জিতেছে!', draw: 'সমান সমান!', score: 'পয়েন্ট', keys: 'কী-বোর্ড: ← → কোণ, স্পেস চেপে ছোড়ো, তারপর স্পেসে নাক উঁচু',
  },
};
type Txt = ReturnType<typeof useT<'turn' | 'throwN' | 'best' | 'wind' | 'aim' | 'ring' | 'landed' | 'crash' | 'finish' | 'won' | 'draw' | 'score'>>;
const FONT = '"Baloo Da 2", sans-serif';

interface Thrower { name: string; ai: PlaneAI | null; best: number; throws: number[] }

class PlaneScene implements Scene, ShellScene {
  designW = 1000;
  designH = 760;
  originX = 0;
  originY = 0;
  onOver?: (r: ShellResult) => void;

  /** Portrait phones see a narrower, taller slice of the sky; the camera follows the plane. */
  onResize(w: number, h: number) {
    const portrait = h > w;
    this.designW = portrait ? 520 : 1000;
    this.designH = portrait ? 640 : 760;
    this.originY = portrait ? 120 : 0;
  }
  private course: Course;
  private plane: Plane | null = null;
  private throwers: Thrower[] = [];
  private cur = 0;
  private round = 0;
  private phase: 'aim' | 'fly' | 'after' | 'done' = 'aim';
  private phaseT = 0;
  private windBase = 0;
  private drag: { x: number; y: number } | null = null;
  private kb = { angle: 0.25, power: 0, charging: false };
  private camX = 0;
  private fx = new Particles(200);
  private texts = new FloatTexts();
  private time = 0;
  private trail: Array<[number, number]> = [];
  private type;

  constructor(private cfg: ShellConfig, private tx: Txt, private rng: Rng) {
    this.course = makeCourse(rng);
    this.type = TYPES[cfg.opts.fold === 'dart' ? 'dart' : 'glider'];
    this.throwers.push({ name: cfg.names[0], ai: null, best: 0, throws: [] });
    if (cfg.mode !== 'solo') this.throwers.push({ name: cfg.names[1], ai: cfg.mode === 'ai' ? new PlaneAI(rng, cfg.diff === 'easy' ? 0.55 : cfg.diff === 'medium' ? 0.75 : 0.92) : null, best: 0, throws: [] });
    this.newThrow();
  }

  private get th() {
    return this.throwers[this.cur];
  }

  private newThrow() {
    this.windBase = Math.round(this.rng.range(-25, 45));
    this.course.rings.forEach((r) => (r.taken = false));
    this.plane = null;
    this.trail = [];
    this.phase = 'aim';
    this.phaseT = 0;
    this.kb = { angle: 0.25, power: 0, charging: false };
  }

  control(_p: number, action: string, down: boolean) {
    if (this.th.ai) return;
    if (this.phase === 'aim') {
      if (action === 'left' && down) this.kb.angle = clamp(this.kb.angle + 0.05, -0.3, 1);
      if (action === 'right' && down) this.kb.angle = clamp(this.kb.angle - 0.05, -0.3, 1);
      if (action === 'up') {
        if (down) { this.kb.charging = true; this.kb.power = 0; }
        else if (this.kb.charging) { this.kb.charging = false; this.throwPlane(this.kb.angle, Math.max(0.2, this.kb.power)); }
      }
    } else if (this.phase === 'fly' && this.plane && action === 'up') this.plane.up = down;
  }

  pointerDown(x: number, y: number) {
    if (this.phase !== 'aim' || this.th.ai) return;
    if (Math.hypot(x + this.camX - WORLD.startX, y - WORLD.startY) < 140) this.drag = { x, y };
  }
  pointerMove(x: number, y: number) {
    if (this.drag) this.drag = { x, y };
  }
  pointerUp() {
    if (!this.drag) return;
    const a = this.dragAim();
    this.drag = null;
    if (a) this.throwPlane(a.angle, a.power);
  }

  private dragAim() {
    if (!this.drag) return null;
    const dx = WORLD.startX - (this.drag.x + this.camX), dy = WORLD.startY - this.drag.y;
    const len = Math.hypot(dx, dy);
    if (len < 15) return null;
    return { angle: clamp(Math.atan2(-dy, dx), -0.3, 1), power: Math.min(1, len / 160) };
  }

  private throwPlane(angle: number, power: number) {
    this.plane = launch(angle, power);
    this.phase = 'fly';
    this.phaseT = 0;
    sfx('whoosh');
    vibrate(10);
  }

  update(dt: number) {
    this.time += dt;
    this.phaseT += dt;
    this.fx.update(dt);
    this.texts.update(dt);
    if (this.kb.charging) this.kb.power = Math.min(1, this.kb.power + dt * 0.8);
    if (this.phase === 'aim' && this.th.ai && this.phaseT > 1.2) {
      const lp = this.th.ai.launchParams();
      this.throwPlane(lp.angle, lp.power);
    }
    const p = this.plane;
    if (this.phase === 'fly' && p) {
      if (this.th.ai) this.th.ai.control(p, this.course);
      const r = stepPlane(p, this.type, this.windBase, this.course, dt);
      if (Math.floor(p.t * 20) !== Math.floor((p.t - dt) * 20)) this.trail.push([p.x, p.y]);
      if (this.trail.length > 60) this.trail.shift();
      if (r.ring) { this.texts.add(p.x, p.y - 30, this.tx('ring'), '#ffe27a', 30); sfx('good', { pitch: 1.3 }); }
      if (r.hit) this.endFlight(r.hit);
    }
    const lead = this.designW * 0.33;
    if (p) this.camX += (clamp(p.x - lead, 0, WORLD.len - 600) - this.camX) * Math.min(1, dt * 5);
    else this.camX += (0 - this.camX) * Math.min(1, dt * 4);
    if (this.phase === 'after' && this.phaseT > 2) this.nextTurn();
  }

  private endFlight(hit: NonNullable<HitKind>) {
    const p = this.plane!;
    const s = throwScore(p);
    this.th.throws.push(s);
    this.th.best = Math.max(this.th.best, s);
    if (hit === 'land') { this.texts.add(p.x, p.y - 40, this.tx('landed'), '#ffffff', 30, 1.6); sfx('fanfare'); }
    else if (hit === 'finish') { this.texts.add(p.x - 200, 300, this.tx('finish'), '#ffffff', 34, 1.8); sfx('fanfare'); }
    else { this.texts.add(p.x, p.y - 40, this.tx('crash'), '#ffd2c8', 30); sfx('thud'); this.fx.burst(p.x, p.y, 12, { colors: ['#fffdf6', '#c2d3e4'], shape: 'shred', speed: 200, size: 8, gravity: 400, max: 0.9 }); }
    this.texts.add(p.x, p.y - 80, `${fmtNum(s, this.cfg.lang)}`, '#ffe27a', 40, 1.8);
    this.phase = 'after';
    this.phaseT = 0;
  }

  private nextTurn() {
    if (this.cur + 1 < this.throwers.length) this.cur++;
    else { this.cur = 0; this.round++; }
    if (this.round >= 3) return this.finish();
    this.newThrow();
  }

  private finish() {
    this.phase = 'done';
    const t = this.throwers;
    const two = t.length > 1;
    const win = two ? (t[0].best === t[1].best ? -1 : t[0].best > t[1].best ? 0 : 1) : 0;
    const rows: Array<[string, string | number]> = [];
    for (const th of t) {
      rows.push([`${th.name} — ${this.tx('best')}`, th.best]);
      rows.push([`${th.name}`, th.throws.map((s) => fmtNum(s, this.cfg.lang)).join(' · ')]);
    }
    this.onOver?.({
      outcome: this.cfg.mode === 'ai' ? (win === 0 ? 'win' : win === 1 ? 'loss' : 'tie') : two && win === -1 ? 'tie' : 'none',
      title: !two ? `${this.tx('best')}: ${fmtNum(t[0].best, this.cfg.lang)}` : win === -1 ? this.tx('draw') : this.tx('won', { name: t[win].name }),
      rows,
      score: t[0].best,
      achievements: [...(t[0].best >= 400 ? ['pp-far'] : []), ...(t[0].best >= 600 ? ['pp-ace'] : [])],
    });
  }

  render(ctx: CanvasRenderingContext2D, v: View) {
    const cam = this.camX;
    // Afternoon sky
    const g = ctx.createLinearGradient(0, v.top, 0, WORLD.ground);
    g.addColorStop(0, '#8fc9ea'); g.addColorStop(0.75, '#f9e2b0'); g.addColorStop(1, '#f4c98a');
    ctx.fillStyle = g; ctx.fillRect(v.left, v.top, v.right - v.left, WORLD.ground - v.top);
    ctx.fillStyle = 'rgba(255, 236, 170, 0.9)'; ctx.beginPath(); ctx.arc(820 - cam * 0.05, 150, 46, 0, 6.283); ctx.fill();
    // Far skyline (parallax)
    ctx.fillStyle = 'rgba(120, 130, 150, 0.35)';
    for (let i = -2; i < 30; i++) { const bx = i * 140 - (cam * 0.35) % 140; const h = 120 + ((i * 53 + Math.floor(cam * 0.35 / 140) * 53) % 90); ctx.fillRect(bx, WORLD.ground - 140 - h, 120, h + 140); }
    ctx.save();
    ctx.translate(-cam, 0);
    // Thermal shimmer
    for (const th of this.course.thermals) {
      ctx.fillStyle = 'rgba(255, 200, 120, 0.06)';
      ctx.fillRect(th.x - th.w, 150, th.w * 2, WORLD.ground - 150);
      ctx.strokeStyle = 'rgba(255, 170, 80, 0.25)'; ctx.lineWidth = 2;
      for (let k = 0; k < 3; k++) { const yy = WORLD.ground - ((this.time * 90 + k * 150) % 500); ctx.beginPath(); ctx.moveTo(th.x - 20 + k * 20, yy); ctx.quadraticCurveTo(th.x + k * 20, yy - 20, th.x - 20 + k * 20, yy - 40); ctx.stroke(); }
    }
    // Buildings
    for (const b of this.course.buildings) {
      if (b.x > cam + v.right + 50 || b.x + b.w < cam + v.left - 50) continue;
      drawBuilding(ctx, b.x, b.w, b.top, b.color, b.tank);
    }
    // Wires and poles
    for (const w of this.course.wires) {
      ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 1.6;
      for (const off of [0, 6]) { ctx.beginPath(); for (let k = 0; k <= 20; k++) { const t = k / 20; const x = w.x1 + (w.x2 - w.x1) * t; const y = w.y1 + (w.y2 - w.y1) * t + Math.sin(t * Math.PI) * 18 + off; k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke(); }
    }
    // Rings
    for (const r of this.course.rings) {
      ctx.strokeStyle = r.taken ? 'rgba(255, 210, 60, 0.3)' : '#f3b61f'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.ellipse(r.x, r.y, 14, 40, 0, 0, 6.283); ctx.stroke();
    }
    // Kites
    for (const k of this.course.kites) {
      const kx = k.x + Math.sin(this.time + k.phase) * 10, ky = k.y + Math.cos(this.time * 1.3 + k.phase) * 6;
      ctx.strokeStyle = 'rgba(60,60,60,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(kx, ky + 16); ctx.lineTo(kx - 200, WORLD.ground - 200); ctx.stroke();
      ctx.fillStyle = k.color; ctx.beginPath(); ctx.moveTo(kx, ky - 18); ctx.lineTo(kx + 14, ky); ctx.lineTo(kx, ky + 18); ctx.lineTo(kx - 14, ky); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(kx, ky - 18); ctx.lineTo(kx, ky + 18); ctx.moveTo(kx - 14, ky); ctx.lineTo(kx + 14, ky); ctx.stroke();
    }
    // Ground: street
    ctx.fillStyle = '#7d7d7d'; ctx.fillRect(cam + v.left, WORLD.ground, v.right - v.left, v.bottom - WORLD.ground);
    ctx.fillStyle = '#f2f2f2'; for (let x = Math.floor((cam + v.left) / 120) * 120; x < cam + v.right; x += 120) ctx.fillRect(x, WORLD.ground + 26, 60, 5);
    // Finish
    ctx.fillStyle = '#e0333f'; ctx.fillRect(WORLD.len, 200, 8, WORLD.ground - 200);
    // Trail and plane
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2; ctx.setLineDash([4, 6]);
    ctx.beginPath(); this.trail.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); ctx.setLineDash([]);
    const p = this.plane;
    if (p) drawPlane(ctx, p.x, p.y, p.pitch, p.stalled);
    else {
      const aim = this.dragAim() ?? (this.kb.charging || !this.th.ai ? { angle: this.kb.angle, power: this.kb.charging ? this.kb.power : 0.5 } : null);
      drawPlane(ctx, WORLD.startX, WORLD.startY, aim?.angle ?? 0.2, false);
      if (aim && this.phase === 'aim' && !this.th.ai) {
        const pr = launch(aim.angle, aim.power);
        ctx.fillStyle = 'rgba(31, 58, 147, 0.6)';
        for (let i = 0; i < 90; i++) { stepPlane(pr, this.type, this.windBase, { buildings: [], wires: [], rings: [], thermals: [], kites: [] }, 1 / 60); if (i % 6 === 0) { ctx.beginPath(); ctx.arc(pr.x, pr.y, 3, 0, 6.283); ctx.fill(); } }
      }
    }
    // Wind flag on the start roof
    ctx.fillStyle = '#7a7a7a'; ctx.fillRect(40, 300, 4, 120);
    ctx.fillStyle = '#006a4e'; const fl = clamp(this.windBase / 45, -1, 1) * 40;
    ctx.beginPath(); ctx.moveTo(44, 302); ctx.lineTo(44 + fl, 312 + Math.sin(this.time * 6) * 3); ctx.lineTo(44, 324); ctx.fill();
    this.fx.draw(ctx);
    this.texts.draw(ctx, FONT);
    ctx.restore();
    // HUD
    ctx.font = `800 22px ${FONT}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillStyle = '#1f3a93';
    ctx.fillText(`${this.tx('turn', { name: this.th.name })} · ${this.tx('throwN', { n: this.round + 1 })}`, v.left + 16, v.top + 26);
    ctx.textAlign = 'right';
    const w = this.windBase;
    ctx.fillText(`${this.tx('wind')} ${w >= 0 ? '→' : '←'} ${fmtNum(Math.abs(w), this.cfg.lang)}   ${this.tx('best')} ${this.throwers.map((t) => fmtNum(t.best, this.cfg.lang)).join(' / ')}`, v.right - 16, v.top + 26);
    if (p && this.phase === 'fly') { ctx.textAlign = 'center'; ctx.fillText(`${fmtNum(throwScore(p), this.cfg.lang)}`, (v.left + v.right) / 2, v.top + 60); }
    if (this.phase === 'aim' && !this.th.ai) { ctx.textAlign = 'center'; ctx.font = `700 18px ${FONT}`; ctx.fillStyle = '#5b4636'; ctx.fillText(this.tx('aim'), WORLD.startX + 260 - cam, WORLD.startY - 120); }
  }
}

function drawBuilding(ctx: CanvasRenderingContext2D, x: number, w: number, top: number, color: string, tank?: number) {
  ctx.fillStyle = color; ctx.fillRect(x, top, w, WORLD.ground - top);
  ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fillRect(x + w - 10, top, 10, WORLD.ground - top);
  ctx.fillStyle = '#d9d2c3'; ctx.fillRect(x - 4, top - 10, w + 8, 12);
  for (let y = top + 24; y < WORLD.ground - 30; y += 56) {
    for (let wx = x + 16; wx < x + w - 30; wx += 46) {
      ctx.fillStyle = '#2f7d55'; ctx.fillRect(wx, y, 26, 30);
      ctx.fillStyle = 'rgba(200, 230, 255, 0.6)'; ctx.fillRect(wx + 3, y + 3, 20, 24);
    }
    ctx.strokeStyle = 'rgba(80,80,80,0.6)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x + 6, y + 40); ctx.lineTo(x + w - 6, y + 40); ctx.stroke();
    const cols = ['#e3127d', '#ffc20e', '#009e96', '#fff'];
    for (let k = 0; k < 3; k++) { ctx.fillStyle = cols[(k + Math.floor(y)) % 4]; ctx.fillRect(x + 20 + k * 40, y + 40, 18, 14); }
  }
  if (tank !== undefined) {
    const tx = x + tank;
    ctx.fillStyle = '#1d1d1d'; ctx.beginPath(); ctx.roundRect?.(tx, top - 46, 44, 46, 6); ctx.fill();
    ctx.strokeStyle = '#3c3c3c'; ctx.lineWidth = 2; for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.moveTo(tx, top - 46 + k * 11); ctx.lineTo(tx + 44, top - 46 + k * 11); ctx.stroke(); }
    ctx.fillStyle = '#2b2b2b'; ctx.fillRect(tx + 14, top - 52, 16, 6);
  }
}

function drawPlane(ctx: CanvasRenderingContext2D, x: number, y: number, pitch: number, stalled: boolean) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-pitch);
  ctx.fillStyle = '#fffdf6';
  ctx.strokeStyle = '#9aa0a6'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(26, 0); ctx.lineTo(-22, -12); ctx.lineTo(-14, 0); ctx.lineTo(-22, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(31, 58, 147, 0.45)'; ctx.lineWidth = 1;
  for (const k of [-6, -2]) { ctx.beginPath(); ctx.moveTo(-18, k); ctx.lineTo(14, k * 0.4); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(198, 47, 47, 0.5)'; ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(26, 0); ctx.stroke();
  ctx.restore();
  if (stalled) { ctx.fillStyle = '#c62f2f'; ctx.font = `800 16px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('!', x, y - 22); }
}

export default function PaperPlane({ onExit }: GameProps) {
  const t = useT(S);
  const pads = (): PadDef[] => [
    { player: 0, action: 'up', label: t('up'), sub: t('upSub'), area: 'br', size: 'l', color: 'rgba(31,58,147,0.85)', keys: ['Space', 'ArrowUp', 'KeyW'], keyHint: 'Space' },
    { player: 0, action: 'left', label: '←', area: 'bl', hidden: true, keys: ['ArrowLeft', 'KeyA'] },
    { player: 0, action: 'right', label: '→', area: 'bl', hidden: true, keys: ['ArrowRight', 'KeyD'] },
  ];
  return (
    <GameShell
      gameId="paper-plane" onExit={onExit} title={t('title')} lede={t('lede')}
      rules={[t('r1'), <b key="r2">{t('r2')}</b>, t('r3'), t('r4')]}
      modes={['solo', 'ai', 'local2p']} difficulty={(m) => m === 'ai'}
      options={[{ key: 'fold', label: t('fold'), def: 'glider', choices: [{ v: 'glider', label: t('glider') }, { v: 'dart', label: t('dart') }] }]}
      hint={t('keys')}
      createScene={(cfg: ShellConfig) => new PlaneScene(cfg, t, createRng())}
      pads={pads}
    />
  );
}
