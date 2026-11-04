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
