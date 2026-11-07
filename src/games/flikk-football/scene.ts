import type { Scene, View } from '../../engine/GameCanvas';
import { createRng, type Rng } from '../../engine/rng';
import { sfx, vibrate } from '../../platform/audio';
import { flagImage, getTeam } from '../../shared/teams';
import { MAX_SPEED, PITCH, R_BALL, R_DISC, ball, discsOf, flick, keeperOf, moving, step, stopAll, type Body, type Side, type World } from './physics';
import { aiChoose, judge, kickoff, regroup, separate, type TeamSetup } from './match';
import { aiChooseFixed, fixedKickoff, flickBall, judgeFixed, placeBall, previewFixed, type Preview, type Style } from './fixed';

export interface FlikkConfig {
  /** 'free': flick your players into the ball. 'fixed': players stay on their spots, flick the ball between them. */
  style?: Style;
  teams: [string, string];
  setups: [TeamSetup, TeamSetup];
  vsAI: boolean;
  /** 0..1 skill of the computer. */
  skill: number;
  totalTurns: number;
  score: [number, number];
  turnsDone: number;
  /** Minute at turnsDone = 0 (challenges start late). */
  startMinute: number;
  kicking: Side;
  setup: 'kickoff' | 'attack';
  /** A tied knockout goes to golden goal, then penalty flicks. */
  knockout: boolean;
  /** Stop as soon as side 0 reaches this many goals (challenges). */
  stopAtGoals?: number;
  seed: number;
}

export interface FlikkHud {
  score: [number, number];
  minute: number;
  turnSide: Side;
  flick: number;
  thinking: boolean;
  phase: Phase;
  banner: string | null;
  canRegroup: boolean;
  shootout: { kicks: [boolean[], boolean[]] } | null;
  golden: boolean;
  style: Style;
  /** Fixed mode: completed passes in a row. */
  chain: number;
  /** Clock steps left (turns in free mode, flicks in fixed mode). */
  left: number;
}

export interface FlikkEnd {
  score: [number, number];
  pens?: [number, number];
  winner: Side | null;
  golden: boolean;
  stats: { passes: [number, number]; shots: [number, number] };
}

type Phase = 'aim' | 'moving' | 'goal' | 'ai' | 'wait' | 'over';

export type Say = (key: 'goal' | 'pass' | 'chain' | 'turn' | 'half' | 'golden' | 'pens' | 'saved' | 'missed' | 'scored' | 'yourTurn' | 'theirTurn', vars?: Record<string, string>) => string;

const FLICKS = 3;

export class FlikkScene implements Scene {
  designW = PITCH.W;
  designH = PITCH.H;
  w: World;
  private rng: Rng;
  private phase: Phase = 'wait';
  private turnSide: Side;
  private flicks = 0;
  private turnsDone: number;
  private score: [number, number];
  private regroupUsed: [boolean, boolean] = [false, false];
  private half = 1;
  private firstKick: Side;
  private piece = -1;
  private sel: number | null = null;
  private drag: { sx: number; sy: number; x: number; y: number; path: Array<[number, number]> } | null = null;
  private kb = { angle: -Math.PI / 2, power: 0.6, on: false };
  private banner: { text: string; t: number } | null = null;
  private particles: Array<{ x: number; y: number; vx: number; vy: number; life: number; c: string }> = [];
  private shake = 0;
  private time = 0;
  private wait = 0;
  private after: (() => void) | null = null;
  private golden = false;
  private shootout: { kicks: [boolean[], boolean[]]; shooter: Side } | null = null;
  private passes: [number, number] = [0, 0];
  private shots: [number, number] = [0, 0];
  private ballSpin = 0;
  private lastBallSpeed = 0;
  private ended = false;
  private flags: [HTMLImageElement | null, HTMLImageElement | null];
  private kits: [[string, string], [string, string]];
  private bg: HTMLCanvasElement | null = null;
  private style: Style;
  /** Fixed mode: the player who has the ball. */
  private holder = -1;
  private chain = 0;
  private glide: { fx: number; fy: number; tx: number; ty: number; t: number } | null = null;
  private preview: { key: string; p: Preview } | null = null;

  constructor(private cfg: FlikkConfig, private say: Say, private onHud: (h: FlikkHud) => void, private onEnd: (e: FlikkEnd) => void) {
    this.rng = createRng(cfg.seed);
    this.turnsDone = cfg.turnsDone;
    this.score = [...cfg.score] as [number, number];
    this.turnSide = cfg.kicking;
    this.firstKick = cfg.kicking;
    this.style = cfg.style ?? 'free';
    this.w = this.freshWorld(cfg.kicking);
    if (cfg.setup === 'attack') this.attackSetup();
    this.flags = [flagImage(cfg.teams[0]), flagImage(cfg.teams[1])];
    this.kits = [getTeam(cfg.teams[0]).kit, getTeam(cfg.teams[1]).kit];
    this.later(0.7, () => { sfx('whistle'); this.startTurn(this.turnSide); });
    queueMicrotask(() => this.emit());
  }

