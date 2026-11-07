import type { Scene, View } from '../../engine/GameCanvas';
import type { Rng } from '../../engine/rng';
import { sfx, vibrate } from '../../platform/audio';
import { getTeam } from '../../shared/teams';
import { HUMAN_DIVE, KEEPER_HOME, KeeperAI, aiKick, diveTo, flightTime, judge, strike, type Outcome, type Shot } from './model';

// One penalty kick at a time, seen from behind the ball.

export interface KickPlan {
  /** Team ids: the kicker's team and the keeper's team. */
  kicker: string;
  keeper: string;
  humanKicks: boolean;
  humanKeeps: boolean;
  /** Two players: the keeper chose this before the kick, in secret. */
  secretDive?: { x: number; y: number };
  skill: number;
  pressure: number;
  keeperAI: KeeperAI;
  /** Online: this device only chooses (the shot or the dive) and hands it over; the kick is played later with `replay`. */
  online?: { role: 'shoot' | 'keep'; onShot?: (s: Shot) => void; onDive?: (d: { x: number; y: number }) => void };
}

export interface KickResult { outcome: Outcome; shot: Shot; keeper: { x: number; y: number } }
export type Phase = 'aim' | 'power' | 'runup' | 'flight' | 'done' | 'idle' | 'guess' | 'locked';

const GX = (x: number) => 300 + x * 190;
const GY = (y: number) => 330 - y * 125;
const BALL0 = { x: 300, y: 760, r: 26 };

export class PenaltyScene implements Scene {
  designW = 600;
  designH = 860;
  private phase: Phase = 'idle';
  private plan: KickPlan | null = null;
  private aim = { x: 0, y: 0.5 };
  private aiming = false;
  private meter = 0;
  private meterT = 0;
  private t = 0;
  private time = 0;
  private shot: Shot | null = null;
  private flight = 0.7;
  private kp = { ...KEEPER_HOME };
  private kTarget = { ...KEEPER_HOME };
  private kStart = 0;
  private kSpeed = 2;
  private commit: { x: number; y: number; at: number } | null = null;
  private tell = 0;
  private result: KickResult | null = null;
  private crowd: Array<{ x: number; y: number; c: string }> = [];
  private bg: HTMLCanvasElement | null = null;
  private flashT = 0;
  private netShake = 0;
  private forced: Outcome | null = null;
  /** Online: whose eyes the result text is coloured for. */
  mineRole: 'shoot' | 'keep' | null = null;

  constructor(private rng: Rng, private onResult: (r: KickResult) => void, private onPhase: (p: Phase) => void, homeKits: [string, string]) {
    for (let i = 0; i < 420; i++) this.crowd.push({ x: rng.range(0, 600), y: rng.range(70, 165), c: rng.chance(0.5) ? homeKits[rng.int(0, 1)] : ['#d9d2c0', '#5b6b7a', '#b0473a', '#e0b84a'][rng.int(0, 3)] });
  }

  get currentPhase() { return this.phase; }

  start(plan: KickPlan) {
    this.plan = plan;
    this.kp = { ...KEEPER_HOME };
    this.kTarget = { ...KEEPER_HOME };
    this.shot = null; this.result = null; this.commit = null;
    this.aim = { x: 0, y: 0.5 }; this.meter = 0; this.meterT = 0; this.t = 0; this.netShake = 0; this.forced = null;
    if (plan.online?.role === 'keep') { this.setPhase('guess'); return; }
    if (plan.online) { this.setPhase('aim'); return; }
    sfx('whistle');
    if (plan.humanKicks) this.setPhase('aim');
    else {
      const k = aiKick(plan.skill, this.rng, plan.pressure);
      this.shot = k.shot; this.tell = k.tell;
      this.setPhase('runup');
    }
  }

  private setPhase(p: Phase) { this.phase = p; this.onPhase(p); }

