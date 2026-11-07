import type { JSX } from 'react';
import { BaghArt, ChitArt, FingerArt, WordArt } from '../games/bench-kit/art';

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


// ---- Phase 2 card doodles ----
const D = (children: JSX.Element) => <svg viewBox="0 0 170 130" aria-hidden="true">{children}</svg>;
export const DoodlePenFight = ({ accent = '#2c3e8f' }: { accent?: string }) => D(<>
  <rect x="10" y="30" width="150" height="80" rx="4" {...common} fill="#e9c79a" />
  <g transform="rotate(-18 60 70)"><rect x="25" y="64" width="70" height="10" rx="5" {...common} fill="#fff" strokeWidth={2.4} /><rect x="78" y="62" width="20" height="14" rx="5" fill="#c62f2f" /></g>
  <g transform="rotate(160 118 62)"><rect x="85" y="57" width="70" height="10" rx="5" {...common} fill="#fff" strokeWidth={2.4} /><rect x="138" y="55" width="20" height="14" rx="5" fill={accent} /></g>
  <path d="M60 50 L70 40 M66 56 L80 50" stroke="#c62f2f" strokeWidth="2.4" strokeLinecap="round" />
</>);
export const DoodleRubberBand = ({ accent = '#7d3c98' }: { accent?: string }) => D(<>
  <path d="M20 95 L50 95 L50 75 M50 85 L62 85" {...common} fill="none" />
  <path d="M50 75 Q75 80 62 85" stroke="#d4a017" strokeWidth="3" fill="none" />
  <path d="M70 70 Q100 40 130 55" {...common} strokeDasharray="5 6" />
  <ellipse cx="132" cy="56" rx="9" ry="3.5" fill="none" stroke="#d4a017" strokeWidth="3" />
  <path d="M120 110 L126 82 L146 82 L152 110 Z M118 110 L154 110" {...common} fill="#fff" />
  <path d="M124 96 L148 96" stroke={accent} strokeWidth="3" />
</>);
export const DoodleNotebook = ({ accent = '#1f4e9c' }: { accent?: string }) => D(<>
  <rect x="35" y="15" width="100" height="100" rx="4" {...common} fill="#fffaf0" />
  {[35, 50, 65, 80, 95].map((y) => <path key={y} d={`M35 ${y} L135 ${y}`} stroke="#c2d3e4" strokeWidth="1.5" />)}
  <path d="M50 15 L50 115" stroke="#d9534f" strokeWidth="1.5" />
  <path d="M65 85 Q90 105 115 85 L65 85 M90 85 L90 45 L112 78 L90 78" {...common} stroke={accent} />
  <path d="M140 40 L158 22" stroke="#7a5530" strokeWidth="5" strokeLinecap="round" /><path d="M140 40 L136 46" stroke="#1b1b1b" strokeWidth="3" />
</>);
export const DoodleElonti = ({ accent = '#117a65' }: { accent?: string }) => D(<>
  <path d="M140 120 L140 60" stroke="#6b4a2b" strokeWidth="8" /><circle cx="140" cy="45" r="25" fill="#5c9a44" />
  <circle cx="118" cy="62" r="8" {...common} fill="#fde7cf" /><path d="M118 70 L118 98 M118 98 L110 118 M118 98 L126 118 M118 78 L128 70" {...common} />
  <circle cx="45" cy="62" r="8" {...common} fill="#fde7cf" /><path d="M45 70 L45 98 M45 98 L35 118 M45 98 L55 116 M45 78 L32 86" {...common} />
  <rect x="62" y="16" width="60" height="22" rx="10" {...common} fill="#fff" strokeWidth={2} />
  <text x="92" y="32" textAnchor="middle" fontFamily="Baloo Da 2" fontWeight="800" fontSize="13" fill={accent}>১ ২ ৩!</text>
</>);
export const DoodleSpoon = ({ accent = '#5d6d7e' }: { accent?: string }) => D(<>
  <circle cx="60" cy="58" r="20" {...common} fill="#fde7cf" />
  <path d="M78 64 L118 60" stroke="#9aa0a6" strokeWidth="5" strokeLinecap="round" />
  <ellipse cx="130" cy="59" rx="15" ry="6" fill="#d5dbe1" stroke="#9aa0a6" strokeWidth="2" />
  <circle cx="131" cy="52" r="6.5" fill={accent} /><circle cx="129" cy="50" r="2" fill="#fff" />
  <path d="M50 80 L45 120 M70 80 L76 120" {...common} />
  <path d="M150 40 l6 -6 M146 34 l2 -8" stroke="#c62f2f" strokeWidth="2.4" strokeLinecap="round" />
</>);
export const DoodleHaari = ({ accent = '#a04000' }: { accent?: string }) => D(<>
  <path d="M30 20 L140 20" stroke="#b89545" strokeWidth="6" strokeLinecap="round" />
  <path d="M110 20 L110 40" {...common} strokeWidth={2} />
  <ellipse cx="110" cy="58" rx="20" ry="18" fill={accent} stroke="#5a2a0a" strokeWidth="2.4" />
  <circle cx="55" cy="72" r="11" {...common} fill="#fde7cf" /><rect x="45" y="66" width="21" height="6" fill="#d62a2a" />
  <path d="M55 83 L55 110 M55 110 L46 124 M55 110 L64 124 M55 90 L92 70" {...common} />
  <path d="M85 50 l-6 -6 M92 46 l-2 -8" stroke="#c62f2f" strokeWidth="2.4" strokeLinecap="round" />
</>);
export const DoodlePlane = ({ accent = '#2e86c1' }: { accent?: string }) => D(<>
  <rect x="10" y="85" width="40" height="40" {...common} fill="#e8d7a6" strokeWidth={2} /><rect x="120" y="95" width="45" height="30" {...common} fill="#c9dfc1" strokeWidth={2} />
  <rect x="128" y="80" width="16" height="15" fill="#1d1d1d" />
  <path d="M40 80 Q90 30 140 50" {...common} strokeDasharray="5 6" />
  <g transform="translate(110 40) rotate(-12)"><path d="M26 0 L-22 -12 L-14 0 L-22 6 Z" {...common} fill="#fff" strokeWidth={2.4} /><path d="M-18 -6 L14 -2" stroke={accent} strokeWidth="1.5" /></g>
</>);
export const DoodleBoat = ({ accent = '#148f77' }: { accent?: string }) => D(<>
  <path d="M10 95 Q40 85 70 95 T130 95 T170 92" stroke="#5f7f8f" strokeWidth="3" fill="none" />
  <path d="M40 80 L130 80 L115 98 L55 98 Z" {...common} fill="#f3efe2" />
  <path d="M85 80 L85 40 L110 80 M85 40 L60 80" {...common} fill="#f3efe2" />
  <path d="M65 88 L105 88" stroke="#999" strokeWidth="1.5" />
  {[20, 50, 80, 110, 140].map((x) => <path key={x} d={`M${x} 10 L${x - 6} 26`} stroke={accent} strokeWidth="2" strokeLinecap="round" />)}
</>);
export const DoodleChairs = ({ accent = '#cb4335' }: { accent?: string }) => D(<>
  <circle cx="85" cy="68" r="44" fill="none" stroke="#c9876a" strokeWidth="2" strokeDasharray="5 6" />
  {[0, 1, 2, 3].map((i) => { const a = i * Math.PI / 2 + 0.78; return <rect key={i} x={85 + Math.cos(a) * 24 - 9} y={68 + Math.sin(a) * 24 - 9} width="18" height="18" fill="#8b5a2b" stroke={PEN} strokeWidth="2" />; })}
  {[0, 1, 2, 3, 4].map((i) => { const a = i * 1.257; return <circle key={i} cx={85 + Math.cos(a) * 52} cy={68 + Math.sin(a) * 52} r="8" fill={i === 0 ? accent : '#1d140e'} />; })}
  <text x="150" y="30" fontSize="22" fill={PEN}>♪</text>
</>);
export const DoodleSack = ({ accent = '#9a7d0a' }: { accent?: string }) => D(<>
  <circle cx="85" cy="32" r="13" {...common} fill="#fde7cf" />
  <path d="M85 45 L85 64 M85 52 L70 66 M85 52 L100 66" {...common} />
  <path d="M64 62 L106 62 L104 118 Q85 124 66 118 Z" {...common} fill="#c9a25e" />
  <text x="85" y="98" textAnchor="middle" fontFamily="Baloo Da 2" fontWeight="700" fontSize="13" fill="#6b4a1f">চিনি</text>
  <path d="M30 122 L140 122" stroke={accent} strokeWidth="2" /><path d="M40 108 l-8 4 M44 98 l-9 0" stroke="#c62f2f" strokeWidth="2.4" strokeLinecap="round" />
</>);
export const DoodleThreeLegged = ({ accent = '#6c3483' }: { accent?: string }) => D(<>
  <circle cx="68" cy="28" r="12" {...common} fill="#fde7cf" /><circle cx="102" cy="28" r="12" {...common} fill="#fde7cf" />
  <path d="M68 40 L68 75 M102 40 L102 75 M68 50 L102 50" {...common} />
  <path d="M68 75 L52 118 M102 75 L118 118 M68 75 L84 118 M102 75 L86 118" {...common} />
  <rect x="75" y="96" width="20" height="10" fill="#d62a2a" /><path d="M78 96 L78 106 M84 96 L84 106 M90 96 L90 106" stroke="#fff" strokeWidth="1.5" />
  <path d="M30 122 L140 122" stroke={accent} strokeWidth="2" />
</>);

