import { useEffect, useState } from 'react';

// Hash routing works on any static host and inside an installed PWA
// without server rewrites. Routes:
//   #/                 hub
//   #/play/<gameId>    a game
//   #/roadmap          all 28 games
//   #/settings         settings and players
//   #/records          local scores and achievements

export type Route =
  | { name: 'home' }
  | { name: 'play'; id: string }
  | { name: 'roadmap' }
  | { name: 'settings' }
  | { name: 'records' };

export function parseHash(hash: string): Route {
  // A query after the route (…#/play/hand-cricket?room=AB7K3) is for the game, not the route.
  const parts = hash.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean);
  if (parts[0] === 'play' && parts[1]) return { name: 'play', id: parts[1] };
  if (parts[0] === 'roadmap') return { name: 'roadmap' };
  if (parts[0] === 'settings') return { name: 'settings' };
  if (parts[0] === 'records') return { name: 'records' };
  return { name: 'home' };
}

export function href(r: Route): string {
  switch (r.name) {
    case 'home': return '#/';
    case 'play': return `#/play/${r.id}`;
    default: return `#/${r.name}`;
  }
}

export function navigate(r: Route): void {
  location.hash = href(r);
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(location.hash));
  useEffect(() => {
    const on = () => setRoute(parseHash(location.hash));
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return route;
}

/** Query values after the route in the hash, e.g. room=AB7K3 in #/play/hand-cricket?room=AB7K3. */
export function hashQuery(hash: string = location.hash): URLSearchParams {
  const i = hash.indexOf('?');
  return new URLSearchParams(i < 0 ? '' : hash.slice(i + 1));
}

/** Drop the query from the hash without adding a history entry. */
export function clearHashQuery(): void {
  const i = location.hash.indexOf('?');
  if (i >= 0) history.replaceState(null, '', location.pathname + location.search + location.hash.slice(0, i));
}
