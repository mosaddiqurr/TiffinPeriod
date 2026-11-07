import { useEffect, useRef, useState } from 'react';
import { createRng, type Rng } from '../../engine/rng';
import { GameCanvas } from '../../engine/GameCanvas';
import { sfx, vibrate } from '../../platform/audio';
import { recordResult } from '../../platform/scores';
import { useT } from '../../platform/i18n';
import { makeBotPeer, thinkMs, type BotEnd } from '../../platform/net/bot';
import { RaceLink, raceBrain, type RaceProgress } from '../../platform/net/race';
import type { Peer, Profile } from '../../platform/net/rooms';
import { Seg, useGameBar } from '../../components/ui';
import { OnlineEnd, OnlineLobby, OppBar, useOppGone, useRealUnmount, useRematch, type MatchProps } from '../../components/online/OnlineLobby';
import { useTx } from '../../components/sport/SportKit';
import { BalloonScene, type BalloonEvent } from './BalloonScene';
import { BalloonAI, Field, type BColor, type Scorer } from './field';
import { GOLD_BONUS, pelletsFor, type PopStyle } from './gun';
import { S } from './strings';

// Balloon Burst online: a score race (RaceLink). Both players pop the very same balloons at
// the same time, each on their own device: the field is seeded from the lobby's seed (a new
// seed per game of a rematch) and has a fixed size, so different screens get identical
// balloons. Only scores cross the wire: "prog" { score, done, extra: { ammo } } a few times a
// second. When both are done, the higher score wins (a tie is possible).
// The host picks the pop style (air gun or pin) and the round length (30/45/60 s).

export interface BBSettings { style: PopStyle; length: number }
const GAME = 'balloon-burst';
const QUICK: BBSettings = { style: 'gun', length: 45 };
/** Every online field is this size (field px), whatever the screen; it is scaled to fit. */
export const ONLINE_FIELD = { w: 420, h: 760 };
/** The scene counts 3, 2, 1 before the balloons rise. */
const COUNTDOWN = 3;

/** The seed of game `g` (1, 2, … with rematches) of a match. Both sides compute the same. */
export const gameSeed = (seed: number, g: number) => (seed + (g - 1) * 0x9e3779b1) >>> 0;

export function OnlineBalloon({ onBack, code }: { onBack: () => void; code?: string }) {
  const { t, n } = useTx();
  const styleName = (s: PopStyle) => (s === 'gun' ? t('Air gun', 'বন্দুক') : t('Pin', 'আলপিন'));
  return (
    <OnlineLobby<BBSettings>
      game={GAME}
      title={t('Balloon Burst', 'বেলুন ফাটানো')}
      onBack={onBack}
      code={code}
      defaultSettings={QUICK}
      quickSettings={QUICK}
      describe={(s) => `${styleName(s.style)} · ${t(`${s.length} s`, `${n(s.length)} সেকেন্ড`)}`}
      Options={({ value, onChange }) => (
        <>
          <div className="opt-label">{t('How to pop', 'কীভাবে ফাটাবে')}</div>
          <Seg label={t('How to pop', 'কীভাবে ফাটাবে')} value={value.style} onChange={(v) => onChange({ ...value, style: v })} options={(['gun', 'pin'] as PopStyle[]).map((v) => ({ v, label: styleName(v) }))} />
          <div className="opt-label">{t('Round length', 'সময়')}</div>
          <Seg label={t('Round length', 'সময়')} value={value.length} onChange={(v) => onChange({ ...value, length: v })} options={[30, 45, 60].map((v) => ({ v, label: t(`${v} s`, `${n(v)} সেকেন্ড`) }))} />
        </>
      )}
      makeBot={(me, s, seed) => makeBalloonBot(me, s, seed)}
      Match={BBMatch}
      help={[
        t('You both get the very same balloons at the same time. The higher score wins.', 'দুজনেই একই সময়ে একই বেলুন পাবে। যার পয়েন্ট বেশি সে জিতবে।'),
        t("The bar at the top shows the other player's score live.", 'ওপরের বারে অন্যজনের পয়েন্ট সাথে সাথে দেখা যায়।'),
      ]}
    />
  );
}

