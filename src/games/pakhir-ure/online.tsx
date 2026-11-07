import { useEffect, useRef, useState } from 'react';
import { useT } from '../../platform/i18n';
import { sfx, speak, vibrate } from '../../platform/audio';
import { recordResult } from '../../platform/scores';
import { RaceLink, type RaceProgress } from '../../platform/net/race';
import { capturePointer } from '../../engine/timing';
import { Seg, useGameBar } from '../../components/ui';
import { MoveClock, OnlineEnd, OnlineLobby, OppBar, useMoveClock, useOppGone, useRealUnmount, useRematch, type MatchProps } from '../../components/online/OnlineLobby';
import { useTx } from '../../components/sport/SportKit';
import { artFor } from './items';
import { PakhirEngine } from './engine';
import { Finger, Rules, S } from './parts';
import { CALL_CHOICES, GAME, QUICK, makePakhirBot, progressOf, raceEngine, shownCall, type PUSettings } from './duel';
import './pakhir-ure.css';

// Online Pakhir Ure: a score race (see duel.ts). Both players hear the same calls, each on
// their own device. The other player's score and call number show live in their bar. With
// the lift finger input, a player who has not put the finger down within 10 seconds gets it
// put down for them, so the race always moves on.

const DOWN_SECONDS = 10;
const COUNTDOWN_MS = 1500;

export function OnlinePakhirUre({ onBack, code }: { onBack: () => void; code?: string }) {
  const { t, n } = useTx();
  const inputName = (s: PUSettings) => (s.input === 'lift' ? t('lift finger', 'আঙুল তোলা') : t('tap', 'ট্যাপ'));
  return (
    <OnlineLobby<PUSettings>
      game={GAME}
      title={t('Pakhir Ure', 'পাখি উড়ে')}
      onBack={onBack}
      code={code}
      defaultSettings={QUICK}
      quickSettings={QUICK}
      describe={(s) => t(`${s.calls} calls · ${inputName(s)}`, `${n(s.calls)}টা ডাক · ${inputName(s)}`)}
      Options={PUOptions}
      makeBot={(me, s, seed) => makePakhirBot(me, s, seed)}
      Match={PUMatch}
      help={[
        t('You both hear the same calls at the same time. The higher score at the end wins.', 'দুজনেই একই ডাক একই সময়ে শুনবে। শেষে যার পয়েন্ট বেশি, সে জিতবে।'),
        t(`Lift finger: put your finger down within ${DOWN_SECONDS} seconds, or it is put down for you.`, `আঙুল তোলা: ${n(DOWN_SECONDS)} সেকেন্ডের মধ্যে আঙুল রাখো, না হলে তোমার হয়ে রেখে দেওয়া হবে।`),
      ]}
    />
  );
}

function PUOptions({ value, onChange }: { value: PUSettings; onChange: (v: PUSettings) => void }) {
  const { t, n } = useTx();
  return (
    <>
      <Seg label={t('Calls', 'ডাক')} value={value.calls} onChange={(v) => onChange({ ...value, calls: v })} options={CALL_CHOICES.map((v) => ({ v, label: t(`${v} calls`, `${n(v)}টা ডাক`) }))} />
      <Seg label={t('Input', 'খেলার ধরন')} value={value.input} onChange={(v) => onChange({ ...value, input: v })} options={[{ v: 'lift' as const, label: t('Lift finger', 'আঙুল তোলা') }, { v: 'tap' as const, label: t('Tap', 'ট্যাপ') }]} />
    </>
  );
}

const ZERO: RaceProgress = { score: 0, done: false };

