import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameProps } from '../../platform/registry';
import { useT, type StringTable } from '../../platform/i18n';
import { UI } from '../../platform/strings';
import { recordResult, type Outcome } from '../../platform/scores';
import { sfx, unlockAudio } from '../../platform/audio';
import { readJSON, writeJSON } from '../../platform/storage';
import { DifficultySeg, ModeSeg, Overlay, PauseMenu, ReportCard, Seg, useGameBar, usePlayerNames, type Difficulty, type Mode } from '../../components/ui';
import { KIT } from './desk3d';
import { PenFightGame, powerColor, type PFEnd, type PFHud } from './game';
import type { PenId } from './model';
import './pen-fight.css';

// Pen Fight in 3D: two school pens on an old wooden bench. Touch your pen, pull back, let go.
// Knock the other pen off the desk; if yours falls, the point goes to the other side.

type K =
  | 'title' | 'lede' | 'r1' | 'r2' | 'r3' | 'r4' | 'r5' | 'keys' | 'target' | 'pts' | 'yourPen' | 'oppPen' | 'p2Pen'
  | 'classic' | 'classicSub' | 'gel' | 'gelSub' | 'speed' | 'weight' | 'grip'
  | 'turn' | 'yourTurn' | 'thinking' | 'touch' | 'power' | 'point' | 'selfOut' | 'won' | 'score' | 'flicks' | 'selfOuts' | 'noGl' | 'round';

const S: StringTable<K> = {
  en: {
    title: 'Pen Fight', lede: 'Two pens on the last bench. One flick each. Knock theirs off, keep yours on.',
    r1: 'On your turn, touch YOUR pen (it glows), pull back and let go. The pen shoots the opposite way.',
    r2: 'Pull further for more power. The band, the arrow and the number by your finger show how hard.',
    r3: 'Flick the middle of the pen to push it straight. Flick near an end to spin it.',
    r4: 'A pen falls when its middle goes past the edge, so a pen hanging over the edge is still in.',
    r5: 'Knock the other pen off and the point is yours. If your own pen falls, the point goes to the other side.',
    keys: 'Keys: ← → aim · ↑ ↓ where you touch the pen · hold Space for power, let go to flick',
    target: 'Points to win', pts: '{n} points', yourPen: 'Your pen', oppPen: 'Computer’s pen', p2Pen: '{name}’s pen',
    classic: 'Classic ballpoint', classicSub: 'The white six-sided school pen. Light and quick: long shots, but easy to send off yourself.',
    gel: 'Gel pen', gelSub: 'Clear barrel, rubber grip. Heavy: slides less, hits harder, grips the desk.',
    speed: 'Speed', weight: 'Weight', grip: 'Grip',
    turn: '{name}: your turn', yourTurn: 'Your turn', thinking: 'Computer is aiming…', touch: 'Touch your pen · pull back · let go',
    power: 'Power', point: 'Point to {name}!', selfOut: '{name}’s own pen fell!', won: '{name} wins the pen fight!',
    score: 'Score', flicks: 'Flicks', selfOuts: 'Own pen fell', noGl: 'This game needs 3D graphics (WebGL). Please try another browser or turn on hardware acceleration.', round: 'Round {n}',
  },
  bn: {
    title: 'কলম যুদ্ধ', lede: 'শেষ বেঞ্চে দুটো কলম। পালা করে টোকা। ওরটা ফেলো, নিজেরটা রাখো।',
    r1: 'তোমার পালায় নিজের কলমে (যেটা জ্বলছে) আঙুল রাখো, পেছনে টেনে ছেড়ে দাও। কলম উল্টো দিকে ছুটবে।',
    r2: 'যত বেশি টানবে তত জোর। টানার ফিতা, তীর আর আঙুলের পাশের সংখ্যা জোর দেখায়।',
    r3: 'কলমের মাঝখানে টোকা দিলে সোজা যাবে। মাথার দিকে দিলে ঘুরবে।',
    r4: 'কলমের মাঝখান বেঞ্চের কিনারা পার হলে তবেই পড়ে। কিনারায় ঝুলে থাকলে এখনো খেলায় আছে।',
    r5: 'অন্য কলম ফেলে দিলে পয়েন্ট তোমার। নিজের কলম পড়লে পয়েন্ট অন্যজনের।',
    keys: 'কী-বোর্ড: ← → দিক · ↑ ↓ কলমের কোথায় টোকা · স্পেস চেপে জোর, ছেড়ে দিলে টোকা',
    target: 'জিততে পয়েন্ট', pts: '{n} পয়েন্ট', yourPen: 'তোমার কলম', oppPen: 'কম্পিউটারের কলম', p2Pen: '{name}-এর কলম',
    classic: 'সাদা বলপেন', classicSub: 'স্কুলের চেনা ছয়-কোনা সাদা কলম। হালকা আর দ্রুত: দূরে যায়, কিন্তু নিজেই পড়ে যেতে পারে।',
    gel: 'জেল পেন', gelSub: 'স্বচ্ছ বডি, রাবার গ্রিপ। ভারী: কম পিছলায়, জোরে ধাক্কা দেয়, বেঞ্চ আঁকড়ে থাকে।',
    speed: 'গতি', weight: 'ওজন', grip: 'গ্রিপ',
    turn: '{name}-এর পালা', yourTurn: 'তোমার পালা', thinking: 'কম্পিউটার তাক করছে…', touch: 'কলমে আঙুল রাখো · পেছনে টানো · ছাড়ো',
    power: 'জোর', point: 'পয়েন্ট {name}-এর!', selfOut: '{name}-এর নিজের কলম পড়ে গেছে!', won: '{name} কলম যুদ্ধে জিতেছে!',
    score: 'পয়েন্ট', flicks: 'টোকা', selfOuts: 'নিজের কলম পড়েছে', noGl: 'এই খেলার জন্য ৩ডি গ্রাফিক্স (WebGL) লাগে। অন্য ব্রাউজারে চেষ্টা করো।', round: 'রাউন্ড {n}',
  },
};

