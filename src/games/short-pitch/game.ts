import { Mesh, PerspectiveCamera, Plane, Raycaster, Vector2, Vector3, WebGLRenderer, type Material, type Object3D, type Texture } from 'three';
import { createRng, type Rng } from '../../engine/rng';
import { sfx, vibrate } from '../../platform/audio';
import { addBall, currentOver, decideMatch, inningsComplete, newInnings, type BallEvent, type Innings, type Limits } from '../../shared/cricket';
import {
  BATTER_X, CONTACT_Y, FIELD, FIELD_POS, Play, aiBat, aiDelivery, ballOnPath, judge, launch, makeDelivery, plan,
  type DType, type Delivery, type Diff, type Planned, type Shot, type Timing,
} from './sim';
import {
  buildWorld, makePlayer, paintRig, poseArmsUp, poseBat, poseBowl, poseCarryBat, poseKeeper, poseReady, poseRun, poseThrow, toV,
  type BatKind, type Rig, type World,
} from './world';

// The 3D Short-Pitch Cricket match: the state machine, the Three.js view,
// the camera and the input. React only draws the HUD and the buttons.

export type SPMode = 'ai' | 'local2p';
export interface SPConfig {
  mode: SPMode;
  diff: Diff;
  overs: number;
  wickets: number;
  /** The side that bats first: 0 = Player 1, 1 = Player 2 or the computer. */
  first: 0 | 1;
  reducedMotion: boolean;
  seed?: number;
}

export type Phase = 'pick' | 'windup' | 'delivery' | 'play' | 'result' | 'break' | 'done';
export type BannerKey = 'four' | 'sixOut' | 'caught' | 'bowled' | 'runOut' | 'runs' | 'dot' | 'wide' | 'dropped' | 'break' | 'won' | 'tied';
export interface Banner { key: BannerKey; n?: number; side?: 0 | 1; kind: 'good' | 'out' | 'plain'; id: number; small?: boolean }
export interface BatterLine { no: number; runs: number; balls: number }

export interface HudState {
  phase: Phase;
  inn: 0 | 1;
  batSide: 0 | 1;
  scores: Array<{ runs: number; wickets: number; balls: number }>;
  target: number | null;
  need: { runs: number; balls: number } | null;
  over: string[];
  banner: Banner | null;
  timing: { t: Timing; dt: number; id: number } | null;
  dtype: DType;
  current: DType | null;
  humanBats: boolean;
  humanBowls: boolean;
  canShot: boolean;
  canRun: boolean;
  runSafe: boolean | null;
  running: boolean;
  runs: number;
  striker: BatterLine;
  partner: BatterLine;
}

export interface SPResult {
  innings: [Innings, Innings];
  battingFirst: 0 | 1;
  winnerSide: 0 | 1 | null;
  kind: 'runs' | 'wickets' | 'tie';
  margin: number;
  fours: [number, number];
  best: [BatterLine | null, BatterLine | null];
}

export interface SPCallbacks {
  onHud: (h: HudState) => void;
  onOver: (r: SPResult) => void;
  onHidden?: () => void;
}

export const TEAM = [
  { shirt: '#13804f', cap: '#e0333f', dot: '#16a061' },
  { shirt: '#2457a6', cap: '#ffd23f', dot: '#3f7ee0' },
] as const;

const STEP = 1 / 120;
const WINDUP = 0.62;      // the standing bowling action until release
const RELEASE_K = 0.62;   // the share of poseBowl() at the release
const RESULT_T = 1.9;
const STANCE = { x: -0.62, y: 1.0 };
const END_Y = [1.0, FIELD.pitch - 1.0];
const LANE_X = [-1.05, -0.45];
// The bowler stands so that the hand meets the release point (see plan()).
// The fielders' rigs are mirrored, so their "armR" is the right arm (a right-arm bowler).
const BOWLER = { x: 0.34, y: FIELD.pitch - 0.3 };
const HAND_X = 0.24;
const KEEPER_SPOT = { x: 0, y: -3.2 };
const NON_STRIKER = { x: -2.0, y: FIELD.pitch - 0.4 };
// The broadcast camera: high behind the bowler, so the off side is on the left.
const BROADCAST = { pos: [-0.35, 7.4, -33] as [number, number, number], look: [-0.3, 0.85, -0.6] as [number, number, number], dist: 32.5 };
const BOWLCAM = { pos: [0.3, 8.2, -(FIELD.pitch + 7.5)] as [number, number, number], look: [0, 0, -4.2] as [number, number, number] };

const TIMING_SCALE: Record<Diff, number> = { easy: 1.3, medium: 1, hard: 0.85 };
// Catch success when the computer fields against a human batter.
const AI_CATCH: Record<Diff, number> = { easy: 0.55, medium: 0.72, hard: 0.85 };
// Catch success for the human's fielders when the computer bats.
const OWN_CATCH: Record<Diff, number> = { easy: 0.85, medium: 0.76, hard: 0.68 };
const AI_RUN_MARGIN: Record<Diff, number> = { easy: 0.45, medium: 0.28, hard: 0.15 };

interface Press { shot: Shot; aim: number | null; t: number }
interface Swing { kind: BatKind; side: number; t: number }
interface Bail { m: Mesh; vx: number; vy: number; vz: number; spin: number; home: [number, number, number] }

export class ShortPitchGame {
  private renderer: WebGLRenderer;
  private camera = new PerspectiveCamera(36, 1, 0.1, 400);
  private w: World;
  private rng: Rng;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private paused = false;
  private disposed = false;
  private clock = 0;
  timeScale = 1;
  private slowT = 0;
  private ro: ResizeObserver | null = null;
  private minimap: HTMLCanvasElement | null = null;

  // Match
  private lim: Limits;
  private innings: [Innings, Innings] = [newInnings(), newInnings()];
  private cur: 0 | 1 = 0;
  private battingFirst: 0 | 1;
  private phase: Phase = 'pick';
  private phaseT = 0;
  private dtype: DType = 'medium';
  private aimTarget = { x: 0.1, y: 3.2 };
  private p: Planned | null = null;
  private t = 0;
  private press: Press | null = null;
  private aiPress: Press | null = null;
  private resolved = false;
  private missed = false;
  private bounced = false;
  private stumpsDone = false;
  private play: Play | null = null;
  private stick: { x: number; y: number } | null = null;
  private keys = new Set<string>();
  private banner: Banner | null = null;
  private timing: HudState['timing'] = null;
  private ids = 0;
  private fours: [number, number] = [0, 0];
  private runSafe: boolean | null = null;
  private safeT = 0;
  private overSent = false;
  private lastOut: 'bowled' | 'caught' | 'six-out' | 'run-out' | null = null;
  private lastFour = false;

