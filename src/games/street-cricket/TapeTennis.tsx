import type { GameProps } from '../../platform/registry';
import { useT, type StringTable } from '../../platform/i18n';
import { CricketGame } from './CricketGame';

const S: StringTable<'title' | 'lede' | 'r1' | 'r2' | 'r3' | 'r4'> = {
  en: { title: 'Tape Tennis Cricket', lede: 'A tennis ball wrapped in electrical tape: fast, bouncy and it swings.', r1: 'Press Block, Drive or Loft as the ball reaches you. Early = leg side, late = off side.', r2: 'Zones give 1, 2 or 3. Along the street to the end = 4. Over the end on the full = 6!', r3: 'The taped ball swings in the air. Watch the line until the last moment.', r4: 'Bowling: tap a box on the pitch (length × line). ⚡ switches fast or slow.' },
  bn: { title: 'টেপ-টেনিস ক্রিকেট', lede: 'টেপ পেঁচানো টেনিস বল: দ্রুত, লাফায়, আর বাতাসে বাঁক নেয়।', r1: 'বল কাছে এলেই ঠেকাও, মারো বা উঁচিয়ে চাপো। আগে চাপলে লেগে, দেরিতে অফে।', r2: 'দাগে দাগে ১, ২ বা ৩। মাটি দিয়ে রাস্তার শেষে = ৪। উড়িয়ে শেষ পার = ছক্কা!', r3: 'টেপ বল বাতাসে বাঁক নেয়। শেষ মুহূর্ত পর্যন্ত লাইন দেখো।', r4: 'বল করতে পিচের একটা ঘরে চাপো (লেংথ × লাইন)। ⚡ দিয়ে জোরে বা আস্তে।' },
};
export default function TapeTennis({ onExit }: GameProps) {
  const t = useT(S);
  return <CricketGame venue="tape-tennis" onExit={onExit} texts={{ title: t('title'), lede: t('lede'), rules: [t('r1'), t('r2'), t('r3'), t('r4')] }} />;
}
