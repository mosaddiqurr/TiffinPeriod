import type { GameProps } from '../../platform/registry';
import { useT, type StringTable } from '../../platform/i18n';
import { CricketGame } from './CricketGame';

const S: StringTable<'title' | 'lede' | 'r1' | 'r2' | 'r3' | 'r4'> = {
  en: { title: 'Goli Cricket', lede: 'A narrow alley, brick stumps, walls on both sides — and windows.', r1: 'Press Block, Drive or Loft as the ball reaches you. Early = leg side, late = off side.', r2: 'Ball over a wall into a house = OUT. Over the far end on the full = OUT.', r3: 'One tip, one hand: caught after ONE bounce off a wall is OUT. Zones give 1–3; to the drain along the ground = 4.', r4: 'Bowling: tap a box on the pitch (length × line). ⚡ switches fast or slow.' },
  bn: { title: 'গলি ক্রিকেট', lede: 'সরু গলি, ইটের উইকেট, দুপাশে দেয়াল — আর জানালা।', r1: 'বল কাছে এলেই ঠেকাও, মারো বা উঁচিয়ে চাপো। আগে চাপলে লেগে, দেরিতে অফে।', r2: 'দেয়াল টপকে বাড়িতে বল = আউট। উড়িয়ে গলির শেষ পার = আউট।', r3: 'এক টিপ এক হাত: দেয়ালে একবার লেগে ধরলেও আউট। দাগে ১–৩; মাটি দিয়ে ড্রেন পর্যন্ত = ৪।', r4: 'বল করতে পিচের একটা ঘরে চাপো (লেংথ × লাইন)। ⚡ দিয়ে জোরে বা আস্তে।' },
};
export default function GoliCricket({ onExit }: GameProps) {
  const t = useT(S);
  return <CricketGame venue="goli" onExit={onExit} texts={{ title: t('title'), lede: t('lede'), rules: [t('r1'), t('r2'), t('r3'), t('r4')] }} />;
}
