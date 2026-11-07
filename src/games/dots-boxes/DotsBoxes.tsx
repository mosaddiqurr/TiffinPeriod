import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameProps } from '../../platform/registry';
import { DifficultySeg, ModeSeg, Seg, usePlayerNames, type Difficulty, type Mode } from '../../components/ui';
import { BenchFrame, ScoreStrip, useBench } from '../bench-kit/BenchKit';
import { createRng } from '../../engine/rng';
import { sfx, vibrate } from '../../platform/audio';
import { unlockAchievement } from '../../platform/scores';
import { aiMove, apply, lineGeom, newGame, type DBState } from './model';
import './dots-boxes.css';

const SIZES = [3, 4, 5, 6];
const INK = ['#1f3a93', '#c62f2f'];

export default function DotsBoxes({ onExit }: GameProps) {
  const g = useBench('dots-boxes'), t = g.text;
  const [p1, p2] = usePlayerNames();
  const [mode, setMode] = useState<Mode>('ai');
  const [diff, setDiff] = useState<Difficulty>('medium');
  const [size, setSize] = useState(4);
  const [st, setSt] = useState<DBState>(() => newGame(4, 4));
  const [hover, setHover] = useState<number | null>(null);
  const [recent, setRecent] = useState<number[]>([]);
  const rng = useMemo(() => createRng(), []);
  const games = useRef(0);
  const names = mode === 'ai' ? [g.u('you'), g.u('computer')] : [p1, p2];
  const initials = names.map((nm) => [...nm.trim()][0]?.toUpperCase() ?? '?');

  const rules = [
    t('Take turns drawing one line between two dots next to each other.', 'পালা করে পাশাপাশি দুটো বিন্দুর মাঝে একটা দাগ টানো।'),
    t('Draw the fourth side of a box and it is yours: your initial goes inside, and you draw again.', 'কোনো ঘরের চতুর্থ দাগ টানলে ঘরটা তোমার: ভেতরে তোমার নামের অক্ষর বসবে, আর তুমি আবার দাগ টানবে।'),
    t('When every box is closed, the one with more boxes wins. Players take turns to start.', 'সব ঘর বন্ধ হলে যার ঘর বেশি সে জেতে। প্রতি খেলায় শুরু করার পালা বদলায়।'),
    t('Tip: avoid drawing the third side of a box. Near the end, giving away a short chain can win you a long one.', 'কৌশল: কোনো ঘরের তৃতীয় দাগ টেনো না। শেষে ছোট শিকল ছেড়ে দিলে লম্বা শিকল পেতে পারো।'),
  ];

  function start() {
    const first = (games.current++ % 2) as 0 | 1;
    setSt(newGame(size, size, first));
    setRecent([]);
    g.start();
  }

  const finishIfDone = (s: DBState) => {
    if (!s.done) return;
    const w = s.score[0] === s.score[1] ? null : s.score[0] > s.score[1] ? 0 : 1;
    if (mode === 'ai' && w === 0) { unlockAchievement('db-win'); if (diff === 'hard') unlockAchievement('db-hard'); }
    window.setTimeout(() => g.finish({
      title: w === null ? t('A draw!', 'ড্র!') : `${names[w]} ${t('wins!', 'জিতেছে!')}`,
      outcome: mode === 'local2p' ? 'none' : w === null ? 'tie' : w === 0 ? 'win' : 'loss',
      rows: [[names[0], s.score[0]], [names[1], s.score[1]], [t('Board', 'বোর্ড'), `${g.n(s.board.rows)} × ${g.n(s.board.cols)}`]],
      score: mode === 'ai' ? s.score[0] : undefined,
    }), 700);
  };

  const stRef = useRef(st);
  stRef.current = st;
  const play = (l: number) => {
    const s = stRef.current;
    if (s.done || s.drawn[l] >= 0) return;
    const n = apply(s, l);
    const got = n.score[s.turn] - s.score[s.turn];
    if (got) { sfx('good', { pitch: 1 + got * 0.1 }); vibrate(15); } else sfx('tick', { gain: 0.5 });
    setRecent((r) => (got ? [...r, l] : [l]));
    stRef.current = n;
    setSt(n);
    finishIfDone(n);
  };

  // Computer turn
  useEffect(() => {
    if (mode !== 'ai' || g.phase !== 'play' || g.paused || st.done || st.turn !== 1) return;
    const id = window.setTimeout(() => play(aiMove(st, diff, rng)), 380 + rng.int(0, 260));
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st, g.phase, g.paused, mode]);

  const humanTurn = g.phase === 'play' && !g.paused && !st.done && (mode === 'local2p' || st.turn === 0);
  const pad = 0.5;
  const R = st.board.rows, C = st.board.cols;

  return (
    <BenchFrame game={g} title={t('Dots and Boxes', 'ঘর কাটা')} lede={t('The last page of every khata was a grid of dots.', 'প্রতিটা খাতার শেষ পাতায় থাকত বিন্দুর ছক।')} rules={rules} onStart={start} onExit={onExit}
      art={<svg viewBox="0 0 110 88"><g stroke="#1f3a93" strokeWidth="4" strokeLinecap="round"><path d="M20 20h30v30h-30z" fill="#e8edfb" /><path d="M50 20h30" stroke="#c62f2f" /></g>{[20, 50, 80].map((x) => [20, 50, 80].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="5" fill="#23253a" />))}<text x="35" y="42" fontSize="18" fontWeight="800" fill="#1f3a93" textAnchor="middle">A</text></svg>}
      options={<>
        <ModeSeg value={mode} onChange={setMode} modes={['ai', 'local2p']} />
        {mode === 'ai' && <DifficultySeg value={diff} onChange={setDiff} />}
        <div className="opt-label">{t('Board size (boxes)', 'বোর্ডের মাপ (ঘর)')}</div>
        <Seg label={t('Board size', 'বোর্ডের মাপ')} value={size} onChange={setSize} options={SIZES.map((v) => ({ v, label: `${g.n(v)}×${g.n(v)}` }))} />
      </>}
    >
      <ScoreStrip names={names} scores={st.score} active={st.done ? undefined : st.turn} n={g.n} />
      <div className="db-turn" aria-live="polite" style={{ color: INK[st.turn] }}>
        {st.done ? t('All boxes closed!', 'সব ঘর বন্ধ!') : mode === 'ai' && st.turn === 1 ? t('The computer is thinking…', 'কম্পিউটার ভাবছে…') : t(`${names[st.turn]}: draw a line`, `${names[st.turn]}: একটা দাগ টানো`)}
      </div>
      <div className="db-paper">
        <svg className="db-svg" viewBox={`${-pad} ${-pad} ${C + pad * 2} ${R + pad * 2}`} data-testid="board" onPointerLeave={() => setHover(null)}>
          {st.owner.map((o, b) => {
            if (o < 0) return null;
            const r = Math.floor(b / C), c = b % C;
            return (
              <g key={`b${b}`} className="db-box">
                <rect x={c + 0.06} y={r + 0.06} width={0.88} height={0.88} fill={INK[o]} opacity={0.13} rx={0.06} />
                <text x={c + 0.5} y={r + 0.66} textAnchor="middle" fontSize={0.5} fontWeight={800} fill={INK[o]} fontFamily="var(--font-display)" transform={`rotate(-6 ${c + 0.5} ${r + 0.5})`}>{initials[o]}</text>
              </g>
            );
          })}
          {st.drawn.map((d, l) => {
            const ge = lineGeom(st.board, l);
            const drawn = d >= 0;
            const isRecent = recent.includes(l) || st.last === l;
            return (
              <g key={l}>
                {drawn ? (
                  <line x1={ge.x1} y1={ge.y1} x2={ge.x2} y2={ge.y2} stroke={INK[d]} strokeWidth={isRecent ? 0.11 : 0.085} strokeLinecap="round" className={isRecent ? 'db-new' : ''} />
                ) : hover === l && humanTurn ? (
                  <line x1={ge.x1} y1={ge.y1} x2={ge.x2} y2={ge.y2} stroke={INK[st.turn]} strokeWidth={0.07} strokeLinecap="round" opacity={0.35} strokeDasharray="0.12 0.1" />
                ) : null}
                {!drawn && (
                  <rect x={ge.y1 === ge.y2 ? ge.x1 + 0.14 : ge.x1 - 0.21} y={ge.y1 === ge.y2 ? ge.y1 - 0.21 : ge.y1 + 0.14} width={ge.y1 === ge.y2 ? 0.72 : 0.42} height={ge.y1 === ge.y2 ? 0.42 : 0.72} fill="transparent" className="db-hit"
                    onPointerEnter={() => setHover(l)} onClick={() => humanTurn && play(l)} data-testid={`line-${l}`}
                    role="button" aria-label={t(`Line ${l + 1}`, `দাগ ${g.n(l + 1)}`)} />
                )}
              </g>
            );
          })}
          {Array.from({ length: (R + 1) * (C + 1) }, (_, i) => <circle key={`d${i}`} cx={i % (C + 1)} cy={Math.floor(i / (C + 1))} r={0.075} fill="#23253a" pointerEvents="none" />)}
        </svg>
      </div>
      <p className="bench-note" style={{ textAlign: 'center' }}>{t('Tap between two dots. Close a box to draw again.', 'দুটো বিন্দুর মাঝে ট্যাপ করো। ঘর বন্ধ করলে আবার পালা।')}</p>
    </BenchFrame>
  );
}
