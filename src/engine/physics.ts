// Small deterministic physics helpers. They are pure functions with no
// rendering, so unit tests can check them. Matter.js is planned for the
// rigid-body games of Phase 2 (Pen Fight, Rubber Band Shooting).

export interface Pendulum {
  ax: number; ay: number; // anchor (world units)
  L: number;              // string length
  theta: number;          // angle from vertical (rad), positive = bob to the right
  omega: number;          // angular velocity (rad/s)
  damping: number;        // 1/s
  g: number;              // gravity (units/s²)
}

/** Semi-implicit Euler step: θ'' = −(g/L)·sin θ − c·ω + extra. Stable at small steps. */
export function stepPendulum(p: Pendulum, dt: number, extraAccel = 0): void {
  const alpha = -(p.g / p.L) * Math.sin(p.theta) - p.damping * p.omega + extraAccel;
  p.omega += alpha * dt;
  p.theta += p.omega * dt;
}

export function bob(p: Pendulum): { x: number; y: number } {
  return { x: p.ax + p.L * Math.sin(p.theta), y: p.ay + p.L * Math.cos(p.theta) };
}

/** Bob velocity in world units/s. */
export function bobVelocity(p: Pendulum): { vx: number; vy: number } {
  return { vx: p.L * Math.cos(p.theta) * p.omega, vy: -p.L * Math.sin(p.theta) * p.omega };
}

/** Add a linear velocity change at the bob. Only the tangential part changes the swing. */
export function nudgeBob(p: Pendulum, dvx: number, dvy: number): void {
  const tx = Math.cos(p.theta);
  const ty = -Math.sin(p.theta);
  p.omega += (dvx * tx + dvy * ty) / p.L;
}

/** Total mechanical energy per unit mass. Used by tests to check stability. */
export function pendulumEnergy(p: Pendulum): number {
  const v = p.L * p.omega;
  return 0.5 * v * v + p.g * p.L * (1 - Math.cos(p.theta));
}

/** Predict the bob position after `t` seconds (forward simulation, no side effects). */
export function predictBob(p: Pendulum, t: number, dt = 1 / 120): { x: number; y: number } {
  const q: Pendulum = { ...p };
  for (let s = 0; s < t; s += dt) stepPendulum(q, dt);
  return bob(q);
}

export function circlesOverlap(ax: number, ay: number, ar: number, bx: number, by: number, br: number): boolean {
  const dx = ax - bx;
  const dy = ay - by;
  const r = ar + br;
  return dx * dx + dy * dy <= r * r;
}
