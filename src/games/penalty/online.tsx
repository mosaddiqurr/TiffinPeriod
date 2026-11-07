import { useEffect, useMemo, useRef, useState } from 'react';
import { GameCanvas } from '../../engine/GameCanvas';
import { createRng } from '../../engine/rng';
import { recordResult } from '../../platform/scores';
import { Seg, useGameBar } from '../../components/ui';
import { MoveClock, OnlineEnd, OnlineLobby, OppBar, Who, useMoveClock, useOppGone, useRealUnmount, type MatchProps } from '../../components/online/OnlineLobby';
import { useTx } from '../../components/sport/SportKit';
import { getTeam } from '../../shared/teams';
import { KeeperAI, aiKick, goals, type Shootout } from './model';
import { PenaltyScene, type KickPlan, type Phase } from './scene';
import { PKDuel, type KickEvent, type PKSetup, type PKView, type Side } from './duel';
import { makePenaltyBot, QUICK_SETUP } from './bot';

// Online 1v1 Penalty Shootout: quick match, create a room (code + link), or join with a code.
// Each player's team is their lobby country. The match is PKDuel (duel.ts): for every kick the
// shooter picks aim and power while the keeper picks a dive, both in secret, then both phones
// play the same kick.

const GAME = 'penalty';
/** Seconds for each shot or dive. */
export const KICK_SECONDS = 10;

export function OnlinePenalty({ onBack, code }: { onBack: () => void; code?: string }) {
  const { t, n } = useTx();
  return (
    <OnlineLobby<PKSetup>
      game={GAME}
      title={t('Penalty Shootout', 'পেনাল্টি শুটআউট')}
      onBack={onBack}
      code={code}
      sport="football"
      defaultSettings={QUICK_SETUP}
      quickSettings={QUICK_SETUP}
      describe={(s) => t(`${s.kicks} kicks each, then sudden death`, `প্রতি দলে ${n(s.kicks)}টা শট, তারপর সাডেন ডেথ`)}
      Options={PKOptions}
      makeBot={(me, s, seed) => makePenaltyBot(me, seed, 1, s)}
      Match={PKMatch}
      help={[
        t('Take turns to shoot and keep. The shooter aims while the keeper picks a dive, at the same time. Nobody sees the other’s choice until both are locked.', 'পালা করে শট আর গোলকিপিং। শুটার নিশানা ঠিক করে, একই সময়ে গোলকিপার ঝাঁপের দিক বাছে। দুজনের বাছাই শেষ হওয়ার আগে কেউ অন্যেরটা দেখতে পায় না।'),
        t(`You have ${KICK_SECONDS} seconds for each kick or dive.`, `প্রতিটা শট বা ঝাঁপের জন্য সময় ${n(KICK_SECONDS)} সেকেন্ড।`),
      ]}
    />
  );
}

function PKOptions({ value, onChange }: { value: PKSetup; onChange: (v: PKSetup) => void }) {
  const { t, n } = useTx();
  return <Seg label={t('Kicks each', 'প্রতি দলে শট')} value={value.kicks} onChange={(v) => onChange({ kicks: v })} options={[3, 5].map((v) => ({ v, label: t(`${v} kicks`, `${n(v)}টা শট`) }))} />;
}

const other = (s: Side): Side => (s === 0 ? 1 : 0);
const pressureOf = (so: Shootout, k: Side) => { const c = so.kicks[k].length; return c >= so.best ? 1 : c >= so.best - 2 ? 0.5 : 0.2; };

/** The kick tally with both players' flags and names. */
function OnlineBoard({ teams, names, so, mySide }: { teams: [string, string]; names: [string, string]; so: Shootout; mySide: Side }) {
  const x = useTx();
  // Always `best` slots, so it fits a phone; in sudden death the latest kicks show (goals count all).
  const count = Math.max(so.best, so.kicks[0].length, so.kicks[1].length);
  const start = count - so.best;
  const g = goals(so);
  return (
    <div className="pk-board pk-ol-board" aria-label={x.t('Kicks', 'শট')} data-testid="kick-board">
      {([0, 1] as const).map((s) => (
        <div key={s} className={`pk-row ${s === mySide ? 'me' : ''}`}>
          <Who team={teams[s]} name={names[s]} size={24} /><b className="pk-ol-name">{names[s]}</b>
          {start > 0 && <span className="pk-more" aria-hidden="true">…</span>}
          <span className="pk-dots">{Array.from({ length: so.best }, (_, j) => { const i = start + j; const k = so.kicks[s][i]; return <i key={i} className={k === undefined ? '' : k ? 'g' : 'm'}>{k === undefined ? '' : k ? '✓' : '✗'}</i>; })}</span>
          <b className="pk-g" data-testid={`goals-${s}`}>{x.n(g[s])}</b>
        </div>
      ))}
    </div>
  );
}

