import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GameProps } from '../../platform/registry';
import { GameCanvas } from '../../engine/GameCanvas';
import { createRng } from '../../engine/rng';
import { readJSON, writeJSON } from '../../platform/storage';
import { unlockAchievement } from '../../platform/scores';
import { DifficultySeg, ModeSeg, usePlayerNames, type Difficulty, type Mode } from '../../components/ui';
import { BenchFrame, ScoreStrip, useBench } from '../bench-kit/BenchKit';
import { LEVELS, starsFor } from './levels';
import { EraserScene, type EFHud, type EFMsg } from './scene';
import './eraser-flip.css';

const SKILL: Record<Difficulty, number> = { easy: 0.35, medium: 0.65, hard: 0.92 };

export default function EraserFlip({ onExit }: GameProps) {
  const g = useBench('eraser-flip'), t = g.text;
  const [p1, p2] = usePlayerNames();
  const [mode, setMode] = useState<Mode>('solo');
  const [diff, setDiff] = useState<Difficulty>('medium');
  const [lv, setLv] = useState(0);
  const [stars, setStars] = useState<Record<string, number>>(() => readJSON('ef.stars', {}));
  const [round, setRound] = useState(0);
  const [hud, setHud] = useState<EFHud | null>(null);
  const names = mode === 'ai' ? [g.u('you'), g.u('computer')] : [p1, p2];
  const L = LEVELS[lv];
  const hide = useCallback(() => g.setPaused(true), []); // eslint-disable-line react-hooks/exhaustive-deps

  const say = (m: EFMsg, v?: Record<string, string | number>) => {
    switch (m) {
      case 'onTop': return t('ON TOP! Captured!', 'উপরে চড়েছে! দখল!');
      case 'fell': return t('Off the desk!', 'ডেস্ক থেকে পড়ে গেছে!');
      case 'stand': return t('It stands on its edge!', 'কিনারায় দাঁড়িয়ে গেছে!');
      case 'yourTurn': return t('Your flick', 'তোমার টোকা');
      case 'theirTurn': return t('Computer’s flick', 'কম্পিউটারের টোকা');
      case 'turnOf': return `${names[Number(v?.n ?? 1) - 1]}${t(': flick', '-এর টোকা')}`;
      case 'points': return t(`+${v?.n} points`, `+${g.n(Number(v?.n))} পয়েন্ট`);
      case 'drawRound': return t('No capture: round drawn', 'কেউ দখল পায়নি: রাউন্ড ড্র');
      case 'round': return t(`Round ${v?.n}`, `রাউন্ড ${g.n(Number(v?.n))}`);
    }
  };

  const end = (r: { rounds: [number, number]; scores: number[]; total: number }) => {
    if (mode === 'solo') {
      const st = starsFor(L, r.total);
      const next = { ...stars, [L.id]: Math.max(stars[L.id] ?? 0, st) };
      setStars(next); writeJSON('ef.stars', next);
      if (LEVELS.every((x) => (next[x.id] ?? 0) > 0)) unlockAchievement('ef-all');
      if (st > 0 && lv < LEVELS.length - 1) setLv(lv + 1);
      g.finish({ title: st ? t(`${'★'.repeat(st)} ${g.lang === 'en' ? L.title.en : ''}`, `${'★'.repeat(st)} ${L.title.bn}`) : t('Try again!', 'আবার চেষ্টা করো!'), outcome: 'none', score: r.total,
        rows: [[t('Level', 'লেভেল'), `${g.n(lv + 1)} · ${g.lang === 'bn' ? L.title.bn : L.title.en}`], ...r.scores.map((s, i) => [t(`Flick ${i + 1}`, `টোকা ${g.n(i + 1)}`), s] as [string, number]), [t('Total', 'মোট'), r.total], [t('Stars', 'তারা'), st ? '★'.repeat(st) : '—']] });
      return;
    }
    const w = r.rounds[0] > r.rounds[1] ? 0 : 1;
    g.finish({ title: `${names[w]} ${t('wins!', 'জিতেছে!')}`, outcome: mode === 'local2p' ? 'none' : w === 0 ? 'win' : 'loss', score: mode === 'ai' ? r.rounds[0] : undefined, rows: [[names[0], r.rounds[0]], [names[1], r.rounds[1]]] });
  };

  const scene = useMemo(() => {
    if (g.phase !== 'play') return null;
    return new EraserScene(mode === 'solo' ? 'challenge' : 'duel', mode === 'ai', SKILL[diff], mode === 'solo' ? L : null, createRng(), say, (h) => {
      setHud(h);
    }, end);
  }, [round, g.phase === 'play']); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { (window as unknown as { __eraser?: EraserScene | null }).__eraser = scene; }, [scene]);
  useEffect(() => {
    if (!scene) return;
    const k = (e: KeyboardEvent) => { if (!g.paused && scene.key(e.code)) e.preventDefault(); };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [scene, g.paused]);

  // Capturing in a duel unlocks the achievement.
  useEffect(() => { if (hud && hud.mode === 'duel' && hud.message === say('onTop') && (mode === 'local2p' || hud.turn === 0)) unlockAchievement('ef-land'); }, [hud?.message]); // eslint-disable-line react-hooks/exhaustive-deps

  const rules = [
    t('Press on your eraser, pull back and let go. The further you pull, the further and higher it flies.', 'নিজের রাবারে চেপে পেছনে টানো, তারপর ছাড়ো। যত টানবে, তত দূরে আর উঁচুতে উড়বে।'),
    t('The outline shows where it will first land. It flips in the air and slides a little after landing.', 'দাগ দেখায় প্রথম কোথায় নামবে। বাতাসে উল্টায়, নামার পর একটু পিছলে যায়।'),
    t('Duel: land ON TOP of the other eraser to win the round. Fall off the desk and you lose it. First to three rounds.', 'লড়াই: অন্য রাবারের উপরে নামলে রাউন্ড তোমার। ডেস্ক থেকে পড়লে রাউন্ড হার। আগে তিন রাউন্ড যে জেতে।'),
    t('Challenges: three flicks per level for points and stars. A rare landing on its edge earns a bonus.', 'চ্যালেঞ্জ: প্রতি লেভেলে তিন টোকা, পয়েন্ট আর তারা। কিনারায় দাঁড়িয়ে গেলে বোনাস।'),
    t('Keys: arrows aim and set power, Space flicks.', 'কী-বোর্ড: তীর দিয়ে দিক আর জোর, স্পেসে টোকা।'),
  ];

  return (
    <BenchFrame game={g} title={t('Eraser Flip', 'রাবার টোকা')} lede={t('The back-bench game that needed only an eraser and a flat desk.', 'শেষ বেঞ্চের খেলা: শুধু একটা রাবার আর সমান ডেস্ক।')} rules={rules} onExit={onExit}
      onStart={() => { setHud(null); setRound((r) => r + 1); g.start(); }}
      art={<svg viewBox="0 0 110 88"><rect x="14" y="44" width="56" height="30" rx="5" fill="#f7f4ea" stroke="#555" strokeWidth="2" /><rect x="28" y="44" width="34" height="30" fill="#2f6fd6" /><rect x="46" y="12" width="50" height="26" rx="5" fill="#fff3c4" stroke="#555" strokeWidth="2" transform="rotate(-14 71 25)" /><rect x="58" y="12" width="30" height="26" fill="#e3127d" transform="rotate(-14 71 25)" /></svg>}
      options={<>
        <ModeSeg value={mode} onChange={setMode} modes={['solo', 'ai', 'local2p']} />
        {mode === 'solo' ? <>
          <div className="opt-label">{t('Challenge', 'চ্যালেঞ্জ')}</div>
          <div className="ef-levels" role="group" aria-label={t('Challenge', 'চ্যালেঞ্জ')}>
            {LEVELS.map((x, i) => (
              <button key={x.id} type="button" aria-pressed={lv === i} onClick={() => setLv(i)} data-testid={`level-${i + 1}`}>
                <b>{g.n(i + 1)}. {g.lang === 'bn' ? x.title.bn : x.title.en}</b>
                <small>{g.lang === 'bn' ? x.desc.bn : x.desc.en}</small>
                <span className="stars">{'★'.repeat(stars[x.id] ?? 0)}<span className="off">{'★'.repeat(3 - (stars[x.id] ?? 0))}</span></span>
              </button>
            ))}
          </div>
        </> : mode === 'ai' ? <DifficultySeg value={diff} onChange={setDiff} /> : null}
      </>}
    >
      {mode === 'solo'
        ? <div className="ef-head"><b>{g.lang === 'bn' ? L.title.bn : L.title.en}</b><span>{t('Flicks left', 'বাকি টোকা')}: {g.n(hud?.flicksLeft ?? 3)}</span><span>{t('Points', 'পয়েন্ট')}: <b data-testid="ef-total">{g.n(hud?.total ?? 0)}</b></span><span className="stars">{L.stars.map((s, i) => <span key={i} className={(hud?.total ?? 0) >= s ? 'on' : 'off'}>★</span>)}</span></div>
        : <><ScoreStrip names={names} scores={hud?.rounds ?? [0, 0]} active={hud?.turn} n={g.n} /><div className="bench-round">{t('Round', 'রাউন্ড')} {g.n(hud?.round ?? 1)} · {t('first to 3', 'আগে ৩')}</div></>}
      <div className="ef-canvas">{scene && <GameCanvas scene={scene} paused={g.paused || g.phase !== 'play'} onHidden={hide} label={t('Classroom desk', 'ক্লাসের ডেস্ক')} />}</div>
    </BenchFrame>
  );
}
