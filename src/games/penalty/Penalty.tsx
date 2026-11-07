import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { GameProps } from '../../platform/registry';
import { GameCanvas } from '../../engine/GameCanvas';
import { createRng, type Rng } from '../../engine/rng';
import { readJSON, writeJSON } from '../../platform/storage';
import { getStats, recordResult } from '../../platform/scores';
import { sfx } from '../../platform/audio';
import { PauseMenu, Seg, useGameBar, usePlayerNames, type Difficulty } from '../../components/ui';
import { Championship, Flag, HubHero, MatchUp, ModeCard, TeamGrid, favTeam, setFavTeam, useTx } from '../../components/sport/SportKit';
import { defaultOpponent, getTeam, ratingOf, teamsFor } from '../../shared/teams';
import type { Bi } from '../../platform/i18n';
import { KeeperAI, decided, goals, nextKicker, type Shootout } from './model';
import { PenaltyScene, type KickResult } from './scene';
import { OnlineButton, useOnlineEntry } from '../../components/online/OnlineButton';
import { OnlinePenalty } from './online';
import { ResultHero } from '../../components/Result';
import './penalty.css';

const GAME = 'penalty';
type Screen = 'menu' | 'quick' | 'local' | 'challenges' | 'cup' | 'match' | 'after' | 'champion';
type Kind = 'quick' | 'local' | 'challenge' | 'cup';

interface Challenge {
  id: string; title: Bi; desc: Bi; opp: string; skill: number;
  only?: 'shoot' | 'keep'; kicks?: number;
  need: { goals?: number; saves?: number; corners?: number; win?: boolean };
  pre?: { kicks: [boolean[], boolean[]]; first: 0 | 1 };
}
const CHALLENGES: Challenge[] = [
  { id: 'p1', title: { bn: 'পাঁচে পাঁচ', en: 'Five from five' }, desc: { bn: 'পাঁচটা শট, পাঁচটাই গোল।', en: 'Five kicks. Score them all.' }, opp: 'ger', skill: 0.6, only: 'shoot', kicks: 5, need: { goals: 5 } },
  { id: 'p2', title: { bn: 'কোণের ওস্তাদ', en: 'Corner specialist' }, desc: { bn: 'পাঁচ শটে অন্তত তিনটা গোল উপরের কোণে।', en: 'Put three of five into the top corners.' }, opp: 'ita', skill: 0.5, only: 'shoot', kicks: 5, need: { corners: 3 } },
  { id: 'p3', title: { bn: 'দেয়াল', en: 'The wall' }, desc: { bn: 'গোলকিপার তুমি। পাঁচটার মধ্যে দুইটা বাঁচাও।', en: 'You are in goal. Save two of five.' }, opp: 'fra', skill: 0.6, only: 'keep', kicks: 5, need: { saves: 2 } },
  { id: 'p4', title: { bn: 'বাঁচার শট', en: 'Score to survive' }, desc: { bn: '৩–৪ পিছিয়ে, শেষ শট তোমার। গোল করো, তারপর জেতো।', en: '3–4 down, last kick is yours. Score it, then win.' }, opp: 'bra', skill: 0.7, need: { win: true }, pre: { kicks: [[true, true, true, false], [true, true, false, true, true]], first: 1 } },
  { id: 'p5', title: { bn: 'বরফ-শীতল মাথা', en: 'Ice in the veins' }, desc: { bn: '৪–৪, সাডেন ডেথ। প্রথম শট তোমার।', en: '4–4, sudden death. You kick first.' }, opp: 'arg', skill: 0.8, need: { win: true }, pre: { kicks: [[true, true, false, true, true], [true, false, true, true, true]], first: 0 } },
  { id: 'p6', title: { bn: 'সেরা গোলকিপারের সামনে', en: 'Beat the best keeper' }, desc: { bn: 'পুরো শুটআউট, সবচেয়ে কঠিন গোলকিপার।', en: 'A full shootout against the hardest keeper.' }, opp: 'esp', skill: 0.97, need: { win: true } },
  { id: 'p7', title: { bn: 'তিন সেভ', en: 'Triple save' }, desc: { bn: 'পাঁচ শটে তিনটা বাঁচাও।', en: 'Save three of five.' }, opp: 'mar', skill: 0.45, only: 'keep', kicks: 5, need: { saves: 3 } },
];