  /** Online: play a kick both players already chose; the outcome was judged by the duel. */
  replay(plan: KickPlan, shot: Shot, dive: { x: number; y: number }, outcome: Outcome) {
    this.plan = { ...plan, humanKicks: false, humanKeeps: false, secretDive: dive };
    this.kp = { ...KEEPER_HOME }; this.kTarget = { ...KEEPER_HOME };
    this.result = null; this.commit = null; this.t = 0; this.netShake = 0;
    this.shot = shot; this.forced = outcome;
    // The run-up leans honestly toward the shot.
    this.tell = Math.sign(shot.x) * 0.5;
    sfx('whistle');
    this.setPhase('runup');
  }

  /** Online: lock what is chosen now (time ran out). Shooting: kick at the current power if the bar is running. */
  lockNow(fallback: { shot?: Shot; dive?: { x: number; y: number } }) {
    const o = this.plan?.online;
    if (!o) return;
    if (this.phase === 'power') { this.kick(); return; }
    if ((this.phase === 'aim') && fallback.shot) { this.aim = { x: fallback.shot.x, y: fallback.shot.y }; this.shot = fallback.shot; this.setPhase('locked'); o.onShot?.(fallback.shot); return; }
    if (this.phase === 'guess' && fallback.dive) this.guessAt(fallback.dive.x, fallback.dive.y);
  }

  private guessAt(x: number, y: number) {
    if (this.phase !== 'guess') return;
    this.commit = { x: Math.max(-1, Math.min(1, x)), y: Math.max(0, Math.min(1, y)), at: 0 };
    sfx('whoosh', { gain: 0.5 });
    this.setPhase('locked');
    this.plan?.online?.onDive?.({ x: this.commit.x, y: this.commit.y });
  }

  // ---------- Input ----------

  private toGoal(x: number, y: number) {
    return { x: Math.max(-1.15, Math.min(1.15, (x - 300) / 190)), y: Math.max(0, Math.min(1.2, (330 - y) / 125)) };
  }

  pointerDown(x: number, y: number) {
    if (this.phase === 'guess') { const g = this.toGoal(x, y); this.guessAt(g.x, g.y); return; }
    if (this.phase === 'aim') { this.aiming = true; this.aim = this.toGoal(x, Math.min(y, 420)); return; }
    if (this.phase === 'power') { this.kick(); return; }
    if ((this.phase === 'runup' || this.phase === 'flight') && this.plan?.humanKeeps && !this.commit) {
      const g = this.toGoal(x, y);
      this.commit = { x: Math.max(-1, Math.min(1, g.x)), y: Math.min(1, g.y), at: this.t };
      sfx('whoosh', { gain: 0.5 });
      if (this.phase === 'flight') this.beginDive(this.commit, HUMAN_DIVE);
    }
  }
  pointerMove(x: number, y: number) { if (this.phase === 'aim' && this.aiming) this.aim = this.toGoal(x, Math.min(y, 420)); }
  pointerUp() { if (this.phase === 'aim' && this.aiming) { this.aiming = false; this.setPhase('power'); this.meterT = 0; sfx('tick'); } }