export const DoodleShortPitch = ({ accent = '#196f3d' }: { accent?: string }) => D(<>
  <ellipse cx="85" cy="94" rx="74" ry="30" {...common} fill="#cfe8b5" />
  <ellipse cx="85" cy="94" rx="65" ry="25" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeDasharray="5 4" />
  <path d="M79 72 L91 72 L97 118 L73 118 Z" {...common} fill="#e6cf9c" />
  <path d="M80 110 L80 94 M85 110 L85 94 M90 110 L90 94 M78.5 94 L91.5 94" stroke="#6b4a1f" strokeWidth="2.2" strokeLinecap="round" />
  <circle cx="112" cy="38" r="9" {...common} fill="#fde7cf" />
  <path d="M101.5 38 A10.5 10.5 0 0 1 122.5 38 Z" fill="#1c3f7a" stroke="#23253a" strokeWidth="2" />
  <path d="M104 41 L120 41" stroke="#9aa3ad" strokeWidth="2" />
  <path d="M112 47 L112 74 M112 55 L100 64 M112 74 L104 98 M112 74 L120 98" {...common} />
  <path d="M100 64 L86 82" stroke="#c9a25e" strokeWidth="6.5" strokeLinecap="round" />
  <circle cx="60" cy="60" r="5.5" fill="#e6e24a" stroke="#23253a" strokeWidth="1.6" />
  <path d="M66 62 L74 66 M66 57 L76 58" stroke={accent} strokeWidth="2" strokeLinecap="round" />
  <circle cx="34" cy="30" r="16" fill="#ffffff" stroke={accent} strokeWidth="3" />
  <text x="34" y="38" textAnchor="middle" fontFamily="Baloo Da 2" fontWeight="800" fontSize="21" fill="#23253a">৬</text>
  <path d="M22.5 18.5 L45.5 41.5" stroke="#c62f2f" strokeWidth="3.6" strokeLinecap="round" />
</>);


