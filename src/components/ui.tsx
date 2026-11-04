import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useT } from '../platform/i18n';
import { UI } from '../platform/strings';
import { useSettings } from '../platform/settings';
import { sfx } from '../platform/audio';
import { onAchievement, type Achievement } from '../platform/scores';
import { Signature, Star } from './Doodles';

// ---------- Player names ----------
export function usePlayerNames(): [string, string] {
  const s = useSettings();
  const t = useT(UI);
  return [s.players[0].name.trim() || t('player1'), s.players[1].name.trim() || t('player2')];
}

// ---------- Game bar context: a game tells the bar how to pause and what help to show ----------
export interface BarConfig {
  onPause?: () => void;
  help?: ReactNode;
}
export const BarContext = createContext<(cfg: BarConfig) => void>(() => {});

export function useGameBar(cfg: BarConfig, deps: unknown[]) {
  const set = useContext(BarContext);
  useEffect(() => {
    set(cfg);
    return () => set({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

// ---------- Segmented choice ----------
export function Seg<V extends string | number>({ value, options, onChange, label }: {
  value: V;
  options: Array<{ v: V; label: string }>;
  onChange: (v: V) => void;
  label: string;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.v)}
          type="button"
          aria-pressed={o.v === value}
          onClick={() => { sfx('click'); onChange(o.v); }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className="switch" onClick={() => { onChange(!on); sfx('click'); }} />;
}

export function Overlay({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={label}>
      {children}
    </div>
  );
}

// ---------- Pause menu ----------
export function PauseMenu({ onResume, onRestart, onQuit, help }: { onResume: () => void; onRestart: () => void; onQuit: () => void; help?: ReactNode }) {
  const t = useT(UI);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { e.preventDefault(); onResume(); } };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [onResume]);
  return (
    <Overlay label={t('paused')}>
      <div className="sheet ruled">
        <h2>{t('paused')}</h2>
        {help}
        <div className="actions">
          <button className="btn big" onClick={onResume} autoFocus>{t('resume')}</button>
          <button className="btn secondary" onClick={onRestart}>{t('restart')}</button>
          <button className="btn secondary" onClick={onQuit}>{t('quit')}</button>
        </div>
      </div>
    </Overlay>
  );
}

// ---------- Result: school report card ----------
export function ReportCard({ outcome, title, subtitle, rows, newBest, onAgain, onSetup, onQuit }: {
  outcome: 'win' | 'loss' | 'tie' | 'none';
  title: string;
  subtitle?: string;
  rows: Array<[string, string | number]>;
  newBest?: boolean;
  onAgain: () => void;
  onSetup?: () => void;
  onQuit: () => void;
}) {
  const t = useT(UI);
  useEffect(() => {
    sfx(outcome === 'loss' ? 'out' : 'fanfare');
  }, [outcome]);
  const stamp = outcome === 'win' ? t('win') : outcome === 'loss' ? t('loss') : outcome === 'tie' ? t('tie') : null;
  return (
    <Overlay label={t('reportTitle')}>
      <div className="report" data-testid="result">
        <div className="school">{t('reportSchool')}</div>
        <div className="school" style={{ fontWeight: 500, color: 'var(--ink-soft)' }}>{t('reportTitle')}</div>
        <h2>{title}</h2>
        {subtitle && <p className="sub">{subtitle}</p>}
        <table>
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k}><td>{k}</td><td>{typeof v === 'number' ? t.n(v) : v}</td></tr>
            ))}
          </tbody>
        </table>
        {newBest && <div style={{ textAlign: 'center' }}><span className="new-best">★ {t('newBest')}</span></div>}
        <div className="sign"><span>{new Date().toLocaleDateString(t.lang === 'bn' ? 'bn-BD' : 'en-GB')}</span>{stamp && <span className={`grade-stamp ${outcome}`}>{stamp}</span>}<span style={{ textAlign: 'center' }}><Signature /><br />{t('signTeacher')}</span></div>
        <div className="actions">
          <button className="btn big" onClick={onAgain} autoFocus>{t('playAgain')}</button>
          {onSetup && <button className="btn secondary" onClick={onSetup}>{t('changeSetup')}</button>}
          <button className="btn secondary" onClick={onQuit}>{t('quit')}</button>
        </div>
      </div>
    </Overlay>
  );
}

// ---------- Achievement toasts ----------
export function Toasts() {
  const t = useT(UI);
  const [items, setItems] = useState<Array<Achievement & { key: number }>>([]);
  useEffect(() => onAchievement((a) => {
    const key = Date.now() + Math.random();
    sfx('good', { pitch: 1.2 });
    setItems((l) => [...l, { ...a, key }]);
    setTimeout(() => setItems((l) => l.filter((x) => x.key !== key)), 4200);
  }), []);
  return (
    <div className="toast-wrap" aria-live="polite">
      {items.map((a) => (
        <div className="toast" key={a.key}>
          <Star className="star" />
          <div><small>{t('achievement')}</small><b>{t.bi(a.title)}</b><small>{t.bi(a.desc)}</small></div>
        </div>
      ))}
    </div>
  );
}

/** Difficulty choice used by several games. */
export type Difficulty = 'easy' | 'medium' | 'hard';
export function DifficultySeg({ value, onChange }: { value: Difficulty; onChange: (d: Difficulty) => void }) {
  const t = useT(UI);
  return (
    <>
      <div className="opt-label">{t('diff')}</div>
      <Seg label={t('diff')} value={value} onChange={onChange} options={[{ v: 'easy', label: t('easy') }, { v: 'medium', label: t('medium') }, { v: 'hard', label: t('hard') }]} />
    </>
  );
}

export type Mode = 'solo' | 'ai' | 'local2p';
export function ModeSeg({ value, onChange, modes }: { value: Mode; onChange: (m: Mode) => void; modes: Mode[] }) {
  const t = useT(UI);
  const label: Record<Mode, string> = { solo: t('modeSolo'), ai: t('modeAi'), local2p: t('mode2p') };
  return (
    <>
      <div className="opt-label">{t('mode')}</div>
      <Seg label={t('mode')} value={value} onChange={onChange} options={modes.map((m) => ({ v: m, label: label[m] }))} />
    </>
  );
}