  key(code: string): boolean {
    if (this.phase === 'guess') {
      const map: Record<string, [number, number]> = { ArrowLeft: [-0.7, 0.35], ArrowRight: [0.7, 0.35], ArrowUp: [0, 0.8], ArrowDown: [0, 0.2], KeyQ: [-0.7, 0.8], KeyE: [0.7, 0.8], KeyA: [-0.7, 0.2], KeyD: [0.7, 0.2] };
      const m = map[code];
      if (!m) return false;
      this.guessAt(m[0], m[1]);
      return true;
    }
    if (this.phase === 'aim') {
      if (code === 'ArrowLeft') this.aim.x = Math.max(-1.1, this.aim.x - 0.08);
      else if (code === 'ArrowRight') this.aim.x = Math.min(1.1, this.aim.x + 0.08);
      else if (code === 'ArrowUp') this.aim.y = Math.min(1.15, this.aim.y + 0.08);
      else if (code === 'ArrowDown') this.aim.y = Math.max(0.02, this.aim.y - 0.08);
      else if (code === 'Space' || code === 'Enter') { this.setPhase('power'); this.meterT = 0; }
      else return false;
      return true;
    }
    if (this.phase === 'power' && (code === 'Space' || code === 'Enter')) { this.kick(); return true; }
    if ((this.phase === 'runup' || this.phase === 'flight') && this.plan?.humanKeeps && !this.commit) {
      const map: Record<string, [number, number]> = { ArrowLeft: [-0.7, 0.35], ArrowRight: [0.7, 0.35], ArrowUp: [0, 0.8], ArrowDown: [0, 0.2], KeyQ: [-0.7, 0.8], KeyE: [0.7, 0.8], KeyA: [-0.7, 0.2], KeyD: [0.7, 0.2] };
      const m = map[code];
      if (!m) return false;
      this.commit = { x: m[0], y: m[1], at: this.t };
      if (this.phase === 'flight') this.beginDive(this.commit, HUMAN_DIVE);
      return true;
    }
    return false;
  }

  /** Test hooks. */
  testShoot(x: number, y: number, power: number) { if (this.phase !== 'aim' && this.phase !== 'power') return false; this.aim = { x, y }; this.meter = power; this.kick(true); return true; }
  testGuess(x: number, y: number) { if (this.phase !== 'guess') return false; this.guessAt(x, y); return true; }
  testDive(x: number, y: number) { if (!this.plan?.humanKeeps || this.commit) return false; this.commit = { x, y, at: this.t }; return true; }

  private kick(exact = false) {
    const p = this.plan!;
    const power = exact ? this.meter : this.meter;
    this.shot = strike(this.aim.x, this.aim.y, power, this.rng, p.pressure);
    if (p.online) { sfx('tick'); this.setPhase('locked'); p.online.onShot?.(this.shot); return; }
    this.launch();
  }

  private launch() {
    const p = this.plan!;
    const s = this.shot!;
    this.flight = flightTime(s.power);
    this.t = 0;
    sfx('thud'); vibrate(15);
    this.setPhase('flight');
    if (p.humanKeeps) {
      if (this.commit) this.beginDive(this.commit, HUMAN_DIVE);
    } else if (p.secretDive) {
      this.beginDive(p.secretDive, HUMAN_DIVE);
    } else {
      const d = p.keeperAI.dive(s);
      p.keeperAI.observe(s.x);
      this.kStart = 0.06;
      this.kTarget = { x: Math.max(-1, Math.min(1, d.x)), y: Math.max(0.1, Math.min(0.95, d.y)) };
      this.kSpeed = d.speed;
    }
  }

  private beginDive(c: { x: number; y: number }, speed: number) {
    this.kStart = this.phase === 'flight' ? this.t : 0;
    this.kTarget = { x: c.x, y: c.y };
    this.kSpeed = speed;
  }

  // ---------- Loop ----------

  update(dt: number) {
    this.time += dt;
    if (this.flashT > 0) this.flashT -= dt;
    if (this.netShake > 0) this.netShake = Math.max(0, this.netShake - dt);
    if (this.phase === 'power') { this.meterT += dt; this.meter = 0.5 - 0.5 * Math.cos(this.meterT * Math.PI * 2 / 1.15); }
    if (this.phase === 'runup') {
      this.t += dt;
      if (this.t >= 1.15) {
        const p = this.plan!;
        // A sharp kicker on the harder levels sees an early dive and goes the other way.
        if (p.humanKeeps && this.commit && this.commit.at < 0.9 && this.rng.chance(p.skill * 0.55) && this.shot) {
          this.shot = { ...this.shot, x: Math.sign(this.commit.x || 1) * -Math.abs(this.shot.x || 0.6) };
        }
        this.launch();
      }
    }
    if (this.phase === 'flight') {
      this.t += dt;
      const kt = Math.max(0, Math.min(this.t, this.flight) - this.kStart);
      this.kp = diveTo(this.kTarget.x, this.kTarget.y, kt, this.kSpeed);
      if (this.t >= this.flight && !this.result) {
        const out = this.forced ?? judge(this.shot!, this.kp);
        this.result = { outcome: out, shot: this.shot!, keeper: { ...this.kp } };
        if (out === 'goal') { this.netShake = 0.6; sfx('fanfare'); setTimeout(() => sfx('clap'), 300); }
        else if (out === 'saved') { sfx('good'); vibrate([20, 30, 20]); }
        else if (out === 'post') sfx('boing');
        else sfx('bad');
        this.flashT = 1.2;
      }
      if (this.t >= this.flight + 1.1) { this.setPhase('done'); this.onResult(this.result!); }
    }
  }