// ---- Phase 4 doodles ----
function DoodleNumberCricket({ accent = '#1f4e9c' }: { accent?: string }) {
  return (
    <svg viewBox="0 0 170 130" aria-hidden="true">
      <g transform="rotate(-8 50 65)"><rect x="22" y="26" width="56" height="74" rx="4" {...common} fill="#fffaf0" />{[44, 58, 72, 86].map((y) => <path key={y} d={`M26 ${y} H74`} stroke="#c2d3e4" strokeWidth="1.5" />)}<text x="50" y="84" textAnchor="middle" fontFamily="Baloo Da 2" fontWeight="800" fontSize="40" fill={PEN}>৪</text></g>
      <g transform="rotate(7 120 65)"><rect x="92" y="26" width="56" height="74" rx="4" {...common} fill="#fffaf0" />{[44, 58, 72, 86].map((y) => <path key={y} d={`M96 ${y} H144`} stroke="#c2d3e4" strokeWidth="1.5" />)}<text x="120" y="84" textAnchor="middle" fontFamily="Baloo Da 2" fontWeight="800" fontSize="40" fill="#c62f2f">০</text></g>
      <circle cx="85" cy="18" r="13" fill={accent} /><text x="85" y="24" textAnchor="middle" fontFamily="Baloo Da 2" fontWeight="800" fontSize="16" fill="#fff">VS</text>
    </svg>
  );
}
function DoodleFlikk({ accent = '#11804a' }: { accent?: string }) {
  return (
    <svg viewBox="0 0 170 130" aria-hidden="true">
      <rect x="14" y="12" width="142" height="106" rx="6" fill={accent} opacity="0.9" />
      <path d="M14 65 H156 M85 12 V118" stroke="#fff" strokeWidth="2" opacity="0.7" /><circle cx="85" cy="65" r="18" fill="none" stroke="#fff" strokeWidth="2" opacity="0.7" />
      <rect x="62" y="6" width="46" height="10" fill="none" stroke="#fff" strokeWidth="2.5" />
      {[[50, 90], [85, 96], [120, 90], [70, 74]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="8" fill="#f42a41" stroke="#fff" strokeWidth="2" />)}
      {[[60, 40], [110, 40], [85, 30]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="8" fill="#74acdf" stroke="#fff" strokeWidth="2" />)}
      <circle cx="84" cy="56" r="5" fill="#fff" stroke="#222" strokeWidth="1.5" />
      <path d="M70 74 Q 74 62 82 58" stroke="#ffe27a" strokeWidth="3" fill="none" strokeDasharray="4 4" />
    </svg>
  );
}
function DoodlePenalty({ accent = '#7a1f9a' }: { accent?: string }) {
  return (
    <svg viewBox="0 0 170 130" aria-hidden="true">
      <path d="M30 26 H140 V76" {...common} strokeWidth={5} stroke="#555" /><path d="M30 26 V76" {...common} strokeWidth={5} stroke="#555" />
      {[42, 56, 70, 84, 98, 112, 126].map((x) => <path key={x} d={`M${x} 26 V76`} stroke="#bbb" strokeWidth="1" />)}{[38, 50, 62].map((y) => <path key={y} d={`M30 ${y} H140`} stroke="#bbb" strokeWidth="1" />)}
      <g transform="translate(108 46) rotate(30)"><rect x="-8" y="-14" width="16" height="26" rx="3" fill={accent} /><circle cx="0" cy="-20" r="6" fill="#b07a52" /><path d="M-8 -10 L-22 -22 M8 -10 L22 -22" stroke={accent} strokeWidth="5" strokeLinecap="round" /></g>
      <circle cx="62" cy="40" r="7" fill="#fff" stroke="#222" strokeWidth="1.8" />
      <path d="M85 116 Q 74 80 64 48" stroke="#f3b61f" strokeWidth="3" fill="none" strokeDasharray="5 5" />
      <ellipse cx="85" cy="116" rx="14" ry="4" fill="#5a8f4a" />
    </svg>
  );
}
function DoodleFiveStones({ accent = '#8a6d3b' }: { accent?: string }) {
  return (
    <svg viewBox="0 0 170 130" aria-hidden="true">
      {[[40, 96], [70, 108], [104, 98], [132, 110]].map(([x, y], i) => <ellipse key={i} cx={x} cy={y} rx="11" ry="9" fill="#d7c7ad" stroke={accent} strokeWidth="2.5" />)}
      <ellipse cx="86" cy="24" rx="11" ry="9" fill="#e58f7a" stroke="#9a4f3c" strokeWidth="2.5" />
      <path d="M86 36 V58" stroke="#9a4f3c" strokeWidth="2" strokeDasharray="3 4" />
      <path d="M60 78 C 60 64 112 64 112 78 L 108 86 L 64 86 Z" {...common} fill="#fde7cf" />
    </svg>
  );
}
function DoodleDots({ accent = '#c0392b' }: { accent?: string }) {
  return (
    <svg viewBox="0 0 170 130" aria-hidden="true">
      <rect x="30" y="20" width="44" height="44" fill="#e8edfb" /><text x="52" y="50" textAnchor="middle" fontFamily="Baloo Da 2" fontWeight="800" fontSize="22" fill={PEN}>R</text>
      <rect x="74" y="64" width="44" height="44" fill="#fbe3e1" /><text x="96" y="94" textAnchor="middle" fontFamily="Baloo Da 2" fontWeight="800" fontSize="22" fill={accent}>S</text>
      <path d="M30 20 H74 V64 H30 Z" stroke={PEN} strokeWidth="3.5" fill="none" /><path d="M74 64 H118 V108 H74 Z M118 20 V64" stroke={accent} strokeWidth="3.5" fill="none" />
      {[30, 74, 118].map((x) => [20, 64, 108].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="4.5" fill="#23253a" />))}
    </svg>
  );
}
function DoodleHangman({ accent = '#34495e' }: { accent?: string }) {
  return (
    <svg viewBox="0 0 170 130" aria-hidden="true">
      <rect x="10" y="8" width="150" height="114" rx="6" fill="#24392d" stroke="#7a5530" strokeWidth="5" />
      <g stroke="#f4f1e6" strokeWidth="3.5" fill="none" strokeLinecap="round"><path d="M28 104 H70 M40 104 V24 H78 V34" /><circle cx="78" cy="44" r="9" /><path d="M78 53 V76 M78 60 L68 70 M78 60 L88 70" /></g>
      {['_', 'আ', '_'].map((c, i) => <text key={i} x={108 + i * 16} y="80" fontFamily="Baloo Da 2" fontWeight="800" fontSize="18" fill="#f3b61f" textAnchor="middle">{c}</text>)}
      <path d="M100 86 H150" stroke={accent} strokeWidth="0" />
    </svg>
  );
}
function DoodleEraser({ accent = '#d35400' }: { accent?: string }) {
  return (
    <svg viewBox="0 0 170 130" aria-hidden="true">
      <rect x="10" y="10" width="150" height="110" rx="6" fill="#b98552" />
      <g transform="rotate(-10 70 86)"><rect x="34" y="70" width="70" height="36" rx="6" fill="#f7f4ea" stroke="#555" strokeWidth="2" /><rect x="52" y="70" width="40" height="36" fill="#2f6fd6" /></g>
      <g transform="rotate(14 112 44)"><rect x="80" y="28" width="64" height="32" rx="6" fill="#fff3c4" stroke="#555" strokeWidth="2" /><rect x="96" y="28" width="36" height="32" fill={accent} /></g>
      <path d="M60 64 Q 70 34 92 36" stroke="#fff" strokeWidth="2.5" fill="none" strokeDasharray="4 5" />
    </svg>
  );
}

