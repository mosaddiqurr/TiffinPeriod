import { useT, type StringTable } from '../../platform/i18n';
import { sfx } from '../../platform/audio';
import type { PenId } from './model';

// Pieces shared by the offline game and online play: the strings, the pen drawings and the
// pen chooser.

type K =
  | 'title' | 'lede' | 'r1' | 'r2' | 'r3' | 'r4' | 'r5' | 'keys' | 'target' | 'pts' | 'yourPen' | 'oppPen' | 'p2Pen'
  | 'classic' | 'classicSub' | 'gel' | 'gelSub' | 'speed' | 'weight' | 'grip'
  | 'turn' | 'yourTurn' | 'thinking' | 'touch' | 'power' | 'point' | 'selfOut' | 'won' | 'score' | 'flicks' | 'selfOuts' | 'noGl' | 'round';

export const S: StringTable<K> = {
  en: {
    title: 'Pen Fight', lede: 'Two pens on the last bench. One flick each. Knock theirs off, keep yours on.',
    r1: 'On your turn, touch YOUR pen (it glows), pull back and let go. The pen shoots the opposite way.',
    r2: 'Pull further for more power. The band, the arrow and the number by your finger show how hard.',
    r3: 'Flick the middle of the pen to push it straight. Flick near an end to spin it.',
    r4: 'A pen falls when its middle goes past the edge, so a pen hanging over the edge is still in.',
    r5: 'Knock the other pen off and the point is yours. If your own pen falls, the point goes to the other side.',
    keys: 'Keys: ← → aim · ↑ ↓ where you touch the pen · hold Space for power, let go to flick',
    target: 'Points to win', pts: '{n} points', yourPen: 'Your pen', oppPen: 'Computer’s pen', p2Pen: '{name}’s pen',
    classic: 'Classic ballpoint', classicSub: 'The white six-sided school pen. Light and quick: long shots, but easy to send off yourself.',
    gel: 'Gel pen', gelSub: 'Clear barrel, rubber grip. Heavy: slides less, hits harder, grips the desk.',
    speed: 'Speed', weight: 'Weight', grip: 'Grip',
    turn: '{name}: your turn', yourTurn: 'Your turn', thinking: 'Computer is aiming…', touch: 'Touch your pen · pull back · let go',
    power: 'Power', point: 'Point to {name}!', selfOut: '{name}’s own pen fell!', won: '{name} wins the pen fight!',
    score: 'Score', flicks: 'Flicks', selfOuts: 'Own pen fell', noGl: 'This game needs 3D graphics (WebGL). Please try another browser or turn on hardware acceleration.', round: 'Round {n}',
  },
  bn: {
    title: 'কলম যুদ্ধ', lede: 'শেষ বেঞ্চে দুটো কলম। পালা করে টোকা। ওরটা ফেলো, নিজেরটা রাখো।',
    r1: 'তোমার পালায় নিজের কলমে (যেটা জ্বলছে) আঙুল রাখো, পেছনে টেনে ছেড়ে দাও। কলম উল্টো দিকে ছুটবে।',
    r2: 'যত বেশি টানবে তত জোর। টানার ফিতা, তীর আর আঙুলের পাশের সংখ্যা জোর দেখায়।',
    r3: 'কলমের মাঝখানে টোকা দিলে সোজা যাবে। মাথার দিকে দিলে ঘুরবে।',
    r4: 'কলমের মাঝখান বেঞ্চের কিনারা পার হলে তবেই পড়ে। কিনারায় ঝুলে থাকলে এখনো খেলায় আছে।',
    r5: 'অন্য কলম ফেলে দিলে পয়েন্ট তোমার। নিজের কলম পড়লে পয়েন্ট অন্যজনের।',
    keys: 'কী-বোর্ড: ← → দিক · ↑ ↓ কলমের কোথায় টোকা · স্পেস চেপে জোর, ছেড়ে দিলে টোকা',
    target: 'জিততে পয়েন্ট', pts: '{n} পয়েন্ট', yourPen: 'তোমার কলম', oppPen: 'কম্পিউটারের কলম', p2Pen: '{name}-এর কলম',
    classic: 'সাদা বলপেন', classicSub: 'স্কুলের চেনা ছয়-কোনা সাদা কলম। হালকা আর দ্রুত: দূরে যায়, কিন্তু নিজেই পড়ে যেতে পারে।',
    gel: 'জেল পেন', gelSub: 'স্বচ্ছ বডি, রাবার গ্রিপ। ভারী: কম পিছলায়, জোরে ধাক্কা দেয়, বেঞ্চ আঁকড়ে থাকে।',
    speed: 'গতি', weight: 'ওজন', grip: 'গ্রিপ',
    turn: '{name}-এর পালা', yourTurn: 'তোমার পালা', thinking: 'কম্পিউটার তাক করছে…', touch: 'কলমে আঙুল রাখো · পেছনে টানো · ছাড়ো',
    power: 'জোর', point: 'পয়েন্ট {name}-এর!', selfOut: '{name}-এর নিজের কলম পড়ে গেছে!', won: '{name} কলম যুদ্ধে জিতেছে!',
    score: 'পয়েন্ট', flicks: 'টোকা', selfOuts: 'নিজের কলম পড়েছে', noGl: 'এই খেলার জন্য ৩ডি গ্রাফিক্স (WebGL) লাগে। অন্য ব্রাউজারে চেষ্টা করো।', round: 'রাউন্ড {n}',
  },
};

