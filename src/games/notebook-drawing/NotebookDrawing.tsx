import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import type { GameProps } from '../../platform/registry';
import { useT, type StringTable } from '../../platform/i18n';
import { UI } from '../../platform/strings';
import { sfx } from '../../platform/audio';
import { recordResult } from '../../platform/scores';
import { createRng } from '../../engine/rng';
import { Overlay, PauseMenu, ReportCard, Seg, useGameBar, usePlayerNames } from '../../components/ui';
import { DOODLES, PARTY_WORDS } from './words';
import type { Bi } from '../../platform/i18n';
import './notebook-drawing.css';

const S: StringTable<
  | 'title' | 'lede' | 'r1' | 'r2' | 'r3' | 'r4' | 'mode' | 'party' | 'cpu' | 'players' | 'rounds' | 'passTo' | 'eyes' | 'showWords' | 'pick'
  | 'drawing' | 'whoGot' | 'nobody' | 'timeUp' | 'next' | 'clear' | 'undo' | 'eraser' | 'guess' | 'right' | 'wrong' | 'was' | 'round' | 'winner' | 'score' | 'cpuDraws' | 'tie' | 'pName'
> = {
  en: {
    title: 'Notebook Drawing Battle', lede: 'A page from the back of the khata, a pen and a secret word.',
    r1: 'Party: pass the phone. The drawer secretly picks a word and draws it in 60 seconds.', r2: 'The others shout their guesses. When someone is right, the drawer taps that friend’s name.',
    r3: 'A fast guess gives more points, to the guesser and to the drawer. No letters or numbers in the drawing!', r4: 'Computer draws: the computer draws a doodle. Pick the answer before it finishes.',
    mode: 'Mode', party: 'Party (pass the phone)', cpu: 'Computer draws', players: 'Players', rounds: 'Turns each', passTo: 'Pass the phone to {name}', eyes: 'Everyone else: do not look at the screen!',
    showWords: 'Show my words', pick: 'Pick a word to draw', drawing: '{name} is drawing', whoGot: 'Who guessed it?', nobody: 'Nobody got it', timeUp: 'Time up!',
    next: 'Next', clear: 'Clear', undo: 'Undo', eraser: 'Eraser', guess: 'What is it?', right: 'Right! +{n}', wrong: 'Not quite!', was: 'It was: {w}', round: 'Round {n}/{m}',
    winner: '{name} wins!', score: 'Score', cpuDraws: 'The computer is drawing…', tie: 'A tie!', pName: 'Player {n}',
  },
  bn: {
    title: 'খাতায় আঁকাআঁকি', lede: 'খাতার শেষ পাতা, একটা কলম আর একটা গোপন শব্দ।',
    r1: 'পার্টি: ফোন হাতে হাতে ঘুরবে। আঁকিয়ে গোপনে একটা শব্দ বেছে ৬০ সেকেন্ডে আঁকবে।', r2: 'বাকিরা চিৎকার করে আন্দাজ বলবে। কেউ ঠিক বললে আঁকিয়ে তার নামে চাপবে।',
    r3: 'যত তাড়াতাড়ি ধরবে, আঁকিয়ে আর ধরনেওয়ালা দুজনেই তত বেশি পয়েন্ট। ছবিতে অক্ষর বা সংখ্যা লেখা যাবে না!', r4: 'কম্পিউটার আঁকে: কম্পিউটার একটা ছবি আঁকবে। শেষ হওয়ার আগেই উত্তর বেছে নাও।',
    mode: 'খেলার ধরন', party: 'পার্টি (ফোন ঘুরবে)', cpu: 'কম্পিউটার আঁকবে', players: 'খেলোয়াড়', rounds: 'প্রত্যেকে কতবার আঁকবে', passTo: 'ফোনটা {name}-কে দাও', eyes: 'বাকিরা পর্দার দিকে তাকাবে না!',
    showWords: 'আমার শব্দ দেখাও', pick: 'আঁকার জন্য একটা শব্দ বাছো', drawing: '{name} আঁকছে', whoGot: 'কে ধরতে পারলো?', nobody: 'কেউ পারেনি', timeUp: 'সময় শেষ!',
    next: 'পরের জন', clear: 'মুছে ফেলো', undo: 'আগেরটা বাদ', eraser: 'রাবার', guess: 'এটা কী?', right: 'ঠিক! +{n}', wrong: 'হলো না!', was: 'উত্তর: {w}', round: 'রাউন্ড {n}/{m}',
    winner: '{name} জিতেছে!', score: 'পয়েন্ট', cpuDraws: 'কম্পিউটার আঁকছে…', tie: 'সমান সমান!', pName: 'খেলোয়াড় {n}',
  },
};

