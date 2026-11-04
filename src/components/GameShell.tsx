import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { GameCanvas, type Scene } from '../engine/GameCanvas';
import { capturePointer } from '../engine/timing';
import { useT } from '../platform/i18n';
import { UI } from '../platform/strings';
import { useSettings } from '../platform/settings';
import { recordResult, type Outcome } from '../platform/scores';
import { sfx } from '../platform/audio';
import { DifficultySeg, ModeSeg, Overlay, PauseMenu, ReportCard, Seg, useGameBar, usePlayerNames, type Difficulty, type Mode } from './ui';

// A reusable frame for canvas games (Phase 2 and later).
// It owns: the setup sheet, the canvas, touch pads, key bindings, pause,
// the result card and the local records. A game only supplies a Scene
// and a list of pads. This keeps every game small and consistent.

export interface ShellResult {
  outcome: Outcome;
  title: string;
  rows: Array<[string, string | number]>;
  score?: number;
  lowerIsBetter?: boolean;
  records?: Record<string, number>;
  achievements?: string[];
}

export interface ShellScene extends Scene {
  /** The shell sets this. The scene calls it once when the match ends. */
  onOver?: (r: ShellResult) => void;
  /** Pad or key input. `player` is 0 for Player 1. */
  control?(player: number, action: string, down: boolean): void;
  /** Optional hook when the game pauses or resumes. */
  onPause?(paused: boolean): void;
  dispose?(): void;
}

export interface PadDef {
  player: number;
  action: string;
  label: string;
  sub?: string;
  /** Screen corner or edge. "t*" areas are for the player across the table. */
  area: 'bl' | 'br' | 'bc' | 'tl' | 'tr' | 'tc';
  size?: 's' | 'm' | 'l' | 'wide';
  color?: string;
  keys?: string[];
  keyHint?: string;
  /** Turn the pad 180° (for the second player on a phone lying flat). */
  flip?: boolean;
  /** Keyboard-only binding: no button on the screen. */
  hidden?: boolean;
}

export interface ShellOption {
  key: string;
  label: string;
  choices: Array<{ v: string | number; label: string }>;
  def: string | number;
  when?: (mode: Mode) => boolean;
}

export interface ShellConfig {
  mode: Mode;
  diff: Difficulty;
  opts: Record<string, string | number>;
  /** Display names: index 0 = Player 1. In vs-computer mode index 1 is the computer. */
  names: string[];
  reducedMotion: boolean;
  lang: 'bn' | 'en';
}

export interface GameShellProps {
  gameId: string;
  onExit: () => void;
  title: string;
  lede: string;
  rules: ReactNode[];
  modes: Mode[];
  difficulty?: (mode: Mode) => boolean;
  options?: ShellOption[];
  createScene: (cfg: ShellConfig) => ShellScene;
  pads: (cfg: ShellConfig) => PadDef[];
  hint?: string;
  rootClass?: string;
}

