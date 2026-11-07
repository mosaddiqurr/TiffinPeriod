import { hashQuery } from '../../platform/router';
import { useMemo, useState, type ComponentType, type ReactNode } from 'react';
import type { Bi } from '../../platform/i18n';
import { getStats, recordResult } from '../../platform/scores';
import { sfx } from '../../platform/audio';
import { Seg, useGameBar, usePlayerNames } from '../ui';
import type { Innings, MatchResult } from '../../shared/cricket';
import { getTeam, ratingOf, defaultOpponent } from '../../shared/teams';
import { createTournament, cricketSimulator, loadTournament, nextFixture, playerResult, saveTournament, type Tournament } from '../../shared/tournament';
import { dailyChase, dailyScore, difficultyFor, isUnlocked, ladder, loadStars, saveStars, starsFor, type Chase, type CricketMode, type Difficulty } from '../../shared/cricketModes';
import { dailyRecord, dailyStreak, saveDaily, shareOrCopy } from '../../shared/daily';
import { ResultHero, ScoreDuel } from '../Result';
import { Championship, CupBoard, Flag, MatchUp, ModeCard, TeamGrid, favTeam, setFavTeam, stageName, useTx } from './SportKit';

// The menu and modes for the three bench cricket games.
// Each game gives a Match component; this hub picks the teams and the mode,
// runs the tournament, the target ladder and the daily challenge, and shows results.

export type Side = 0 | 1;

export interface CricketSpec {
  mode: CricketMode;
  /** Team ids: [side 0 = the player (or player 1), side 1 = the computer (or player 2)]. */
  teams: [string, string];
  names: [string, string];
  vsAI: boolean;
  difficulty: Difficulty;
  overs: number | null;
  wickets: number;
  /** What side 0 does first. */
  start: 'bat' | 'bowl' | 'toss';
  /** Side 0 chases this straight away (Target Challenge, Daily Challenge). */
  chase?: Chase;
  seed: number;
  extra: Record<string, string | number>;
  occasion?: string;
  superOver?: boolean;
}

export interface CricketOutcome {
  battingFirst: Side;
  innings: [Innings, Innings];
  result: MatchResult & { winnerSide: Side | null };
  /** Extra rows for the result card. */
  rows: Array<[string, string | number]>;
  /** Most runs by one batter or in one innings, for achievements. */
  topScore?: number;
}

export interface CricketMatchProps {
  spec: CricketSpec;
  onDone: (o: CricketOutcome) => void;
  onQuit: () => void;
  onRestart: () => void;
}

export interface CricketAdapter {
  id: string;
  title: Bi;
  lede: Bi;
  Match: ComponentType<CricketMatchProps>;
  /** Typical runs per ball, for pressure and simulated scores. */
  par: number;
  usesDifficulty: boolean;
  overs: number[];
  wickets: number[];
  defOvers: number | null;
  defWickets: number;
  allowNoLimit: boolean;
  cup: { overs: number; wickets: number };
  rules: (t: (en: string, bn: string) => string) => string[];
  Options?: ComponentType<{ value: Record<string, string | number>; onChange: (v: Record<string, string | number>) => void }>;
  defaultExtra?: Record<string, string | number>;
  icon: ReactNode;
  achievements?: (o: CricketOutcome, spec: CricketSpec, won: boolean) => string[];
  /** Online 1v1 (rooms, links, quick match), when the game has it. */
  Online?: ComponentType<{ onBack: () => void; code?: string }>;
}

type Screen = 'menu' | 'quick' | 'local' | 'ladder' | 'cup' | 'daily' | 'match' | 'after' | 'champion' | 'online';

interface After { spec: CricketSpec; o: CricketOutcome; stars?: number; dailyBest?: boolean; daily?: number; newBest?: boolean; cupNote?: string }

function HubBar({ help, lang }: { help: ReactNode; lang: string }) {
  useGameBar({ help }, [lang]);
  return null;
}

