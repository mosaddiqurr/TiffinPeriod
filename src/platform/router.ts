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
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
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
