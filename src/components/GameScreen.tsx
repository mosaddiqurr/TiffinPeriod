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

/** A game's code file could not be fetched (usually: a new version was deployed and this page is older). */
export function isChunkError(err: unknown): boolean {
  const m = String((err as { message?: string })?.message ?? err);
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported|Failed to fetch|ChunkLoadError|Outdated Optimize Dep|preload CSS|Unable to preload/i.test(m);
}

/** Load a game's code; if its file is missing because the site was updated, reload the page once to get the new version. */
function loadWithReload(id: string, load: () => Promise<{ default: React.ComponentType<any> }>) { // eslint-disable-line @typescript-eslint/no-explicit-any
  return () => load().catch((err) => {
    if (isChunkError(err)) {
      const key = 'tp.reloaded'; void id;
      let last = 0;
      try { last = Number(sessionStorage.getItem(key) ?? 0); } catch { /* private mode */ }
      if (Date.now() - last > 30000) {
        try { sessionStorage.setItem(key, String(Date.now())); } catch { /* private mode */ }
        location.reload();
        return new Promise<never>(() => {});
      }
    }
    throw err;
  });
}

class GameBoundary extends Component<{ children: ReactNode; fallback: (retry: () => void, chunk: boolean) => ReactNode }, { failed: boolean; chunk: boolean }> {
  state = { failed: false, chunk: false };
  static getDerivedStateFromError(err: unknown) {
    return { failed: true, chunk: isChunkError(err) };
  }
  componentDidCatch(err: unknown) {
    console.error('[game crashed]', err);
  }
  render() {
    return this.state.failed ? this.props.fallback(() => this.setState({ failed: false, chunk: false }), this.state.chunk) : this.props.children;
  }
}

export function GameScreen({ id }: { id: string }) {
  const t = useT(UI);
  const s = useSettings();
  const entry = getGame(id);
  const [bar, setBar] = useState<BarConfig>({});
  const [showHelp, setShowHelp] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const Game = useMemo(() => (entry?.load ? lazy(loadWithReload(id, entry.load)) : null), [entry, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (showHelp && e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        setShowHelp(false);
        bar.onResume?.();
        return;
      }
      if (e.key !== 'Escape' && e.target instanceof HTMLElement && (e.target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName))) return;
      if ((e.key === 'Escape' || e.key === 'p' || e.key === 'P') && bar.onPause && !showHelp) {
        e.preventDefault();
        bar.onPause();
      }
    };
    addEventListener('keydown', k, true);
    return () => removeEventListener('keydown', k, true);
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
            fallback={(retry, chunk) => (
              <Overlay label={t('loadFail')}>
                <div className="sheet ruled">
                  <h2>{t('loadFail')}</h2>
                  <div className="actions">
                    <button className="btn" onClick={() => { if (chunk) { location.reload(); return; } setAttempt((a) => a + 1); retry(); }}>{t('tryAgain')}</button>
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
              <div className="actions"><button className="btn" onClick={() => { setShowHelp(false); bar.onResume?.(); }} autoFocus>{t('resume')}</button></div>
            </div>
          </Overlay>
        )}
      </div>
    </div>
  );
}
