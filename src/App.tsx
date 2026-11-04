import { useEffect } from 'react';
import { useRoute } from './platform/router';
import { useSettings } from './platform/settings';
import { unlockAudio } from './platform/audio';
import { GameScreen } from './components/GameScreen';
import { Home, RecordsPage, Roadmap, SettingsPage, TopBar } from './components/Pages';
import { Toasts } from './components/ui';

export default function App() {
  const route = useRoute();
  const s = useSettings();

  useEffect(() => {
    document.documentElement.classList.toggle('reduced-motion', s.reducedMotion);
  }, [s.reducedMotion]);

  useEffect(() => {
    const unlock = () => unlockAudio();
    addEventListener('pointerdown', unlock, { passive: true });
    addEventListener('keydown', unlock);
    return () => {
      removeEventListener('pointerdown', unlock);
      removeEventListener('keydown', unlock);
    };
  }, []);

  useEffect(() => {
    if (route.name !== 'play') window.scrollTo(0, 0);
  }, [route]);

  return (
    <>
      {route.name === 'play' ? (
        <GameScreen key={route.id} id={route.id} />
      ) : (
        <>
          <TopBar />
          {route.name === 'home' && <Home />}
          {route.name === 'roadmap' && <Roadmap />}
          {route.name === 'settings' && <SettingsPage />}
          {route.name === 'records' && <RecordsPage />}
        </>
      )}
      <Toasts />
    </>
  );
}
