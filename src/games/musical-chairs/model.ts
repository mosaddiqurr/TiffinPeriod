import type { Rng } from '../../engine/rng';

// Musical Chairs model (pure, top view).
// N kids walk round N−1 chairs while the music plays. When it stops, each kid
// runs to the nearest free chair. The first to arrive sits. The kid left
// standing is out. Pressing SIT while the music plays is a foul: the kid trips.

export const MC = { walkR: 235, chairR: 150, walkSpeed: 0.55, runSpeed: 300, sitDist: 12, trip: 1.3 };

export interface Kid {
  id: number;
  player: number;        // 0/1 human, −1 computer
  name: string;
  color: string;
  out: boolean;
  angle: number;         // position on the walking circle
  x: number; y: number;
  seat: number | null;   // chair index
  target: number | null;
  rushing: boolean;
  react: number | null;  // computer: time when it reacts
  trip: number;          // seconds of tripping left
  fouls: number;
}

export interface Chair { x: number; y: number; a: number; taken: number | null }

export class ChairsModel {
  kids: Kid[];
  chairs: Chair[] = [];
  phase: 'music' | 'rush' | 'roundOver' | 'done' = 'music';
  t = 0;
  stopAt = 0;
  dips: Array<{ at: number; dur: number }> = [];
  round = 1;
  lastOut: Kid | null = null;
  private react: { mean: number; sd: number };

  constructor(public cx: number, public cy: number, kids: Array<Pick<Kid, 'player' | 'name' | 'color'>>, diff: 'easy' | 'medium' | 'hard', private rng: Rng) {
    this.react = diff === 'easy' ? { mean: 0.6, sd: 0.15 } : diff === 'medium' ? { mean: 0.45, sd: 0.1 } : { mean: 0.33, sd: 0.07 };
    this.kids = kids.map((k, i) => ({ ...k, id: i, out: false, angle: 0, x: 0, y: 0, seat: null, target: null, rushing: false, react: null, trip: 0, fouls: 0 }));
    this.setupRound();
  }

  get active() {
    return this.kids.filter((k) => !k.out);
  }

  get musicLevel(): number {
    if (this.phase !== 'music') return 0;
    return this.dips.some((d) => this.t >= d.at && this.t < d.at + d.dur) ? 0.12 : 1;
  }

  setupRound() {
    const act = this.active;
    const n = act.length - 1;
    this.chairs = Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2 + Math.PI / n;
      return { a, x: this.cx + Math.cos(a) * MC.chairR, y: this.cy + Math.sin(a) * MC.chairR, taken: null };
    });
    act.forEach((k, i) => {
      k.angle = (i / act.length) * Math.PI * 2;
      k.seat = null; k.target = null; k.rushing = false; k.react = null; k.trip = 0;
      k.x = this.cx + Math.cos(k.angle) * MC.walkR;
      k.y = this.cy + Math.sin(k.angle) * MC.walkR;
    });
    this.t = 0;
    this.stopAt = this.rng.range(4, 10);
    this.dips = [];
    if (this.rng.chance(0.6)) this.dips.push({ at: this.rng.range(1.5, Math.max(1.6, this.stopAt - 1)), dur: 0.35 });
    this.phase = 'music';
    this.lastOut = null;
  }

  /** A human presses SIT. */
  sit(player: number) {
    const k = this.kids.find((x) => x.player === player && !x.out);
    if (!k || k.seat !== null || k.trip > 0) return 'ignored';
    if (this.phase === 'music') {
      k.trip = MC.trip;
      k.fouls++;
      return 'foul';
    }
    if (this.phase === 'rush') { k.rushing = true; return 'go'; }
    return 'ignored';
  }

  private nearestFree(k: Kid): number | null {
    let best: number | null = null;
    let bd = Infinity;
    this.chairs.forEach((c, i) => {
      if (c.taken !== null) return;
      const d = Math.hypot(c.x - k.x, c.y - k.y);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  update(dt: number): Array<{ type: 'stop' | 'sit' | 'out' | 'done'; kid?: Kid }> {
    const ev: Array<{ type: 'stop' | 'sit' | 'out' | 'done'; kid?: Kid }> = [];
    if (this.phase === 'done' || this.phase === 'roundOver') return ev;
    this.t += dt;
    for (const k of this.active) k.trip = Math.max(0, k.trip - dt);
    if (this.phase === 'music') {
      for (const k of this.active) {
        k.angle += MC.walkSpeed * dt * (k.trip > 0 ? 0.3 : 1);
        k.x = this.cx + Math.cos(k.angle) * MC.walkR;
        k.y = this.cy + Math.sin(k.angle) * MC.walkR;
      }
      if (this.t >= this.stopAt) {
        this.phase = 'rush';
        for (const k of this.active) if (k.player < 0) k.react = this.t + Math.max(0.15, this.react.mean + this.rng.gauss() * this.react.sd);
        ev.push({ type: 'stop' });
      }
      return ev;
    }
    // Rush
    for (const k of this.active) {
      if (k.seat !== null) continue;
      if (k.player < 0 && k.react !== null && this.t >= k.react) k.rushing = true;
      if (!k.rushing || k.trip > 0) continue;
      if (k.target === null || this.chairs[k.target].taken !== null) k.target = this.nearestFree(k);
      if (k.target === null) continue;
      const c = this.chairs[k.target];
      const dx = c.x - k.x, dy = c.y - k.y;
      const d = Math.hypot(dx, dy);
      const step = MC.runSpeed * dt;
      if (d <= Math.max(step, MC.sitDist)) {
        k.x = c.x; k.y = c.y;
        c.taken = k.id;
        k.seat = k.target;
        ev.push({ type: 'sit', kid: k });
      } else {
        k.x += (dx / d) * step;
        k.y += (dy / d) * step;
      }
    }
    if (this.chairs.every((c) => c.taken !== null)) {
      const loser = this.active.find((k) => k.seat === null)!;
      loser.out = true;
      this.lastOut = loser;
      ev.push({ type: 'out', kid: loser });
      if (this.active.length <= 1) { this.phase = 'done'; ev.push({ type: 'done' }); }
      else this.phase = 'roundOver';
    }
    return ev;
  }

  nextRound() {
    if (this.phase !== 'roundOver') return;
    this.round++;
    this.setupRound();
  }
}