interface Pending { kind: Kind; teams: [string, string]; names: [string, string]; vsAI: boolean; skill: number; ch?: Challenge; occasion?: string; seed: number }
interface Stats { goals: [number, number]; saves: [number, number]; corners: number; kicks: [number, number] }
interface End { so: Shootout; winner: 0 | 1 | null; st: Stats }

// ---------- A small knockout cup (quarter-finals, semi-finals, final) ----------
interface Tie { a: string; b: string; score?: [number, number]; winner?: string }
interface PCup { player: string; rounds: Tie[][]; status: 'playing' | 'won' | 'out'; seed: number }
const loadCup = (): PCup | null => readJSON<PCup | null>('pk.cup', null);
const saveCup = (c: PCup | null) => writeJSON('pk.cup', c);

function shuffled<T>(a: T[], rng: Rng): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) { const j = rng.int(0, i); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}
function newCup(player: string): PCup {
  const rng = createRng((Math.random() * 2 ** 31) >>> 0);
  const pool = teamsFor('football').filter((t) => t.id !== player).sort((a, b) => ratingOf(b, 'football') - ratingOf(a, 'football'));
  const picks = shuffled([...pool.slice(0, 5), ...shuffled(pool.slice(5), rng).slice(0, 2)].map((t) => t.id), rng);
  const all = [player, ...picks];
  return { player, rounds: [[0, 1, 2, 3].map((i) => ({ a: all[i * 2], b: all[i * 2 + 1] }))], status: 'playing', seed: rng.seed };
}
function simShootout(a: string, b: string, rng: Rng): [number, number] {
  const p = (k: string, g: string) => 0.74 + (ratingOf(getTeam(k), 'football') - ratingOf(getTeam(g), 'football')) * 0.015;
  let ga = 0, gb = 0;
  for (let i = 0; i < 5; i++) { if (rng.chance(p(a, b))) ga++; if (rng.chance(p(b, a))) gb++; }
  while (ga === gb) { ga += +rng.chance(p(a, b)); gb += +rng.chance(p(b, a)); }
  return [ga, gb];
}
const nextRound = (r: Tie[]): Tie[] => Array.from({ length: r.length / 2 }, (_, i) => ({ a: r[i * 2].winner!, b: r[i * 2 + 1].winner! }));
function cupAdvance(c: PCup, myScore: [number, number]): PCup {
  const rng = createRng(c.seed + c.rounds.length * 101);
  const play = (r: Tie[], mine: boolean) => r.map((t) => {
    if (t.winner) return t;
    const isMine = mine && (t.a === c.player || t.b === c.player);
    const sc: [number, number] = isMine ? (t.a === c.player ? myScore : [myScore[1], myScore[0]]) : simShootout(t.a, t.b, rng);
    return { ...t, score: sc, winner: sc[0] > sc[1] ? t.a : t.b };
  });
  let rounds = [...c.rounds];
  rounds[rounds.length - 1] = play(rounds[rounds.length - 1], true);
  let last = rounds[rounds.length - 1];
  const alive = last.some((t) => t.winner === c.player);
  if (alive) {
    if (last.length === 1) return { ...c, rounds, status: 'won' };
    return { ...c, rounds: [...rounds, nextRound(last)] };
  }
  // Out: play the rest so the bracket shows a champion.
  while (last.length > 1) {
    const nr = play(nextRound(last), false);
    rounds = [...rounds, nr];
    last = nr;
  }
  return { ...c, rounds, status: 'out' };
}
const cupTie = (c: PCup) => c.status === 'playing' ? c.rounds[c.rounds.length - 1].find((t) => !t.winner && (t.a === c.player || t.b === c.player)) ?? null : null;
const roundName = (x: ReturnType<typeof useTx>, n: number) => n === 4 ? x.t('Quarter-final', 'কোয়ার্টার ফাইনাল') : n === 2 ? x.t('Semi-final', 'সেমিফাইনাল') : x.t('Final', 'ফাইনাল');

const SKILL: Record<Difficulty, number> = { easy: 0.3, medium: 0.6, hard: 0.9 };

