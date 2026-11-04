// Fixed-timestep game loop ("Fix Your Timestep" accumulator method).
// Physics runs at a constant step, so results do not depend on the
// display frame rate (60 Hz, 90 Hz, 120 Hz or a slow phone).

export interface LoopHandlers {
  update(dt: number): void;
  render(alpha: number): void;
}

export interface Loop {
  start(): void;
  stop(): void;
  setPaused(p: boolean): void;
  readonly paused: boolean;
}

export function createLoop(h: LoopHandlers, step = 1 / 120): Loop {
  let raf = 0;
  let last = 0;
  let acc = 0;
  let paused = false;
  let running = false;

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.1) dt = 0.1; // Avoid a "spiral of death" after a tab switch.
    if (!paused) {
      acc += dt;
      let n = 0;
      while (acc >= step && n < 24) {
        h.update(step);
        acc -= step;
        n++;
      }
    }
    h.render(paused ? 1 : acc / step);
  };

  return {
    start() {
      if (running) return;
      running = true;
      last = performance.now();
      acc = 0;
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
    setPaused(p) {
      paused = p;
      acc = 0;
    },
    get paused() {
      return paused;
    },
  };
}
