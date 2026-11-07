import { useEffect, useRef, useState, type ReactNode } from 'react';
import { sfx, vibrate } from '../../platform/audio';
import { readJSON, writeJSON } from '../../platform/storage';
import { clearHashQuery } from '../../platform/router';
import { recordResult } from '../../platform/scores';
import { isCode, cleanCode, roomLink, CODE_LEN, type Profile } from '../../platform/net/rooms';
import { PartyError, PARTY_MAX, createParty, joinParty, quickParty, type Party } from '../../platform/net/party';
import { Seg, useGameBar, usePlayerNames } from '../../components/ui';
import { MoveClock, Who, useRealUnmount } from '../../components/online/OnlineLobby';
import { useTx } from '../../components/sport/SportKit';
import { ROLE_POINTS, type Role } from './model';
import { GUESS_SECONDS, type CPAction, type CPView } from './table';
import { hostTable, uniqueNames } from './host';
import { LobbyHome, RoomCodeCard } from '../../components/online/LobbyHome';
import { ResultHero } from '../../components/Result';
import '../../components/online/online.css';
import './online.css';

// Chor Police online, four seats. Rooms (code + link, up to three friends join; the host
// starts whenever they like) and quick match (searchers grouped up to four; the longest
// waiter hosts after 10 s or when four are there) come from platform/net/party.ts. Empty
// seats are stand-ins with ordinary names.
//
// The host runs the table (table.ts): it deals the chits from the seed, sends each player
// only their own chit ("st" = that player's view), plays the stand-ins, runs the clocks and
// keeps the scores. Guests only send their actions ("act": hide, pick, guess). A player who
// leaves is replaced by a stand-in; if the host leaves, the game ends for everyone.

const GAME = 'chor-police';
const QUICK_ROUNDS = 5;
const NAME_KEY = 'online.name';

