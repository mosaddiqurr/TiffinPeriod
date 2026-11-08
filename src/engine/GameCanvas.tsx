import { useEffect, useRef } from 'react';
import { createLoop } from './loop';

// A canvas host for real-time games.
// - Fits a design-size world into any screen ("contain") and shows the
//   extra area around it, so games can paint backgrounds edge to edge.
// - Caps the device pixel ratio at 2 to protect low-end phones.
// - Pauses when the tab is hidden.

export interface View {
  cssW: number;
  cssH: number;
  dpr: number;
  scale: number;
  ox: number;
  oy: number;
  /** Visible world rectangle (can be larger than the design size). */
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Scene {
  designW: number;
  designH: number;
  /** World point shown at the top-left of the design area (a fixed camera). Default 0, 0. */
  originX?: number;
  originY?: number;
  /** Called before each layout, so a scene can pick a different camera for portrait screens. */
  onResize?(cssW: number, cssH: number): void;
  update(dt: number): void;
  render(ctx: CanvasRenderingContext2D, view: View, alpha: number): void;
  pointerDown?(x: number, y: number, id: number): void;
  pointerUp?(x: number, y: number, id: number): void;
  pointerMove?(x: number, y: number, id: number): void;
}

interface Props {
  scene: Scene;
  paused: boolean;
  onHidden?: () => void;
  className?: string;
  label: string;
}

export function GameCanvas({ scene, paused, onHidden, className, label }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const pausedRef = useRef(paused);
  const loopRef = useRef<ReturnType<typeof createLoop> | null>(null);
  pausedRef.current = paused;

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d', { alpha: false })!;
    const view: View = { cssW: 1, cssH: 1, dpr: 1, scale: 1, ox: 0, oy: 0, left: 0, top: 0, right: 1, bottom: 1 };

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      view.cssW = Math.max(1, r.width);
      view.cssH = Math.max(1, r.height);
      view.dpr = Math.min(2, globalThis.devicePixelRatio || 1);
      scene.onResize?.(view.cssW, view.cssH);
      canvas.width = Math.round(view.cssW * view.dpr);
      canvas.height = Math.round(view.cssH * view.dpr);
      view.scale = Math.min(view.cssW / scene.designW, view.cssH / scene.designH);
      view.ox = (view.cssW - scene.designW * view.scale) / 2;
      view.oy = (view.cssH - scene.designH * view.scale) / 2;
      // Fold the camera origin into the offset, so world coordinates work everywhere.
      view.ox -= (scene.originX ?? 0) * view.scale;
      view.oy -= (scene.originY ?? 0) * view.scale;
      view.left = -view.ox / view.scale;
      view.top = -view.oy / view.scale;
      view.right = (view.cssW - view.ox) / view.scale;
      view.bottom = (view.cssH - view.oy) / view.scale;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const loop = createLoop({
      update: (dt) => scene.update(dt),
      render: (alpha) => {
        ctx.setTransform(view.dpr * view.scale, 0, 0, view.dpr * view.scale, view.dpr * view.ox, view.dpr * view.oy);
        scene.render(ctx, view, alpha);
      },
    });
    loopRef.current = loop;
    loop.setPaused(pausedRef.current);
    loop.start();

    const toWorld = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return [(e.clientX - r.left - view.ox) / view.scale, (e.clientY - r.top - view.oy) / view.scale] as const;
    };
    const down = (e: PointerEvent) => {
      if (loop.paused) return;
      e.preventDefault();
      // Keep getting this finger's moves even when it slides off the canvas (onto the top bar or a pad).
      try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic event */ }
      const [x, y] = toWorld(e);
      scene.pointerDown?.(x, y, e.pointerId);
    };
    const up = (e: PointerEvent) => {
      const [x, y] = toWorld(e);
      scene.pointerUp?.(x, y, e.pointerId);
    };
    const move = (e: PointerEvent) => {
      const [x, y] = toWorld(e);
      scene.pointerMove?.(x, y, e.pointerId);
    };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('pointermove', move);

    const vis = () => {
      if (document.hidden) onHidden?.();
    };
    document.addEventListener('visibilitychange', vis);

    return () => {
      loop.stop();
      ro.disconnect();
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      canvas.removeEventListener('pointermove', move);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [scene, onHidden]);

  useEffect(() => {
    loopRef.current?.setPaused(paused);
  }, [paused]);

  return <canvas ref={ref} className={className ?? 'game-canvas'} role="img" aria-label={label} />;
}
