import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Rng } from '../../engine/rng';
import { GameCanvas } from '../../engine/GameCanvas';
import { sfx } from '../../platform/audio';
import { recordResult } from '../../platform/scores';
import { readJSON, writeJSON } from '../../platform/storage';
import { makeBotPeer, thinkMs, type BotEnd } from '../../platform/net/bot';
import type { Peer, Profile } from '../../platform/net/rooms';
import { Seg, useGameBar } from '../../components/ui';
import { MoveClock, OnlineEnd, OnlineLobby, OppBar, useMoveClock, useOppGone, useRealUnmount, useRematch, type MatchProps } from '../../components/online/OnlineLobby';
import { Flag, FlagScore, useTx } from '../../components/sport/SportKit';
import { getTeam } from '../../shared/teams';
import { FORMATION_IDS, type Mentality, type TeamSetup } from './match';
import { FLICKS_PER_TURN } from './fixed';
import type { Side } from './physics';
import { FlikkScene, type Control, type FlikkConfig, type FlikkEnd, type FlikkHud, type NetFlick, type NetSnap, type Say } from './scene';
import { Tactics, rulesList } from './parts';

// Flikk Football online, fixed players only. The host is side 0 (attacks up the pitch), the
// guest side 1; the guest sees the pitch turned round so they attack up the screen too.
// Each team is the player's country from the lobby. Before each game both pick a formation
// and send it ("setup" { g, setup }); the match starts when both have.
// Moves: the side on the ball sends each flick ("flick" { g, seq, angle, power, spin } plus the
// ball, keepers and holder it was flicked from). The mover's device is authoritative: when the
// ball settles it sends "snap" (where the ball and keepers ended up, what happened, the score
// and the clock). The other device plays the same flick, then adopts the snapshot and applies
// the same result, so goals, half time and full time happen on both from the same numbers.
// 15 seconds per flick; when it runs out a sensible flick is made for you.

export interface FFSettings { len: 'short' | 'normal' }
const GAME = 'flikk-football';
const MOVE_SECONDS = 15;
const PICK_SECONDS = 20;
/** Flicks in a match (the fixed style's clock, as offline: 12 and 18 turns × 2.5). */
export const ONLINE_FLICKS: Record<FFSettings['len'], number> = { short: 30, normal: 45 };
const QUICK: FFSettings = { len: 'short' };
const DEFAULT_SETUP: TeamSetup = { formation: '4-3-3', mentality: 'balanced' };

type Msg<T> = T & { g: number };

/** The match config for one game. `me` is the side this device plays. */
export function onlineConfig(o: {
  settings: FFSettings; teams: [string, string]; setups: [TeamSetup, TeamSetup]; g: number; seed: number;
  control: [Control, Control]; send: (type: 'flick' | 'snap', data: NetFlick | NetSnap) => void;
  flip?: boolean; silent?: boolean; skill?: number; aiThink?: () => number;
}): FlikkConfig {
  return {
    style: 'fixed', teams: o.teams, setups: o.setups, vsAI: false, skill: o.skill ?? 0.6,
    totalTurns: ONLINE_FLICKS[o.settings.len] ?? ONLINE_FLICKS.short, score: [0, 0], turnsDone: 0, startMinute: 0,
    kicking: ((o.g - 1) % 2) as Side, setup: 'kickoff', knockout: false, seed: (o.seed + o.g * 7919) >>> 0,
    control: o.control, net: { send: o.send }, flip: o.flip, silent: o.silent, aiThink: o.aiThink,
  };
}

/** Runs a scene without a screen (the stand-in, tests). Returns a stop function. */
export function runHeadless(scene: FlikkScene, speed = 1): () => void {
  let last = Date.now();
  let acc = 0;
  const iv = setInterval(() => {
    const now = Date.now();
    acc = Math.min(acc + ((now - last) / 1000) * speed, 20);
    last = now;
    while (acc >= 1 / 60) { scene.update(1 / 60); acc -= 1 / 60; }
  }, 16);
  return () => clearInterval(iv);
}

