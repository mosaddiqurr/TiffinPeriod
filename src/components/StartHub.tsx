import { useState, type ReactNode } from 'react';
import { useT } from '../platform/i18n';
import { UI } from '../platform/strings';
import { sfx } from '../platform/audio';
import { getGame } from '../platform/registry';
import { DOODLES } from './Doodles';
import { MODE_ICON, type Mode } from './ui';
import './start-hub.css';

// Every game's start screen ("big tiles"). Two steps, both fit a phone screen without scrolling:
//   1. The hub: the game's drawing, title and one line; a "?" that shows the rules;
//      a big green "Play online" tile; one big tile per way to play.
//   2. After a tile: only that mode's settings, and a big Start button (back arrow to the tiles).
// The outer sheet keeps data-testid="setup"; Start keeps data-testid="start".

export interface HubMode {
  id: string;
  label: string;
  sub?: string;
  icon?: ReactNode;
}

const STD_SUB: Record<Mode, { en: string; bn: string }> = {
  solo: { en: 'Just you, beat your best', bn: 'শুধু তুমি, নিজের রেকর্ড ভাঙো' },
  ai: { en: 'Play the computer', bn: 'কম্পিউটারের সাথে খেলো' },
  local2p: { en: 'Two players, one phone', bn: 'দুজন, একটা ফোন' },
};

/** The standard modes (solo / vs computer / 2 players) as tiles. */
export function useStdModes(modes: Mode[]): HubMode[] {
  const t = useT(UI);
  const label: Record<Mode, string> = { solo: t('modeSolo'), ai: t('modeAi'), local2p: t('mode2p') };
  return modes.map((m) => ({ id: m, label: label[m], sub: t.lang === 'bn' ? STD_SUB[m].bn : STD_SUB[m].en, icon: MODE_ICON[m] }));
}

export function StartHub({ gameId, title, lede, rules, eyebrow, art, online, modes, mode, onMode, options, onStart, onBack, className }: {
  gameId: string;
  title: string;
  lede: string;
  rules: ReactNode;
  eyebrow?: string;
  /** A drawing to use instead of the game's card drawing. */
  art?: ReactNode;
  online?: { onClick: () => void; label?: string; sub?: string };
  modes: HubMode[];
  mode: string;
  onMode: (id: string) => void;
  /** The settings for the chosen mode. */
  options?: ReactNode;
  onStart: () => void;
  /** A button back to all games (the khata games have one). */
  onBack?: () => void;
  className?: string;
}) {
  const t = useT(UI);
  const tx = (en: string, bn: string) => (t.lang === 'bn' ? bn : en);
  const [step, setStep] = useState<'hub' | 'mode'>(modes.length ? 'hub' : 'mode');
  const [help, setHelp] = useState(false);
  const entry = getGame(gameId);
  const Doodle = DOODLES[gameId];
  const accent = entry?.accent;
  const chosen = modes.find((m) => m.id === mode) ?? modes[0];
  const pick = (id: string) => { sfx('click'); onMode(id); setStep('mode'); };

  return (
    <div className={`sheet sh-sheet ${className ?? ''}`} data-testid="setup" style={accent ? { ['--accent' as string]: accent } : undefined}>
      {step === 'hub' ? (
        <>
          <header className="sh-hero">
            <div className="sh-hero-text">
              {eyebrow && <span className="sh-chip">{eyebrow}</span>}
              <h2>{title}</h2>
              <p className="lede">{lede}</p>
            </div>
            <div className="sh-hero-art" aria-hidden="true">{art ?? (Doodle && <Doodle accent={accent} />)}</div>
          </header>
          <button type="button" className={`sh-help-btn${help ? ' open' : ''}`} onClick={() => setHelp(!help)} aria-expanded={help} data-testid="how-to">
            <span className="sh-q" aria-hidden="true">?</span>{tx('How to play', 'কীভাবে খেলবে')}<span className="sh-caret" aria-hidden="true">▾</span>
          </button>
          {help && <div className="sh-rules">{rules}</div>}
          {online && (
            <button type="button" className="sh-online" onClick={() => { sfx('click'); online.onClick(); }} data-testid="mode-online">
              <span className="sh-online-ico" aria-hidden="true">
                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M3 12h18M12 3c2.6 2.8 3.9 5.8 3.9 9s-1.3 6.2-3.9 9c-2.6-2.8-3.9-5.8-3.9-9S9.4 5.8 12 3z" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
              </span>
              <span className="sh-online-text">
                <b>{online.label ?? tx('Play online', 'অনলাইনে খেলো')}</b>
                <small>{online.sub ?? tx('Quick match, or a room for a friend', 'কুইক ম্যাচ, অথবা বন্ধুর জন্য রুম')}</small>
              </span>
              <span className="sh-go" aria-hidden="true">→</span>
            </button>
          )}
          <div className="sh-tiles" style={{ ['--n' as string]: modes.length }}>
            {modes.map((m) => (
              <button key={m.id} type="button" className="sh-tile" onClick={() => pick(m.id)} data-testid={`tile-${m.id}`} data-current={m.id === mode || undefined}>
                <span className="sh-tile-ico" aria-hidden="true">{m.icon}</span>
                <b>{m.label}</b>
                {m.sub && <small>{m.sub}</small>}
              </button>
            ))}
          </div>
          {onBack && <button type="button" className="sh-back-all" onClick={onBack}>← {t('back')}</button>}
        </>
      ) : (
        <>
          <div className="sh-mode-head">
            {modes.length > 0 && <button type="button" className="sh-back" onClick={() => setStep('hub')} aria-label={tx('Back', 'ফিরে যাও')} data-testid="hub-back">←</button>}
            <span className="sh-mode-ico" aria-hidden="true">{chosen?.icon}</span>
            <div className="sh-mode-title">
              <small>{title}</small>
              <b>{chosen?.label ?? title}</b>
            </div>
          </div>
          <div className="sh-options">{options}</div>
          <div className="sh-start">
            <button className="btn big" onClick={onStart} data-testid="start" autoFocus>{t('start')} <span aria-hidden="true">→</span></button>
          </div>
        </>
      )}
    </div>
  );
}
