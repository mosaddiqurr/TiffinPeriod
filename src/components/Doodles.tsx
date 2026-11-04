import type { JSX } from 'react';

// Original hand-drawn "ballpoint pen" doodles, used as game card art.
// Style rule: blue pen outline (#1f3a93), round caps, one accent colour fill.

const PEN = '#1f3a93';
const common = { fill: 'none', stroke: PEN, strokeWidth: 3, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export function DoodleHandCricket({ accent = '#c0392b' }: { accent?: string }) {
  return (
    <svg viewBox="0 0 170 130" aria-hidden="true">
      {/* left hand: three fingers */}
      <g transform="translate(18 18) rotate(-8)">
        <path d="M18 92 C 8 80 8 62 14 54 L 14 40 C 14 34 22 34 22 40 L 22 52" {...common} />
        <path d="M22 52 L 22 14 C 22 6 32 6 32 14 L 32 50" {...common} />
        <path d="M32 50 L 32 8 C 32 0 42 0 42 8 L 42 50" {...common} />
        <path d="M42 50 L 42 16 C 42 8 52 8 52 16 L 52 58 C 56 50 64 52 62 60 C 58 74 54 84 46 92 Z" {...common} fill="#fde7cf" />
        <path d="M18 92 L 46 92" {...common} />
        <rect x="14" y="92" width="36" height="16" rx="3" {...common} fill="#e8eefc" />
      </g>
      {/* right hand: thumb up = six */}
      <g transform="translate(96 30) rotate(10)">
        <path d="M10 40 L 10 78 L 46 78 C 56 78 58 68 54 62 C 60 58 58 50 52 48 C 58 44 54 36 48 36 L 34 36 L 36 18 C 37 8 26 4 24 14 L 18 36 Z" {...common} fill="#fde7cf" />
        <rect x="8" y="78" width="40" height="16" rx="3" {...common} fill="#e8eefc" />
      </g>
      <circle cx="86" cy="22" r="15" fill={accent} opacity="0.9" />
      <text x="86" y="29" textAnchor="middle" fontFamily="Baloo Da 2" fontWeight="800" fontSize="20" fill="#fff">৬</text>
    </svg>
  );
}

export function DoodleBookCricket({ accent = '#8d5a2b' }: { accent?: string }) {
  return (
    <svg viewBox="0 0 170 130" aria-hidden="true">
      <path d="M85 28 C 60 16 34 18 14 26 L 14 108 C 34 100 60 100 85 112 Z" {...common} fill="#fffaf0" />
      <path d="M85 28 C 110 16 136 18 156 26 L 156 108 C 136 100 110 100 85 112 Z" {...common} fill="#fffaf0" />
      <path d="M14 108 C 34 100 60 100 85 112 C 110 100 136 100 156 108 L 156 114 C 136 106 110 106 85 118 C 60 106 34 106 14 114 Z" fill={accent} opacity="0.85" />
      {[44, 56, 68].map((y) => <path key={y} d={`M26 ${y} C 45 ${y - 5} 60 ${y - 4} 74 ${y}`} {...common} strokeWidth={2} opacity={0.55} />)}
      {[44, 56, 68].map((y) => <path key={y} d={`M96 ${y} C 110 ${y - 4} 125 ${y - 5} 144 ${y}`} {...common} strokeWidth={2} opacity={0.55} />)}
      <text x="40" y="96" fontFamily="Baloo Da 2" fontWeight="700" fontSize="17" fill={PEN}>৪৬</text>
      <text x="118" y="96" fontFamily="Baloo Da 2" fontWeight="700" fontSize="17" fill={PEN}>৪৭</text>
      <circle cx="58" cy="91" r="12" fill="none" stroke="#c62f2f" strokeWidth="2.5" />
      <circle cx="140" cy="16" r="9" fill="#c62f2f" /><path d="M134 12 Q 140 16 134 21 M146 12 Q 140 16 146 21" stroke="#fff" strokeWidth="1.6" fill="none" />
    </svg>
  );
}

export function DoodlePakhirUre({ accent = '#1f6f8b' }: { accent?: string }) {
  return (
    <svg viewBox="0 0 170 130" aria-hidden="true">
      <path d="M60 46 C 70 30 84 26 96 38 C 104 26 122 20 136 26 C 124 30 112 40 104 50 C 98 58 86 60 76 56 L 62 64 L 66 52 Z" {...common} fill={accent} fillOpacity={0.25} />
      <circle cx="73" cy="47" r="1.8" fill={PEN} />
      <path d="M40 30 Q 46 24 52 30 Q 58 24 64 30" {...common} strokeWidth={2.4} transform="translate(-14 -8)" />
      <path d="M118 66 Q 123 61 128 66 Q 133 61 138 66" {...common} strokeWidth={2.4} />
      {/* finger lifting off the bench */}
      <path d="M40 124 L 40 86 C 40 78 50 78 50 86 L 50 124" {...common} fill="#fde7cf" />
      <path d="M36 96 L 28 92 M 54 96 L 62 92 M 45 74 L 45 66" {...common} strokeWidth={2.2} stroke="#c62f2f" />
      <path d="M0 124 L 170 124" stroke="#8d5a2b" strokeWidth="6" />
      <rect x="92" y="84" width="66" height="28" rx="12" fill="#fff" stroke={PEN} strokeWidth="2.5" />
      <text x="125" y="104" textAnchor="middle" fontFamily="Baloo Da 2" fontWeight="800" fontSize="17" fill="#c62f2f">উড়ে!</text>
    </svg>
  );
}

export function DoodleTugOfWar({ accent = '#b9770e' }: { accent?: string }) {
  const kid = (x: number, flip: number, color: string) => (
    <g transform={`translate(${x} 0) scale(${flip} 1)`}>
      <circle cx="0" cy="44" r="9" {...common} fill="#fde7cf" />
      <path d="M2 54 L -10 84 M -10 84 L -22 104 M -10 84 L 2 104 M 0 62 L 20 70" {...common} />
      <path d="M2 54 L -10 84" stroke={color} strokeWidth="7" strokeLinecap="round" />
    </g>
  );
  return (
    <svg viewBox="0 0 170 130" aria-hidden="true">
      <path d="M8 72 Q 85 80 162 72" {...common} stroke="#a0773c" strokeWidth={4} />
      <path d="M8 72 Q 85 80 162 72" fill="none" stroke="#e6c48a" strokeWidth="1.5" strokeDasharray="3 4" />
      {kid(42, -1, '#c0392b')}
      {kid(128, 1, '#1f4e9c')}
      <path d="M85 76 L 80 92 L 90 92 Z" fill="#c62f2f" />
      <path d="M85 104 L 85 122" stroke={accent} strokeWidth="3" strokeDasharray="4 4" />
      <path d="M4 110 L 166 110" stroke="#6b8f3a" strokeWidth="2" opacity="0.6" />
    </svg>
  );
}

export function DoodleBalloon({ accent = '#d6336c' }: { accent?: string }) {
  const b = (x: number, y: number, c: string, s = 1) => (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M0 -26 C 18 -26 22 -8 18 2 C 14 12 6 18 0 20 C -6 18 -14 12 -18 2 C -22 -8 -18 -26 0 -26 Z" fill={c} stroke={PEN} strokeWidth="2.6" />
      <path d="M-8 -16 Q -12 -8 -10 -2" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.8" />
      <path d="M-3 22 L 3 22 L 0 19 Z" fill={c} stroke={PEN} strokeWidth="1.6" />
      <path d="M0 23 C -6 34 6 42 0 56" {...common} strokeWidth={1.8} />
    </g>
  );
  return (
    <svg viewBox="0 0 170 130" aria-hidden="true">
      {b(52, 46, accent)}
      {b(92, 36, '#f3b61f', 1.1)}
      {b(126, 58, '#12a07e', 0.9)}
      <g transform="translate(26 104) rotate(-35)">
        <path d="M0 0 L 34 0" stroke="#7a7f8a" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="-3" cy="0" r="5" fill="#c62f2f" />
      </g>
      <path d="M134 22 l4 -8 M142 28 l9 -3 M140 18 l6 -6" stroke="#c62f2f" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function DoodleBiscuit({ accent = '#a0522d' }: { accent?: string }) {
  return (
    <svg viewBox="0 0 170 130" aria-hidden="true">
      <path d="M6 12 Q 85 22 164 12" {...common} stroke="#7a5530" strokeWidth={3} />
      <path d="M92 16 L 98 52" {...common} strokeWidth={1.8} />
      <g transform="translate(98 66) rotate(10)">
        <rect x="-20" y="-14" width="40" height="28" rx="4" fill="#e9b25d" stroke={accent} strokeWidth="2.6" />
        {[-11, 0, 11].map((x) => [-6, 6].map((y) => <circle key={`${x}${y}`} cx={x} cy={y} r="1.8" fill={accent} />))}
      </g>
      {/* kid looking up with open mouth, hands behind back */}
      <circle cx="62" cy="88" r="17" {...common} fill="#fde7cf" />
      <path d="M50 78 Q 62 66 76 78" fill="#2b2118" />
      <ellipse cx="70" cy="94" rx="5" ry="6" fill="#7a2420" />
      <circle cx="58" cy="84" r="2" fill={PEN} /><circle cx="68" cy="82" r="2" fill={PEN} />
      <path d="M48 106 C 44 118 46 124 48 128 M76 106 C 80 118 78 124 76 128" {...common} />
      <path d="M84 70 l 6 -4 M86 78 l 7 0" stroke="#c62f2f" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function SchoolBell({ size = 96 }: { size?: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      <path d="M50 8 L 50 18" stroke="#6b4a1f" strokeWidth="5" strokeLinecap="round" />
      <path d="M22 70 C 22 40 30 20 50 20 C 70 20 78 40 78 70 L 84 78 L 16 78 Z" fill="#e2a72b" stroke="#6b4a1f" strokeWidth="3.5" strokeLinejoin="round" />
      <path d="M32 66 C 32 44 38 30 48 28" stroke="#fff3c4" strokeWidth="5" fill="none" strokeLinecap="round" opacity="0.8" />
      <circle cx="50" cy="86" r="7" fill="#6b4a1f" />
      <path d="M8 40 Q 4 50 8 60 M92 40 Q 96 50 92 60" stroke="#c62f2f" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function Star({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <circle cx="20" cy="20" r="19" fill="#f3b61f" />
      <path d="M20 7 L 23.5 16 L 33 16.5 L 25.6 22.5 L 28.2 32 L 20 26.6 L 11.8 32 L 14.4 22.5 L 7 16.5 L 16.5 16 Z" fill="#fff" stroke="#b37a00" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export function Signature() {
  return (
    <svg viewBox="0 0 90 30" aria-hidden="true">
      <path d="M4 22 C 12 4 18 4 16 18 C 15 26 24 10 30 12 C 34 14 30 24 38 18 C 46 12 50 8 52 16 C 54 24 62 10 70 14 L 86 12" fill="none" stroke="#1f3a93" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export const DOODLES: Record<string, (p: { accent?: string }) => JSX.Element> = {
  'hand-cricket': DoodleHandCricket,
  'book-cricket': DoodleBookCricket,
  'pakhir-ure': DoodlePakhirUre,
  'tug-of-war': DoodleTugOfWar,
  'balloon-burst': DoodleBalloon,
  'biscuit-race': DoodleBiscuit,
};

// ---- UI icons ----
const ic = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
export const IconBack = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5 L 8 12 L 15 19" {...ic} /></svg>;
export const IconHelp = () => <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" {...ic} /><path d="M9.5 9.5 C 9.5 6.5 14.5 6.5 14.5 9.5 C 14.5 11.5 12 11.5 12 14" {...ic} /><circle cx="12" cy="17.5" r="1.2" fill="currentColor" /></svg>;
export const IconPause = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6 L 9 18 M15 6 L 15 18" {...ic} strokeWidth={3} /></svg>;
export const IconSoundOn = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10 L 4 14 L 8 14 L 13 18 L 13 6 L 8 10 Z" {...ic} /><path d="M16 9 C 18 11 18 13 16 15 M18.5 6.5 C 22 10 22 14 18.5 17.5" {...ic} /></svg>;
export const IconSoundOff = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10 L 4 14 L 8 14 L 13 18 L 13 6 L 8 10 Z" {...ic} /><path d="M17 9 L 22 15 M22 9 L 17 15" {...ic} /></svg>;
export const IconGear = () => <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.2" {...ic} /><path d="M12 2.8 L 12 5.2 M12 18.8 L 12 21.2 M21.2 12 L 18.8 12 M5.2 12 L 2.8 12 M18.5 5.5 L 16.8 7.2 M7.2 16.8 L 5.5 18.5 M18.5 18.5 L 16.8 16.8 M7.2 7.2 L 5.5 5.5" {...ic} /></svg>;
export const IconTrophy = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4 L 17 4 L 17 9 C 17 12 15 14 12 14 C 9 14 7 12 7 9 Z M7 6 L 4 6 C 4 9 5 10 7 10 M17 6 L 20 6 C 20 9 19 10 17 10 M12 14 L 12 18 M8 20 L 16 20" {...ic} /></svg>;
