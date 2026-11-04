import { Component, Suspense, lazy, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getGame } from '../platform/registry';
import { navigate } from '../platform/router';
import { useT } from '../platform/i18n';
import { UI } from '../platform/strings';
import { useSettings, updateSettings } from '../platform/settings';
import { unlockAudio } from '../platform/audio';
import { BarContext, Overlay, type BarConfig } from './ui';
import { IconBack, IconHelp, IconPause, IconSoundOff, IconSoundOn } from './Doodles';

// Each game loads as its own code chunk inside its own error boundary.
// A crash or a load failure in one game does not affect the hub or other games.

class GameBoundary extends Component<{ children: ReactNode; fallback: (retry: () => void) => ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.error('[game crashed]', err);
  }
  render() {
    return this.state.failed ? this.props.fallback(() => this.setState({ failed: false })) : this.props.children;
  }
}

export function GameScreen({ id }: { id: string }) {
  const t = useT(UI);
  const s = useSettings();
  const entry = getGame(id);
  const [bar, setBar] = useState<BarConfig>({});
  const [showHelp, setShowHelp] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const Game = useMemo(() => (entry?.load ? lazy(entry.load) : null), [entry, attempt]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.key === 'Escape' || e.key === 'p' || e.key === 'P') && bar.onPause && !showHelp) {
        e.preventDefault();
        bar.onPause();
      }
    };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [bar, showHelp]);

  if (!entry || !entry.playable || !Game) {
    navigate({ name: 'home' });
    return null;
  }

  const exit = () => navigate({ name: 'home' });

  return (
    <div className="game-screen" style={{ ['--accent' as string]: entry.accent }}>
      <div className="game-bar">
        <button className="cover-btn" onClick={exit} aria-label={t('back')}><IconBack /><span className="lbl">{t('back')}</span></button>
        <h1>{t.bi(entry.title)}</h1>
        {bar.help && <button className="cover-btn" onClick={() => { bar.onPause?.(); setShowHelp(true); }} aria-label={t('help')}><IconHelp /></button>}
        <button className="cover-btn" onClick={() => { unlockAudio(); updateSettings({ sound: !s.sound }); }} aria-label={s.sound ? t('soundOn') : t('soundOff')} aria-pressed={s.sound}>
          {s.sound ? <IconSoundOn /> : <IconSoundOff />}
        </button>
        {bar.onPause && <button className="cover-btn" onClick={bar.onPause} aria-label={t('pause')} data-testid="pause"><IconPause /></button>}
      </div>
      <div className="game-body">
        <BarContext.Provider value={setBar}>
          <GameBoundary
            key={attempt}
            fallback={(retry) => (
              <Overlay label={t('loadFail')}>
                <div className="sheet ruled">
                  <h2>{t('loadFail')}</h2>
                  <div className="actions">
                    <button className="btn" onClick={() => { setAttempt((a) => a + 1); retry(); }}>{t('tryAgain')}</button>
                    <button className="btn secondary" onClick={exit}>{t('quit')}</button>
                  </div>
                </div>
              </Overlay>
            )}
          >
            <Suspense fallback={<div style={{ display: 'grid', placeItems: 'center', height: '100%', fontFamily: 'var(--font-display)', fontSize: 22 }}>{t('loading')}</div>}>
              <Game onExit={exit} />
            </Suspense>
          </GameBoundary>
        </BarContext.Provider>
        {showHelp && bar.help && (
          <Overlay label={t('help')}>
            <div className="sheet ruled">
              <h2>{t('help')}</h2>
              {bar.help}
              <div className="actions"><button className="btn" onClick={() => setShowHelp(false)} autoFocus>{t('resume')}</button></div>
            </div>
          </Overlay>
        )}
      </div>
    </div>
  );
}