export const DOODLES: Record<string, (p: { accent?: string }) => JSX.Element> = {
  'number-cricket': DoodleNumberCricket,
  'flikk-football': DoodleFlikk,
  'penalty': DoodlePenalty,
  'five-stones': DoodleFiveStones,
  'dots-boxes': DoodleDots,
  'hangman': DoodleHangman,
  'eraser-flip': DoodleEraser,
  'chor-police': ChitArt,
  'naam-desh': WordArt,
  'jor-bejor': FingerArt,
  'bagh-bandi': BaghArt,
  'short-pitch': DoodleShortPitch,
  'hand-cricket': DoodleHandCricket,
  'book-cricket': DoodleBookCricket,
  'pakhir-ure': DoodlePakhirUre,
  'tug-of-war': DoodleTugOfWar,
  'balloon-burst': DoodleBalloon,
  'biscuit-race': DoodleBiscuit,
  'pen-fight': DoodlePenFight,
  'rubber-band': DoodleRubberBand,
  'notebook-drawing': DoodleNotebook,
  'elonti-belonti': DoodleElonti,
  'spoon-marble': DoodleSpoon,
  'haari-bhanga': DoodleHaari,
  'paper-plane': DoodlePlane,
  'paper-boat': DoodleBoat,
  'musical-chairs': DoodleChairs,
  'sack-race': DoodleSack,
  'three-legged': DoodleThreeLegged,
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
