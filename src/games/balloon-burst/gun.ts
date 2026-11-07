// Mela air gun for Balloon Burst: the shooting stall at the village fair.
// Drag anywhere to move the sight (it moves with your finger, so the finger never hides
// the balloon), let go to fire. The sight wobbles a little like a real hand. A pellet takes
// a moment to fly, so fast balloons need a small lead. Pellets are counted, like buying
// "ten shots" at the stall. Pure logic in field-local coordinates; no drawing here.

export type PopStyle = 'pin' | 'gun';

/** Pellets for a round of each length. */
export const PELLETS: Record<number, number> = { 30: 20, 45: 30, 60: 40 };
export const pelletsFor = (sec: number) => PELLETS[sec] ?? Math.round(sec * 0.66);
/** Time to cock the gun again after a shot (s). */
export const RECOCK = 0.32;
/** Pellet speed (field px per second). */
export const PELLET_SPEED = 2300;
/** How far the sight wobbles (field px). */
export const WOBBLE = 6;
/** The sight moves a little faster than the finger, so the whole sky is in reach. */
export const SENSITIVITY = 1.25;
/** A gold balloon gives these extra pellets. */
export const GOLD_BONUS = 2;

export interface Pellet { x0: number; y0: number; x1: number; y1: number; t: number; dur: number; owner: number }

export class AirGun {
  /** Sight position (field coordinates). */
  sx: number;
  sy: number;
  ammo: number;
  cool = 0;
  recoil = 0;
  flash = 0;
  shots = 0;
  /** Pointer currently dragging the sight. */
  drag: number | null = null;
  private lx = 0;
  private ly = 0;

  constructor(public w: number, public h: number, ammo: number, private seed = 0) {
    this.sx = w / 2;
    this.sy = h * 0.45;
    this.ammo = ammo;
  }

  /** The gun rests on the counter at the bottom, in the middle. */
  get pivot(): [number, number] { return [this.w / 2, this.h - 22]; }
  get barrel() { return Math.max(120, Math.min(175, this.h * 0.2)); }

  /** Highest and lowest the sight can go (the counter is at the bottom). */
  clamp() {
    this.sx = Math.max(16, Math.min(this.w - 16, this.sx));
    this.sy = Math.max(40, Math.min(this.h - this.barrel - 60, this.sy));
  }

  angle(t: number): number {
    const [px, py] = this.pivot;
    const [ax, ay] = this.aim(t);
    return Math.atan2(ay - py, ax - px);
  }

  muzzle(t: number): [number, number] {
    const [px, py] = this.pivot;
    const a = this.angle(t);
    const L = this.barrel * (1 - this.recoil * 0.08);
    return [px + Math.cos(a) * L, py + Math.sin(a) * L];
  }

  /** Where a shot fired now would land: the sight plus the hand's wobble. */
  aim(t: number): [number, number] {
    const k = this.seed * 1.7;
    const wx = Math.sin(t * 1.35 + k) * WOBBLE + Math.sin(t * 3.1 + k * 2) * WOBBLE * 0.35;
    const wy = Math.cos(t * 1.1 + k) * WOBBLE * 0.8 + Math.sin(t * 2.7 + k) * WOBBLE * 0.3;
    return [this.sx + wx, this.sy + wy];
  }

  grab(id: number, x: number, y: number) { this.drag = id; this.lx = x; this.ly = y; }

  /** Move with a dragging pointer. `scale` turns screen px into field px. */
  move(id: number, x: number, y: number, scale: number) {
    if (this.drag !== id) return;
    this.sx += ((x - this.lx) / scale) * SENSITIVITY;
    this.sy += ((y - this.ly) / scale) * SENSITIVITY;
    this.lx = x; this.ly = y;
    this.clamp();
  }

  nudge(dx: number, dy: number) { this.sx += dx; this.sy += dy; this.clamp(); }

  get ready() { return this.cool <= 0 && this.ammo > 0; }
  get empty() { return this.ammo <= 0; }

  /** Fire if cocked and loaded. Returns the pellet, or null (not ready / out of pellets). */
  fire(t: number, owner = 0): Pellet | null {
    if (!this.ready) return null;
    this.ammo--;
    this.shots++;
    this.cool = RECOCK;
    this.recoil = 1;
    this.flash = 1;
    const [x0, y0] = this.muzzle(t);
    const [x1, y1] = this.aim(t);
    return { x0, y0, x1, y1, t: 0, dur: Math.hypot(x1 - x0, y1 - y0) / PELLET_SPEED, owner };
  }

  update(dt: number) {
    this.cool = Math.max(0, this.cool - dt);
    this.recoil = Math.max(0, this.recoil - dt * 6);
    this.flash = Math.max(0, this.flash - dt * 9);
  }
}