  private keeperSpeeds(): [number, number] {
    const ai = 150 + this.cfg.skill * 150;
    return this.cfg.vsAI ? [230, ai] : [230, 230];
  }

  private get fixed() { return this.style === 'fixed'; }

  /** A new kick-off world for either style (fixed mode also sets who has the ball). */
  private freshWorld(kicking: Side): World {
    if (!this.fixed) return kickoff(this.cfg.setups, kicking, this.keeperSpeeds());
    const k = fixedKickoff(this.cfg.setups, kicking, this.keeperSpeeds());
    this.holder = k.holder;
    this.chain = 0;
    return k.w;
  }

  private attackSetup() {
    if (this.fixed) {
      // Ball with your most advanced central player.
      const mine = discsOf(this.w, 0).sort((a, b) => (a.y + Math.abs(a.x - 300) * 0.8) - (b.y + Math.abs(b.x - 300) * 0.8));
      this.holder = mine[0].id;
      placeBall(this.w, this.holder);
      return;
    }
    const bl = ball(this.w);
    bl.x = 300 + this.rng.range(-80, 80); bl.y = 330;
    const mine = discsOf(this.w, 0).sort((a, b) => Math.hypot(a.x - bl.x, a.y - bl.y) - Math.hypot(b.x - bl.x, b.y - bl.y));
    mine[0].x = bl.x + 6; mine[0].y = bl.y + 44;
    mine[1].x = bl.x - 120; mine[1].y = bl.y - 30;
    mine[2].x = bl.x + 130; mine[2].y = bl.y - 10;
    separate(this.w);
  }

  // ---------- Turn flow ----------

  get minute(): number {
    return Math.min(90, Math.round(this.cfg.startMinute + (90 - this.cfg.startMinute) * (this.turnsDone / Math.max(1, this.cfg.totalTurns))));
  }

  private later(sec: number, fn: () => void) { this.wait = sec; this.after = fn; this.phase = 'wait'; }

  private startTurn(side: Side) {
    this.turnSide = side;
    this.flicks = 0;
    this.chain = 0;
    this.sel = null;
    this.flash(this.cfg.vsAI ? (side === 0 ? this.say('yourTurn') : this.say('theirTurn')) : this.say('turn', { id: this.cfg.teams[side] }));
    this.nextFlick();
  }

  private nextFlick() {
    const ai = this.cfg.vsAI && this.turnSide === 1;
    this.phase = ai ? 'ai' : 'aim';
    if (!ai) this.autoSelect();
    this.emit();
    if (ai) this.later(0.75, () => this.aiFlick());
  }

  private autoSelect() {
    const bl = ball(this.w);
    const ds = discsOf(this.w, this.turnSide).sort((a, b) => Math.hypot(a.x - bl.x, a.y - bl.y) - Math.hypot(b.x - bl.x, b.y - bl.y));
    this.sel = ds[0]?.id ?? null;
    if (this.sel !== null) {
      const d = ds[0];
      this.kb.angle = Math.atan2(bl.y - d.y, bl.x - d.x);
    }
  }

  private aiFlick() {
    this.phase = 'ai';
    this.emit();
    if (this.fixed) {
      const f = aiChooseFixed(this.w, this.turnSide, this.holder, this.cfg.skill, this.rng);
      this.doFlick(this.holder, f.angle, f.power, 0);
      return;
    }
    const m = aiChoose(this.w, this.turnSide, this.cfg.skill, this.rng, FLICKS - this.flicks);
    this.doFlick(m.piece, m.angle, m.power, 0);
  }

  private doFlick(piece: number, angle: number, power: number, spin: number) {
    this.piece = piece;
    this.preview = null;
    if (this.fixed) flickBall(this.w, angle, power, spin);
    else flick(this.w, piece, angle, power, spin);
    this.phase = 'moving';
    this.drag = null;
    this.kb.on = false;
    sfx('click', { pitch: 0.6 + power * 0.6 });
    vibrate(8);
    const bl = ball(this.w);
    const goalY = this.turnSide === 0 ? PITCH.top : PITCH.bottom;
    if (Math.abs(bl.y - goalY) < 330) this.shots[this.turnSide]++;
    this.emit();
  }

  private resolve() {
    if (this.fixed) { this.resolveFixed(); return; }
    const r = judge(this.w, this.turnSide, this.piece);
    stopAll(this.w);
    this.flicks++;
    if (this.shootout) { this.shootoutKick(false); return; }
    if (r.keep && this.flicks < FLICKS) {
      this.passes[this.turnSide]++;
      this.flash(this.say('pass', { n: String(FLICKS - this.flicks) }));
      sfx('good', { gain: 0.6 });
      this.nextFlick();
      return;
    }
    this.endTurn();
  }

