import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GameProps } from '../../platform/registry';
import { GameCanvas } from '../../engine/GameCanvas';
import { createRng } from '../../engine/rng';
import { unlockAchievement } from '../../platform/scores';
import { DifficultySeg, ModeSeg, usePlayerNames, type Difficulty, type Mode } from '../../components/ui';
import { BenchFrame, useBench } from '../bench-kit/BenchKit';
import { GROUPS, STAGES, type Progress } from './model';
import { FiveScene, type FiveHud, type FiveMsg } from './scene';
import './five-stones.css';

export default function FiveStones({ onExit }: GameProps) {
  const g = useBench('five-stones'), t = g.text;
  const [p1, p2] = usePlayerNames();
  const [mode, setMode] = useState<Mode>('ai');
  const [diff, setDiff] = useState<Difficulty>('medium');
  const [round, setRound] = useState(0);
  const [hud, setHud] = useState<FiveHud | null>(null);
  const hide = useCallback(() => g.setPaused(true), []); // eslint-disable-line react-hooks/exhaustive-deps
  const names = mode === 'solo' ? [g.u('you')] : mode === 'ai' ? [g.u('you'), g.u('computer')] : [p1, p2];

  const say = (m: FiveMsg, v?: Record<string, string | number>): string => {
    const n = (x: string | number | undefined) => g.n(Number(x ?? 0));
    switch (m) {
      case 'caught': return t('Caught!', 'ধরেছি!');
      case 'perfect': return t('Perfect catch!', 'দারুণ ধরা!');
      case 'early': return t('Too early! Wait for it to drop.', 'খুব আগে! নামার অপেক্ষা করো।');
      case 'dropped': return t('It fell!', 'পড়ে গেল!');
      case 'tooMany': return t(`Only ${v?.n} this time!`, `এবার শুধু ${n(v?.n)}টা!`);
      case 'tooFew': return t(`You needed ${v?.n}!`, `${n(v?.n)}টা তুলতে হতো!`);
      case 'stage': return t(`Stage ${v?.n} cleared!`, `${n(v?.n)} নম্বর ধাপ শেষ!`);
      case 'backCaught': return t(`${v?.n} on the back of the hand!`, `হাতের পিঠে ${n(v?.n)}টা!`);
      case 'backMissed': return t('They slipped off!', 'গুটি পিছলে গেল!');
      case 'cleared': return t(`All stages! ${v?.n} caught`, `সব ধাপ শেষ! ${n(v?.n)}টা ধরা`);
      case 'yourTurn': return t('Your turn', 'তোমার পালা');
      case 'theirTurn': return t('Computer’s turn', 'কম্পিউটারের পালা');
      case 'turnOf': return `${names[Number(v?.n ?? 1) - 1]}${t(': your turn', '-এর পালা')}`;
    }
  };

  const end = (p: Progress[], lives: number) => {
    if (mode === 'solo') {
      const cleared = p[0].done;
      if (cleared) unlockAchievement('fs-clear');
      g.finish({ title: cleared ? t('All five stages!', 'পাঁচ ধাপই শেষ!') : t('Out of chances', 'সুযোগ শেষ'), outcome: 'none', score: p[0].points, rows: [[t('Points', 'পয়েন্ট'), p[0].points], [t('Stages cleared', 'শেষ করা ধাপ'), Math.min(STAGES, p[0].done ? STAGES : p[0].stage)], [t('Chances left', 'বাকি সুযোগ'), lives]] });
      return;
    }
    const w = p[0].done ? 0 : 1;
    if (w === 0) unlockAchievement('fs-clear');
    g.finish({ title: `${names[w]} ${t('wins!', 'জিতেছে!')}`, outcome: mode === 'local2p' ? 'none' : w === 0 ? 'win' : 'loss', score: mode === 'ai' ? p[0].points : undefined, rows: [[names[0], p[0].points], [names[1], p[1].points]] });
  };

  const scene = useMemo(() => (g.phase === 'play' ? new FiveScene(names.length, mode === 'ai', diff, createRng(), say, setHud, end) : null), [round, g.phase === 'play']); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { (window as unknown as { __five?: FiveScene | null }).__five = scene; }, [scene]);
  useEffect(() => {
    if (!scene) return;
    const k = (e: KeyboardEvent) => { if (!g.paused && scene.key(e.code)) e.preventDefault(); };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [scene, g.paused]);

  const rules = [
    t('Five little stones. Tap to toss one up, tap stones on the floor to scoop them, then tap again to catch before it lands.', 'পাঁচটা ছোট গুটি। ট্যাপ করে একটা উপরে ছোড়ো, মেঝের গুটিতে ট্যাপ করে তোলো, তারপর পড়ার আগে আবার ট্যাপ করে ধরো।'),
    t('Catch while it is low: inside the green line. Too early is a fumble.', 'নিচে নামলে ধরো: সবুজ দাগের ভেতরে। আগে ধরতে গেলে ফসকে যাবে।'),
    t('Stage 1: one stone each toss. Stage 2: two. Stage 3: three, then one. Stage 4: all four at once.', '১ম ধাপ: প্রতি ছোড়ায় একটা। ২য়: দুইটা। ৩য়: তিনটা, তারপর একটা। ৪র্থ: চারটা একসাথে।'),
    t('Stage 5, the back of the hand: toss all five, catch on the back of your hand, toss again and catch. Keep at least two.', '৫ম ধাপ, হাতের পিঠ: পাঁচটাই ছোড়ো, হাতের পিঠে ধরো, আবার ছুড়ে মুঠোয় ধরো। অন্তত দুইটা রাখতে হবে।'),
    t('A mistake passes the turn. Solo: you have three chances. Keys: Space tosses and catches, P scoops.', 'ভুল হলে পালা চলে যায়। একা খেললে তিনটা সুযোগ। কী-বোর্ড: স্পেসে ছোড়া আর ধরা, P দিয়ে তোলা।'),
  ];

  const h = hud;
  const instr = !h ? '' : h.phase === 'ready' ? t(`Tap to toss · then scoop ${h.need}`, `ট্যাপ করে ছোড়ো · তারপর ${g.n(h.need)}টা তোলো`)
    : h.phase === 'air' ? (h.catchable ? t('CATCH NOW!', 'এখনই ধরো!') : t(`Scoop ${h.need} · picked ${h.picked}`, `${g.n(h.need)}টা তোলো · তোলা হয়েছে ${g.n(h.picked)}`))
    : h.phase === 'bReady' ? t('Back of the hand: tap to toss all five', 'হাতের পিঠ: ট্যাপ করে পাঁচটাই ছোড়ো')
    : h.phase === 'bReady2' ? t('Tap to toss them off the back, then catch', 'পিঠ থেকে ছুড়ে আবার ধরো')
    : h.phase === 'bAir' || h.phase === 'bAir2' ? t('Tap as they land!', 'নামার মুহূর্তে ট্যাপ!') : '';

  return (
    <BenchFrame game={g} title={t('Five Stones', 'পাঁচ গুটি')} lede={t('On the cool verandah floor, after lunch.', 'দুপুরের পর, ঠান্ডা বারান্দার মেঝেতে।')} rules={rules} onExit={onExit}
      onStart={() => { setHud(null); setRound((r) => r + 1); g.start(); }}
      art={<svg viewBox="0 0 110 88">{[[22, 60], [48, 70], [76, 58], [92, 72]].map(([x, y], i) => <ellipse key={i} cx={x} cy={y} rx="11" ry="9" fill="#c9b79c" stroke="#8f7a5a" strokeWidth="2" />)}<ellipse cx="56" cy="20" rx="11" ry="9" fill="#e58f7a" stroke="#9a4f3c" strokeWidth="2" /><path d="M56 32 v18" stroke="#9a4f3c" strokeDasharray="3 4" strokeWidth="2" /></svg>}
      options={<>
        <ModeSeg value={mode} onChange={setMode} modes={['solo', 'ai', 'local2p']} />
        <DifficultySeg value={diff} onChange={setDiff} />
        <p className="bench-note">{t('Harder levels give less time in the air and a smaller catch window.', 'কঠিন স্তরে গুটি কম সময় শূন্যে থাকে, ধরার সুযোগও কম।')}</p>
      </>}
    >
      <div className="fs-wrap">
        <div className="fs-players">
          {names.map((nm, i) => {
            const p = h?.progress[i];
            return (
              <div key={i} className={`fs-player ${h?.player === i ? 'active' : ''}`} data-testid={`fs-p${i}`}>
                <b>{nm}</b>
                <span className="fs-stages" aria-label={t('Stages', 'ধাপ')}>{Array.from({ length: STAGES }, (_, s) => <i key={s} className={p && (p.done || p.stage > s) ? 'done' : p && p.stage === s ? 'now' : ''}>{g.n(s + 1)}</i>)}</span>
                <span className="fs-pts">{g.n(p?.points ?? 0)}</span>
              </div>
            );
          })}
          {mode === 'solo' && <div className="fs-lives">{t('Chances', 'সুযোগ')}: {'●'.repeat(h?.lives ?? 3)}<span className="off">{'●'.repeat(3 - (h?.lives ?? 3))}</span></div>}
        </div>
        <div className="fs-canvas">{scene && <GameCanvas scene={scene} paused={g.paused || g.phase !== 'play'} onHidden={hide} label={t('Verandah floor', 'বারান্দার মেঝে')} />}</div>
        <div className={`fs-instr ${h?.catchable ? 'hot' : ''}`} aria-live="polite" data-testid="instr">{instr}</div>
        <p className="bench-note" style={{ textAlign: 'center', margin: 0 }}>{h && h.progress[h.player] && h.progress[h.player].stage < GROUPS.length ? t(`Stage ${h.progress[h.player].stage + 1} of ${STAGES}`, `${g.n(h.progress[h.player].stage + 1)}/${g.n(STAGES)} ধাপ`) : ''}</p>
      </div>
    </BenchFrame>
  );
}