export const STATS: Record<PenId, [number, number, number]> = { classic: [5, 2, 2], gel: [3, 5, 4] };

/** The two pen cards to choose from. */
export function PenPick({ label, cap, value, onChange, testId, disabled }: { label: string; cap: string; value: PenId | null; onChange: (id: PenId) => void; testId: (id: PenId) => string; disabled?: boolean }) {
  const t = useT(S);
  return (
    <>
      <div className="opt-label">{label}</div>
      <div className="pf-pens" role="radiogroup" aria-label={label}>
        {(['classic', 'gel'] as PenId[]).map((id) => (
          <button key={id} type="button" role="radio" aria-checked={value === id} className="pf-pen-opt" data-testid={testId(id)} disabled={disabled}
            onClick={() => { if (value !== id) { sfx('click'); onChange(id); } }}>
            <PenArt id={id} cap={cap} />
            <b>{t(id)}</b>
            <small>{t(id === 'classic' ? 'classicSub' : 'gelSub')}</small>
            <span className="pf-stats">
              {(['speed', 'weight', 'grip'] as const).map((k, i) => (
                <span key={k}><em>{t(k)}</em><i>{Array.from({ length: 5 }, (_, j) => <s key={j} className={j < STATS[id][i] ? 'on' : ''} />)}</i></span>
              ))}
            </span>
            {value === id && <span className="pf-check" aria-hidden="true">✓</span>}
          </button>
        ))}
      </div>
    </>
  );
}

/** A drawing of each pen for the setup sheet and the score chips. */
export function PenArt({ id, cap, small }: { id: PenId; cap: string; small?: boolean }) {
  return (
    <svg viewBox="0 0 120 22" className={small ? 'pf-art small' : 'pf-art'} aria-hidden="true">
      <defs>
        <linearGradient id={`pfw-${id}-${cap.replace(/[^a-z0-9]/gi, "")}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset="0.55" stopColor="#ebebe4" /><stop offset="1" stopColor="#c8c8bf" /></linearGradient>
        <linearGradient id={`pfc-${id}-${cap.replace(/[^a-z0-9]/gi, "")}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff" stopOpacity="0.5" /><stop offset="0.4" stopColor={cap} /><stop offset="1" stopColor={cap} /></linearGradient>
      </defs>
      {id === 'classic' ? <>
        <rect x="4" y="6" width="80" height="10" rx="1.5" fill={`url(#pfw-${id}-${cap.replace(/[^a-z0-9]/gi, "")})`} stroke="#b9b9b0" strokeWidth="0.6" />
        <path d="M6 11 H82" stroke="#d2d2ca" strokeWidth="0.8" />
        <rect x="2" y="7" width="4" height="8" rx="1" fill={cap} />
        <rect x="80" y="5" width="36" height="12" rx="5" fill={`url(#pfc-${id}-${cap.replace(/[^a-z0-9]/gi, "")})`} />
        <rect x="84" y="2.5" width="26" height="3" rx="1.5" fill={cap} />
      </> : <>
        <rect x="4" y="5.5" width="70" height="11" rx="4" fill="#dfe6ee" fillOpacity="0.7" stroke="#9aa6b2" strokeWidth="0.6" />
        <rect x="8" y="9.5" width="70" height="3" rx="1.5" fill={cap} opacity="0.8" />
        <rect x="58" y="5" width="22" height="12" rx="3" fill="#1d1f23" />
        {[61, 64, 67, 70, 73, 76].map((x) => <path key={x} d={`M${x} 5 V17`} stroke="#3a3d43" strokeWidth="1" />)}
        <rect x="80" y="4.5" width="36" height="13" rx="5.5" fill={`url(#pfc-${id}-${cap.replace(/[^a-z0-9]/gi, "")})`} />
        <rect x="84" y="2" width="26" height="3" rx="1.5" fill="#dfe3e8" />
        <rect x="2" y="7" width="4" height="8" rx="1.5" fill={cap} />
      </>}
    </svg>
  );
}