const STATS: Record<PenId, [number, number, number]> = { classic: [5, 2, 2], gel: [3, 5, 4] };

export default function PenFight({ onExit }: GameProps) {
  const t = useT(S);
  const u = useT(UI);
  const [n1, n2] = usePlayerNames();
  const [mode, setMode] = useState<Mode>('ai');
  const [diff, setDiff] = useState<Difficulty>('medium');
  const [target, setTarget] = useState(3);
  const [pens, setPensState] = useState<[PenId, PenId]>(() => readJSON<[PenId, PenId]>('pf.pens', ['classic', 'gel']));
  const setPens = (p: [PenId, PenId]) => { setPensState(p); writeJSON('pf.pens', p); };
  const [matchId, setMatchId] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hud, setHud] = useState<PFHud | null>(null);
  const [done, setDone] = useState<{ e: PFEnd; outcome: Outcome } | null>(null);
  const [glError, setGlError] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<PenFightGame | null>(null);
  const names: [string, string] = mode === 'ai' ? [u('you'), u('computer')] : [n1, n2];
  const cfgRef = useRef({ mode, diff, target, pens, names });
  cfgRef.current = { mode, diff, target, pens, names };

  const rules = [t('r1'), t('r2'), t('r3'), t('r4'), t('r5')];
  const help = <><ol>{rules.map((r, i) => <li key={i}>{i === 0 ? <b>{r}</b> : r}</li>)}</ol><p className="hide-touch" style={{ fontSize: 14, color: 'var(--ink-soft)' }}>{t('keys')}</p></>;

  const start = useCallback(() => {
    unlockAudio();
    sfx('bell', { gain: 0.5 });
    setDone(null);
    setHud(null);
    setPaused(false);
    setGlError(false);
    setMatchId((m) => m + 1);
  }, []);

  useEffect(() => {
    if (matchId === 0 || !hostRef.current) return;
    const c = cfgRef.current;
    let g: PenFightGame;
    try {
      g = new PenFightGame(hostRef.current, { mode: c.mode === 'local2p' ? 'local2p' : 'ai', diff: c.diff, pens: c.pens, target: c.target }, {
        onHud: setHud,
        onHidden: () => setPaused(true),
        onOver: (e) => {
          const vsAI = c.mode === 'ai';
          const outcome: Outcome = vsAI ? (e.winner === 0 ? 'win' : 'loss') : 'none';
          recordResult('pen-fight', { outcome, score: vsAI ? e.scores[0] - e.scores[1] : undefined }, () => [
            ...(vsAI && e.winner === 0 ? ['pf-win'] : []),
            ...(vsAI && e.winner === 0 && c.diff === 'hard' ? ['pf-hard'] : []),
          ]);
          window.setTimeout(() => setDone({ e, outcome }), 600);
        },
      });
    } catch (err) {
      console.error('[pen-fight] WebGL failed', err);
      setGlError(true);
      return;
    }
    gameRef.current = g;
    (window as unknown as { __penFight?: PenFightGame }).__penFight = g;
    return () => {
      g.dispose();
      if (gameRef.current === g) gameRef.current = null;
      delete (window as unknown as { __penFight?: PenFightGame }).__penFight;
    };
  }, [matchId]);

  useEffect(() => { gameRef.current?.setPaused(paused || !!done); }, [paused, done]);

  useGameBar({ onPause: matchId > 0 && !done ? () => setPaused(true) : undefined, help }, [matchId, !!done, t.lang]);

  if (matchId === 0) {
    const pick = (side: 0 | 1, label: string) => (
      <>
        <div className="opt-label">{label}</div>
        <div className="pf-pens" role="radiogroup" aria-label={label}>
          {(['classic', 'gel'] as PenId[]).map((id) => (
            <button key={id} type="button" role="radio" aria-checked={pens[side] === id} className="pf-pen-opt" data-testid={`pen-${side}-${id}`}
              onClick={() => { if (pens[side] !== id) { sfx('click'); const p: [PenId, PenId] = [...pens]; p[side] = id; setPens(p); } }}>
              <PenArt id={id} cap={KIT[side].cap} />
              <b>{t(id)}</b>
              <small>{t(id === 'classic' ? 'classicSub' : 'gelSub')}</small>
              <span className="pf-stats">
                {(['speed', 'weight', 'grip'] as const).map((k, i) => (
                  <span key={k}><em>{t(k)}</em><i>{Array.from({ length: 5 }, (_, j) => <s key={j} className={j < STATS[id][i] ? 'on' : ''} />)}</i></span>
                ))}
              </span>
              {pens[side] === id && <span className="pf-check" aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
      </>
    );
    return (
      <div className="pf-root">
        <Overlay label={t('title')}>
          <div className="sheet ruled" data-testid="setup">
            <h2>{t('title')}</h2>
            <p className="lede">{t('lede')}</p>
            <ol>{rules.map((r, i) => <li key={i}>{i === 0 ? <b>{r}</b> : r}</li>)}</ol>
            <ModeSeg value={mode} onChange={setMode} modes={['ai', 'local2p']} />
            {mode === 'ai' && <DifficultySeg value={diff} onChange={setDiff} />}
            {pick(0, mode === 'ai' ? t('yourPen') : t('p2Pen', { name: n1 }))}
            {pick(1, mode === 'ai' ? t('oppPen') : t('p2Pen', { name: n2 }))}
            <div className="opt-label">{t('target')}</div>
            <Seg label={t('target')} value={target} onChange={setTarget} options={[3, 5].map((v) => ({ v, label: t('pts', { n: v }) }))} />
            <p className="hide-touch" style={{ margin: '10px 0 0', fontSize: 14, color: 'var(--ink-soft)' }}>{t('keys')}</p>
            <div className="actions"><button className="btn big" onClick={start} data-testid="start">{u('start')}</button></div>
          </div>
        </Overlay>
      </div>
    );
  }

  const h = hud;
  const myTurn = !!h && h.phase === 'aim' && !h.thinking;
  const pw = h?.drag?.power ?? 0;
  return (
    <div className="pf-root playing">
      <div className="pf-host" ref={hostRef} />
      {glError && <div className="pf-nogl">{t('noGl')}</div>}
      <div className="pf-hud" aria-live="polite">
        {[0, 1].map((i) => (
          <div key={i} className={`pf-chip ${h?.turn === i && h.phase === 'aim' ? 'on' : ''} ${i ? 'right' : ''}`} style={{ ['--cap' as string]: KIT[i].cap }} data-testid={`score-${i}`}>
            <PenArt id={cfgRef.current.pens[i]} cap={KIT[i].cap} small />
            <span className="pf-name">{names[i]}</span>
            <span className="pf-pips">{Array.from({ length: target }, (_, j) => <i key={j} className={j < (h?.scores[i] ?? 0) ? 'on' : ''} />)}</span>
            <b>{t.n(h?.scores[i] ?? 0)}</b>
          </div>
        ))}
      </div>
      {h && h.phase === 'aim' && (
        <div className={`pf-turn ${h.thinking ? 'ai' : ''}`} style={{ ['--cap' as string]: KIT[h.turn].cap }}>
          {h.thinking ? t('thinking') : mode === 'ai' ? t('yourTurn') : t('turn', { name: names[h.turn] })}
        </div>
      )}
      {myTurn && !h?.drag && <div className="pf-touch" data-testid="touch-hint"><span className="pf-hand" aria-hidden="true">👆</span>{t('touch')}</div>}
      {h?.drag && (
        <>
          {h.drag.x >= 0 && (
            <div className="pf-power-tag" style={{ left: h.drag.x, top: h.drag.y, ['--pc' as string]: powerColor(pw) }} data-testid="power-tag">
              <b>{t.n(Math.round(pw * 100))}%</b>
            </div>
          )}
          <div className="pf-power" data-testid="power-bar" style={{ ['--pc' as string]: powerColor(pw) }}>
            <span>{t('power')}</span>
            <div className="pf-power-track"><div className="pf-power-fill" style={{ width: `${Math.round(pw * 100)}%` }} /><i style={{ left: '40%' }} /><i style={{ left: '75%' }} /></div>
            <b>{t.n(Math.round(pw * 100))}%</b>
          </div>
        </>
      )}
      {h?.phase === 'point' && h.point !== null && (
        <div className="pf-banner" style={{ ['--cap' as string]: KIT[h.point].cap }}>
          {h.selfOut && <small>{t('selfOut', { name: names[1 - h.point] })}</small>}
          <b>{t('point', { name: names[h.point] })}</b>
        </div>
      )}
      {paused && !done && <PauseMenu onResume={() => setPaused(false)} onRestart={start} onQuit={onExit} help={help} />}
      {done && (
        <ReportCard
          outcome={done.outcome}
          title={t('won', { name: names[done.e.winner] })}
          rows={[
            [t('score'), `${t.n(done.e.scores[0])} — ${t.n(done.e.scores[1])}`],
            [`${names[0]} — ${t('flicks')}`, done.e.flicks[0]],
            [`${names[1]} — ${t('flicks')}`, done.e.flicks[1]],
            ...(done.e.selfOuts[0] || done.e.selfOuts[1] ? [[t('selfOuts'), `${t.n(done.e.selfOuts[0])} — ${t.n(done.e.selfOuts[1])}`] as [string, string]] : []),
          ]}
          onAgain={start}
          onSetup={() => { setMatchId(0); setDone(null); }}
          onQuit={onExit}
        />
      )}
    </div>
  );
}

/** A drawing of each pen for the setup sheet and the score chips. */
function PenArt({ id, cap, small }: { id: PenId; cap: string; small?: boolean }) {
  return (
    <svg viewBox="0 0 120 22" className={small ? 'pf-art small' : 'pf-art'} aria-hidden="true">
      <defs>
        <linearGradient id={`pfw-${id}-${cap}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset="0.55" stopColor="#ebebe4" /><stop offset="1" stopColor="#c8c8bf" /></linearGradient>
        <linearGradient id={`pfc-${id}-${cap}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff" stopOpacity="0.5" /><stop offset="0.4" stopColor={cap} /><stop offset="1" stopColor={cap} /></linearGradient>
      </defs>
      {id === 'classic' ? <>
        <rect x="4" y="6" width="80" height="10" rx="1.5" fill={`url(#pfw-${id}-${cap})`} stroke="#b9b9b0" strokeWidth="0.6" />
        <path d="M6 11 H82" stroke="#d2d2ca" strokeWidth="0.8" />
        <rect x="2" y="7" width="4" height="8" rx="1" fill={cap} />
        <rect x="80" y="5" width="36" height="12" rx="5" fill={`url(#pfc-${id}-${cap})`} />
        <rect x="84" y="2.5" width="26" height="3" rx="1.5" fill={cap} />
      </> : <>
        <rect x="4" y="5.5" width="70" height="11" rx="4" fill="#dfe6ee" fillOpacity="0.7" stroke="#9aa6b2" strokeWidth="0.6" />
        <rect x="8" y="9.5" width="70" height="3" rx="1.5" fill={cap} opacity="0.8" />
        <rect x="58" y="5" width="22" height="12" rx="3" fill="#1d1f23" />
        {[61, 64, 67, 70, 73, 76].map((x) => <path key={x} d={`M${x} 5 V17`} stroke="#3a3d43" strokeWidth="1" />)}
        <rect x="80" y="4.5" width="36" height="13" rx="5.5" fill={`url(#pfc-${id}-${cap})`} />
        <rect x="84" y="2" width="26" height="3" rx="1.5" fill="#dfe3e8" />
        <rect x="2" y="7" width="4" height="8" rx="1.5" fill={cap} />
      </>}
    </svg>
  );
}