type Stroke = { color: string; w: number; pts: Array<[number, number]> };
const COLORS = ['#1f3a93', '#1b1b1b', '#c62f2f', '#127a59'];
const PAPER = '#fbf7ea';

/** A ruled khata page canvas. It draws the given strokes; it can also accept drawing. */
function Khata({ strokes, onStroke, enabled }: { strokes: Stroke[]; onStroke?: (s: Stroke) => void; enabled: boolean; }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef<Stroke | null>(null);
  const tool = currentTool();
  const paint = useCallback(() => {
    const c = ref.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const dpr = Math.min(2, devicePixelRatio || 1);
    if (c.width !== Math.round(r.width * dpr)) { c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr); }
    const g = c.getContext('2d')!;
    g.setTransform(dpr * r.width / 200, 0, 0, dpr * r.height / 200, 0, 0);
    g.fillStyle = PAPER; g.fillRect(0, 0, 200, 200);
    g.strokeStyle = '#c2d3e4'; g.lineWidth = 0.6;
    for (let y = 14; y < 200; y += 10) { g.beginPath(); g.moveTo(0, y); g.lineTo(200, y); g.stroke(); }
    g.strokeStyle = '#d9534f'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(16, 0); g.lineTo(16, 200); g.stroke();
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const s of [...strokes, ...(live.current ? [live.current] : [])]) {
      g.strokeStyle = s.color; g.lineWidth = s.w;
      g.beginPath();
      s.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      if (s.pts.length === 1) g.lineTo(s.pts[0][0] + 0.1, s.pts[0][1]);
      g.stroke();
    }
  }, [strokes]);
  useEffect(() => {
    paint();
    const ro = new ResizeObserver(paint);
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, [paint]);
  const pos = (e: RPointerEvent): [number, number] => {
    const r = ref.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * 200, ((e.clientY - r.top) / r.height) * 200];
  };
  return (
    <canvas
      ref={ref}
      className="nd-canvas"
      data-testid="khata"
      onPointerDown={(e) => { if (!enabled) return; (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); live.current = { color: tool.color, w: tool.w, pts: [pos(e)] }; paint(); }}
      onPointerMove={(e) => { if (!live.current) return; live.current.pts.push(pos(e)); paint(); }}
      onPointerUp={() => { if (live.current) { onStroke?.(live.current); live.current = null; } }}
      onPointerCancel={() => { live.current = null; paint(); }}
    />
  );
}

// A tiny shared "current tool" (colour and width), set by the toolbar.
const toolState = { color: COLORS[0], w: 2.2 };
function currentTool() { return toolState; }

/** Turn SVG path data into point lists (using the browser's SVG geometry). */
function sample(d: string): Array<[number, number]> {
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', d);
  const len = p.getTotalLength();
  const n = Math.max(2, Math.round(len / 3));
  return Array.from({ length: n + 1 }, (_, i) => { const q = p.getPointAtLength((len * i) / n); return [q.x, q.y] as [number, number]; });
}