export function OnlineChorPolice({ onBack, code }: { onBack: () => void; code?: string }) {
  const x = useTx();
  const { t, n } = x;
  const [p1] = usePlayerNames();
  const [name, setNameState] = useState(() => readJSON<string>(NAME_KEY, '') || p1);
  const [stage, setStage] = useState<'lobby' | 'joining' | 'search' | 'party'>('lobby');
  const [joinCode, setJoinCode] = useState(code ?? '');
  const [err, setErr] = useState('');
  const [waited, setWaited] = useState({ s: 0, found: 1 });
  const [party, setParty] = useState<{ p: Party; quick: boolean } | null>(null);
  const signal = useRef({ cancelled: false });
  const me: Profile = { name: name.trim().slice(0, 16) || p1, team: '' };
  const setName = (v: string) => { setNameState(v); writeJSON(NAME_KEY, v); };
  useGameBar({ help: <ol>{[
    t('Quick match puts you at a table with other players who are searching. Empty seats get other players after 10 seconds.', 'কুইক ম্যাচ তোমাকে খেলা খুঁজছে এমন অন্যদের সাথে বসায়। ১০ সেকেন্ড পর খালি আসনে অন্য খেলোয়াড় বসবে।'),
    t('Create a room to get a code and a link. Up to three friends can join; start whenever you like.', 'রুম খুললে কোড আর লিংক পাবে। তিনজন পর্যন্ত বন্ধু ঢুকতে পারবে; যখন খুশি শুরু করো।'),
  ].map((r) => <li key={r}>{r}</li>)}</ol> }, [x.lang]);

  const partyRef = useRef<Party | null>(null);
  partyRef.current = party?.p ?? null;
  useRealUnmount(() => { signal.current.cancelled = true; });
  const autoJoined = useRef(false);
  useEffect(() => {
    if (code && !autoJoined.current && isCode(cleanCode(code))) { autoJoined.current = true; clearHashQuery(); void join(cleanCode(code)); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const errText = (e: unknown) => {
    const c = e instanceof PartyError ? e.code : 'offline';
    if (c === 'not-found') return t('No room with that code. Check the code, or ask your friend to open the room again.', 'এই কোডের কোনো রুম নেই। কোডটা দেখো, বা বন্ধুকে আবার রুম খুলতে বলো।');
    if (c === 'full') return t('That room already has four players.', 'ওই রুমে আগেই চারজন আছে।');
    if (c === 'started') return t('The game in that room has already started.', 'ওই রুমে খেলা শুরু হয়ে গেছে।');
    if (c === 'cancelled') return '';
    return t('Could not connect. Check the internet and try again.', 'সংযোগ হলো না। ইন্টারনেট দেখে আবার চেষ্টা করো।');
  };
  const fresh = () => { signal.current = { cancelled: false }; setErr(''); return signal.current; };
  const enter = (p: Party, quick: boolean) => { setParty({ p, quick }); setStage('party'); sfx('good'); vibrate([20, 40, 20]); };

  async function quick() {
    const sig = fresh();
    setStage('search'); setWaited({ s: 0, found: 1 }); sfx('click');
    try {
      const p = await quickParty(GAME, me, { signal: sig, onTick: (s, found) => setWaited({ s, found }) });
      if (sig.cancelled) p.close(); else enter(p, true);
    } catch (e) { if (!sig.cancelled) { setErr(errText(e)); setStage('lobby'); } }
  }
  async function create() {
    const sig = fresh(); sfx('click');
    try {
      const p = await createParty(GAME, me);
      if (sig.cancelled) p.close(); else enter(p, false);
    } catch (e) { setErr(errText(e)); setStage('lobby'); }
  }
  async function join(c = cleanCode(joinCode)) {
    if (!isCode(c)) { setErr(t(`A room code has ${CODE_LEN} letters and numbers.`, `রুম কোডে ${n(CODE_LEN)}টা অক্ষর আর সংখ্যা থাকে।`)); return; }
    const sig = fresh();
    setStage('joining'); sfx('click');
    try {
      const p = await joinParty(GAME, c, me, sig);
      if (sig.cancelled) p.close(); else enter(p, false);
    } catch (e) { if (!sig.cancelled) { setErr(errText(e)); setStage('lobby'); } }
  }
  const cancel = () => { signal.current.cancelled = true; setStage('lobby'); };

  if (stage === 'party' && party) {
    return <PartyRoom key={party.p.code + party.p.me} party={party.p} quick={party.quick} onLeave={() => { party.p.close(); setParty(null); setStage('lobby'); }} />;
  }

  let body: ReactNode;
  if (stage === 'search' || stage === 'joining') {
    body = (
      <div className="olh" data-testid="searching">
        <div className="olh-card ol-wait">
          <div className="ol-radar" aria-hidden="true"><span /><span /><Who team="" name={me.name} size={48} /></div>
          <h2>{stage === 'search' ? t('Finding players…', 'খেলোয়াড় খোঁজা হচ্ছে…') : t('Joining the room…', 'রুমে ঢুকছি…')}</h2>
          {stage === 'search' && <p className="ol-meta">{t(`${waited.s}s · ${waited.found} of ${PARTY_MAX} at the table`, `${n(waited.s)} সেকেন্ড · টেবিলে ${n(PARTY_MAX)} জনের ${n(waited.found)} জন`)}</p>}
          <button className="btn secondary" onClick={cancel} data-testid="cancel">{t('Cancel', 'বাতিল')}</button>
        </div>
      </div>
    );
  } else {
    body = (
      <LobbyHome
        kind={t('4 players', '৪ জন')}
        onBack={onBack}
        name={name} setName={setName}
        err={err}
        onQuick={() => void quick()}
        quickSub={t('Sit at a table with players who are looking for a game.', 'যারা এখন খেলা খুঁজছে, তাদের সাথে এক টেবিলে বসো।')}
        quickMeta={t(`${QUICK_ROUNDS} rounds`, `${n(QUICK_ROUNDS)} রাউন্ড`)}
        createSub={t('Get a code and a link for up to three friends. Empty seats get other players.', 'তিনজন পর্যন্ত বন্ধুর জন্য কোড আর লিংক পাও। খালি আসনে অন্য খেলোয়াড় বসবে।')}
        onCreate={() => void create()}
        joinCode={joinCode} setJoinCode={setJoinCode} onJoin={() => void join()}
      />
    );
  }
  return <div className="sport-page ol-page" data-testid="online">{body}</div>;
}

// ---------- The room: seats filling, then the game ----------

function PartyRoom({ party, quick, onLeave }: { party: Party; quick: boolean; onLeave: () => void }) {
  const x = useTx();
  const { t, n } = x;
  const [members, setMembers] = useState(party.members());
  const [rounds, setRounds] = useState(QUICK_ROUNDS);
  const [view, setView] = useState<CPView | null>(null);
  const [hostGone, setHostGone] = useState(false);
  const [copied, setCopied] = useState('');
  const host = useRef<ReturnType<typeof hostTable> | null>(null);
  useEffect(() => party.onMembers((m) => setMembers([...m])), [party]);
  useEffect(() => {
    if (party.host) return;
    const a = party.on('st', (v: CPView) => setView(v));
    const b = party.onLeft(() => { setHostGone(true); sfx('bad'); });
    return () => { a(); b(); };
  }, [party]);
  useRealUnmount(() => { host.current?.dispose(); party.close(); });
  const start = (r = rounds) => {
    if (!party.host) return;
    if (!host.current) host.current = hostTable(party, r, (Math.random() * 2 ** 31) >>> 0, setView);
    host.current.start();
    sfx('bell');
  };
  // Quick match: the host starts at once.
  const auto = useRef(false);
  useEffect(() => { if (quick && party.host && !auto.current) { auto.current = true; start(QUICK_ROUNDS); } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const hostName = members[0]?.profile.name ?? '';
  if (view) return <CPBoard view={view} isHost={party.host} hostName={hostName} hostGone={hostGone} act={(a) => party.send('act', a)} hostAct={(a) => host.current?.table.act(view.seat, a)} onAgain={() => start()} onLeave={onLeave} />;

  const share = async () => {
    const url = roomLink(GAME, party.code);
    const text = t(`Play Chor Police with me! Room ${party.code}`, `আমার সাথে চোর-পুলিশ খেলো! রুম ${party.code}`);
    try { if (navigator.share) { await navigator.share({ title: t('Chor Police', 'চোর-পুলিশ'), text, url }); return; } } catch { /* closed */ }
    try { await navigator.clipboard.writeText(`${text}\n${url}`); setCopied('link'); } catch { setCopied('fail'); }
  };
  const copyCode = async () => { try { await navigator.clipboard.writeText(party.code); setCopied('code'); } catch { setCopied('fail'); } };
  const seats = Array.from({ length: PARTY_MAX }, (_, i) => members[i] ?? null);
  const seatNames = uniqueNames(members.map((m) => m.profile.name));
  return (
    <div className="sport-page ol-page cp-room" data-testid="party-room">
      {hostGone ? <HostGone name={hostName} onLeave={onLeave} /> : null}
      <div className="olh">
      <div className="olh-head">
        <button className="olh-back" onClick={onLeave} data-testid="cancel" aria-label={party.host ? t('Close the room', 'রুম বন্ধ করো') : t('Leave', 'বের হও')}>←</button>
        <div className="olh-title">
          <h2>{quick ? t('Players found!', 'খেলোয়াড় পাওয়া গেছে!') : party.host ? t('Your room is open', 'তোমার রুম খোলা হয়েছে') : t('You are in the room', 'তুমি রুমে ঢুকেছ')}</h2>
          <span className="olh-kind"><i className="ol-dot" aria-hidden="true" />{t('4 players', '৪ জন')}{party.host && !quick ? ` · ${t('start whenever you like', 'যখন খুশি শুরু করো')}` : ''}</span>
        </div>
      </div>
      {party.host && !quick && <RoomCodeCard code={party.code} onShare={() => void share()} onCopy={() => void copyCode()} copied={copied} many />}
      <ol className="cp-seats olh-card" data-testid="seats">
        {seats.map((m, i) => (
          <li key={i} className={m ? '' : 'empty'} data-testid={`seat-${i}`}>
            {m ? <><Who team="" name={seatNames[i]} size={30} /><b>{seatNames[i]}</b>
              <small>{[m.id === party.hostId ? t('host', 'হোস্ট') : '', m.id === party.me ? t('you', 'তুমি') : ''].filter(Boolean).join(' · ')}</small></>
              : <><span className="cp-seat-empty" aria-hidden="true">?</span><span>{t('Empty seat', 'খালি আসন')}</span></>}
          </li>
        ))}
      </ol>
      {party.host && !quick && <div className="cp-start olh-card">
        <div className="opt-label">{t('Rounds', 'রাউন্ড')}</div>
        <Seg label={t('Rounds', 'রাউন্ড')} value={rounds} onChange={setRounds} options={[3, 5, 10].map((v) => ({ v, label: n(v) }))} />
        <button className="btn big" onClick={() => start()} data-testid="start-party">
          {members.length >= PARTY_MAX ? t('Start the game', 'খেলা শুরু করো') : t(`Start · ${PARTY_MAX - members.length} more will join`, `শুরু করো · আরও ${n(PARTY_MAX - members.length)} জন বসবে`)}
        </button>
      </div>}
      {(!party.host || quick) && <div className="ol-pulse olh-center"><i /><i /><i /> {quick ? t('Dealing the chits…', 'কাগজ বাটা হচ্ছে…') : t(`Waiting for ${hostName} to start…`, `${hostName} শুরু করার অপেক্ষা…`)}</div>}
      </div>
    </div>
  );
}

function HostGone({ name, onLeave }: { name: string; onLeave: () => void }) {
  const { t } = useTx();
  return (
    <div className="overlay" role="dialog" aria-modal="true">
      <div className="sheet ruled" data-testid="host-gone">
        <h2>{t(`${name} (the host) left. The game has ended.`, `${name} (হোস্ট) চলে গেছে। খেলা শেষ।`)}</h2>
        <div className="actions"><button className="btn big" onClick={onLeave} data-testid="leave">{t('Back to the lobby', 'লবিতে ফিরে যাও')}</button></div>
      </div>
    </div>
  );
}

// ---------- The game screen ----------

function useViewClock(view: CPView | null): number {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!view?.clock) { setLeft(0); return; }
    const end = Date.now() + view.clock.left;
    const tick = () => setLeft(Math.max(0, (end - Date.now()) / 1000));
    tick();
    const iv = window.setInterval(tick, 200);
    return () => window.clearInterval(iv);
  }, [view]);
  return left;
}

function CPBoard({ view, isHost, hostName, hostGone, act, hostAct, onAgain, onLeave }: {
  view: CPView; isHost: boolean; hostName: string; hostGone: boolean;
  act: (a: CPAction) => void; hostAct: (a: CPAction) => void; onAgain: () => void; onLeave: () => void;
}) {
  const x = useTx();
  const { t, n } = x;
  const me = view.seat;
  const send = (a: CPAction) => (isHost ? hostAct(a) : act(a));
  const [picked, setPicked] = useState<number | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const roundKey = `${view.game}|${view.round}`;
  useEffect(() => { setPicked(null); }, [roundKey]);
  useEffect(() => {
    if (!view.notice) return;
    setBanner(view.notice.name);
    const id = window.setTimeout(() => setBanner(null), 6000);
    return () => window.clearTimeout(id);
  }, [view.notice?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const left = useViewClock(view);
  const recorded = useRef('');
  const high = Math.max(...view.scores);
  const winners = view.names.filter((_, i) => view.scores[i] === high);
  useEffect(() => {
    if (view.step !== 'done' || recorded.current === `${view.game}`) return;
    recorded.current = `${view.game}`;
    const outcome = view.scores[me] < high ? 'loss' : winners.length > 1 ? 'tie' : 'win';
    recordResult(GAME, { outcome, score: view.scores[me] });
    sfx(outcome === 'loss' ? 'bad' : 'good');
  }, [view.step, view.game]); // eslint-disable-line react-hooks/exhaustive-deps
  const prevStep = useRef(view.step);
  useEffect(() => {
    if (prevStep.current !== view.step && (view.step === 'reveal' || view.step === 'done')) sfx(view.correct ? 'good' : 'bad');
    prevStep.current = view.step;
  }, [view.step, view.correct]);
  useGameBar({ help: <ol>{[
    t('Everyone reads their own chit in secret, then hides it.', 'সবাই গোপনে নিজের কাগজ দেখে লুকিয়ে রাখবে।'),
    t('Babu and Police are shown. Police picks the Chor from the two others.', 'বাবু আর পুলিশ পরিচয় জানাবে। বাকি দুজনের মধ্যে পুলিশ চোর ধরবে।'),
    t(`The Police has ${GUESS_SECONDS} seconds; when time runs out, the chit they are pointing at (or a random one) is taken.`, `পুলিশ পাবে ${n(GUESS_SECONDS)} সেকেন্ড; সময় শেষ হলে যে কাগজ বেছে রেখেছে (নয়তো যেকোনো একটা) সেটাই ধরা হবে।`),
    t('Babu 1000, Dakat 500. Caught: Police 100, Chor 0. Missed: Police 0, Chor 100.', 'বাবু ১০০০, ডাকাত ৫০০। ধরা পড়লে পুলিশ ১০০, চোর ০। ভুল হলে পুলিশ ০, চোর ১০০।'),
  ].map((r) => <li key={r}>{r}</li>)}</ol> }, [x.lang]);

  const roleName = (r: Role) => ({ babu: t('Babu', 'বাবু'), police: t('Police', 'পুলিশ'), dakat: t('Dakat', 'ডাকাত'), chor: t('Chor', 'চোর') })[r];
  const myRole = view.roles[me];
  const police = view.police;
  const babu = view.roles.indexOf('babu');
  const iAmPolice = police === me;
  const open = view.step === 'reveal' || view.step === 'done';
  const clockShown = view.clock && view.step !== 'reveal';
  const doneCount = view.hidden.filter(Boolean).length;

  let main: ReactNode;
  if (view.step === 'read') {
    main = !view.hidden[me] ? (
      <section className="bench-center cp-secret" data-testid="secret">
        <p>{t('Your secret chit. Nobody else can see it.', 'তোমার গোপন কাগজ। আর কেউ দেখতে পাবে না।')}</p>
        <div className="paper-chit open"><div className="role-name" data-testid="my-role">{myRole && roleName(myRole)}</div><small>{t('Base points', 'মূল পয়েন্ট')}: {n(myRole ? ROLE_POINTS[myRole] : 0)}</small></div>
        <div className="bench-actions"><button className="btn big" onClick={() => send({ g: view.game, r: view.round, kind: 'hide' })} data-testid="hide-role">{t('Hide my chit', 'কাগজ লুকাও')}</button></div>
      </section>
    ) : (
      <section className="bench-center" data-testid="waiting-hide">
        <div className="bench-seal" aria-hidden="true">?</div>
        <h2>{t('Chit hidden', 'কাগজ লুকানো হয়েছে')}</h2>
        <p>{t(`Waiting for everyone (${doneCount} of 4 ready)`, `সবার অপেক্ষা (৪ জনের ${n(doneCount)} জন প্রস্তুত)`)}</p>
        {myRole && <p className="bench-note">{t('Your chit', 'তোমার কাগজ')}: <b>{roleName(myRole)}</b></p>}
      </section>
    );
  } else {
    const head = open ? t('Chits open!', 'কাগজ খোলো!')
      : iAmPolice ? t('You are the Police: find the Chor', 'তুমি পুলিশ: চোরকে ধরো')
      : t(`${view.names[police]} (Police) is looking for the Chor…`, `${view.names[police]} (পুলিশ) চোর খুঁজছে…`);
    main = <>
      <h2 className="cp-head">{head}</h2>
      {!open && babu >= 0 && <p className="cp-babu">{view.names[babu]}: {t('“Police, find the thief!”', '“পুলিশ, চোরকে ধরো!”')}</p>}
      {!open && myRole && !iAmPolice && myRole !== 'babu' && <p className="bench-note">{t('Your chit', 'তোমার কাগজ')}: <b>{roleName(myRole)}</b>{myRole === 'chor' ? t(' · keep a straight face!', ' · মুখ স্বাভাবিক রাখো!') : ''}</p>}
      <div className="chit-table cp-table">{view.roles.map((role, i) => {
        const shown = !!role && (open || role === 'babu' || role === 'police' || i === me);
        const canPick = view.step === 'guess' && iAmPolice && !hostGone && (view.roles[i] === null);
        const chosen = open ? view.guess === i : picked === i;
        return <button key={i} className={`paper-chit ${shown ? 'open' : ''} ${open && view.guess === i ? (view.correct ? 'caught' : 'missed') : ''}`} disabled={!canPick} aria-pressed={chosen} data-testid={`chit-${i}`}
          onClick={() => { setPicked(i); send({ g: view.game, r: view.round, kind: 'pick', target: i }); sfx('click'); }}>
          {shown && role ? roleName(role) : '?'}<small>{view.names[i]}{i === me ? ` · ${t('you', 'তুমি')}` : ''}</small>{open && <small>+{n(view.points?.[i] ?? 0)}</small>}
        </button>;
      })}</div>
      {view.step === 'guess' && iAmPolice && <div className="bench-actions"><button className="btn big" disabled={picked === null || hostGone} data-testid="guess" onClick={() => picked !== null && send({ g: view.game, r: view.round, kind: 'guess', target: picked })}>{t('This is the Chor!', 'এই তো চোর!')}</button></div>}
      {open && <div className="bench-status" role="status" data-testid="verdict">{view.correct ? t(`Caught! ${view.names[police]} earns 100.`, `ধরা পড়েছে! ${view.names[police]} পেল ১০০।`) : t(`Wrong suspect! The Chor takes 100.`, 'ভুল হয়েছে! চোর পেল ১০০।')}</div>}
      {view.step === 'reveal' && <p className="bench-note cp-next">{t(`Next round in ${Math.ceil(left)}…`, `${n(Math.ceil(left))} সেকেন্ডে পরের রাউন্ড…`)}</p>}
    </>;
  }

  return (
    <div className="sport-page cp-online" data-testid="online-match">
      <div className="cp-top">
        <span className="bench-round" data-testid="round">{t('Round', 'রাউন্ড')} {n(view.round)} / {n(view.rounds)}</span>
        {clockShown && view.clock && <MoveClock left={left} seconds={view.clock.total / 1000} />}
      </div>
      <div className="bench-scores cp-scores" data-testid="cp-scores" data-scores={view.scores.join(',')}>
        {view.names.map((nm, i) => (
          <div key={i} className={`${i === me ? 'me' : ''} ${view.away[i] ? 'away' : ''} ${police === i && !open ? 'active' : ''}`}>
            <span><Who team="" name={nm} size={22} /> <em>{nm}{i === me ? ` · ${t('you', 'তুমি')}` : ''}</em>{view.step === 'read' && view.hidden[i] && <i className="cp-tick" aria-label={t('ready', 'প্রস্তুত')}>✓</i>}</span>
            <b>{n(view.scores[i])}</b>
          </div>
        ))}
      </div>
      {banner && <div className="cp-banner" role="status" data-testid="left-notice">{t(`${banner} left — a stand-in plays for them`, `${banner} চলে গেছে — তার জায়গায় অন্য একজন খেলছে`)}</div>}
      {main}
      {view.step === 'done' && !hostGone && (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className="report result-card" data-testid="result">
            <ResultHero outcome={view.scores[me] === high ? (winners.length > 1 ? 'tie' : 'win') : 'loss'}
              title={view.scores[me] === high && winners.length === 1 ? t('You win!', 'তুমি জিতেছ!') : winners.length > 1 ? t(`${winners.join(' & ')} share the win!`, `${winners.join(' ও ')} যৌথভাবে জিতেছে!`) : t(`${winners[0]} wins!`, `${winners[0]} জিতেছে!`)}
              sub={view.scores[me] === high ? (winners.length > 1 ? t('You share the top score.', 'তুমি সবার ওপরে, যৌথভাবে।') : undefined) : t('Better luck next time.', 'পরেরবার ভালো হবে।')} />
            <ol className="cp-final" data-testid="final-scores">
              {view.names.map((nm, i) => ({ nm, s: view.scores[i], i })).sort((a, b) => b.s - a.s).map((r) => (
                <li key={r.i} className={r.i === me ? 'me' : ''}><Who team="" name={r.nm} size={24} /><span className="cp-fname">{r.nm}</span><b>{n(r.s)}</b></li>
              ))}
            </ol>
            {!isHost && <p className="ol-note">{t(`${hostName} can start another game.`, `${hostName} আরেকটা খেলা শুরু করতে পারে।`)}</p>}
            <div className="actions">
              {isHost && <button className="btn big" onClick={onAgain} data-testid="again">{t('Play again', 'আবার খেলো')}</button>}
              <button className="btn secondary" onClick={onLeave} data-testid="leave">{t('Leave', 'বের হও')}</button>
            </div>
          </div>
        </div>
      )}
      {hostGone && <HostGone name={hostName} onLeave={onLeave} />}
    </div>
  );
}

