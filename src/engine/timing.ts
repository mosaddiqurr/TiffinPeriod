// Shared timing helpers for rhythm and reaction games.
// Tug of War uses judgeBeat(). Pakhir Ure and Balloon Burst use the
// reaction and rate-limit helpers.

export type Judgement = 'perfect' | 'good' | 'miss';

export interface BeatWindows {
  perfect: number; // seconds either side of the beat
  good: number;
}

export const DEFAULT_WINDOWS: BeatWindows = { perfect: 0.075, good: 0.16 };

/**
 * Judge an input time against a regular beat.
 * Returns the judgement, the signed offset and the index of the nearest beat.
 */
export function judgeBeat(t: number, firstBeat: number, interval: number, w: BeatWindows = DEFAULT_WINDOWS) {
  const k = Math.round((t - firstBeat) / interval);
  const beatTime = firstBeat + k * interval;
  const offset = t - beatTime;
  const a = Math.abs(offset);
  const judgement: Judgement = a <= w.perfect ? 'perfect' : a <= w.good ? 'good' : 'miss';
  return { judgement, offset, beatIndex: k };
}

/** Sliding-window rate limiter. It rejects input that comes faster than `maxPerSecond`. */
export class RateLimiter {
  private times: number[] = [];
  constructor(private maxPerSecond: number) {}
  allow(t: number): boolean {
    while (this.times.length && t - this.times[0] > 1) this.times.shift();
    if (this.times.length >= this.maxPerSecond) return false;
    this.times.push(t);
    return true;
  }
  reset() {
    this.times = [];
  }
}

/** Humans cannot react to a visual cue faster than about 100–120 ms. */
export const ANTICIPATION_MS = 120;

export function classifyReaction(ms: number): 'anticipated' | 'fast' | 'ok' | 'slow' {
  if (ms < ANTICIPATION_MS) return 'anticipated';
  if (ms < 400) return 'fast';
  if (ms < 700) return 'ok';
  return 'slow';
}

/** Capture a pointer on its target. Some browsers throw for unknown pointer ids, so this never throws. */
export function capturePointer(e: { currentTarget: EventTarget | null; pointerId: number }): void {
  try {
    (e.currentTarget as HTMLElement | null)?.setPointerCapture?.(e.pointerId);
  } catch {
    /* ignore */
  }
}
