import { useEffect, useReducer, useRef, useState } from 'react';
import { GameCanvas } from '../../engine/GameCanvas';
import { createRng } from '../../engine/rng';
import { capturePointer } from '../../engine/timing';
import { useT } from '../../platform/i18n';
import { useSettings } from '../../platform/settings';
import { recordResult } from '../../platform/scores';
import type { ShellConfig } from '../../components/GameShell';
import { Seg, useGameBar } from '../../components/ui';
import { MoveClock, OnlineEnd, OnlineLobby, OppBar, useMoveClock, useOppGone, useRealUnmount, useRematch, type MatchProps } from '../../components/online/OnlineLobby';
import { useTx, type Tx } from '../../components/sport/SportKit';
import { PlaneScene, S, type PlanePhase } from './PaperPlane';
import { MOVE_SECONDS, PP_GAME, PP_QUICK, PlaneRace, THROWS, makePlaneBot, type PPSettings, type RaceSide } from './race';
import type { Challenge, Fold } from './model';
import './paper-plane.css';

// Paper Airplane online: a score race (see race.ts). Both players get the host's challenge and
// fold, the same course and the same wind for each throw, and throw at the same time on their
// own devices. The other player's throws show live in their bar. 15 seconds to throw; when the
// clock runs out the plane is thrown for you.

const challengeName = (x: Tx, c: Challenge) => c === 'accuracy' ? x.t('Accuracy', 'নিশানা') : c === 'obstacle' ? x.t('Obstacles', 'বাধা') : x.t('Distance', 'দূরত্ব');
const foldName = (x: Tx, f: Fold) => f === 'dart' ? x.t('Dart', 'ডার্ট') : f === 'hawk' ? x.t('Hawk', 'বাজপাখি') : x.t('Glider', 'গ্লাইডার');

function PPOptions({ value, onChange }: { value: PPSettings; onChange: (v: PPSettings) => void }) {
  const x = useTx();
  return (
    <>
      <div className="opt-label">{x.t('Challenge', 'চ্যালেঞ্জ')}</div>
      <Seg label={x.t('Challenge', 'চ্যালেঞ্জ')} value={value.challenge} onChange={(c) => onChange({ ...value, challenge: c })} options={(['distance', 'accuracy', 'obstacle'] as const).map((v) => ({ v, label: challengeName(x, v) }))} />
      <div className="opt-label">{x.t('Plane fold (both of you)', 'ভাঁজের ধরন (দুজনেরই)')}</div>
      <Seg label={x.t('Plane fold', 'ভাঁজের ধরন')} value={value.fold} onChange={(f) => onChange({ ...value, fold: f })} options={(['glider', 'dart', 'hawk'] as const).map((v) => ({ v, label: foldName(x, v) }))} />
    </>
  );
}

export function OnlinePaperPlane({ onBack, code }: { onBack: () => void; code?: string }) {
  const x = useTx();
  const { t, n } = x;
  return (
    <OnlineLobby<PPSettings>
      game={PP_GAME}
      title={t('Paper Airplane Challenge', 'কাগজের উড়োজাহাজ চ্যালেঞ্জ')}
      onBack={onBack}
      code={code}
      defaultSettings={PP_QUICK}
      quickSettings={PP_QUICK}
      describe={(s) => `${challengeName(x, s.challenge)} · ${foldName(x, s.fold)} · ${t(`${THROWS} throws`, `${n(THROWS)}টা ছোড়া`)}`}
      Options={PPOptions}
      makeBot={(me, s, seed) => makePlaneBot(me, s, seed)}
      Match={PPMatch}
      help={[
        t('You both fly the same rooftops with the same wind, at the same time. The best of three throws counts.', 'দুজনেই একই ছাদের সারিতে, একই বাতাসে, একসাথে ছোড়ো। তিনটা ছোড়ার মধ্যে সেরাটা গুনবে।'),
        t(`${MOVE_SECONDS} seconds for each throw; if time runs out, the plane is thrown for you.`, `প্রতিটা ছোড়ার জন্য ${n(MOVE_SECONDS)} সেকেন্ড; সময় শেষ হলে তোমার হয়ে ছুড়ে দেওয়া হবে।`),
      ]}
    />
  );
}

/** Pixels the top bars cover on the canvas (the opponent's bar and mine). */
const HUD_TOP = 92;