function rulesList(t: (en: string, bn: string) => string) {
  return [
    t('Shooting: touch the goal to aim (drag to move the target), let go, then tap to stop the power bar.', 'শট: গোলে ছুঁয়ে নিশানা ঠিক করো (টেনে সরাও), ছেড়ে দাও, তারপর ট্যাপ করে জোরের দাগ থামাও।'),
    t('Green power is clean. Red power is fierce but can fly over the bar. Corners are hardest to save.', 'সবুজ জোরে শট নিখুঁত। লাল জোরে শট কড়া, তবে বারের উপর দিয়ে যেতে পারে। কোণের শট বাঁচানো সবচেয়ে কঠিন।'),
    t('Keeping: watch the run-up, then tap where to dive. Dive too early and a sharp kicker goes the other way.', 'গোলকিপিং: দৌড় দেখো, তারপর যেদিকে ঝাঁপাবে সেখানে ট্যাপ করো। আগেভাগে ঝাঁপালে চালাক শুটার উল্টো দিকে মারবে।'),
    t('Five kicks each, then sudden death. Keys: arrows aim, Space shoots; as keeper Q/E/A/D or arrows dive.', 'প্রতি দলে পাঁচটা শট, তারপর সাডেন ডেথ। কী-বোর্ড: তীর দিয়ে নিশানা, স্পেসে শট; গোলকিপার হলে Q/E/A/D বা তীর।'),
  ];
}

function HubBar({ help, lang }: { help: ReactNode; lang: string }) { useGameBar({ help }, [lang]); return null; }

