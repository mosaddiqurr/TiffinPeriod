// The chalk drawing, shared by the classroom game and the online duel. The head is a plain
// circle: no face, ever.

export const PARTS = 11;

/** How many chalk lines to show for `used` chances out of `lives` (all of them when lost). */
export const partsFor = (used: number, lives: number, lost: boolean) => (lost ? PARTS : Math.min(PARTS, Math.ceil((used * PARTS) / lives)));

export function Gallows({ parts, saved, className = '' }: { parts: number; saved: boolean; className?: string }) {
  const show = (i: number) => parts > i;
  return (
    <svg viewBox="0 0 200 220" className={`hm-gallows ${saved ? 'saved' : ''} ${className}`} aria-hidden="true">
      <g stroke="#f4f1e6" strokeWidth="5" strokeLinecap="round" fill="none">
        {show(0) && <path d="M20 205 H130" />}
        {show(1) && <path d="M50 205 V20" />}
        {show(2) && <path d="M50 20 H140" />}
        {show(3) && <path d="M50 55 L85 20" />}
        {show(4) && !saved && <path d="M140 20 V48" strokeWidth="3" />}
        <g className="hm-person">
          {show(5) && <circle cx="140" cy="66" r="18" />}
          {show(6) && <path d="M140 84 V140" />}
          {show(7) && <path d="M140 98 L114 122" />}
          {show(8) && <path d="M140 98 L166 122" />}
          {show(9) && <path d="M140 140 L118 178" />}
          {show(10) && <path d="M140 140 L162 178" />}
        </g>
      </g>
    </svg>
  );
}
