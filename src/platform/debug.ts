// An on-screen diagnostic panel for finding phone-only problems (e.g. a blank game on iPhone).
// Off unless the address has debug=1, e.g. https://…/#/play/pen-fight?debug=1 (once turned on,
// it stays on in this tab until debug=0). Plain DOM, not React, so it still shows if a game breaks.
// Nothing is sent anywhere: the player takes a screenshot.

const LINES: string[] = [];
let panel: HTMLPreElement | null = null;

function on(): boolean {
  const q = location.search + '&' + location.hash;
  try {
    if (/[?&]debug=1\b/.test(q)) sessionStorage.setItem('tp.debug', '1');
    if (/[?&]debug=0\b/.test(q)) sessionStorage.removeItem('tp.debug');
    return sessionStorage.getItem('tp.debug') === '1';
  } catch { return /[?&]debug=1\b/.test(q); }
}

function add(line: string) {
  LINES.push(`${new Date().toISOString().slice(11, 19)} ${line}`.slice(0, 400));
  if (LINES.length > 12) LINES.shift();
  draw();
}

function box(sel: string): string {
  const el = document.querySelector<HTMLElement>(sel);
  if (!el) return `${sel}: none`;
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return `${sel}: ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)} op=${cs.opacity} vis=${cs.visibility} disp=${cs.display} tf=${cs.transform === 'none' ? '-' : cs.transform.slice(0, 40)} anim=${cs.animationName}/${cs.animationPlayState}`;
}

function draw() {
  if (!panel) return;
  const layout = [
    `view ${innerWidth}×${innerHeight} dpr ${devicePixelRatio} ${location.hash.slice(0, 40)}`,
    box('.game-screen'), box('.game-body'),
    box('.pf-root'), box('.overlay'), box('.sheet'),
  ];
  panel.textContent = [navigator.userAgent.slice(0, 160), ...layout, '— errors —', ...(LINES.length ? LINES : ['(none)'])].join('\n');
}

export function startDebugPanel() {
  if (!on()) return;
  panel = document.createElement('pre');
  panel.setAttribute('style', 'position:fixed;left:4px;right:4px;bottom:4px;z-index:99999;max-height:45vh;overflow:auto;margin:0;padding:6px 8px;background:rgba(0,0,0,0.82);color:#9effa8;font:10px/1.35 ui-monospace,Menlo,monospace;white-space:pre-wrap;border-radius:8px;pointer-events:none');
  document.body.appendChild(panel);
  addEventListener('error', (e) => add(`ERROR ${e.message} @ ${(e.filename || '').split('/').pop()}:${e.lineno}:${e.colno}`));
  addEventListener('unhandledrejection', (e) => add(`REJECT ${String((e.reason as Error)?.message ?? e.reason)}`));
  addEventListener('vite:preloadError', (e) => add(`PRELOAD ${String((e as unknown as { payload?: Error }).payload?.message ?? '')}`));
  const ce = console.error.bind(console);
  console.error = (...a: unknown[]) => { add(`console.error ${a.map((x) => (x instanceof Error ? `${x.message} ${x.stack?.split('\n')[1] ?? ''}` : String(x))).join(' ')}`); ce(...a); };
  setInterval(draw, 1000);
  draw();
}
