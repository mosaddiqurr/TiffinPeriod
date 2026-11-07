import { useT, type StringTable } from '../../platform/i18n';

// Strings and small pieces shared by the local game (PakhirUre.tsx) and online play (online.tsx).

export const S: StringTable<
  | 'title' | 'lede' | 'r1' | 'r2' | 'r3' | 'r4' | 'input' | 'lift' | 'tap' | 'liftHelp' | 'tapHelp'
  | 'putDown' | 'getReady' | 'ure' | 'flies' | 'noFly' | 'ok' | 'held' | 'missed' | 'fooled' | 'early' | 'ms'
  | 'padLift' | 'padTap' | 'lives' | 'level' | 'calls' | 'score' | 'correct' | 'streak' | 'fastest' | 'average'
  | 'over' | 'won' | 'draw' | 'aiName'
> = {
  en: {
    title: 'Pakhir Ure', lede: 'The caller names a thing. Does it fly? Your finger must answer.',
    r1: 'Keep your finger down on the bench.',
    r2: 'The caller says “___ ure!” (“___ flies!”).',
    r3: 'If it really flies, LIFT your finger fast. If it does not fly, keep your finger down.',
    r4: 'Lifting before the call is a false start. Some calls are tricks!',
    input: 'Input', lift: 'Lift finger (traditional)', tap: 'Tap (simple)',
    liftHelp: 'Hold the pad. Lift your finger for things that fly.', tapHelp: 'Tap the pad for things that fly.',
    putDown: 'Put your finger down', getReady: 'Get ready…', ure: 'ure!', flies: 'It flies', noFly: 'It does not fly',
    ok: 'Correct!', held: 'Well held!', missed: 'Too late!', fooled: 'Fooled you!', early: 'False start!', ms: '{n} ms',
    padLift: 'Finger here', padTap: 'Tap here', lives: 'Lives', level: 'Level {n}', calls: 'Call {n}/{m}',
    score: 'Score', correct: 'Correct answers', streak: 'Best streak', fastest: 'Fastest reaction', average: 'Average reaction',
    over: 'Game over', won: '{name} wins!', draw: 'It is a draw!', aiName: 'Rakib (computer)',
  },
  bn: {
    title: 'পাখি উড়ে', lede: 'ডাকা হবে একটা নাম। সে কি উড়ে? উত্তর দেবে তোমার আঙুল।',
    r1: 'বেঞ্চের উপর আঙুল রেখে রাখো।',
    r2: 'ডাকবে, “___ উড়ে!”',
    r3: 'সত্যিই উড়লে তাড়াতাড়ি আঙুল তোলো। না উড়লে আঙুল রেখে দাও।',
    r4: 'ডাকার আগে আঙুল তুললে ফাউল। কিছু ডাক কিন্তু ফাঁদ!',
    input: 'খেলার ধরন', lift: 'আঙুল তোলা (আসল নিয়ম)', tap: 'ট্যাপ (সহজ)',
    liftHelp: 'প্যাডে আঙুল চেপে রাখো। যে উড়ে, তার নামে আঙুল তোলো।', tapHelp: 'যে উড়ে, তার নামে প্যাডে ট্যাপ করো।',
    putDown: 'আঙুল রাখো', getReady: 'তৈরি হও…', ure: 'উড়ে!', flies: 'উড়ে', noFly: 'উড়ে না',
    ok: 'ঠিক!', held: 'দারুণ, ধরে রেখেছ!', missed: 'দেরি হয়ে গেল!', fooled: 'ফাঁদে পড়েছ!', early: 'ফাউল! আগেই তুলেছ', ms: '{n} মি.সে.',
    padLift: 'এখানে আঙুল রাখো', padTap: 'এখানে ট্যাপ করো', lives: 'জীবন', level: 'লেভেল {n}', calls: 'ডাক {n}/{m}',
    score: 'পয়েন্ট', correct: 'ঠিক উত্তর', streak: 'টানা ঠিক', fastest: 'সবচেয়ে দ্রুত', average: 'গড় সময়',
    over: 'খেলা শেষ', won: '{name} জিতেছে!', draw: 'সমান সমান!', aiName: 'রাকিব (কম্পিউটার)',
  },
};

export function Finger({ up }: { up: boolean }) {
  return (
    <svg viewBox="0 0 80 90" className={`pu-finger ${up ? 'up' : ''}`} aria-hidden="true">
      <g className="f">
        <rect x="28" y="8" width="24" height="70" rx="12" fill="#c98a5c" stroke="#7a4426" strokeWidth="3" />
        <ellipse cx="40" cy="20" rx="7" ry="8" fill="#e9b996" />
        <path d="M32 44 q8 4 16 0 M32 58 q8 4 16 0" stroke="#7a4426" strokeWidth="1.8" fill="none" opacity="0.6" />
      </g>
      {up && <path d="M14 30 l-8 -6 M66 30 l8 -6 M40 2 l0 -0" stroke="#c62f2f" strokeWidth="3" strokeLinecap="round" />}
    </svg>
  );
}

export function Rules({ t }: { t: ReturnType<typeof useT<'r1' | 'r2' | 'r3' | 'r4'>> }) {
  return <ol><li>{t('r1')}</li><li>{t('r2')}</li><li><b>{t('r3')}</b></li><li>{t('r4')}</li></ol>;
}