export default function Penalty({ onExit }: GameProps) {
  const x = useTx();
  const { t, n } = x;
  void onExit;
  const [p1, p2] = usePlayerNames();
  const [screen, setScreen] = useState<Screen>('menu');
  const [mine, setMine] = useState(() => favTeam('football'));
  const [opp, setOpp] = useState(() => defaultOpponent('football', favTeam('football')));
  const [diff, setDiff] = useState<Difficulty | 'auto'>('auto');
  const [pending, setPending] = useState<Pending | null>(null);
  const [key, setKey] = useState(0);
  const [end, setEnd] = useState<End | null>(null);
  const [cup, setCup] = useState<PCup | null>(loadCup);
  const [chStars, setChStars] = useState<Record<string, number>>(() => readJSON('pk.ch', {}));
  const [cupNote, setCupNote] = useState<'won' | 'out' | null>(null);
  const [stars, setStars] = useState(0);
  const online = useOnlineEntry();
  const help = <ol>{rulesList(t).map((r) => <li key={r}>{r}</li>)}</ol>;
  const name = (id: string) => x.bi(getTeam(id).name);
  const chooseMine = (id: string) => { setMine(id); setFavTeam('football', id); if (id === opp) setOpp(defaultOpponent('football', id)); };
  const autoSkill = (o: string) => Math.min(0.95, 0.35 + (ratingOf(getTeam(o), 'football') - 4) * 0.09);
  const launch = (p: Pending) => { setPending(p); setKey((k) => k + 1); setScreen('match'); setCupNote(null); };
  const seed = () => (Math.random() * 2 ** 31) >>> 0;

  const done = (e: End) => {
    const p = pending!;
    setEnd(e);
    let note: 'won' | 'out' | null = null;
    let st = 0;
    if (p.kind === 'challenge' && p.ch) {
      const nd = p.ch.need;
      const g = goals(e.so);
      const val = nd.goals !== undefined ? e.st.goals[0] - nd.goals
        : nd.saves !== undefined ? e.st.saves[0] - nd.saves
        : nd.corners !== undefined ? e.st.corners - nd.corners
        : e.winner === 0 ? g[0] - g[1] - 1 : -1;
      st = val < 0 ? 0 : Math.min(3, 1 + (val >= 1 ? 1 : 0) + (val >= 2 || (nd.goals !== undefined && e.st.goals[0] === e.st.kicks[0]) ? 1 : 0));
      if (st) { const m = { ...chStars, [p.ch.id]: Math.max(chStars[p.ch.id] ?? 0, st) }; setChStars(m); writeJSON('pk.ch', m); }
    }
    let cupsWon = 0;
    if (p.kind === 'cup' && cup) {
      const next = cupAdvance(cup, goals(e.so));
      setCup(next); saveCup(next);
      if (next.status === 'won') { note = 'won'; cupsWon = (getStats(GAME).records.cupsWon ?? 0) + 1; }
      else if (next.status === 'out') note = 'out';
    }
    setStars(st);
    setCupNote(note);
    const outcome = !p.vsAI ? 'none' : p.ch?.only ? (st ? 'win' : 'loss') : e.winner === 0 ? 'win' : 'loss';
    recordResult(GAME, { outcome, score: p.vsAI ? e.st.goals[0] : undefined, records: cupsWon ? { cupsWon } : {} }, () => {
      const ids: string[] = [];
      if (e.st.kicks[0] >= 5 && e.st.goals[0] === e.st.kicks[0]) ids.push('pk-perfect');
      if (cupsWon) ids.push('pk-cup');
      return ids;
    });
    setScreen('after');
  };

  if (online.open) return <div className="sport-root ruled"><OnlinePenalty onBack={online.close} code={online.code} /></div>;
  if (screen === 'match' && pending) return <ShootoutMatch key={key} p={pending} onDone={done} onQuit={() => setScreen(pending.kind === 'cup' ? 'cup' : 'menu')} onRestart={() => launch({ ...pending, seed: seed() })} />;
  if (screen === 'champion' && cup) return <div className="sport-root ruled"><Championship team={cup.player} title={t('CHAMPIONS!', 'চ্যাম্পিয়ন!')} lines={[t('Nerves of steel from twelve yards.', 'বারো গজ থেকে লোহার স্নায়ু।')]} actionLabel={t('See the bracket', 'ব্র্যাকেট দেখো')} onDone={() => setScreen('cup')} /></div>;

  if (screen === 'after' && end && pending) {
    const g = goals(end.so);
    const p = pending;
    const w = end.winner;
    const title = p.ch?.only ? (stars ? t('Challenge complete!', 'চ্যালেঞ্জ সফল!') : t('Not this time', 'এবার হলো না')) : w === null ? t('Done', 'শেষ') : t(`${p.names[w]} win the shootout!`, `${p.names[w]} শুটআউট জিতেছে!`);
    const stamp = !p.vsAI ? null : p.ch?.only ? (stars ? 'win' : 'loss') : w === 0 ? 'win' : 'loss';
    return (
      <div className="sport-root ruled">
        <div className="overlay" role="dialog" aria-modal="true" aria-label={title}>
          <div className="report result-card" data-testid="result">
            <div className="school">{p.occasion ?? t('Penalty Shootout', 'পেনাল্টি শুটআউট')}</div>
            <ResultHero outcome={stamp ?? 'none'} title={title} sub={cupNote === 'out' ? t('Out of the cup this time.', 'এবার কাপ থেকে বিদায়।') : undefined} />
            <KickBoard teams={p.teams} so={end.so} />
            <table><tbody>
              {!p.ch?.only && <tr><td>{t('Shootout', 'শুটআউট')}</td><td>{n(g[0])} – {n(g[1])}</td></tr>}
              {end.st.kicks[0] > 0 && <tr><td>{t(`Goals by ${p.names[0]}`, `${p.names[0]}-এর গোল`)}</td><td>{n(end.st.goals[0])} / {n(end.st.kicks[0])}</td></tr>}
              {end.st.kicks[1] > 0 && <tr><td>{t(`Saves by ${p.names[0]}`, `${p.names[0]}-এর সেভ`)}</td><td>{n(end.st.saves[0])} / {n(end.st.kicks[1])}</td></tr>}
              {p.ch && <tr><td>{t('Stars', 'তারা')}</td><td>{stars ? '★'.repeat(stars) : '—'}</td></tr>}
            </tbody></table>
            <div className="actions">
              {p.kind === 'cup' ? <button className="btn big" autoFocus data-testid="after-next" onClick={() => setScreen(cupNote === 'won' ? 'champion' : 'cup')}>{cupNote === 'won' ? t('Lift the cup!', 'কাপ তোলো!') : t('Back to the cup', 'কাপে ফেরো')}</button>
                : p.kind === 'challenge' ? <><button className="btn big" autoFocus data-testid="after-retry" onClick={() => launch({ ...p, seed: seed() })}>{t('Try again', 'আবার চেষ্টা')}</button><button className="btn secondary" onClick={() => setScreen('challenges')}>{t('All challenges', 'সব চ্যালেঞ্জ')}</button></>
                : <><button className="btn big" autoFocus data-testid="after-retry" onClick={() => launch({ ...p, seed: seed() })}>{t('Play again', 'আবার খেলো')}</button><button className="btn secondary" onClick={() => setScreen(p.kind === 'local' ? 'local' : 'quick')}>{t('Change teams', 'দল বদলাও')}</button></>}
              <button className="btn secondary" onClick={() => setScreen('menu')}>{t('Modes', 'খেলার ধরন')}</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const back = <button className="btn secondary sport-back" onClick={() => setScreen('menu')}>← {t('Modes', 'খেলার ধরন')}</button>;
  let body: ReactNode;
  if (screen === 'menu') {
    body = <>
      <HubHero id="penalty" eyebrow={t('Twelve yards', 'বারো গজ')} title={t('Penalty Shootout', 'পেনাল্টি শুটআউট')} lede={t('Pick a corner, beat the keeper, then put on the gloves and guess right.', 'কোণ বাছো, গোলকিপারকে হারাও, তারপর গ্লাভস পরে ঠিক দিকে ঝাঁপাও।')} />
      <details className="bench-rules"><summary>{t('How to play', 'কীভাবে খেলবে')}</summary>{help}</details>
      <OnlineButton onClick={online.show} />
      <div className="mode-grid">
        <ModeCard testid="mode-quick" icon="🥅" title={t('Quick Shootout', 'কুইক শুটআউট')} sub={t('Your country against theirs. Shoot and save.', 'তোমার দেশ বনাম ওদের দেশ। শট নাও, সেভ করো।')} onClick={() => setScreen('quick')} />
        <ModeCard testid="mode-challenge" icon="🎯" title={t('Challenges', 'চ্যালেঞ্জ')} sub={t('Corners, perfect fives, sudden death.', 'কোণ, পাঁচে পাঁচ, সাডেন ডেথ।')} badge={`${n(Object.keys(chStars).length)}/${n(CHALLENGES.length)}`} onClick={() => setScreen('challenges')} />
        <ModeCard testid="mode-cup" icon="🏆" title={t('Shootout Cup', 'শুটআউট কাপ')} sub={t('Quarter-final, semi-final, final. Every tie on penalties.', 'কোয়ার্টার, সেমি, ফাইনাল। প্রতিটা খেলা পেনাল্টিতে।')} badge={cup && cupTie(cup) ? t('Continue', 'চালিয়ে যাও') : undefined} onClick={() => setScreen('cup')} />
        <ModeCard testid="mode-local" icon="👥" title={t('With a friend', 'বন্ধুর সাথে')} sub={t('Take turns to shoot and keep on one device.', 'এক ফোনে পালা করে শট আর গোলকিপিং।')} onClick={() => setScreen('local')} />
      </div>
    </>;
  } else if (screen === 'quick' || screen === 'local') {
    const local = screen === 'local';
    body = <>
      {back}
      <h2>{local ? t('With a friend', 'বন্ধুর সাথে') : t('Quick Shootout', 'কুইক শুটআউট')}</h2>
      <MatchUp sport="football" mine={mine} opp={opp} onMine={chooseMine} onOpp={setOpp} mineLabel={local ? p1 : undefined} oppLabel={local ? p2 : undefined} />
      {!local && <><div className="opt-label">{t('Computer', 'কম্পিউটার')}</div>
        <Seg label={t('Computer', 'কম্পিউটার')} value={diff} onChange={setDiff} options={[{ v: 'auto', label: t('By team', 'দল অনুযায়ী') }, { v: 'easy', label: t('Easy', 'সহজ') }, { v: 'medium', label: t('Medium', 'মাঝারি') }, { v: 'hard', label: t('Hard', 'কঠিন') }]} /></>}
      <div className="sport-actions"><button className="btn big" data-testid="start" onClick={() => launch(local
        ? { kind: 'local', teams: [mine, opp], names: [`${p1} (${getTeam(mine).code})`, `${p2} (${getTeam(opp).code})`], vsAI: false, skill: 0.6, seed: seed() }
        : { kind: 'quick', teams: [mine, opp], names: [name(mine), name(opp)], vsAI: true, skill: diff === 'auto' ? autoSkill(opp) : SKILL[diff], seed: seed() })}>{t('Start', 'শুরু')}</button></div>
    </>;
  } else if (screen === 'challenges') {
    body = <>
      {back}
      <h2>{t('Challenges', 'চ্যালেঞ্জ')}</h2>
      <TeamLine x={x} mine={mine} onPick={chooseMine} />
      <div className="ladder">
        {CHALLENGES.map((c) => {
          const st = chStars[c.id] ?? 0;
          return (
            <button key={c.id} className={`lvl ${st ? 'done' : ''}`} data-testid={`ch-${c.id}`} onClick={() => launch({ kind: 'challenge', ch: c, teams: [mine, c.opp], names: [name(mine), name(c.opp)], vsAI: true, skill: c.skill, occasion: x.bi(c.title), seed: seed() })}>
              <span className="ln">{c.only === 'keep' ? t('Keeper', 'গোলকিপার') : c.only === 'shoot' ? t('Shooter', 'শুটার') : t('Shootout', 'শুটআউট')}</span>
              <b>{x.bi(c.title)}</b><small>{x.bi(c.desc)}</small>
              <small><Flag id={c.opp} size={18} /> {t('vs', 'বনাম')} {name(c.opp)}</small>
              <span className="stars">{'★'.repeat(st)}<span className="off">{'★'.repeat(3 - st)}</span></span>
            </button>
          );
        })}
      </div>
    </>;
  } else {
    const tie = cup && cupTie(cup);
    body = <>
      {back}
      <h2>{t('Shootout Cup', 'শুটআউট কাপ')}</h2>
      {!cup ? <>
        <p className="lede">{t('Eight nations. Win three shootouts to lift the cup.', 'আট দেশ। তিনটা শুটআউট জিতলেই কাপ।')}</p>
        <TeamGrid sport="football" value={mine} onChange={chooseMine} label={t('Your team', 'তোমার দল')} />
        <div className="sport-actions"><button className="btn big" data-testid="cup-start" onClick={() => { const c = newCup(mine); setCup(c); saveCup(c); sfx('fanfare'); }}>{t('Start the cup', 'কাপ শুরু')}</button></div>
      </> : <>
        {tie ? (
          <div className="cup-next">
            <span><small>{roundName(x, cup.rounds[cup.rounds.length - 1].length)}</small><br /><b><Flag id={tie.a} size={24} /> {name(tie.a)} {t('vs', 'বনাম')} {name(tie.b)} <Flag id={tie.b} size={24} /></b></span>
            <button className="btn big" data-testid="cup-play" onClick={() => { const o = tie.a === cup.player ? tie.b : tie.a; launch({ kind: 'cup', teams: [cup.player, o], names: [name(cup.player), name(o)], vsAI: true, skill: autoSkill(o), occasion: roundName(x, cup.rounds[cup.rounds.length - 1].length), seed: seed() }); }}>{t('Play', 'খেলো')}</button>
          </div>
        ) : (
          <div className="cup-next"><b>{cup.status === 'won' ? t('Champions! 🏆', 'চ্যাম্পিয়ন! 🏆') : t('Knocked out.', 'বিদায়।')}</b><button className="btn" data-testid="cup-new" onClick={() => { setCup(null); saveCup(null); }}>{t('New cup', 'নতুন কাপ')}</button></div>
        )}
        <div className="pk-bracket">
          {[0, 1, 2].map((ri) => (
            <div key={ri} className="pk-round">
              <small>{roundName(x, 4 >> ri)}</small>
              {(cup.rounds[ri] ?? Array.from({ length: 4 >> ri }, () => null)).map((tie2, i) => (
                <div key={i} className="bk">
                  {tie2 ? <>
                    <div className={`bk-team ${tie2.winner === tie2.a ? 'won' : ''}`}><Flag id={tie2.a} size={20} /> {getTeam(tie2.a).code}{tie2.score && <b>{n(tie2.score[0])}</b>}</div>
                    <div className={`bk-team ${tie2.winner === tie2.b ? 'won' : ''}`}><Flag id={tie2.b} size={20} /> {getTeam(tie2.b).code}{tie2.score && <b>{n(tie2.score[1])}</b>}</div>
                  </> : <div className="bk-team tbd">{t('To be decided', 'পরে ঠিক হবে')}</div>}
                </div>
              ))}
            </div>
          ))}
        </div>
      </>}
    </>;
  }
  return <div className="sport-root ruled"><HubBar help={help} lang={x.lang} /><div className="sport-page" data-testid="setup">{body}</div></div>;
}

function TeamLine({ x, mine, onPick }: { x: ReturnType<typeof useTx>; mine: string; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ margin: '8px 0' }}>
      <button className="btn secondary" onClick={() => setOpen(!open)} aria-expanded={open}><Flag id={mine} size={28} /> {x.t('Playing as', 'খেলছ')} {x.bi(getTeam(mine).name)} · {x.t('change', 'বদলাও')}</button>
      {open && <TeamGrid sport="football" value={mine} onChange={(id) => { onPick(id); setOpen(false); }} label={x.t('Your team', 'তোমার দল')} />}
    </div>
  );
}

