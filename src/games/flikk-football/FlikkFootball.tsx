import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { GameProps } from '../../platform/registry';
import { GameCanvas } from '../../engine/GameCanvas';
import { recordResult, getStats, unlockAchievement } from '../../platform/scores';
import { readJSON, writeJSON } from '../../platform/storage';
import { sfx } from '../../platform/audio';
import { PauseMenu, Seg, useGameBar, usePlayerNames, type Difficulty } from '../../components/ui';
import { Championship, CupBoard, Flag, FlagScore, MatchUp, ModeCard, TeamGrid, favTeam, setFavTeam, stageName, useTx } from '../../components/sport/SportKit';
import { defaultOpponent, getTeam, ratingOf } from '../../shared/teams';
import { createTournament, footballSimulator, loadTournament, nextFixture, playerResult, saveTournament, type Tournament } from '../../shared/tournament';
import { FORMATION_IDS, type TeamSetup } from './match';
import { FlikkScene, type FlikkConfig, type FlikkEnd, type FlikkHud, type Say } from './scene';
import { CHALLENGES, achieved, loadChStars, saveChStars, starsOf, type FChallenge } from './challenges';
import type { Side } from './physics';
import { FLICKS_PER_TURN, type Style } from './fixed';
import { FormationPreview, Tactics, rulesList } from './parts';
import { OnlineFlikk } from './online';
import { OnlineButton, useOnlineEntry } from '../../components/online/OnlineButton';
import { ResultHero, ScoreDuel } from '../../components/Result';
import './flikk.css';

export { FormationPreview };

const GAME = 'flikk-football';
type Screen = 'menu' | 'quick' | 'local' | 'challenges' | 'cup' | 'match' | 'after' | 'champion';
type Kind = 'quick' | 'local' | 'challenge' | 'cup';
const LENGTHS = { short: 12, normal: 18, long: 26 } as const;
type Len = keyof typeof LENGTHS;
/** Fixed style: every flick is a step of the clock, so a match has more of them. */
const FIXED_CLOCK = 2.5;
const clock = (style: Style, turns: number) => (style === 'fixed' ? Math.round(turns * FIXED_CLOCK) : turns);
const loadStyle = (): Style => (readJSON<string>('ff.style', 'fixed') === 'free' ? 'free' : 'fixed');

interface Pending { kind: Kind; cfg: FlikkConfig; names: [string, string]; ch?: FChallenge; occasion?: string }
interface AfterInfo { p: Pending; e: FlikkEnd; stars?: number; cupNote?: 'won' | 'out' }

const SKILL: Record<Difficulty, number> = { easy: 0.35, medium: 0.65, hard: 0.92 };
const skillFor = (d: Difficulty, opp: string) => Math.max(0.2, Math.min(0.97, SKILL[d] + (ratingOf(getTeam(opp), 'football') - 7) * 0.03));
const autoDiff = (opp: string): Difficulty => { const r = ratingOf(getTeam(opp), 'football'); return r >= 9 ? 'hard' : r >= 7 ? 'medium' : 'easy'; };

function HubBar({ help, lang }: { help: ReactNode; lang: string }) { useGameBar({ help }, [lang]); return null; }

