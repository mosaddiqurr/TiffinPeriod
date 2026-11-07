import { useEffect, useState } from 'react';
import type { GameProps } from '../../platform/registry';
import { ModeSeg, Seg, usePlayerNames, type Mode } from '../../components/ui';
import { BenchFrame, PassScreen, ScoreStrip, useBench } from '../bench-kit/BenchKit';
import { Hand } from '../hand-cricket/Hand';
import { FingerArt } from '../bench-kit/art';
import { fingerRound, type Parity } from './model';
import { sfx } from '../../platform/audio';

export default function JorBejor({ onExit }: GameProps) {
  const g = useBench('jor-bejor'), t = g.text;
  const [p1, p2] = usePlayerNames();
  const [mode, setMode] = useState<Mode>('ai');
  const [target, setTarget] = useState(3);
  const [call, setCall] = useState<Parity>('even');
  const [scores, setScores] = useState([0, 0]);
  const [step, setStep] = useState<'pick' | 'pass' | 'reveal'>('pick');
  const [player, setPlayer] = useState(0);
  const [choice, setChoice] = useState<number | null>(null);
  const [hands, setHands] = useState<[number, number]>([0, 0]);
  const [round, setRound] = useState(1);
  const names = mode === 'ai' ? [g.u('you'), g.u('computer')] : [p1, p2];
  const parityName = (p: Parity) => p === 'even' ? t('Jor · Even', 'জোড়') : t('Bejor · Odd', 'বিজোড়');
  const rules = [
    t('Player 1 chooses Jor (even) or Bejor (odd) for the match. Player 2 gets the other side.', 'খেলোয়াড় ১ পুরো ম্যাচের জন্য জোড় বা বিজোড় বেছে নেবে। অন্যজন পাবে অপরটি।'),
    t('Both secretly choose 0–5 fingers. Add the two hands: the matching side wins one point. Zero plus zero is even.', 'দুজন গোপনে ০–৫ আঙুল বাছবে। দুই হাত যোগ করে জোড় বা বিজোড় মিললে এক পয়েন্ট। শূন্য আর শূন্য মিলে জোড়।'),
    t('The computer locks its hand before you pick. With a friend, hide your choice and pass the device before the reveal.', 'তুমি বাছার আগেই কম্পিউটারের হাত ঠিক হয়। বন্ধুর সাথে খেললে পছন্দ লুকিয়ে ফোন দাও, তারপর দুই হাত দেখাও।'),
    t('First to the chosen point target wins. Keyboard: 0–5 to choose; Enter to lock.', 'নির্ধারিত পয়েন্টে আগে পৌঁছালে জয়। কিবোর্ডে ০–৫ বাছো, Enter দিয়ে লক করো।'),
  ];
  function prepare() { setHands([0, Math.floor(Math.random() * 6)]); setChoice(null); setPlayer(0); setStep('pick'); }
  function start() { setRound(1); setScores([0, 0]); prepare(); g.start(); }
  function lock() {
    if (choice === null || step !== 'pick' || g.paused) return;
    if (mode === 'local2p' && player === 0) { setHands([choice, 0]); setChoice(null); setPlayer(1); setStep('pass'); return; }
    const next: [number, number] = player === 1 ? [hands[0], choice] : [choice, hands[1]];
    const result = fingerRound(next[0], next[1], call);
    setHands(next); setScores(scores.map((s, i) => s + Number(i === result.winner))); setChoice(null); setStep('reveal'); sfx('good');
  }
  useEffect(() => {
    if (g.phase !== 'play' || g.paused || step !== 'pick') return;
    const key = (e: KeyboardEvent) => {
      if (e.repeat || (e.target instanceof HTMLElement && /INPUT|TEXTAREA/.test(e.target.tagName))) return;
      if (/^[0-5]$/.test(e.key)) { setChoice(Number(e.key)); e.preventDefault(); }
      if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); lock(); }
    };
    addEventListener('keydown', key); return () => removeEventListener('keydown', key);
  }, [g.phase, g.paused, step, player, choice, hands, scores, call]);
  const result = fingerRound(hands[0], hands[1], call);
  function next() {
    if (Math.max(...scores) < target) { setRound(round + 1); prepare(); return; }
    const winner = scores[0] > scores[1] ? 0 : 1;
    g.finish({ title: `${names[winner]} ${t('wins!', 'জিতেছে!')}`, outcome: mode === 'local2p' ? 'none' : winner === 0 ? 'win' : 'loss', rows: [[names[0], scores[0]], [names[1], scores[1]], [t('Rounds', 'রাউন্ড'), round]], score: mode === 'ai' ? scores[0] : undefined });
  }
  return <BenchFrame game={g} title={t('Jor-Bejor', 'জোড়-বিজোড়')} lede={t('One, two, three… hands out!', 'এক, দুই, তিন… হাত দেখাও!')} rules={rules} onStart={start} onExit={onExit} art={<FingerArt />}
    options={<><ModeSeg value={mode} onChange={setMode} modes={['ai', 'local2p']} /><div className="opt-label">{t('Player 1 calls', 'খেলোয়াড় ১ বাছবে')}</div><Seg label={t('Call', 'জোড় বা বিজোড়')} value={call} onChange={setCall} options={(['even', 'odd'] as Parity[]).map((v) => ({ v, label: parityName(v) }))} />
      <div className="opt-label">{t('First to', 'আগে যত পয়েন্ট')}</div><Seg label={t('Point target', 'পয়েন্টের লক্ষ্য')} value={target} onChange={setTarget} options={[3, 5, 7].map((v) => ({ v, label: g.n(v) }))} /></>}
  ><ScoreStrip names={names} scores={scores} active={step === 'pick' ? player : undefined} n={g.n} />
    <div className="bench-round">{t('Round', 'রাউন্ড')} {g.n(round)} · {names[0]}: {parityName(call)} · {names[1]}: {parityName(call === 'even' ? 'odd' : 'even')}</div>
    {step === 'pass' ? <PassScreen game={g} name={names[1]} onReady={() => setStep('pick')} /> : step === 'pick' ? <section className="bench-center">
      <h2>{names[player]} · {t('Choose your hand', 'হাত বেছে নাও')}</h2><p className="bench-note">{t('Your choice stays hidden until both hands are locked.', 'দুই হাত লক হওয়ার আগে পছন্দ লুকানো থাকবে।')}</p>
      <div className="finger-stage" aria-hidden="true"><Hand n={choice ?? 0} /></div>
      <div className="finger-picks">{[0, 1, 2, 3, 4, 5].map((v) => <button key={v} aria-pressed={choice === v} onClick={() => setChoice(v)} data-testid={`finger-${v}`}>{g.n(v)}</button>)}</div>
      <button className="btn big" disabled={choice === null} onClick={lock} data-testid="lock-hand">{t('Lock my hand', 'আমার হাত লক করো')}</button>
    </section> : <section className="bench-center"><h2>{t('Hands out!', 'হাত দেখাও!')}</h2><div className="finger-stage"><div><Hand n={hands[0]} label={`${names[0]}: ${g.n(hands[0])}`} /><b>{names[0]}</b></div><span className="plus">+</span><div><Hand n={hands[1]} mirror label={`${names[1]}: ${g.n(hands[1])}`} /><b>{names[1]}</b></div></div>
      <div className="bench-status" role="status">{g.n(hands[0])} + {g.n(hands[1])} = {g.n(result.total)} · {parityName(result.parity)}</div><p>{names[result.winner]} +{g.n(1)}</p><button className="btn big" onClick={next} data-testid="next-round">{Math.max(...scores) >= target ? t('See report card', 'রেজাল্ট দেখো') : t('Next round', 'পরের রাউন্ড')}</button>
    </section>}
  </BenchFrame>;
}