  /** Fixed mode: whoever reaches the ball has it; keep flicking while it stays with your team. */
  private resolveFixed() {
    stopAll(this.w);
    this.flicks++;
    if (this.shootout) { this.shootoutKick(false); return; }
    const r = judgeFixed(this.w, this.turnSide, this.holder);
    const nextSide = receiverSide(this.w, r.holder);
    if (r.pass) {
      this.passes[this.turnSide]++;
      this.chain++;
      sfx('good', { gain: 0.6 });
      this.flash(this.say('chain', { n: String(this.chain) }), 0.9);
    } else if (!r.keep) {
      sfx('bad', { gain: 0.4 });
    }
    this.holder = r.holder;
    const bl = ball(this.w);
    const fx = bl.x, fy = bl.y;
    placeBall(this.w, this.holder);
    this.glide = { fx, fy, tx: bl.x, ty: bl.y, t: 0 };
    bl.x = fx; bl.y = fy;
    this.later(0.32, () => this.endTurn(nextSide));
    this.emit();
  }

  private endTurn(nextOverride?: Side) {
    this.turnsDone++;
    const next: Side = nextOverride ?? (this.turnSide === 0 ? 1 : 0);
    const go = () => { if (this.fixed && next === this.turnSide) this.nextFlick(); else this.startTurn(next); };
    if (this.golden) {
      if (this.turnsDone >= this.cfg.totalTurns + (this.fixed ? 12 : 6)) { this.startShootout(); return; }
      go();
      return;
    }
    if (this.turnsDone >= this.cfg.totalTurns) { this.fullTime(); return; }
    if (this.half === 1 && this.cfg.startMinute === 0 && this.turnsDone >= Math.floor(this.cfg.totalTurns / 2)) {
      this.half = 2;
      sfx('whistle');
      this.flash(this.say('half'));
      const k: Side = this.firstKick === 0 ? 1 : 0;
      this.regroupUsed = [false, false];
      this.later(1.6, () => { this.w = this.freshWorld(k); this.startTurn(k); });
      this.emit();
      return;
    }
    go();
  }

  private onGoal(side: Side) {
    this.score[side]++;
    this.phase = 'goal';
    this.shake = 0.5;
    sfx('fanfare'); setTimeout(() => sfx('clap'), 350);
    vibrate([40, 50, 80]);
    const bl = ball(this.w);
    const kit = this.kits[side];
    for (let i = 0; i < 70; i++) {
      const a = this.rng.range(0, Math.PI * 2), s = this.rng.range(80, 420);
      this.particles.push({ x: bl.x, y: bl.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: this.rng.range(0.6, 1.4), c: i % 3 === 0 ? '#ffffff' : i % 2 ? kit[0] : kit[1] });
    }
    this.flash(this.say('goal', { id: this.cfg.teams[side] }), 2);
    this.emit();
    const conceding: Side = side === 0 ? 1 : 0;
    this.later(2, () => {
      if (this.golden) { this.finish(); return; }
      if (this.cfg.stopAtGoals !== undefined && this.score[0] >= this.cfg.stopAtGoals) { this.finish(); return; }
      this.turnsDone++;
      if (this.turnsDone >= this.cfg.totalTurns) { this.fullTime(); return; }
      this.w = this.freshWorld(conceding);
      this.startTurn(conceding);
    });
  }

  private fullTime() {
    sfx('whistle');
    if (this.cfg.knockout && this.score[0] === this.score[1] && !this.golden) {
      this.golden = true;
      this.flash(this.say('golden'), 2);
      this.later(1.8, () => { this.w = this.freshWorld(this.firstKick); this.startTurn(this.firstKick); });
      this.emit();
      return;
    }
    this.finish();
  }

  // ---------- Penalty flicks ----------

  private startShootout() {
    this.shootout = { kicks: [[], []], shooter: this.firstKick };
    this.flash(this.say('pens'), 2);
    sfx('whistle');
    this.later(1.6, () => this.setupPen());
  }

  private setupPen() {
    const so = this.shootout!;
    const s = so.shooter;
    const keeperSide: Side = s === 0 ? 1 : 0;
    const w = kickoff(this.cfg.setups, s, this.keeperSpeeds());
    const spotY = s === 0 ? PITCH.top + 150 : PITCH.bottom - 150;
    const shooter = discsOf(w, s)[8];
    w.bodies = w.bodies.filter((b) => b.kind === 'ball' || b === shooter || (b.kind === 'keeper' && b.side === keeperSide));
    const bl = ball(w);
    bl.x = 300; bl.y = spotY;
    shooter.x = 300 + this.rng.range(-30, 30); shooter.y = spotY + (s === 0 ? 70 : -70);
    keeperOf(w, keeperSide).x = 300;
    w.pinned = this.fixed;
    this.holder = shooter.id;
    this.w = w;
    this.turnSide = s;
    this.flicks = 0;
    this.nextFlick();
  }

