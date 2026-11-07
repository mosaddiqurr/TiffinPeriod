import { useEffect, useState } from 'react';
import type { GameProps } from '../../platform/registry';
import { DifficultySeg, ModeSeg, Seg, usePlayerNames, type Difficulty, type Mode } from '../../components/ui';
import { BenchFrame, ScoreStrip, useBench } from '../bench-kit/BenchKit';
import { BaghArt } from '../bench-kit/art';
import { applyMove, chooseMove, EDGES, initialPosition, legalMoves, positionKey, verdict, type Move, type Position, type Side, type Verdict } from './model';
import tiger from '../pakhir-ure/art/tiger.svg';
import goat from '../pakhir-ure/art/goat.svg';
import { sfx } from '../../platform/audio';

export default function BaghBandi({ onExit }: GameProps) {
  const g = useBench('bagh-bandi'), t = g.text;
  const [p1, p2] = usePlayerNames();
  const [mode, setMode] = useState<Mode>('ai');
  const [side, setSide] = useState<Side>('goats');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [target, setTarget] = useState(10);
  const [history, setHistory] = useState<Position[]>([initialPosition()]);
  const [selected, setSelected] = useState<number | null>(null);
  const [lastMove, setLastMove] = useState<Move | null>(null);
  const state = history[history.length - 1];
  const sideName = (s: Side) => s === 'goats' ? t('Goats', 'ছাগল') : t('Tigers', 'বাঘ');
  const owner = (s: Side) => mode === 'ai' ? s === side ? g.u('you') : g.u('computer') : s === 'goats' ? p1 : p2;
  const cpuTurn = mode === 'ai' && state.turn !== side;
  const moves = legalMoves(state);
  const destinations = selected === null ? [] : moves.filter((m) => m.from === selected);
  const rules = [
    t('Bengal board: two tigers and twenty goats. Goats start in four stacks of five and move first. Player 1 controls goats in a local game.', 'বাংলার ছক: দুই বাঘ আর কুড়ি ছাগল। চার ঘরে পাঁচটা করে ছাগল; ছাগল আগে চালবে। দুজনের খেলায় খেলোয়াড় ১ ছাগল চালাবে।'),
    t('Move one piece along a drawn line to an empty neighbour. Move only the top goat from a stack. Goats cannot capture or make new stacks.', 'দাগ ধরে একটা গুটি পাশের ফাঁকা ঘরে নাও। স্তূপের শুধু ওপরের ছাগল চালবে। ছাগল কাউকে খাবে না বা নতুন স্তূপ বানাবে না।'),
    t('A tiger may jump over an adjacent goat to an empty point directly beyond it. Remove one goat, even from a stack. One optional capture per turn.', 'বাঘ পাশের ছাগল টপকে সোজা পরের ফাঁকা ঘরে গেলে একটা ছাগল খাবে, স্তূপ হলেও একটা। প্রতি চালে সর্বোচ্চ একটা; খাওয়া বাধ্যতামূলক নয়।'),
    t('Goats win by trapping both tigers. For a clear finish, our short match ends at 10 captures; the long match at 18. This capture target is a house rule.', 'দুই বাঘকে আটকালেই ছাগলের জয়। স্পষ্ট ফলের জন্য ছোট ম্যাচে ১০টা, বড় ম্যাচে ১৮টা ছাগল খেলে বাঘ জিতবে। এই সংখ্যাটা আমাদের ঘরোয়া নিয়ম।'),
    t('Three repeated positions, 100 moves without a capture, or 300 total moves is a draw. Tap a piece, then a green destination. Tab and Enter also work.', 'একই অবস্থা তিনবার, না খেয়ে ১০০ চাল, বা মোট ৩০০ চালে ড্র। গুটি ছুঁয়ে সবুজ ঘর বাছো। Tab ও Enter দিয়েও খেলা যায়।'),
  ];
  function start() { setHistory([initialPosition(target)]); setSelected(null); setLastMove(null); g.start(); }
  function finish(end: Verdict, position: Position) {
    if (!end) return;
    const outcome = end === 'draw' ? 'tie' : mode === 'local2p' ? 'none' : end === side ? 'win' : 'loss';
    g.finish({ title: end === 'draw' ? t('A drawn game!', 'খেলা ড্র!') : `${owner(end)} · ${sideName(end)} ${t('win!', 'জিতেছে!')}`, outcome,
      rows: [[t('Moves played', 'মোট চাল'), position.ply], [t('Goats captured', 'খাওয়া ছাগল'), position.captured], [t('Goats remaining', 'বাকি ছাগল'), 20 - position.captured], [t('Capture target', 'খাওয়ার লক্ষ্য'), position.target]] });
  }
  function commit(move: Move) {
    const next = applyMove(state, move);
    const repeated = history.filter((p) => positionKey(p) === positionKey(next)).length >= 2;
    setHistory([...history, next]); setSelected(null); setLastMove(move); sfx(move.capture !== undefined ? 'good' : 'click');
    finish(verdict(next) ?? (repeated ? 'draw' : null), next);
  }
  useEffect(() => {
    if (g.phase !== 'play' || g.paused || !cpuTurn) return;
    const id = window.setTimeout(() => {
      const move = chooseMove(state, difficulty === 'easy' ? 1 : difficulty === 'hard' ? 3 : 2);
      if (move) commit(move);
    }, 550);
    return () => clearTimeout(id);
  }, [history, g.phase, g.paused, cpuTurn, difficulty]);
  function select(point: number) {
    if (cpuTurn || g.paused || g.phase !== 'play') return;
    const move = destinations.find((m) => m.to === point);
    if (move) { commit(move); return; }
    setSelected(selected === point ? null : moves.some((m) => m.from === point) ? point : null);
  }
  function undo() {
    const count = mode === 'ai' && !cpuTurn ? 2 : 1;
    if (history.length <= count) return;
    setHistory(history.slice(0, -count)); setSelected(null); setLastMove(null);
  }
  return <BenchFrame game={g} title={t('Bagh Bandi', 'বাঘবন্দী')} lede={t('Two tigers on the prowl. A herd with a plan.', 'দুই বাঘের শিকার। ছাগলের চালাকি।')} rules={rules} onStart={start} onExit={onExit} art={<BaghArt />}
    options={<><ModeSeg value={mode} onChange={setMode} modes={['ai', 'local2p']} />{mode === 'ai' && <><div className="opt-label">{t('You play', 'তুমি চালাবে')}</div><Seg label={t('Your side', 'তোমার দল')} value={side} onChange={setSide} options={(['goats', 'tigers'] as Side[]).map((v) => ({ v, label: sideName(v) }))} /><DifficultySeg value={difficulty} onChange={setDifficulty} /></>}
      <div className="opt-label">{t('Match length · house rule', 'ম্যাচের দৈর্ঘ্য · ঘরোয়া নিয়ম')}</div><Seg label={t('Capture target', 'খাওয়ার লক্ষ্য')} value={target} onChange={setTarget} options={[{ v: 10, label: t('Short · 10 captures', 'ছোট · ১০টা খাবে') }, { v: 18, label: t('Long · 18 captures', 'বড় · ১৮টা খাবে') }]} /></>}
  ><ScoreStrip names={[`${sideName('goats')} · ${owner('goats')}`, `${sideName('tigers')} · ${owner('tigers')}`]} scores={[20 - state.captured, state.captured]} active={state.turn === 'goats' ? 0 : 1} n={g.n} />
    <div className="bagh-layout"><div className="bagh-board" role="group" aria-label={t('Bagh Bandi board', 'বাঘবন্দীর ছক')} data-testid="bagh-board"><svg className="bagh-lines" viewBox="0 0 100 100" aria-hidden="true">{EDGES.map(([a, b]) => <line key={`${a}-${b}`} x1={10 + a % 5 * 20} y1={10 + Math.floor(a / 5) * 20} x2={10 + b % 5 * 20} y2={10 + Math.floor(b / 5) * 20} stroke="#8b734e" strokeWidth=".65" />)}{Array.from({ length: 25 }, (_, p) => <circle key={p} cx={10 + p % 5 * 20} cy={10 + Math.floor(p / 5) * 20} r="1.2" fill="#8b734e" />)}</svg>
      {Array.from({ length: 25 }, (_, p) => {
        const isTiger = state.tigers.includes(p), count = state.goats[p], legal = destinations.some((m) => m.to === p);
        const label = `${String.fromCharCode(65 + p % 5)}${Math.floor(p / 5) + 1} · ${isTiger ? sideName('tigers') : count ? `${sideName('goats')} ${g.n(count)}` : t('Empty', 'ফাঁকা')}${legal ? ` · ${t('legal destination', 'যাওয়া যাবে')}` : ''}`;
        return <button key={p} className={`bagh-node ${selected === p ? 'selected' : ''} ${legal ? 'legal' : ''} ${lastMove?.to === p ? 'last' : ''}`} style={{ left: `${10 + p % 5 * 20}%`, top: `${10 + Math.floor(p / 5) * 20}%` }} aria-label={label} aria-pressed={selected === p} disabled={cpuTurn} onClick={() => select(p)} data-testid={`node-${p}`}>
          {(isTiger || count > 0) && <span className={`piece ${isTiger ? 'tiger' : 'goat'}`}><img src={isTiger ? tiger : goat} alt="" draggable={false} />{count > 1 && <span className="stack-count">{g.n(count)}</span>}</span>}
        </button>;
      })}
    </div><aside className="bagh-aside"><div className="bench-round">{t('Move', 'চাল')} {g.n(state.ply + 1)}</div><h2 role="status" data-testid="turn-status">{cpuTurn ? t('Computer is thinking…', 'কম্পিউটার ভাবছে…') : `${owner(state.turn)} · ${sideName(state.turn)}`}</h2>
      <p>{selected === null ? t('Choose a piece to see where it can go.', 'গুটি বেছে নিলে কোথায় যাবে দেখা যাবে।') : t('Choose a green point, or tap your piece again to cancel.', 'সবুজ ঘর বাছো, বা বাতিল করতে আবার গুটি ছোঁও।')}</p><p className="bench-note">{t('Captured', 'খাওয়া হয়েছে')}: {g.n(state.captured)} / {g.n(state.target)}<br />{t('A number on a goat is a stack. Move only one.', 'ছাগলের সংখ্যাটা স্তূপের মাপ। একবারে একটা চালবে।')}</p>
      <div className="bench-actions"><button className="btn secondary" onClick={undo} disabled={history.length <= (mode === 'ai' && !cpuTurn ? 2 : 1)} data-testid="undo">{t('Take back', 'চাল ফেরাও')}</button><button className="btn secondary" onClick={() => finish(mode === 'local2p' ? state.turn === 'goats' ? 'tigers' : 'goats' : side === 'goats' ? 'tigers' : 'goats', state)}>{t('Concede match', 'হার মেনে নাও')}</button></div>
    </aside></div>
  </BenchFrame>;
}
