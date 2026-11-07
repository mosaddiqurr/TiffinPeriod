import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSettings } from '../../platform/settings';
import { fmtNum, type Bi } from '../../platform/i18n';
import { sfx, vibrate } from '../../platform/audio';
import { readJSON, writeJSON } from '../../platform/storage';
import { flagUrl, getTeam, ratingOf, teamsFor, type Sport, type Team } from '../../shared/teams';
import { standings, type Fixture, type Tournament } from '../../shared/tournament';
import type { BallEvent } from '../../shared/cricket';
import { DOODLES } from '../Doodles';
import { getGame } from '../../platform/registry';
import './sport.css';

// Shared parts for the national-team games: flags, team choice, the cup board,
// the chase display, the coin toss and the championship celebration.

export function useTx() {
  const { lang } = useSettings();
  return {
    lang,
    t: (en: string, bn: string) => (lang === 'bn' ? bn : en),
    n: (v: number | string) => fmtNum(v, lang),
    bi: (b: Bi) => b[lang],
  };
}
export type Tx = ReturnType<typeof useTx>;

export function Flag({ id, size = 36, className = '' }: { id: string; size?: number; className?: string }) {
  return <img className={`flag ${className}`} src={flagUrl(id)} width={size} height={Math.round(size * 2 / 3)} alt="" draggable={false} />;
}

export const favTeam = (sport: Sport): string => readJSON<string>(`fav.${sport}`, 'ban');
export const setFavTeam = (sport: Sport, id: string) => writeJSON(`fav.${sport}`, id);

/** Mix a hex colour toward black (k < 0) or white (k > 0). */
export function tint(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}
const lum = (hex: string) => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
/** A deep version of the kit colour that white text can sit on. */
const deep = (hex: string) => tint(hex, lum(hex) > 0.75 ? -0.62 : lum(hex) > 0.5 ? -0.45 : -0.2);
/** The colour a team is known by: white kits use their trim colour instead. */
const face = (t: Team) => (lum(t.kit[0]) > 0.8 && lum(t.kit[1]) < 0.8 ? t.kit[1] : t.kit[0]);

/** A flag on a pole-less cloth: soft folds, a sheen and a slight turn toward the centre. */
export function WaveFlag({ id, size = 72, turn = 0, className = '' }: { id: string; size?: number; turn?: number; className?: string }) {
  return (
    <span className={`wflag ${className}`} style={{ width: size, height: Math.round(size * 2 / 3), ['--turn' as string]: `${turn}deg` }} aria-hidden="true">
      <img src={flagUrl(id)} alt="" draggable={false} />
    </span>
  );
}

function Strength({ n, label }: { n: number; label: string }) {
  return (
    <span className="tstrength" aria-label={label} title={label}>
      {Array.from({ length: 5 }, (_, i) => <i key={i} className={i < n ? 'on' : ''} />)}
    </span>
  );
}