function PKMatch({ peer, settings, seed, onLeave }: MatchProps<PKSetup>) {
  const x = useTx();
  const { t, n } = x;
  const duel = useMemo(() => new PKDuel(peer, peer.host ? 0 : 1, settings, seed), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [v, setV] = useState<PKView>(duel.view);
  const gone = useOppGone(peer);
  const me = v.mySide;
  const opp = other(me);
  const names: [string, string] = me === 0 ? [peer.me.name, peer.them.name] : [peer.them.name, peer.me.name];
  const teams: [string, string] = me === 0 ? [peer.me.team, peer.them.team] : [peer.them.team, peer.me.team];
  const [phase, setPhase] = useState<Phase>('idle');
  const [anim, setAnim] = useState<KickEvent | null>(null);
  const animRef = useRef<KickEvent | null>(null);
  const [auto, setAuto] = useState(false);
  const started = useRef('');
  const recorded = useRef(0);
  const rng = useMemo(() => createRng(seed), [seed]);
  const spare = useMemo(() => createRng(), []);
  const keeperAI = useMemo(() => new KeeperAI(0.5, spare), [spare]);
  const doneRef = useRef<() => void>(() => {});
  const scene = useMemo(() => new PenaltyScene(rng, () => doneRef.current(), setPhase, [getTeam(teams[0]).kit[0], getTeam(teams[1]).kit[0]]), []); // eslint-disable-line react-hooks/exhaustive-deps
  useGameBar({ help: <p>{t('Shooter: touch the goal to aim, let go, then tap to stop the power bar. Keeper: tap where to dive. Both choose at the same time.', 'শুটার: গোলে ছুঁয়ে নিশানা করো, ছেড়ে দাও, তারপর ট্যাপ করে জোর থামাও। গোলকিপার: যেদিকে ঝাঁপাবে সেখানে ট্যাপ করো। দুজনেই একসাথে বাছে।')}</p> }, [x.lang]);

  const planFor = (k: Side, so: Shootout): KickPlan => ({
    kicker: teams[k], keeper: teams[other(k)], humanKicks: k === me, humanKeeps: k !== me,
    skill: 0.6, pressure: pressureOf(so, k), keeperAI,
    online: { role: k === me ? 'shoot' : 'keep', onShot: (s) => duel.lockShot(s), onDive: (d) => duel.lockDive(d) },
  });

  useEffect(() => {
    (window as unknown as { __pk?: PenaltyScene; __pkOnline?: PKDuel }).__pk = scene;
    (window as unknown as { __pkOnline?: PKDuel }).__pkOnline = duel;
    const offA = duel.onChange(setV);
    setV(duel.view);
    const offB = duel.onEvent((e) => {
      animRef.current = e;
      setAnim(e);
      scene.mineRole = e.kicker === me ? 'shoot' : 'keep';
      scene.replay(planFor(e.kicker, e.before), e.shot, e.dive, e.outcome);
    });
    return () => { offA(); offB(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useRealUnmount(() => {
    duel.dispose(); peer.close();
    const w = window as unknown as { __pk?: PenaltyScene; __pkOnline?: PKDuel };
    if (w.__pk === scene) delete w.__pk;
    if (w.__pkOnline === duel) delete w.__pkOnline;
  });
  doneRef.current = () => { animRef.current = null; setAnim(null); };

  // Set up the next kick once the last one has been played.
  useEffect(() => {
    const key = `${v.game}|${v.step}`;
    if (anim || animRef.current || v.phase !== 'pick' || v.cheat || started.current === key) return;
    started.current = key;
    scene.mineRole = null;
    scene.start(planFor(v.kicker, v.so));
  }, [v.game, v.step, v.phase, v.cheat, anim]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (!gone && scene.key(e.code)) e.preventDefault(); };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [scene, gone]);

  // Ten seconds for each shot or dive; when time runs out a sensible one is chosen for you.
  const deciding = !gone && !v.cheat && !anim && v.phase === 'pick' && !v.myLocked;
  const iShoot = v.kicker === me;
  const left = useMoveClock(deciding ? `${v.game}|${v.step}` : '', KICK_SECONDS, () => {
    if (duel.view.myLocked) return;
    const shot = aiKick(0.5, spare, 0).shot;
    const dive = keeperAI.guess();
    scene.lockNow({ shot, dive });
    if (!duel.view.myLocked) { if (duel.role === 'shoot') duel.lockShot(shot); else duel.lockDive(dive); }
    setAuto(true);
    window.setTimeout(() => setAuto(false), 1800);
  });

  // Record each finished shootout once.
  const over = v.phase === 'over' && !anim;
  useEffect(() => {
    if (!over || recorded.current === v.game) return;
    recorded.current = v.game;
    recordResult(GAME, { outcome: v.winner === me ? 'win' : 'loss' }, () => []);
  }, [over, v.game]); // eslint-disable-line react-hooks/exhaustive-deps

  const so = anim ? anim.before : v.so;
  const shownKicker = anim ? anim.kicker : v.kicker;
  const sudden = so.kicks[0].length >= so.best && so.kicks[1].length >= so.best;
  const oppState = anim || v.phase !== 'pick' ? '' : v.theirLocked ? t('Ready ✓', 'তৈরি ✓') : iShoot ? t('Choosing a dive…', 'ঝাঁপের দিক বাছছে…') : t('Lining up the shot…', 'শট ঠিক করছে…');
  const hint = anim || gone || v.phase !== 'pick' ? ''
    : auto ? t('Time up: chosen for you', 'সময় শেষ: তোমার হয়ে বাছা হলো')
    : phase === 'aim' ? t('Touch the goal to aim, then let go', 'গোলে ছুঁয়ে নিশানা করো, তারপর ছাড়ো')
    : phase === 'power' ? t('Tap to stop the power bar!', 'ট্যাপ করে জোর থামাও!')
    : phase === 'guess' ? t('Tap where to dive!', 'যেদিকে ঝাঁপাবে সেখানে ট্যাপ করো!')
    : phase === 'locked' ? (v.theirLocked ? '' : iShoot ? t('Shot locked. The keeper is choosing…', 'শট ঠিক। গোলকিপার বাছছে…') : t('Dive locked. Waiting for the kick…', 'ঝাঁপ ঠিক। শটের অপেক্ষা…'))
    : '';
  const w = v.winner;
  const g = goals(v.so);

  return (
    <div className="pk-root pk-online" data-testid="online-match">
      <div className="pk-top">
        <OppBar peer={peer} gone={gone} status={oppState} />
        <OnlineBoard teams={teams} names={names} so={so} mySide={me} />
        <div className="pk-who" data-testid="pk-who">
          <Who team={teams[shownKicker]} name={names[shownKicker]} size={22} />
          <span>{shownKicker === me ? t('You shoot', 'তোমার শট') : t('You are in goal', 'তুমি গোলকিপার')}{sudden ? ` · ${t('Sudden death', 'সাডেন ডেথ')}` : ''}</span>
          {deciding && <MoveClock left={left} seconds={KICK_SECONDS} />}
        </div>
      </div>
      <div className="pk-canvas">
        <GameCanvas scene={scene} paused={false} label={t('Penalty spot', 'পেনাল্টি স্পট')} />
        {hint && <div className="pk-hint" aria-live="polite" data-testid="pk-hint">{hint}</div>}
      </div>
      {(over || gone || v.cheat) && (
        <OnlineEnd
          title={v.cheat ? t('Connection problem. The match was stopped.', 'সংযোগে সমস্যা। খেলা থামানো হলো।') : w === me ? t('You win the shootout!', 'তুমি শুটআউট জিতেছ!') : t(`${names[opp]} wins the shootout`, `${names[opp]} শুটআউট জিতেছে`)}
          outcome={v.cheat ? 'none' : w === me ? 'win' : 'loss'}
          {...(v.cheat ? {} : { me: { name: names[me], team: teams[me], score: n(g[me]) }, them: { name: names[opp], team: teams[opp], score: n(g[opp]) } })}
          lines={<>
            <OnlineBoard teams={teams} names={names} so={v.so} mySide={me} />
          </>}
          gone={gone && !over && !v.cheat} oppName={names[opp]}
          rematch={gone || v.cheat ? undefined : v.rematch} onRematch={gone || v.cheat || !over ? undefined : () => duel.askRematch()}
          onLeave={onLeave}
        />
      )}
    </div>
  );
}