export function CricketHub({ game, onExit }: { game: CricketAdapter; onExit: () => void }) {
  const x = useTx();
  const { t, n } = x;
  void onExit;
  const [p1, p2] = usePlayerNames();
  // An invite link (…?room=CODE) opens the online screen and joins that room.
  const [linkCode] = useState(() => (game.Online ? hashQuery().get('room') ?? undefined : undefined));
  const [screen, setScreen] = useState<Screen>(() => (linkCode ? 'online' : 'menu'));
  const [mine, setMine] = useState(() => favTeam('cricket'));
  const [opp, setOpp] = useState(() => defaultOpponent('cricket', favTeam('cricket')));
  const [opp2, setOpp2] = useState(() => defaultOpponent('cricket', favTeam('cricket')));
  const [diff, setDiff] = useState<Difficulty | 'auto'>('auto');
  const [overs, setOvers] = useState<number | null>(game.defOvers);
  const [wickets, setWickets] = useState(game.defWickets);
  const [start, setStart] = useState<'bat' | 'bowl' | 'toss'>('toss');
  const [extra, setExtra] = useState<Record<string, string | number>>(game.defaultExtra ?? {});
  const [spec, setSpec] = useState<CricketSpec | null>(null);
  const [matchKey, setMatchKey] = useState(0);
  const [after, setAfter] = useState<After | null>(null);
  const [cup, setCup] = useState<Tournament | null>(() => loadTournament(game.id));
  const [stars, setStars] = useState(() => loadStars(game.id));
  const [pickTeam, setPickTeam] = useState(false);
  const [shareMsg, setShareMsg] = useState('');
  const [tieSpec, setTieSpec] = useState<{ spec: CricketSpec; o: CricketOutcome } | null>(null);

  const levels = useMemo(() => ladder(game.id), [game.id]);
  const daily = useMemo(() => dailyChase(game.id), [game.id]);
  const sim = useMemo(() => cricketSimulator('cricket', game.cup.overs * 6, game.par, game.cup.wickets), [game]);
  const rules = game.rules(t);
  const help = <ol>{rules.map((r) => <li key={r}>{r}</li>)}</ol>;

  const teamName = (id: string) => x.bi(getTeam(id).name);
  const chooseMine = (id: string) => { setMine(id); setFavTeam('cricket', id); if (id === opp) setOpp(defaultOpponent('cricket', id)); };
  const autoDiff = (o: string): Difficulty => difficultyFor(ratingOf(getTeam(o), 'cricket'));

  const launch = (s: CricketSpec) => { setSpec(s); setMatchKey((k) => k + 1); setScreen('match'); sfx('bell'); };

  const base = (o: string): Omit<CricketSpec, 'mode'> => ({
    teams: [mine, o], names: [teamName(mine), teamName(o)], vsAI: true, difficulty: autoDiff(o), overs, wickets, start, seed: (Math.random() * 2 ** 31) >>> 0, extra,
  });

  const startQuick = () => launch({ ...base(opp), mode: 'quick', difficulty: diff === 'auto' ? autoDiff(opp) : diff });
  const startLocal = () => launch({
    mode: 'local', teams: [mine, opp2], names: [`${p1} (${getTeam(mine).code})`, `${p2} (${getTeam(opp2).code})`], vsAI: false,
    difficulty: 'medium', overs, wickets, start, seed: (Math.random() * 2 ** 31) >>> 0, extra,
  });
  const startLevel = (i: number) => {
    const L = levels[i];
    launch({ ...base(L.opp), mode: 'challenge', overs: null, wickets: L.wickets, chase: { target: L.target, balls: L.balls, wickets: L.wickets }, start: 'bat', occasion: `${t('Level', 'লেভেল')} ${n(L.n)} · ${x.bi(L.title)}`, extra: { ...extra, level: L.n } });
  };
  const startDaily = () => launch({
    ...base(daily.opp), mode: 'daily', overs: null, wickets: daily.wickets, chase: { target: daily.target, balls: daily.balls, wickets: daily.wickets },
    difficulty: 'medium', start: 'bat', seed: daily.seed, occasion: t('Daily Challenge', 'আজকের চ্যালেঞ্জ'),
  });
  const startCupMatch = (tour: Tournament) => {
    const f = nextFixture(tour);
    if (!f) return;
    const o = f.home === tour.player ? f.away : f.home;
    launch({ ...base(o), teams: [tour.player, o], names: [teamName(tour.player), teamName(o)], mode: 'tournament', overs: game.cup.overs, wickets: game.cup.wickets, start: 'toss', occasion: stageName(x, f), extra: { ...extra, fixture: f.id } });
  };

  const humanRuns = (o: CricketOutcome) => o.innings[o.battingFirst === 0 ? 0 : 1];

  const done = (o: CricketOutcome) => {
    const s = spec!;
    const w = o.result.winnerSide;
    // A tied knockout goes to a super over.
    if (s.mode === 'tournament' && w === null && !s.superOver) {
      const f = cup && nextFixture(cup);
      if (f && f.stage !== 'group') {
        setTieSpec({ spec: s, o });
        launch({ ...s, overs: 1, wickets: 2, superOver: true, start: 'toss', occasion: t('Super over!', 'সুপার ওভার!'), seed: s.seed + 1 });
        return;
      }
    }
    const won = w === 0;
    const outcome = !s.vsAI ? 'none' : w === null ? 'tie' : won ? 'win' : 'loss';
    const mineInn = humanRuns(o);
    const a: After = { spec: s, o };
    let cupsWon = 0;
    if (s.mode === 'challenge' && s.chase) {
      const lv = Number(s.extra.level);
      const st = starsFor(s.chase, won, mineInn.balls, mineInn.wickets);
      a.stars = st;
      if (st > 0) setStars(saveStars(game.id, lv, st));
    }
    if (s.mode === 'daily' && s.chase) {
      const sc = dailyScore(mineInn.runs, won, s.chase.balls - mineInn.balls, s.chase.wickets - mineInn.wickets);
      const r = saveDaily(game.id, sc, won);
      a.daily = sc; a.dailyBest = r.best;
    }
    if (s.mode === 'tournament' && cup) {
      const base0 = tieSpec && s.superOver ? tieSpec : { spec: s, o };
      const f = nextFixture(cup)!;
      const fo = base0.o;
      const sideRuns = (side: Side) => fo.innings[fo.battingFirst === side ? 0 : 1];
      const homeSide: Side = f.home === cup.player ? 0 : 1;
      const awaySide: Side = homeSide === 0 ? 1 : 0;
      let winnerTeam: string | null = w === null ? null : s.teams[w];
      let note: string | undefined;
      if (s.superOver) { note = 'super'; if (w === null) winnerTeam = Math.random() < 0.5 ? s.teams[0] : s.teams[1]; }
      const next = playerResult(cup, f.id, {
        score: [sideRuns(homeSide).runs, sideRuns(awaySide).runs],
        balls: [Math.max(1, sideRuns(homeSide).balls), Math.max(1, sideRuns(awaySide).balls)],
        winner: winnerTeam, note,
      }, sim);
      setCup(next); saveTournament(next, game.id); setTieSpec(null);
      if (next.status === 'won') { a.cupNote = 'won'; cupsWon = (getStats(game.id).records.cupsWon ?? 0) + 1; }
      else if (next.status === 'out') a.cupNote = 'out';
    }
    const records: Record<string, number> = { highestInnings: Math.max(o.innings[0].runs, o.innings[1].runs) };
    if (cupsWon) records.cupsWon = cupsWon;
    if (a.stars) records.levelsCleared = Object.keys(loadStars(game.id)).length;
    const rec = recordResult(game.id, { outcome, score: s.vsAI ? mineInn.runs : undefined, records }, () => {
      const ids = game.achievements?.(o, s, won) ?? [];
      if (cupsWon) ids.push(`${game.id}-cup`);
      return ids;
    });
    a.newBest = s.vsAI && rec.newBest;
    setAfter(a);
    setScreen('after');
  };

  const resultTitle = (s: CricketSpec, o: CricketOutcome) => {
    const r = o.result;
    if (r.winnerSide === null) return t('Match tied!', 'ম্যাচ টাই!');
    const name = s.names[r.winnerSide];
    return r.kind === 'runs' ? t(`${name} won by ${r.margin} ${r.margin === 1 ? 'run' : 'runs'}`, `${name} ${n(r.margin)} রানে জিতেছে`)
      : t(`${name} won by ${r.margin} ${r.margin === 1 ? 'wicket' : 'wickets'}`, `${name} ${n(r.margin)} উইকেটে জিতেছে`);
  };

  // ---------- Screens ----------

  if (screen === 'online' && game.Online) {
    const O = game.Online;
    return (
      <div className="sport-root ruled" style={{ ['--accent' as string]: '#0b5d43' }}>
        <O onBack={() => setScreen('menu')} code={linkCode} />
      </div>
    );
  }

  if (screen === 'match' && spec) {
    const M = game.Match;
    return <M key={matchKey} spec={spec} onDone={done} onQuit={() => setScreen(spec.mode === 'tournament' ? 'cup' : 'menu')} onRestart={() => launch({ ...spec })} />;
  }

  const back = <button className="btn secondary sport-back" onClick={() => setScreen('menu')}>← {t('Modes', 'খেলার ধরন')}</button>;
  const overSeg = (
    <>
      <div className="opt-label">{t('Overs', 'ওভার')}</div>
      <Seg label={t('Overs', 'ওভার')} value={overs ?? 0} onChange={(v) => setOvers(v === 0 ? null : v)}
        options={[...game.overs.map((v) => ({ v, label: n(v) })), ...(game.allowNoLimit ? [{ v: 0, label: t('No limit', 'সীমা নেই') }] : [])]} />
      <div className="opt-label">{t('Wickets', 'উইকেট')}</div>
      <Seg label={t('Wickets', 'উইকেট')} value={wickets} onChange={setWickets} options={game.wickets.map((v) => ({ v, label: n(v) }))} />
    </>
  );
  const Opt = game.Options;

  let body: ReactNode = null;
  if (screen === 'menu') {
    const nextLv = levels.findIndex((_, i) => !(stars[i + 1] > 0));
    const dr = dailyRecord(game.id);
    const cupF = cup && nextFixture(cup);
    body = (
      <>
        <div className="sport-eyebrow">{t('Tiffin cricket', 'টিফিনের ক্রিকেট')}</div>
        <h2>{x.bi(game.title)}</h2>
        <p className="lede">{x.bi(game.lede)}</p>
        <details className="bench-rules"><summary>{t('How to play', 'কীভাবে খেলবে')}</summary>{help}</details>
        <div className="mode-grid">
          {game.Online && <ModeCard testid="mode-online" icon="🌐" title={t('Play online · 1v1', 'অনলাইনে খেলো · ১ বনাম ১')} sub={t('Quick match, or a room with a code or link for a friend.', 'কুইক ম্যাচ, অথবা বন্ধুর জন্য কোড বা লিংকসহ রুম।')} badge={t('New', 'নতুন')} onClick={() => setScreen('online')} />}
          <ModeCard testid="mode-quick" icon={game.icon} title={t('Quick Match', 'কুইক ম্যাচ')} sub={t('Pick two countries. Bat first or chase.', 'দুই দেশ বাছো। আগে ব্যাট নাকি তাড়া।')} onClick={() => setScreen('quick')} />
          <ModeCard testid="mode-challenge" icon="🎯" title={t('Target Challenge', 'টার্গেট চ্যালেঞ্জ')} sub={t(`${levels.length} chases, each harder than the last.`, `${n(levels.length)}টা তাড়া, প্রতিটা আগেরটার চেয়ে কঠিন।`)} badge={nextLv < 0 ? t('All done!', 'সব শেষ!') : t(`Level ${nextLv + 1}`, `লেভেল ${n(nextLv + 1)}`)} onClick={() => setScreen('ladder')} />
          <ModeCard testid="mode-cup" icon="🏆" title={t('Tournament', 'টুর্নামেন্ট')} sub={t('Groups, semi-final and final. Lift the cup.', 'গ্রুপ, সেমিফাইনাল আর ফাইনাল। কাপ জেতো।')} badge={cupF ? t('Continue', 'চালিয়ে যাও') : undefined} onClick={() => setScreen('cup')} />
          <ModeCard testid="mode-daily" icon="📅" title={t('Daily Challenge', 'আজকের চ্যালেঞ্জ')} sub={t(`Today: ${daily.target} from ${daily.balls} balls.`, `আজ: ${n(daily.balls)} বলে ${n(daily.target)}।`)} badge={dr ? t(`Best ${dr.best}`, `সেরা ${n(dr.best)}`) : t('New', 'নতুন')} onClick={() => setScreen('daily')} />
          <ModeCard testid="mode-local" icon="👥" title={t('With a friend', 'বন্ধুর সাথে')} sub={t('Two players on one device.', 'এক ফোনে দুজন।')} onClick={() => setScreen('local')} />
        </div>
      </>
    );
  } else if (screen === 'quick') {
    body = (
      <>
        {back}
        <h2>{t('Quick Match', 'কুইক ম্যাচ')}</h2>
        <MatchUp sport="cricket" mine={mine} opp={opp} onMine={chooseMine} onOpp={setOpp} />
        {game.usesDifficulty && (
          <>
            <div className="opt-label">{t('Computer', 'কম্পিউটার')}</div>
            <Seg label={t('Computer', 'কম্পিউটার')} value={diff} onChange={setDiff} options={[{ v: 'auto', label: t(`By team (${autoDiffLabel(x, autoDiff(opp))})`, `দল অনুযায়ী (${autoDiffLabel(x, autoDiff(opp))})`) }, { v: 'easy', label: t('Easy', 'সহজ') }, { v: 'medium', label: t('Medium', 'মাঝারি') }, { v: 'hard', label: t('Hard', 'কঠিন') }]} />
          </>
        )}
        {overSeg}
        <div className="opt-label">{t('You', 'তুমি')}</div>
        <Seg label={t('Bat or chase', 'ব্যাট নাকি তাড়া')} value={start} onChange={setStart} options={[{ v: 'toss', label: t('Toss for it', 'টস হবে') }, { v: 'bat', label: t('Bat first', 'আগে ব্যাট') }, { v: 'bowl', label: t('Bowl first, then chase', 'আগে বল, পরে তাড়া') }]} />
        {Opt && <Opt value={extra} onChange={setExtra} />}
        <div className="sport-actions"><button className="btn big" onClick={startQuick} data-testid="start">{t('Start match', 'ম্যাচ শুরু')}</button></div>
      </>
    );
  } else if (screen === 'local') {
    body = (
      <>
        {back}
        <h2>{t('With a friend', 'বন্ধুর সাথে')}</h2>
        <p className="lede">{t('Sit side by side or across the bench. Each picks a country.', 'পাশাপাশি বা বেঞ্চের দুই দিকে বসো। দুজনে একটা করে দেশ নাও।')}</p>
        <MatchUp sport="cricket" mine={mine} opp={opp2} onMine={chooseMine} onOpp={setOpp2} mineLabel={p1} oppLabel={p2} />
        {overSeg}
        <div className="opt-label">{p1}</div>
        <Seg label={t('Start', 'শুরু')} value={start} onChange={setStart} options={[{ v: 'toss', label: t('Toss for it', 'টস হবে') }, { v: 'bat', label: t('Bats first', 'আগে ব্যাট') }, { v: 'bowl', label: t('Bowls first', 'আগে বল') }]} />
        {Opt && <Opt value={extra} onChange={setExtra} />}
        <div className="sport-actions"><button className="btn big" onClick={startLocal} data-testid="start">{t('Start match', 'ম্যাচ শুরু')}</button></div>
      </>
    );
  } else if (screen === 'ladder') {
    body = (
      <>
        {back}
        <h2>{t('Target Challenge', 'টার্গেট চ্যালেঞ্জ')}</h2>
        <p className="lede">{t('You come in to chase. Win to open the next level. Stars: win · a quarter of the balls to spare · no wicket lost.', 'তুমি তাড়া করতে নামবে। জিতলে পরের লেভেল খুলবে। তারা: জয় · এক-চতুর্থাংশ বল বাকি · একটাও উইকেট না হারানো।')}</p>
        <TeamLine x={x} mine={mine} open={pickTeam} setOpen={setPickTeam} onPick={chooseMine} />
        <div className="ladder">
          {levels.map((L, i) => {
            const open = isUnlocked(stars, L.n);
            const st = stars[L.n] ?? 0;
            return (
              <button key={L.n} className={`lvl ${st ? 'done' : ''}`} disabled={!open} onClick={() => startLevel(i)} data-testid={`level-${L.n}`}>
                <span className="ln">{t('Level', 'লেভেল')} {n(L.n)} · {x.bi(L.title)}</span>
                <b>{t(`${L.target} from ${L.balls} balls`, `${n(L.balls)} বলে ${n(L.target)}`)}</b>
                <small><Flag id={L.opp} size={18} /> {t('vs', 'বনাম')} {teamName(L.opp)} · {t(`${L.wickets} wkt`, `${n(L.wickets)} উইকেট`)}</small>
                <span className="stars">{'★'.repeat(st)}<span className="off">{'★'.repeat(3 - st)}</span></span>
              </button>
            );
          })}
        </div>
      </>
    );
  } else if (screen === 'cup') {
    const f = cup && nextFixture(cup);
    body = (
      <>
        {back}
        <h2>{t('Tournament', 'টুর্নামেন্ট')}</h2>
        {!cup ? (
          <>
            <p className="lede">{t(`Eight countries in two groups. Top two go to the semi-finals. ${game.cup.overs} overs, ${game.cup.wickets} wickets a side.`, `দুই গ্রুপে আট দেশ। সেরা দুই দল সেমিফাইনালে। প্রতি দলে ${n(game.cup.overs)} ওভার, ${n(game.cup.wickets)} উইকেট।`)}</p>
            <div className="opt-label">{t('Choose your country', 'তোমার দেশ বাছো')}</div>
            <TeamGrid sport="cricket" value={mine} onChange={chooseMine} label={t('Your team', 'তোমার দল')} />
            <div className="sport-actions"><button className="btn big" data-testid="cup-start" onClick={() => { const c = createTournament(game.id, 'cricket', mine, game.cup.overs * 6); setCup(c); saveTournament(c, game.id); sfx('fanfare'); }}>{t('Start the cup', 'কাপ শুরু')}</button></div>
          </>
        ) : (
          <>
            {f ? (
              <div className="cup-next">
                <span><small>{stageName(x, f)}</small><br /><b><Flag id={f.home} size={24} /> {teamName(f.home)} {t('vs', 'বনাম')} {teamName(f.away)} <Flag id={f.away} size={24} /></b></span>
                <button className="btn big" onClick={() => startCupMatch(cup)} data-testid="cup-play">{t('Play', 'খেলো')}</button>
              </div>
            ) : (
              <div className="cup-next">
                <b>{cup.status === 'won' ? t('Champions! 🏆', 'চ্যাম্পিয়ন! 🏆') : t(`Knocked out. ${cup.champion ? teamName(cup.champion) + ' won the cup.' : ''}`, `বিদায়। ${cup.champion ? teamName(cup.champion) + ' কাপ জিতেছে।' : ''}`)}</b>
                <button className="btn" onClick={() => { setCup(null); saveTournament(null, game.id); }} data-testid="cup-new">{t('New cup', 'নতুন কাপ')}</button>
              </div>
            )}
            <CupBoard t={cup} />
            {f && <div className="sport-actions"><button className="btn secondary" onClick={() => { if (confirm(t('Give up this cup?', 'এই কাপ ছেড়ে দেবে?'))) { setCup(null); saveTournament(null, game.id); } }}>{t('Abandon cup', 'কাপ ছেড়ে দাও')}</button></div>}
          </>
        )}
      </>
    );
  } else if (screen === 'daily') {
    const dr = dailyRecord(game.id);
    const streak = dailyStreak(game.id);
    body = (
      <>
        {back}
        <h2>{t('Daily Challenge', 'আজকের চ্যালেঞ্জ')}</h2>
        <p className="lede">{t('Everyone gets the same chase today. Score = your runs, plus a bonus for winning with balls and wickets to spare.', 'আজ সবার জন্য একই তাড়া। স্কোর = তোমার রান, আর বল ও উইকেট হাতে রেখে জিতলে বোনাস।')}</p>
        <div className="daily-card">
          <small>{new Date().toLocaleDateString(x.lang === 'bn' ? 'bn-BD' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</small>
          <div className="big">{t(`${daily.target} from ${daily.balls} balls, ${daily.wickets} wickets`, `${n(daily.balls)} বলে ${n(daily.target)}, ${n(daily.wickets)} উইকেট`)}</div>
          <div><Flag id={mine} size={22} /> {teamName(mine)} {t('vs', 'বনাম')} {teamName(daily.opp)} <Flag id={daily.opp} size={22} /></div>
          <div className="daily-stats">
            <span>{t('Best today', 'আজকের সেরা')} <b>{dr ? n(dr.best) : '—'}</b></span>
            <span>{t('Tries', 'চেষ্টা')} <b>{n(dr?.tries ?? 0)}</b></span>
            <span>{t('Day streak', 'টানা দিন')} <b>{n(streak)}</b></span>
          </div>
        </div>
        <TeamLine x={x} mine={mine} open={pickTeam} setOpen={setPickTeam} onPick={chooseMine} />
        <div className="sport-actions">
          <button className="btn big" onClick={startDaily} data-testid="daily-play">{dr ? t('Try again', 'আবার চেষ্টা') : t('Play today’s chase', 'আজকের তাড়া খেলো')}</button>
          {dr && <button className="btn secondary" onClick={async () => { const r = await shareOrCopy(`${x.bi(game.title)} · ${daily.key}\n${t('Chase', 'তাড়া')} ${daily.target}/${daily.balls}\n${t('My best', 'আমার সেরা')}: ${dr.best}`); setShareMsg(r === 'failed' ? '' : t('Copied!', 'কপি হয়েছে!')); }}>{t('Share my score', 'স্কোর শেয়ার')}</button>}
          {shareMsg && <span className="best-line">{shareMsg}</span>}
        </div>
      </>
    );
  } else if (screen === 'after' && after) {
    const { spec: s, o } = after;
    const w = o.result.winnerSide;
    const won = w === 0;
    const inn = (i: 0 | 1) => {
      const side: Side = i === 0 ? o.battingFirst : (o.battingFirst === 0 ? 1 : 0);
      const virtual = s.chase && i === 0;
      return [`${s.names[side]}${virtual ? ` (${t('target set', 'লক্ষ্য')})` : ''}`, virtual ? `${n(o.innings[0].runs)}` : `${n(o.innings[i].runs)}/${n(o.innings[i].wickets)} (${t(`${o.innings[i].balls} balls`, `${n(o.innings[i].balls)} বল`)})`] as [string, string];
    };
    const rows: Array<[string, string | number]> = [inn(0), inn(1), ...o.rows];
    if (after.stars !== undefined) rows.push([t('Stars', 'তারা'), after.stars ? '★'.repeat(after.stars) : '—']);
    if (after.daily !== undefined) rows.push([t('Daily score', 'আজকের স্কোর'), after.daily]);
    const lv = Number(s.extra.level);
    const outcomeStamp = !s.vsAI ? (w === null ? 'tie' : 'none') : w === null ? 'tie' : won ? 'win' : 'loss';
    const actions: ReactNode[] = [];
    if (s.mode === 'tournament') {
      if (after.cupNote === 'won') actions.push(<button key="c" className="btn big" autoFocus onClick={() => setScreen('champion')} data-testid="after-next">{t('Lift the cup!', 'কাপ তোলো!')}</button>);
      else actions.push(<button key="c" className="btn big" autoFocus onClick={() => setScreen('cup')} data-testid="after-next">{t('Back to the cup', 'কাপে ফেরো')}</button>);
    } else if (s.mode === 'challenge') {
      if (won && lv < levels.length) actions.push(<button key="n" className="btn big" autoFocus onClick={() => startLevel(lv)} data-testid="after-next">{t('Next level', 'পরের লেভেল')}</button>);
      actions.push(<button key="r" className={`btn ${won ? 'secondary' : 'big'}`} autoFocus={!won} onClick={() => startLevel(lv - 1)} data-testid="after-retry">{t('Try again', 'আবার চেষ্টা')}</button>);
      actions.push(<button key="l" className="btn secondary" onClick={() => setScreen('ladder')}>{t('All levels', 'সব লেভেল')}</button>);
    } else if (s.mode === 'daily') {
      actions.push(<button key="r" className="btn big" autoFocus onClick={startDaily} data-testid="after-retry">{t('Try again', 'আবার চেষ্টা')}</button>);
      actions.push(<button key="d" className="btn secondary" onClick={() => setScreen('daily')}>{t('Daily board', 'আজকের বোর্ড')}</button>);
    } else {
      actions.push(<button key="r" className="btn big" autoFocus onClick={() => launch({ ...s, seed: (Math.random() * 2 ** 31) >>> 0 })} data-testid="after-retry">{t('Play again', 'আবার খেলো')}</button>);
      actions.push(<button key="s" className="btn secondary" onClick={() => setScreen(s.mode === 'local' ? 'local' : 'quick')}>{t('Change teams', 'দল বদলাও')}</button>);
    }
    actions.push(<button key="m" className="btn secondary" onClick={() => setScreen('menu')}>{t('Modes', 'খেলার ধরন')}</button>);
    return (
      <div className="sport-root ruled">
        <div className="overlay" role="dialog" aria-modal="true" aria-label={resultTitle(s, o)}>
          <div className="report result-card" data-testid="result">
            <div className="school">{s.occasion ?? x.bi(game.title)}</div>
            <ResultHero outcome={outcomeStamp} title={resultTitle(s, o)}
              sub={s.chase && w !== null ? (won ? t('Chased it down!', 'লক্ষ্য তাড়া করে জয়!') : t(`Fell ${Math.max(1, s.chase.target - humanRuns(o).runs)} short.`, `${n(Math.max(1, s.chase.target - humanRuns(o).runs))} রান কম পড়ল।`)) : undefined} />
            <ScoreDuel winner={w} mid={t('vs', 'বনাম')}
              a={{ name: x.bi(getTeam(s.teams[0]).name), badge: <Flag id={s.teams[0]} size={34} />, score: `${n(o.innings[o.battingFirst === 0 ? 0 : 1].runs)}/${n(o.innings[o.battingFirst === 0 ? 0 : 1].wickets)}`, me: s.vsAI }}
              b={{ name: x.bi(getTeam(s.teams[1]).name), badge: <Flag id={s.teams[1]} size={34} />, score: `${n(o.innings[o.battingFirst === 1 ? 0 : 1].runs)}/${n(o.innings[o.battingFirst === 1 ? 0 : 1].wickets)}` }} />
            {after.cupNote === 'out' && <p className="sub">{t('Out of the cup this time.', 'এবার কাপ থেকে বিদায়।')}</p>}
            <table><tbody>{rows.map(([k, v], i) => <tr key={i}><td>{k}</td><td>{typeof v === 'number' ? n(v) : v}</td></tr>)}</tbody></table>
            {(after.newBest || after.dailyBest) && <div style={{ textAlign: 'center' }}><span className="new-best">★ {after.dailyBest ? t('Best score today', 'আজকের সেরা স্কোর') : t('New best', 'নতুন রেকর্ড')}</span></div>}
            <div className="actions">{actions}</div>
          </div>
        </div>
      </div>
    );
  } else if (screen === 'champion' && cup) {
    return (
      <div className="sport-root ruled">
        <Championship team={cup.player} title={t('CHAMPIONS!', 'চ্যাম্পিয়ন!')}
          lines={[t(`${x.bi(game.title)} Cup`, `${x.bi(game.title)} কাপ`), t('The whole class is cheering for you.', 'পুরো ক্লাস তোমার জন্য হাততালি দিচ্ছে।')]}
          actionLabel={t('See the cup board', 'কাপের বোর্ড দেখো')} onDone={() => setScreen('cup')} />
      </div>
    );
  }

  return (
    <div className="sport-root ruled" style={{ ['--accent' as string]: '#0b5d43' }}>
      <HubBar help={help} lang={x.lang} />
      <div className="sport-page" data-testid="setup">{body}</div>
    </div>
  );
}

function autoDiffLabel(x: ReturnType<typeof useTx>, d: Difficulty) {
  return d === 'hard' ? x.t('hard', 'কঠিন') : d === 'medium' ? x.t('medium', 'মাঝারি') : x.t('easy', 'সহজ');
}

function TeamLine({ x, mine, open, setOpen, onPick }: { x: ReturnType<typeof useTx>; mine: string; open: boolean; setOpen: (v: boolean) => void; onPick: (id: string) => void }) {
  return (
    <div style={{ margin: '8px 0' }}>
      <button className="btn secondary" onClick={() => setOpen(!open)} aria-expanded={open} data-testid="team-line">
        <Flag id={mine} size={28} /> {x.t('Playing as', 'খেলছ')} {x.bi(getTeam(mine).name)} · {x.t('change', 'বদলাও')}
      </button>
      {open && <TeamGrid sport="cricket" value={mine} onChange={(id) => { onPick(id); setOpen(false); }} label={x.t('Your team', 'তোমার দল')} />}
    </div>
  );
}
