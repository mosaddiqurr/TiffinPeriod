import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { sfx, vibrate } from '../../platform/audio';
import { readJSON, writeJSON } from '../../platform/storage';
import { clearHashQuery } from '../../platform/router';
import { NetError, cleanCode, createRoom, isCode, joinRoom, quickMatch, roomLink, CODE_LEN, type Peer, type Profile } from '../../platform/net/rooms';
import { useGameBar, usePlayerNames } from '../ui';
import { Flag, TeamGrid, favTeam, setFavTeam, useTx } from '../sport/SportKit';
import { getTeam } from '../../shared/teams';
import './online.css';

// The online screen for any game: your name and country, then
//   ⚡ Quick match (the stand-in arrives after 10 s if nobody else is searching),
//   🔑 Create a room (code + share link, with the game's own settings), or
//   🎟️ Join a room (type the code; an invite link joins by itself).
// When two players are connected, the host sends "cfg" { settings, seed } and both open the
// game's Match with the same settings and seed. The stand-in sends "cfg" itself.

export interface MatchProps<S> {
  peer: Peer;
  settings: S;
  seed: number;
  /** Back to the lobby (the match has closed the connection or will). */
  onLeave: () => void;
}

export interface LobbyProps<S> {
  /** Channel name part, e.g. "dots-boxes". */
  game: string;
  /** Shown in share messages. */
  title: string;
  onBack: () => void;
  /** A code from an invite link (?room=CODE). */
  code?: string;
  /** Cricket and football games: players pick a country flag. Other games: no flags, a coloured initial. */
  sport?: 'cricket' | 'football';
  /** Settings for a room the player creates, and for quick match. */
  defaultSettings: S;
  quickSettings: S;
  /** Controls for room settings (shown in "Create a room"). */
  Options?: ComponentType<{ value: S; onChange: (v: S) => void }>;
  /** One line describing settings, e.g. "2 overs · 2 wickets". */
  describe?: (s: S) => string;
  makeBot: (me: Profile, settings: S, seed: number) => Peer;
  Match: ComponentType<MatchProps<S>>;
  /** Extra help lines for the game bar. */
  help?: string[];
}

type Stage = 'lobby' | 'room' | 'joining' | 'search' | 'found' | 'match';

/**
 * Run `fn` when the component is really gone. React's development mode mounts and unmounts
 * once more on purpose; a plain effect cleanup would close the connection there.
 */
export function useRealUnmount(fn: () => void) {
  const alive = useRef(false);
  const f = useRef(fn);
  f.current = fn;
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; setTimeout(() => { if (!alive.current) f.current(); }, 0); };
  }, []);
}

