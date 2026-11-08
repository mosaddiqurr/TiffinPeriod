import { Color, Vector3, type MeshBasicMaterial } from 'three';
import { createRng, type Rng } from '../../engine/rng';
import { sfx, vibrate } from '../../platform/audio';
import { DeskView } from './desk3d';
import { DESK, PENS, PenAI, PenWorld, STEP, startPoses, type Flick, type PenId } from './model';
import type { AimMsg, FlickMsg, StateMsg } from './duel';

// Pen Fight match: turns, the drag-to-flick control, the aiming marks, the computer,
// falls and points. Drawing is DeskView (Three.js); physics is PenWorld.

export interface PFConfig {
  mode: 'ai' | 'local2p' | 'online';
  diff: 'easy' | 'medium' | 'hard';
  pens: [PenId, PenId];
  target: number;
  seed?: number;
  /**
   * Online: side `me` is played here, the other side by messages (`remote`). The mover is
   * authoritative: it sends its flick, and once its own physics settles, the snapshot of
   * both pens. The other device animates the flick, then adopts the snapshot.
   */
  net?: { me: 0 | 1; g: number; starter: 0 | 1; send: (type: 'flick' | 'aim' | 'state', data: FlickMsg | AimMsg | StateMsg) => void };
}

export interface PFHud {
  scores: [number, number];
  turn: number;
  phase: Phase;
  thinking: boolean;
  /** Set while dragging: power 0..1 and where the finger is (CSS px in the canvas). */
  drag: { power: number; x: number; y: number } | null;
  point: number | null;
  selfOut: boolean;
  round: number;
  /** Flicks so far this game (online: a new clock for each). */
  seq: number;
}

export interface PFEnd { scores: [number, number]; winner: number; flicks: [number, number]; selfOuts: [number, number] }

type Phase = 'aim' | 'moving' | 'point' | 'done';

/** Pull (cm on the desk) for full power. */
const PULL_MAX = 15;
const PULL_MIN = 1.1;

export class PenFightGame {
  private view: DeskView;
  private w!: PenWorld;
  private rng: Rng;
  private ai: PenAI | null;
  private turn = 0;
  private starter = 0;
  private phase: Phase = 'aim';
  private phaseT = 0;
  private scores: [number, number] = [0, 0];
  private flicks: [number, number] = [0, 0];
  private selfOuts: [number, number] = [0, 0];
  private round = 1;
  private pointTo: number | null = null;
  private selfOut = false;
  private drag: { id: number; t: number; x: number; y: number; cx: number; cy: number; lastStep: number; max: number; touch: boolean } | null = null;
  private kb = { dir: 0, t: 0, power: 0, charging: false, used: false };
  private aiPlan: { f: Flick; t: number } | null = null;
  private aiPlanning = false;
  private falls: Array<{ i: number; t: number; x: number; y: number; z: number; vx: number; vz: number; vy: number; a: number; tilt: number; ax: [number, number]; thud: boolean }> = [];
  private raf = 0;
  private last = 0;
  private acc = 0;
  private time = 0;
  private paused = false;
  private disposed = false;
  private ro: ResizeObserver;
  private lastHud = '';
  private hitCool = 0;
  // Online
  private seq = 0;
  private auto: PenAI | null = null;
  private pendingFlicks = new Map<number, FlickMsg>();
  private snaps = new Map<number, StateMsg>();
  private snapped = false;
  private stateSent = false;
  private remoteAim: Flick | null = null;
  private shown: Flick | null = null;
  private sentKey = '';
  private sendT = 0;