export default function NotebookDrawing({ onExit }: GameProps) {
  const t = useT(S);
  const u = useT(UI);
  const [n1, n2] = usePlayerNames();
  const [mode, setMode] = useState<'party' | 'cpu'>('party');
  const [count, setCount] = useState(3);
  const [turnsEach, setTurnsEach] = useState(1);
  const [phase, setPhase] = useState<'setup' | 'pass' | 'pick' | 'draw' | 'reveal' | 'cpu' | 'result'>('setup');
  const [paused, setPaused] = useState(false);
  const rng = useMemo(() => createRng(), []);
  // Party state
  const [scores, setScores] = useState<number[]>([]);
  const [drawer, setDrawer] = useState(0);
  const [turn, setTurn] = useState(0);
  const [choices, setChoices] = useState<Bi[]>([]);
  const [word, setWord] = useState<Bi | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [left, setLeft] = useState(60);
  const [tool, setTool] = useState({ color: COLORS[0], w: 2.2, eraser: false });
  const [revealText, setRevealText] = useState('');
  // Computer-draws state
  const [cpuRound, setCpuRound] = useState(0);
  const [cpuStrokes, setCpuStrokes] = useState<Stroke[]>([]);
  const [options, setOptions] = useState<Bi[]>([]);
  const [answered, setAnswered] = useState<null | { ok: boolean; pts: number }>(null);
  const cpuData = useRef<{ pts: Array<Array<[number, number]>>; idx: number; k: number; start: number; doodle: number } | null>(null);
  const used = useRef<Set<number>>(new Set());

  const names = Array.from({ length: count }, (_, i) => (i === 0 ? n1 : i === 1 ? n2 : t('pName', { n: i + 1 })));
  const totalTurns = count * turnsEach;
  const CPU_ROUNDS = 8;

  useGameBar({ onPause: phase === 'draw' || phase === 'cpu' ? () => setPaused(true) : undefined, help: <Rules t={t} /> }, [phase, t.lang]);

  toolState.color = tool.eraser ? PAPER : tool.color;
  toolState.w = tool.eraser ? 9 : tool.w;

  const start = () => {
    setScores(Array(mode === 'party' ? count : 1).fill(0));
    setTurn(0);
    setDrawer(0);
    setCpuRound(0);
    used.current = new Set();
    setPaused(false);
    sfx('bell');
    if (mode === 'party') setPhase('pass');
    else nextCpu(0);
  };

  // ---- Party ----
  const showWords = () => {
    const pool = [...PARTY_WORDS];
    const pick: Bi[] = [];
    while (pick.length < 3) pick.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]);
    setChoices(pick);
    setPhase('pick');
  };
  const beginDraw = (w: Bi) => { setWord(w); setStrokes([]); setLeft(60); setPhase('draw'); sfx('whistle'); };

  useEffect(() => {
    if (phase !== 'draw' || paused) return;
    const id = window.setInterval(() => setLeft((l) => {
      if (l <= 1) { window.clearInterval(id); endTurn(null); return 0; }
      if (l <= 6) sfx('tick');
      return l - 1;
    }), 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, paused]);

  const endTurn = (guesser: number | null) => {
    if (guesser !== null) {
      const pts = 50 + left * 2;
      setScores((s) => s.map((v, i) => (i === guesser ? v + pts : i === drawer ? v + 40 + left : v)));
      sfx('fanfare');
      setRevealText(`${names[guesser]} +${t.n(pts)} · ${names[drawer]} +${t.n(40 + left)}`);
    } else {
      sfx('bad');
      setRevealText(t('timeUp'));
    }
    setPhase('reveal');
  };

  const nextTurn = () => {
    const nt = turn + 1;
    if (nt >= totalTurns) return finishParty();
    setTurn(nt);
    setDrawer(nt % count);
    setPhase('pass');
  };

  const finishParty = () => {
    setPhase('result');
    recordResult('notebook-drawing', { outcome: 'none' }, () => ['nd-party']);
  };

  // ---- Computer draws ----
  const nextCpu = (r: number) => {
    if (r >= CPU_ROUNDS) {
      const final = scoresRef.current[0] ?? 0;
      recordResult('notebook-drawing', { outcome: 'none', score: final }, () => (final >= 600 ? ['nd-eagle-eye'] : []));
      setPhase('result');
      return;
    }
    let di = rng.int(0, DOODLES.length - 1);
    for (let k = 0; k < 30 && used.current.has(di); k++) di = rng.int(0, DOODLES.length - 1);
    used.current.add(di);
    const d = DOODLES[di];
    const others = DOODLES.filter((_, i) => i !== di).map((x) => x.word);
    const opts = [d.word];
    while (opts.length < 4) { const w = others.splice(rng.int(0, others.length - 1), 1)[0]; opts.push(w); }
    opts.sort(() => rng.next() - 0.5);
    cpuData.current = { pts: d.strokes.map(sample), idx: 0, k: 0, start: performance.now(), doodle: di };
    setOptions(opts);
    setCpuStrokes([]);
    setAnswered(null);
    setCpuRound(r);
    setPhase('cpu');
  };

  useEffect(() => {
    if (phase !== 'cpu' || paused || answered) return;
    const id = window.setInterval(() => {
      const c = cpuData.current;
      if (!c) return;
      // Draw about 7 points per tick, stroke by stroke.
      for (let n = 0; n < 7 && c.idx < c.pts.length; n++) {
        c.k++;
        if (c.k >= c.pts[c.idx].length) { c.idx++; c.k = 0; }
      }
      const done = c.pts.slice(0, c.idx).map((p) => ({ color: COLORS[0], w: 2.4, pts: p }));
      if (c.idx < c.pts.length) done.push({ color: COLORS[0], w: 2.4, pts: c.pts[c.idx].slice(0, c.k + 1) });
      setCpuStrokes(done);
      if (c.idx >= c.pts.length && performance.now() - c.start > 15000) answer(null);
    }, 60);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, paused, answered]);

  const answer = (w: Bi | null) => {
    const c = cpuData.current;
    if (!c || answered) return;
    const correct = DOODLES[c.doodle].word;
    const total = c.pts.reduce((a, p) => a + p.length, 0);
    const doneFrac = Math.min(1, (c.pts.slice(0, c.idx).reduce((a, p) => a + p.length, 0) + c.k) / total);
    const ok = w !== null && w.en === correct.en;
    const pts = ok ? Math.round(50 + (1 - doneFrac) * 100) : 0;
    if (ok) { scoresRef.current = [(scoresRef.current[0] ?? 0) + pts]; setScores(scoresRef.current); sfx('good'); } else sfx('bad');
    setAnswered({ ok, pts });
    setCpuStrokes(c.pts.map((p) => ({ color: COLORS[0], w: 2.4, pts: p })));
    window.setTimeout(() => nextCpu(cpuRoundRef.current + 1), 1600);
  };
  const cpuRoundRef = useRef(0);
  cpuRoundRef.current = cpuRound;
  const scoresRef = useRef<number[]>([]);
  scoresRef.current = scores;

  // ---------- Render ----------
  if (phase === 'setup') {
    return (
      <div className="nd-root">
        <Overlay label={t('title')}>
          <div className="sheet ruled" data-testid="setup">
            <h2>{t('title')}</h2>
            <p className="lede">{t('lede')}</p>
            <Rules t={t} />
            <div className="opt-label">{t('mode')}</div>
            <Seg label={t('mode')} value={mode} onChange={setMode} options={[{ v: 'party', label: t('party') }, { v: 'cpu', label: t('cpu') }]} />
            {mode === 'party' && (
              <>
                <div className="opt-label">{t('players')}</div>
                <Seg label={t('players')} value={count} onChange={setCount} options={[2, 3, 4].map((v) => ({ v, label: t.n(v) }))} />
                <div className="opt-label">{t('rounds')}</div>
                <Seg label={t('rounds')} value={turnsEach} onChange={setTurnsEach} options={[1, 2].map((v) => ({ v, label: t.n(v) }))} />
              </>
            )}
            <div className="actions"><button className="btn big" onClick={start} data-testid="start">{u('start')}</button></div>
          </div>
        </Overlay>
      </div>
    );
  }

  const board = (
    <div className="nd-board">
      {scores.map((s, i) => <span key={i} className={`nd-chip ${mode === 'party' && i === drawer ? 'drawer' : ''}`}>{mode === 'party' ? names[i] : u('you')} <b>{t.n(s)}</b></span>)}
    </div>
  );

  if (phase === 'result') {
    const best = Math.max(...scores);
    const winners = scores.map((s, i) => (s === best ? i : -1)).filter((i) => i >= 0);
    return (
      <div className="nd-root">
        <ReportCard
          outcome={mode === 'cpu' ? 'none' : winners.length > 1 ? 'tie' : 'none'}
          title={mode === 'cpu' ? `${t('score')}: ${t.n(scores[0])}` : winners.length > 1 ? t('tie') : t('winner', { name: names[winners[0]] })}
          rows={scores.map((s, i) => [mode === 'party' ? names[i] : u('you'), s] as [string, number])}
          onAgain={start}
          onSetup={() => setPhase('setup')}
          onQuit={onExit}
        />
      </div>
    );
  }

  return (
    <div className="nd-root playing">
      {board}
      {phase === 'cpu' && (
        <div className="nd-play">
          <div className="nd-status">{t('round', { n: cpuRound + 1, m: CPU_ROUNDS })} · {answered ? (answered.ok ? t('right', { n: answered.pts }) : `${t('wrong')} ${t('was', { w: t.bi(DOODLES[cpuData.current!.doodle].word) })}`) : t('cpuDraws')}</div>
          <Khata strokes={cpuStrokes} enabled={false} />
          <div className="nd-options">
            {options.map((o) => (
              <button key={o.en} className={`btn secondary ${answered && o.en === DOODLES[cpuData.current!.doodle].word.en ? 'ok' : ''}`} disabled={!!answered} onClick={() => answer(o)} data-testid="option">{t.bi(o)}</button>
            ))}
          </div>
        </div>
      )}
      {phase === 'draw' && word && (
        <div className="nd-play">
          <div className="nd-status">{t('drawing', { name: names[drawer] })} · <b className={left <= 10 ? 'hot' : ''}>{t.n(left)}</b> · <span className="nd-secret">{t.bi(word)}</span></div>
          <Khata strokes={strokes} enabled={!paused} onStroke={(s) => setStrokes((l) => [...l, s])} />
          <div className="nd-tools">
            {COLORS.map((c) => <button key={c} className={`nd-color ${!tool.eraser && tool.color === c ? 'on' : ''}`} style={{ background: c }} aria-label={c} onClick={() => setTool({ ...tool, color: c, eraser: false })} />)}
            <button className={`btn secondary ${tool.eraser ? 'on' : ''}`} onClick={() => setTool({ ...tool, eraser: !tool.eraser })}>{t('eraser')}</button>
            <button className="btn secondary" onClick={() => setStrokes((l) => l.slice(0, -1))}>{t('undo')}</button>
            <button className="btn secondary" onClick={() => setStrokes([])}>{t('clear')}</button>
          </div>
          <div className="nd-who">
            <span>{t('whoGot')}</span>
            {names.map((n, i) => (i === drawer ? null : <button key={i} className="btn" onClick={() => endTurn(i)} data-testid={`got-${i}`}>{n}</button>))}
            <button className="btn red" onClick={() => endTurn(null)}>{t('nobody')}</button>
          </div>
        </div>
      )}
      {phase === 'pass' && (
        <Overlay label={t('passTo', { name: names[drawer] })}>
          <div className="sheet ruled">
            <h2>{t('passTo', { name: names[drawer] })}</h2>
            <p className="lede">{t('eyes')}</p>
            <div className="actions"><button className="btn big" onClick={showWords} data-testid="show-words">{t('showWords')}</button></div>
          </div>
        </Overlay>
      )}
      {phase === 'pick' && (
        <Overlay label={t('pick')}>
          <div className="sheet ruled">
            <h2>{t('pick')}</h2>
            <div className="actions">{choices.map((w) => <button key={w.en} className="btn big secondary" onClick={() => beginDraw(w)} data-testid="word">{t.bi(w)}</button>)}</div>
          </div>
        </Overlay>
      )}
      {phase === 'reveal' && word && (
        <Overlay label={t('was', { w: t.bi(word) })}>
          <div className="sheet ruled">
            <h2>{t('was', { w: t.bi(word) })}</h2>
            <p className="lede">{revealText}</p>
            <div className="actions"><button className="btn big" onClick={nextTurn} data-testid="next">{t('next')}</button></div>
          </div>
        </Overlay>
      )}
      {paused && <PauseMenu onResume={() => setPaused(false)} onRestart={start} onQuit={onExit} help={<Rules t={t} />} />}
    </div>
  );
}

function Rules({ t }: { t: ReturnType<typeof useT<'r1' | 'r2' | 'r3' | 'r4'>> }) {
  return <ol><li>{t('r1')}</li><li>{t('r2')}</li><li><b>{t('r3')}</b></li><li>{t('r4')}</li></ol>;
}
