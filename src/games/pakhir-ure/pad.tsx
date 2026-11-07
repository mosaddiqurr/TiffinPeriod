import { useEffect, useRef, type ReactNode } from 'react';

// The finger pad, made reliable on phones.
//
// A phone browser treats a finger held on a button as a long press: it may show the text
// magnifier, start "haptic touch" or a selection, and then cancel the touch. The game would
// read that cancel as "finger lifted". So on touch we listen to the touch itself and stop the
// browser from starting any of that (preventDefault on touchstart/touchmove). Only the finger
// actually leaving the pad counts as a lift. Mouse and pen keep using pointer events.

export function useHoldPad<T extends HTMLElement>(onDown: () => void, onUp: () => void) {
  const ref = useRef<T>(null);
  const fns = useRef({ onDown, onUp });
  fns.current = { onDown, onUp };
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let touching = false;
    const touchStart = (e: TouchEvent) => {
      e.preventDefault();
      if (!touching) { touching = true; fns.current.onDown(); }
    };
    const touchEnd = (e: TouchEvent) => {
      e.preventDefault();
      // Lifted only when no finger is left on the pad.
      if (touching && e.targetTouches.length === 0) { touching = false; fns.current.onUp(); }
    };
    const touchMove = (e: TouchEvent) => e.preventDefault();
    const pDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
      fns.current.onDown();
    };
    const pUp = (e: PointerEvent) => { if (e.pointerType !== 'touch') fns.current.onUp(); };
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
  return ref;
}

/** A touch screen as the main input: answers get a little longer, since lifting a finger is slower than a key. */
export function touchExtraMs(): number {
  try { return matchMedia('(pointer: coarse)').matches ? 250 : 0; } catch { return 0; }
}

/** The pad as a component (one per player). */
export function HoldPad({ onDown, onUp, className, testid, disabled, children }: { onDown: () => void; onUp: () => void; className: string; testid?: string; disabled?: boolean; children: ReactNode }) {
  const off = useRef(!!disabled);
  off.current = !!disabled;
  const ref = useHoldPad<HTMLButtonElement>(() => { if (!off.current) onDown(); }, () => { if (!off.current) onUp(); });
  return <button ref={ref} type="button" className={className} data-testid={testid} disabled={disabled}>{children}</button>;
}