export default function FlikkFootball({ onExit }: GameProps) {
  const x = useTx();
  const { t, n } = x;
  void onExit;
  const [p1, p2] = usePlayerNames();
  const online = useOnlineEntry();
  const [screen, setScreen] = useState<Screen>('menu');
  const [mine, setMine] = useState(() => favTeam('football'));
  const [opp, setOpp] = useState(() => defaultOpponent('football', favTeam('football')));
  const [setup, setSetup] = useState<TeamSetup>({ formation: '4-3-3', mentality: 'balanced' });
  const [setup2, setSetup2] = useState<TeamSetup>({ formation: '4-4-2', mentality: 'balanced' });
  const [diff, setDiff] = useState<Difficulty | 'auto'>('auto');
  const [len, setLen] = useState<Len>('short');
  const [style, setStyleState] = useState<Style>(loadStyle);
  const setStyle = (s: Style) => { setStyleState(s); writeJSON('ff.style', s); };
  const [pending, setPending] = useState<Pending | null>(null);
  const [matchKey, setMatchKey] = useState(0);
  const [after, setAfter] = useState<AfterInfo | null>(null);
  const [cup, setCup] = useState<Tournament | null>(() => loadTournament(GAME));
  const [chStars, setChStars] = useState(loadChStars);
  const sim = useMemo(() => footballSimulator(), []);
  const help = <ol>{rulesList(t, style).map((r) => <li key={r}>{r}</li>)}</ol>;
  const name = (id: string) => x.bi(getTeam(id).name);
  const chooseMine = (id: string) => { setMine(id); setFavTeam('football', id); if (id === opp) setOpp(defaultOpponent('football', id)); };

  const aiSetup = (o: string, seed: number): TeamSetup => ({ formation: FORMATION_IDS[(seed >> 3) % FORMATION_IDS.length], mentality: ratingOf(getTeam(o), 'football') >= 8 ? 'attack' : 'balanced' });
  const base = (o: string, d: Difficulty): FlikkConfig => {
    const seed = (Math.random() * 2 ** 31) >>> 0;
    return { style, teams: [mine, o], setups: [setup, aiSetup(o, seed)], vsAI: true, skill: skillFor(d, o), totalTurns: clock(style, LENGTHS[len]), score: [0, 0], turnsDone: 0, startMinute: 0, kicking: 0, setup: 'kickoff', knockout: false, seed };
  };
  const launch = (p: Pending) => { setPending(p); setMatchKey((k) => k + 1); setScreen('match'); sfx('bell'); };

  const startQuick = () => launch({ kind: 'quick', cfg: base(opp, diff === 'auto' ? autoDiff(opp) : diff), names: [name(mine), name(opp)] });
  const startLocal = () => {
    const c = base(opp, 'medium');
    launch({ kind: 'local', cfg: { ...c, vsAI: false, setups: [setup, setup2] }, names: [`${p1} (${getTeam(mine).code})`, `${p2} (${getTeam(opp).code})`] });
  };
  const startChallenge = (ch: FChallenge) => {
    const seed = (Math.random() * 2 ** 31) >>> 0;
    launch({
      kind: 'challenge', ch, names: [name(mine), name(ch.opp)], occasion: x.bi(ch.title),
      cfg: { style, teams: [mine, ch.opp], setups: [setup, aiSetup(ch.opp, seed)], vsAI: true, skill: ch.skill, totalTurns: clock(style, ch.turns), score: [...ch.score] as [number, number], turnsDone: 0, startMinute: ch.minute, kicking: ch.kicking, setup: ch.setup, knockout: false, stopAtGoals: ch.goal === 'score' ? ch.score[0] + (ch.n ?? 1) : undefined, seed },
    });
  };
  const startCup = (tour: Tournament) => {
    const f = nextFixture(tour);
    if (!f) return;
    const o = f.home === tour.player ? f.away : f.home;
    const c = base(o, autoDiff(o));
    launch({ kind: 'cup', cfg: { ...c, teams: [tour.player, o], totalTurns: clock(style, LENGTHS.short), knockout: f.stage !== 'group' }, names: [name(tour.player), name(o)], occasion: stageName(x, f) });
  };

  const done = (e: FlikkEnd) => {
    const p = pending!;
    const a: AfterInfo = { p, e };
    const vsAI = p.cfg.vsAI;
    const outcome = !vsAI ? 'none' : e.winner === null ? 'tie' : e.winner === 0 ? 'win' : 'loss';
    let cupsWon = 0;
    if (p.kind === 'challenge' && p.ch) {
      const st = starsOf(p.ch, e.score, e.winner);
      a.stars = st;
      if (st) { setChStars(saveChStars(p.ch.id, st)); if (p.ch.goal === 'win' || p.ch.goal === 'score') unlockAchievement('ff-comeback'); }
    }
    if (p.kind === 'cup' && cup) {
      const f = nextFixture(cup)!;
      const homeIsMe = f.home === cup.player;
      const score: [number, number] = homeIsMe ? e.score : [e.score[1], e.score[0]];
      const winnerTeam = e.winner === null ? null : p.cfg.teams[e.winner];
      const note = e.pens ? `pens:${homeIsMe ? e.pens[0] : e.pens[1]}-${homeIsMe ? e.pens[1] : e.pens[0]}` : e.golden && winnerTeam ? 'golden' : undefined;
      const next = playerResult(cup, f.id, { score, winner: winnerTeam, note }, sim);
      setCup(next); saveTournament(next, GAME);
      if (next.status === 'won') { a.cupNote = 'won'; cupsWon = (getStats(GAME).records.cupsWon ?? 0) + 1; }
      else if (next.status === 'out') a.cupNote = 'out';
    }
    recordResult(GAME, { outcome, score: vsAI ? e.score[0] : undefined, records: cupsWon ? { cupsWon } : {} }, () => {
      const ids: string[] = [];
      if (vsAI && e.winner === 0) ids.push('ff-win');
      if (cupsWon) ids.push('ff-cup');
      return ids;
    });
    setAfter(a);
    setScreen('after');
  };

  if (online.open) return <div className="sport-root ruled"><OnlineFlikk onBack={online.close} code={online.code} /></div>;

  if (screen === 'match' && pending) {
    return <FlikkMatch key={matchKey} p={pending} onDone={done} onQuit={() => setScreen(pending.kind === 'cup' ? 'cup' : 'menu')} onRestart={() => launch({ ...pending, cfg: { ...pending.cfg, seed: pending.cfg.seed + 1 } })} />;
  }

  if (screen === 'champion' && cup) {
    return <div className="sport-root ruled"><Championship team={cup.player} title={t('CHAMPIONS!', 'চ্যাম্পিয়ন!')} lines={[t('The Desk World Cup is yours.', 'ডেস্ক বিশ্বকাপ তোমার।'), t('Flicked all the way to glory.', 'টোকায় টোকায় শিরোপা।')]} actionLabel={t('See the cup board', 'কাপের বোর্ড দেখো')} onDone={() => setScreen('cup')} /></div>;
  }

  if (screen === 'after' && after) {
    const { p, e } = after;
    const w = e.winner;
    const title = w === null ? t('A draw!', 'ড্র!') : t(`${p.names[w]} win!`, `${p.names[w]} জিতেছে!`);
    const rows: Array<[string, string | number]> = [
      [t('Score', 'স্কোর'), `${n(e.score[0])} – ${n(e.score[1])}${e.pens ? ` (${t('pens', 'টাইব্রেকার')} ${n(e.pens[0])}–${n(e.pens[1])})` : e.golden && w !== null ? ` (${t('golden goal', 'গোল্ডেন গোল')})` : ''}`],
      [t('Passes', 'পাস'), `${n(e.stats.passes[0])} – ${n(e.stats.passes[1])}`],
      [t('Shots', 'শট'), `${n(e.stats.shots[0])} – ${n(e.stats.shots[1])}`],
    ];
    if (after.stars !== undefined && p.ch) rows.push([t('Challenge', 'চ্যালেঞ্জ'), achieved(p.ch, e.score, e.winner) ? '★'.repeat(after.stars) : t('Not this time', 'এবার হলো না')]);
    const stamp = !p.cfg.vsAI ? null : p.kind === 'challenge' ? (after.stars ? 'win' : 'loss') : w === null ? 'tie' : w === 0 ? 'win' : 'loss';
    return (
      <div className="sport-root ruled">
        <div className="overlay" role="dialog" aria-modal="true" aria-label={title}>
          <div className="report result-card" data-testid="result">
            <div className="school">{p.occasion ?? t('Flikk Football', 'ফ্লিক ফুটবল')}</div>
            <ResultHero outcome={stamp ?? (w === null ? 'tie' : 'none')} title={title} sub={after.cupNote === 'out' ? t('Out of the cup this time.', 'এবার কাপ থেকে বিদায়।') : undefined} />
            <ScoreDuel winner={w === null ? null : w} mid={t('FT', 'শেষ')}
              a={{ name: x.bi(getTeam(p.cfg.teams[0]).name), badge: <Flag id={p.cfg.teams[0]} size={34} />, score: n(e.score[0]), me: p.cfg.vsAI }}
              b={{ name: x.bi(getTeam(p.cfg.teams[1]).name), badge: <Flag id={p.cfg.teams[1]} size={34} />, score: n(e.score[1]) }} />
            <table><tbody>{rows.map(([k, v]) => <tr key={k}><td>{k}</td><td>{typeof v === 'number' ? n(v) : v}</td></tr>)}</tbody></table>
            <div className="actions">
              {p.kind === 'cup' ? <button className="btn big" autoFocus data-testid="after-next" onClick={() => setScreen(after.cupNote === 'won' ? 'champion' : 'cup')}>{after.cupNote === 'won' ? t('Lift the cup!', 'কাপ তোলো!') : t('Back to the cup', 'কাপে ফেরো')}</button>
                : p.kind === 'challenge' ? <><button className="btn big" autoFocus data-testid="after-retry" onClick={() => startChallenge(p.ch!)}>{t('Try again', 'আবার চেষ্টা')}</button><button className="btn secondary" onClick={() => setScreen('challenges')}>{t('All challenges', 'সব চ্যালেঞ্জ')}</button></>
                : <><button className="btn big" autoFocus data-testid="after-retry" onClick={() => launch({ ...p, cfg: { ...p.cfg, seed: (Math.random() * 2 ** 31) >>> 0 } })}>{t('Play again', 'আবার খেলো')}</button><button className="btn secondary" onClick={() => setScreen(p.kind === 'local' ? 'local' : 'quick')}>{t('Change teams', 'দল বদলাও')}</button></>}
              <button className="btn secondary" onClick={() => setScreen('menu')}>{t('Modes', 'খেলার ধরন')}</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const back = <button className="btn secondary sport-back" onClick={() => setScreen('menu')}>← {t('Modes', 'খেলার ধরন')}</button>;
  const kit = getTeam(mine).kit[0];
  let body: ReactNode;
  if (screen === 'menu') {
    const done = CHALLENGES.filter((c) => chStars[c.id]).length;
    body = <>
      <div className="sport-eyebrow">{t('Desk football', 'ডেস্কের ফুটবল')}</div>
      <h2>{t('Flikk Football', 'ফ্লিক ফুটবল')}</h2>
      <p className="lede">{t('Eleven bottle caps a side on a green desk. Pull, aim, flick: pass, curl and score.', 'সবুজ ডেস্কে প্রতি দলে এগারোটা গুটি। টানো, নিশানা করো, টোকা দাও: পাস, বাঁক আর গোল।')}</p>
      <OnlineButton onClick={online.show} />
      <StylePick value={style} onChange={setStyle} />
      <details className="bench-rules"><summary>{t('How to play', 'কীভাবে খেলবে')}</summary>{help}</details>
      <div className="mode-grid">
        <ModeCard testid="mode-quick" icon="⚽" title={t('Quick Match', 'কুইক ম্যাচ')} sub={t('Pick two countries, a formation and go.', 'দুই দেশ আর ফরমেশন বাছো, খেলা শুরু।')} onClick={() => setScreen('quick')} />
        <ModeCard testid="mode-challenge" icon="⏱️" title={t('Comeback Challenges', 'কামব্যাক চ্যালেঞ্জ')} sub={t('Late goals, tight leads and two-goal comebacks.', 'শেষ মুহূর্তের গোল, লিড ধরে রাখা, দুই গোলের কামব্যাক।')} badge={`${n(done)}/${n(CHALLENGES.length)}`} onClick={() => setScreen('challenges')} />
        <ModeCard testid="mode-cup" icon="🏆" title={t('Desk World Cup', 'ডেস্ক বিশ্বকাপ')} sub={t('Groups, semi-final and final. Golden goal in knockouts.', 'গ্রুপ, সেমিফাইনাল, ফাইনাল। নকআউটে গোল্ডেন গোল।')} badge={cup && nextFixture(cup) ? t('Continue', 'চালিয়ে যাও') : undefined} onClick={() => setScreen('cup')} />
        <ModeCard testid="mode-local" icon="👥" title={t('With a friend', 'বন্ধুর সাথে')} sub={t('Pass the device after each turn.', 'প্রতি পালার পর ফোন বদলাও।')} onClick={() => setScreen('local')} />
      </div>
    </>;
  } else if (screen === 'quick' || screen === 'local') {
    const local = screen === 'local';
    body = <>
      {back}
      <h2>{local ? t('With a friend', 'বন্ধুর সাথে') : t('Quick Match', 'কুইক ম্যাচ')}</h2>
      <StylePick value={style} onChange={setStyle} compact />
      <MatchUp sport="football" mine={mine} opp={opp} onMine={chooseMine} onOpp={setOpp} mineLabel={local ? p1 : undefined} oppLabel={local ? p2 : undefined} />
      <Tactics value={setup} onChange={setSetup} kit={kit} label={local ? t(`${p1}: formation`, `${p1}: ফরমেশন`) : undefined} />
      {local && <Tactics value={setup2} onChange={setSetup2} kit={getTeam(opp).kit[0]} label={t(`${p2}: formation`, `${p2}: ফরমেশন`)} />}
      {!local && <>
        <div className="opt-label">{t('Computer', 'কম্পিউটার')}</div>
        <Seg label={t('Computer', 'কম্পিউটার')} value={diff} onChange={setDiff} options={[{ v: 'auto', label: t('By team', 'দল অনুযায়ী') }, { v: 'easy', label: t('Easy', 'সহজ') }, { v: 'medium', label: t('Medium', 'মাঝারি') }, { v: 'hard', label: t('Hard', 'কঠিন') }]} />
      </>}
      <div className="opt-label">{t('Match length', 'ম্যাচের দৈর্ঘ্য')}</div>
      <Seg label={t('Match length', 'ম্যাচের দৈর্ঘ্য')} value={len} onChange={setLen} options={style === 'fixed'
        ? [{ v: 'short', label: t(`Short (${clock('fixed', LENGTHS.short)} flicks)`, `ছোট (${n(clock('fixed', LENGTHS.short))} টোকা)`) }, { v: 'normal', label: t(`Normal (${clock('fixed', LENGTHS.normal)})`, `মাঝারি (${n(clock('fixed', LENGTHS.normal))})`) }, { v: 'long', label: t(`Long (${clock('fixed', LENGTHS.long)})`, `লম্বা (${n(clock('fixed', LENGTHS.long))})`) }]
        : [{ v: 'short', label: t(`Short (${LENGTHS.short / 2} turns each)`, `ছোট (প্রতি দলে ${n(LENGTHS.short / 2)} পালা)`) }, { v: 'normal', label: t(`Normal (${LENGTHS.normal / 2})`, `মাঝারি (${n(LENGTHS.normal / 2)})`) }, { v: 'long', label: t(`Long (${LENGTHS.long / 2})`, `লম্বা (${n(LENGTHS.long / 2)})`) }]} />
      <div className="sport-actions"><button className="btn big" data-testid="start" onClick={local ? startLocal : startQuick}>{t('Kick off', 'কিক-অফ')}</button></div>
    </>;
  } else if (screen === 'challenges') {
    body = <>
      {back}
      <h2>{t('Comeback Challenges', 'কামব্যাক চ্যালেঞ্জ')}</h2>
      <p className="lede">{t('The clock is against you. Stars: done · win by two (or score while defending) · no goal conceded.', 'সময় কম। তারা: সফল · দুই গোলে জয় (বা রক্ষণে থেকেও গোল) · একটাও গোল না খাওয়া।')}</p>
      <MatchUp sport="football" mine={mine} opp={mine === 'arg' ? 'bra' : 'arg'} onMine={chooseMine} oppLocked oppMystery oppLabel={t('Opponents', 'প্রতিপক্ষ')} />
      <Tactics value={setup} onChange={setSetup} kit={kit} />
      <div className="ladder">
        {CHALLENGES.map((c) => {
          const st = chStars[c.id] ?? 0;
          return (
            <button key={c.id} className={`lvl ${st ? 'done' : ''}`} onClick={() => startChallenge(c)} data-testid={`ch-${c.id}`}>
              <span className="ln">{n(c.minute)}′ · {n(c.score[0])}–{n(c.score[1])}</span>
              <b>{x.bi(c.title)}</b>
              <small>{x.bi(c.desc)}</small>
              <small><Flag id={c.opp} size={18} /> {t('vs', 'বনাম')} {name(c.opp)}</small>
              <span className="stars">{'★'.repeat(st)}<span className="off">{'★'.repeat(3 - st)}</span></span>
            </button>
          );
        })}
      </div>
    </>;
  } else {
    const f = cup && nextFixture(cup);
    body = <>
      {back}
      <h2>{t('Desk World Cup', 'ডেস্ক বিশ্বকাপ')}</h2>
      {!cup ? <>
        <p className="lede">{t('Eight nations, two groups. Top two reach the semi-finals. Knockout draws go to golden goal, then penalty flicks.', 'আট দেশ, দুই গ্রুপ। সেরা দুই দল সেমিফাইনালে। নকআউটে ড্র হলে গোল্ডেন গোল, তারপর পেনাল্টি টোকা।')}</p>
        <div className="opt-label">{t('Choose your country', 'তোমার দেশ বাছো')}</div>
        <TeamGrid sport="football" value={mine} onChange={chooseMine} label={t('Your team', 'তোমার দল')} />
        <Tactics value={setup} onChange={setSetup} kit={kit} />
        <div className="sport-actions"><button className="btn big" data-testid="cup-start" onClick={() => { const c = createTournament(GAME, 'football', mine); setCup(c); saveTournament(c, GAME); sfx('fanfare'); }}>{t('Start the cup', 'কাপ শুরু')}</button></div>
      </> : <>
        {f ? (
          <div className="cup-next">
            <span><small>{stageName(x, f)}</small><br /><b><Flag id={f.home} size={24} /> {name(f.home)} {t('vs', 'বনাম')} {name(f.away)} <Flag id={f.away} size={24} /></b></span>
            <button className="btn big" data-testid="cup-play" onClick={() => startCup(cup)}>{t('Play', 'খেলো')}</button>
          </div>
        ) : (
          <div className="cup-next"><b>{cup.status === 'won' ? t('Champions! 🏆', 'চ্যাম্পিয়ন! 🏆') : t(`Knocked out. ${cup.champion ? name(cup.champion) + ' won the cup.' : ''}`, `বিদায়। ${cup.champion ? name(cup.champion) + ' কাপ জিতেছে।' : ''}`)}</b>
            <button className="btn" data-testid="cup-new" onClick={() => { setCup(null); saveTournament(null, GAME); }}>{t('New cup', 'নতুন কাপ')}</button></div>
        )}
        {f && <Tactics value={setup} onChange={setSetup} kit={getTeam(cup.player).kit[0]} />}
        <CupBoard t={cup} />
      </>}
    </>;
  }
  return (
    <div className="sport-root ruled">
      <HubBar help={help} lang={x.lang} />
      <div className="sport-page" data-testid="setup">{body}</div>
    </div>
  );
}

/** Fixed players (table football) or roaming players (flick your players into the ball). */
function StylePick({ value, onChange, compact }: { value: Style; onChange: (s: Style) => void; compact?: boolean }) {
  const { t } = useTx();
  const opts: Array<{ v: Style; icon: ReactNode; title: string; sub: string }> = [
    { v: 'fixed', icon: <StyleIcon fixed />, title: t('Fixed players', 'স্থির খেলোয়াড়'), sub: t('Players stay on their spots. Flick the ball between them.', 'খেলোয়াড় জায়গায় থাকে। বলে টোকা দিয়ে পাস দাও।') },
    { v: 'free', icon: <StyleIcon />, title: t('Roaming players', 'চলমান খেলোয়াড়'), sub: t('Flick your players into the ball. They move around the pitch.', 'নিজের খেলোয়াড়কে টোকা দিয়ে বলে মারো। ওরা মাঠে ঘোরে।') },
  ];
  return (
    <div className={`ff-style ${compact ? 'compact' : ''}`} role="radiogroup" aria-label={t('How the players move', 'খেলোয়াড় কীভাবে চলবে')}>
      {opts.map((o) => (
        <button key={o.v} type="button" role="radio" aria-checked={value === o.v} className="ff-style-opt" data-testid={`style-${o.v}`}
          onClick={() => { if (value !== o.v) { sfx('click'); onChange(o.v); } }}>
          {o.icon}
          <span><b>{o.title}</b>{!compact && <small>{o.sub}</small>}</span>
          {value === o.v && <i aria-hidden="true">✓</i>}
        </button>
      ))}
    </div>
  );
}

function StyleIcon({ fixed }: { fixed?: boolean }) {
  return (
    <svg viewBox="0 0 64 44" className="ff-style-svg" aria-hidden="true">
      <rect x="1" y="1" width="62" height="42" rx="5" fill="#2f8a4a" stroke="#fff" strokeWidth="1.5" />
      <path d="M32 1 V43" stroke="rgba(255,255,255,0.6)" strokeWidth="1" />
      {fixed ? <>
        {[[12, 12], [12, 32], [26, 22], [40, 10], [40, 34], [52, 22]].map(([cx, cy], i) => <circle key={i} cx={cx} cy={cy} r="4" fill={i % 2 ? '#e94b3c' : '#2a6fdb'} stroke="#fff" strokeWidth="1" />)}
        <path d="M17 29 L23 24 M30 20 L37 12" stroke="#ffe27a" strokeWidth="1.6" strokeDasharray="2 2" />
        <circle cx="34" cy="16" r="2.6" fill="#fff" stroke="#222" strokeWidth="0.6" />
      </> : <>
        <circle cx="18" cy="26" r="4" fill="#2a6fdb" stroke="#fff" strokeWidth="1" />
        <path d="M8 34 L15 28" stroke="#ffe27a" strokeWidth="1.6" strokeDasharray="2 2" />
        <path d="M21 23 Q30 14 40 18" stroke="#fff" strokeWidth="1.2" fill="none" strokeDasharray="2 2" />
        <circle cx="26" cy="20" r="2.6" fill="#fff" stroke="#222" strokeWidth="0.6" />
        <circle cx="46" cy="14" r="4" fill="#e94b3c" stroke="#fff" strokeWidth="1" />
        <circle cx="48" cy="30" r="4" fill="#e94b3c" stroke="#fff" strokeWidth="1" />
      </>}
    </svg>
  );
}

function FlikkMatch({ p, onDone, onQuit, onRestart }: { p: Pending; onDone: (e: FlikkEnd) => void; onQuit: () => void; onRestart: () => void }) {
  const x = useTx();
  const { t, n } = x;
  const [paused, setPaused] = useState(false);
  const [hud, setHud] = useState<FlikkHud | null>(null);
  const [cover, setCover] = useState<Side | null>(null);
  const hide = useCallback(() => setPaused(true), []);
  const lastSide = useRef<Side | null>(null);
  const say: Say = useCallback((k, v) => {
    const nm = v?.id ? x.bi(getTeam(v.id).name) : '';
    switch (k) {
      case 'goal': return t(`GOAL! ${nm}`, `গোল! ${nm}`);
      case 'pass': return t(`Pass! Flick again (${v?.n})`, `পাস! আবার টোকা (${n(v?.n ?? '')})`);
      case 'throw': return t('Out! Throw-in to them', 'বাইরে! ওদের থ্রো-ইন');
      case 'goalkick': return t('Out! Goal kick', 'বাইরে! গোল কিক');
      case 'tackle': return t(`${v?.n} flicks used: tackled!`, `${n(v?.n ?? '')} টোকা শেষ: ট্যাকল!`);
      case 'lost': return t('Intercepted!', 'বল কেড়ে নিল!');
      case 'chain': return v?.n === '1' ? t('Pass!', 'পাস!') : t(`${v?.n} passes in a row!`, `টানা ${n(v?.n ?? '')}টা পাস!`);
      case 'turn': return t(`${nm}: your turn`, `${nm}-এর পালা`);
      case 'yourTurn': return t('Your turn', 'তোমার পালা');
      case 'theirTurn': return t('Computer’s turn', 'কম্পিউটারের পালা');
      case 'half': return t('Half time', 'বিরতি');
      case 'golden': return t('Golden goal!', 'গোল্ডেন গোল!');
      case 'pens': return t('Penalty flicks', 'পেনাল্টি টোকা');
      case 'scored': return t('Scored!', 'গোল!');
      case 'missed': return t('Missed!', 'মিস!');
      case 'saved': return t('Saved!', 'সেভ!');
    }
    return '';
  }, [x.lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const scene = useMemo(() => new FlikkScene(p.cfg, say, setHud, onDone), []); // eslint-disable-line react-hooks/exhaustive-deps
  const help = <ol>{rulesList(t, p.cfg.style).map((r) => <li key={r}>{r}</li>)}</ol>;
  useGameBar({ onPause: () => setPaused(true), onResume: () => setPaused(false), help }, [x.lang]);
  useEffect(() => { (window as unknown as { __flikk?: FlikkScene }).__flikk = scene; return () => { delete (window as unknown as { __flikk?: FlikkScene }).__flikk; }; }, [scene]);

  // In two-player games, cover the board between turns so the device can be passed.
  useEffect(() => {
    if (!hud || p.cfg.vsAI) return;
    if (hud.phase === 'aim' && lastSide.current !== null && lastSide.current !== hud.turnSide && hud.flick === 1) setCover(hud.turnSide);
    if (hud.phase === 'aim') lastSide.current = hud.turnSide;
  }, [hud, p.cfg.vsAI]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (paused || cover !== null) return; if (scene.key(e.code)) e.preventDefault(); };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [scene, paused, cover]);

  const h = hud;
  const so = h?.shootout;
  return (
    <div className="ff-root">
      <div className="ff-top">
        <FlagScore a={p.cfg.teams[0]} b={p.cfg.teams[1]} sa={<span data-testid="score-0">{n(h?.score[0] ?? 0)}</span>} sb={<span data-testid="score-1">{n(h?.score[1] ?? 0)}</span>}
          mid={so ? t('PENS', 'টাইব্রেকার') : h?.golden ? t('GOLDEN', 'গোল্ডেন') : `${n(h?.minute ?? 0)}′`} />
        {so && <div className="ff-pens">{([0, 1] as Side[]).map((s) => <span key={s}><Flag id={p.cfg.teams[s]} size={18} />{so.kicks[s].map((g, i) => <i key={i} className={g ? 'g' : 'm'} />)}</span>)}</div>}
      </div>
      <div className="ff-canvas">
        <GameCanvas scene={scene} paused={paused || cover !== null} onHidden={hide} label={t('Football desk', 'ফুটবল ডেস্ক')} />
      </div>
      <div className="ff-bottom" aria-live="polite">
        <span className="ff-turn" style={{ ['--kit' as string]: getTeam(p.cfg.teams[h?.turnSide ?? 0]).kit[0] }}>
          <Flag id={p.cfg.teams[h?.turnSide ?? 0]} size={22} />
          {h?.thinking ? t('Computer is thinking…', 'কম্পিউটার ভাবছে…') : h?.phase === 'moving' ? t('…', '…') : `${p.names[h?.turnSide ?? 0]}`}
        </span>
        {p.cfg.style === 'fixed' ? <>
          {!so && <span className="ff-flicks" data-testid="chain" aria-label={t(`Flick ${h?.flick ?? 1} of ${FLICKS_PER_TURN}`, `${n(FLICKS_PER_TURN)}-এর ${n(h?.flick ?? 1)} নম্বর টোকা`)} title={t('Flicks this turn', 'এই পালার টোকা')}>{Array.from({ length: FLICKS_PER_TURN }, (_, k) => k + 1).map((i) => <i key={i} className={(h?.flick ?? 1) > i ? 'used' : (h?.flick ?? 1) === i ? 'now' : ''} />)}</span>}
          {!so && <span className="ff-chip" data-testid="left" title={t('Flicks left in the match', 'ম্যাচে বাকি টোকা')}>⏱ <b>{n(h?.left ?? 0)}</b></span>}
        </> : <>
          <span className="ff-flicks" aria-label={t('Flicks this turn', 'এই পালার টোকা')}>{[1, 2, 3].map((i) => <i key={i} className={(h?.flick ?? 1) > i ? 'used' : (h?.flick ?? 1) === i ? 'now' : ''} />)}</span>
          <button className="btn secondary ff-regroup" disabled={!h?.canRegroup} onClick={() => scene.regroupNow()} data-testid="regroup">{t('Regroup', 'সাজাও')}</button>
        </>}
      </div>
      {cover !== null && (
        <div className="overlay" role="dialog" aria-modal="true" aria-label={t('Pass the device', 'ফোন দাও')}>
          <div className="sheet ruled" style={{ textAlign: 'center' }}>
            <Flag id={p.cfg.teams[cover]} size={64} />
            <h2>{t(`${p.names[cover]}: your turn`, `${p.names[cover]}-এর পালা`)}</h2>
            <div className="actions" style={{ justifyContent: 'center' }}><button className="btn big" autoFocus onClick={() => setCover(null)} data-testid="ready">{t('I’m ready', 'আমি প্রস্তুত')}</button></div>
          </div>
        </div>
      )}
      {paused && <PauseMenu onResume={() => setPaused(false)} onRestart={onRestart} onQuit={onQuit} help={help} />}
    </div>
  );
}
