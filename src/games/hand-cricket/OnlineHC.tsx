import { useEffect, useMemo, useRef, useState } from 'react';
import { sfx, vibrate } from '../../platform/audio';
import { recordResult } from '../../platform/scores';
import { readJSON, writeJSON } from '../../platform/storage';
import { clearHashQuery } from '../../platform/router';
import { NetError, cleanCode, createRoom, isCode, joinRoom, quickMatch, roomLink, CODE_LEN, type Peer, type Profile } from '../../platform/net/rooms';
import { Overlay, Seg, useGameBar, usePlayerNames } from '../../components/ui';
import { ChaseHud, Flag, TeamGrid, favTeam, setFavTeam, useTx } from '../../components/sport/SportKit';
import { ballsLeft, currentOver, oversText } from '../../shared/cricket';
import { getTeam } from '../../shared/teams';
import { Hand } from './Hand';
import { makeHandCricketBot, QUICK_SETUP } from './bot';
import { HCDuel, type DuelEvent, type DuelSetup, type DuelView } from './duel';
import { battingSide, limitsOf, other, targetOf, type Side } from './logic';
import './online.css';

// Online 1v1 Hand Cricket: quick match, create a room (code + link), or join with a code.
// The match itself is HCDuel; the other end is a real player through InsForge, or, in quick
// match when nobody is waiting, the stand-in (bot.ts) on the same protocol.

const GAME = 'hand-cricket';
type Stage = 'lobby' | 'room' | 'joining' | 'search' | 'found' | 'match';