function KickBoard({ teams, so }: { teams: [string, string]; so: Shootout }) {
  const x = useTx();
  const n = Math.max(5, so.kicks[0].length, so.kicks[1].length);
  return (
    <div className="pk-board" aria-label={x.t('Kicks', 'শট')}>
      {([0, 1] as const).map((s) => (
        <div key={s} className="pk-row">
          <Flag id={teams[s]} size={26} /><b>{getTeam(teams[s]).code}</b>
          <span className="pk-dots">{Array.from({ length: n }, (_, i) => { const k = so.kicks[s][i]; return <i key={i} className={k === undefined ? '' : k ? 'g' : 'm'}>{k === undefined ? '' : k ? '✓' : '✗'}</i>; })}</span>
          <b className="pk-g">{x.n(goals(so)[s])}</b>
        </div>
      ))}
    </div>
  );
}

const ZONES: Array<[number, number]> = [[-0.7, 0.75], [0, 0.8], [0.7, 0.75], [-0.7, 0.22], [0, 0.2], [0.7, 0.22]];

function ShootoutMatch({ p, onDone, onQuit, onRestart }: { p: Pending; onDone: (e: End) => void; onQuit: () => void; onRestart: () => void }) {
  const x = useTx();
  const { t } = x;
  const rng = useMemo(() => createRng(p.seed), [p.seed]);
  const keeperAI = useMemo(() => new KeeperAI(p.skill, rng), [p.skill, rng]);
  const [so, setSo] = useState<Shootout>(() => p.ch?.pre ? { kicks: [[...p.ch.pre.kicks[0]], [...p.ch.pre.kicks[1]]], first: p.ch.pre.first, best: 5 } : { kicks: [[], []], first: (p.seed % 2) as 0 | 1, best: p.ch?.kicks ?? 5 });
  const [phase, setPhase] = useState<string>('idle');
  const [paused, setPaused] = useState(false);
  const [step, setStep] = useState<'kick' | 'secret' | 'pass'>('kick');
  const hide = useCallback(() => setPaused(true), []);
  const [secret, setSecret] = useState<{ x: number; y: number } | null>(null);
  const stats = useRef<Stats>({ goals: [0, 0], saves: [0, 0], corners: 0, kicks: [0, 0] });
  const ended = useRef(false);
  const soRef = useRef(so);
  soRef.current = so;
  const kickRef = useRef<(r: KickResult) => void>(() => {});
  const scene = useMemo(() => new PenaltyScene(rng, (r) => kickRef.current(r), setPhase, [getTeam(p.teams[0]).kit[0], getTeam(p.teams[1]).kit[0]]), []); // eslint-disable-line react-hooks/exhaustive-deps
  const help = <ol>{rulesList(t).map((r) => <li key={r}>{r}</li>)}</ol>;
  useGameBar({ onPause: () => setPaused(true), onResume: () => setPaused(false), help }, [x.lang]);
  useEffect(() => { (window as unknown as { __pk?: PenaltyScene }).__pk = scene; return () => { delete (window as unknown as { __pk?: PenaltyScene }).__pk; }; }, [scene]);

  const only = p.ch?.only;
  const kicker = (s: Shootout): 0 | 1 => only === 'shoot' ? 0 : only === 'keep' ? 1 : nextKicker(s);
  const pressureOf = (s: Shootout) => {
    const n = s.kicks[kicker(s)].length;
    return n >= s.best ? 1 : n >= s.best - 2 ? 0.5 : 0.2;
  };

  const startKick = (s: Shootout, dive?: { x: number; y: number }) => {
    const k = kicker(s);
    scene.start({
      kicker: p.teams[k], keeper: p.teams[k === 0 ? 1 : 0],
      humanKicks: p.vsAI ? k === 0 : true,
      humanKeeps: p.vsAI ? k === 1 : false,
      secretDive: dive,
      skill: p.skill, pressure: pressureOf(s), keeperAI,
    });
  };

  useEffect(() => {
    const id = window.setTimeout(() => { if (!p.vsAI) setStep('secret'); else startKick(soRef.current); }, 700);
    return () => clearTimeout(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  kickRef.current = (r: KickResult) => {
    const s = soRef.current;
    const k = kicker(s);
    const goal = r.outcome === 'goal';
    const st = stats.current;
    st.kicks[k]++;
    if (goal) { st.goals[k]++; if (k === 0 && Math.abs(r.shot.x) > 0.55 && r.shot.y > 0.55) st.corners++; }
    if (r.outcome === 'saved') st.saves[k === 0 ? 1 : 0]++;
    const kicks: [boolean[], boolean[]] = [[...s.kicks[0]], [...s.kicks[1]]];
    kicks[k].push(goal);
    const next: Shootout = { ...s, kicks };
    setSo(next);
    soRef.current = next;
    let over: boolean;
    let winner: 0 | 1 | null = null;
    if (only) over = kicks[k].length >= (p.ch?.kicks ?? 5);
    else { winner = decided(next); over = winner !== null; }
    if (over) {
      if (ended.current) return;
      ended.current = true;
      const snap: Stats = { goals: [...st.goals] as [number, number], saves: [...st.saves] as [number, number], corners: st.corners, kicks: [...st.kicks] as [number, number] };
      window.setTimeout(() => onDone({ so: next, winner, st: snap }), 700);
      return;
    }
    window.setTimeout(() => { if (!p.vsAI) { setSecret(null); setStep('secret'); } else startKick(next); }, 450);
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (paused || step !== 'kick') return; if (scene.key(e.code)) e.preventDefault(); };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [scene, paused, step]);

  const k = kicker(so);
  const humanKicking = p.vsAI ? k === 0 : true;
  const sudden = !only && so.kicks[0].length >= so.best && so.kicks[1].length >= so.best;
  const hint = phase === 'aim' ? t('Touch the goal to aim, then let go', 'গোলে ছুঁয়ে নিশানা করো, তারপর ছাড়ো')
    : phase === 'power' ? t('Tap to stop the power bar!', 'ট্যাপ করে জোর থামাও!')
    : phase === 'runup' && !humanKicking ? t('Tap where to dive!', 'যেদিকে ঝাঁপাবে সেখানে ট্যাপ করো!')
    : phase === 'flight' && !humanKicking ? t('Dive!', 'ঝাঁপাও!') : '';
  const keeperName = p.names[k === 0 ? 1 : 0];
  return (
    <div className="pk-root">
      <div className="pk-top">
        <KickBoard teams={p.teams} so={so} />
        <div className="pk-who"><Flag id={p.teams[k]} size={22} /> {t(`${p.names[k]} to shoot`, `${p.names[k]}-এর শট`)}{sudden ? ` · ${t('Sudden death', 'সাডেন ডেথ')}` : ''}</div>
      </div>
      <div className="pk-canvas">
        <GameCanvas scene={scene} paused={paused || step !== 'kick'} onHidden={hide} label={t('Penalty spot', 'পেনাল্টি স্পট')} />
        {hint && step === 'kick' && <div className="pk-hint" aria-live="polite">{hint}</div>}
      </div>
      {step === 'secret' && (
        <div className="overlay" role="dialog" aria-modal="true" aria-label={t('Keeper', 'গোলকিপার')}>
          <div className="sheet ruled pk-secret" data-testid="secret-dive">
            <h2>{t(`${keeperName}: you are in goal`, `${keeperName}: তুমি গোলকিপার`)}</h2>
            <p className="lede">{t(`Choose where to dive. ${p.names[k]}, look away!`, `কোথায় ঝাঁপাবে বেছে নাও। ${p.names[k]}, অন্য দিকে তাকাও!`)}</p>
            <div className="pk-zones">{ZONES.map(([zx, zy], i) => <button key={i} className="pk-zone" aria-pressed={secret?.x === zx && secret?.y === zy} onClick={() => { sfx('click'); setSecret({ x: zx, y: zy }); }} data-testid={`zone-${i}`} aria-label={t(`Zone ${i + 1}`, `অংশ ${x.n(i + 1)}`)}>{['↖', '⬆', '↗', '↙', '⬇', '↘'][i]}</button>)}</div>
            <div className="actions"><button className="btn big" disabled={!secret} onClick={() => setStep('pass')} data-testid="secret-ok">{t('Hide my dive', 'লুকাও')}</button></div>
          </div>
        </div>
      )}
      {step === 'pass' && (
        <div className="overlay" role="dialog" aria-modal="true" aria-label={t('Pass the device', 'ফোন দাও')}>
          <div className="sheet ruled" style={{ textAlign: 'center' }}>
            <Flag id={p.teams[k]} size={64} />
            <h2>{t(`${p.names[k]}: take your kick`, `${p.names[k]}: শট নাও`)}</h2>
            <div className="actions" style={{ justifyContent: 'center' }}><button className="btn big" autoFocus data-testid="ready" onClick={() => { setStep('kick'); startKick(soRef.current, secret ?? undefined); }}>{t('I’m ready', 'আমি প্রস্তুত')}</button></div>
          </div>
        </div>
      )}
      {paused && <PauseMenu onResume={() => setPaused(false)} onRestart={onRestart} onQuit={onQuit} help={help} />}
    </div>
  );
}
