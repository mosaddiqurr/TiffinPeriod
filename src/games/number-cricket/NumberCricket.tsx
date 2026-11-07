import { useMemo } from 'react';
import type { GameProps } from '../../platform/registry';
import { Seg } from '../../components/ui';
import { CricketHub, type CricketAdapter, type CricketMatchProps } from '../../components/sport/CricketHub';
import { useTx } from '../../components/sport/SportKit';
import { fmtNum } from '../../platform/i18n';
import { useSettings } from '../../platform/settings';
import { PickMatch, type PickVariant } from '../hand-cricket/PickMatch';
import { NUMS, NumberAI, parFor, rulesFor, type Variant } from './model';
import './number-cricket.css';

// Number Cricket: secret numbers on paper chits, opened together.

const rulesList = (variant: Variant) => (t: (en: string, bn: string) => string) => [
  t('Both players secretly write a number on a chit. Both chits open at the same time.', 'দুজনে গোপনে একটা চিরকুটে সংখ্যা লেখে। দুটো চিরকুট একসাথে খোলা হয়।'),
  t('Same number: the batter is OUT. Different: the batter scores the batter’s number.', 'একই সংখ্যা হলে ব্যাটার আউট। আলাদা হলে ব্যাটার নিজের সংখ্যার সমান রান পায়।'),
  variant === 'zero'
    ? t('Zero rule: if the batter writes 0 and the bowler does not, the batter steals the BOWLER’s number as runs. So bowling a 6 is risky!', 'শূন্যের নিয়ম: ব্যাটার ০ লিখলে আর বোলার না লিখলে, ব্যাটার বোলারের সংখ্যাটাই রান হিসেবে পায়। তাই ৬ বল করা ঝুঁকির!')
    : t('Big numbers: pick from 1 to 10. Big scores, but a match is still OUT.', 'বড় সংখ্যা: ১ থেকে ১০-এর মধ্যে বাছো। রান বেশি, তবে মিললে আউট।'),
  t('The computer writes its chit before you do and learns your habits. Keys: number keys (0 = 10 in big numbers).', 'কম্পিউটার তোমার আগেই চিরকুট লেখে আর তোমার অভ্যাস শিখে নেয়। কী-বোর্ডে সংখ্যার বোতাম (বড় সংখ্যায় ০ = ১০)।'),
];

function Chit({ n, side, cuff, label, shaking }: { n: number | null; side: 0 | 1; cuff: string; label: string; shaking: boolean }) {
  const { lang } = useSettings();
  const open = n !== null;
  return (
    <svg viewBox="0 0 140 170" role="img" aria-label={open ? `${label}: ${n}` : label} className={`nc-chit ${open ? 'open' : ''} ${shaking ? 'shaking' : ''}`}>
      <g transform={side === 1 ? 'rotate(4 70 85)' : 'rotate(-4 70 85)'}>
        <rect x="14" y="16" width="112" height="138" rx="4" fill="#fffdf6" stroke="#c9b98f" strokeWidth="2" />
        {[40, 62, 84, 106, 128].map((y) => <line key={y} x1="20" x2="120" y1={y} y2={y} stroke="#c2d3e4" strokeWidth="1.5" />)}
        <line x1="34" x2="34" y1="16" y2="154" stroke="#d9534f" strokeWidth="1.5" opacity="0.7" />
        <rect x="14" y="16" width="112" height="8" fill={cuff} opacity="0.85" />
        {open ? (
          <text x="76" y="118" textAnchor="middle" fontSize={n !== null && n >= 10 ? 66 : 84} fontWeight="800" fill="#1f3a93" fontFamily="var(--font-display)" style={{ transform: 'rotate(-3deg)', transformOrigin: '76px 90px' }}>
            {fmtNum(n!, lang)}
          </text>
        ) : (
          <>
            <path d="M14 85 L126 85" stroke="#c9b98f" strokeWidth="2" strokeDasharray="4 4" />
            <path d="M14 16 L126 16 L126 85 L14 85 Z" fill="#f1e7cc" stroke="#c9b98f" strokeWidth="2" />
            <text x="70" y="70" textAnchor="middle" fontSize="44" fontWeight="800" fill="#b5a57d" fontFamily="var(--font-display)">?</text>
          </>
        )}
      </g>
    </svg>
  );
}