export function GameShell(p: GameShellProps) {
  const u = useT(UI);
  const st = useSettings();
  const [n1, n2] = usePlayerNames();
  const [mode, setMode] = useState<Mode>(p.modes[0]);
  const [diff, setDiff] = useState<Difficulty>('medium');
  const [opts, setOpts] = useState<Record<string, string | number>>(() => Object.fromEntries((p.options ?? []).map((o) => [o.key, o.def])));
  const [phase, setPhase] = useState<'setup' | 'play' | 'result'>('setup');
  const [paused, setPaused] = useState(false);
  const [scene, setScene] = useState<ShellScene | null>(null);
  const [result, setResult] = useState<(ShellResult & { newBest: boolean }) | null>(null);
  const [downPads, setDownPads] = useState<Record<string, boolean>>({});
  const cfgRef = useRef<ShellConfig | null>(null);

  const names = mode === 'solo' ? [u('you')] : mode === 'ai' ? [u('you'), u('computer')] : [n1, n2];
  const cfg: ShellConfig = { mode, diff, opts, names, reducedMotion: st.reducedMotion, lang: st.lang };

  const start = useCallback(() => {
    scene?.dispose?.();
    const c = { ...cfg };
    cfgRef.current = c;
    const sc = p.createScene(c);
    sc.onOver = (r) => {
      const rec = recordResult(p.gameId, { outcome: r.outcome, score: r.score, lowerIsBetter: r.lowerIsBetter, records: r.records }, () => r.achievements ?? []);
      window.setTimeout(() => { setResult({ ...r, newBest: rec.newBest }); setPhase('result'); }, 700);
    };
    setScene(sc);
    setResult(null);
    setPaused(false);
    setDownPads({});
    setPhase('play');
    sfx('bell', { gain: 0.6 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, mode, diff, JSON.stringify(opts), names.join('|'), st.reducedMotion, st.lang]);

  useEffect(() => () => scene?.dispose?.(), [scene]);
  useEffect(() => { scene?.onPause?.(paused); }, [scene, paused]);

  useGameBar({
    onPause: phase === 'play' ? () => setPaused(true) : undefined,
    help: <ol>{p.rules.map((r, i) => <li key={i}>{r}</li>)}</ol>,
  }, [phase, st.lang]);

  const pads = phase === 'play' && cfgRef.current ? p.pads(cfgRef.current) : [];

  const press = (pd: PadDef, down: boolean) => {
    if (!scene || (paused && down)) return;
    scene.control?.(pd.player, pd.action, down);
    const k = `${pd.player}:${pd.action}`;
    setDownPads((d) => (d[k] === down ? d : { ...d, [k]: down }));
  };

  // Key bindings come from the pad list.
  useEffect(() => {
    if (phase !== 'play' || !scene) return;
    const map = new Map<string, PadDef>();
    for (const pd of pads) for (const k of pd.keys ?? []) map.set(k, pd);
    const kd = (e: KeyboardEvent) => {
      const pd = map.get(e.code);
      if (!pd || paused) return;
      e.preventDefault();
      if (!e.repeat) press(pd, true);
    };
    const ku = (e: KeyboardEvent) => {
      const pd = map.get(e.code);
      if (!pd) return;
      e.preventDefault();
      press(pd, false);
    };
    addEventListener('keydown', kd);
    addEventListener('keyup', ku);
    return () => { removeEventListener('keydown', kd); removeEventListener('keyup', ku); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, scene, paused, pads.length]);

  const onHidden = useCallback(() => { if (phase === 'play') setPaused(true); }, [phase]);

  if (phase === 'setup') {
    return (
      <div className={`shell-root ${p.rootClass ?? ''}`}>
        <Overlay label={p.title}>
          <div className="sheet ruled" data-testid="setup">
            <h2>{p.title}</h2>
            <p className="lede">{p.lede}</p>
            <ol>{p.rules.map((r, i) => <li key={i}>{r}</li>)}</ol>
            {p.modes.length > 1 && <ModeSeg value={mode} onChange={setMode} modes={p.modes} />}
            {(p.difficulty?.(mode) ?? false) && <DifficultySeg value={diff} onChange={setDiff} />}
            {(p.options ?? []).filter((o) => !o.when || o.when(mode)).map((o) => (
              <div key={o.key}>
                <div className="opt-label">{o.label}</div>
                <Seg label={o.label} value={opts[o.key]} onChange={(v) => setOpts((s) => ({ ...s, [o.key]: v }))} options={o.choices} />
              </div>
            ))}
            {p.hint && <p style={{ margin: '10px 0 0', fontSize: 14, color: 'var(--ink-soft)' }}>{p.hint}</p>}
            <div className="actions"><button className="btn big" onClick={start} data-testid="start">{u('start')}</button></div>
          </div>
        </Overlay>
      </div>
    );
  }

  return (
    <div className={`shell-root playing ${p.rootClass ?? ''}`}>
      {scene && <GameCanvas scene={scene} paused={paused || phase !== 'play'} onHidden={onHidden} label={p.title} />}
      <div className="shell-pads" data-mode={mode}>
        {(['bl', 'bc', 'br', 'tl', 'tc', 'tr'] as const).map((area) => {
          const list = pads.filter((pd) => pd.area === area && !pd.hidden);
          if (!list.length) return null;
          return (
            <div key={area} className={`pad-area area-${area} ${list.some((pd) => pd.flip) ? 'flip' : ''}`}>
              {list.map((pd) => {
                const k = `${pd.player}:${pd.action}`;
                return (
                  <button
                    key={k}
                    className={`touch-pad shell-pad size-${pd.size ?? 'm'} ${downPads[k] ? 'down' : ''}`}
                    style={{ background: pd.color }}
                    data-testid={`pad-${pd.player}-${pd.action}`}
                    aria-label={pd.label}
                    onPointerDown={(e) => { e.preventDefault(); capturePointer(e); press(pd, true); }}
                    onPointerUp={() => press(pd, false)}
                    onPointerCancel={() => press(pd, false)}
                    onContextMenu={(e) => e.preventDefault()}
                  >
                    <span className="lbl">{pd.label}</span>
                    {pd.sub && <small>{pd.sub}</small>}
                    {pd.keyHint && <span className="key-hint hide-touch">{pd.keyHint}</span>}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
      {paused && <PauseMenu onResume={() => setPaused(false)} onRestart={start} onQuit={p.onExit} help={<ol>{p.rules.map((r, i) => <li key={i}>{r}</li>)}</ol>} />}
      {phase === 'result' && result && (
        <ReportCard
          outcome={result.outcome}
          title={result.title}
          rows={result.rows}
          newBest={result.newBest}
          onAgain={start}
          onSetup={() => { scene?.dispose?.(); setScene(null); setPhase('setup'); }}
          onQuit={p.onExit}
        />
      )}
    </div>
  );
}
