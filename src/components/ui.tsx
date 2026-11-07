import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useT } from '../platform/i18n';
import { UI } from '../platform/strings';
import { useSettings } from '../platform/settings';
import { sfx } from '../platform/audio';
import { onAchievement, type Achievement } from '../platform/scores';
import { Signature, Star } from './Doodles';
import { ResultHero } from './Result';

// ---------- Player names ----------
export function usePlayerNames(): [string, string] {
  const s = useSettings();
  const t = useT(UI);
  return [s.players[0].name.trim() || t('player1'), s.players[1].name.trim() || t('player2')];
}

// ---------- Game bar context: a game tells the bar how to pause and what help to show ----------
export interface BarConfig {
  onPause?: () => void;
  /** Games with a separate help overlay can resume directly when it closes. */
  onResume?: () => void;
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
export function ReportCard({ outcome, title, subtitle, rows, newBest, versus, onAgain, onSetup, onQuit }: {
  outcome: 'win' | 'loss' | 'tie' | 'none';
  title: string;
  subtitle?: string;
  rows: Array<[string, string | number]>;
  newBest?: boolean;
  /** Two sides side by side (optional). */
  versus?: ReactNode;
  onAgain: () => void;
  onSetup?: () => void;
  onQuit: () => void;
}) {
  const t = useT(UI);
  useEffect(() => {
    sfx(outcome === 'loss' ? 'out' : 'fanfare');
  }, [outcome]);
  return (
    <Overlay label={t('reportTitle')}>
      <div className="report result-card" data-testid="result">
        <div className="school">{t('reportSchool')} · <span style={{ fontWeight: 500, color: 'var(--ink-soft)' }}>{t('reportTitle')}</span></div>
        <ResultHero outcome={outcome} title={title} sub={subtitle} />
        {newBest && <div style={{ textAlign: 'center' }}><span className="new-best">★ {t('newBest')}</span></div>}
        {versus}
        {rows.length > 0 && <table>
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k}><td>{k}</td><td>{typeof v === 'number' ? t.n(v) : v}</td></tr>
            ))}
          </tbody>
        </table>}
        <div className="sign"><span>{new Date().toLocaleDateString(t.lang === 'bn' ? 'bn-BD' : 'en-GB')}</span><span style={{ textAlign: 'center' }}><Signature /><br />{t('signTeacher')}</span></div>
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
export const MODE_ICON: Record<Mode, ReactNode> = {
  solo: <svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="11" r="5.5" fill="currentColor" /><path d="M6 27c1.2-6 5.2-9 10-9s8.8 3 10 9z" fill="currentColor" /></svg>,
  ai: <svg viewBox="0 0 32 32" aria-hidden="true"><rect x="4" y="6" width="24" height="16" rx="3" fill="none" stroke="currentColor" strokeWidth="2.6" /><circle cx="12" cy="14" r="2.2" fill="currentColor" /><circle cx="20" cy="14" r="2.2" fill="currentColor" /><path d="M11 27h10M16 22v5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>,
  local2p: <svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="10.5" cy="11" r="4.5" fill="currentColor" /><circle cx="21.5" cy="11" r="4.5" fill="currentColor" /><path d="M2 26c.9-5 4-7.5 8.5-7.5S18 21 19 26zM13 26c.9-5 4-7.5 8.5-7.5S29.1 21 30 26z" fill="currentColor" opacity=".85" /></svg>,
};

export function ModeSeg({ value, onChange, modes }: { value: Mode; onChange: (m: Mode) => void; modes: Mode[] }) {
  const t = useT(UI);
  const label: Record<Mode, string> = { solo: t('modeSolo'), ai: t('modeAi'), local2p: t('mode2p') };
  return (
    <>
      <div className="opt-label">{t('mode')}</div>
      <div className="seg mode-tiles" role="group" aria-label={t('mode')} style={{ ['--n' as string]: modes.length }}>
        {modes.map((m) => (
          <button key={m} type="button" aria-pressed={m === value} onClick={() => { sfx('click'); onChange(m); }}>
            {MODE_ICON[m]}<span>{label[m]}</span>
          </button>
        ))}
      </div>
    </>
  );
}