export function OnlineFlikk({ onBack, code }: { onBack: () => void; code?: string }) {
  const { t, n } = useTx();
  const lenLabel = (l: FFSettings['len']) => (l === 'short' ? t(`Short (${ONLINE_FLICKS.short} flicks)`, `ছোট (${n(ONLINE_FLICKS.short)} টোকা)`) : t(`Normal (${ONLINE_FLICKS.normal} flicks)`, `মাঝারি (${n(ONLINE_FLICKS.normal)} টোকা)`));
  return (
    <OnlineLobby<FFSettings>
      game={GAME}
      title={t('Flikk Football', 'ফ্লিক ফুটবল')}
      onBack={onBack}
      code={code}
      sport="football"
      defaultSettings={QUICK}
      quickSettings={QUICK}
      describe={(s) => `${t('Fixed players', 'স্থির খেলোয়াড়')} · ${lenLabel(s.len)}`}
      Options={({ value, onChange }) => (
        <Seg label={t('Match length', 'ম্যাচের দৈর্ঘ্য')} value={value.len} onChange={(v: FFSettings['len']) => onChange({ len: v })}
          options={[{ v: 'short', label: lenLabel('short') }, { v: 'normal', label: lenLabel('normal') }]} />
      )}
      makeBot={(me, s, seed) => makeFlikkBot(me, s, seed)}
      Match={FFMatch}
      help={[
        t('Fixed players. Your country plays in your colours; pick a formation before kick-off.', 'স্থির খেলোয়াড়। তোমার দেশ তোমার রঙে খেলে; কিক-অফের আগে ফরমেশন বাছো।'),
        t(`${MOVE_SECONDS} seconds for each flick; if time runs out, a flick is made for you.`, `প্রতিটা টোকার জন্য ${n(MOVE_SECONDS)} সেকেন্ড; সময় শেষ হলে তোমার হয়ে একটা টোকা দেওয়া হবে।`),
      ]}
    />
  );
}

