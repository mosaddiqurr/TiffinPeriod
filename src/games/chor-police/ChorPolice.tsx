import { useState } from 'react';
import { MODE_ICON } from '../../components/ui';
import type { GameProps } from '../../platform/registry';
import { Seg, usePlayerNames } from '../../components/ui';
import { BenchFrame, PassScreen, ScoreStrip, useBench } from '../bench-kit/BenchKit';
import { dealRoles, ROLE_POINTS, scoreChits, suspects, type Role } from './model';
import { ChitArt } from '../bench-kit/art';
import { sfx } from '../../platform/audio';
import { useOnlineEntry } from '../../components/online/OnlineButton';
import { OnlineChorPolice } from './online';

export default function ChorPolice({ onExit }: GameProps) {
  const online = useOnlineEntry();
  if (online.open) return <div className="sport-root ruled"><OnlineChorPolice onBack={online.close} code={online.code} /></div>;
  return <ChorPoliceLocal onExit={onExit} onOnline={online.show} />;
}

function ChorPoliceLocal({ onExit, onOnline }: GameProps & { onOnline: () => void }) {
  const g = useBench('chor-police'), t = g.text;
  const [n1, n2] = usePlayerNames();
  const [mode, setMode] = useState<'ai' | 'party'>('ai');
  const [rounds, setRounds] = useState(5);
  const [custom, setCustom] = useState([n1, n2, '', '']);
  const [round, setRound] = useState(1);
  const [roles, setRoles] = useState<Role[]>([]);
  const [scores, setScores] = useState([0, 0, 0, 0]);
  const [step, setStep] = useState<'pass' | 'secret' | 'guess' | 'reveal'>('pass');
  const [reader, setReader] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [last, setLast] = useState<ReturnType<typeof scoreChits> | null>(null);
  const names = mode === 'ai' ? [g.u('you'), t('Rafi', 'রাফি'), t('Sakib', 'সাকিব'), t('Shuvo', 'শুভ')]
    : custom.map((s, i) => s.trim() || `${t('Player', 'খেলোয়াড়')} ${g.n(i + 1)}`);
  const roleName = (r: Role) => ({ babu: t('Babu', 'বাবু'), police: t('Police', 'পুলিশ'), dakat: t('Dakat', 'ডাকাত'), chor: t('Chor', 'চোর') })[r];
  const rules = [
    t('Four folded chits: Babu, Police, Dakat and Chor. Each player privately reads one. In computer mode you play with three friends controlled by the computer.', 'চার ভাঁজ করা কাগজে বাবু, পুলিশ, ডাকাত আর চোর। প্রত্যেকে গোপনে একটা দেখবে। কম্পিউটার মোডে তিন বন্ধু কম্পিউটার চালাবে।'),
    t('Babu and Police reveal themselves. Police must identify the Chor among the two remaining suspects.', 'বাবু আর পুলিশ পরিচয় জানাবে। বাকি দুজনের মধ্যে পুলিশ চোরকে ধরবে।'),
    t('Our house scoring: Babu 1000, Dakat 500. A correct guess gives Police 100 and Chor 0; a wrong guess gives Police 0 and Chor 100.', 'এই খেলার পয়েন্ট: বাবু ১০০০, ডাকাত ৫০০। ঠিক ধরলে পুলিশ ১০০, চোর ০; ভুল হলে পুলিশ ০, চোর ১০০।'),
    t('New roles every round. The highest total wins; equal highest totals share the win.', 'প্রতি রাউন্ডে নতুন পরিচয়। শেষে বেশি পয়েন্ট যার সে জিতবে; সমান সর্বোচ্চ হলে যৌথ জয়।'),
  ];
  function deal() { setRoles(dealRoles()); setReader(0); setPicked(null); setLast(null); setStep('pass'); }
  function start() { setRound(1); setScores([0, 0, 0, 0]); deal(); g.start(); }
  function hide() {
    if (mode === 'party' && reader < 3) { setReader(reader + 1); setStep('pass'); }
    else setStep('guess');
  }
  const police = roles.indexOf('police');
  const babu = roles.indexOf('babu');
  const cpuPolice = mode === 'ai' && police !== 0;
  function resolve() {
    if (step !== 'guess') return;
    const options = suspects(roles);
    const guess = cpuPolice ? options[Math.floor(Math.random() * options.length)] : picked;
    if (guess === null) return;
    const result = scoreChits(roles, guess);
    setPicked(guess); setLast(result); setScores(scores.map((s, i) => s + result.points[i])); setStep('reveal');
    sfx(result.correct ? 'good' : 'bad');
  }
  function next() {
    if (round < rounds) { setRound(round + 1); deal(); return; }
    const high = Math.max(...scores), winners = names.filter((_, i) => scores[i] === high);
    const outcome = mode === 'party' ? 'none' : scores[0] < high ? 'loss' : winners.length > 1 ? 'tie' : 'win';
    g.finish({ title: `${winners.join(' & ')} ${t('wins!', 'জিতেছে!')}`, outcome, rows: names.map((name, i) => [name, scores[i]]), score: mode === 'ai' ? scores[0] : undefined });
  }
  return <BenchFrame game={g} title={t('Chor Police', 'চোর-পুলিশ')} lede={t('Four chits. Two suspects. Who is hiding the Chor?', 'চার কাগজ। দুই সন্দেহভাজন। চোর কে?')} rules={rules} onStart={start} onExit={onExit} art={<ChitArt />}
    modes={[
      { id: 'ai', label: g.u('modeAi'), sub: t('You and three computer players', 'তুমি আর তিনজন কম্পিউটার'), icon: MODE_ICON.ai },
      { id: 'party', label: t('4 friends', '৪ বন্ধু'), sub: t('Pass one phone round', 'একটা ফোন ঘুরবে'), icon: MODE_ICON.local2p },
    ]}
    mode={mode} onMode={(m) => setMode(m as typeof mode)}
    online={{ onClick: onOnline, label: t('Play online', 'অনলাইনে খেলো'), sub: t('4 players · rooms or quick match', '৪ জন · রুম বা কুইক ম্যাচ') }}
    options={<><div className="opt-label">{t('Rounds', 'রাউন্ড')}</div><Seg label={t('Rounds', 'রাউন্ড')} value={rounds} onChange={setRounds} options={[3, 5, 10].map((v) => ({ v, label: g.n(v) }))} />
      {mode === 'party' && <div className="bench-name-fields">{custom.map((name, i) => <label key={i}>{t('Player', 'খেলোয়াড়')} {g.n(i + 1)}<input className="text-in" value={name} maxLength={24} onChange={(e) => setCustom(custom.map((s, j) => i === j ? e.target.value : s))} /></label>)}</div>}</>}
  >
    <ScoreStrip names={names} scores={scores} n={g.n} />
    <div className="bench-round">{t('Round', 'রাউন্ড')} {g.n(round)} / {g.n(rounds)}</div>
    {step === 'pass' && <PassScreen game={g} name={names[reader]} onReady={() => setStep('secret')} />}
    {step === 'secret' && <section className="bench-center" data-testid="secret"><p>{names[reader]} · {t('Your secret chit', 'তোমার গোপন কাগজ')}</p><div className="paper-chit open"><div className="role-name">{roles[reader] && roleName(roles[reader])}</div><small>{t('Base points', 'মূল পয়েন্ট')}: {g.n(ROLE_POINTS[roles[reader]] ?? 0)}</small></div><div className="bench-actions"><button className="btn" onClick={hide} data-testid="hide-role">{t('Hide my chit', 'কাগজ লুকাও')}</button></div></section>}
    {(step === 'guess' || step === 'reveal') && <>
      <h2>{step === 'reveal' ? t('Chits open!', 'কাগজ খোলো!') : `${names[police]} · ${t('Find the Chor', 'চোরকে ধরো')}`}</h2>
      <p>{names[babu]}: {t('“Police, find the thief!”', '“পুলিশ, চোরকে ধরো!”')}</p>
      <div className="chit-table">{roles.map((role, i) => {
        const publicRole = role === 'babu' || role === 'police' || step === 'reveal';
        return <button key={i} className={`paper-chit ${publicRole ? 'open' : ''}`} disabled={step !== 'guess' || publicRole || cpuPolice} aria-pressed={picked === i} data-testid={`chit-${i}`} onClick={() => setPicked(i)}>
          {publicRole ? roleName(role) : '?'}<small>{names[i]}</small>{step === 'reveal' && <small>+{g.n(last?.points[i] ?? 0)}</small>}
        </button>;
      })}</div>
      {step === 'guess' ? <div className="bench-actions"><button className="btn big" disabled={!cpuPolice && picked === null} data-testid="guess" onClick={resolve}>{cpuPolice ? t('See the police’s guess', 'পুলিশের আন্দাজ দেখো') : t('This is the Chor!', 'এই তো চোর!')}</button></div>
        : <><div className="bench-status" role="status">{last?.correct ? t('Caught! Police earns 100.', 'ধরা পড়েছে! পুলিশ পেল ১০০।') : t('Wrong suspect! Chor takes 100.', 'ভুল হয়েছে! চোর পেল ১০০।')}</div><div className="bench-actions"><button className="btn" onClick={next} data-testid="next-round">{round === rounds ? t('See report card', 'রেজাল্ট দেখো') : t('Shuffle again', 'আবার কাগজ মেশাও')}</button></div></>}
    </>}
  </BenchFrame>;
}
