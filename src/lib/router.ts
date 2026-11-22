import { useEffect, useState } from 'react';

/** Tiny hash router: works offline, on GitHub Pages sub-paths and with the iOS back gesture. */
export interface Route {
  path: string[];
  query: URLSearchParams;
  raw: string;
}

export function parseHash(hash: string = location.hash): Route {
  const raw = hash.replace(/^#\/?/, '');
  const [p, q = ''] = raw.split('?');
  const path = p.split('/').filter(Boolean).map(decodeURIComponent);
  return { path: path.length ? path : ['today'], query: new URLSearchParams(q), raw };
}

let depth = 0; // in-app navigations we can safely go "back" through

export function go(to: string, replace = false) {
  const h = to.startsWith('#') ? to : `#/${to.replace(/^\//, '')}`;
  if (location.hash === h) return;
  if (replace) {
    history.replaceState(null, '', h);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    depth++;
    location.hash = h;
  }
}

export function back(fallback = 'today') {
  if (depth > 0) {
    depth--;
    history.back();
  } else go(fallback, true);
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash());
  useEffect(() => {
    const on = () => {
      setRoute(parseHash());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
