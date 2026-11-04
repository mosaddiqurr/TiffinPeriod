import type { GameProps } from '../../platform/registry';
import { useT, type StringTable } from '../../platform/i18n';
import { CricketGame } from './CricketGame';

const S: StringTable<'title' | 'lede' | 'r1' | 'r2' | 'r3' | 'r4'> = {
  en: { title: 'Rooftop Cricket', lede: 'Afternoon on the roof. Parapet walls, a black water tank, and a long way down.', r1: 'Press Block, Drive or Loft as the ball reaches you. Early = leg side, late = off side.', r2: 'Over the parapet on the full = OUT (or a six, if you choose). Hit the water tank = 2 runs.', r3: 'Zones give 1, 2 or 3. Along the floor to the far parapet = 4. Keep it on the roof!', r4: 'Bowling: tap a box on the pitch (length × line). ⚡ switches fast or slow.' },
  bn: { title: 'ছাদ ক্রিকেট', lede: 'বিকেলের ছাদ। চারপাশে রেলিং, কালো পানির ট্যাংক, আর নিচে অনেক দূর।', r1: 'বল কাছে এলেই ঠেকাও, মারো বা উঁচিয়ে চাপো। আগে চাপলে লেগে, দেরিতে অফে।', r2: 'উড়িয়ে রেলিং পার = আউট (চাইলে ছক্কাও রাখা যায়)। পানির ট্যাংকে লাগলে ২ রান।', r3: 'দাগে দাগে ১, ২ বা ৩। মেঝে দিয়ে দূরের রেলিংয়ে = ৪। বল ছাদেই রাখো!', r4: 'বল করতে পিচের একটা ঘরে চাপো (লেংথ × লাইন)। ⚡ দিয়ে জোরে বা আস্তে।' },
};
export default function RooftopCricket({ onExit }: GameProps) {
  const t = useT(S);
  return <CricketGame venue="rooftop" onExit={onExit} texts={{ title: t('title'), lede: t('lede'), rules: [t('r1'), t('r2'), t('r3'), t('r4')] }} />;
}