  private shootoutKick(goal: boolean) {
    const so = this.shootout!;
    so.kicks[so.shooter].push(goal);
    this.flash(goal ? this.say('scored') : this.say('missed'), 1.4);
    if (goal) sfx('good'); else sfx('bad');
    this.emit();
    const [a, b] = [so.kicks[0], so.kicks[1]];
    const ga = a.filter(Boolean).length, gb = b.filter(Boolean).length;
    const decided = (() => {
      const n = 3;
      if (a.length <= n && b.length <= n) {
        const leftA = n - a.length, leftB = n - b.length;
        if (ga > gb + leftB || gb > ga + leftA) return true;
        return false;
      }
      return a.length === b.length && ga !== gb;
    })();
    this.later(1.5, () => {
      if (decided) { this.finish(); return; }
      so.shooter = so.shooter === 0 ? 1 : 0;
      this.setupPen();
    });
  }

  private finish() {
    if (this.ended) return;
    this.ended = true;
    this.phase = 'over';
    let winner: Side | null = this.score[0] > this.score[1] ? 0 : this.score[1] > this.score[0] ? 1 : null;
    let pens: [number, number] | undefined;
    if (this.shootout) {
      pens = [this.shootout.kicks[0].filter(Boolean).length, this.shootout.kicks[1].filter(Boolean).length];
      winner = pens[0] > pens[1] ? 0 : 1;
    }
    this.emit();
    setTimeout(() => this.onEnd({ score: [...this.score] as [number, number], pens, winner, golden: this.golden, stats: { passes: this.passes, shots: this.shots } }), 900);
  }

  regroupNow() {
    if (this.fixed || this.phase !== 'aim' || this.flicks > 0 || this.regroupUsed[this.turnSide] || this.shootout) return;
    this.regroupUsed[this.turnSide] = true;
    regroup(this.w, this.turnSide, this.cfg.setups[this.turnSide]);
    sfx('whoosh');
    this.endTurn();
  }

  // ---------- Input ----------

  private humanTurn() { return this.phase === 'aim' && (!this.cfg.vsAI || this.turnSide === 0); }

  pointerDown(x: number, y: number) {
    if (!this.humanTurn()) return;
    if (this.fixed) {
      // Press anywhere, pull back and let go: the ball goes the other way.
      this.sel = this.holder;
      this.kb.on = false;
      this.drag = { sx: x, sy: y, x, y, path: [[x, y]] };
      sfx('tick', { gain: 0.4 });
      return;
    }
    const ds = discsOf(this.w, this.turnSide);
    let best: Body | null = null, bd = 64;
    for (const d of ds) { const dd = Math.hypot(d.x - x, d.y - y); if (dd < bd) { bd = dd; best = d; } }
    if (!best) return;
    this.sel = best.id;
    this.kb.on = false;
    this.drag = { sx: best.x, sy: best.y, x, y, path: [[x, y]] };
    sfx('tick', { gain: 0.4 });
  }

  pointerMove(x: number, y: number) {
    if (!this.drag) return;
    this.drag.x = x; this.drag.y = y;
    const p = this.drag.path;
    const last = p[p.length - 1];
    if (Math.hypot(last[0] - x, last[1] - y) > 6) p.push([x, y]);
  }

  pointerUp() {
    if (!this.drag || this.sel === null) return;
    const a = this.aimOf();
    this.drag = null;
    if (a.power < 0.07) return;
    this.doFlick(this.sel, a.angle, a.power, a.spin);
  }

  key(code: string) {
    if (!this.humanTurn()) return false;
    const ds = discsOf(this.w, this.turnSide);
    if (this.fixed && this.sel !== this.holder) {
      this.sel = this.holder;
      const bl = ball(this.w);
      const g = this.turnSide === 0 ? PITCH.top : PITCH.bottom;
      this.kb.angle = Math.atan2(g - bl.y, 300 - bl.x);
    }
    if (code === 'Tab' && !this.fixed) {
      const bl = ball(this.w);
      const sorted = ds.sort((a, b) => Math.hypot(a.x - bl.x, a.y - bl.y) - Math.hypot(b.x - bl.x, b.y - bl.y));
      const i = sorted.findIndex((d) => d.id === this.sel);
      const d = sorted[(i + 1) % sorted.length];
      this.sel = d.id; this.kb.angle = Math.atan2(bl.y - d.y, bl.x - d.x); this.kb.on = true;
      return true;
    }
    if (code === 'ArrowLeft') { this.kb.angle -= 0.05; this.kb.on = true; return true; }
    if (code === 'ArrowRight') { this.kb.angle += 0.05; this.kb.on = true; return true; }
    if (code === 'ArrowUp') { this.kb.power = Math.min(1, this.kb.power + 0.05); this.kb.on = true; return true; }
    if (code === 'ArrowDown') { this.kb.power = Math.max(0.1, this.kb.power - 0.05); this.kb.on = true; return true; }
    if ((code === 'Space' || code === 'Enter') && this.sel !== null) { this.doFlick(this.sel, this.kb.angle, this.kb.power, 0); return true; }
    if (code === 'KeyR') { this.regroupNow(); return true; }
    return false;
  }