export function OnlineHandCricket({ onBack, code: linkCode }: { onBack: () => void; code?: string }) {
  const x = useTx();
  const { t, n } = x;
  const [p1] = usePlayerNames();
  const [name, setNameState] = useState(() => readJSON<string>('online.name', '') || p1);
  const [team, setTeam] = useState(() => favTeam('cricket'));
  const [pickTeam, setPickTeam] = useState(false);
  const [stage, setStage] = useState<Stage>('lobby');
  const [joinCode, setJoinCode] = useState(linkCode ?? '');
  const [err, setErr] = useState('');
  const [room, setRoom] = useState<{ code: string; cancel: () => void } | null>(null);
  const [setup, setSetup] = useState<DuelSetup>(QUICK_SETUP);
  const [waited, setWaited] = useState(0);
  const [peer, setPeer] = useState<Peer | null>(null);
  const [copied, setCopied] = useState('');
  const signal = useRef({ cancelled: false });
  const me: Profile = { name: name.trim().slice(0, 16) || p1, team };
  const setName = (v: string) => { setNameState(v); writeJSON('online.name', v); };
  const help = <ol>{[
    t('Quick match finds another player who is waiting.', 'কুইক ম্যাচ অপেক্ষারত আরেকজন খেলোয়াড় খুঁজে দেয়।'),
    t('Create a room to get a code. Send the code or the link to a friend.', 'রুম খুললে একটা কোড পাবে। কোড বা লিংক বন্ধুকে পাঠাও।'),
    t('Both players lock a number at the same time. Nobody can see or change it before both have picked.', 'দুজনেই একসাথে সংখ্যা ঠিক করে। দুজনের বাছাই শেষ হওয়ার আগে কেউ দেখতে বা বদলাতে পারে না।'),
  ].map((r) => <li key={r}>{r}</li>)}</ol>;
  useGameBar({ help }, [x.lang]);

  // Leaving the screen ends any search or room.
  useEffect(() => () => { signal.current.cancelled = true; }, []);
  useEffect(() => () => { room?.cancel(); }, [room]);
  // A link opened with ?room=CODE: join straight away (after the name is known).
  const autoJoined = useRef(false);
  useEffect(() => {
    if (linkCode && !autoJoined.current && isCode(cleanCode(linkCode))) { autoJoined.current = true; clearHashQuery(); void join(cleanCode(linkCode)); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const errText = (e: unknown) => {
    const c = e instanceof NetError ? e.code : 'offline';
    if (c === 'not-found') return t('No room with that code. Check the code, or ask your friend to open the room again.', 'এই কোডের কোনো রুম নেই। কোডটা দেখো, বা বন্ধুকে আবার রুম খুলতে বলো।');
    if (c === 'full') return t('That room already has two players.', 'ওই রুমে আগেই দুজন আছে।');
    if (c === 'cancelled') return '';
    return t('Could not connect. Check the internet and try again.', 'সংযোগ হলো না। ইন্টারনেট দেখে আবার চেষ্টা করো।');
  };

  const begin = (p: Peer) => {
    setPeer(p);
    setStage('found');
    sfx('good');
    vibrate([20, 40, 20]);
    window.setTimeout(() => setStage('match'), 1600);
  };

  const fresh = () => { signal.current = { cancelled: false }; setErr(''); return signal.current; };

  async function quick() {
    const sig = fresh();
    setStage('search'); setWaited(0); sfx('click');
    try {
      const p = await quickMatch(GAME, me, { waitMs: 10000, signal: sig, onTick: setWaited, makeBot: () => makeHandCricketBot(me) });
      if (!sig.cancelled) begin(p);
    } catch (e) { if (!sig.cancelled) { setErr(errText(e)); setStage('lobby'); } }
  }

  async function create() {
    fresh(); sfx('click');
    try {
      const w = await createRoom(GAME, me);
      setRoom({ code: w.code, cancel: w.cancel });
      setStage('room');
      const p = await w.peer;
      setRoom(null);
      begin(p);
    } catch (e) { const m = errText(e); if (m) setErr(m); setRoom(null); setStage('lobby'); }
  }

  async function join(c = cleanCode(joinCode)) {
    if (!isCode(c)) { setErr(t(`A room code has ${CODE_LEN} letters and numbers.`, `রুম কোডে ${n(CODE_LEN)}টা অক্ষর আর সংখ্যা থাকে।`)); return; }
    const sig = fresh();
    setStage('joining'); sfx('click');
    try {
      const p = await joinRoom(GAME, c, me, sig);
      if (!sig.cancelled) begin(p);
    } catch (e) { if (!sig.cancelled) { setErr(errText(e)); setStage('lobby'); } }
  }

  const cancel = () => { signal.current.cancelled = true; room?.cancel(); setRoom(null); setStage('lobby'); };

  const share = async (code: string) => {
    const url = roomLink(GAME, code);
    const text = t(`Play Hand Cricket with me! Room ${code}`, `আমার সাথে হ্যান্ড ক্রিকেট খেলো! রুম ${code}`);
    try {
      if (navigator.share) { await navigator.share({ title: 'Hand Cricket', text, url }); return; }
    } catch { /* closed the share sheet */ }
    try { await navigator.clipboard.writeText(`${text}\n${url}`); setCopied('link'); } catch { setCopied('fail'); }
  };
  const copyCode = async (code: string) => { try { await navigator.clipboard.writeText(code); setCopied('code'); } catch { setCopied('fail'); } };

  if (stage === 'match' && peer) {
    return <OnlineMatch peer={peer} setup={peer.host ? setup : null} onLeave={() => { peer.close(); setPeer(null); setStage('lobby'); }} />;
  }

  const youCard = (
    <div className="ol-you">
      <label className="ol-name">
        <span>{t('Your name', 'তোমার নাম')}</span>
        <input value={name} maxLength={16} onChange={(e) => setName(e.target.value)} placeholder={t('Name', 'নাম')} data-testid="online-name" autoComplete="nickname" />
      </label>
      <button className="btn secondary ol-team" onClick={() => setPickTeam(!pickTeam)} aria-expanded={pickTeam} data-testid="online-team">
        <Flag id={team} size={26} /> {x.bi(getTeam(team).name)} <small>{t('change', 'বদলাও')}</small>
      </button>
      {pickTeam && <TeamGrid sport="cricket" value={team} onChange={(id) => { setTeam(id); setFavTeam('cricket', id); setPickTeam(false); }} label={t('Your team', 'তোমার দল')} />}
    </div>
  );

  let body;
  if (stage === 'room' && room) {
    body = (
      <div className="ol-wait" data-testid="room-wait">
        <h2>{t('Your room is open', 'তোমার রুম খোলা হয়েছে')}</h2>
        <p className="lede">{t('Send this code or link to your friend. The match starts when they join.', 'এই কোড বা লিংক বন্ধুকে পাঠাও। সে ঢুকলেই খেলা শুরু।')}</p>
        <div className="ol-code" data-testid="room-code" aria-label={room.code}>{room.code.split('').map((c, i) => <span key={i}>{c}</span>)}</div>
        <div className="ol-share">
          <button className="btn big" onClick={() => void share(room.code)} data-testid="share-link">🔗 {t('Share link', 'লিংক পাঠাও')}</button>
          <button className="btn secondary" onClick={() => void copyCode(room.code)}>{t('Copy code', 'কোড কপি')}</button>
        </div>
        {copied && <p className="ol-note">{copied === 'fail' ? t('Could not copy here: tell your friend the code.', 'এখানে কপি হলো না: বন্ধুকে কোডটা বলে দাও।') : copied === 'code' ? t('Code copied.', 'কোড কপি হয়েছে।') : t('Link copied. Paste it in a message to your friend.', 'লিংক কপি হয়েছে। বন্ধুকে মেসেজে পাঠাও।')}</p>}
        <p className="ol-meta">{t(`${setup.overs} over${setup.overs > 1 ? 's' : ''} · ${setup.wickets} wicket${setup.wickets > 1 ? 's' : ''}`, `${n(setup.overs)} ওভার · ${n(setup.wickets)} উইকেট`)}</p>
        <div className="ol-pulse"><i /><i /><i /> {t('Waiting for your friend…', 'বন্ধুর জন্য অপেক্ষা…')}</div>
        <button className="btn secondary" onClick={cancel} data-testid="cancel">{t('Close the room', 'রুম বন্ধ করো')}</button>
      </div>
    );
  } else if (stage === 'search' || stage === 'joining') {
    body = (
      <div className="ol-wait" data-testid="searching">
        <div className="ol-radar" aria-hidden="true"><span /><span /><Flag id={team} size={40} /></div>
        <h2>{stage === 'search' ? t('Finding a player…', 'খেলোয়াড় খোঁজা হচ্ছে…') : t('Joining the room…', 'রুমে ঢুকছি…')}</h2>
        {stage === 'search' && <p className="ol-meta">{t(`${waited}s`, `${n(waited)} সেকেন্ড`)} · {t('2 overs · 2 wickets', '২ ওভার · ২ উইকেট')}</p>}
        <button className="btn secondary" onClick={cancel} data-testid="cancel">{t('Cancel', 'বাতিল')}</button>
      </div>
    );
  } else if (stage === 'found' && peer) {
    body = (
      <div className="ol-found" data-testid="found">
        <div className="ol-found-row">
          <div className="ol-player"><Flag id={me.team} size={64} /><b>{me.name}</b></div>
          <span className="ol-vs">VS</span>
          <div className="ol-player"><Flag id={peer.them.team} size={64} /><b data-testid="opp-name">{peer.them.name}</b></div>
        </div>
        <h2>{t('Player found!', 'খেলোয়াড় পাওয়া গেছে!')}</h2>
      </div>
    );
  } else {
    body = (
      <>
        <button className="btn secondary sport-back" onClick={onBack}>← {t('Modes', 'খেলার ধরন')}</button>
        <div className="sport-eyebrow">{t('Online · 1v1', 'অনলাইন · ১ বনাম ১')}</div>
        <h2>{t('Play online', 'অনলাইনে খেলো')}</h2>
        {youCard}
        {err && <p className="ol-err" role="alert" data-testid="online-error">{err}</p>}
        <div className="ol-ways">
          <button className="ol-way main" onClick={() => void quick()} data-testid="quick-match">
            <span className="ol-ico" aria-hidden="true">⚡</span>
            <b>{t('Quick match', 'কুইক ম্যাচ')}</b>
            <small>{t('Play the next player who is looking for a game.', 'যে এখন খেলা খুঁজছে, তার সাথে খেলো।')}</small>
          </button>
          <div className="ol-way">
            <span className="ol-ico" aria-hidden="true">🔑</span>
            <b>{t('Create a room', 'রুম খোলো')}</b>
            <small>{t('Get a code and a link for a friend.', 'বন্ধুর জন্য একটা কোড আর লিংক পাও।')}</small>
            <div className="ol-opts">
              <Seg label={t('Overs', 'ওভার')} value={setup.overs} onChange={(v) => setSetup({ ...setup, overs: v })} options={[1, 2, 5].map((v) => ({ v, label: t(`${v} ov`, `${n(v)} ওভার`) }))} />
              <Seg label={t('Wickets', 'উইকেট')} value={setup.wickets} onChange={(v) => setSetup({ ...setup, wickets: v })} options={[1, 2, 3].map((v) => ({ v, label: t(`${v} wkt`, `${n(v)} উইকেট`) }))} />
            </div>
            <button className="btn" onClick={() => void create()} data-testid="create-room">{t('Create room', 'রুম খোলো')}</button>
          </div>
          <div className="ol-way">
            <span className="ol-ico" aria-hidden="true">🎟️</span>
            <b>{t('Join a room', 'রুমে ঢোকো')}</b>
            <small>{t('Type the code your friend sent.', 'বন্ধুর পাঠানো কোড লেখো।')}</small>
            <form className="ol-join" onSubmit={(e) => { e.preventDefault(); void join(); }}>
              <input value={joinCode} onChange={(e) => setJoinCode(cleanCode(e.target.value))} placeholder="AB7K3" maxLength={CODE_LEN + 4} inputMode="text" autoCapitalize="characters" autoComplete="off" spellCheck={false} aria-label={t('Room code', 'রুম কোড')} data-testid="join-code" />
              <button className="btn" type="submit" disabled={!isCode(joinCode)} data-testid="join-room">{t('Join', 'ঢোকো')}</button>
            </form>
          </div>
        </div>
      </>
    );
  }
  return <div className="sport-page ol-page" data-testid="online">{body}</div>;
}

// ---------- The match ----------

function OnlineMatch({ peer, setup, onLeave }: { peer: Peer; setup: DuelSetup | null; onLeave: () => void }) {
  const x = useTx();
  const { t, n } = x;
  const duel = useMemo(() => new HCDuel(peer, peer.host ? 0 : 1, setup ?? undefined), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [v, setV] = useState<DuelView>(duel.view);
  const [show, setShow] = useState<{ picks: [number, number]; text: string; kind: 'out' | 'six' | 'runs' } | null>(null);
  const [shaking, setShaking] = useState(false);
  const [breakNote, setBreakNote] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const recorded = useRef(0);
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };
  const mySide = v.mySide;
  const oppSide = other(mySide);
  const names: [string, string] = mySide === 0 ? [peer.me.name, peer.them.name] : [peer.them.name, peer.me.name];
  const teams: [string, string] = mySide === 0 ? [peer.me.team, peer.them.team] : [peer.them.team, peer.me.team];
  useGameBar({ help: <p>{t('Pick your number. When both have picked, the hands open together.', 'তোমার সংখ্যা বাছো। দুজনেই বাছলে একসাথে হাত খুলবে।')}</p> }, [x.lang]);

  useEffect(() => {
    (window as unknown as { __hcOnline?: HCDuel }).__hcOnline = duel;
    const offA = duel.onChange(setV);
    // Anything that arrived before this screen subscribed (e.g. the match settings).
    setV(duel.view);
    const offB = duel.onEvent((e: DuelEvent) => {
      if (e.kind === 'toss') { sfx('good'); return; }
      setShaking(true);
      later(() => {
        setShaking(false);
        const r = e.rec;
        const text = r.out ? t('OUT!', 'আউট!') : r.runs >= 6 ? t('SIX!', 'ছক্কা!') : t(`${r.runs} ${r.runs === 1 ? 'run' : 'runs'}`, `${n(r.runs)} রান`);
        setShow({ picks: e.picks, text, kind: r.out ? 'out' : r.runs >= 6 ? 'six' : 'runs' });
        if (r.out) { sfx('out'); vibrate([30, 40, 60]); } else if (r.runs >= 6) sfx('six'); else sfx('good', { pitch: 0.8 + r.runs * 0.06 });
        if (e.after.current !== e.before.current && !e.after.done) {
          const inn = e.after.innings[0];
          later(() => setBreakNote(t(`${names[e.after.battingFirst]} made ${inn.runs}/${inn.wickets}. ${names[other(e.after.battingFirst)]} need ${inn.runs + 1}.`, `${names[e.after.battingFirst]} করেছে ${n(inn.runs)}/${n(inn.wickets)}। ${names[other(e.after.battingFirst)]}-এর লাগবে ${n(inn.runs + 1)}।`)), 900);
          later(() => setBreakNote(null), 3600);
        }
        later(() => setShow(null), 1300);
      }, 550);
    });
    const offC = peer.onGone(() => { setGone(true); sfx('bad'); });
    return () => { offA(); offB(); offC(); duel.dispose(); timers.current.forEach(clearTimeout); delete (window as unknown as { __hcOnline?: HCDuel }).__hcOnline; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Record each finished game once.
  useEffect(() => {
    if (v.phase !== 'over' || !v.match?.result || recorded.current === v.game) return;
    recorded.current = v.game;
    const w = v.match.result.winnerSide;
    recordResult('hand-cricket', { outcome: w === null ? 'tie' : w === mySide ? 'win' : 'loss' }, () => []);
  }, [v.phase, v.game]); // eslint-disable-line react-hooks/exhaustive-deps

  const busy = shaking || !!show || !!breakNote;
  const canPick = !gone && !v.cheat && ((v.phase === 'tossPick') || (v.phase === 'play' && !busy)) && v.myPick === null;
  const pick = (num: number) => { if (!canPick) return; sfx('click', { pitch: 1.2 }); vibrate(10); void duel.pick(num); };

  useEffect(() => {
    const k = (e: KeyboardEvent) => { const i = ['1', '2', '3', '4', '5', '6'].indexOf(e.key); if (i >= 0 && !e.repeat) pick(i + 1); };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  });

  const m = v.match;
  const bat = m ? battingSide(m) : 0;
  const inn = m ? m.innings[m.current] : null;
  const lim = m ? limitsOf(m.config) : null;
  const tg = m ? targetOf(m) : undefined;
  const chasing = m && m.current === 1 && tg !== undefined && inn;
  const role = (s: Side) => (!m ? '' : s === bat ? t('Batting', 'ব্যাটিং') : t('Bowling', 'বোলিং'));
  const oppState = gone ? t('Left', 'চলে গেছে') : v.phase === 'tossPick' || v.phase === 'play' ? (v.theirLocked ? t('Locked ✓', 'বাছাই হয়েছে ✓') : t('Picking…', 'বাছছে…')) : '';
  const handN = (s: Side) => (show ? show.picks[s] : 0);
  const winner = m?.result ? m.result.winnerSide : null;

  return (
    <div className="hc-root hand vs-ai ol-match" data-testid="online-match">
      <div className="hc-pad top ol-opp">
        <div className="hc-pad-head">
          <Flag id={teams[oppSide]} size={24} /><b data-testid="opp">{names[oppSide]}</b> <span className={`role ${oppSide === bat ? 'bat' : 'bowl'}`}>{role(oppSide)}</span>
          <span className={`ol-dot ${gone ? 'off' : ''}`} aria-hidden="true" />
          <span className="hc-pad-state" data-testid="opp-state">{oppState}</span>
        </div>
      </div>
      <div className="hc-stage">
        <div className="hud-chalk hc-board" aria-live="polite">
          {m && inn && lim ? (
            <>
              <div className="hc-board-row">
                <span className="hc-team"><Flag id={teams[bat]} size={26} /> {names[bat]}</span>
                <span className="hc-score" data-testid="score">{n(inn.runs)}/{n(inn.wickets)}</span>
              </div>
              <div className="hc-board-row small">
                <span>{t('Over', 'ওভার')} {n(oversText(inn.balls))} / {n(m.config.overs ?? 0)}</span>
                {!chasing && <span>{t('1st innings', '১ম ইনিংস')}</span>}
              </div>
              <div className="hc-over">{currentOver(inn.events).map((e, i) => <span key={i} className={`ball ${e.out ? 'w' : e.runs >= 6 ? 's' : ''}`}>{e.out ? 'W' : n(e.runs)}</span>)}</div>
            </>
          ) : (
            <div className="hc-board-row"><span className="hc-team">{t('Toss', 'টস')}</span><span>{v.setup ? t(`${v.setup.overs} ov · ${v.setup.wickets} wkt`, `${n(v.setup.overs)} ওভার · ${n(v.setup.wickets)} উইকেট`) : ''}</span></div>
          )}
        </div>
        {chasing && lim && <div className="hc-chase"><ChaseHud c={{ target: tg!, runs: inn!.runs, wickets: inn!.wickets, maxWickets: m!.config.wickets, balls: inn!.balls, maxBalls: lim.balls, par: 2.6, events: inn!.events, name: names[bat] }} /></div>}
        <div className="hc-arena">
          <div className={`hc-hand left ${shaking ? 'shake' : ''}`}><Hand n={handN(mySide)} cuff={getTeam(teams[mySide]).kit[0]} label={names[mySide]} /></div>
          <div className="hc-vs">{show ? <span className={`hc-flash ${show.kind}`} data-testid="flash">{show.text}</span> : <span className="vs">VS</span>}</div>
          <div className={`hc-hand right ${shaking ? 'shake' : ''}`}><Hand n={handN(oppSide)} mirror cuff={getTeam(teams[oppSide]).kit[0]} label={names[oppSide]} /></div>
        </div>
        {m && lim && lim.balls !== null && inn && <div className="ol-left">{t(`${ballsLeft(inn, lim)} balls left`, `${n(ballsLeft(inn, lim) ?? 0)} বল বাকি`)}</div>}
      </div>
      <div className="hc-pad bottom" data-testid="pad-0">
        <div className="hc-pad-head">
          <Flag id={teams[mySide]} size={24} /><b>{names[mySide]}</b> <span className={`role ${mySide === bat ? 'bat' : 'bowl'}`}>{role(mySide)}</span>
          <span className="hc-pad-state">{v.myPick !== null ? t('Locked ✓ · waiting', 'বাছাই হয়েছে ✓ · অপেক্ষা') : canPick ? t('Pick your number', 'সংখ্যা বাছো') : ''}</span>
        </div>
        <div className="hc-buttons n6">
          {[1, 2, 3, 4, 5, 6].map((num) => (
            <button key={num} className={`hc-num ${v.myPick === num ? 'chosen' : ''}`} disabled={!canPick} onClick={() => pick(num)} aria-label={String(num)} data-testid={`p0-${num}`}>
              {v.phase === 'tossPick' ? <span className="lbl big">{n(num)}</span> : <><Hand n={num} className="mini" /><span className="lbl">{n(num)}</span></>}
            </button>
          ))}
        </div>
      </div>

      {v.phase === 'wait' && <div className="hc-banner">{t('Connecting…', 'সংযোগ হচ্ছে…')}</div>}
      {v.phase === 'call' && !gone && (
        duel.iCall ? (
          <Overlay label={t('Toss: odd or even?', 'টস: জোড় না বিজোড়?')}>
            <div className="sheet ruled" data-testid="toss">
              <h2>{t('Toss: odd or even?', 'টস: জোড় না বিজোড়?')}</h2>
              <p className="lede">{t('Call it. Then you both show a number; the sum decides.', 'তুমি বলো। তারপর দুজনেই সংখ্যা দেখাবে, যোগফলে ফয়সালা।')}</p>
              <div className="actions">
                <button className="btn big" onClick={() => { duel.callToss('odd'); sfx('click'); }} data-testid="call-odd">{t('Odd', 'বিজোড়')}</button>
                <button className="btn big secondary" onClick={() => { duel.callToss('even'); sfx('click'); }} data-testid="call-even">{t('Even', 'জোড়')}</button>
              </div>
            </div>
          </Overlay>
        ) : <div className="hc-banner">{t(`${names[oppSide]} is calling odd or even…`, `${names[oppSide]} জোড়/বিজোড় বলছে…`)}</div>
      )}
      {v.phase === 'tossPick' && <div className="hc-banner">{v.caller === mySide
        ? t(`Toss: you called ${v.call === 'odd' ? 'odd' : 'even'}. Show a number.`, `টস: তুমি বলেছ ${v.call === 'odd' ? 'বিজোড়' : 'জোড়'}। একটা সংখ্যা দেখাও।`)
        : t(`Toss: ${names[v.caller]} called ${v.call === 'odd' ? 'odd' : 'even'}. Show a number.`, `টস: ${names[v.caller]} বলেছে ${v.call === 'odd' ? 'বিজোড়' : 'জোড়'}। একটা সংখ্যা দেখাও।`)}</div>}
      {v.phase === 'choose' && v.tossNums && !gone && (
        <Overlay label={t('Toss result', 'টসের ফল')}>
          <div className="sheet ruled" data-testid="toss-result">
            <h2>{v.tossWin === mySide ? t('You won the toss!', 'তুমি টস জিতেছ!') : t(`${names[oppSide]} won the toss`, `${names[oppSide]} টস জিতেছে`)}</h2>
            <p className="lede">{n(v.tossNums[0])} + {n(v.tossNums[1])} = {n(v.tossNums[0] + v.tossNums[1])} — {(v.tossNums[0] + v.tossNums[1]) % 2 ? t('odd', 'বিজোড়') : t('even', 'জোড়')}</p>
            {v.tossWin === mySide ? (
              <div className="actions">
                <button className="btn big" onClick={() => duel.choose(true)} data-testid="bat-first">{t('Bat first', 'আগে ব্যাট')}</button>
                <button className="btn big secondary" onClick={() => duel.choose(false)} data-testid="bowl-first">{t('Bowl first', 'আগে বল')}</button>
              </div>
            ) : <div className="ol-pulse"><i /><i /><i /> {t('They are choosing…', 'ওরা বেছে নিচ্ছে…')}</div>}
          </div>
        </Overlay>
      )}
      {breakNote && <div className="hc-banner ol-break" data-testid="break">{t('Innings break', 'ইনিংস বিরতি')} · {breakNote}</div>}
      {(v.phase === 'over' && !show && !breakNote) || gone || v.cheat ? (
        <Overlay label={t('Match over', 'খেলা শেষ')}>
          <div className="sheet ruled" data-testid="result">
            {v.cheat ? <h2>{t('Connection problem. The match was stopped.', 'সংযোগে সমস্যা। খেলা থামানো হলো।')}</h2>
              : gone && v.phase !== 'over' ? <h2>{t(`${names[oppSide]} left the match. You win!`, `${names[oppSide]} খেলা ছেড়ে চলে গেছে। তুমি জিতেছ!`)}</h2>
              : <h2>{winner === null ? t('A tie!', 'টাই!') : winner === mySide ? t('You win!', 'তুমি জিতেছ!') : t(`${names[oppSide]} wins`, `${names[oppSide]} জিতেছে`)}</h2>}
            {m && <p className="lede">{names[m.battingFirst]} {n(m.innings[0].runs)}/{n(m.innings[0].wickets)} · {names[other(m.battingFirst)]} {n(m.innings[1].runs)}/{n(m.innings[1].wickets)}</p>}
            {v.phase === 'over' && !gone && v.rematch.them && !v.rematch.me && <p className="ol-note">{t(`${names[oppSide]} wants a rematch!`, `${names[oppSide]} আবার খেলতে চায়!`)}</p>}
            <div className="actions">
              {v.phase === 'over' && !gone && !v.cheat && (
                <button className="btn big" disabled={v.rematch.me} onClick={() => duel.askRematch()} data-testid="rematch">
                  {v.rematch.me ? t('Waiting for them…', 'ওদের অপেক্ষায়…') : t('Rematch', 'আবার খেলো')}
                </button>
              )}
              <button className="btn secondary" onClick={onLeave} data-testid="leave">{t('Leave', 'বের হও')}</button>
            </div>
          </div>
        </Overlay>
      ) : null}
    </div>
  );
}
