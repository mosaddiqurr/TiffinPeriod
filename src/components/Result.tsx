import type { ReactNode } from 'react';
import { useT } from '../platform/i18n';
import { UI } from '../platform/strings';
import './result.css';

// The top of every end screen: a medal for a win, a split medal for a draw, a calm badge for a
// loss, a star for a solo score; then the big title. Below it, ScoreDuel shows the two sides.

export type ResultOutcome = 'win' | 'loss' | 'tie' | 'none';

const CONFETTI = ['#f3b61f', '#d6336c', '#1f6f8b', '#13805c', '#f08c00', '#7048e8', '#e03131', '#0ca678', '#f3b61f', '#1971c2', '#d6336c', '#13805c'];

function Medal({ outcome }: { outcome: ResultOutcome }) {
  if (outcome === 'loss') {
    return (
      <svg viewBox="0 0 96 96" className="rh-medal" aria-hidden="true">
        <circle cx="48" cy="48" r="40" fill="#e7eefa" stroke="#9fb3d6" strokeWidth="4" />
        <path d="M30 52c4 9 11 14 18 14s14-5 18-14" fill="none" stroke="#2f5c9a" strokeWidth="5" strokeLinecap="round" />
        <path d="M33 38h8M55 38h8" stroke="#2f5c9a" strokeWidth="5" strokeLinecap="round" />
      </svg>
    );
  }
  if (outcome === 'none') {
    return (
      <svg viewBox="0 0 96 96" className="rh-medal" aria-hidden="true">
        <circle cx="48" cy="48" r="40" fill="#fff3c4" stroke="#f3b61f" strokeWidth="4" />
        <path d="M48 20l8.2 16.6 18.3 2.7-13.2 12.9 3.1 18.2L48 61.8l-16.4 8.6 3.1-18.2-13.2-12.9 18.3-2.7z" fill="#f3b61f" stroke="#b07d00" strokeWidth="2.5" strokeLinejoin="round" />
      </svg>
    );
  }
  const tie = outcome === 'tie';
  return (
    <svg viewBox="0 0 96 112" className="rh-medal tall" aria-hidden="true">
      <path d="M30 4h14l8 34H38z" fill="#c62f2f" />
      <path d="M66 4H52l-8 34h14z" fill="#1f3a93" />
      {tie ? (
        <>
          <path d="M48 34a35 35 0 0 0 0 70z" fill="#f3b61f" stroke="#b07d00" strokeWidth="3" />
          <path d="M48 34a35 35 0 0 1 0 70z" fill="#d8dee9" stroke="#8a94a6" strokeWidth="3" />
          <text x="48" y="79" textAnchor="middle" fontSize="30" fontWeight="900" fill="#5b4300" fontFamily="system-ui">=</text>
        </>
      ) : (
        <>
          <circle cx="48" cy="69" r="35" fill="#f3b61f" stroke="#b07d00" strokeWidth="3" />
          <circle cx="48" cy="69" r="26" fill="none" stroke="#fff3c4" strokeWidth="2.5" strokeDasharray="4 4" />
          <path d="M48 49l6 12.2 13.4 2-9.7 9.4 2.3 13.4L48 79.7l-12 6.3 2.3-13.4-9.7-9.4 13.4-2z" fill="#fff3c4" />
        </>
      )}
    </svg>
  );
}

export function ResultHero({ outcome, title, sub, tag }: { outcome: ResultOutcome; title: ReactNode; sub?: ReactNode; tag?: string }) {
  const t = useT(UI);
  const label = tag ?? (outcome === 'win' ? t('win') : outcome === 'loss' ? (t.lang === 'bn' ? 'ভালো খেলেছ' : 'Well played') : outcome === 'tie' ? t('tie') : '');
  return (
    <div className={`rh rh-${outcome}`}>
      {outcome === 'win' && (
        <div className="rh-confetti" aria-hidden="true">
          {CONFETTI.map((c, i) => <i key={i} style={{ ['--c' as string]: c, ['--i' as string]: i }} />)}
        </div>
      )}
      <Medal outcome={outcome} />
      {label && <span className="rh-tag">{label}</span>}
      <h2 className="rh-title">{title}</h2>
      {sub && <p className="rh-sub">{sub}</p>}
    </div>
  );
}

export interface DuelSide {
  name: string;
  /** A flag, a coloured initial or nothing. */
  badge?: ReactNode;
  score: ReactNode;
  /** A small line under the score, e.g. "6 overs". */
  note?: ReactNode;
  me?: boolean;
}

/** Two sides, side by side, with a crown over the winner. */
export function ScoreDuel({ a, b, winner, mid }: { a: DuelSide; b: DuelSide; winner: 0 | 1 | null; mid?: ReactNode }) {
  const side = (s: DuelSide, i: 0 | 1) => (
    <div className={`sd-side${winner === i ? ' won' : winner !== null ? ' lost' : ''}${s.me ? ' me' : ''}`}>
      <span className="sd-crown" aria-hidden="true">{winner === i ? <svg viewBox="0 0 32 20"><path d="M2 18 4 4l7 7 5-9 5 9 7-7 2 14z" fill="#f3b61f" stroke="#b07d00" strokeWidth="1.6" strokeLinejoin="round" /></svg> : null}</span>
      {s.badge && <span className="sd-badge">{s.badge}</span>}
      <b className="sd-name">{s.name}</b>
      <span className="sd-score">{s.score}</span>
      {s.note && <small className="sd-note">{s.note}</small>}
    </div>
  );
  return (
    <div className="sd" data-testid="score-duel">
      {side(a, 0)}
      <span className="sd-mid">{mid ?? '–'}</span>
      {side(b, 1)}
    </div>
  );
}