  // ---------- Drawing ----------

  private background(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = 600; c.height = 860;
    const g = c.getContext('2d')!;
    const sky = g.createLinearGradient(0, 0, 0, 200);
    sky.addColorStop(0, '#13213d'); sky.addColorStop(1, '#2d4a6e');
    g.fillStyle = sky; g.fillRect(0, 0, 600, 200);
    // Floodlights
    for (const x of [40, 560]) { g.fillStyle = '#3b4656'; g.fillRect(x - 3, 10, 6, 60); g.fillStyle = '#fff6d0'; g.fillRect(x - 22, 6, 44, 14); }
    // Stand
    g.fillStyle = '#26303d'; g.fillRect(0, 60, 600, 120);
    for (const p of this.crowd) { g.fillStyle = p.c; g.beginPath(); g.arc(p.x, p.y, 3.4, 0, Math.PI * 2); g.fill(); }
    // Boards (plain colours, no brands)
    for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#0b5d43' : '#1f3a93'; g.fillRect(i * 100, 170, 100, 22); }
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.font = '700 13px system-ui'; g.textAlign = 'center';
    for (let i = 0; i < 6; i++) g.fillText(i % 2 ? 'টিফিন পিরিয়ড' : 'TIFFIN PERIOD', i * 100 + 50, 186);
    // Grass in perspective stripes
    for (let i = 0; i < 14; i++) {
      const y0 = 192 + Math.pow(i / 14, 1.6) * 668, y1 = 192 + Math.pow((i + 1) / 14, 1.6) * 668;
      g.fillStyle = i % 2 ? '#2f8a4a' : '#379a54'; g.fillRect(0, y0, 600, y1 - y0 + 1);
    }
    g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 3;
    // Goal line, six-yard box, penalty box, spot
    g.beginPath(); g.moveTo(0, 330); g.lineTo(600, 330); g.stroke();
    g.beginPath(); g.moveTo(60, 330); g.lineTo(20, 420); g.lineTo(580, 420); g.lineTo(540, 330); g.stroke();
    g.beginPath(); g.moveTo(-40, 600); g.lineTo(640, 600); g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.ellipse(300, 778, 10, 4, 0, 0, Math.PI * 2); g.fill();
    return c;
  }

