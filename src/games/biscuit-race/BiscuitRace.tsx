import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GameProps } from '../../platform/registry';
import { useT, type StringTable } from '../../platform/i18n';
import { UI } from '../../platform/strings';
import { useSettings } from '../../platform/settings';
import { sfx, vibrate } from '../../platform/audio';
import { recordResult } from '../../platform/scores';
import { createRng } from '../../engine/rng';
import { GameCanvas } from '../../engine/GameCanvas';
import { DifficultySeg, ModeSeg, Overlay, PauseMenu, ReportCard, useGameBar, usePlayerNames, type Difficulty, type Mode } from '../../components/ui';
import { BiscuitScene } from './BiscuitScene';
import type { Controls } from './model';
import './biscuit-race.css';

const S: StringTable<
  | 'title' | 'lede' | 'r1' | 'r2' | 'r3' | 'r4' | 'left' | 'right' | 'jump' | 'bump' | 'nom' | 'first' | 'ready'
  | 'won' | 'time' | 'jumps' | 'bumps' | 'dnf' | 'secs' | 'aiName' | 'diffHelp'
> = {
  en: {
    title: 'Biscuit Race', lede: 'Sports day classic. Hands behind your back. The biscuit swings in the wind.',
    r1: 'Run to the bamboo frame. Your hands stay behind your back.',
    r2: 'Stand under the swinging biscuit and JUMP. Bite it with your mouth.',
    r3: 'Hit it off-centre and it swings away. Watch the swing and time your jump.',
    r4: 'You cannot pass the frame without the biscuit. Then run to the finish!',
    left: 'Back', right: 'Run', jump: 'Jump', bump: 'Thok!', nom: 'Got it!', first: 'First!', ready: 'Hands behind your back!',
    won: '{name} wins the biscuit race!', time: 'Time — {name}', jumps: 'Jumps — {name}', bumps: 'Bumps — {name}', dnf: 'Did not finish', secs: '{n} s',
    aiName: 'Computer', diffHelp: 'Harder levels have more wind and a smaller bite zone.',
  },
  bn: {
    title: 'বিস্কুট দৌড়', lede: 'বার্ষিক ক্রীড়ার সেরা মজা। হাত পিছনে। বাতাসে বিস্কুট দোলে।',
    r1: 'দৌড়ে বাঁশের কাছে যাও। হাত সবসময় পিছনে থাকবে।',
    r2: 'দোলানো বিস্কুটের নিচে দাঁড়িয়ে লাফ দাও। মুখ দিয়ে কামড়ে ধরো।',
    r3: 'পাশে লাগলে বিস্কুট দূরে সরে যাবে। দোলা দেখে লাফ দাও।',
    r4: 'বিস্কুট ছাড়া বাঁশ পার হওয়া যাবে না। তারপর দৌড়ে শেষ দাগ!',
    left: 'পিছে', right: 'দৌড়', jump: 'লাফ', bump: 'ঠক!', nom: 'কপাৎ!', first: 'প্রথম!', ready: 'হাত পিছনে রাখো!',
    won: '{name} বিস্কুট দৌড়ে প্রথম!', time: 'সময় — {name}', jumps: 'লাফ — {name}', bumps: 'ফসকেছে — {name}', dnf: 'শেষ করতে পারেনি', secs: '{n} সেকেন্ড',
    aiName: 'কম্পিউটার', diffHelp: 'কঠিন হলে বাতাস বেশি, আর কামড়ের জায়গা ছোট।',
  },
};

// Lane 1 (bottom) = Player 1. Lane 0 (top) = computer or Player 2.
const KEYMAP: Record<string, [number, keyof Controls]> = {
  KeyA: [1, 'left'], KeyD: [1, 'right'], KeyW: [1, 'jump'], Space: [1, 'jump'],
  ArrowLeft: [0, 'left'], ArrowRight: [0, 'right'], ArrowUp: [0, 'jump'],
};