/** One RaceLink per game of a match, kept outside React so a development double render never makes two. */
class Races {
  game = 1;
  race: RaceLink;
  constructor(private peer: Peer) { this.race = new RaceLink(peer); }
  next() { this.race.dispose(); this.game++; this.race = new RaceLink(this.peer); return this.race; }
  dispose() { this.race.dispose(); }
}
const racesFor = new WeakMap<Peer, Races>();
function useRaces(peer: Peer): Races {
  let r = racesFor.get(peer);
  if (!r) { r = new Races(peer); racesFor.set(peer, r); }
  return r;
}

type Phase = 'wait' | 'play' | 'done';

function BBMatch({ peer, settings, seed, onLeave }: MatchProps<BBSettings>) {
  const x = useTx();
  const { t, n } = x;
  const bt = useT(S);
  const races = useRaces(peer);
  const [game, setGame] = useState(races.game);
  const [race, setRace] = useState(races.race);
  const [phase, setPhase] = useState<Phase>('wait');
  const [scene, setScene] = useState<BalloonScene | null>(null);
  const [mine, setMine] = useState<{ score: number; ammo: number; counting: boolean }>({ score: 0, ammo: pelletsFor(settings.length), counting: true });
  const [myFinal, setMyFinal] = useState<Scorer | null>(null);
  const [opp, setOpp] = useState<RaceProgress>({ score: 0, done: false });
  const gone = useOppGone(peer);
  const recorded = useRef(0);
  const gun = settings.style === 'gun';
  useGameBar({ help: <ol><li>{t('You both get the very same balloons at the same time. The higher score wins.', 'দুজনেই একই সময়ে একই বেলুন পাবে। যার পয়েন্ট বেশি সে জিতবে।')}</li><li>{bt(gun ? 'g1' : 'r1')}</li><li>{bt('r2')}</li><li><b>{bt('r4')}</b></li></ol> }, [x.lang]);
  useRealUnmount(() => { races.dispose(); racesFor.delete(peer); peer.close(); });

  // This game's race: show the other player's progress, and start the balloons on "go".
  useEffect(() => {
    const offOpp = race.onOpp((p) => setOpp({ ...p }));
    const offStart = race.onStart(() => {
      const colorName: Record<BColor, string> = { red: bt('red'), yellow: bt('yellow'), green: bt('green'), blue: bt('blue'), pink: bt('pink'), orange: bt('orange') };
      const sc = new BalloonScene('solo', 'medium', settings.length, {
        pop: bt('pop'), miss: bt('miss'), cloud: bt('cloud'), time: bt('time'), colorName, targetFmt: (c) => bt('target', { c }),
        num: (v) => bt.n(v), players: [t('You', 'তুমি')],
        pellets: bt('pellets'), bonus: bt('bonus', { b: GOLD_BONUS }), empty: bt('empty'), hint: bt('hint'),
      }, settings.style, gameSeed(seed, races.game), { field: ONLINE_FIELD, clock: false });
      setScene(sc);
      setPhase('play');
    });
    race.ready();
    return () => { offOpp(); offStart(); };
  }, [race]); // eslint-disable-line react-hooks/exhaustive-deps

  // Play: sounds, my progress a few times a second, and "done" at the end.
  useEffect(() => {
    if (!scene) return;
    let done = false;
    const progress = () => {
      const f = scene.fields[0];
      if (!f) return null;
      return { score: f.scorers[0].score, ammo: scene.lanes[0]?.gun?.ammo ?? 0 };
    };
    scene.onEvent = (e: BalloonEvent) => {
      if (e.type === 'go') sfx('whistle');
      if (e.type === 'shot') { if (e.ok) { sfx('click', { pitch: 1.7, gain: 0.9 }); sfx('whoosh', { gain: 0.25 }); vibrate(12); } else sfx('tick', { gain: 0.6 }); }
      if (e.type === 'hit') {
        const r = e.r;
        if (r.type === 'pop') { sfx(r.b.kind === 'gold' ? 'popBig' : 'pop', { pitch: 0.85 + Math.random() * 0.3 }); vibrate(8); if (r.b.kind === 'gold') sfx('good'); }
        if (r.type === 'damage') sfx('boing');
        if (r.type === 'cloud') { sfx('splash'); vibrate([20, 30, 20]); }
        if (r.type === 'miss') sfx('click', { pitch: 0.6 });
      }
      if (e.type === 'over' && !done) {
        done = true;
        sfx('whistle');
        const p = progress()!;
        race.report({ score: p.score, done: true, extra: { ammo: p.ammo } });
        setMine({ ...p, counting: false });
        setMyFinal({ ...scene.fields[0].scorers[0] });
        setPhase('done');
      }
    };
    const iv = window.setInterval(() => {
      const p = progress();
      if (!p || done) return;
      setMine({ ...p, counting: scene.countdown > 0 });
      if (scene.countdown <= 0) race.report({ score: p.score, done: false, extra: { ammo: p.ammo } });
    }, 200);
    return () => { window.clearInterval(iv); scene.onEvent = undefined; };
  }, [scene, race]);

  // Test hook for the browser checks.
  useEffect(() => {
    if (!scene) return;
    const w = window as unknown as { __balloon?: BalloonScene };
    w.__balloon = scene;
    return () => { if (w.__balloon === scene) delete w.__balloon; };
  }, [scene]);

  const rematch = useRematch(peer, () => {
    const r = races.next();
    setGame(races.game);
    setRace(r);
    setScene(null);
    setPhase('wait');
    setMyFinal(null);
    setOpp({ score: 0, done: false });
    setMine({ score: 0, ammo: pelletsFor(settings.length), counting: true });
  });

  const finished = phase === 'done' && opp.done && myFinal !== null;
  const myScore = myFinal?.score ?? mine.score;
  const oppScore = mine.counting && phase !== 'done' ? 0 : opp.score;
  const outcome: 'win' | 'loss' | 'tie' = myScore > opp.score ? 'win' : myScore < opp.score ? 'loss' : 'tie';
  useEffect(() => {
    if (!finished || gone || recorded.current === game) return;
    recorded.current = game;
    recordResult(GAME, { outcome, records: { bestCombo: myFinal!.bestCombo } }, () => []);
    sfx(outcome === 'win' ? 'good' : outcome === 'loss' ? 'bad' : 'click');
  }, [finished, game]); // eslint-disable-line react-hooks/exhaustive-deps

  const lead = myScore - oppScore;
  const status = gone ? '' : opp.done ? t('Finished', 'শেষ করেছে') : phase === 'wait' ? t('Getting ready…', 'তৈরি হচ্ছে…') : t('Popping…', 'ফাটাচ্ছে…');
  const oppAmmo = typeof opp.extra?.ammo === 'number' ? opp.extra.ammo : null;

  return (
    <div className="bb-online" data-testid="online-match">
      <OppBar peer={peer} gone={gone} status={status} extra={
        <span className="bb-oppscore">
          <b data-testid="opp-score">{n(oppScore)}</b>
          {gun && oppAmmo !== null && !mine.counting && <small data-testid="opp-ammo">• {t(`${oppAmmo} pellets`, `${n(oppAmmo)}টা গুলি`)}</small>}
        </span>
      } />
      <div className={`bb-lead ${lead > 0 ? 'me' : lead < 0 ? 'them' : ''}`} data-testid="lead" aria-live="polite">
        <span>{t('You', 'তুমি')} <b data-testid="my-score">{n(myScore)}</b></span>
        <em>{lead > 0 ? t(`You lead by ${lead}`, `তুমি ${n(lead)} পয়েন্টে এগিয়ে`) : lead < 0 ? t(`${peer.them.name} leads by ${-lead}`, `${peer.them.name} ${n(-lead)} পয়েন্টে এগিয়ে`) : t('Level', 'সমান সমান')}</em>
      </div>
      <div className="bb-online-stage">
        {scene && <GameCanvas scene={scene} paused={false} label={bt('title')} />}
        {phase === 'wait' && !gone && (
          <div className="bb-online-note" data-testid="race-wait">
            <b>{t('Getting the balloons ready…', 'বেলুন সাজানো হচ্ছে…')}</b>
            <small>{gun ? t(`Air gun · ${settings.length} s`, `বন্দুক · ${n(settings.length)} সেকেন্ড`) : t(`Pin · ${settings.length} s`, `আলপিন · ${n(settings.length)} সেকেন্ড`)}</small>
          </div>
        )}
        {phase === 'done' && !opp.done && !gone && (
          <div className="bb-online-note" data-testid="race-waitopp">
            <b>{t(`Done! Your score: ${myScore}`, `শেষ! তোমার পয়েন্ট: ${n(myScore)}`)}</b>
            <small>{t(`Waiting for ${peer.them.name} to finish…`, `${peer.them.name} শেষ করার অপেক্ষা…`)}</small>
          </div>
        )}
      </div>
      {(finished || gone) && (
        <OnlineEnd
          title={outcome === 'tie' ? t('A draw!', 'ড্র!') : outcome === 'win' ? t('You win!', 'তুমি জিতেছ!') : t(`${peer.them.name} wins`, `${peer.them.name} জিতেছে`)}
          outcome={outcome}
          me={{ name: peer.me.name, team: peer.me.team, score: n(myScore) }} them={{ name: peer.them.name, team: peer.them.team, score: n(opp.score) }}
          lines={finished ? (
            <div className="bb-end" data-testid="final-scores">
              {myFinal && <p className="bb-end-meta">{bt('pops')}: {n(myFinal.pops)} · {bt('combo')}: {n(myFinal.bestCombo)}</p>}
            </div>
          ) : undefined}
          gone={gone && !finished} oppName={peer.them.name}
          rematch={gone ? undefined : rematch.state} onRematch={gone ? undefined : rematch.ask}
          onLeave={onLeave}
        />
      )}
    </div>
  );
}