export function OnlineLobby<S>(p: LobbyProps<S>) {
  const x = useTx();
  const { t, n } = x;
  const [p1] = usePlayerNames();
  const sport = p.sport ?? 'cricket';
  const flags = !!p.sport;
  const [name, setNameState] = useState(() => readJSON<string>('online.name', '') || p1);
  const [teamPick, setTeam] = useState(() => favTeam(sport));
  const team = flags ? teamPick : '';
  const [pickTeam, setPickTeam] = useState(false);
  const [stage, setStage] = useState<Stage>('lobby');
  const [joinCode, setJoinCode] = useState(p.code ?? '');
  const [err, setErr] = useState('');
  const [room, setRoom] = useState<{ code: string; cancel: () => void } | null>(null);
  const [settings, setSettings] = useState<S>(p.defaultSettings);
  const [waited, setWaited] = useState(0);
  const [peer, setPeer] = useState<Peer | null>(null);
  const [cfg, setCfg] = useState<{ settings: S; seed: number } | null>(null);
  const [copied, setCopied] = useState('');
  const signal = useRef({ cancelled: false });
  const me: Profile = { name: name.trim().slice(0, 16) || p1, team };
  const setName = (v: string) => { setNameState(v); writeJSON('online.name', v); };
  const help = <ol>{[
    t('Quick match finds another player who is waiting.', 'কুইক ম্যাচ অপেক্ষারত আরেকজন খেলোয়াড় খুঁজে দেয়।'),
    t('Create a room to get a code. Send the code or the link to a friend.', 'রুম খুললে একটা কোড পাবে। কোড বা লিংক বন্ধুকে পাঠাও।'),
    ...(p.help ?? []),
  ].map((r) => <li key={r}>{r}</li>)}</ol>;
  useGameBar({ help }, [x.lang]);

  const peerRef = useRef<Peer | null>(null);
  peerRef.current = peer;
  useRealUnmount(() => { signal.current.cancelled = true; peerRef.current?.close(); });
  useEffect(() => () => { room?.cancel(); }, [room]);
  const autoJoined = useRef(false);
  useEffect(() => {
    if (p.code && !autoJoined.current && isCode(cleanCode(p.code))) { autoJoined.current = true; clearHashQuery(); void join(cleanCode(p.code)); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const errText = (e: unknown) => {
    const c = e instanceof NetError ? e.code : 'offline';
    if (c === 'not-found') return t('No room with that code. Check the code, or ask your friend to open the room again.', 'এই কোডের কোনো রুম নেই। কোডটা দেখো, বা বন্ধুকে আবার রুম খুলতে বলো।');
    if (c === 'full') return t('That room already has two players.', 'ওই রুমে আগেই দুজন আছে।');
    if (c === 'cancelled') return '';
    return t('Could not connect. Check the internet and try again.', 'সংযোগ হলো না। ইন্টারনেট দেখে আবার চেষ্টা করো।');
  };

  /** Connected: agree on settings and seed, show who it is, then open the match. */
  const begin = (pe: Peer, mySettings: S) => {
    setPeer(pe);
    setStage('found');
    sfx('good');
    vibrate([20, 40, 20]);
    const shown = Date.now();
    const open = (c: { settings: S; seed: number }) => {
      setCfg(c);
      window.setTimeout(() => setStage('match'), Math.max(0, 1600 - (Date.now() - shown)));
    };
    if (pe.host) {
      const c = { settings: mySettings, seed: (Math.random() * 2 ** 31) >>> 0 };
      pe.send('cfg', c);
      open(c);
    } else {
      const off = pe.on('cfg', (c: { settings: S; seed: number }) => { off(); open(c); });
    }
  };

  const fresh = () => { signal.current = { cancelled: false }; setErr(''); return signal.current; };

  async function quick() {
    const sig = fresh();
    setStage('search'); setWaited(0); sfx('click');
    try {
      const pe = await quickMatch(p.game, me, { waitMs: 10000, signal: sig, onTick: setWaited, makeBot: () => p.makeBot(me, p.quickSettings, (Math.random() * 2 ** 31) >>> 0) });
      if (!sig.cancelled) begin(pe, p.quickSettings);
    } catch (e) { if (!sig.cancelled) { setErr(errText(e)); setStage('lobby'); } }
  }

  async function create() {
    fresh(); sfx('click');
    const s = settings;
    try {
      const w = await createRoom(p.game, me);
      setRoom({ code: w.code, cancel: w.cancel });
      setStage('room');
      const pe = await w.peer;
      setRoom(null);
      begin(pe, s);
    } catch (e) { const m = errText(e); if (m) setErr(m); setRoom(null); setStage('lobby'); }
  }

  async function join(c = cleanCode(joinCode)) {
    if (!isCode(c)) { setErr(t(`A room code has ${CODE_LEN} letters and numbers.`, `রুম কোডে ${n(CODE_LEN)}টা অক্ষর আর সংখ্যা থাকে।`)); return; }
    const sig = fresh();
    setStage('joining'); sfx('click');
    try {
      const pe = await joinRoom(p.game, c, me, sig);
      if (!sig.cancelled) begin(pe, settings);
    } catch (e) { if (!sig.cancelled) { setErr(errText(e)); setStage('lobby'); } }
  }

  const cancel = () => { signal.current.cancelled = true; room?.cancel(); setRoom(null); setStage('lobby'); };

  const share = async (code: string) => {
    const url = roomLink(p.game, code);
    const text = t(`Play ${p.title} with me! Room ${code}`, `আমার সাথে ${p.title} খেলো! রুম ${code}`);
    try { if (navigator.share) { await navigator.share({ title: p.title, text, url }); return; } } catch { /* closed */ }
    try { await navigator.clipboard.writeText(`${text}\n${url}`); setCopied('link'); } catch { setCopied('fail'); }
  };
  const copyCode = async (code: string) => { try { await navigator.clipboard.writeText(code); setCopied('code'); } catch { setCopied('fail'); } };

  if (stage === 'match' && peer && cfg) {
    const M = p.Match;
    return <M peer={peer} settings={cfg.settings} seed={cfg.seed} onLeave={() => { peer.close(); setPeer(null); setCfg(null); setStage('lobby'); }} />;
  }

  const Opt = p.Options;
  let body: ReactNode;
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
        {p.describe && <p className="ol-meta">{p.describe(settings)}</p>}
        <div className="ol-pulse"><i /><i /><i /> {t('Waiting for your friend…', 'বন্ধুর জন্য অপেক্ষা…')}</div>
        <button className="btn secondary" onClick={cancel} data-testid="cancel">{t('Close the room', 'রুম বন্ধ করো')}</button>
      </div>
    );
  } else if (stage === 'search' || stage === 'joining') {
    body = (
      <div className="ol-wait" data-testid="searching">
        <div className="ol-radar" aria-hidden="true"><span /><span /><Who team={team} name={me.name} size={40} /></div>
        <h2>{stage === 'search' ? t('Finding a player…', 'খেলোয়াড় খোঁজা হচ্ছে…') : t('Joining the room…', 'রুমে ঢুকছি…')}</h2>
        {stage === 'search' && <p className="ol-meta">{t(`${waited}s`, `${n(waited)} সেকেন্ড`)}{p.describe ? ` · ${p.describe(p.quickSettings)}` : ''}</p>}
        <button className="btn secondary" onClick={cancel} data-testid="cancel">{t('Cancel', 'বাতিল')}</button>
      </div>
    );
  } else if (stage === 'found' && peer) {
    body = (
      <div className="ol-found" data-testid="found">
        <div className="ol-found-row">
          <div className="ol-player"><Who team={me.team} name={me.name} size={64} /><b>{me.name}</b></div>
          <span className="ol-vs">VS</span>
          <div className="ol-player"><Who team={peer.them.team} name={peer.them.name} size={64} /><b data-testid="opp-name">{peer.them.name}</b></div>
        </div>
        <h2>{t('Player found!', 'খেলোয়াড় পাওয়া গেছে!')}</h2>
      </div>
    );
  } else {
    body = (
      <>
        <button className="btn secondary sport-back" onClick={p.onBack}>← {t('Back', 'ফিরে যাও')}</button>
        <div className="sport-eyebrow">{t('Online · 1v1', 'অনলাইন · ১ বনাম ১')}</div>
        <h2>{t('Play online', 'অনলাইনে খেলো')}</h2>
        <div className="ol-you">
          <label className="ol-name">
            <span>{t('Your name', 'তোমার নাম')}</span>
            <input value={name} maxLength={16} onChange={(e) => setName(e.target.value)} placeholder={t('Name', 'নাম')} data-testid="online-name" autoComplete="nickname" />
          </label>
          {flags && <button className="btn secondary ol-team" onClick={() => setPickTeam(!pickTeam)} aria-expanded={pickTeam} data-testid="online-team">
            <Flag id={team} size={26} /> {x.bi(getTeam(team).name)} <small>{t('change', 'বদলাও')}</small>
          </button>}
          {flags && pickTeam && <TeamGrid sport={sport} value={team} onChange={(id) => { setTeam(id); setFavTeam(sport, id); setPickTeam(false); }} label={t('Your country', 'তোমার দেশ')} />}
        </div>
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
            {Opt && <div className="ol-opts"><Opt value={settings} onChange={setSettings} /></div>}
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

/**
 * A player's badge: their country flag in cricket and football games, otherwise a coloured
 * circle with their initial (no flags outside the national-team games).
 */
export function Who({ team, name, size = 32 }: { team: string; name: string; size?: number }) {
  if (team) return <Flag id={team} size={size} />;
  const hues = [12, 140, 205, 265, 330, 40, 175, 290];
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const initial = [...name.trim()][0]?.toUpperCase() ?? '?';
  return (
    <span className="ol-who" aria-hidden="true" style={{ width: size, height: size, fontSize: size * 0.48, background: `hsl(${hues[h % hues.length]} 55% 42%)` }}>{initial}</span>
  );
}

// ---------- Pieces for a match screen ----------

/** True once the other player has left (closed the page, went back, lost the connection). */
export function useOppGone(peer: Peer): boolean {
  const [gone, setGone] = useState(false);
  useEffect(() => peer.onGone(() => { setGone(true); sfx('bad'); }), [peer]);
  return gone;
}

/** The other player's bar: flag, name, online dot and what they are doing. */
export function OppBar({ peer, gone, status, extra }: { peer: Peer; gone: boolean; status?: string; extra?: ReactNode }) {
  const { t } = useTx();
  return (
    <div className="ol-oppbar" data-testid="opp-bar">
      <Who team={peer.them.team} name={peer.them.name} size={24} />
      <b data-testid="opp">{peer.them.name}</b>
      <span className={`ol-dot ${gone ? 'off' : ''}`} aria-hidden="true" />
      {extra}
      <span className="ol-oppstate" data-testid="opp-state">{gone ? t('Left', 'চলে গেছে') : status ?? ''}</span>
    </div>
  );
}

/**
 * A countdown for "your move": calls `onExpire` when time runs out (each time `key` changes
 * the clock starts again; an empty key stops it). Returns seconds left.
 */
export function useMoveClock(key: string, seconds: number, onExpire: () => void): number {
  const [left, setLeft] = useState(seconds);
  const f = useRef(onExpire);
  f.current = onExpire;
  useEffect(() => {
    if (!key) return;
    const t0 = Date.now();
    setLeft(seconds);
    let fired = false;
    const iv = window.setInterval(() => {
      const rest = seconds - (Date.now() - t0) / 1000;
      setLeft(Math.max(0, rest));
      if (rest <= 0 && !fired) { fired = true; window.clearInterval(iv); f.current(); }
    }, 100);
    return () => window.clearInterval(iv);
  }, [key, seconds]);
  return left;
}

/** The ring clock for useMoveClock. */
export function MoveClock({ left, seconds }: { left: number; seconds: number }) {
  const { n } = useTx();
  return <span className={`ol-clock ${left <= 3 ? 'low' : ''}`} data-testid="clock" style={{ ['--p' as string]: String(left / seconds) }}><b>{n(Math.ceil(left))}</b></span>;
}

/** The end-of-match sheet for online games: result, rematch (both must agree) and leave. */
export function OnlineEnd({ title, lines, gone, oppName, rematch, onRematch, onLeave }: {
  title: string; lines?: ReactNode; gone: boolean; oppName: string;
  rematch?: { me: boolean; them: boolean }; onRematch?: () => void; onLeave: () => void;
}) {
  const { t } = useTx();
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="sheet ruled" data-testid="result">
        <h2>{gone ? t(`${oppName} left the match. You win!`, `${oppName} খেলা ছেড়ে চলে গেছে। তুমি জিতেছ!`) : title}</h2>
        {lines}
        {!gone && rematch?.them && !rematch.me && <p className="ol-note">{t(`${oppName} wants a rematch!`, `${oppName} আবার খেলতে চায়!`)}</p>}
        <div className="actions">
          {!gone && onRematch && (
            <button className="btn big" disabled={rematch?.me} onClick={onRematch} data-testid="rematch">
              {rematch?.me ? t('Waiting for them…', 'ওদের অপেক্ষায়…') : t('Rematch', 'আবার খেলো')}
            </button>
          )}
          <button className="btn secondary" onClick={onLeave} data-testid="leave">{t('Leave', 'বের হও')}</button>
        </div>
      </div>
    </div>
  );
}

/** Rematch handshake over a peer: both press Rematch, then `onBoth` runs on both sides. */
export function useRematch(peer: Peer, onBoth: () => void): { state: { me: boolean; them: boolean }; ask: () => void; reset: () => void } {
  const [state, setState] = useState({ me: false, them: false });
  const ref = useRef(state);
  ref.current = state;
  const both = useRef(onBoth);
  both.current = onBoth;
  useEffect(() => peer.on('rematch', () => {
    const s = { ...ref.current, them: true };
    setState(s);
    if (s.me) { setState({ me: false, them: false }); both.current(); }
  }), [peer]);
  return {
    state,
    ask: () => {
      if (ref.current.me) return;
      peer.send('rematch');
      const s = { ...ref.current, me: true };
      setState(s);
      if (s.them) { setState({ me: false, them: false }); both.current(); }
    },
    reset: () => setState({ me: false, them: false }),
  };
}