export default function BiscuitRace({ onExit }: GameProps) {
  const t = useT(S);
  const u = useT(UI);
  const st = useSettings();
  const [n1, n2] = usePlayerNames();
  const [mode, setMode] = useState<Mode>('ai');
  const [diff, setDiff] = useState<Difficulty>('easy');
  const [phase, setPhase] = useState<'setup' | 'play' | 'result'>('setup');
  const [paused, setPaused] = useState(false);
  const [scene, setScene] = useState<BiscuitScene | null>(null);
  const [res, setRes] = useState<{ times: Array<number | null>; jumps: number[]; bumps: number[]; winner: number | null; newBest: boolean } | null>(null);
  const rng = useMemo(() => createRng(), []);
  const vsAI = mode === 'ai';
  const names = vsAI ? [t('aiName'), u('you')] : [n2, n1]; // index = lane
  const endTimer = useRef<number | null>(null);

  const start = useCallback(() => {
    const sc = new BiscuitScene(2, diff, rng, vsAI ? 0 : null, {
      bump: t('bump'), nom: t('nom'), first: t('first'), start: '', finish: '', names, ready: t('ready'),
      num: (n) => t.n(n), secs: (s) => t('secs', { n: t.n(s.toFixed(1)) }),
    }, st.reducedMotion);
    if (endTimer.current) clearTimeout(endTimer.current);
    endTimer.current = null;
    setScene(sc);
    setRes(null);
    setPaused(false);
    setPhase('play');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diff, rng, vsAI, t.lang, names.join('|'), st.reducedMotion]);

  useGameBar({ onPause: phase === 'play' ? () => setPaused(true) : undefined, help: <Rules t={t} /> }, [phase, t.lang]);

  const finish = useCallback((sc: BiscuitScene) => {
    if (endTimer.current) { clearTimeout(endTimer.current); endTimer.current = null; }
    const lanes = sc.model.lanes;
    const times = lanes.map((l) => (l.racer.finishTime === null ? null : l.racer.finishTime - sc.raceStart));
    const order = times.map((tm, i) => ({ tm, i })).filter((x) => x.tm !== null).sort((a, b) => a.tm! - b.tm!);
    const winner = order.length ? order[0].i : null;
    const me = lanes[1].racer;
    const outcome = !vsAI ? 'none' : winner === 1 ? 'win' : 'loss';
    const r = recordResult('biscuit-race', { outcome, score: vsAI && times[1] !== null ? Math.round(times[1]! * 10) / 10 : undefined, lowerIsBetter: true }, (_s, rr) => {
      const ids: string[] = [];
      if (rr.outcome === 'win') ids.push('br-win');
      if (lanes.some((l, i) => (!vsAI || i === 1) && l.racer.firstJumpCatch)) ids.push('br-one-bite');
      return ids;
    });
    void me;
    setRes({ times, jumps: lanes.map((l) => l.racer.jumps), bumps: lanes.map((l) => l.racer.bumps), winner, newBest: vsAI && r.newBest });
    setPhase('result');
  }, [vsAI]);

  useEffect(() => {
    if (!scene) return;
    scene.onEvent = (e) => {
      const human = !vsAI || e.lane === 1;
      if (e.type === 'go') sfx('whistle');
      if (e.type === 'jump' && human) sfx('whoosh', { gain: 0.5 });
      if (e.type === 'bump') { sfx('boing', { gain: human ? 1 : 0.5 }); if (human) vibrate(30); }
      if (e.type === 'catch') { sfx('crunch', { gain: human ? 1 : 0.6 }); if (human) { sfx('good'); vibrate([15, 30, 15]); } }
      if (e.type === 'finish') {
        sfx(human ? 'fanfare' : 'clap');
        if (scene.model.done) window.setTimeout(() => finish(scene), 1200);
        else if (!endTimer.current) endTimer.current = window.setTimeout(() => finish(scene), 9000); // the other racer gets 9 more seconds
      }
    };
  }, [scene, vsAI, finish]);

  // Keyboard controls
  useEffect(() => {
    if (!scene || phase !== 'play') return;
    const set = (code: string, v: boolean) => {
      let m = KEYMAP[code];
      if (!m) return false;
      if (vsAI && m[0] === 0) m = [1, m[1]]; // arrows also drive Player 1 against the computer
      scene.model.lanes[m[0]].racer.ctl[m[1]] = v;
      return true;
    };
    const kd = (e: KeyboardEvent) => { if (paused) return; if (set(e.code, true)) e.preventDefault(); };
    const ku = (e: KeyboardEvent) => { if (set(e.code, false)) e.preventDefault(); };
    addEventListener('keydown', kd);
    addEventListener('keyup', ku);
    return () => { removeEventListener('keydown', kd); removeEventListener('keyup', ku); };
  }, [scene, phase, paused, vsAI]);

  useEffect(() => () => { if (endTimer.current) clearTimeout(endTimer.current); }, []);
  const onHidden = useCallback(() => { if (phase === 'play') setPaused(true); }, [phase]);

  if (phase === 'setup') {
    return (
      <div className="br-root">
        <Overlay label={t('title')}>
          <div className="sheet ruled" data-testid="setup">
            <h2>{t('title')}</h2>
            <p className="lede">{t('lede')}</p>
            <Rules t={t} />
            <ModeSeg value={mode} onChange={setMode} modes={['ai', 'local2p']} />
            <DifficultySeg value={diff} onChange={setDiff} />
            <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--ink-soft)' }}>{t('diffHelp')}</p>
            <div className="actions"><button className="btn big" onClick={start} data-testid="start">{u('start')}</button></div>
          </div>
        </Overlay>
      </div>
    );
  }

  const ctl = (lane: number, key: keyof Controls, v: boolean) => { if (scene && !paused) scene.model.lanes[lane].racer.ctl[key] = v; };
  const pads = (lane: number, pos: 'top' | 'bottom') => (
    <div className={`br-pads ${pos}`}>
      <div className="br-move">
        {(['left', 'right'] as const).map((k) => (
          <button key={k} className={`touch-pad br-btn ${k}`} aria-label={t(k)} data-testid={`l${lane}-${k}`}
            onPointerDown={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); ctl(lane, k, true); }}
            onPointerUp={() => ctl(lane, k, false)} onPointerCancel={() => ctl(lane, k, false)} onContextMenu={(e) => e.preventDefault()}>
            {k === 'left' ? '◀' : '▶'}<small>{t(k)}</small>
          </button>
        ))}
      </div>
      <button className="touch-pad br-btn jump" aria-label={t('jump')} data-testid={`l${lane}-jump`}
        onPointerDown={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); ctl(lane, 'jump', true); }}
        onPointerUp={() => ctl(lane, 'jump', false)} onPointerCancel={() => ctl(lane, 'jump', false)} onContextMenu={(e) => e.preventDefault()}>
        ⤒<small>{t('jump')}</small>
        <span className="key-hint hide-touch">{lane === 1 ? (vsAI ? 'W / Space / ↑' : 'A D W') : '← → ↑'}</span>
      </button>
    </div>
  );

  return (
    <div className="br-root playing">
      {scene && <GameCanvas scene={scene} paused={paused || phase !== 'play'} onHidden={onHidden} label={t('title')} />}
      {!vsAI && pads(0, 'top')}
      {pads(1, 'bottom')}
      {paused && <PauseMenu onResume={() => setPaused(false)} onRestart={start} onQuit={onExit} help={<Rules t={t} />} />}
      {phase === 'result' && res && (
        <ReportCard
          outcome={vsAI ? (res.winner === 1 ? 'win' : 'loss') : 'none'}
          title={res.winner === null ? t('dnf') : t('won', { name: names[res.winner] })}
          rows={[1, 0].flatMap((i) => [
            [t('time', { name: names[i] }), res.times[i] === null ? t('dnf') : t('secs', { n: t.n(res.times[i]!.toFixed(1)) })],
            [t('jumps', { name: names[i] }), res.jumps[i]],
            [t('bumps', { name: names[i] }), res.bumps[i]],
          ] as Array<[string, string | number]>)}
          newBest={res.newBest}
          onAgain={start}
          onSetup={() => setPhase('setup')}
          onQuit={onExit}
        />
      )}
    </div>
  );
}

function Rules({ t }: { t: ReturnType<typeof useT<'r1' | 'r2' | 'r3' | 'r4'>> }) {
  return <ol><li>{t('r1')}</li><li><b>{t('r2')}</b></li><li>{t('r3')}</li><li>{t('r4')}</li></ol>;
}
