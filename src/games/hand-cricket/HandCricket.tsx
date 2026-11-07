import type { GameProps } from '../../platform/registry';
import { CricketHub, type CricketAdapter, type CricketMatchProps } from '../../components/sport/CricketHub';
import { HandAI } from './ai';
import { Hand } from './Hand';
import { HAND_RULES } from './logic';
import { PickMatch, type PickVariant } from './PickMatch';

// Hand Cricket: the original bench rules (1–6 on the fingers, same number = out),
// now with national teams, Quick Match, Target Challenge, Tournament and the Daily Challenge.

const rulesList = (t: (en: string, bn: string) => string) => [
  t('Both players show a number from 1 to 6 at the same time. Six is the thumb.', 'দুজনে একসাথে ১ থেকে ৬-এর মধ্যে একটা সংখ্যা দেখাবে। ছয় মানে বুড়ো আঙুল।'),
  t('If the numbers are different, the batter scores the batter’s number.', 'সংখ্যা আলাদা হলে ব্যাটার তার নিজের সংখ্যার সমান রান পাবে।'),
  t('If the numbers are the same, the batter is OUT.', 'সংখ্যা মিলে গেলেই ব্যাটার আউট!'),
  t('Then the other side bats and chases the target.', 'তারপর অন্যজন ব্যাট করে লক্ষ্য তাড়া করবে।'),
  t('The computer locks its number before you pick, but it learns your habits. Keys 1–6 (friend: U I O J K L).', 'তুমি বাছার আগেই কম্পিউটার সংখ্যা ঠিক করে, তবে তোমার অভ্যাস শিখে নেয়। কী-বোর্ডে ১–৬ (বন্ধু: U I O J K L)।'),
];

const HAND: PickVariant = {
  gameId: 'hand-cricket',
  nums: [1, 2, 3, 4, 5, 6],
  rules: HAND_RULES,
  makeAI: (d, rng) => new HandAI(d, rng),
  Reveal: ({ n, side, cuff, label }) => <Hand n={n ?? 0} mirror={side === 1} cuff={cuff} label={label} />,
  ButtonArt: ({ n }) => <Hand n={n} className="mini" />,
  keys: ['1', '2', '3', '4', '5', '6'],
  p2Keys: ['u', 'i', 'o', 'j', 'k', 'l'],
  rootClass: 'hand',
  toss: 'oddeven',
  par: 2.6,
  rulesList,
};

function HandMatch(p: CricketMatchProps) {
  return <PickMatch {...p} v={HAND} />;
}

export const HAND_ADAPTER: CricketAdapter = {
  id: 'hand-cricket',
  title: { bn: 'হ্যান্ড ক্রিকেট', en: 'Hand Cricket' },
  lede: { bn: 'ব্যাট নেই, বল নেই। শুধু হাত। এবার দেশের হয়ে খেলো।', en: 'No bat and no ball. Only your hand. Now play for your country.' },
  Match: HandMatch,
  par: 2.6,
  usesDifficulty: true,
  overs: [1, 2, 5],
  wickets: [1, 2, 3, 5],
  defOvers: 2,
  defWickets: 2,
  allowNoLimit: true,
  cup: { overs: 2, wickets: 3 },
  rules: rulesList,
  icon: <Hand n={2} />,
  achievements: (o, spec, won) => {
    const ids: string[] = [];
    if (o.innings[0].runs >= 100 || o.innings[1].runs >= 100) ids.push('hc-century');
    if (won && spec.vsAI && spec.difficulty === 'hard') ids.push('hc-hard-win');
    if (won && spec.mode === 'challenge' && Number(spec.extra.level) >= 12) ids.push('hand-cricket-ladder');
    return ids;
  },
};

export default function HandCricket({ onExit }: GameProps) {
  return <CricketHub game={HAND_ADAPTER} onExit={onExit} />;
}