  // Batters: rig 0 and rig 1; atEnd[e] = the rig at end e (0 = the batting end)
  private batters: [Rig, Rig];
  private atEnd: [number, number] = [0, 1];
  private batNo: [number, number] = [1, 2];
  private nextNo = 3;
  private stats: Array<Map<number, BatterLine>> = [new Map(), new Map()];
  private swing: Swing | null = null;
  private fielders: Rig[];
  private throwAnim = new Map<number, number>();
  private faceY: number[] = [];
  private runPhase: number[] = [];
  private bails: Bail[] = [];
  private stumpTilt = { near: 0, far: 0 };
  private lastBall = new Vector3(0, 1, 0);
  private camPos = new Vector3(...BROADCAST.pos);
  private camLook = new Vector3(...BROADCAST.look);
  private camDir = new Vector3(0, 0, -1);
  private orbitA = 0;
  private camCut = false;
  private camMode: 'bat' | 'bowl' | 'follow' | 'orbit' = 'bat';

  private ray = new Raycaster();
  private ground = new Plane(new Vector3(0, 1, 0), 0);
  private tmp = new Vector3();
  private swipe: { id: number; x: number; y: number; t: number; done: boolean } | null = null;

  constructor(private host: HTMLElement, private cfg: SPConfig, private cb: SPCallbacks) {
    this.rng = createRng(cfg.seed);
    this.lim = { wickets: cfg.wickets, balls: cfg.overs * 6 };
    this.battingFirst = cfg.first;
    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
    const cv = this.renderer.domElement;
    cv.style.display = 'block'; cv.style.width = '100%'; cv.style.height = '100%'; cv.style.touchAction = 'none';
    cv.setAttribute('aria-label', '3D cricket field');
    host.appendChild(cv);
    this.w = buildWorld();
    this.batters = [this.mkBatter(), this.mkBatter()];
    this.fielders = [];
    for (let i = 0; i < 9; i++) {
      const r = makePlayer(TEAM[1].shirt, { cap: TEAM[1].cap, keeper: i === 0, pads: i === 0 });
      r.root.scale.x = -1;
      this.w.scene.add(r.root);
      this.fielders.push(r);
      this.faceY.push(0);
      this.runPhase.push(0);
    }
    for (const b of [...this.w.stumps.nearBails, ...this.w.stumps.farBails]) this.bails.push({ m: b, vx: 0, vy: 0, vz: 0, spin: 0, home: [b.position.x, b.position.y, b.position.z] });
    this.paintTeams();
    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    cv.addEventListener('pointerdown', this.onPointerDown);
    cv.addEventListener('pointermove', this.onPointerMove);
    cv.addEventListener('pointerup', this.onPointerUp);
    cv.addEventListener('pointercancel', this.onPointerUp);
    addEventListener('keydown', this.onKeyDown);
    addEventListener('keyup', this.onKeyUp);
    document.addEventListener('visibilitychange', this.onVis);
    this.startBall();
    this.updateBoard();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private mkBatter() {
    const r = makePlayer(TEAM[0].shirt, { helmet: true, pads: true, bat: true });
    this.w.scene.add(r.root);
    return r;
  }

  // ---------- Who does what ----------
  private get batSide(): 0 | 1 { return (this.cur === 0 ? this.battingFirst : 1 - this.battingFirst) as 0 | 1; }
  private get bowlSide(): 0 | 1 { return (1 - this.batSide) as 0 | 1; }
  private isHuman(side: number) { return this.cfg.mode === 'local2p' || side === 0; }
  private get humanBats() { return this.isHuman(this.batSide); }
  private get humanBowls() { return this.isHuman(this.bowlSide); }
  private get targetRuns(): number | null { return this.cur === 1 ? this.innings[0].runs + 1 : null; }

  private paintTeams() {
    const bt = TEAM[this.batSide], ft = TEAM[this.bowlSide];
    for (const b of this.batters) paintRig(b, bt.shirt);
    for (const f of this.fielders) paintRig(f, ft.shirt, ft.cap);
  }

  // ---------- Public input ----------
  setMinimap(c: HTMLCanvasElement | null) { this.minimap = c; this.drawMinimap(); }

  setPaused(p: boolean) {
    if (this.paused === p) return;
    this.paused = p;
    if (!p && !this.disposed) { this.last = performance.now(); cancelAnimationFrame(this.raf); this.raf = requestAnimationFrame(this.frame); }
  }

  /** The direction stick: screen vector (x right, y down), length 0..1, or null = natural shot. */
  setStick(v: { x: number; y: number } | null) { this.stick = v; }

  private currentAim(): number | null {
    let v = this.stick;
    if (!v) {
      const kx = (this.keys.has('ArrowRight') || this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('ArrowLeft') || this.keys.has('KeyA') ? 1 : 0);
      const ky = (this.keys.has('ArrowDown') || this.keys.has('KeyS') ? 1 : 0) - (this.keys.has('ArrowUp') || this.keys.has('KeyW') ? 1 : 0);
      if (kx || ky) v = { x: kx, y: ky };
    }
    if (!v || Math.hypot(v.x, v.y) < 0.25) return null;
    // Up = straight back past the bowler, left = off side, right = leg side, down = behind.
    return Math.atan2(-v.x, -v.y);
  }

  shot(kind: Shot, aimOverride?: number | null) {
    if (this.paused || !this.humanBats) return;
    if (this.phase !== 'windup' && this.phase !== 'delivery') return;
    if (this.press) return;
    const aim = aimOverride !== undefined ? aimOverride : this.currentAim();
    const t = this.phase === 'windup' ? -(WINDUP - this.phaseT) : this.t;
    this.doPress({ shot: kind, aim, t });
  }

  run() {
    if (this.paused || !this.humanBats || this.phase !== 'play' || !this.play) return;
    this.play.callRun();
    sfx('tick', { gain: 0.6 });
    this.emit();
  }

  pickType(t: DType) {
    if (!this.humanBowls || this.phase !== 'pick') return;
    this.dtype = t;
    sfx('click');
    this.emit();
  }

  moveTarget(dx: number, dy: number) {
    if (!this.humanBowls || this.phase !== 'pick') return;
    this.setTarget(this.aimTarget.x + dx, this.aimTarget.y + dy);
  }

  bowl() {
    if (this.paused || !this.humanBowls || this.phase !== 'pick') return;
    this.startWindup(makeDelivery(this.dtype, this.aimTarget.x, this.aimTarget.y, this.rng, 0.95));
  }

  private setTarget(x: number, y: number) {
    this.aimTarget = { x: Math.max(-1.1, Math.min(1.1, x)), y: Math.max(0.7, Math.min(FIELD.pitch - 2.2, y)) };
  }

  // ---------- The ball ----------
  private startBall() {
    this.p = null; this.press = null; this.aiPress = null;
    this.resolved = false; this.missed = false; this.bounced = false; this.stumpsDone = false;
    this.play = null; this.swing = null; this.banner = null; this.runSafe = null;
    this.lastOut = null; this.lastFour = false;
    this.phase = 'pick'; this.phaseT = 0; this.t = 0;
    this.throwAnim.clear();
    this.resetStumps();
    this.emit();
  }

  private startWindup(d: Delivery) {
    this.p = plan(d);
    this.phase = 'windup';
    this.phaseT = 0;
    this.t = 0;
    this.press = null;
    this.aiPress = null;
    if (!this.humanBats) {
      const tg = this.targetRuns;
      const inn = this.innings[this.cur];
      const ai = aiBat(this.p, this.cfg.diff, this.rng, tg !== null ? tg - inn.runs : undefined, this.lim.balls !== null ? this.lim.balls - inn.balls : undefined);
      if (this.p.reachable || this.rng.chance(0.2)) this.aiPress = { shot: ai.shot, aim: ai.aim, t: this.p.tContact + ai.dt };
    }
    sfx('whoosh', { gain: 0.2, pitch: 0.7 });
    this.emit();
  }

  private doPress(pr: Press) {
    this.press = pr;
    this.swing = { kind: pr.shot, side: pr.aim ?? 0, t: 0 };
    sfx('whoosh', { gain: 0.35, pitch: pr.shot === 'defend' ? 1.4 : 1 });
    if (this.resolved) {
      // Too late: the ball is already past the bat.
      this.timing = { t: 'late', dt: 0.25, id: ++this.ids };
      this.emit();
    }
  }

  private stepDelivery(dt: number) {
    const p = this.p!;
    this.t += dt;
    if (this.aiPress && !this.press && this.t >= this.aiPress.t) this.doPress(this.aiPress);
    if (!this.bounced && this.t >= p.bounceT) { this.bounced = true; sfx('thud', { gain: 0.3, pitch: 1.3 }); }
    if (!this.resolved) {
      const pr = this.press;
      if (pr && pr.t <= p.tLate && this.t >= Math.max(pr.t, p.tContact)) this.resolve(pr);
      else if (this.t >= p.tLate) { this.resolved = true; this.missed = true; }
      if (this.phase !== 'delivery') return;
    }
    if (this.missed) {
      if (p.hitsStumps && !this.stumpsDone && this.t >= p.tStumps) {
        this.stumpsDone = true;
        this.breakStumps('near', 1);
        this.slow(0.7);
        this.finishBall({ runs: 0, out: true, legal: true }, 'bowled');
        return;
      }
      const end = p.path[p.path.length - 1].t;
      if (this.t >= Math.min(end, (p.tStumps > 0 ? p.tStumps : end) + 0.2)) {
        if (!p.reachable) this.finishBall({ runs: 1, out: false, legal: false, extra: 'wd' }, 'wide');
        else this.finishBall({ runs: 0, out: false, legal: true }, 'dot');
      }
    }
  }

  private resolve(pr: Press) {
    const p = this.p!;
    this.resolved = true;
    const dt = pr.t - p.tContact;
    const scale = this.humanBats ? TIMING_SCALE[this.cfg.diff] : 1;
    const j = judge(pr.shot, dt, p, scale);
    this.timing = { t: j.timing, dt, id: ++this.ids };
    if (j.timing === 'miss') { this.missed = true; this.emit(); return; }
    const l = launch(pr.shot, pr.aim, dt, j, p, this.rng);
    const at = ballOnPath(p, this.t);
    const catchSkill = this.cfg.mode === 'local2p' ? 0.72 : this.humanBats ? AI_CATCH[this.cfg.diff] : OWN_CATCH[this.cfg.diff];
    this.play = new Play(l, this.rng, catchSkill, { x: at.x, y: Math.max(0.3, at.y), h: Math.max(0.2, at.h) });
    this.camDir.set(Math.sin(l.dir), 0, -Math.cos(l.dir));
    this.camCut = true;
    sfx('click', { pitch: j.timing === 'perfect' ? 0.55 : j.timing === 'edge' ? 1.5 : 0.8, gain: 1 });
    if (j.timing === 'perfect' && this.humanBats) vibrate(15);
    this.phase = 'play';
    this.phaseT = 0;
    this.emit();
  }

  private stepPlay(dt: number) {
    const pl = this.play!;
    if (!this.humanBats && pl.wantRuns === 0 && (!pl.running || pl.runners[0].p > 0.72) && pl.safeToRun(AI_RUN_MARGIN[this.cfg.diff])) pl.callRun();
    pl.step(dt);
    const tg = this.targetRuns;
    if (tg !== null && !pl.dead && !pl.out && this.innings[1].runs + pl.runs >= tg) pl.end();
    let changed = false;
    for (const e of pl.takeEvents()) {
      changed = true;
      if (e.type === 'four') { sfx('fanfare'); sfx('clap'); }
      else if (e.type === 'six-out') sfx('bad');
      else if (e.type === 'caught') { sfx('pop'); this.slow(0.6); }
      else if (e.type === 'drop') { sfx('bad', { gain: 0.5 }); this.flash('dropped'); }
      else if (e.type === 'gather') sfx('pop', { gain: 0.5, pitch: 0.8 });
      else if (e.type === 'throw') { sfx('whoosh', { gain: 0.3 }); if (e.who !== undefined) this.throwAnim.set(e.who, 0); }
      else if (e.type === 'run') sfx('tick', { gain: 0.4 });
      else if (e.type === 'bounce') sfx('thud', { gain: 0.25 });
      else if (e.type === 'miss-throw') sfx('boing', { gain: 0.4 });
      else if (e.type === 'run-out') { this.breakStumps(pl.throwTo === 0 ? 'near' : 'far', 1); this.slow(0.6); }
    }
    if (this.humanBats && this.cfg.diff === 'easy') {
      this.safeT -= dt;
      if (this.safeT <= 0) {
        this.safeT = 0.12;
        const s = pl.dead ? null : pl.safeToRun(0.1);
        if (s !== this.runSafe) { this.runSafe = s; changed = true; }
      }
    }
    if (pl.dead) { this.finishPlay(); return; }
    if (changed) this.emit();
  }

  private finishPlay() {
    const pl = this.play!;
    const out = pl.out;
    const runs = pl.four ? 4 : out === 'caught' || out === 'six-out' ? 0 : pl.runs;
    const label: BannerKey = pl.four ? 'four' : out === 'caught' ? 'caught' : out === 'six-out' ? 'sixOut' : out === 'run-out' ? 'runOut' : runs > 0 ? 'runs' : 'dot';
    this.finishBall({ runs, out: out !== null, legal: true }, label);
  }

  private finishBall(ev: BallEvent, label: BannerKey) {
    if (this.phase === 'result') return;
    const c = this.cur;
    const strikerNo = this.batNo[0];
    this.innings[c] = addBall(this.innings[c], { ...ev, batter: strikerNo });
    const line = this.line(strikerNo);
    if (ev.extra !== 'wd') { line.runs += ev.runs; if (ev.legal) line.balls++; }
    if (label === 'four') this.fours[this.batSide]++;
    this.lastFour = label === 'four';
    this.lastOut = label === 'bowled' ? 'bowled' : label === 'caught' ? 'caught' : label === 'sixOut' ? 'six-out' : label === 'runOut' ? 'run-out' : null;
    this.moveBatters(label);
    const kind: Banner['kind'] = ev.out ? 'out' : label === 'four' ? 'good' : 'plain';
    this.banner = { key: label, n: ev.runs, kind, id: ++this.ids };
    if (ev.out) { sfx('out'); vibrate([30, 40, 60]); }
    else if (label === 'runs') sfx('good', { pitch: 0.8 + ev.runs * 0.1 });
    else if (label === 'wide') sfx('bad', { gain: 0.5 });
    this.phase = 'result';
    this.phaseT = 0;
    this.updateBoard();
    this.emit();
  }

  /** Change ends after odd runs, and bring in a new batter after a wicket. */
  private moveBatters(label: BannerKey) {
    const pl = this.play;
    if (label === 'runOut' && pl) {
      const k = pl.outRunner;
      const E = pl.throwTo;
      const survivor = 1 - k;
      const rigOut = this.atEnd[k], rigSurv = this.atEnd[survivor];
      const noSurv = this.batNo[survivor];
      this.atEnd[1 - E] = rigSurv; this.batNo[1 - E] = noSurv;
      this.atEnd[E] = rigOut; this.batNo[E] = this.nextNo++;
      return;
    }
    if (label === 'bowled' || label === 'caught' || label === 'sixOut') {
      this.batNo[0] = this.nextNo++;
      return;
    }
    if (label === 'runs' && pl && pl.runs % 2 === 1) {
      this.atEnd = [this.atEnd[1], this.atEnd[0]];
      this.batNo = [this.batNo[1], this.batNo[0]];
    }
  }

  private line(no: number): BatterLine {
    const m = this.stats[this.cur];
    let l = m.get(no);
    if (!l) { l = { no, runs: 0, balls: 0 }; m.set(no, l); }
    return l;
  }

  private afterBall() {
    const inn = this.innings[this.cur];
    const tg = this.targetRuns;
    if (inningsComplete(inn, this.lim, tg ?? undefined)) {
      if (this.cur === 0) {
        this.phase = 'break';
        this.phaseT = 0;
        this.banner = { key: 'break', n: inn.runs + 1, kind: 'plain', id: ++this.ids };
        sfx('whistle');
        this.emit();
        return;
      }
      this.finishMatch();
      return;
    }
    this.startBall();
  }

  private startInnings2() {
    this.cur = 1;
    this.atEnd = [0, 1];
    this.batNo = [1, 2];
    this.nextNo = 3;
    this.paintTeams();
    this.updateBoard();
    this.startBall();
  }

  private finishMatch() {
    this.phase = 'done';
    this.phaseT = 0;
    const r = decideMatch(this.innings[0], this.innings[1], this.lim);
    const winnerSide = r.winner === null ? null : r.winner === 0 ? this.battingFirst : ((1 - this.battingFirst) as 0 | 1);
    this.banner = winnerSide === null ? { key: 'tied', kind: 'plain', id: ++this.ids } : { key: 'won', side: winnerSide, kind: 'good', id: ++this.ids };
    sfx('fanfare');
    this.emit();
  }

  private result(): SPResult {
    const r = decideMatch(this.innings[0], this.innings[1], this.lim);
    const winnerSide = r.winner === null ? null : r.winner === 0 ? this.battingFirst : ((1 - this.battingFirst) as 0 | 1);
    const best = (i: number) => [...this.stats[i].values()].sort((a, b) => b.runs - a.runs || a.balls - b.balls)[0] ?? null;
    const bySide: [BatterLine | null, BatterLine | null] = [null, null];
    bySide[this.battingFirst] = best(0);
    bySide[1 - this.battingFirst] = best(1);
    return { innings: this.innings, battingFirst: this.battingFirst, winnerSide, kind: r.kind, margin: r.margin, fours: this.fours, best: bySide };
  }

  private flash(key: BannerKey) {
    this.banner = { key, kind: 'plain', id: ++this.ids, small: true };
    this.emit();
  }

  private slow(t: number) { if (!this.cfg.reducedMotion) this.slowT = t; }

  // ---------- Stumps ----------
  private breakStumps(which: 'near' | 'far', power: number) {
    sfx('crunch');
    const list = which === 'near' ? this.bails.slice(0, 2) : this.bails.slice(2);
    const dir = which === 'near' ? 1 : -1;
    for (const b of list) { b.vx = this.rng.range(-1.2, 1.2) * power; b.vy = this.rng.range(2.2, 3.6) * power; b.vz = dir * this.rng.range(0.8, 2) * power; b.spin = this.rng.range(-14, 14); }
    if (which === 'near') this.stumpTilt.near = 0.0001; else this.stumpTilt.far = 0.0001;
  }

  private resetStumps() {
    for (const b of this.bails) { b.vx = b.vy = b.vz = b.spin = 0; b.m.position.set(...b.home); b.m.rotation.set(0, 0, 0); }
    this.stumpTilt = { near: 0, far: 0 };
    for (const g of [this.w.stumps.near, this.w.stumps.far]) for (const c of g.children.slice(0, 3)) c.rotation.set(0, 0, 0);
  }

  private stepBails(dt: number) {
    for (const b of this.bails) {
      if (!b.vx && !b.vy && !b.vz) continue;
      b.vy -= 9.8 * dt;
      b.m.position.x += b.vx * dt; b.m.position.y += b.vy * dt; b.m.position.z += b.vz * dt;
      b.m.rotation.z += b.spin * dt; b.m.rotation.x += b.spin * 0.7 * dt;
      if (b.m.position.y <= 0.012) { b.m.position.y = 0.012; b.vx *= 0.5; b.vz *= 0.5; b.vy = Math.abs(b.vy) > 1 ? -b.vy * 0.3 : 0; b.spin *= 0.5; if (Math.abs(b.vx) + Math.abs(b.vz) < 0.05) { b.vx = b.vz = 0; } }
    }
    for (const which of ['near', 'far'] as const) {
      const k = this.stumpTilt[which];
      if (k <= 0) continue;
      const n = Math.min(1, k + dt * 4);
      this.stumpTilt[which] = n;
      const g = which === 'near' ? this.w.stumps.near : this.w.stumps.far;
      const s = which === 'near' ? -1 : 1;
      g.children[1].rotation.x = s * 0.35 * n; g.children[0].rotation.z = 0.2 * n; g.children[2].rotation.z = -0.15 * n;
    }
  }

  // ---------- Main loop ----------
  private frame = (now: number) => {
    if (this.disposed) return;
    const real = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    if (this.paused) { this.render(); return; }
    this.raf = requestAnimationFrame(this.frame);
    let scale = this.timeScale;
    if (this.slowT > 0) { this.slowT -= real; scale *= 0.35; }
    this.acc += real * scale;
    let n = 0;
    const max = 24 * Math.max(1, Math.ceil(this.timeScale));
    while (this.acc >= STEP && n < max) { this.step(STEP); this.acc -= STEP; n++; }
    if (n >= max) this.acc = 0;
    this.clock += real;
    this.updateView(real * Math.max(0.35, Math.min(1, scale)));
    this.render();
  };

  private step(dt: number) {
    this.phaseT += dt;
    if (this.swing) this.swing.t += dt;
    for (const [k, v] of this.throwAnim) this.throwAnim.set(k, v + dt);
    this.stepBails(dt);
    switch (this.phase) {
      case 'pick':
        if (!this.humanBowls && this.phaseT > 0.85) this.startWindup(aiDelivery(this.cfg.diff, this.rng));
        break;
      case 'windup':
        if (this.phaseT >= WINDUP) { this.phase = 'delivery'; this.phaseT = 0; this.t = 0; }
        break;
      case 'delivery': this.stepDelivery(dt); break;
      case 'play': this.stepPlay(dt); break;
      case 'result': if (this.phaseT > RESULT_T) this.afterBall(); break;
      case 'break': if (this.phaseT > 2.8) this.startInnings2(); break;
      case 'done':
        if (!this.overSent && this.phaseT > 1.6) { this.overSent = true; this.cb.onOver(this.result()); }
        break;
    }
  }

  private render() {
    this.renderer.render(this.w.scene, this.camera);
  }

  private resize() {
    const r = this.host.getBoundingClientRect();
    const w = Math.max(1, r.width), h = Math.max(1, r.height);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = this.fovFor(this.camMode);
    this.camera.updateProjectionMatrix();
    if (this.paused) this.render();
  }

  // ---------- The view ----------
  private updateView(dt: number) {
    const k = (rate: number) => 1 - Math.exp(-dt * rate);
    const ph = this.phase;
    const pl = this.play;
    const ballPos = this.tmp;

    // --- Ball position ---
    if (ph === 'pick' || ph === 'windup') {
      this.fielders[8].root.updateMatrixWorld(true);
      this.fielders[8].handR.getWorldPosition(ballPos);
    } else if (pl) {
      const b = pl.ball;
      ballPos.set(...toV(b.x, Math.max(0.11, b.h), b.y));
    } else if (this.p) {
      const end = this.p.path[this.p.path.length - 1];
      if (this.missed && this.t >= end.t) ballPos.set(...toV(KEEPER_SPOT.x, 0.7, KEEPER_SPOT.y + 0.4));
      else { const q = ballOnPath(this.p, this.t); ballPos.set(...toV(q.x, Math.max(0.11, q.h), q.y)); }
    } else ballPos.copy(this.lastBall);
    this.lastBall.copy(ballPos);
    this.w.ball.position.copy(ballPos);
    this.w.shadow.position.set(ballPos.x, 0.016, ballPos.z);
    const sh = Math.max(0, ballPos.y - 0.11);
    this.w.shadow.scale.setScalar(1 + sh * 0.15);
    (this.w.shadow.material as Material & { opacity: number }).opacity = Math.max(0.08, 0.32 - sh * 0.03);

    // --- Target marker and length zones ---
    const showZones = ph === 'pick' && this.humanBowls;
    this.w.zones.visible = showZones;
    const mk = this.w.marker;
    if (showZones) {
      mk.visible = true;
      mk.position.set(...toV(this.aimTarget.x, 0.035, this.aimTarget.y));
      mk.scale.setScalar(1 + Math.sin(this.clock * 6) * 0.12);
      (mk.material as Material & { color: { set: (c: string) => void } }).color.set('#e0333f');
    } else if (this.p && this.cfg.diff === 'easy' && this.humanBats && (ph === 'windup' || (ph === 'delivery' && this.t < this.p.bounceT + 0.1))) {
      mk.visible = true;
      mk.position.set(...toV(this.p.d.tx, 0.035, this.p.d.ty));
      mk.scale.setScalar(1);
      (mk.material as Material & { color: { set: (c: string) => void } }).color.set('#ffd23f');
    } else mk.visible = false;

    // --- Aim arrow ---
    const aim = this.humanBats && (ph === 'pick' || ph === 'windup' || ph === 'delivery') && !this.press ? this.currentAim() : null;
    this.w.aim.visible = aim !== null;
    if (aim !== null) {
      const cx = BATTER_X + Math.sin(aim) * 2.2, cy = CONTACT_Y + Math.cos(aim) * 2.2;
      this.w.aim.position.set(...toV(cx, 0.03, cy));
      this.w.aim.rotation.set(-Math.PI / 2, -aim, 0);
    }

    this.updateBatters(dt);
    this.updateFielders(dt, ballPos);
    this.updateCamera(dt, ballPos, k);
    if (pl && ph === 'play') this.drawMinimap();
  }

  private updateBatters(dt: number) {
    const ph = this.phase;
    const pl = this.play;
    const R = this.batters;
    const striker = R[this.atEnd[0]], partner = R[this.atEnd[1]];
    const inPlay = pl && (ph === 'play' || ph === 'result') && !this.lastOut;
    if (inPlay && pl) {
      for (let i = 0; i < 2; i++) {
        const r = pl.runners[i];
        const rig = R[this.atEnd[i]];
        const from = END_Y[r.end], to = END_Y[1 - r.end];
        const e = r.running ? r.p : 0;
        const y = from + (to - from) * e;
        const x = r.running ? LANE_X[i] : i === 0 && pl.runners[0].end === 0 && pl.runs === 0 ? STANCE.x : LANE_X[i];
        const pos = rig.root.position;
        pos.x += (x - pos.x) * Math.min(1, dt * 8);
        pos.z = -y;
        if (r.running) {
          rig.root.rotation.y = to > from ? Math.PI : 0;
          this.runPhase[9 + i] = (this.runPhase[9 + i] ?? 0) + dt * 13;
          poseCarryBat(rig, this.runPhase[9 + i]);
        } else if (i === 0 && this.swing && this.swing.t < 0.9 && pl.runs === 0 && !pl.running) {
          poseBat(rig, Math.min(1, 0.55 + this.swing.t * 1.4), this.swing.kind, this.swing.side);
        } else {
          rig.root.rotation.y = r.end === 0 ? Math.PI : 0;
          poseRun(rig, 0, 0);
          rig.armR.rotation.x = -0.4;
        }
        if (ph === 'result' && this.lastFour) poseArmsUp(rig, this.clock);
      }
      return;
    }
    // Before the shot: the striker in the stance, the non-striker at the far end.
    striker.root.position.set(...toV(STANCE.x, 0, STANCE.y));
    striker.root.rotation.y = Math.PI / 2;
    let s = 0;
    if (ph === 'windup') s = (this.phaseT / WINDUP) * 0.15;
    else if (ph === 'delivery' || ph === 'result') {
      if (this.swing) s = Math.min(1, 0.35 + this.swing.t * 2.2);
      else s = Math.min(0.35, 0.15 + this.t * 0.9);
    }
    if (ph === 'result' && this.lastOut === 'bowled') s = this.swing ? 1 : 0.3;
    poseBat(striker, s, this.swing?.kind ?? 'ground', this.swing?.side ?? 0);
    partner.root.position.set(...toV(NON_STRIKER.x, 0, NON_STRIKER.y - (ph === 'delivery' ? Math.min(0.8, this.t * 2) : 0)));
    partner.root.rotation.y = 0;
    poseRun(partner, 0, 0);
    partner.armR.rotation.x = -0.5;
    void dt;
  }

  private updateFielders(dt: number, ball: Vector3) {
    const ph = this.phase;
    const pl = this.play;
    for (let i = 0; i < 9; i++) {
      const rig = this.fielders[i];
      const pos = rig.root.position;
      let tx: number, ty: number;
      let moving = 0;
      let face: number | null = null;
      if (pl && (ph === 'play' || ph === 'result')) {
        const f = pl.fielders[i];
        tx = f.x; ty = f.y;
        const [vx, , vz] = toV(tx, 0, ty);
        const d = Math.hypot(vx - pos.x, vz - pos.z);
        moving = d / Math.max(dt, 1e-3);
        if (d > 0.002) face = Math.atan2(vx - pos.x, vz - pos.z);
        pos.set(vx, 0, vz);
        const thr = this.throwAnim.get(i);
        if (ph === 'result' && this.lastOut && this.lastOut !== 'six-out') poseArmsUp(rig, this.clock + i);
        else if (thr !== undefined && thr < 0.35) poseThrow(rig, thr / 0.35);
        else if (f.state === 'hold') { poseThrow(rig, 0); }
        else if (moving > 0.6) { this.runPhase[i] += dt * Math.min(14, 4 + moving * 1.6); poseRun(rig, this.runPhase[i], Math.min(1, moving / 5)); }
        else if (i === 0) poseKeeper(rig, 1);
        else poseReady(rig, 0.2, this.clock + i);
        if (face === null || moving < 0.6) face = Math.atan2(ball.x - pos.x, ball.z - pos.z);
      } else if (i === 8) {
        // The bowler: a standing action with no run-up
        pos.set(...toV(this.p && ph !== 'pick' ? this.p.d.rx + HAND_X : BOWLER.x, 0, BOWLER.y));
        face = 0;
        if (ph === 'windup') poseBowl(rig, (this.phaseT / WINDUP) * RELEASE_K);
        else if (ph === 'delivery') {
          const k = RELEASE_K + Math.min(1 - RELEASE_K, this.t * 1.2);
          poseBowl(rig, k);
          pos.z += Math.min(0.5, this.t * 1.5);
        } else if (ph === 'result' && this.lastOut === 'bowled') poseArmsUp(rig, this.clock);
        else poseBowl(rig, 0);
      } else {
        const [hx, hy] = i === 0 ? [KEEPER_SPOT.x, KEEPER_SPOT.y] : FIELD_POS[i];
        pos.set(...toV(hx, 0, hy));
        face = Math.atan2(-pos.x, -pos.z + (i === 0 ? -20 : 0));
        if (i === 0) {
          const rise = ph === 'delivery' && this.p ? Math.max(0, Math.min(1, (this.t - this.p.tContact + 0.1) * 4)) : ph === 'result' ? 1 : 0;
          poseKeeper(rig, rise);
          if (ph === 'result' && this.lastOut === 'bowled') poseArmsUp(rig, this.clock);
        } else if (ph === 'result' && this.lastOut === 'bowled') poseArmsUp(rig, this.clock + i);
        else poseReady(rig, ph === 'windup' || ph === 'delivery' ? 0.32 : 0.15, this.clock + i);
      }
      if (i === 0 && !(pl && (ph === 'play' || ph === 'result'))) face = Math.PI;
      if (face !== null) {
        let d = face - this.faceY[i];
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        this.faceY[i] += d * Math.min(1, dt * 10);
        rig.root.rotation.y = this.faceY[i];
      }
    }
  }

  /** Vertical field of view (degrees) for a camera mode and the screen shape. */
  private fovFor(mode: 'bat' | 'bowl' | 'follow' | 'orbit'): number {
    const a = this.camera.aspect;
    const deg = (r: number) => (r * 180) / Math.PI;
    if (mode === 'bat') {
      // A long lens from far behind the bowler, as on TV: half-height 3.2 m, half-width 3.6 m at the batter.
      const D = BROADCAST.dist;
      return deg(2 * Math.atan(Math.max(3.2, (a < 0.8 ? 2.9 : 3.6) / a) / D));
    }
    if (mode === 'bowl') return Math.min(62, deg(2 * Math.atan(Math.max(Math.tan(0.36), Math.tan(0.2) / a))));
    if (mode === 'follow') return Math.min(64, deg(2 * Math.atan(Math.max(Math.tan(0.4), Math.tan(0.36) / a))));
    return Math.min(64, deg(2 * Math.atan(Math.max(Math.tan(0.4), Math.tan(0.4) / a))));
  }

  private updateCamera(dt: number, ball: Vector3, k: (r: number) => number) {
    const ph = this.phase;
    const cam = this.camera;
    const snap = this.cfg.reducedMotion;
    const desiredPos = new Vector3();
    const desiredLook = new Vector3();
    let rate = 5;
    let mode: 'bat' | 'bowl' | 'follow' | 'orbit' = 'bat';
    if (ph === 'pick' && this.humanBowls) {
      // The bowler's view: high behind the bowler, the whole pitch visible for aiming.
      desiredPos.set(...BOWLCAM.pos);
      desiredLook.set(...BOWLCAM.look);
      mode = 'bowl';
      rate = 4;
    } else if (ph === 'pick' || ph === 'windup' || ph === 'delivery' || (ph === 'result' && !this.play)) {
      // Broadcast view from far behind the bowler (the off side is on the left).
      desiredPos.set(...BROADCAST.pos);
      desiredLook.set(...BROADCAST.look);
      rate = 6;
    } else if (ph === 'break' || ph === 'done') {
      this.orbitA += dt * (snap ? 0 : 0.18);
      desiredPos.set(Math.sin(this.orbitA) * 30, 13, -FIELD.pitch / 2 + Math.cos(this.orbitA) * 30);
      desiredLook.set(0, 0, -FIELD.pitch / 2);
      mode = 'orbit';
      rate = 1.5;
    } else {
      // Follow the ball from behind it, looking out from the pitch.
      const bx = ball.x - STANCE.x, bz = ball.z + STANCE.y;
      const dist = Math.hypot(bx, bz);
      if (dist > 3.5 && this.play && this.play.ball.state === 'free') {
        const nd = new Vector3(bx / dist, 0, bz / dist);
        this.camDir.lerp(nd, k(2)).normalize();
      }
      desiredLook.set(ball.x, Math.min(3, Math.max(0.4, ball.y * 0.5)), ball.z);
      const back = 9.5 + dist * 0.2;
      desiredPos.copy(desiredLook).addScaledVector(this.camDir, -back);
      desiredPos.y = 6.5 + dist * 0.2;
      const r = Math.hypot(desiredPos.x, desiredPos.z);
      if (r > 36) { desiredPos.x *= 36 / r; desiredPos.z *= 36 / r; }
      mode = 'follow';
      rate = 3.2;
    }
    const fov = this.fovFor(mode);
    const cut = snap || this.camCut || mode !== this.camMode;
    if (cut) { this.camPos.copy(desiredPos); this.camLook.copy(desiredLook); this.camCut = false; this.camMode = mode; }
    else { this.camPos.lerp(desiredPos, k(rate)); this.camLook.lerp(desiredLook, k(rate * 1.4)); }
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    cam.position.copy(this.camPos);
    cam.lookAt(this.camLook);
  }

  // ---------- Mini-map ----------
  private drawMinimap() {
    const c = this.minimap;
    if (!c) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const size = c.clientWidth || 110;
    if (c.width !== Math.round(size * dpr)) { c.width = Math.round(size * dpr); c.height = Math.round(size * dpr); }
    const g = c.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, size, size);
    const cx = size / 2, cy = size / 2, s = (size / 2 - 4) / FIELD.radius;
    // The batter at the top, the bowler below, the off side on the left (as in the main view)
    const P = (x: number, y: number): [number, number] => [cx - x * s, cy + (y - FIELD.pitch / 2) * s];
    g.fillStyle = 'rgba(70, 130, 50, 0.92)'; g.beginPath(); g.arc(cx, cy, size / 2 - 2, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke();
    const [px, py] = P(1.3, -0.5);
    g.fillStyle = '#c9a86a'; g.fillRect(px, py, 2.6 * s, (FIELD.pitch + 1) * s);
    const pl = this.play;
    const fl = pl ? pl.fielders.map((f) => [f.x, f.y] as const) : [[KEEPER_SPOT.x, KEEPER_SPOT.y] as const, ...FIELD_POS.slice(1), [BOWLER.x, BOWLER.y] as const];
    g.fillStyle = TEAM[this.bowlSide].dot;
    for (const [x, y] of fl) { const [a, b] = P(x, y); g.beginPath(); g.arc(a, b, 3.2, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = TEAM[this.batSide].dot; g.strokeStyle = '#fff'; g.lineWidth = 1;
    for (let i = 0; i < 2; i++) {
      const r = pl?.runners[i];
      const from = END_Y[r ? r.end : i], to = END_Y[r ? 1 - r.end : 1 - i];
      const y = r && r.running ? from + (to - from) * r.p : from;
      const [a, b] = P(LANE_X[i], y);
      g.beginPath(); g.arc(a, b, 3.4, 0, Math.PI * 2); g.fill(); g.stroke();
    }
    if (pl) {
      const [a, b] = P(pl.ball.x, pl.ball.y);
      g.fillStyle = '#ffe94a'; g.strokeStyle = '#222'; g.lineWidth = 1.2;
      g.beginPath(); g.arc(a, b, 3.6, 0, Math.PI * 2); g.fill(); g.stroke();
    }
  }

  private updateBoard() {
    const inn = this.innings[this.cur];
    const tg = this.targetRuns;
    const ov = `${Math.floor(inn.balls / 6)}.${inn.balls % 6}`;
    this.w.board.draw(`OVERS ${ov}`, `${inn.runs}/${inn.wickets}`, tg !== null ? `TARGET ${tg}` : 'PARA CUP');
  }

  // ---------- HUD ----------
  private emit() {
    const inn = this.innings[this.cur];
    const tg = this.targetRuns;
    const sym = (e: BallEvent) => (e.extra === 'wd' ? 'wd' : e.out ? 'W' : e.runs === 0 ? '•' : String(e.runs));
    const pl = this.play;
    const h: HudState = {
      phase: this.phase,
      inn: this.cur,
      batSide: this.batSide,
      scores: this.innings.map((i) => ({ runs: i.runs, wickets: i.wickets, balls: i.balls })),
      target: tg,
      need: tg !== null && this.lim.balls !== null ? { runs: Math.max(0, tg - inn.runs), balls: Math.max(0, this.lim.balls - inn.balls) } : null,
      over: currentOver(inn.events).map(sym),
      banner: this.banner,
      timing: this.timing,
      dtype: this.dtype,
      current: this.p && (this.phase === 'windup' || this.phase === 'delivery' || this.phase === 'play' || this.phase === 'result') ? this.p.d.type : null,
      humanBats: this.humanBats,
      humanBowls: this.humanBowls,
      canShot: this.humanBats && (this.phase === 'windup' || this.phase === 'delivery') && !this.press,
      canRun: this.humanBats && this.phase === 'play' && !!pl && !pl.dead && !pl.out,
      runSafe: this.runSafe,
      running: !!pl && (pl.running || pl.wantRuns > 0),
      runs: pl ? pl.runs : 0,
      striker: { ...this.line(this.batNo[0]) },
      partner: { ...this.line(this.batNo[1]) },
    };
    this.cb.onHud(h);
  }

  // ---------- Input events ----------
  private onKeyDown = (e: KeyboardEvent) => {
    if (this.paused || e.altKey || e.ctrlKey || e.metaKey) return;
    const c = e.code;
    const used = (): void => { e.preventDefault(); };
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(c)) {
      used();
      this.keys.add(c);
      if (this.phase === 'pick' && this.humanBowls && !e.repeat) {
        const dx = c === 'ArrowLeft' || c === 'KeyA' ? 0.15 : c === 'ArrowRight' || c === 'KeyD' ? -0.15 : 0;
        const dy = c === 'ArrowUp' || c === 'KeyW' ? -0.4 : c === 'ArrowDown' || c === 'KeyS' ? 0.4 : 0;
        this.moveTarget(dx, dy);
      }
      return;
    }
    if (e.repeat) return;
    if (this.phase === 'pick' && this.humanBowls) {
      const types: DType[] = ['fast', 'medium', 'slow', 'offspin', 'legspin'];
      const n = Number(e.key);
      if (n >= 1 && n <= 5) { used(); this.pickType(types[n - 1]); return; }
      if (c === 'Space' || c === 'Enter') { used(); this.bowl(); return; }
    }
    if (c === 'KeyJ') { used(); this.shot('defend'); }
    else if (c === 'KeyK' || c === 'Space') { used(); this.shot('ground'); }
    else if (c === 'KeyL') { used(); this.shot('loft'); }
    else if (c === 'KeyR' || c === 'ShiftLeft' || c === 'ShiftRight') { used(); this.run(); }
  };

  private onKeyUp = (e: KeyboardEvent) => { this.keys.delete(e.code); };

  private onVis = () => { if (document.hidden) this.cb.onHidden?.(); };

  private onPointerDown = (e: PointerEvent) => {
    if (this.paused) return;
    if (this.phase === 'pick' && this.humanBowls) {
      const hit = this.groundAt(e.clientX, e.clientY);
      if (hit && Math.abs(hit.x) < 2.5 && hit.y > -0.5 && hit.y < FIELD.pitch) { this.setTarget(hit.x, hit.y); sfx('tick', { gain: 0.4 }); }
      return;
    }
    if (this.humanBats) {
      this.swipe = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), done: false };
      try { (e.target as Element).setPointerCapture?.(e.pointerId); } catch { /* synthetic pointer */ }
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    const s = this.swipe;
    if (!s || s.done || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (Math.hypot(dx, dy) > 28) {
      s.done = true;
      if (performance.now() - s.t < 450) this.shot('ground', Math.atan2(-dx, -dy));
    }
  };

  private onPointerUp = (e: PointerEvent) => { if (this.swipe?.id === e.pointerId) this.swipe = null; };

  private groundAt(cx: number, cy: number): { x: number; y: number } | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    this.camera.updateMatrixWorld();
    this.ray.setFromCamera(ndc, this.camera);
    const out = new Vector3();
    if (!this.ray.ray.intersectPlane(this.ground, out)) return null;
    return { x: out.x, y: -out.z };
  }

  /** For tests: the physics target point on the pitch. */
  get target() { return { ...this.aimTarget }; }
  get state() { return { phase: this.phase, inn: this.cur, scores: this.innings.map((i) => ({ ...i, events: undefined })) }; }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    const cv = this.renderer.domElement;
    cv.removeEventListener('pointerdown', this.onPointerDown);
    cv.removeEventListener('pointermove', this.onPointerMove);
    cv.removeEventListener('pointerup', this.onPointerUp);
    cv.removeEventListener('pointercancel', this.onPointerUp);
    removeEventListener('keydown', this.onKeyDown);
    removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('visibilitychange', this.onVis);
    const seen = new Set<unknown>();
    this.w.scene.traverse((o: Object3D) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      if (!seen.has(m.geometry)) { seen.add(m.geometry); m.geometry.dispose(); }
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) {
        if (seen.has(mat)) continue;
        seen.add(mat);
        const map = (mat as Material & { map?: Texture | null }).map;
        if (map) map.dispose();
        mat.dispose();
      }
    });
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    cv.remove();
  }
}

export { CONTACT_Y };