// ---------- The stand-in ----------

/**
 * A score a fair player gets on this very field: the game's own computer player (easy or
 * medium) plays the field once, quickly, and a human factor is applied (the air gun's sway
 * and pellet flight cost a real hand more than the computer).
 */
export function fairScore(settings: BBSettings, fieldSeed: number, rng: Rng): number {
  const dt = 1 / 60;
  const f = new Field(ONLINE_FIELD.w, ONLINE_FIELD.h, createRng(fieldSeed), 1, settings.length, false);
  const ai = new BalloonAI(0, rng.chance(0.5) ? 'easy' : 'medium', createRng(rng.int(1, 2 ** 30)), ONLINE_FIELD.w, ONLINE_FIELD.h);
  const gun = settings.style === 'gun';
  let ammo = pelletsFor(settings.length);
  while (!f.over) {
    f.update(dt);
    if (gun && ammo <= 0) break;
    const r = ai.update(f, dt);
    if (gun && r && r.type !== 'ignored') { ammo--; if (r.type === 'pop' && r.b.kind === 'gold') ammo += GOLD_BONUS; }
  }
  const k = gun ? rng.range(0.72, 1.0) : rng.range(0.8, 1.08);
  return Math.max(0, Math.round(f.scorers[0].score * k));
}

/** Pellets left for the stand-in at progress k (0..1), spent a little unevenly. */
function botAmmo(settings: BBSettings, k: number) {
  const p = pelletsFor(settings.length);
  return Math.max(0, Math.round(p * (1 - Math.min(1, k * 1.04))));
}