function FFMatch({ peer, settings, seed, onLeave }: MatchProps<FFSettings>) {
  const x = useTx();
  const { t, n } = x;
  const me: Side = peer.host ? 0 : 1;
  const opp: Side = me === 0 ? 1 : 0;
  const teams: [string, string] = me === 0 ? [peer.me.team, peer.them.team] : [peer.them.team, peer.me.team];
  const gone = useOppGone(peer);
  const [g, setG] = useState(1);
  const gRef = useRef(g);
  gRef.current = g;
  const [mySetup, setMySetup] = useState<TeamSetup>(() => readJSON<TeamSetup>('ff.online.setup', DEFAULT_SETUP));
  const [sent, setSent] = useState(0);
  const [theirs, setTheirs] = useState<Record<number, TeamSetup>>({});
  const [hud, setHud] = useState<FlikkHud | null>(null);
  const [end, setEnd] = useState<FlikkEnd | null>(null);
  const recorded = useRef(0);
  const help = <ol>{rulesList(t, 'fixed').map((r) => <li key={r}>{r}</li>)}</ol>;
  useGameBar({ help }, [x.lang]);
  useRealUnmount(() => peer.close());

  // Messages for a game whose scene is not made yet wait here.
  const held = useRef<Array<{ type: 'flick' | 'snap'; m: Msg<NetFlick | NetSnap> }>>([]);
  const sceneRef = useRef<FlikkScene | null>(null);
  const deliver = (type: 'flick' | 'snap', m: Msg<NetFlick | NetSnap>) => {
    if (m.g !== gRef.current) return;
    const s = sceneRef.current;
    if (!s) { held.current.push({ type, m }); return; }
    if (type === 'flick') s.remoteFlick(m as NetFlick); else s.remoteSnap(m as NetSnap);
  };
  useEffect(() => {
    const offs = [
      peer.on('setup', (d: Msg<{ setup: TeamSetup }>) => setTheirs((o) => ({ ...o, [d.g]: d.setup }))),
      peer.on('flick', (d: Msg<NetFlick>) => deliver('flick', d)),
      peer.on('snap', (d: Msg<NetSnap>) => deliver('snap', d)),
    ];
    return () => offs.forEach((f) => f());
  }, [peer]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendSetup = () => {
    if (sent === g) return;
    sfx('click');
    writeJSON('ff.online.setup', mySetup);
    peer.send('setup', { g, setup: mySetup });
    setSent(g);
  };
  const pickLeft = useMoveClock(sent !== g && !gone ? `pick${g}` : '', PICK_SECONDS, sendSetup);

  const say: Say = useCallback((k, v) => {
    const nm = v?.id ? x.bi(getTeam(v.id).name) : '';
    switch (k) {
      case 'goal': return t(`GOAL! ${nm}`, `গোল! ${nm}`);
      case 'pass': return t('Pass!', 'পাস!');
      case 'throw': return t('Out! Throw-in to them', 'বাইরে! ওদের থ্রো-ইন');
      case 'goalkick': return t('Out! Goal kick', 'বাইরে! গোল কিক');
      case 'tackle': return t(`${v?.n} flicks used: tackled!`, `${n(v?.n ?? '')} টোকা শেষ: ট্যাকল!`);
      case 'lost': return t('Intercepted!', 'বল কেড়ে নিল!');
      case 'chain': return v?.n === '1' ? t('Pass!', 'পাস!') : t(`${v?.n} passes in a row!`, `টানা ${n(v?.n ?? '')}টা পাস!`);
      case 'turn': return t(`${nm}: your turn`, `${nm}-এর পালা`);
      case 'yourTurn': return t('Your turn', 'তোমার পালা');
      case 'theirTurn': return t(`${peer.them.name}’s turn`, `${peer.them.name}-এর পালা`);
      case 'half': return t('Half time', 'বিরতি');
      case 'golden': return t('Golden goal!', 'গোল্ডেন গোল!');
      case 'pens': return t('Penalty flicks', 'পেনাল্টি টোকা');
      case 'scored': return t('Scored!', 'গোল!');
      case 'missed': return t('Missed!', 'মিস!');
      case 'saved': return t('Saved!', 'সেভ!');
    }
    return '';
  }, [x.lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const ready = sent === g && !!theirs[g];
  const scene = useMemo(() => {
    if (!ready) return null;
    const setups: [TeamSetup, TeamSetup] = me === 0 ? [mySetup, theirs[g]] : [theirs[g], mySetup];
    const control: [Control, Control] = me === 0 ? ['human', 'remote'] : ['remote', 'human'];
    const game = g;
    return new FlikkScene(onlineConfig({ settings, teams, setups, g, seed, control, flip: me === 1, send: (type, data) => peer.send(type, { ...data, g: game }) }), say, setHud, setEnd);
  }, [ready, g]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    sceneRef.current = scene;
    if (!scene) return;
    const q = held.current.filter((h) => h.m.g === gRef.current);
    held.current = [];
    q.forEach((h) => deliver(h.type, h.m));
    const w = window as unknown as { __flikk?: FlikkScene };
    w.__flikk = scene;
    return () => { if (w.__flikk === scene) delete w.__flikk; };
  }, [scene]); // eslint-disable-line react-hooks/exhaustive-deps

  const myTurn = !!hud && !gone && !end && hud.phase === 'aim' && hud.control === 'human';
  const left = useMoveClock(myTurn ? `${g}|${hud!.seq}` : '', MOVE_SECONDS, () => { sceneRef.current?.autoFlick(0.3); });

  const rematch = useRematch(peer, () => {
    held.current = [];
    sceneRef.current = null;
    setHud(null);
    setEnd(null);
    setG(gRef.current + 1);
  });

  useEffect(() => {
    if (!end || recorded.current === g) return;
    recorded.current = g;
    recordResult(GAME, { outcome: end.winner === null ? 'tie' : end.winner === me ? 'win' : 'loss' }, () => []);
  }, [end, g]); // eslint-disable-line react-hooks/exhaustive-deps

  const theirTurn = !!hud && !hud.over && hud.turnSide === opp;
  const status = !scene ? (theirs[g] ? t('Ready', 'প্রস্তুত') : t('Choosing a formation…', 'ফরমেশন বাছছে…'))
    : end ? '' : theirTurn ? t('Flicking…', 'টোকা দিচ্ছে…') : t('Waiting', 'অপেক্ষায়');

  const endSheet = (end || gone) && (
    <OnlineEnd
      title={!end || end.winner === null ? t('A draw!', 'ড্র!') : end.winner === me ? t('You win!', 'তুমি জিতেছ!') : t(`${peer.them.name} wins`, `${peer.them.name} জিতেছে`)}
      lines={end ? <>
        <FlagScore a={teams[me]} b={teams[opp]} sa={n(end.score[me])} sb={n(end.score[opp])} mid={t('FT', 'শেষ')} />
        <p className="lede" data-testid="ff-final">{peer.me.name} {n(end.score[me])} · {peer.them.name} {n(end.score[opp])}</p>
        <p className="ol-meta">{t('Passes', 'পাস')} {n(end.stats.passes[me])}–{n(end.stats.passes[opp])} · {t('Shots', 'শট')} {n(end.stats.shots[me])}–{n(end.stats.shots[opp])}</p>
      </> : undefined}
      gone={gone && !end} oppName={peer.them.name}
      rematch={gone ? undefined : rematch.state} onRematch={gone ? undefined : rematch.ask}
      onLeave={onLeave}
    />
  );

  if (!scene) {
    return (
      <div className="sport-page ff-pick" data-testid="online-match">
        <OppBar peer={peer} gone={gone} status={status} />
        <div className="ff-pick-vs">
          <span><Flag id={teams[me]} size={40} /><b>{peer.me.name}</b></span>
          <i>{t('vs', 'বনাম')}</i>
          <span><Flag id={teams[opp]} size={40} /><b>{peer.them.name}</b></span>
        </div>
        <h2>{g > 1 ? t(`Game ${g}: your formation`, `${n(g)} নম্বর খেলা: তোমার ফরমেশন`) : t('Your formation', 'তোমার ফরমেশন')}</h2>
        <p className="lede">{me === 0 ? t('You attack up the pitch.', 'তুমি মাঠের ওপরের দিকে আক্রমণ করবে।') : t('You attack up the pitch too: your screen is turned round.', 'তুমিও ওপরের দিকে আক্রমণ করবে: তোমার পর্দা ঘুরিয়ে দেখানো হয়েছে।')}</p>
        {sent !== g ? <>
          <div className="sport-actions ff-pick-go">
            <button className="btn big" onClick={sendSetup} data-testid="ff-ready">{t('Ready', 'প্রস্তুত')}</button>
            <MoveClock left={pickLeft} seconds={PICK_SECONDS} />
          </div>
          <Tactics value={mySetup} onChange={setMySetup} kit={getTeam(teams[me]).kit[0]} />
        </> : <div className="ol-pulse" data-testid="ff-waiting"><i /><i /><i /> {t(`Waiting for ${peer.them.name}…`, `${peer.them.name}-এর অপেক্ষায়…`)}</div>}
        {endSheet}
      </div>
    );
  }

  const h = hud;
  const turnSide = h?.turnSide ?? 0;
  return (
    <div className="ff-root ff-online" data-testid="online-match">
      <div className="ff-top">
        <OppBar peer={peer} gone={gone} status={status} />
        <FlagScore a={teams[me]} b={teams[opp]} sa={<span data-testid="score-me">{n(h?.score[me] ?? 0)}</span>} sb={<span data-testid="score-them">{n(h?.score[opp] ?? 0)}</span>} mid={`${n(h?.minute ?? 0)}′`} />
      </div>
      <div className="ff-canvas">
        <GameCanvas scene={scene} paused={false} label={t('Football desk', 'ফুটবল ডেস্ক')} />
      </div>
      <div className="ff-bottom" aria-live="polite">
        <span className="ff-turn" style={{ ['--kit' as string]: getTeam(teams[turnSide]).kit[0] }} data-testid="ff-turn">
          <Flag id={teams[turnSide]} size={22} />
          {h?.over ? t('Full time', 'খেলা শেষ') : h?.phase === 'moving' || h?.phase === 'sync' ? '…' : turnSide === me ? t('Your turn', 'তোমার পালা') : t(`${peer.them.name}…`, `${peer.them.name}…`)}
        </span>
        {myTurn && <MoveClock left={left} seconds={MOVE_SECONDS} />}
        <span className="ff-flicks" aria-label={t(`Flick ${h?.flick ?? 1} of ${FLICKS_PER_TURN}`, `${n(FLICKS_PER_TURN)}-এর ${n(h?.flick ?? 1)} নম্বর টোকা`)}>{Array.from({ length: FLICKS_PER_TURN }, (_, k) => k + 1).map((i) => <i key={i} className={(h?.flick ?? 1) > i ? 'used' : (h?.flick ?? 1) === i ? 'now' : ''} />)}</span>
        <span className="ff-chip" data-testid="left" title={t('Flicks left in the match', 'ম্যাচে বাকি টোকা')}>⏱ <b>{n(h?.left ?? 0)}</b></span>
      </div>
      {endSheet}
    </div>
  );
}

// ---------- The stand-in ----------

const MENTALITIES: Mentality[] = ['balanced', 'balanced', 'attack', 'defend'];

/** Plays side 0 (the host) with the computer's fixed-players brain at a medium level and human think times. */
export function flikkBrain(speed = 1) {
  return (end: BotEnd, ctx: { rng: Rng; me: Profile; them: Profile; settings: FFSettings; seed: number }) => {
    const rng = ctx.rng;
    const skill = 0.5 + rng.next() * 0.2;
    let g = 1;
    let scene: FlikkScene | null = null;
    let stopTick: (() => void) | null = null;
    const mine = new Map<number, TeamSetup>();
    const theirs = new Map<number, TeamSetup>();
    const held: Array<{ type: 'flick' | 'snap'; m: Msg<NetFlick | NetSnap> }> = [];
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let rematchAsked = false;
    let closed = false;
    const later = (ms: number, fn: () => void) => { const id = setTimeout(() => { timers.delete(id); if (!closed) fn(); }, ms); timers.add(id); };

    const start = () => {
      if (scene || !mine.has(g) || !theirs.has(g)) return;
      const game = g;
      scene = new FlikkScene(onlineConfig({
        settings: ctx.settings, teams: [ctx.them.team, ctx.me.team], setups: [mine.get(g)!, theirs.get(g)!], g, seed: ctx.seed,
        control: ['ai', 'remote'], silent: true, skill,
        aiThink: () => thinkMs(rng, 0.9, 2.6) / 1000,
        send: (type, data) => end.send(type, { ...data, g: game }),
      }), () => '', () => {}, () => {});
      stopTick = runHeadless(scene, speed);
      const q = held.splice(0).filter((h) => h.m.g === g);
      q.forEach((h) => deliver(h.type, h.m));
    };
    const deliver = (type: 'flick' | 'snap', m: Msg<NetFlick | NetSnap>) => {
      if (m.g !== g) return;
      if (!scene) { held.push({ type, m }); return; }
      if (type === 'flick') scene.remoteFlick(m as NetFlick); else scene.remoteSnap(m as NetSnap);
    };
    const pickSetup = () => {
      const game = g;
      later(thinkMs(rng, 2, 6, speed), () => {
        if (game !== g) return;
        const s: TeamSetup = { formation: rng.pick(FORMATION_IDS), mentality: rng.pick(MENTALITIES) };
        mine.set(game, s);
        end.send('setup', { g: game, setup: s });
        start();
      });
    };
    const offs = [
      end.on('setup', (d: Msg<{ setup: TeamSetup }>) => { theirs.set(d.g, d.setup); if (d.g === g) start(); }),
      end.on('flick', (d: Msg<NetFlick>) => deliver('flick', d)),
      end.on('snap', (d: Msg<NetSnap>) => deliver('snap', d)),
      end.on('rematch', () => {
        if (rematchAsked) return;
        rematchAsked = true;
        later(thinkMs(rng, 1, 2.2, speed), () => {
          end.send('rematch');
          rematchAsked = false;
          stopTick?.(); stopTick = null; scene = null;
          g += 1;
          pickSetup();
        });
      }),
    ];
    pickSetup();
    return () => { closed = true; offs.forEach((f) => f()); timers.forEach((id) => clearTimeout(id)); stopTick?.(); };
  };
}

export function makeFlikkBot(me: Profile, settings: FFSettings, seed?: number, speed = 1): Peer {
  return makeBotPeer(me, { settings, seed, sport: 'football', brain: flikkBrain(speed), speed });
}