  /** Test hook: flick the selected (or a given) piece. */
  testFlick(angle: number, power: number, piece?: number) {
    if (!this.humanTurn()) return false;
    if (this.fixed) { this.doFlick(this.holder, angle, power, 0); return true; }
    const id = piece ?? this.sel;
    if (id === null) return false;
    this.doFlick(id, angle, power, 0);
    return true;
  }

  private aimOf(): { angle: number; power: number; spin: number } {
    if (this.drag) {
      const dx = this.drag.sx - this.drag.x, dy = this.drag.sy - this.drag.y;
      const len = Math.hypot(dx, dy);
      const power = Math.min(1, Math.max(0, (len - 14) / 170));
      // A hooked drag curls the piece: the furthest point of the path from the straight line.
      let dev = 0;
      const p = this.drag.path;
      if (p.length > 3 && len > 30) {
        const ux = -dx / len, uy = -dy / len;
        for (const [px, py] of p) {
          const rx = px - this.drag.sx, ry = py - this.drag.sy;
          const cross = ux * ry - uy * rx;
          if (Math.abs(cross) > Math.abs(dev)) dev = cross;
        }
      }
      const spin = Math.abs(dev) > 18 ? Math.max(-1, Math.min(1, -dev / 70)) : 0;
      return { angle: Math.atan2(dy, dx), power, spin };
    }
    return { angle: this.kb.angle, power: this.kb.on ? this.kb.power : 0, spin: 0 };
  }

  // ---------- Loop ----------

  private flash(text: string, t = 1.2) { this.banner = { text, t }; this.emit(); }

  private emit() {
    this.onHud({
      score: [...this.score] as [number, number], minute: this.minute, turnSide: this.turnSide, flick: this.flicks + 1,
      thinking: this.phase === 'ai' || (this.phase === 'wait' && this.cfg.vsAI && this.turnSide === 1 && !this.banner),
      phase: this.phase, banner: this.banner?.text ?? null,
      canRegroup: this.humanTurn() && this.flicks === 0 && !this.regroupUsed[this.turnSide] && !this.shootout,
      shootout: this.shootout ? { kicks: [[...this.shootout.kicks[0]], [...this.shootout.kicks[1]]] } : null,
      golden: this.golden,
      style: this.style,
      chain: this.chain,
      left: Math.max(0, this.cfg.totalTurns - this.turnsDone),
    });
  }

