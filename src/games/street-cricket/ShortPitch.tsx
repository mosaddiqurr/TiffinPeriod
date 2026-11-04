import type { GameProps } from '../../platform/registry';
import { useT, type StringTable } from '../../platform/i18n';
import { CricketGame } from './CricketGame';

const S: StringTable<'title' | 'lede' | 'r1' | 'r2' | 'r3' | 'r4'> = {
  en: { title: 'Short-Pitch Cricket', lede: 'Para field rules: small ground, tennis ball, and one strict law.', r1: 'Press Block, Drive or Loft as the ball reaches you. Early = leg side, late = off side.', r2: 'Runs come from the zones: 1, 2, 3, and 4 along the ground to the rope. A SIX IS OUT!', r3: 'A drive stays low. A loft goes high — here that is dangerous.', r4: 'Bowling: tap a box on the pitch (length × line). ⚡ switches fast or slow.' },
  bn: { title: 'শর্ট-পিচ ক্রিকেট', lede: 'পাড়ার মাঠের নিয়ম: ছোট মাঠ, টেনিস বল, আর একটা কড়া আইন।', r1: 'বল কাছে এলেই ঠেকাও, মারো বা উঁচিয়ে চাপো। আগে চাপলে লেগে, দেরিতে অফে।', r2: 'রান আসে দাগ থেকে: ১, ২, ৩, আর মাটি দিয়ে দড়ি পার হলে ৪। ছক্কা মারলে আউট!', r3: 'মারো নিচু দিয়ে যায়। উঁচিয়ে মারলে বল উপরে ওঠে — এখানে সেটা বিপদ।', r4: 'বল করতে পিচের একটা ঘরে চাপো (লেংথ × লাইন)। ⚡ দিয়ে জোরে বা আস্তে।' },
};
export default function ShortPitch({ onExit }: GameProps) {
  const t = useT(S);
  return <CricketGame venue="short-pitch" onExit={onExit} texts={{ title: t('title'), lede: t('lede'), rules: [t('r1'), t('r2'), t('r3'), t('r4')] }} />;
}