export function balloonBrain(speed = 1) {
  return (end: BotEnd, ctx: { rng: Rng; settings: BBSettings; seed: number }) => {
    const rng = ctx.rng;
    const s = ctx.settings;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (ms: number, fn: () => void) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); };
    // The player's balloons rise after the 3-2-1, so the stand-in's progress is shifted by it.
    const shifted: BotEnd = {
      on: (type, cb) => end.on(type, cb),
      send: (type, data) => { if (type === 'prog') later((COUNTDOWN * 1000) / speed, () => end.send(type, data)); else end.send(type, data); },
    };
    let g = 1;
    const play = () => {
      const fieldSeed = gameSeed(ctx.seed, g);
      return raceBrain({
        seconds: s.length,
        final: (r) => fairScore(s, fieldSeed, r),
        extra: s.style === 'gun' ? (k) => ({ ammo: botAmmo(s, k) }) : undefined,
        speed,
      })(shifted, { rng });
    };
    let stop = play();
    let asked = false;
    const offRematch = end.on('rematch', () => {
      if (asked) return;
      asked = true;
      later(thinkMs(rng, 1, 2.4, speed), () => {
        stop();
        g += 1;
        stop = play();
        asked = false;
        end.send('rematch');
      });
    });
    return () => { stop(); offRematch(); timers.forEach((id) => clearTimeout(id)); timers.clear(); };
  };
}

export function makeBalloonBot(me: Profile, settings: BBSettings, seed?: number, speed = 1): Peer {
  return makeBotPeer(me, { settings, seed, brain: balloonBrain(speed), speed });
}