  render(ctx: CanvasRenderingContext2D, view: View) {
    ctx.fillStyle = '#1b2a40';
    ctx.fillRect(view.left, view.top, view.right - view.left, view.bottom - view.top);
    if (!this.bg) this.bg = this.background();
    ctx.drawImage(this.bg, 0, 0);
    const p = this.plan;
    const kKit = p ? getTeam(p.keeper).kit : ['#f3b61f', '#222'];
    const sKit = p ? getTeam(p.kicker).kit : ['#c00', '#fff'];

    // Net (behind the keeper)
    const shake = this.netShake > 0 ? Math.sin(this.time * 60) * this.netShake * 4 : 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
    for (let x = GX(-1); x <= GX(1); x += 12) { ctx.beginPath(); ctx.moveTo(x, GY(1)); ctx.lineTo(x + (x - 300) * 0.06 + shake, GY(0) - 18); ctx.stroke(); }
    for (let y = GY(1); y <= GY(0) - 10; y += 12) { ctx.beginPath(); ctx.moveTo(GX(-1) + 6, y + shake * 0.5); ctx.lineTo(GX(1) - 6, y + shake * 0.5); ctx.stroke(); }

    // Keeper (faceless: a plain round head)
    this.drawKeeper(ctx, kKit as [string, string]);

    // Posts and bar
    ctx.strokeStyle = '#f7f7f7'; ctx.lineWidth = 9; ctx.lineCap = 'square';
    ctx.beginPath(); ctx.moveTo(GX(-1), GY(0)); ctx.lineTo(GX(-1), GY(1)); ctx.lineTo(GX(1), GY(1)); ctx.lineTo(GX(1), GY(0)); ctx.stroke();

    // Aim reticle
    if (this.phase === 'aim' || this.phase === 'power' || (this.phase === 'locked' && p?.online?.role === 'shoot')) {
      const x = GX(this.aim.x), y = GY(this.aim.y);
      ctx.strokeStyle = '#ffe27a'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 24, y); ctx.lineTo(x - 8, y); ctx.moveTo(x + 8, y); ctx.lineTo(x + 24, y); ctx.moveTo(x, y - 24); ctx.lineTo(x, y - 8); ctx.moveTo(x, y + 8); ctx.lineTo(x, y + 24); ctx.stroke();
      if (this.phase === 'aim') {
        ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = '700 20px "Baloo Da 2", system-ui'; ctx.textAlign = 'center';
      }
    }

    // Kicker (computer) running up, seen from behind
    if (p && !p.humanKicks && (this.phase === 'runup' || this.phase === 'flight')) {
      const u = this.phase === 'runup' ? Math.min(1, this.t / 1.15) : 1;
      const x = 210 + u * 62, y = 860 - u * 120;
      this.drawRunner(ctx, x, y, sKit as [string, string], this.tell * u);
    }

