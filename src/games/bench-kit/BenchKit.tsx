import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useSettings } from '../../platform/settings';
import { fmtNum, useT } from '../../platform/i18n';
import { UI } from '../../platform/strings';
import { recordResult, type Outcome } from '../../platform/scores';
import { sfx, unlockAudio } from '../../platform/audio';
import { Overlay, PauseMenu, ReportCard, useGameBar } from '../../components/ui';
import './bench-kit.css';

type Result = { title: string; outcome: Outcome; rows: Array<[string, string | number]>; score?: number; newBest?: boolean };

export function useBench(id: string) {
  const { lang } = useSettings();
  const u = useT(UI);
  const text = (en: string, bn: string) => lang === 'bn' ? bn : en;
  const n = (v: number) => fmtNum(v, lang);
  const [phase, setPhase] = useState<'setup' | 'play' | 'result'>('setup');
  const [paused, setPaused] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const finished = useRef(false);
  useEffect(() => {
    const hide = () => { if (document.hidden && phase === 'play') setPaused(true); };
    document.addEventListener('visibilitychange', hide);
    return () => document.removeEventListener('visibilitychange', hide);
  }, [phase]);
  return {
    lang, text, n, u, phase, setPhase, paused, setPaused, result,
    start() { finished.current = false; setResult(null); setPaused(false); setPhase('play'); unlockAudio(); sfx('bell'); },
    finish(r: Result) {
      if (finished.current) return;
      finished.current = true;
      const saved = recordResult(id, { outcome: r.outcome, score: r.score });
      setResult({ ...r, newBest: saved.newBest }); setPhase('result');
    },
  };
}

export type Bench = ReturnType<typeof useBench>;

export function BenchFrame({ game, title, lede, rules, options, onStart, onExit, art, children }: {
  game: Bench; title: string; lede: string; rules: string[]; options: ReactNode;
  onStart: () => void; onExit: () => void; art?: ReactNode; children: ReactNode;
}) {
  const help = <ol>{rules.map((r) => <li key={r}>{r}</li>)}</ol>;
  useGameBar({ onPause: game.phase === 'play' && !game.paused ? () => game.setPaused(true) : undefined, onResume: () => game.setPaused(false), help }, [game.phase, game.paused, game.lang]);
  return <div className="bench-root ruled">
    {game.phase === 'setup' ? <Overlay label={title}><div className="sheet ruled bench-setup" data-testid="setup">
      {art && <div className="bench-setup-art" aria-hidden="true">{art}</div>}
      <div className="bench-eyebrow">{game.text('FROM THE BACK OF THE KHATA', 'খাতার শেষ পাতার খেলা')}</div>
      <h2>{title}</h2><p className="lede">{lede}</p>
      <details className="bench-rules"><summary>{game.text('How to play · our household rules', 'কীভাবে খেলবে · আমাদের ঘরোয়া নিয়ম')}</summary>{help}</details>{options}
      <div className="actions"><button className="btn big" data-testid="start" onClick={onStart}>{game.u('start')}</button><button className="btn secondary" onClick={onExit}>{game.u('back')}</button></div>
    </div></Overlay> : <div className="bench-content" inert={game.paused || game.phase === 'result'}>{children}</div>}
    {game.paused && game.phase === 'play' && <PauseMenu onResume={() => game.setPaused(false)} onRestart={onStart} onQuit={onExit} />}
    {game.phase === 'result' && game.result && <ReportCard {...game.result} onAgain={onStart} onSetup={() => game.setPhase('setup')} onQuit={onExit} />}
  </div>;
}

export function ScoreStrip({ names, scores, active, n }: { names: string[]; scores: number[]; active?: number; n: (v: number) => string }) {
  return <div className={`bench-scores ${names.length === 1 ? 'solo' : ''}`}>{names.map((name, i) => <div key={i} className={active === i ? 'active' : ''}><span>{name}</span><b>{n(scores[i] ?? 0)}</b></div>)}</div>;
}

export function PassScreen({ name, onReady, game }: { name: string; onReady: () => void; game: Bench }) {
  return <section className="bench-center" data-testid="handoff"><div className="bench-seal" aria-hidden="true">?</div><h2>{game.text(`Pass the device to ${name}`, `ফোনটা ${name}-কে দাও`)}</h2>
    <p>{game.text('Everyone else, look away. The previous choice is hidden.', 'বাকিরা তাকাবে না। আগের পছন্দ লুকানো আছে।')}</p>
    <button className="btn big" onClick={onReady} data-testid="ready">{game.text('I’m ready', 'আমি প্রস্তুত')}</button></section>;
}