  constructor(host: HTMLElement, private cfg: PFConfig, private cb: { onHud: (h: PFHud) => void; onOver: (e: PFEnd) => void; onHidden: () => void }) {
    this.rng = createRng(cfg.seed ?? (Math.random() * 2 ** 31) >>> 0);
    this.ai = cfg.mode === 'ai' ? new PenAI(1, cfg.diff, this.rng) : null;
    if (cfg.net) this.starter = cfg.net.starter;
    this.view = new DeskView(host);
    cfg.pens.forEach((id, i) => this.view.addPen(id, i, PENS[id].len, PENS[id].r));
    this.newRound(true);
    this.view.resize();
    this.ro = new ResizeObserver(() => this.view.resize());
    this.ro.observe(host);
    const cv = this.view.renderer.domElement;
    cv.addEventListener('pointerdown', this.onDown);
    cv.addEventListener('pointermove', this.onMove);
    cv.addEventListener('pointerup', this.onUp);
    cv.addEventListener('pointercancel', this.onUp);
    addEventListener('keydown', this.onKey);
    addEventListener('keyup', this.onKeyUp);
    document.addEventListener('visibilitychange', this.onVis);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  // ---------- Flow ----------

  private isHuman(i: number) { return this.cfg.net ? i === this.cfg.net.me : !(this.ai && i === 1); }

  private newRound(first = false) {
    this.w = new PenWorld(this.cfg.pens.map((id) => PENS[id]), startPoses(this.rng));
    this.falls = [];
    this.view.pens.forEach((p) => { p.root.visible = true; });
    if (!first) { this.starter = 1 - this.starter; this.round++; }
    this.turn = this.starter;
    this.startTurn();
    this.sync();
  }

  private startTurn() {
    this.phase = 'aim';
    this.phaseT = 0;
    this.drag = null;
    this.aiPlan = null;
    this.aiPlanning = false;
    const me = this.w.pens[this.turn], op = this.w.pens[1 - this.turn];
    this.kb = { dir: Math.atan2(op.y - me.y, op.x - me.x), t: 0, power: 0, charging: false, used: false };
    this.selfOut = false;
    this.pointTo = null;
    this.auto = null;
    this.remoteAim = null;
    this.emit();
  }

  private doFlick(f: Flick) {
    const net = this.cfg.net;
    if (net && this.turn === net.me) net.send('flick', { g: net.g, n: this.seq, t: f.t, dir: f.dir, power: f.power });
    this.w.flick(this.turn, f);
    this.flicks[this.turn]++;
    this.seq++;
    this.snapped = false;
    this.stateSent = false;
    this.remoteAim = null;
    this.auto = null;
    this.aiPlan = null;
    this.phase = 'moving';
    this.phaseT = 0;
    this.drag = null;
    this.view.aim.visible = false;
    this.view.zoom = 0;
    sfx('click', { pitch: 0.75 + f.power * 0.5, gain: 0.9 });
    vibrate(18);
    this.emit();
  }

  private resolve() {
    const me = this.turn, op = 1 - me;
    const out = this.w.out;
    let winner: number | null = null;
    if (out[me]) { winner = op; this.selfOut = true; this.selfOuts[me]++; }
    else if (out[op]) winner = me;
    if (winner === null) { this.turn = op; this.startTurn(); return; }
    this.scores[winner]++;
    this.pointTo = winner;
    this.phase = 'point';
    this.phaseT = 0;
    const vs = this.cfg.mode !== 'local2p';
    sfx(vs && this.isHuman(winner) ? 'fanfare' : vs ? 'bad' : 'good');
    this.emit();
  }

  private finish() {
    this.phase = 'done';
    this.emit();
    const winner = this.scores[0] > this.scores[1] ? 0 : 1;
    this.cb.onOver({ scores: [...this.scores] as [number, number], winner, flicks: [...this.flicks] as [number, number], selfOuts: [...this.selfOuts] as [number, number] });
  }

  // ---------- Input ----------

  private canAim() { return this.phase === 'aim' && this.isHuman(this.turn) && !this.paused && !this.auto; }

  private onDown = (e: PointerEvent) => {
    if (!this.canAim() || this.drag) return;
    const p = this.view.deskPoint(e.clientX, e.clientY);
    if (!p) return;
    // Generous grab area on a phone: a finger is wide.
    const slack = e.pointerType === 'touch' ? 3.6 : 2.6;
    const t = this.w.grabAt(this.turn, p[0], p[1], slack);
    if (t === null) return;
    try { (e.target as Element).setPointerCapture?.(e.pointerId); } catch { /* synthetic */ }
    const [gx, gy] = this.w.pointOn(this.turn, t);
    // A finger needs a shorter pull for full power: a pen near the screen edge has little room behind it.
    const touch = e.pointerType !== 'mouse';
    this.drag = { id: e.pointerId, t, x: gx, y: gy, cx: e.clientX, cy: e.clientY, lastStep: 0, max: touch ? PULL_MAX * 0.62 : PULL_MAX, touch };
    this.view.setFocus(gx, gy);
    sfx('tick', { gain: 0.7 });
    vibrate(8);
  };

  private onMove = (e: PointerEvent) => {
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    const p = this.view.deskPoint(e.clientX, e.clientY);
    if (!p) return;
    d.x = p[0]; d.y = p[1]; d.cx = e.clientX; d.cy = e.clientY;
    const f = this.dragFlick();
    // A tick each quarter of power, so you can feel it.
    const stepN = f ? Math.floor(f.power * 4 + 0.001) : 0;
    if (stepN !== d.lastStep) { if (stepN > d.lastStep) { sfx('tick', { pitch: 0.8 + stepN * 0.18, gain: 0.5 }); vibrate(6); } d.lastStep = stepN; }
  };

  private onUp = (e: PointerEvent) => {
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    const f = this.dragFlick();
    this.drag = null;
    this.view.zoom = 0;
    if (f) this.doFlick(f); else this.emit();
  };

  /** The flick the current drag would give: pull back from the grab point; the pen goes the other way. */
  private dragFlick(): Flick | null {
    const d = this.drag;
    if (!d) return null;
    const [gx, gy] = this.w.pointOn(this.turn, d.t);
    const px = gx - d.x, py = gy - d.y;
    const len = Math.hypot(px, py);
    if (len < PULL_MIN) return null;
    return { t: d.t, dir: Math.atan2(py, px), power: Math.min(1, (len - PULL_MIN) / (d.max - PULL_MIN)) };
  }

  private onKey = (e: KeyboardEvent) => {
    if (!this.canAim()) return;
    const k = e.code;
    if (k === 'ArrowLeft' || k === 'KeyA') this.kb.dir -= 0.06;
    else if (k === 'ArrowRight' || k === 'KeyD') this.kb.dir += 0.06;
    else if (k === 'ArrowUp' || k === 'KeyW') this.kb.t = Math.min(0.45, this.kb.t + 0.1);
    else if (k === 'ArrowDown' || k === 'KeyS') this.kb.t = Math.max(-0.45, this.kb.t - 0.1);
    else if (k === 'Space') { if (!this.kb.charging) { this.kb.charging = true; this.kb.power = 0; } }
    else return;
    this.kb.used = true;
    e.preventDefault();
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if (e.code !== 'Space' || !this.kb.charging) return;
    this.kb.charging = false;
    if (this.canAim()) this.doFlick({ t: this.kb.t, dir: this.kb.dir, power: Math.max(0.12, this.kb.power) });
  };

  private onVis = () => { if (document.hidden) this.cb.onHidden(); };

  setPaused(p: boolean) {
    if (this.paused === p) return;
    this.paused = p;
    if (p) this.drag = null;
    if (!p && !this.disposed) { this.last = performance.now(); cancelAnimationFrame(this.raf); this.raf = requestAnimationFrame(this.frame); }
  }

  // ---------- Online ----------

  /** A message from the other device. Out-of-turn or stale messages are ignored; early ones wait. */
  remote(type: string, d: FlickMsg | AimMsg | StateMsg) {
    const net = this.cfg.net;
    if (!net || this.disposed || !d || d.g !== net.g) return;
    if (type === 'flick') { const m = d as FlickMsg; if (m.n >= this.seq) this.pendingFlicks.set(m.n, m); }
    else if (type === 'state') { const m = d as StateMsg; if (m.n >= this.seq - 1) this.snaps.set(m.n, m); }
    else if (type === 'aim') {
      const m = d as AimMsg;
      if (m.n !== this.seq || this.phase !== 'aim' || this.turn === net.me) return;
      this.remoteAim = m.power >= 0 ? { t: m.t, dir: m.dir, power: m.power } : null;
    }
  }

  /** The move clock ran out: flick the pull you are holding, or let a quick plan flick for you. */
  autoFlick() {
    if (!this.cfg.net || this.phase !== 'aim' || !this.isHuman(this.turn) || this.auto || this.paused) return;
    const f = this.drag ? this.dragFlick() : null;
    this.drag = null;
    this.kb.charging = false;
    this.view.zoom = 0;
    if (f) { this.doFlick(f); return; }
    this.auto = new PenAI(this.turn, 'easy', createRng((Math.random() * 2 ** 31) >>> 0));
    this.aiPlanning = false;
    this.aiPlan = null;
    this.emit();
  }

  /** Send what we are aiming a few times a second, so the other side sees the pull-back. */
  private sendAim(dt: number) {
    this.sendT += dt;
    if (this.sendT < 0.15) return;
    this.sendT = 0;
    const net = this.cfg.net!;
    const f = this.shown;
    const key = f ? `${this.seq}|${f.t.toFixed(2)}|${f.dir.toFixed(2)}|${f.power.toFixed(2)}` : `${this.seq}|none`;
    if (key === this.sentKey) return;
    this.sentKey = key;
    net.send('aim', f ? { g: net.g, n: this.seq, t: f.t, dir: f.dir, power: f.power } : { g: net.g, n: this.seq, t: 0, dir: 0, power: -1 });
  }

  /** Adopt the mover's settled pens (floating point may differ a hair between devices). */
  private applySnap(m: StateMsg) {
    m.pens.forEach((s, i) => {
      const p = this.w.pens[i];
      if (!p) return;
      p.vx = 0; p.vy = 0; p.w = 0;
      if (s.out && !p.out) {
        p.x = s.x; p.y = s.y; p.a = s.a; p.out = true;
        const hx = DESK.w / 2, hy = DESK.d / 2;
        p.fallN = Math.abs(p.x) - hx > Math.abs(p.y) - hy ? [Math.sign(p.x) || 1, 0] : [0, Math.sign(p.y) || 1];
        this.startFall(i);
      } else if (!s.out && p.out) {
        p.out = false;
        this.falls = this.falls.filter((f) => f.i !== i);
        this.view.pens[i].root.visible = true;
      }
      if (!s.out) { p.x = s.x; p.y = s.y; p.a = s.a; }
    });
  }

  /** For tests: flick the current human pen. */
  testFlick(t: number, dir: number, power: number) { if (this.canAim()) { this.doFlick({ t, dir, power }); return true; } return false; }
  /** For tests: where things are. */
  get state() { return { phase: this.phase, turn: this.turn, seq: this.seq, scores: [...this.scores], pens: this.w.pens.map((p) => ({ x: p.x, y: p.y, a: p.a, out: p.out })) }; }
  /** For tests: screen point of a spot on pen i. */
  screenOf(i: number, t: number) { const [x, y] = this.w.pointOn(i, t); return this.view.screenPoint(x, y); }
  screenOfDesk(x: number, y: number) { return this.view.screenPoint(x, y); }

  // ---------- Loop ----------

  private frame = (now: number) => {
    if (this.disposed || this.paused) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.update(dt);
    this.sync();
    this.view.render();
    this.raf = requestAnimationFrame(this.frame);
  };

  private update(dt: number) {
    this.time += dt;
    this.phaseT += dt;
    this.hitCool = Math.max(0, this.hitCool - dt);
    if (this.phase === 'aim') {
      if (this.kb.charging) this.kb.power = Math.min(1, this.kb.power + dt * 0.85);
      if (!this.isHuman(this.turn) && this.ai) this.aiTurn(this.ai, dt, 0.5);
      if (this.auto) this.aiTurn(this.auto, dt, 0);
      const net = this.cfg.net;
      const m = net && this.turn !== net.me ? this.pendingFlicks.get(this.seq) : undefined;
      if (m) {
        this.pendingFlicks.delete(this.seq);
        this.doFlick({ t: m.t, dir: m.dir, power: m.power });
      } else if (net && this.turn === net.me && this.phase === 'aim') this.sendAim(dt);
      // Mouse drags lean in a little; a finger drag keeps the whole desk still in view.
      this.view.zoom += ((this.drag && !this.drag.touch ? 1 : 0) - this.view.zoom) * Math.min(1, dt * 6);
    }
    if (this.phase === 'moving') {
      this.acc += dt;
      const before = this.w.out;
      while (this.acc >= STEP) {
        this.w.step();
        this.acc -= STEP;
        if (this.w.hits.length && this.hitCool <= 0) {
          const j = Math.max(...this.w.hits);
          sfx('click', { pitch: 1.5 + Math.random() * 0.3, gain: Math.min(1, 0.25 + j / 900) });
          if (j > 300) vibrate(12);
          this.hitCool = 0.06;
        }
      }
      this.w.out.forEach((o, i) => { if (o && !before[i]) this.startFall(i); });
      const localDone = (this.phaseT > 0.25 && this.w.settled()) || this.phaseT > 7;
      const net = this.cfg.net;
      if (net && this.turn !== net.me) {
        // The mover's snapshot decides; animate our own copy of the flick until it is here.
        const snap = this.snaps.get(this.seq - 1);
        if (snap && (localDone || this.phaseT > 9)) {
          if (!this.snapped) { this.snapped = true; this.applySnap(snap); }
          if (this.falls.every((f) => f.t > 0.5)) this.resolve();
        }
      } else if (localDone) {
        for (const p of this.w.pens) if (!p.out) { p.vx = 0; p.vy = 0; p.w = 0; }
        if (net && !this.stateSent) {
          this.stateSent = true;
          net.send('state', { g: net.g, n: this.seq - 1, pens: this.w.pens.map((p) => ({ x: p.x, y: p.y, a: p.a, out: p.out })) });
        }
        if (this.falls.every((f) => f.t > 0.5)) this.resolve();
      }
    }
    if (this.phase === 'point' && this.phaseT > 2) {
      if (this.scores.some((s) => s >= this.cfg.target)) this.finish();
      else this.newRound();
    }
    for (const f of this.falls) this.stepFall(f, dt);
  }

  /** The computer thinks for a moment, then is seen pulling its pen back before the flick. */
  private aiTurn(ai: PenAI, dt: number, delay: number) {
    if (!this.aiPlanning && !this.aiPlan && this.phaseT > delay) { ai.start(this.w); this.aiPlanning = true; }
    if (this.aiPlanning) {
      const f = ai.work(14);
      if (f) { this.aiPlanning = false; this.aiPlan = { f, t: 0 }; this.emit(); }
      return;
    }
    if (this.aiPlan) {
      this.aiPlan.t += dt;
      if (this.aiPlan.t > 0.85) this.doFlick(this.aiPlan.f);
    }
  }

  private startFall(i: number) {
    const p = this.w.pens[i];
    const n = p.fallN ?? [0, 1];
    const out = Math.max(25, p.vx * n[0] + p.vy * n[1]);
    this.falls.push({ i, t: 0, x: p.x, y: p.y, z: p.spec.r, vx: n[0] * out + (n[0] ? 0 : p.vx * 0.5), vz: n[1] * out + (n[1] ? 0 : p.vy * 0.5), vy: 0, a: p.a, tilt: 0, ax: [-n[1], n[0]], thud: false });
    sfx('whoosh', { gain: 0.35 });
  }

  private stepFall(f: (typeof this.falls)[number], dt: number) {
    f.t += dt;
    f.vy -= 981 * dt;
    f.x += f.vx * dt; f.y += f.vz * dt; f.z += f.vy * dt;
    f.tilt += dt * 7;
    if (!f.thud && f.z < -60) { f.thud = true; sfx('thud', { pitch: 1.4, gain: 0.8 }); }
    const v = this.view.pens[f.i];
    v.root.position.set(f.x, f.z, f.y);
    v.root.rotation.set(0, -f.a, 0);
    v.root.rotateOnWorldAxis(new Vector3(f.ax[0], 0, f.ax[1]).normalize(), f.tilt);
    if (f.z < -80) v.root.visible = false;
  }

  /** Put the 3D pens where the physics says, and draw the aiming marks. */
  private sync() {
    this.w.pens.forEach((p, i) => {
      if (p.out) return;
      this.view.placePen(i, p.x, p.y, p.a);
    });
    const v = this.view;
    // Glow on the pen whose turn it is (stronger while you hold it).
    v.pens.forEach((pv, i) => {
      const mine = this.phase === 'aim' && i === this.turn && !this.w.pens[i].out;
      pv.glow.visible = mine;
      if (mine) (pv.glow.material as MeshBasicMaterial).opacity = this.drag ? 0.85 + Math.sin(this.time * 14) * 0.15 : 0.32 + Math.sin(this.time * 4) * 0.22;
    });
    let flick: Flick | null = null;
    let t = 0;
    let pull: [number, number] | null = null;
    if (this.phase === 'aim') {
      if (this.drag) { flick = this.dragFlick(); t = this.drag.t; pull = [this.drag.x, this.drag.y]; }
      else if (this.aiPlan) {
        const k = Math.min(1, this.aiPlan.t / 0.6);
        flick = { ...this.aiPlan.f, power: this.aiPlan.f.power * k };
        t = this.aiPlan.f.t;
      } else if (this.remoteAim && !this.isHuman(this.turn)) { flick = this.remoteAim; t = flick.t; }
      else if (this.kb.used && this.isHuman(this.turn)) { flick = { t: this.kb.t, dir: this.kb.dir, power: this.kb.charging ? this.kb.power : 0.25 }; t = this.kb.t; }
    }
    this.shown = flick;
    if (!flick && !this.drag) { v.aim.visible = false; this.emit(); return; }
    v.aim.visible = true;
    const [gx, gy] = this.w.pointOn(this.turn, t);
    const s = 1 + Math.sin(this.time * 9) * 0.12;
    v.grabRing.position.set(gx, 0, gy);
    v.grabRing.scale.setScalar(s * (this.drag ? 1.15 : 1));
    const col = new Color(flick ? powerColor(flick.power) : '#ffe066');
    (v.grabRing.material as MeshBasicMaterial).color.copy(col);
    if (flick) {
      if (!pull) { const L = PULL_MIN + flick.power * (PULL_MAX - PULL_MIN); pull = [gx - Math.cos(flick.dir) * L, gy - Math.sin(flick.dir) * L]; }
      // Elastic band from the grab point back to the finger.
      const bx = pull[0] - gx, by = pull[1] - gy, bl = Math.hypot(bx, by);
      v.band.visible = bl > 0.3;
      v.band.position.set((gx + pull[0]) / 2, 0.01, (gy + pull[1]) / 2);
      v.band.rotation.set(-Math.PI / 2, 0, -Math.atan2(by, bx));
      v.band.scale.set(bl, 0.55 + flick.power * 0.5, 1);
      (v.band.material as MeshBasicMaterial).color.copy(col);
      (v.band.material as MeshBasicMaterial).opacity = 0.55;
      // Big arrow the way the pen will go.
      const L = 5 + flick.power * 15;
      v.arrow.visible = true;
      v.arrow.position.set(gx, 0.02, gy);
      v.arrow.rotation.set(-Math.PI / 2, 0, -flick.dir);
      v.arrow.scale.set(L, 1 + flick.power * 0.6, 1);
      (v.arrow.material as MeshBasicMaterial).color.copy(col);
      this.drawPath(flick);
    } else {
      v.band.visible = false; v.arrow.visible = false; v.hitRing.visible = false;
      for (const d of v.path) d.visible = false;
    }
    this.emit();
  }

  /** The first part of the pen's path (a guide, not the whole answer), and a ring if it meets the other pen. */
  private drawPath(f: Flick) {
    const v = this.view;
    const sim = this.w.clone();
    sim.flick(this.turn, f);
    const pts: Array<[number, number]> = [];
    let hit: [number, number] | null = null;
    const op = 1 - this.turn;
    const total = 2.2;
    let travelled = 0;
    let px = sim.pens[this.turn].x, py = sim.pens[this.turn].y;
    // Show about 45% of the slide (the full slide length is worked out once per aim).
    const key = `${this.turn}|${f.t.toFixed(3)}|${f.dir.toFixed(3)}|${f.power.toFixed(3)}`;
    if (this.fullKey !== key) { this.fullKey = key; this.fullLen = this.slideLength(f); }
    const full = this.fullLen;
    for (let i = 0; i < total / STEP; i++) {
      const bOp = sim.pens[op].vx === 0 && sim.pens[op].vy === 0;
      sim.step();
      const p = sim.pens[this.turn];
      travelled += Math.hypot(p.x - px, p.y - py);
      px = p.x; py = p.y;
      if (i % 6 === 0) pts.push([p.x, p.y]);
      if (bOp && (sim.pens[op].vx !== 0 || sim.pens[op].vy !== 0)) { hit = [p.x, p.y]; break; }
      if (p.out || travelled > full * 0.45 || sim.settled()) break;
    }
    const n = Math.min(v.path.length, pts.length);
    const step = pts.length > v.path.length ? pts.length / v.path.length : 1;
    v.path.forEach((d, k) => {
      const idx = Math.floor(k * step);
      d.visible = k < n && idx < pts.length;
      if (!d.visible) return;
      d.position.set(pts[idx][0], 0.01, pts[idx][1]);
      const fade = 1 - k / Math.max(1, n);
      (d.material as MeshBasicMaterial).opacity = 0.25 + fade * 0.65;
      d.scale.setScalar(0.7 + fade * 0.5);
    });
    v.hitRing.visible = !!hit;
    if (hit) { v.hitRing.position.set(hit[0], 0.01, hit[1]); v.hitRing.scale.setScalar(1 + Math.sin(this.time * 10) * 0.12); }
  }

  private fullKey = '';
  private fullLen = 0;
  private slideLength(f: Flick): number {
    const c = this.w.clone();
    c.flick(this.turn, f);
    let d = 0, lx = c.pens[this.turn].x, ly = c.pens[this.turn].y;
    for (let i = 0; i < 1400 && !(i > 10 && c.settled()); i++) {
      c.step();
      const p = c.pens[this.turn];
      d += Math.hypot(p.x - lx, p.y - ly); lx = p.x; ly = p.y;
      if (p.out) break;
    }
    return d;
  }

  private emit() {
    const f = this.drag ? this.dragFlick() : null;
    let dragInfo: PFHud['drag'] = null;
    if (this.drag) {
      const r = this.view.renderer.domElement.getBoundingClientRect();
      dragInfo = { power: f?.power ?? 0, x: this.drag.cx - r.left, y: this.drag.cy - r.top };
    } else if (this.kb.charging) dragInfo = { power: this.kb.power, x: -1, y: -1 };
    const h: PFHud = {
      scores: [...this.scores] as [number, number], turn: this.turn, phase: this.phase,
      thinking: this.phase === 'aim' && !this.isHuman(this.turn), drag: dragInfo, point: this.pointTo, selfOut: this.selfOut, round: this.round, seq: this.seq,
    };
    const key = JSON.stringify([h.scores, h.turn, h.phase, h.thinking, h.point, h.selfOut, h.round, h.seq, dragInfo ? [Math.round(dragInfo.power * 100), Math.round(dragInfo.x), Math.round(dragInfo.y)] : null]);
    if (key === this.lastHud) return;
    this.lastHud = key;
    this.cb.onHud(h);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    const cv = this.view.renderer.domElement;
    cv.removeEventListener('pointerdown', this.onDown);
    cv.removeEventListener('pointermove', this.onMove);
    cv.removeEventListener('pointerup', this.onUp);
    cv.removeEventListener('pointercancel', this.onUp);
    removeEventListener('keydown', this.onKey);
    removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('visibilitychange', this.onVis);
    this.view.dispose();
  }
}

export function powerColor(p: number): string {
  return p < 0.4 ? '#5ee07a' : p < 0.75 ? '#ffd23f' : '#ff5a4a';
}

export { DESK };