    // Ball
    let bx = BALL0.x, by = BALL0.y, br = BALL0.r;
    if (this.shot && (this.phase === 'flight' || this.phase === 'done')) {
      const u = Math.min(1.15, this.t / this.flight);
      const s = this.shot;
      const tx = GX(s.x), ty = GY(s.y);
      const uu = Math.min(1, u);
      bx = BALL0.x + (tx - BALL0.x) * uu;
      by = BALL0.y + (ty - BALL0.y) * uu - Math.sin(Math.PI * uu) * (30 + s.y * 40);
      br = BALL0.r + (9 - BALL0.r) * uu;
      if (this.result && this.result.outcome === 'saved' && u > 1) { bx += (bx - 300) * (u - 1) * 2; by += (u - 1) * 260; }
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.ellipse(bx, BALL0.y + (GY(0) - BALL0.y) * uu, br, br * 0.35, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(bx, by + br * 0.8, br, br * 0.35, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#fafafa'; ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#333'; ctx.lineWidth = Math.max(1, br / 14); ctx.stroke();
    ctx.fillStyle = '#222';
    const rot = this.time * (this.phase === 'flight' ? 14 : 0);
    for (let i = 0; i < 5; i++) { const a = rot + (i * Math.PI * 2) / 5; ctx.beginPath(); ctx.arc(bx + Math.cos(a) * br * 0.55, by + Math.sin(a) * br * 0.55, br * 0.2, 0, Math.PI * 2); ctx.fill(); }

    // Power meter
    if (this.phase === 'power') {
      const x = 545, y0 = 520, h = 260;
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(x - 6, y0 - 6, 38, h + 12);
      const zones: Array<[number, number, string]> = [[0, 0.35, '#5b8db8'], [0.35, 0.6, '#9ad16f'], [0.6, 0.82, '#3cc45a'], [0.82, 1, '#ff5a4f']];
      for (const [a, b, c] of zones) { ctx.fillStyle = c; ctx.fillRect(x, y0 + h * (1 - b), 26, h * (b - a)); }
      const my = y0 + h * (1 - this.meter);
      ctx.fillStyle = '#fff'; ctx.fillRect(x - 10, my - 3, 46, 6);
    }

    // Keeper's chosen dive marker (human)
    if ((p?.humanKeeps || p?.online?.role === 'keep') && this.commit && this.phase !== 'done') {
      ctx.strokeStyle = '#7CFC9A'; ctx.lineWidth = 3; ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.arc(GX(this.commit.x), GY(this.commit.y), 20, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }

    // Result text
    if (this.result && this.flashT > 0) {
      const o = this.result.outcome;
      const txt = o === 'goal' ? 'GOAL!' : o === 'saved' ? 'SAVED!' : o === 'post' ? 'POST!' : o === 'over' ? 'OVER!' : 'WIDE!';
      const good = this.mineRole ? (this.mineRole === 'shoot') === (o === 'goal') : p ? (o === 'goal') === p.humanKicks || (p.humanKeeps && o !== 'goal') : o === 'goal';
      ctx.font = '800 70px "Baloo Da 2", system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.strokeText(txt, 300, 500);
      ctx.fillStyle = good ? '#ffe27a' : '#ff8a80'; ctx.fillText(txt, 300, 500);
    }
  }

  private drawKeeper(ctx: CanvasRenderingContext2D, kit: [string, string]) {
    const x = GX(this.kp.x), y = GY(this.kp.y);
    const lean = Math.max(-1.2, Math.min(1.2, (this.kp.x - KEEPER_HOME.x) * 1.4));
    ctx.save();
    ctx.translate(x, y + 30);
    ctx.rotate(lean);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    // legs
    ctx.strokeStyle = '#1d1d1d'; ctx.lineWidth = 9; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-7, 10); ctx.lineTo(-12, 40); ctx.moveTo(7, 10); ctx.lineTo(12, 40); ctx.stroke();
    // body
    ctx.fillStyle = kit[1] === '#ffffff' ? '#f3b61f' : kit[1];
    ctx.fillRect(-16, -30, 32, 44);
    ctx.fillStyle = kit[0]; ctx.fillRect(-16, -30, 32, 8);
    // arms (spread)
    const spread = 0.6 + Math.min(1, Math.abs(lean)) * 0.6;
    ctx.strokeStyle = ctx.fillStyle = kit[1] === '#ffffff' ? '#f3b61f' : kit[1]; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(-14, -24); ctx.lineTo(-14 - 26 * spread, -40 - 10 * spread); ctx.moveTo(14, -24); ctx.lineTo(14 + 26 * spread, -40 - 10 * spread); ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(-14 - 26 * spread, -40 - 10 * spread, 6, 0, Math.PI * 2); ctx.arc(14 + 26 * spread, -40 - 10 * spread, 6, 0, Math.PI * 2); ctx.fill();
    // plain head
    ctx.fillStyle = '#b07a52'; ctx.beginPath(); ctx.arc(0, -42, 11, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  private drawRunner(ctx: CanvasRenderingContext2D, x: number, y: number, kit: [string, string], lean: number) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(lean * 0.18);
    const stride = Math.sin(this.time * 18) * 10;
    ctx.strokeStyle = '#1d1d1d'; ctx.lineWidth = 12; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(-12 + stride, 52); ctx.moveTo(9, 0); ctx.lineTo(12 - stride, 52); ctx.stroke();
    ctx.fillStyle = kit[0]; ctx.fillRect(-22, -64, 44, 66);
    ctx.fillStyle = kit[1]; ctx.fillRect(-22, -64, 44, 10);
    ctx.fillStyle = kit[1]; ctx.font = '800 22px system-ui'; ctx.textAlign = 'center'; ctx.fillText('9', 0, -24);
    ctx.fillStyle = '#2b1d14'; ctx.beginPath(); ctx.arc(0, -80, 15, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}
