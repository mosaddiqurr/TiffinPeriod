import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/baloo-da-2/500.css';
import '@fontsource/baloo-da-2/700.css';
import '@fontsource/baloo-da-2/800.css';
import '@fontsource/hind-siliguri/400.css';
import '@fontsource/hind-siliguri/600.css';
import '@fontsource/hind-siliguri/700.css';
import './styles/global.css';
import App from './App';
import { startDebugPanel } from './platform/debug';

// Phone diagnostics, only with debug=1 in the address.
startDebugPanel();

// After a new version goes live, a page that is still the old version can fail to fetch a
// game's code or style file (the old files are gone). Vite reports that here: reload once
// to get the new version, instead of showing a broken or blank game.
addEventListener('vite:preloadError', (e) => {
  let last = 0;
  try { last = Number(sessionStorage.getItem('tp.reloaded') ?? 0); } catch { /* private mode */ }
  if (Date.now() - last < 30000) return;
  try { sessionStorage.setItem('tp.reloaded', String(Date.now())); } catch { /* private mode */ }
  e.preventDefault();
  location.reload();
});

// Canvas games draw text with these fonts, so ask the browser to load them early.
try {
  void document.fonts?.load('800 32px "Baloo Da 2"', 'অআ12');
  void document.fonts?.load('700 32px "Baloo Da 2"', 'অআ12');
  void document.fonts?.load('600 20px "Hind Siliguri"', 'অআ12');
} catch {
  /* ignore */
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
