import { useEffect, useRef, useState, type ReactNode } from 'react';
import { vibrate } from '../../platform/audio';

// The finger pad, made reliable on phones.
//
// 1. A phone browser treats a finger held on a button as a long press: it may show the text
//    magnifier, start "haptic touch" or a selection, and then cancel the touch. So on touch we
//    listen to the touch itself and stop the browser from starting any of that
//    (preventDefault on touchstart/touchmove). Mouse and pen keep using pointer events.
// 2. A finger resting lightly on glass can lose contact for a few milliseconds, which the phone
//    reports as "lifted" and "down again". That is not a lift. A lift only counts when the
//    finger stays off for LIFT_GRACE_MS; it is then reported with the time it really left, so a
//    real lift is judged as fast as it was.
// 3. The pad shows the finger itself at once (the "held" look), not what the game thinks.

/** How long a finger must stay off the glass before it counts as lifted. */
export const LIFT_GRACE_MS = 110;

export function useHoldPad<T extends HTMLElement>(onDown: () => void, onUp: (agoMs: number) => void) {
  const ref = useRef<T>(null);
  /** Whether a finger (or mouse button) is on the pad right now, whatever the game thinks. */
  const held = useRef(false);
  const [heldUI, setHeldUI] = useState(false);
  const fns = useRef({ onDown, onUp });
  fns.current = { onDown, onUp };
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let touching = false;
    let pending = 0;
    let liftedAt = 0;
    const down = () => { held.current = true; setHeldUI(true); vibrate(8); fns.current.onDown(); };
    const up = (ago: number) => { held.current = false; setHeldUI(false); fns.current.onUp(ago); };
    const touchStart = (e: TouchEvent) => {
      e.preventDefault();
      if (pending) { clearTimeout(pending); pending = 0; touching = true; return; } // contact flicker: still held
      if (!touching) { touching = true; down(); }
    };
    const touchEnd = (e: TouchEvent) => {
      e.preventDefault();
      // Lifted only when no finger is left on the pad, and only if it stays off.
      if (!touching || e.targetTouches.length > 0) return;
      touching = false;
      liftedAt = performance.now();
      pending = window.setTimeout(() => { pending = 0; up(performance.now() - liftedAt); }, LIFT_GRACE_MS);
    };
    const touchMove = (e: TouchEvent) => e.preventDefault();
    const pDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
      down();
    };
    const pUp = (e: PointerEvent) => { if (e.pointerType !== 'touch' && held.current) up(0); };
    const noMenu = (e: Event) => e.preventDefault();
    const opt = { passive: false } as const;
    el.addEventListener('touchstart', touchStart, opt);
    el.addEventListener('touchend', touchEnd, opt);
    el.addEventListener('touchcancel', touchEnd, opt);
    el.addEventListener('touchmove', touchMove, opt);
    el.addEventListener('pointerdown', pDown);
    el.addEventListener('pointerup', pUp);
    el.addEventListener('pointercancel', pUp);
    el.addEventListener('contextmenu', noMenu);
    return () => {
      clearTimeout(pending);
      el.removeEventListener('touchstart', touchStart);
      el.removeEventListener('touchend', touchEnd);
      el.removeEventListener('touchcancel', touchEnd);
      el.removeEventListener('touchmove', touchMove);
      el.removeEventListener('pointerdown', pDown);
      el.removeEventListener('pointerup', pUp);
      el.removeEventListener('pointercancel', pUp);
      el.removeEventListener('contextmenu', noMenu);
    };
  }, []);
  return { ref, held, heldUI };
}

/**
 * A touch screen as the main input: answers get longer, since reading a small screen and lifting
 * a finger is slower than a key. Each call gets this much more time (and a longer look at the answer).
 */
export function touchExtraMs(): number {
  try { return matchMedia('(pointer: coarse)').matches ? 450 : 0; } catch { return 0; }
}

/** The pad as a component (one per player). */
//
// "disabled" is not the button's own disabled attribute: Safari may not deliver touches to a
// disabled button, and a finger already resting on the pad when it switches on must count as
// down. So the pad always hears the finger, and on switching on it reports where the finger is.
//
// Two looks: "held" (green, a tick, `downLabel`) while a finger is on it, and "free" (wood, a
// pulsing outline, `upLabel`) otherwise.
export function HoldPad({ onDown, onUp, className, testid, disabled, active, upLabel, downLabel, children }: {
  onDown: () => void; onUp: (agoMs: number) => void; className: string; testid?: string; disabled?: boolean;
  /** Held by other means (the keyboard): show the held look too. */
  active?: boolean;
  upLabel: string; downLabel?: string; children?: ReactNode;
}) {
  const off = useRef(!!disabled);
  off.current = !!disabled;
  const fns = useRef({ onDown, onUp });
  fns.current = { onDown, onUp };
  const { ref, held, heldUI } = useHoldPad<HTMLButtonElement>(() => { if (!off.current) onDown(); }, (ago) => { if (!off.current) onUp(ago); });
  // Switching on: tell the game where the finger really is (put down or lifted while it was off).
  useEffect(() => { if (!disabled) { if (held.current) fns.current.onDown(); else fns.current.onUp(0); } }, [disabled, held]);
  const isHeld = heldUI || !!active;
  const showHeld = isHeld && !!downLabel;
  return (
    <button ref={ref} type="button" className={`${className}${disabled ? ' off' : ''}${isHeld ? ' held' : ''}`} data-testid={testid} aria-disabled={disabled || undefined} aria-pressed={isHeld}>
      {children}
      <span className={`pu-pad-label${showHeld ? ' on' : ''}`}>{showHeld ? <><i aria-hidden="true">✓</i> {downLabel}</> : upLabel}</span>
    </button>
  );
}
