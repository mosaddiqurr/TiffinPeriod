import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GameProps } from '../../platform/registry';
import { useT } from '../../platform/i18n';
import { UI } from '../../platform/strings';
import { sfx, speak, vibrate } from '../../platform/audio';
import { recordResult } from '../../platform/scores';
import { createRng } from '../../engine/rng';
import { capturePointer } from '../../engine/timing';
import { DifficultySeg, ModeSeg, Overlay, PauseMenu, ReportCard, Seg, useGameBar, usePlayerNames, type Difficulty, type Mode } from '../../components/ui';
import { ITEMS, artFor } from './items';
import { PakhirEngine, type InputStyle } from './engine';
import { Finger, Rules, S } from './parts';
import { OnlinePakhirUre } from './online';
import { OnlineButton, useOnlineEntry } from '../../components/online/OnlineButton';
import './pakhir-ure.css';

const KEYS: string[][] = [['Space', 'KeyA'], ['KeyL']];

export default function PakhirUre({ onExit }: GameProps) {
  const online = useOnlineEntry();
  if (online.open) return <div className="sport-root ruled"><OnlinePakhirUre onBack={online.close} code={online.code} /></div>;
  return <PakhirUreLocal onExit={onExit} onOnline={online.show} />;
}

function PakhirUreLocal({ onExit, onOnline }: GameProps & { onOnline: () => void }) {
  const t = useT(S);
  const u = useT(UI);
  const [n1, n2] = usePlayerNames();
  const [mode, setMode] = useState<Mode>('solo');
  const [diff, setDiff] = useState<Difficulty>('medium');
  const [input, setInput] = useState<InputStyle>('lift');
  const [phase, setPhase] = useState<'setup' | 'play' | 'result'>('setup');
  const [paused, setPaused] = useState(false);
  const [, setVersion] = useState(0);
  const [flashKey, setFlashKey] = useState(0);
  const [result, setResult] = useState<{ newBest: boolean } | null>(null);
  const engine = useRef<PakhirEngine | null>(null);
  const rng = useMemo(() => createRng(), []);
  const clockOffset = useRef(0);
  const pausedAt = useRef(0);
  const now = () => performance.now() - clockOffset.current;

  const names: string[] = mode === 'solo' ? [u('you')] : mode === 'ai' ? [u('you'), t('aiName')] : [n1, n2];

  const start = useCallback(() => {
    engine.current = new PakhirEngine({
      players: mode === 'solo' ? [{ ai: false }] : mode === 'ai' ? [{ ai: false }, { ai: true }] : [{ ai: false }, { ai: false }],
      input,
      lives: mode === 'solo' ? 3 : null,
      calls: mode === 'solo' ? null : 20,
      aiDifficulty: diff,
    }, ITEMS, rng);
    setResult(null);
    setPaused(false);
    setPhase('play');
    sfx('bell');
  }, [mode, input, diff, rng]);

  useGameBar({ onPause: phase === 'play' ? () => setPaused(true) : undefined, help: <Rules t={t} /> }, [phase, t.lang]);

  // Pause: freeze the engine clock and cancel the call in progress.
  useEffect(() => {
    const e = engine.current;
    if (!e) return;
    if (paused) pausedAt.current = performance.now();
    else if (pausedAt.current) {
      clockOffset.current += performance.now() - pausedAt.current;
      pausedAt.current = 0;
      if (e.phase === 'gap' || e.phase === 'call') {
        e.phase = 'ready';
        e.item = null;
        e.players.forEach((p) => { p.judged = false; p.early = false; p.feedback = null; if (p.ai || input === 'tap') p.holding = true; });
        e.version++;
      }
    }
  }, [paused, input]);

  // Main loop: tick the engine, react to its events.
  useEffect(() => {
    if (phase !== 'play') return;
    let raf = 0;
    let lastV = -1;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const e = engine.current;
      if (!e || paused) return;
      e.tick(now());
      for (const ev of e.takeEvents()) {
        if (ev.type === 'call' && e.item) {
          sfx('tick');
          speak(`${e.item.name.bn} উড়ে`, `${e.item.name.en} flies`);
        }
        if (ev.type === 'correct' && ev.player !== undefined && !e.players[ev.player].ai) { sfx(e.item?.flies ? 'flap' : 'good'); if (e.item?.flies) sfx('good', { gain: 0.6 }); }
        if (ev.type === 'wrong' && ev.player !== undefined && !e.players[ev.player].ai) { sfx('bad'); vibrate(60); }
        if (ev.type === 'call') setFlashKey((k) => k + 1);
        if (ev.type === 'over') finish(e);
      }
      if (e.version !== lastV) { lastV = e.version; setVersion(e.version); }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, paused]);

  const finish = (e: PakhirEngine) => {
    const me = e.players[0];
    const fastest = me.rts.length ? Math.round(Math.min(...me.rts)) : undefined;
    let outcome: 'win' | 'loss' | 'tie' | 'none' = 'none';
    if (mode === 'ai') outcome = me.score > e.players[1].score ? 'win' : me.score < e.players[1].score ? 'loss' : 'tie';
    const res = recordResult('pakhir-ure', {
      outcome,
      score: mode === 'solo' ? me.score : undefined,
      records: fastest !== undefined ? { fastestMs: fastest } : {},
    }, () => {
      const ids: string[] = [];
      if (e.players.some((p) => !p.ai && p.bestStreak >= 20)) ids.push('pu-streak20');
      if (e.players.some((p) => !p.ai && p.rts.some((r) => r < 350))) ids.push('pu-fast');
      return ids;
    });
    setResult({ newBest: mode === 'solo' && res.newBest });
    setPhase('result');
  };

  // Keyboard: hold and lift keys.
  useEffect(() => {
    if (phase !== 'play') return;
    const idx = (code: string) => (mode === 'local2p' ? (code === 'KeyA' || code === 'Space' ? 0 : code === 'KeyL' ? 1 : -1) : KEYS[0].includes(code) ? 0 : -1);
    const kd = (ev: KeyboardEvent) => {
      const i = idx(ev.code);
      if (i < 0 || ev.repeat || paused) return;
      ev.preventDefault();
      engine.current?.press(i, now());
    };
    const ku = (ev: KeyboardEvent) => {
      const i = idx(ev.code);
      if (i < 0 || paused) return;
      ev.preventDefault();
      engine.current?.release(i, now());
    };
    addEventListener('keydown', kd);
    addEventListener('keyup', ku);
    return () => { removeEventListener('keydown', kd); removeEventListener('keyup', ku); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, mode, paused]);

  if (phase === 'setup') {
    return (
      <div className="pu-root">
        <Overlay label={t('title')}>
          <div className="sheet ruled" data-testid="setup">
            <h2>{t('title')}</h2>
            <p className="lede">{t('lede')}</p>
            <Rules t={t} />
            <OnlineButton onClick={onOnline} />
            <ModeSeg value={mode} onChange={setMode} modes={['solo', 'ai', 'local2p']} />
            {mode === 'ai' && <DifficultySeg value={diff} onChange={setDiff} />}
            <div className="opt-label">{t('input')}</div>
            <Seg label={t('input')} value={input} onChange={setInput} options={[{ v: 'lift', label: t('lift') }, { v: 'tap', label: t('tap') }]} />
            <p style={{ margin: '6px 0 0', color: 'var(--ink-soft)', fontSize: 14 }}>{input === 'lift' ? t('liftHelp') : t('tapHelp')}</p>
            <div className="actions"><button className="btn big" onClick={start} data-testid="start">{u('start')}</button></div>
          </div>
        </Overlay>
      </div>
    );
  }

  const e = engine.current!;
  const it = e.item;
  const showCall = (e.phase === 'call' || e.phase === 'reveal') && it;
  const humanIdx = e.players.map((p, i) => (p.ai ? -1 : i)).filter((i) => i >= 0);
  const needDown = input === 'lift' && e.phase === 'ready' && humanIdx.some((i) => !e.players[i].holding);
  const fbText = (i: number) => {
    const fb = e.players[i].feedback;
    if (!fb) return null;
    const label = { lifted: t('ok'), held: t('held'), missed: t('missed'), fooled: t('fooled'), early: t('early') }[fb.reason];
    return (
      <span className={`pu-fb ${fb.ok ? 'ok' : 'bad'}`}>
        {label}{fb.rt !== undefined && fb.ok ? ` ${t('ms', { n: Math.round(fb.rt) })}` : ''}{fb.points ? ` +${t.n(fb.points)}` : ''}
      </span>
    );
  };

  return (
    <div className={`pu-root playing n${e.players.length}`}>
      <div className="pu-board hud-chalk">
        <div className="pu-meta">
          <span>{t('level', { n: e.level })}</span>
          {e.cfg.calls !== null && <span>{t('calls', { n: Math.min(e.callIndex + (e.phase === 'call' ? 1 : 0), e.cfg.calls), m: e.cfg.calls })}</span>}
        </div>
        <div className="pu-call" aria-live="assertive" data-testid="call">
          {showCall ? (
            <div className="pu-bubble" key={flashKey}>
              {artFor(it.id) && <img src={artFor(it.id)} alt="" className="pu-art" draggable={false} />}
              <div>
                <div className="pu-name">{t.lang === 'bn' ? `${it.name.bn} উড়ে!` : `${it.name.en} ure!`}</div>
                <div className="pu-name-sub">{t.lang === 'bn' ? it.name.en : `${it.name.bn} উড়ে`}</div>
              </div>
            </div>
          ) : (
            <div className="pu-wait">{needDown ? t('putDown') : t('getReady')}</div>
          )}
          {e.phase === 'call' && <div className="pu-timer"><span style={{ animationDuration: `${e.windowMs}ms` }} key={flashKey} /></div>}
          {e.phase === 'reveal' && it && (
            <div className={`pu-answer ${it.flies ? 'yes' : 'no'}`}>
              {it.flies ? t('flies') : t('noFly')}{it.note ? ` — ${t.bi(it.note)}` : ''}
            </div>
          )}
        </div>
      </div>

      <div className="pu-pads">
        {e.players.map((p, i) => (
          <div key={i} className={`pu-player ${p.ai ? 'ai' : ''}`}>
            <div className="pu-stat">
              <b>{names[i]}</b>
              <span className="pts" data-testid={`score-${i}`}>{t.n(p.score)}</span>
              {e.cfg.lives !== null && !p.ai && <span className="lives" aria-label={`${t('lives')} ${p.lives}`}>{'●'.repeat(p.lives)}<span className="lost">{'●'.repeat(Math.max(0, 3 - p.lives))}</span></span>}
              {p.streak >= 3 && <span className="streak">×{t.n(p.streak)}</span>}
            </div>
            <div className="pu-fb-wrap">{fbText(i)}</div>
            {p.ai ? (
              <div className={`pu-pad ai ${p.holding ? 'down' : 'up'}`}><Finger up={!p.holding} /></div>
            ) : (
              <button
                className={`pu-pad ${input} ${p.holding ? 'down' : 'up'}`}
                data-testid={`pad-${i}`}
                onPointerDown={(ev) => { ev.preventDefault(); capturePointer(ev); if (!paused) e.press(i, now()); }}
                onPointerUp={() => { if (!paused) e.release(i, now()); }}
                onPointerCancel={() => { if (!paused) e.release(i, now()); }}
                onContextMenu={(ev) => ev.preventDefault()}
              >
                <Finger up={input === 'lift' ? !p.holding : false} />
                <span className="pu-pad-label">{input === 'lift' ? t('padLift') : t('padTap')}</span>
                <span className="key-hint hide-touch">{mode === 'local2p' ? (i === 0 ? 'A' : 'L') : 'Space'}</span>
              </button>
            )}
          </div>
        ))}
      </div>

      {paused && <PauseMenu onResume={() => setPaused(false)} onRestart={start} onQuit={onExit} help={<Rules t={t} />} />}
      {phase === 'result' && (
        <ReportCard
          outcome={mode === 'ai' ? (e.players[0].score > e.players[1].score ? 'win' : e.players[0].score < e.players[1].score ? 'loss' : 'tie') : mode === 'local2p' && e.players[0].score === e.players[1].score ? 'tie' : 'none'}
          title={mode === 'solo' ? t('over') : e.players[0].score === e.players[1].score ? t('draw') : t('won', { name: names[e.players[0].score > e.players[1].score ? 0 : 1] })}
          rows={e.players.flatMap((p, i) => {
            const prefix = e.players.length > 1 ? `${names[i]} — ` : '';
            const rows: Array<[string, string | number]> = [[prefix + t('score'), p.score], [prefix + t('correct'), `${t.n(p.correct)}/${t.n(p.correct + p.wrong)}`], [prefix + t('streak'), p.bestStreak]];
            if (!p.ai && p.rts.length) {
              rows.push([prefix + t('fastest'), t('ms', { n: Math.round(Math.min(...p.rts)) })]);
              rows.push([prefix + t('average'), t('ms', { n: Math.round(p.rts.reduce((a, b) => a + b, 0) / p.rts.length) })]);
            }
            return rows;
          })}
          newBest={result?.newBest}
          onAgain={start}
          onSetup={() => setPhase('setup')}
          onQuit={onExit}
        />
      )}
    </div>
  );
}
