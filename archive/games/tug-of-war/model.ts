import { DEFAULT_WINDOWS, RateLimiter, type Judgement } from '../../engine/timing';
import type { Rng } from '../../engine/rng';

// Tug of War physics and rhythm model (1-D, deterministic for a given input).
//
// x > 0 means the rope moved toward the RIGHT team (team 1).
// Each team has a pull "surge" s. A good pull adds to s; s decays fast.
// Rope acceleration:  a = K·(s_right − s_left) − c·v
// A team wins when the other team's front puller crosses the centre line,
// that is, when |x| reaches winDist.
//
// Anti-spam: a team gets one judged pull per beat. A tap far from the beat,
// or a second tap on the same beat, is a SLIP: the grip slides and the
// other side gains. In assist mode there is no beat; taps are rate-limited.

export type Team = 0 | 1;

export const PARAMS = {
  winDist: 170,
  damping: 2.2,
  K: 144,
  tau: 0.25,
  slipKick: 11,
  startInterval: 0.7,
  endInterval: 0.5,
  rampTime: 30,
  roundTime: 45,
  assistQ: 0.2,
  assistRate: 6,
};

const QUALITY: Record<Judgement, number> = { perfect: 1, good: 0.6, miss: 0 };

export interface InputResult {
  judgement: Judgement | 'assist' | 'ignored';
  slip: boolean;
  heave: boolean;
}

export class TugModel {
  t = 0;
  x = 0;
  v = 0;
  surge: [number, number] = [0, 0];
  interval = PARAMS.startInterval;
  /** Time of the most recent beat and its index. */
  lastBeat = 0;
  beatIndex = 0;
  private phase = 0;
  private consumed: [number, number] = [-1, -1];
  streak: [number, number] = [0, 0];
  perfects: [number, number] = [0, 0];
  pulls: [number, number] = [0, 0];
  slips: [number, number] = [0, 0];
  winner: Team | null = null;
  timedOut = false;
  private limiters: [RateLimiter, RateLimiter] = [new RateLimiter(PARAMS.assistRate), new RateLimiter(PARAMS.assistRate)];
  /** Listeners for the renderer. */
  onBeat?: (index: number) => void;

  constructor(public assist = false) {}

  get over() {
    return this.winner !== null || this.timedOut;
  }

  /** Next beat time (prediction from the current tempo). */
  get nextBeat() {
    return this.lastBeat + this.interval;
  }

  update(dt: number) {
    if (this.over) return;
    this.t += dt;
    // Tempo speeds up over the round: the chant gets faster.
    const k = Math.min(1, this.t / PARAMS.rampTime);
    this.interval = PARAMS.startInterval + (PARAMS.endInterval - PARAMS.startInterval) * k;
    this.phase += dt / this.interval;
    if (this.phase >= 1) {
      this.phase -= 1;
      this.lastBeat = this.t - this.phase * this.interval;
      this.beatIndex++;
      this.onBeat?.(this.beatIndex);
    }
    const decay = Math.exp(-dt / PARAMS.tau);
    const a = PARAMS.K * (this.surge[1] - this.surge[0]) - PARAMS.damping * this.v;
    this.v += a * dt;
    this.x += this.v * dt;
    this.surge[0] *= decay;
    this.surge[1] *= decay;
    if (this.x >= PARAMS.winDist) { this.x = PARAMS.winDist; this.winner = 1; }
    else if (this.x <= -PARAMS.winDist) { this.x = -PARAMS.winDist; this.winner = 0; }
    else if (this.t >= PARAMS.roundTime) {
      this.timedOut = true;
      this.winner = Math.abs(this.x) < 2 ? null : this.x > 0 ? 1 : 0;
    }
  }

  /** Judge a time against the nearest beat (previous or next). */
  judge(at: number): { judgement: Judgement; beat: number; offset: number } {
    const dPrev = at - this.lastBeat;
    const dNext = this.nextBeat - at;
    const usePrev = dPrev <= dNext;
    const offset = usePrev ? dPrev : -dNext;
    const a = Math.abs(offset);
    const judgement: Judgement = a <= DEFAULT_WINDOWS.perfect ? 'perfect' : a <= DEFAULT_WINDOWS.good ? 'good' : 'miss';
    return { judgement, beat: usePrev ? this.beatIndex : this.beatIndex + 1, offset };
  }

  input(team: Team): InputResult {
    if (this.over || this.t < 0.05) return { judgement: 'ignored', slip: false, heave: false };
    const dir = team === 1 ? 1 : -1;
    if (this.assist) {
      if (!this.limiters[team].allow(this.t)) return { judgement: 'ignored', slip: false, heave: false };
      this.surge[team] += PARAMS.assistQ;
      this.pulls[team]++;
      return { judgement: 'assist', slip: false, heave: false };
    }
    const j = this.judge(this.t);
    if (j.judgement === 'miss' || this.consumed[team] === j.beat) {
      this.slip(team, dir);
      return { judgement: 'miss', slip: true, heave: false };
    }
    this.consumed[team] = j.beat;
    this.streak[team]++;
    this.pulls[team]++;
    if (j.judgement === 'perfect') this.perfects[team]++;
    let q = QUALITY[j.judgement];
    const heave = this.streak[team] % 4 === 0;
    if (heave) q += 0.9; // "Heave-ho!": every fourth pull in a row is a big pull
    this.surge[team] += q;
    return { judgement: j.judgement, slip: false, heave };
  }

  private slip(team: Team, dir: number) {
    this.streak[team] = 0;
    this.slips[team]++;
    this.surge[team] *= 0.3;
    this.v -= dir * PARAMS.slipKick; // the rope slides toward the other team
  }
}

// ---------- Computer puller ----------

export type Difficulty = 'easy' | 'medium' | 'hard';
const AI: Record<Difficulty, { sd: number; skip: number; rate: number }> = {
  easy: { sd: 0.11, skip: 0.18, rate: 3.6 },
  medium: { sd: 0.07, skip: 0.08, rate: 4.6 },
  hard: { sd: 0.045, skip: 0.03, rate: 5.6 },
};

/** The computer presses near each beat with human-like timing noise, using the same judge as players. */
export class TugAI {
  private plan: number | null = null;
  private plannedFor = -1;
  constructor(private team: Team, private diff: Difficulty, private rng: Rng) {}

  update(m: TugModel): InputResult | null {
    if (m.over) return null;
    const p = AI[this.diff];
    if (m.assist) {
      if (this.rng.chance(p.rate / 120)) return m.input(this.team);
      return null;
    }
    const target = m.beatIndex + 1;
    if (this.plan === null && this.plannedFor < target) {
      // Plan one press for the next beat. A pending press is never replaced.
      this.plannedFor = target;
      this.plan = this.rng.chance(p.skip) ? null : m.nextBeat + this.rng.gauss() * p.sd;
    }
    if (this.plan !== null && m.t >= this.plan) {
      this.plan = null;
      return m.input(this.team);
    }
    return null;
  }
}