function PUMatch({ peer, settings, seed, onLeave }: MatchProps<PUSettings>) {
  const x = useTx();
  const tx = x.t;
  const t = useT(S);
  const [game, setGame] = useState(1);
  const [, setVersion] = useState(0);
  const [flashKey, setFlashKey] = useState(0);
  const [started, setStarted] = useState(false);
  const [counting, setCounting] = useState(false);
  const [opp, setOpp] = useState<RaceProgress>(ZERO);
  const gone = useOppGone(peer);
  const engine = useRef<PakhirEngine>(raceEngine(settings, seed, 1));
  const goAt = useRef(0);
  const gameRef = useRef(1);
  const recorded = useRef(0);
  const sentDone = useRef(0);
  const race = useRef<RaceLink | null>(null);
  const goneRef = useRef(gone);
  goneRef.current = gone;
  const now = () => performance.now();
  useGameBar({ help: <><Rules t={t} /><p>{tx('Same calls for both of you. Higher score wins.', 'দুজনের জন্য একই ডাক। যার পয়েন্ট বেশি, সে জিতবে।')}</p></> }, [x.lang]);

  /** A fresh race on the same connection: for the first game and every rematch. */
  const openRace = (g: number) => {
    race.current?.dispose();
    const r = new RaceLink(peer);
    race.current = r;
    gameRef.current = g;
    engine.current = raceEngine(settings, seed, g);
    setGame(g);
    setStarted(false);
    setOpp(ZERO);
    r.onOpp((p) => { if (race.current === r) setOpp(p); });
    r.onStart(() => {
      if (race.current !== r) return;
      goAt.current = now() + COUNTDOWN_MS;
      setStarted(true);
      setCounting(true);
      sfx('bell');
    });
    r.ready();
  };

  useEffect(() => {
    if (!race.current) openRace(1);
    (window as unknown as { __puOnline?: () => PakhirEngine }).__puOnline = () => engine.current;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useRealUnmount(() => { race.current?.dispose(); peer.close(); });

  // The game loop: animation frames, plus a slow timer so a hidden tab still finishes.
  useEffect(() => {
    if (!started) return;
    let raf = 0;
    let lastV = -1;
    const step = () => {
      const e = engine.current;
      if (goneRef.current) return;
      const tNow = now();
      if (tNow < goAt.current) return;
      setCounting(false);
      if (e.phase === 'over') return;
      e.tick(tNow);
      for (const ev of e.takeEvents()) {
        if (ev.type === 'call' && e.item) {
          sfx('tick');
          speak(`${e.item.name.bn} উড়ে`, `${e.item.name.en} flies`);
          setFlashKey((k) => k + 1);
        }
        if (ev.type === 'correct') { sfx(e.item?.flies ? 'flap' : 'good'); if (e.item?.flies) sfx('good', { gain: 0.6 }); }
        if (ev.type === 'wrong') { sfx('bad'); vibrate(60); }
      }
      if (e.version !== lastV) {
        lastV = e.version;
        setVersion(e.version);
        if (sentDone.current !== gameRef.current) {
          const p = progressOf(e);
          race.current?.report(p);
          if (p.done) sentDone.current = gameRef.current;
        }
      }
    };
    const loop = () => { raf = requestAnimationFrame(loop); step(); };
    raf = requestAnimationFrame(loop);
    const iv = window.setInterval(step, 250);
    return () => { cancelAnimationFrame(raf); clearInterval(iv); };
  }, [started, game]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard: Space or A, like the solo game.
  useEffect(() => {
    if (!started) return;
    const ok = (c: string) => c === 'Space' || c === 'KeyA';
    const kd = (ev: KeyboardEvent) => { if (!ok(ev.code) || ev.repeat) return; ev.preventDefault(); engine.current.press(0, now()); };
    const ku = (ev: KeyboardEvent) => { if (!ok(ev.code)) return; ev.preventDefault(); engine.current.release(0, now()); };
    addEventListener('keydown', kd);
    addEventListener('keyup', ku);
    return () => { removeEventListener('keydown', kd); removeEventListener('keyup', ku); };
  }, [started]);

  const e = engine.current;
  const me = e.players[0];
  const myDone = e.phase === 'over';
  const bothDone = myDone && opp.done;
  const needDown = started && !counting && settings.input === 'lift' && e.phase === 'ready' && !me.holding;
  const left = useMoveClock(needDown && !gone ? `${game}|${e.callIndex}` : '', DOWN_SECONDS, () => engine.current.press(0, now()));

  const rematch = useRematch(peer, () => openRace(gameRef.current + 1));

  useEffect(() => {
    if (recorded.current === game) return;
    if (!bothDone && !gone) return;
    recorded.current = game;
    const outcome = !bothDone ? 'win' : me.score > opp.score ? 'win' : me.score < opp.score ? 'loss' : 'tie';
    const fastest = me.rts.length ? Math.round(Math.min(...me.rts)) : undefined;
    recordResult(GAME, { outcome, records: fastest !== undefined ? { fastestMs: fastest } : {} }, () => {
      const ids: string[] = [];
      if (me.bestStreak >= 20) ids.push('pu-streak20');
      if (me.rts.some((r) => r < 350)) ids.push('pu-fast');
      return ids;
    });
    if (bothDone) { if (outcome === 'win') { sfx('good'); vibrate([20, 40, 20]); } else if (outcome === 'loss') sfx('bad'); }
  }, [bothDone, gone, game]); // eslint-disable-line react-hooks/exhaustive-deps

  const it = e.item;
  const showCall = started && (e.phase === 'call' || e.phase === 'reveal') && it;
  const oppCall = Number(opp.extra?.call ?? 0);
  const fb = me.feedback;
  const fbLabel = fb ? { lifted: t('ok'), held: t('held'), missed: t('missed'), fooled: t('fooled'), early: t('early') }[fb.reason] : '';
  const oppStatus = opp.done ? tx('Finished', 'শেষ করেছে') : started ? t('calls', { n: oppCall, m: settings.calls }) : tx('Getting ready…', 'তৈরি হচ্ছে…');
  const resultTitle = me.score === opp.score ? t('draw') : me.score > opp.score ? tx('You win!', 'তুমি জিতেছ!') : tx(`${peer.them.name} wins`, `${peer.them.name} জিতেছে`);

  return (
    <div className="pu-root playing n1 pu-online" data-testid="online-match">
      <OppBar peer={peer} gone={gone} status={oppStatus} extra={<b className="pu-opp-score" data-testid="opp-score">{x.n(opp.score)}</b>} />
      <div className="pu-board hud-chalk">
        <div className="pu-meta">
          <span>{t('level', { n: e.level })}</span>
          <span data-testid="my-call">{t('calls', { n: shownCall(e), m: settings.calls })}</span>
        </div>
        <div className="pu-call" aria-live="assertive" data-testid="call">
          {!started ? (
            <div className="pu-wait">{tx(`Waiting for ${peer.them.name}…`, `${peer.them.name}-এর অপেক্ষা…`)}</div>
          ) : counting ? (
            <div className="pu-wait">{t('getReady')}</div>
          ) : myDone ? (
            <div className="pu-wait pu-done" data-testid="my-done">
              {opp.done ? t('over') : tx(`Done! Waiting for ${peer.them.name} to finish…`, `শেষ! ${peer.them.name}-এর শেষ হওয়ার অপেক্ষা…`)}
            </div>
          ) : showCall ? (
            <div className="pu-bubble" key={flashKey}>
              {artFor(it.id) && <img src={artFor(it.id)} alt="" className="pu-art" draggable={false} />}
              <div>
                <div className="pu-name">{t.lang === 'bn' ? `${it.name.bn} উড়ে!` : `${it.name.en} ure!`}</div>
                <div className="pu-name-sub">{t.lang === 'bn' ? it.name.en : `${it.name.bn} উড়ে`}</div>
              </div>
            </div>
          ) : (
            <div className="pu-wait pu-wait-row">{needDown ? t('putDown') : t('getReady')}{needDown && !gone && <MoveClock left={left} seconds={DOWN_SECONDS} />}</div>
          )}
          {started && !myDone && e.phase === 'call' && <div className="pu-timer"><span style={{ animationDuration: `${e.windowMs}ms` }} key={flashKey} /></div>}
          {started && !myDone && e.phase === 'reveal' && it && (
            <div className={`pu-answer ${it.flies ? 'yes' : 'no'}`}>{it.flies ? t('flies') : t('noFly')}{it.note ? ` — ${t.bi(it.note)}` : ''}</div>
          )}
        </div>
      </div>

      <div className="pu-pads">
        <div className="pu-player">
          <div className="pu-stat">
            <b>{peer.me.name}</b>
            <span className="pts" data-testid="score-0">{t.n(me.score)}</span>
            {me.streak >= 3 && <span className="streak">×{t.n(me.streak)}</span>}
          </div>
          <div className="pu-fb-wrap">
            {fb && <span className={`pu-fb ${fb.ok ? 'ok' : 'bad'}`}>{fbLabel}{fb.rt !== undefined && fb.ok ? ` ${t('ms', { n: Math.round(fb.rt) })}` : ''}{fb.points ? ` +${t.n(fb.points)}` : ''}</span>}
          </div>
          <button
            className={`pu-pad ${settings.input} ${me.holding ? 'down' : 'up'}`}
            data-testid="pad-0"
            disabled={!started || myDone || gone}
            onPointerDown={(ev) => { ev.preventDefault(); capturePointer(ev); engine.current.press(0, now()); }}
            onPointerUp={() => engine.current.release(0, now())}
            onPointerCancel={() => engine.current.release(0, now())}
            onContextMenu={(ev) => ev.preventDefault()}
          >
            <Finger up={settings.input === 'lift' ? !me.holding : false} />
            <span className="pu-pad-label">{settings.input === 'lift' ? t('padLift') : t('padTap')}</span>
            <span className="key-hint hide-touch">Space</span>
          </button>
        </div>
      </div>

      {(bothDone || gone) && (
        <OnlineEnd
          title={resultTitle}
          lines={
            <>
              <p className="lede" data-testid="final-scores">{peer.me.name} {x.n(me.score)} · {peer.them.name} {x.n(opp.score)}</p>
              <p className="ol-meta">{t('correct')}: {t.n(me.correct)}/{t.n(me.correct + me.wrong)} · {t('streak')}: {t.n(me.bestStreak)}</p>
            </>
          }
          gone={gone && !bothDone} oppName={peer.them.name}
          rematch={gone ? undefined : rematch.state} onRematch={gone ? undefined : rematch.ask}
          onLeave={onLeave}
        />
      )}
    </div>
  );
}
