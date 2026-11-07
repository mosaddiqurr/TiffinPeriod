import { useCallback, useEffect, useRef, useState } from 'react';
import { StartHub, useStdModes } from '../../components/StartHub';
import type { GameProps } from '../../platform/registry';
import { useT } from '../../platform/i18n';
import { UI } from '../../platform/strings';
import { recordResult, type Outcome } from '../../platform/scores';
import { sfx, unlockAudio } from '../../platform/audio';
import { readJSON, writeJSON } from '../../platform/storage';
import { DifficultySeg, Overlay, PauseMenu, ReportCard, Seg, useGameBar, usePlayerNames, type Difficulty, type Mode } from '../../components/ui';
import { KIT } from './desk3d';
import { PenFightGame, powerColor, type PFEnd, type PFHud } from './game';
import type { PenId } from './model';
import { PenArt, PenPick, S } from './parts';
import { OnlinePenFight } from './online';
import { useOnlineEntry } from '../../components/online/OnlineButton';
import './pen-fight.css';

// Pen Fight in 3D: two school pens on an old wooden bench. Touch your pen, pull back, let go.
// Knock the other pen off the desk; if yours falls, the point goes to the other side.

export default function PenFight({ onExit }: GameProps) {
  const online = useOnlineEntry();
  if (online.open) return <div className="sport-root ruled"><OnlinePenFight onBack={online.close} code={online.code} /></div>;
  return <PenFightLocal onExit={onExit} onOnline={online.show} />;
}

function PenFightLocal({ onExit, onOnline }: GameProps & { onOnline: () => void }) {
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

  const stdModes = useStdModes(['ai', 'local2p']);
  useGameBar({ onPause: matchId > 0 && !done ? () => setPaused(true) : undefined, help }, [matchId, !!done, t.lang]);

  if (matchId === 0) {
    const pick = (side: 0 | 1, label: string) => (
      <PenPick label={label} cap={KIT[side].cap} value={pens[side]} testId={(id) => `pen-${side}-${id}`}
        onChange={(id) => { const p: [PenId, PenId] = [...pens]; p[side] = id; setPens(p); }} />
    );
    return (
      <div className="pf-root">
        <Overlay label={t('title')}>
          <StartHub
            gameId="pen-fight" title={t('title')} lede={t('lede')} rules={<ol>{rules.map((r, i) => <li key={i}>{i === 0 ? <b>{r}</b> : r}</li>)}</ol>}
            online={{ onClick: onOnline }}
            modes={stdModes} mode={mode} onMode={(m) => setMode(m as Mode)}
            onStart={start}
            options={<>
            {mode === 'ai' && <DifficultySeg value={diff} onChange={setDiff} />}
            {pick(0, mode === 'ai' ? t('yourPen') : t('p2Pen', { name: n1 }))}
            {pick(1, mode === 'ai' ? t('oppPen') : t('p2Pen', { name: n2 }))}
            <div className="opt-label">{t('target')}</div>
            <Seg label={t('target')} value={target} onChange={setTarget} options={[3, 5].map((v) => ({ v, label: t('pts', { n: v }) }))} />
            <p className="hide-touch" style={{ margin: '10px 0 0', fontSize: 14, color: 'var(--ink-soft)' }}>{t('keys')}</p>
            </>}
          />
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