function makeVariant(variant: Variant): PickVariant {
  const nums = NUMS[variant];
  return {
    gameId: 'number-cricket',
    nums,
    rules: rulesFor(variant),
    makeAI: (d, rng) => new NumberAI(d, rng, variant),
    Reveal: (p) => <Chit {...p} />,
    ButtonArt: () => null,
    keys: nums.map((v) => (v === 10 ? '0' : String(v))),
    p2Keys: variant === 'zero' ? ['y', 'u', 'i', 'o', 'h', 'j', 'k'] : ['y', 'u', 'i', 'o', 'p', 'h', 'j', 'k', 'l', ';'],
    rootClass: `number nc-${variant}`,
    toss: 'coin',
    par: parFor(variant),
    rulesList: rulesList(variant),
    explain: (rec, t) => (variant === 'zero' && rec.bat === 0 && !rec.out ? t(`Zero rule: stole the bowler’s ${rec.bowl}!`, `শূন্যের নিয়ম: বোলারের ${rec.bowl} চুরি!`) : null),
  };
}

function NumberMatch(p: CricketMatchProps) {
  const fixed = p.spec.mode === 'challenge' || p.spec.mode === 'daily';
  const variant: Variant = fixed ? 'zero' : p.spec.extra.variant === 'ten' ? 'ten' : 'zero';
  const v = useMemo(() => makeVariant(variant), [variant]);
  return <PickMatch {...p} v={v} />;
}

function NumberOptions({ value, onChange }: { value: Record<string, string | number>; onChange: (v: Record<string, string | number>) => void }) {
  const { t } = useTx();
  return (
    <>
      <div className="opt-label">{t('Numbers', 'সংখ্যা')}</div>
      <Seg label={t('Numbers', 'সংখ্যা')} value={String(value.variant ?? 'zero')} onChange={(v) => onChange({ ...value, variant: v })}
        options={[{ v: 'zero', label: t('0–6 with the zero rule', '০–৬, শূন্যের নিয়মে') }, { v: 'ten', label: t('1–10 big numbers', '১–১০, বড় সংখ্যা') }]} />
    </>
  );
}

export const NUMBER_ADAPTER: CricketAdapter = {
  id: 'number-cricket',
  title: { bn: 'নম্বর ক্রিকেট', en: 'Number Cricket' },
  lede: { bn: 'চিরকুটে গোপন সংখ্যা, একসাথে খোলো। মিললেই আউট।', en: 'Secret numbers on paper chits, opened together. A match is out.' },
  Match: NumberMatch,
  par: 3,
  usesDifficulty: true,
  overs: [1, 2, 3, 5],
  wickets: [1, 2, 3, 5],
  defOvers: 2,
  defWickets: 3,
  allowNoLimit: true,
  cup: { overs: 2, wickets: 3 },
  rules: rulesList('zero'),
  Options: NumberOptions,
  defaultExtra: { variant: 'zero' },
  icon: <svg viewBox="0 0 64 64"><rect x="10" y="8" width="44" height="50" rx="3" fill="#fffdf6" stroke="#9b8a5f" strokeWidth="3" transform="rotate(-6 32 32)" /><text x="32" y="46" textAnchor="middle" fontSize="30" fontWeight="800" fill="#1f3a93">৪</text></svg>,
  achievements: (o, spec, won) => {
    const ids: string[] = [];
    if (won && spec.vsAI) ids.push('nc-win');
    if (won && spec.vsAI && spec.difficulty === 'hard') ids.push('nc-hard');
    if (won && spec.mode === 'challenge' && Number(spec.extra.level) >= 12) ids.push('number-cricket-ladder');
    void o;
    return ids;
  },
};

export default function NumberCricket({ onExit }: GameProps) {
  return <CricketHub game={NUMBER_ADAPTER} onExit={onExit} />;
}