function PPMatch({ peer, settings, seed, onLeave }: MatchProps<PPSettings>) {
  const x = useTx();
  const { t, n } = x;
  const tt = useT(S);
  const st = useSettings();
  const gone = useOppGone(peer);
  const [, bump] = useReducer((c: number) => c + 1, 0);
  const raceRef = useRef<PlaneRace | null>(null);
  const sceneRef = useRef<PlaneScene | null>(null);
  const [scene, setScene] = useState<PlaneScene | null>(null);
  const [phase, setPhase] = useState<{ p: PlanePhase; i: number }>({ p: 'wait', i: 0 });
  const [upDown, setUpDown] = useState(false);
  const recorded = useRef(0);
  const ttRef = useRef(tt);
  ttRef.current = tt;
  const stRef = useRef(st);
  stRef.current = st;

  useGameBar({ help: <ol>{[
    t('On the roof, pull back from the plane and let go to throw. In the air, hold ▲ to raise the nose.', 'ছাদে উড়োজাহাজ থেকে পেছনে টেনে ছেড়ে দাও। আকাশে ▲ চেপে ধরলে নাক উঁচু হবে।'),
    t('Three throws each, at the same time. The best throw counts.', 'প্রত্যেকে একসাথে তিনবার ছুড়বে। সেরাটা গুনবে।'),
    t(`${MOVE_SECONDS} seconds for each throw.`, `প্রতিটা ছোড়ার জন্য ${n(MOVE_SECONDS)} সেকেন্ড।`),
  ].map((r) => <li key={r}>{r}</li>)}</ol> }, [x.lang]);

  /** Start a game (the first, or a rematch): a fresh race link and a fresh scene on the same course. */
  const startGame = () => {
    const race = raceRef.current;
    if (!race) return;
    race.newGame();
    const s = stRef.current;
    const cfg: ShellConfig = { mode: 'solo', diff: 'medium', opts: { challenge: settings.challenge, fold: settings.fold }, names: [peer.me.name], reducedMotion: s.reducedMotion, lang: s.lang };
    const sc = new PlaneScene(cfg, ttRef.current, createRng((seed ^ 0x51ab) >>> 0), {
      seed,
      hudTop: HUD_TOP,
      onPhase: (p, i) => { setPhase({ p, i }); if (p === 'fly') race.flying(true); },
      onThrow: (score) => race.myThrow(score),
      onDone: () => bump(),
    });
    sceneRef.current = sc;
    setScene(sc);
    setPhase({ p: 'wait', i: 0 });
    setUpDown(false);
    race.ready();
  };

  useEffect(() => {
    const race = new PlaneRace(peer);
    raceRef.current = race;
    race.onChange(() => bump());
    race.onStart(() => sceneRef.current?.begin());
    startGame();
    return () => { race.dispose(); if (raceRef.current === race) raceRef.current = null; };
  }, [peer]); // eslint-disable-line react-hooks/exhaustive-deps
  useRealUnmount(() => peer.close());

  // Rematch: both agreed. Start the next game straight away, inside the message handler,
  // so the other side's "ready" for it reaches the new race link.
  const rematch = useRematch(peer, () => startGame());

  const race = raceRef.current;
  const me: RaceSide = race?.me ?? { throws: [], best: 0, done: false, flying: false };
  const opp: RaceSide = race?.opp ?? { throws: [], best: 0, done: false, flying: false };
  const started = race?.started ?? false;
  const result = race?.result ?? null;
  const g = race?.g ?? 0;

  const myTurn = !gone && started && phase.p === 'aim' && !me.done;
  const left = useMoveClock(myTurn ? `${g}|${phase.i}` : '', MOVE_SECONDS, () => sceneRef.current?.autoThrow());

  useEffect(() => {
    if (!g || recorded.current === g) return;
    if (result) { recorded.current = g; recordResult(PP_GAME, { outcome: result }, () => []); }
    else if (gone) { recorded.current = g; recordResult(PP_GAME, { outcome: 'win' }, () => []); }
  }, [result, gone, g]);

  // Keys: ← → angle, Space / ↑ / W to throw and to raise the nose.
  useEffect(() => {
    const map: Record<string, string> = { Space: 'up', ArrowUp: 'up', KeyW: 'up', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
    const kd = (e: KeyboardEvent) => {
      const a = map[e.code];
      if (!a || (e.target as HTMLElement)?.closest?.('button, input')) return;
      e.preventDefault();
      if (!e.repeat) sceneRef.current?.control(0, a, true);
      if (a === 'up') setUpDown(true);
    };
    const ku = (e: KeyboardEvent) => {
      const a = map[e.code];
      if (!a || (e.target as HTMLElement)?.closest?.('button, input')) return;
      e.preventDefault();
      sceneRef.current?.control(0, a, false);
      if (a === 'up') setUpDown(false);
    };
    addEventListener('keydown', kd);
    addEventListener('keyup', ku);
    return () => { removeEventListener('keydown', kd); removeEventListener('keyup', ku); };
  }, []);

  const pad = (down: boolean) => { sceneRef.current?.control(0, 'up', down); setUpDown(down); };
  const best = (v: number) => n(v);
  const sideLine = (s: RaceSide) => t(`${s.throws.length} of ${THROWS} throws · best ${best(s.best)}`, `ছোড়া ${n(s.throws.length)}/${n(THROWS)} · সেরা ${best(s.best)}`);
  const oppStatus = !started ? t('Getting ready…', 'তৈরি হচ্ছে…') : `${sideLine(opp)}${opp.done ? ' ✓' : opp.flying ? ' ✈' : ''}`;
  const throwNo = Math.min(THROWS, me.throws.length + (me.done ? 0 : 1));
  const myLine = !started
    ? t(`Waiting for ${peer.them.name}…`, `${peer.them.name}-এর অপেক্ষা…`)
    : me.done && result
      ? t(`Both finished. Your best: ${best(me.best)}`, `দুজনেরই শেষ। তোমার সেরা: ${best(me.best)}`)
    : me.done
      ? t(`Done! Best ${best(me.best)}. Waiting for ${peer.them.name}…`, `শেষ! সেরা ${best(me.best)}। ${peer.them.name}-এর অপেক্ষা…`)
      : `${t(`Throw ${throwNo} of ${THROWS}`, `ছোড়া ${n(throwNo)}/${n(THROWS)}`)} · ${t('best', 'সেরা')} ${best(me.best)}`;
  const ended = !!result || gone;
  const showEnd = ended && (gone || phase.p === 'done');
  const title = result === 'tie' ? t('A draw!', 'সমান সমান!') : result === 'win' ? t('You win!', 'তুমি জিতেছ!') : t(`${peer.them.name} wins`, `${peer.them.name} জিতেছে`);
  const list = (s: RaceSide) => s.throws.map((v) => n(v)).join(' · ') || '–';

  return (
    <div className="shell-root playing pp-online" data-testid="online-match">
      {scene && <GameCanvas scene={scene} paused={false} label={t('Paper Airplane Challenge', 'কাগজের উড়োজাহাজ চ্যালেঞ্জ')} />}
      <div className="pp-ol-top">
        <OppBar peer={peer} gone={gone} status={oppStatus} />
        <div className="pp-ol-me" aria-live="polite">
          <span className="pp-ol-chal">{challengeName(x, settings.challenge)}</span>
          <span className="pp-ol-line" data-testid="my-line">{myLine}</span>
          {myTurn && <MoveClock left={left} seconds={MOVE_SECONDS} />}
        </div>
      </div>
      <div className="shell-pads">
        <div className="pad-area area-br">
          <button
            className={`touch-pad shell-pad size-l ${upDown ? 'down' : ''}`}
            style={{ background: 'rgba(31,58,147,0.85)' }}
            data-testid="pad-0-up"
            aria-label={tt('up')}
            onPointerDown={(e) => { e.preventDefault(); capturePointer(e); pad(true); }}
            onPointerUp={() => pad(false)}
            onPointerCancel={() => pad(false)}
            onContextMenu={(e) => e.preventDefault()}
          >
            <span className="lbl">{tt('up')}</span>
            <small>{tt('upSub')}</small>
          </button>
        </div>
      </div>
      {showEnd && (
        <OnlineEnd
          title={title}
          outcome={result === 'tie' || result === 'win' || result === 'loss' ? result : undefined}
          lines={<div className="pp-ol-res" data-testid="race-scores">
            <p><b>{t('You', 'তুমি')}</b>: {list(me)} → <b>{best(me.best)}</b></p>
            <p><b>{peer.them.name}</b>: {list(opp)} → <b>{best(opp.best)}</b></p>
          </div>}
          gone={gone && !result} oppName={peer.them.name}
          rematch={gone ? undefined : rematch.state} onRematch={gone ? undefined : rematch.ask}
          onLeave={onLeave}
        />
      )}
    </div>
  );
}