/** Every nation as a tile. The selected one wears its kit colour. */
export function TeamGrid({ sport, value, onChange, exclude, label, excludeTag }: { sport: Sport; value: string; onChange: (id: string) => void; exclude?: string; label: string; excludeTag?: string }) {
  const x = useTx();
  const list = [...teamsFor(sport)].sort((a, b) => ratingOf(b, sport) - ratingOf(a, sport) || x.bi(a.name).localeCompare(x.bi(b.name)));
  return (
    <div className="tgrid" role="group" aria-label={label}>
      {list.map((tm) => {
        const on = tm.id === value;
        const off = tm.id === exclude;
        const r = Math.round(ratingOf(tm, sport) / 2);
        return (
          <button key={tm.id} type="button" className={`ttile ${on ? 'on' : ''}`} aria-pressed={on} disabled={off}
            onClick={() => { sfx('click'); onChange(tm.id); }} data-testid={`team-${tm.id}`}
            style={{ ['--kit' as string]: face(tm), ['--deep' as string]: deep(face(tm)), ['--trim' as string]: tm.kit[1] }}>
            <WaveFlag id={tm.id} size={52} />
            <span className="ttile-name">{x.bi(tm.name)}</span>
            <span className="ttile-meta"><b>{tm.code}</b><Strength n={r} label={x.t(`Strength ${r} of 5`, `শক্তি ৫-এ ${x.n(r)}`)} /></span>
            {on && <span className="ttile-check" aria-hidden="true">✓</span>}
            {off && <span className="ttile-tag">{excludeTag ?? 'VS'}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Two nations face to face, like a match poster. Tap a side to change it. */
export function MatchUp({ sport, mine, opp, onMine, onOpp, oppLocked, oppMystery, mineLabel, oppLabel }: {
  sport: Sport; mine: string; opp: string; onMine: (id: string) => void; onOpp?: (id: string) => void; oppLocked?: boolean; oppMystery?: boolean; mineLabel?: string; oppLabel?: string;
}) {
  const x = useTx();
  const [edit, setEdit] = useState<'mine' | 'opp' | null>(null);
  const a = getTeam(mine), b = getTeam(opp);
  const lockOpp = oppLocked || !onOpp;
  const style = {
    ['--a' as string]: face(a), ['--a2' as string]: deep(face(a)), ['--at' as string]: a.kit[1],
    ['--b' as string]: oppMystery ? '#3a4a5e' : face(b), ['--b2' as string]: oppMystery ? '#1d2633' : deep(face(b)), ['--bt' as string]: oppMystery ? '#8aa0b8' : b.kit[1],
  };
  const side = (tm: Team, which: 'mine' | 'opp', lab: string) => {
    const locked = which === 'opp' && lockOpp;
    const mystery = which === 'opp' && oppMystery;
    const r = Math.round(ratingOf(tm, sport) / 2);
    return (
      <button type="button" className={`mu-side ${which} ${edit === which ? 'editing' : ''} ${locked ? 'locked' : ''}`}
        onClick={() => { if (locked) return; sfx('click'); setEdit(edit === which ? null : which); }}
        data-testid={`pick-${which}`} aria-expanded={locked ? undefined : edit === which} aria-disabled={locked || undefined}>
        <span className="mu-tag">{lab}</span>
        {!mystery && <span className="mu-mark" aria-hidden="true">{tm.code}</span>}
        <span className="mu-flag" key={mystery ? 'q' : tm.id}>
          {mystery ? <span className="mu-mystery" aria-hidden="true">?</span> : <WaveFlag id={tm.id} size={84} turn={which === 'mine' ? 10 : -10} />}
        </span>
        <b className="mu-name">{mystery ? x.t('Different every level', 'প্রতি লেভেলে আলাদা') : x.bi(tm.name)}</b>
        {!mystery && <Strength n={r} label={x.t(`Strength ${r} of 5`, `শক্তি ৫-এ ${x.n(r)}`)} />}
        {!locked && <span className="mu-change">{edit === which ? x.t('Close', 'বন্ধ') : x.t('Change', 'বদলাও')}<i aria-hidden="true">{edit === which ? '▴' : '▾'}</i></span>}
      </button>
    );
  };
  return (
    <div className="mu" style={style}>
      <div className="mu-board">
        {side(a, 'mine', mineLabel ?? x.t('Your team', 'তোমার দল'))}
        <div className="mu-vs" aria-hidden="true"><span>VS</span></div>
        {side(b, 'opp', oppLabel ?? x.t('Opponent', 'প্রতিপক্ষ'))}
      </div>
      {edit && (
        <div className={`mu-picker ${edit}`}>
          <div className="mu-picker-head">
            <b>{edit === 'mine' ? (mineLabel ? x.t(`${mineLabel}: choose a country`, `${mineLabel}: দেশ বাছো`) : x.t('Choose your country', 'তোমার দেশ বাছো')) : (oppLabel ? x.t(`${oppLabel}: choose a country`, `${oppLabel}: দেশ বাছো`) : x.t('Choose the opponent', 'প্রতিপক্ষ বাছো'))}</b>
            <button type="button" className="mu-close" onClick={() => setEdit(null)} aria-label={x.t('Close', 'বন্ধ')}>✕</button>
          </div>
          <TeamGrid sport={sport} label={edit === 'mine' ? x.t('Your team', 'তোমার দল') : x.t('Opponent', 'প্রতিপক্ষ')}
            value={edit === 'mine' ? mine : opp} exclude={edit === 'mine' ? opp : mine}
            excludeTag={edit === 'mine' ? x.t('Opponent', 'প্রতিপক্ষ') : x.t('Your team', 'তোমার দল')}
            onChange={(id) => { if (edit === 'mine') onMine(id); else onOpp?.(id); setEdit(null); }} />
        </div>
      )}
    </div>
  );
}

/** A big mode card on a game's menu. */
/** The top of a game's menu: its drawing, a small label, the title and one line. */
export function HubHero({ id, eyebrow, title, lede }: { id: string; eyebrow: string; title: string; lede: string }) {
  const Doodle = DOODLES[id];
  const accent = getGame(id)?.accent;
  return (
    <header className="hub-hero" style={accent ? { ['--accent' as string]: accent } : undefined}>
      <div className="hub-hero-text">
        <span className="hub-chip">{eyebrow}</span>
        <h2>{title}</h2>
        <p className="lede">{lede}</p>
      </div>
      {Doodle && <div className="hub-hero-art" aria-hidden="true"><Doodle accent={accent} /></div>}
    </header>
  );
}

export function ModeCard({ icon, title, sub, onClick, badge, testid }: { icon: ReactNode; title: string; sub: string; onClick: () => void; badge?: string; testid?: string }) {
  return (
    <button type="button" className="mode-card" onClick={() => { sfx('click'); onClick(); }} data-testid={testid}>
      <span className="mc-icon" aria-hidden="true">{icon}</span>
      <span className="mc-text"><b>{title}</b><small>{sub}</small></span>
      {badge && <span className="mc-badge">{badge}</span>}
    </button>
  );
}

// ---------- Cup board ----------

export function stageName(x: Tx, f: Pick<Fixture, 'stage' | 'day'>): string {
  if (f.stage === 'final') return x.t('Final', 'ফাইনাল');
  if (f.stage === 'sf') return x.t('Semi-final', 'সেমিফাইনাল');
  return x.t(`Group match ${f.day}`, `গ্রুপ ম্যাচ ${fmtNum(f.day, x.lang)}`);
}

function scoreText(x: Tx, t: Tournament, f: Fixture): string {
  if (!f.played || !f.score) return x.t('vs', 'বনাম');
  let s = `${x.n(f.score[0])} – ${x.n(f.score[1])}`;
  if (f.note?.startsWith('pens:')) s += ` (${x.t('pens', 'টাইব্রেকার')} ${x.n(f.note.slice(5).replace('-', '–'))})`;
  else if (f.note === 'super') s += ` (${x.t('super over', 'সুপার ওভার')})`;
  else if (f.note === 'golden') s += ` (${x.t('golden goal', 'গোল্ডেন গোল')})`;
  void t;
  return s;
}

export function CupBoard({ t }: { t: Tournament }) {
  const x = useTx();
  const cricket = t.sport === 'cricket';
  const ko = t.fixtures.filter((f) => f.stage !== 'group');
  const mineFx = t.fixtures.filter((f) => f.home === t.player || f.away === t.player);
  return (
    <div className="cup-board">
      <div className="cup-groups">
        {(['A', 'B'] as const).map((g) => (
          <table key={g} className="cup-table">
            <caption>{x.t(`Group ${g}`, `গ্রুপ ${g === 'A' ? 'ক' : 'খ'}`)}</caption>
            <thead><tr><th>{x.t('Team', 'দল')}</th><th>{x.t('P', 'খে')}</th><th>{x.t('W', 'জ')}</th><th>{cricket ? x.t('T', 'টা') : x.t('D', 'ড্র')}</th><th>{x.t('L', 'হা')}</th><th>{cricket ? 'NRR' : x.t('GD', 'গো.ব্য')}</th><th>{x.t('Pts', 'পয়েন্ট')}</th></tr></thead>
            <tbody>
              {standings(t, g).map((r, i) => (
                <tr key={r.team} className={`${r.team === t.player ? 'me' : ''} ${i < 2 ? 'q' : ''}`}>
                  <td><Flag id={r.team} size={22} /> {getTeam(r.team).code}</td>
                  <td>{x.n(r.p)}</td><td>{x.n(r.w)}</td><td>{x.n(r.d)}</td><td>{x.n(r.l)}</td>
                  <td>{cricket ? x.n((r.nrr >= 0 ? '+' : '') + r.nrr.toFixed(2)) : x.n((r.gf - r.ga > 0 ? '+' : '') + (r.gf - r.ga))}</td>
                  <td><b>{x.n(r.pts)}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>
      <div className="cup-bracket" aria-label={x.t('Knockouts', 'নকআউট')}>
        {(['SF1', 'SF2', 'F'] as const).map((id) => {
          const f = ko.find((k) => k.id === id);
          return (
            <div key={id} className={`bk ${id === 'F' ? 'final' : ''}`}>
              <small>{id === 'F' ? x.t('Final', 'ফাইনাল') : x.t('Semi-final', 'সেমিফাইনাল')}</small>
              {f ? (
                <>
                  <div className={`bk-team ${f.winner === f.home ? 'won' : ''}`}><Flag id={f.home} size={22} /> {getTeam(f.home).code}{f.played && f.score && <b>{x.n(f.score[0])}</b>}</div>
                  <div className={`bk-team ${f.winner === f.away ? 'won' : ''}`}><Flag id={f.away} size={22} /> {getTeam(f.away).code}{f.played && f.score && <b>{x.n(f.score[1])}</b>}</div>
                  {f.note && <small className="bk-note">{scoreText(x, t, f).replace(/^[^(]*/, '')}</small>}
                </>
              ) : <div className="bk-team tbd">{x.t('To be decided', 'পরে ঠিক হবে')}</div>}
            </div>
          );
        })}
        {t.champion && <div className="bk champ"><small>{x.t('Champion', 'চ্যাম্পিয়ন')}</small><div className="bk-team won"><Flag id={t.champion} size={28} /> {x.bi(getTeam(t.champion).name)}</div></div>}
      </div>
      <h3 className="cup-h">{x.t('Your matches', 'তোমার ম্যাচ')}</h3>
      <ol className="cup-fixtures">
        {mineFx.map((f) => {
          const res = !f.played ? '' : f.winner === t.player ? 'won' : f.winner === null ? 'tied' : 'lost';
          return (
            <li key={f.id} className={res}>
              <span className="st">{stageName(x, f)}</span>
              <span className="tm"><Flag id={f.home} size={20} /> {getTeam(f.home).code}</span>
              <span className="sc">{scoreText(x, t, f)}</span>
              <span className="tm"><Flag id={f.away} size={20} /> {getTeam(f.away).code}</span>
              <span className="rs">{res === 'won' ? x.t('Won', 'জয়') : res === 'lost' ? x.t('Lost', 'হার') : res === 'tied' ? x.t('Tied', 'টাই') : ''}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ---------- Chase display ----------

export interface ChaseInfo {
  target: number;
  runs: number;
  wickets: number;
  maxWickets: number;
  balls: number;
  maxBalls: number | null;
  /** A typical scoring rate per ball in this game, to judge the pressure. */
  par: number;
  events: BallEvent[];
  name: string;
}

export function pressureOf(c: ChaseInfo): number {
  const need = Math.max(0, c.target - c.runs);
  if (need === 0) return 0;
  const wl = c.maxWickets - c.wickets;
  const bl = c.maxBalls === null ? Math.max(6, wl * 5) : c.maxBalls - c.balls;
  if (bl <= 0 || wl <= 0) return 1;
  const rate = need / bl / c.par;
  const wk = wl === 1 ? 0.25 : wl === 2 ? 0.1 : 0;
  return Math.max(0, Math.min(1, (rate - 0.45) / 1.3 + wk + (bl <= 3 ? 0.15 : 0)));
}

export function ChaseHud({ c }: { c: ChaseInfo }) {
  const x = useTx();
  const need = Math.max(0, c.target - c.runs);
  const bl = c.maxBalls === null ? null : Math.max(0, c.maxBalls - c.balls);
  const wl = c.maxWickets - c.wickets;
  const p = pressureOf(c);
  const rrr = bl ? (need / bl) * 6 : 0;
  const crr = c.balls ? (c.runs / c.balls) * 6 : 0;
  const lastBall = bl === 1 && need > 0;
  useEffect(() => { if (lastBall) { sfx('tick'); vibrate(15); } }, [lastBall]);
  const legal = c.events.filter((e) => e.legal);
  return (
    <div className={`chase-hud ${p > 0.7 ? 'hot' : p > 0.4 ? 'warm' : ''}`} data-testid="chase-hud" aria-live="polite">
      <div className="ch-need">
        {need === 0 ? <b>{x.t('Target reached!', 'লক্ষ্য পূরণ!')}</b> : bl !== null ? (
          <b>{x.t(`Need ${need} from ${bl} ${bl === 1 ? 'ball' : 'balls'}`, `${x.n(bl)} বলে লাগবে ${x.n(need)}`)}</b>
        ) : <b>{x.t(`Need ${need}`, `লাগবে ${x.n(need)}`)}</b>}
        {lastBall && <span className="ch-last">{x.t('LAST BALL!', 'শেষ বল!')}</span>}
      </div>
      <div className="ch-row">
        <span>{x.t('Target', 'লক্ষ্য')} <b>{x.n(c.target)}</b></span>
        {bl !== null && <span>{x.t('Req. rate', 'প্রয়োজনীয় রানরেট')} <b>{x.n(rrr.toFixed(1))}</b></span>}
        <span>{x.t('Run rate', 'রানরেট')} <b>{x.n(crr.toFixed(1))}</b></span>
      </div>
      <div className="ch-row">
        <span className="ch-wk" aria-label={x.t(`${wl} wickets left`, `${x.n(wl)} উইকেট বাকি`)}>
          {Array.from({ length: c.maxWickets }, (_, i) => <i key={i} className={i < wl ? 'up' : 'down'} />)}
        </span>
        {c.maxBalls !== null && c.maxBalls <= 36 && (
          <span className="ch-balls" aria-hidden="true">
            {Array.from({ length: c.maxBalls }, (_, i) => {
              const e = legal[i];
              return <i key={i} className={!e ? '' : e.out ? 'w' : e.runs >= 6 ? 's' : e.runs >= 4 ? 'f' : e.runs === 0 ? 'd' : 'r'} />;
            })}
          </span>
        )}
      </div>
      <div className="ch-press" aria-label={x.t('Pressure', 'চাপ')}>
        <span>{x.t('Pressure', 'চাপ')}</span>
        <div className="bar"><div style={{ width: `${Math.round(p * 100)}%` }} /></div>
      </div>
    </div>
  );
}

// ---------- Coin toss ----------

export function CoinToss({ names, vsAI, onDone, aiPrefersBat = 0.5 }: { names: [string, string]; vsAI: boolean; onDone: (side0BatsFirst: boolean) => void; aiPrefersBat?: number }) {
  const x = useTx();
  const [call, setCall] = useState<'h' | 't' | null>(null);
  const [face, setFace] = useState<'h' | 't' | null>(null);
  const [aiChoice] = useState(() => Math.random() < aiPrefersBat);
  const flip = (c: 'h' | 't') => {
    setCall(c); sfx('whoosh');
    window.setTimeout(() => { const f = Math.random() < 0.5 ? 'h' : 't'; setFace(f); sfx('good'); }, 1100);
  };
  const winner = face && call ? (face === call ? 0 : 1) : null;
  const fname = (f: 'h' | 't') => (f === 'h' ? x.t('Heads', 'হেড') : x.t('Tails', 'টেল'));
  return (
    <div className="sheet ruled toss-sheet" data-testid="toss">
      <h2>{x.t('Toss', 'টস')}</h2>
      <div className={`coin ${call && !face ? 'spinning' : ''}`} aria-hidden="true"><span>{face ? (face === 'h' ? '৳' : '★') : '?'}</span></div>
      {!call && (
        <>
          <p className="lede">{x.t(`${names[0]}, call it.`, `${names[0]}, ডাকো।`)}</p>
          <div className="actions"><button className="btn big" onClick={() => flip('h')} data-testid="call-heads">{fname('h')}</button><button className="btn big secondary" onClick={() => flip('t')}>{fname('t')}</button></div>
        </>
      )}
      {call && !face && <p className="lede">{x.t('The coin is in the air…', 'কয়েন শূন্যে…')}</p>}
      {winner !== null && (
        <>
          <p className="lede">{fname(face!)}! <b>{x.t(`${names[winner]} won the toss.`, `${names[winner]} টস জিতেছে।`)}</b></p>
          {vsAI && winner === 1 ? (
            <>
              <p>{x.t(`${names[1]} chose to ${aiChoice ? 'bat first' : 'bowl first'}.`, `${names[1]} ${aiChoice ? 'আগে ব্যাট' : 'আগে বল'} নিয়েছে।`)}</p>
              <div className="actions"><button className="btn big" autoFocus onClick={() => onDone(!aiChoice)} data-testid="toss-continue">{x.t('Continue', 'চলো')}</button></div>
            </>
          ) : (
            <div className="actions">
              <button className="btn big" onClick={() => onDone(winner === 0)} data-testid="bat-first">{x.t('Bat first', 'আগে ব্যাট')}</button>
              <button className="btn big secondary" onClick={() => onDone(winner !== 0)} data-testid="bowl-first">{x.t('Bowl first', 'আগে বল')}</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------- Celebration ----------

export function Confetti({ count = 70 }: { count?: number }) {
  const bits = useMemo(() => Array.from({ length: count }, (_, i) => ({
    left: Math.random() * 100, delay: Math.random() * 1.6, dur: 2.4 + Math.random() * 2, rot: Math.random() * 360,
    color: ['#e3127d', '#ffc20e', '#009e96', '#e0333f', '#1f3a93', '#0b5d43'][i % 6], w: 6 + Math.random() * 6,
  })), [count]);
  return <div className="confetti" aria-hidden="true">{bits.map((b, i) => <i key={i} style={{ left: `${b.left}%`, animationDelay: `${b.delay}s`, animationDuration: `${b.dur}s`, background: b.color, width: b.w, transform: `rotate(${b.rot}deg)` }} />)}</div>;
}

export function Trophy({ size = 120 }: { size?: number }) {
  return (
    <svg viewBox="0 0 120 140" width={size} height={size * 140 / 120} aria-hidden="true" className="trophy">
      <path d="M30 18 h60 v18 c0 26 -14 42 -30 44 c-16 -2 -30 -18 -30 -44z" fill="#f3b61f" stroke="#8a5a00" strokeWidth="3" />
      <path d="M30 26 c-18 0 -20 26 2 30 M90 26 c18 0 20 26 -2 30" fill="none" stroke="#8a5a00" strokeWidth="5" />
      <path d="M44 28 c2 20 8 32 16 36" stroke="#fff6c8" strokeWidth="5" fill="none" opacity="0.7" strokeLinecap="round" />
      <rect x="52" y="80" width="16" height="22" fill="#e5a50f" stroke="#8a5a00" strokeWidth="3" />
      <rect x="34" y="102" width="52" height="16" rx="3" fill="#7a4a1d" stroke="#3d2408" strokeWidth="3" />
      <rect x="44" y="106" width="32" height="8" fill="#f3b61f" />
      <path d="M60 36 l4 8 9 1 -7 6 2 9 -8 -5 -8 5 2 -9 -7 -6 9 -1z" fill="#fff6c8" />
    </svg>
  );
}

export function Championship({ team, title, lines, onDone, actionLabel }: { team: string; title: string; lines: string[]; onDone: () => void; actionLabel: string }) {
  const x = useTx();
  useEffect(() => { sfx('fanfare'); const id = window.setTimeout(() => sfx('clap'), 700); vibrate([40, 60, 40, 60, 120]); return () => clearTimeout(id); }, []);
  return (
    <div className="overlay champ-overlay" role="dialog" aria-modal="true" aria-label={title} data-testid="champion">
      <Confetti />
      <div className="champ-card">
        <Trophy />
        <div className="champ-flag"><Flag id={team} size={96} /></div>
        <h2>{title}</h2>
        <p className="champ-team">{x.bi(getTeam(team).name)}</p>
        {lines.map((l) => <p key={l} className="champ-line">{l}</p>)}
        <button className="btn big" onClick={onDone} autoFocus data-testid="champ-done">{actionLabel}</button>
      </div>
    </div>
  );
}

/** A short scoreboard strip with both flags. */
export function FlagScore({ a, b, sa, sb, mid }: { a: string; b: string; sa: ReactNode; sb: ReactNode; mid?: ReactNode }) {
  return (
    <div className="flag-score">
      <span className="fs-team"><Flag id={a} size={30} /><b>{getTeam(a).code}</b></span>
      <span className="fs-num">{sa}</span>
      <span className="fs-mid">{mid ?? '–'}</span>
      <span className="fs-num">{sb}</span>
      <span className="fs-team"><b>{getTeam(b).code}</b><Flag id={b} size={30} /></span>
    </div>
  );
}
