import { useEffect, useRef, useState } from 'react';
import type { GameProps } from '../../platform/registry';
import { ModeSeg, Seg, usePlayerNames, type Mode } from '../../components/ui';
import { BenchFrame, PassScreen, ScoreStrip, useBench } from '../bench-kit/BenchKit';
import { WordArt } from '../bench-kit/art';
import { LETTERS, blankAnswers, canReview, knownWord, scoreWords, type Answers, type Letter } from './model';
import { sfx } from '../../platform/audio';
import { OnlineButton, useOnlineEntry } from '../../components/online/OnlineButton';
import { OnlineNaamDesh } from './online';

export default function NaamDesh({ onExit }: GameProps) {
  const online = useOnlineEntry();
  if (online.open) return <div className="sport-root ruled"><OnlineNaamDesh onBack={online.close} code={online.code} /></div>;
  return <NaamDeshLocal onExit={onExit} onOnline={online.show} />;
}

function NaamDeshLocal({ onExit, onOnline }: GameProps & { onOnline: () => void }) {
  const g = useBench('naam-desh'), t = g.text;
  const [p1, p2] = usePlayerNames();
  const [mode, setMode] = useState<Mode>('solo');
  const [rounds, setRounds] = useState(3);
  const [seconds, setSeconds] = useState(60);
  const [round, setRound] = useState(1);
  const [letter, setLetter] = useState<Letter>(LETTERS[0]);
  const [step, setStep] = useState<'pass' | 'write' | 'review'>('write');
  const [player, setPlayer] = useState(0);
  const [answers, setAnswers] = useState<Answers[]>([blankAnswers()]);
  const [accepted, setAccepted] = useState<boolean[][]>([]);
  const [scores, setScores] = useState([0]);
  const [left, setLeft] = useState(60);
  const remaining = useRef(60000), lastTick = useRef(0), locked = useRef(false), used = useRef<string[]>([]);
  const names = mode === 'solo' ? [g.u('you')] : [p1, p2];
  const labels = [t('Name', 'নাম'), t('Country', 'দেশ'), t('Flower', 'ফুল'), t('Fruit', 'ফল')];
  const rules = [
    t('A random Bangla letter starts each round. Write a person’s name, a country, a flower and a fruit beginning with that letter. Bangla and listed Roman spellings work.', 'প্রতি রাউন্ডে একটা বাংলা অক্ষর আসবে। সেই অক্ষরে নাম, দেশ, ফুল ও ফল লেখো। বাংলা বা তালিকায় থাকা রোমান বানান চলবে।'),
    t('Practice solo, or take turns with a friend. Both get the same letter and a separate, equal timer; hide the first page before passing.', 'একা অনুশীলন করো বা বন্ধুর সাথে পালা করে খেলো। দুজন একই অক্ষর ও সমান আলাদা সময় পাবে; ফোন দেওয়ার আগে পাতা লুকাবে।'),
    t('An accepted answer earns 10; the same accepted answer from both players earns 5 each. Blank answers and wrong initial letters earn 0.', 'সঠিক উত্তরে ১০; দুজনের একই সঠিক উত্তরে ৫ করে। ফাঁকা বা ভুল অক্ষরে শুরু হলে ০।'),
    t('The offline word list is small. Review unfamiliar answers together and tick only real, valid words. This is an honesty game, just like the khata version.', 'অফলাইন শব্দতালিকা ছোট। অচেনা উত্তর একসাথে যাচাই করে সত্যিকারের সঠিক শব্দে টিক দাও। খাতার মতোই সততার খেলা।'),
  ];
  function beginTimer() { remaining.current = seconds * 1000; setLeft(seconds); locked.current = false; }
  function newLetter() {
    const pool = LETTERS.filter((l) => !used.current.includes(l.bn));
    const next = pool[Math.floor(Math.random() * pool.length)];
    used.current.push(next.bn); setLetter(next); setPlayer(0); setAnswers(names.map(blankAnswers)); setAccepted([]); beginTimer(); setStep(mode === 'solo' ? 'write' : 'pass');
  }
  function start() { used.current = []; setRound(1); setScores(names.map(() => 0)); newLetter(); g.start(); }
  function submit() {
    if (locked.current || step !== 'write' || g.paused) return;
    locked.current = true;
    if (mode === 'local2p' && player === 0) { setPlayer(1); setStep('pass'); beginTimer(); }
    else { setAccepted(answers.map((row) => row.map((a, c) => knownWord(letter, c, a)))); setStep('review'); }
    sfx('bell', { gain: .4 });
  }
  const submitRef = useRef(submit);
  submitRef.current = submit;
  // Wall-clock deltas avoid giving extra time when an interval is throttled.
  // Paused and hidden time is excluded by stopping this interval.
  useEffect(() => {
    if (g.phase !== 'play' || g.paused || step !== 'write') return;
    lastTick.current = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now(); remaining.current = Math.max(0, remaining.current - (now - lastTick.current)); lastTick.current = now;
      setLeft(Math.ceil(remaining.current / 1000));
      if (remaining.current <= 0) submitRef.current();
    }, 150);
    return () => clearInterval(id);
  }, [g.phase, g.paused, step, player]);
  const points = scoreWords(letter, answers, accepted);
  function next() {
    const totals = scores.map((s, i) => s + points[i].reduce((a, b) => a + b, 0));
    setScores(totals);
    if (round < rounds) { setRound(round + 1); newLetter(); return; }
    const winner = totals.indexOf(Math.max(...totals));
    const tie = totals.length > 1 && totals[0] === totals[1];
    g.finish({ title: mode === 'solo' ? t('A khata full of words!', 'শব্দে ভরা খাতা!') : tie ? t('A shared win!', 'সমান সমান!') : `${names[winner]} ${t('wins!', 'জিতেছে!')}`,
      outcome: mode === 'solo' ? 'none' : tie ? 'tie' : 'none', score: mode === 'solo' ? totals[0] : undefined,
      rows: [...names.map((name, i) => [name, totals[i]] as [string, number]), [t('Rounds', 'রাউন্ড'), rounds], [t('Maximum per player', 'প্রত্যেকের সর্বোচ্চ সম্ভব'), rounds * 40]] });
  }
  return <BenchFrame game={g} title={t('Naam Desh Ful Fol', 'নাম দেশ ফুল ফল')} lede={t('A letter, four columns, and a race against the bell.', 'একটা অক্ষর, চার কলাম, আর ঘণ্টার সাথে পাল্লা।')} rules={rules} onStart={start} onExit={onExit} art={<WordArt />}
    options={<><OnlineButton onClick={onOnline} /><ModeSeg value={mode} onChange={setMode} modes={['solo', 'local2p']} /><div className="opt-label">{t('Rounds', 'রাউন্ড')}</div><Seg label={t('Rounds', 'রাউন্ড')} value={rounds} onChange={setRounds} options={[3, 5, 10].map((v) => ({ v, label: g.n(v) }))} />
      <div className="opt-label">{t('Seconds per turn', 'প্রতি পালায় সেকেন্ড')}</div><Seg label={t('Timer', 'সময়')} value={seconds} onChange={setSeconds} options={[30, 60, 90].map((v) => ({ v, label: g.n(v) }))} /></>}
  ><ScoreStrip names={names} scores={scores} active={step !== 'review' ? player : undefined} n={g.n} /><div className="bench-round">{t('Round', 'রাউন্ড')} {g.n(round)} / {g.n(rounds)}</div>
    {step === 'pass' ? <PassScreen game={g} name={names[player]} onReady={() => { locked.current = false; setStep('write'); }} /> : <>
      <div className="word-header"><div className="word-letter" data-testid="letter">{letter.bn}</div><div><div className="bench-note">{t('Roman hint', 'রোমান ইঙ্গিত')}: {letter.roman}</div>{step === 'write' ? <div className={`word-timer ${left <= 10 ? 'urgent' : ''}`} role="timer" aria-label={t('Seconds remaining', 'বাকি সেকেন্ড')} data-testid="timer">{g.n(left)} {t('sec', 'সেকেন্ড')}</div> : <h2>{t('Check the khata', 'খাতা মিলিয়ে নাও')}</h2>}</div></div>
      {step === 'write' ? <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <p style={{ textAlign: 'center' }}>{names[player]} · {t('One answer in each column', 'প্রতি ঘরে একটা উত্তর')}</p><div className="word-fields">{labels.map((label, cat) => <label key={cat} htmlFor={`word-${cat}`}>{label}<input id={`word-${cat}`} className="text-in" data-testid={`word-${cat}`} autoComplete="off" autoCapitalize="off" spellCheck={false} maxLength={60} value={answers[player]?.[cat] ?? ''} onChange={(e) => setAnswers(answers.map((row, i) => i === player ? row.map((s, c) => c === cat ? e.target.value : s) as Answers : row))} /></label>)}</div>
        <div className="bench-actions"><button className="btn big" type="submit" data-testid="submit-words">{t('Done · close my khata', 'হয়েছে · খাতা বন্ধ করো')}</button></div>
      </form> : <><p className="bench-note">{t('Known words are ticked. Check other valid answers together; wrong initials cannot be ticked. Roman spellings in the reference list are accepted.', 'পরিচিত শব্দে টিক আছে। বাকি সঠিক উত্তর মিলিয়ে টিক দাও; ভুল অক্ষরে টিক দেওয়া যাবে না। তালিকার রোমান বানানও চলবে।')}</p><div className="word-table-wrap"><table className="word-review"><thead><tr><th>{t('Category', 'বিভাগ')}</th>{names.map((name, i) => <th key={i}>{name}</th>)}</tr></thead><tbody>{labels.map((label, cat) => <tr key={cat}><th>{label}</th>{answers.map((row, i) => <td key={i}><label><input type="checkbox" aria-label={`${names[i]} · ${label}`} checked={accepted[i]?.[cat] ?? false} disabled={!canReview(letter, cat, row[cat])} onChange={(e) => setAccepted(accepted.map((flags, p) => p === i ? flags.map((f, c) => c === cat ? e.target.checked : f) : flags))} />{row[cat] || '—'}</label><small>{g.n(points[i][cat])} {t('points', 'পয়েন্ট')}{row[cat] && !knownWord(letter, cat, row[cat]) && canReview(letter, cat, row[cat]) ? ` · ${t('review together', 'মিলিয়ে দেখো')}` : ''}</small></td>)}</tr>)}</tbody></table></div>
        <details className="bench-note" style={{ marginTop: 16 }}><summary>{t('Need examples after the round?', 'রাউন্ড শেষে উদাহরণ দেখবে?')}</summary><p>{labels.map((label, c) => `${label}: ${letter.words[c][0]}`).join(' · ')}</p></details>
        <div className="bench-actions"><button className="btn big" onClick={next} data-testid="next-round">{round === rounds ? t('See report card', 'রেজাল্ট দেখো') : t('Next letter', 'পরের অক্ষর')}</button></div>
      </>}
    </>}
  </BenchFrame>;
}