  update(dt: number) {
    this.time += dt;
    if (this.banner) { this.banner.t -= dt; if (this.banner.t <= 0) { this.banner = null; this.emit(); } }
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt);
    for (const p of this.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.97; p.vy *= 0.97; p.life -= dt; }
    this.particles = this.particles.filter((p) => p.life > 0);
    if (this.glide) {
      const g = this.glide;
      g.t = Math.min(1, g.t + dt / 0.26);
      const e = 1 - (1 - g.t) * (1 - g.t);
      const bl = ball(this.w);
      bl.x = g.fx + (g.tx - g.fx) * e; bl.y = g.fy + (g.ty - g.fy) * e;
      this.ballSpin += dt * 6;
      if (g.t >= 1) this.glide = null;
    }
    if (this.phase === 'wait' && this.after) {
      this.wait -= dt;
      if (this.wait <= 0) { const f = this.after; this.after = null; f(); }
      return;
    }
    if (this.phase === 'moving' || (!this.fixed && (this.phase === 'aim' || this.phase === 'ai'))) {
      const before = ball(this.w);
      const sp0 = Math.hypot(before.vx, before.vy);
      step(this.w, dt);
      const bl = ball(this.w);
      const sp = Math.hypot(bl.vx, bl.vy);
      this.ballSpin += sp * dt * 0.05;
      if (sp - Math.max(sp0, this.lastBallSpeed) > 160) sfx('pop', { gain: Math.min(1, sp / MAX_SPEED) * 0.8, pitch: 0.7 });
      this.lastBallSpeed = sp;
      if (this.phase === 'moving') {
        if (this.w.goal !== null) {
          if (this.shootout) { stopAll(this.w); this.shootoutKick(this.w.goal === this.shootout.shooter); this.w.goal = null; return; }
          this.onGoal(this.w.goal);
          this.w.goal = null;
          return;
        }
        if (!moving(this.w)) this.resolve();
      }
    }
  }

  // ---------- Drawing ----------

  private background(view: View): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = PITCH.W; c.height = PITCH.H;
    const g = c.getContext('2d')!;
    // Desk
    g.fillStyle = '#8f5f37'; g.fillRect(0, 0, PITCH.W, PITCH.H);
    for (let i = 0; i < 70; i++) { g.strokeStyle = `rgba(60,30,10,${0.05 + (i % 5) * 0.012})`; g.lineWidth = 1 + (i % 3); g.beginPath(); g.moveTo(0, i * 14 + (i % 4) * 3); g.bezierCurveTo(200, i * 14 + 8, 400, i * 14 - 6, 600, i * 14 + 4); g.stroke(); }
    // Pitch: green felt with stripes
    const P = PITCH;
    g.fillStyle = '#2f8a4a'; g.fillRect(P.left - 14, P.top - 14, P.right - P.left + 28, P.bottom - P.top + 28);
    for (let i = 0; i < 12; i++) { g.fillStyle = i % 2 ? '#2f8a4a' : '#369552'; g.fillRect(P.left, P.top + i * ((P.bottom - P.top) / 12), P.right - P.left, (P.bottom - P.top) / 12 + 1); }
    g.strokeStyle = 'rgba(255,255,255,0.88)'; g.lineWidth = 3;
    g.strokeRect(P.left, P.top, P.right - P.left, P.bottom - P.top);
    g.beginPath(); g.moveTo(P.left, P.midY); g.lineTo(P.right, P.midY); g.stroke();
    g.beginPath(); g.arc(300, P.midY, 72, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(300, P.midY, 4, 0, Math.PI * 2); g.fill();
    for (const [y, s] of [[P.top, 1], [P.bottom, -1]] as const) {
      g.strokeRect(160, s > 0 ? y : y - 130, 280, 130);
      g.strokeRect(225, s > 0 ? y : y - 52, 150, 52);
      g.beginPath(); g.arc(300, y + s * 150, 4, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(300, y + s * 130, 50, s > 0 ? 0.2 * Math.PI : 1.2 * Math.PI, s > 0 ? 0.8 * Math.PI : 1.8 * Math.PI); g.stroke();
      // Net (a pencil-box goal)
      const ny = s > 0 ? y - P.depth : y;
      g.fillStyle = 'rgba(240,240,240,0.25)'; g.fillRect(P.mouthL, ny, P.mouthR - P.mouthL, P.depth);
      g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 1;
      for (let x = P.mouthL; x <= P.mouthR; x += 8) { g.beginPath(); g.moveTo(x, ny); g.lineTo(x, ny + P.depth); g.stroke(); }
      for (let yy = ny; yy <= ny + P.depth; yy += 8) { g.beginPath(); g.moveTo(P.mouthL, yy); g.lineTo(P.mouthR, yy); g.stroke(); }
      g.strokeStyle = '#f4f4f4'; g.lineWidth = 5; g.beginPath(); g.moveTo(P.mouthL, y); g.lineTo(P.mouthL, ny + (s > 0 ? 0 : P.depth)); g.lineTo(P.mouthR, ny + (s > 0 ? 0 : P.depth)); g.lineTo(P.mouthR, y); g.stroke();
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(255,255,255,0.88)';
    }
    // Wooden rails round the pitch (the ruler border)
    g.strokeStyle = '#d9b77a'; g.lineWidth = 10;
    g.strokeRect(P.left - 9, P.top - 9, P.right - P.left + 18, P.bottom - P.top + 18);
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1;
    for (let x = P.left; x < P.right; x += 26) { g.beginPath(); g.moveTo(x, P.top - 14); g.lineTo(x, P.top - 8); g.stroke(); g.beginPath(); g.moveTo(x, P.bottom + 8); g.lineTo(x, P.bottom + 14); g.stroke(); }
    void view;
    return c;
  }

  render(ctx: CanvasRenderingContext2D, view: View) {
    ctx.fillStyle = '#7d5230';
    ctx.fillRect(view.left, view.top, view.right - view.left, view.bottom - view.top);
    if (!this.bg) this.bg = this.background(view);
    ctx.save();
    if (this.shake > 0) ctx.translate(Math.sin(this.time * 70) * this.shake * 10, Math.cos(this.time * 53) * this.shake * 8);
    ctx.drawImage(this.bg, 0, 0);

    const human = this.humanTurn();
    const aim = human ? this.aimOf() : null;
    const selBody = this.sel !== null ? this.w.bodies.find((b) => b.id === this.sel) : undefined;

    // Shadows
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (const b of this.w.bodies) { ctx.beginPath(); ctx.ellipse(b.x + 3, b.y + 4, b.r, b.r * 0.92, 0, 0, Math.PI * 2); ctx.fill(); }

    // Pieces
    for (const b of this.w.bodies) {
      if (b.kind === 'ball') continue;
      const s = b.side as Side;
      const kit = this.kits[s];
      const mine = this.fixed ? b.id === this.holder && this.phase === 'aim' : human && b.side === this.turnSide && b.kind === 'disc';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = b.kind === 'keeper' ? shade(kit[1], -0.15) : kit[0]; ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = b.kind === 'keeper' ? kit[0] : kit[1]; ctx.stroke();
      ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 2, 0, Math.PI * 2); ctx.stroke();
      const f = this.flags[s];
      if (b.kind === 'disc' && f && f.complete) {
        ctx.save(); ctx.beginPath(); ctx.arc(b.x, b.y, 9, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(f, b.x - 13.5, b.y - 9, 27, 18); ctx.restore();
        ctx.beginPath(); ctx.arc(b.x, b.y, 9, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.2; ctx.stroke();
      }
      if (b.kind === 'keeper') { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(b.x - 11, b.y, 4, 0, Math.PI * 2); ctx.arc(b.x + 11, b.y, 4, 0, Math.PI * 2); ctx.fill(); }
      if (mine) {
        ctx.strokeStyle = b.id === this.sel ? `rgba(255,255,255,${0.75 + Math.sin(this.time * 8) * 0.25})` : 'rgba(255,255,255,0.28)';
        ctx.lineWidth = b.id === this.sel ? 3 : 1.5;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 6, 0, Math.PI * 2); ctx.stroke();
      }
    }

    // Ball
    const bl = ball(this.w);
    ctx.beginPath(); ctx.arc(bl.x, bl.y, bl.r, 0, Math.PI * 2); ctx.fillStyle = '#fafafa'; ctx.fill();
    ctx.strokeStyle = '#333'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = '#222';
    for (let i = 0; i < 5; i++) { const a = this.ballSpin + (i * Math.PI * 2) / 5; ctx.beginPath(); ctx.arc(bl.x + Math.cos(a) * 5.5, bl.y + Math.sin(a) * 5.5, 2.3, 0, Math.PI * 2); ctx.fill(); }
    ctx.beginPath(); ctx.arc(bl.x, bl.y, 2.6, 0, Math.PI * 2); ctx.fill();

    // Aim guide
    if (aim && this.fixed && aim.power > 0.02) this.drawAimFixed(ctx, aim);
    else if (aim && selBody && aim.power > 0.02) this.drawAim(ctx, selBody, aim);

    // Particles
    for (const p of this.particles) { ctx.globalAlpha = Math.min(1, p.life * 1.5); ctx.fillStyle = p.c; ctx.fillRect(p.x - 3, p.y - 2, 6, 4); }
    ctx.globalAlpha = 1;

    // Banner
    if (this.banner) {
      const big = this.phase === 'goal';
      ctx.font = `800 ${big ? 64 : 30}px "Baloo Da 2", system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const tw = ctx.measureText(this.banner.text).width;
      const y = big ? PITCH.midY : PITCH.midY - 120;
      ctx.fillStyle = big ? 'rgba(0,0,0,0.45)' : 'rgba(255,253,246,0.92)';
      roundRect(ctx, 300 - tw / 2 - 22, y - (big ? 46 : 26), tw + 44, big ? 92 : 52, 14); ctx.fill();
      ctx.fillStyle = big ? '#ffe27a' : '#1f3a93';
      ctx.fillText(this.banner.text, 300, y + 2);
    }
    ctx.restore();
  }

  /** Fixed mode guide: the ball's real path up to the first player it meets, or where it stops and who gets it. */
  private drawAimFixed(ctx: CanvasRenderingContext2D, aim: { angle: number; power: number; spin: number }) {
    const bl = ball(this.w);
    const ux = Math.cos(aim.angle), uy = Math.sin(aim.angle);
    const col = aim.power < 0.5 ? '#7CFC9A' : aim.power < 0.8 ? '#ffd34d' : '#ff6b5a';
    const key = `${aim.angle.toFixed(3)}|${aim.power.toFixed(3)}|${aim.spin.toFixed(2)}|${this.holder}`;
    if (!this.preview || this.preview.key !== key) this.preview = { key, p: previewFixed(this.w, this.holder, aim.angle, aim.power, aim.spin) };
    const pv = this.preview.p;
    const [ex, ey] = pv.path[pv.path.length - 1];
    ctx.save();
    ctx.setLineDash([8, 8]); ctx.lineDashOffset = -this.time * 40;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(pv.path[0][0], pv.path[0][1]);
    for (const [px, py] of pv.path) ctx.lineTo(px, py);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(ex, ey, R_BALL, 0, Math.PI * 2); ctx.stroke();
    if (pv.who && !this.shootout) {
      // Green: one of yours gets it. Red: the other team does. Solid when it hits them, dashed when it stops by them.
      const r = pv.who;
      ctx.strokeStyle = r.side === this.turnSide ? '#7CFC9A' : '#ff6b5a'; ctx.lineWidth = 3;
      if (pv.end === 'rest') ctx.setLineDash([4, 5]);
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r + 7, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
    if (pv.end === 'goal') {
      ctx.fillStyle = '#ffe27a';
      ctx.beginPath(); ctx.arc(ex, ey, 6, 0, Math.PI * 2); ctx.fill();
    }
    // Power arrow from the ball.
    const L = 22 + aim.power * 70;
    ctx.strokeStyle = col; ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(bl.x + ux * (R_BALL + 4), bl.y + uy * (R_BALL + 4)); ctx.lineTo(bl.x + ux * (R_BALL + L), bl.y + uy * (R_BALL + L)); ctx.stroke();
    arrowHead(ctx, bl.x + ux * (R_BALL + L), bl.y + uy * (R_BALL + L), aim.angle, col);
    ctx.restore();
  }

  private drawAim(ctx: CanvasRenderingContext2D, d: Body, aim: { angle: number; power: number; spin: number }) {
    const ux = Math.cos(aim.angle), uy = Math.sin(aim.angle);
    const col = aim.power < 0.5 ? '#7CFC9A' : aim.power < 0.8 ? '#ffd34d' : '#ff6b5a';
    // Travel estimate: v²/(2a) with the disc's friction.
    const v = aim.power * MAX_SPEED;
    const reach = Math.min(620, (v * v) / (2 * 330 + 1.8 * v));
    // First contact with the ball along the line.
    const bl = ball(this.w);
    const rx = bl.x - d.x, ry = bl.y - d.y;
    const proj = rx * ux + ry * uy;
    const perp2 = rx * rx + ry * ry - proj * proj;
    const rr = (R_DISC + R_BALL) ** 2;
    let hit: number | null = null;
    if (proj > 0 && perp2 < rr) { const back = Math.sqrt(rr - perp2); if (proj - back < reach) hit = proj - back; }
    const len = hit ?? reach;
    ctx.save();
    ctx.setLineDash([8, 8]); ctx.lineDashOffset = -this.time * 40;
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(d.x, d.y);
    if (aim.spin) {
      const mx = d.x + ux * len * 0.5 + -uy * aim.spin * len * 0.18, my = d.y + uy * len * 0.5 + ux * aim.spin * len * 0.18;
      ctx.quadraticCurveTo(mx, my, d.x + ux * len, d.y + uy * len);
    } else ctx.lineTo(d.x + ux * len, d.y + uy * len);
    ctx.stroke();
    ctx.setLineDash([]);
    if (hit !== null) {
      const gx = d.x + ux * hit, gy = d.y + uy * hit;
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(gx, gy, R_DISC, 0, Math.PI * 2); ctx.stroke();
      const nx = bl.x - gx, ny = bl.y - gy, nl = Math.hypot(nx, ny) || 1;
      const bl2 = 60 + aim.power * 220 * (nx * ux + ny * uy) / nl;
      ctx.strokeStyle = col; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(bl.x, bl.y); ctx.lineTo(bl.x + (nx / nl) * bl2, bl.y + (ny / nl) * bl2); ctx.stroke();
      arrowHead(ctx, bl.x + (nx / nl) * bl2, bl.y + (ny / nl) * bl2, Math.atan2(ny, nx), col);
    }
    // Power arrow on the piece
    const L = 26 + aim.power * 70;
    ctx.strokeStyle = col; ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(d.x + ux * (R_DISC + 4), d.y + uy * (R_DISC + 4)); ctx.lineTo(d.x + ux * (R_DISC + L), d.y + uy * (R_DISC + L)); ctx.stroke();
    arrowHead(ctx, d.x + ux * (R_DISC + L), d.y + uy * (R_DISC + L), aim.angle, col);
    ctx.restore();
  }
}

function receiverSide(w: World, id: number): Side {
  return w.bodies.find((b) => b.id === id)!.side as Side;
}

function arrowHead(ctx: CanvasRenderingContext2D, x: number, y: number, a: number, c: string) {
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.moveTo(x + Math.cos(a) * 12, y + Math.sin(a) * 12);
  ctx.lineTo(x + Math.cos(a + 2.5) * 11, y + Math.sin(a + 2.5) * 11);
  ctx.lineTo(x + Math.cos(a - 2.5) * 11, y + Math.sin(a - 2.5) * 11);
  ctx.closePath(); ctx.fill();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + (k < 0 ? v * k : (255 - v) * k))));
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}
