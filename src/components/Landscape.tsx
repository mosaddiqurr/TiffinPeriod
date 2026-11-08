import { useEffect, useState } from 'react';
import { useSettings } from '../platform/settings';
import { sfx } from '../platform/audio';

// Wide games (Rubber Band, Balloon Burst...) are played sideways on a phone.
//  - Android: tryLandscape() is called from the Start tap. It goes full screen and locks the
//    screen sideways, so the phone turns by itself.
//  - iPhone (a web page cannot turn it): while the phone is upright, the game pauses behind
//    a card that asks the player to turn the phone. It goes away by itself once they do.

const PHONE_PORTRAIT = '(orientation: portrait) and (max-width: 760px) and (pointer: coarse)';

type OrientationWithLock = ScreenOrientation & { lock?: (o: string) => Promise<void>; unlock?: () => void };

function canLock(): boolean {
  const o = screen.orientation as OrientationWithLock | undefined;
  return typeof document.documentElement.requestFullscreen === 'function' && typeof o?.lock === 'function';
}

let locked = false;

/** Turn the phone sideways if the browser allows it (call it inside a tap). Returns quietly otherwise. */
export function tryLandscape(): void {
  if (typeof window === 'undefined' || !matchMedia(PHONE_PORTRAIT).matches || !canLock()) return;
  const o = screen.orientation as OrientationWithLock;
  const lock = () => o.lock!('landscape').then(() => { locked = true; }).catch(() => { /* not allowed here */ });
  try {
    if (document.fullscreenElement) void lock();
    else document.documentElement.requestFullscreen({ navigationUI: 'hide' }).then(lock).catch(() => { /* not allowed */ });
  } catch { /* old browser */ }
}

/** Undo tryLandscape (when the game closes). */
export function releaseLandscape(): void {
  if (!locked) return;
  locked = false;
  try { (screen.orientation as OrientationWithLock).unlock?.(); } catch { /* ignore */ }
  try { if (document.fullscreenElement) void document.exitFullscreen().catch(() => {}); } catch { /* ignore */ }
}

function usePhonePortrait(): boolean {
  const [on, setOn] = useState(() => typeof window !== 'undefined' && matchMedia(PHONE_PORTRAIT).matches);
  useEffect(() => {
    const m = matchMedia(PHONE_PORTRAIT);
    const f = () => setOn(m.matches);
    f();
    m.addEventListener('change', f);
    addEventListener('resize', f);
    return () => { m.removeEventListener('change', f); removeEventListener('resize', f); };
  }, []);
  return on;
}

/**
 * For a game that needs a wide screen. `active` = the game is being played (not on a menu).
 * Returns whether the game should wait for the phone to turn, and the card to show meanwhile.
 */
export function useLandscapeGate(active: boolean) {
  const portrait = usePhonePortrait();
  const [skipped, setSkipped] = useState(false);
  useEffect(() => () => releaseLandscape(), []);
  const waiting = active && portrait && !skipped;
  const card = waiting ? <RotateCard onSkip={() => { sfx('click'); setSkipped(true); }} /> : null;
  return { waiting, card };
}

function RotateCard({ onSkip }: { onSkip: () => void }) {
  const { lang } = useSettings();
  const tx = (en: string, bn: string) => (lang === 'bn' ? bn : en);
  const lockable = canLock();
  return (
    <div className="rotate-gate" role="dialog" aria-modal="true" aria-label={tx('Turn your phone sideways', 'ফোনটা আড়াআড়ি ধরো')} data-testid="rotate-gate">
      <div className="rotate-card">
        <svg className="rotate-phone" viewBox="0 0 120 120" aria-hidden="true">
          <g className="rotate-phone-body">
            <rect x="38" y="14" width="44" height="92" rx="9" fill="#fffdf6" stroke="#23253a" strokeWidth="5" />
            <rect x="45" y="25" width="30" height="66" rx="3" fill="#1f6f8b" opacity=".25" />
            <circle cx="60" cy="98" r="3.5" fill="#23253a" />
          </g>
          <path d="M98 34 a40 40 0 0 1 4 40" fill="none" stroke="#0b5d43" strokeWidth="5" strokeLinecap="round" />
          <path d="M94 70 l8 6 l4 -10" fill="none" stroke="#0b5d43" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <h2>{tx('Turn your phone sideways', 'ফোনটা আড়াআড়ি ধরো')}</h2>
        <p>{tx('This game needs a wide screen. It waits until you turn the phone.', 'এই খেলায় চওড়া পর্দা লাগে। ফোন ঘোরালেই খেলা চলবে।')}</p>
        {lockable && <button type="button" className="btn big" onClick={() => tryLandscape()} data-testid="rotate-now">{tx('Turn it for me', 'ঘুরিয়ে দাও')}</button>}
        <button type="button" className="btn secondary" onClick={onSkip} data-testid="rotate-skip">{tx('Play upright anyway', 'সোজা রেখেই খেলব')}</button>
        <small>{tx('Tip: switch off the phone’s rotation lock if the screen does not turn.', 'পর্দা না ঘুরলে ফোনের “অটো-রোটেট” চালু করো।')}</small>
      </div>
    </div>
  );
}
