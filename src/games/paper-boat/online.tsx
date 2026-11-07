import { useEffect, useMemo, useRef, useState } from 'react';
import { GameCanvas } from '../../engine/GameCanvas';
import { capturePointer } from '../../engine/timing';
import { createRng } from '../../engine/rng';
import { useT } from '../../platform/i18n';
import { useSettings } from '../../platform/settings';
import { recordResult } from '../../platform/scores';
import { RaceLink, type RaceProgress } from '../../platform/net/race';
import { Seg, useGameBar } from '../../components/ui';
import { OnlineEnd, OnlineLobby, OppBar, useOppGone, useRealUnmount, useRematch, type MatchProps } from '../../components/online/OnlineLobby';
import { useTx, type Tx } from '../../components/sport/SportKit';
import { BoatScene, S } from './scene';
import { COUNTDOWN_S, GAME, GRACE_S, LIMIT_S, QUICK, START_X, decide, makeBoatBot, makeCourse, progress, report, type BoatReport, type PBSettings } from './race';
import './paper-boat.css';

// Paper Boat online (protocol and stand-in: race.ts). Each player sails their own boat on
// the same stream; the other boat is a see-through ghost drawn from their reports.

export function OnlinePaperBoat({ onBack, code }: { onBack: () => void; code?: string }) {
  const { t } = useTx();
  const streamName = (s: PBSettings) => (s.stream === 'wild' ? t('Wild stream: more bricks and whirlpools', 'উত্তাল স্রোত: ইট আর ঘূর্ণি বেশি') : t('Normal stream', 'সাধারণ স্রোত'));
  return (
    <OnlineLobby<PBSettings>
      game={GAME}
      title={t('Paper Boat Race', 'কাগজের নৌকা')}
      onBack={onBack}
      code={code}
      defaultSettings={QUICK}
      quickSettings={QUICK}
      describe={streamName}
      Options={({ value, onChange }) => (
        <Seg label={t('Stream', 'স্রোত')} value={value.stream} onChange={(v) => onChange({ stream: v })} options={[{ v: 'normal' as const, label: t('Normal', 'সাধারণ') }, { v: 'wild' as const, label: t('Wild', 'উত্তাল') }]} />
      )}
      makeBot={(me, s, seed) => makeBoatBot(me, s, seed)}
      Match={BoatMatch}
      help={[
        t('You both sail the same stream at the same time. The other boat is the see-through one.', 'দুজনে একই সময়ে একই স্রোতে নৌকা চালাবে। স্বচ্ছ নৌকাটা অন্যজনের।'),
        t(`The faster boat wins. Once one boat finishes, the other has ${GRACE_S} seconds left.`, `যার নৌকা আগে পৌঁছাবে সে জিতবে। একজন পৌঁছালে অন্যজন আর ${GRACE_S} সেকেন্ড পাবে।`),
      ]}
    />
  );
}

/** How a boat's race went, in words. */
function said(r: BoatReport, x: Tx): string {
  if (r.st === 1) return x.t(`${(r.t / 100).toFixed(1)} s`, `${x.n((r.t / 100).toFixed(1))} সেকেন্ড`);
  if (r.st === 2) return x.t(`Sunk at ${Math.round(progress(r.y) / 10)}%`, `${x.n(Math.round(progress(r.y) / 10))}% গিয়ে ডুবে গেছে`);
  return x.t(`Did not finish (${Math.round(progress(r.y) / 10)}%)`, `পৌঁছাতে পারেনি (${x.n(Math.round(progress(r.y) / 10))}%)`);
}

function BoatMatch({ peer, settings, seed, onLeave }: MatchProps<PBSettings>) {
  const x = useTx();
  const { t, n } = x;
  const tx = useT(S);
  const st = useSettings();
  const [game, setGame] = useState(1);
  const [started, setStarted] = useState(false);
  const [mine, setMine] = useState<BoatReport | null>(null);
  const [theirs, setTheirs] = useState<BoatReport | null>(null);
  const [oppNow, setOppNow] = useState<BoatReport | null>(null);
  const [down, setDown] = useState({ left: false, right: false });
  const gone = useOppGone(peer);
  const recorded = useRef(0);
  const gameRef = useRef(game);
  gameRef.current = game;

  const scene = useMemo(() => new BoatScene(
    { mode: 'ai', diff: 'medium', opts: {}, names: [peer.me.name], reducedMotion: st.reducedMotion, lang: st.lang },
    tx, createRng(),
    { obstacles: makeCourse(seed, game, settings), startX: START_X, oppName: peer.them.name, limit: LIMIT_S, grace: GRACE_S },
  ), [game]); // eslint-disable-line react-hooks/exhaustive-deps

  useGameBar({ help: <ol>{[S[x.lang].r1, S[x.lang].r2, S[x.lang].r3, t('The see-through boat is the other player. The faster boat wins.', 'স্বচ্ছ নৌকাটা অন্য খেলোয়াড়ের। যার নৌকা আগে পৌঁছাবে সে জিতবে।')].map((r) => <li key={r}>{r}</li>)}</ol> }, [x.lang]);

  // One RaceLink per game. It is made a tick late, so React's practice mount in development
  // (mount, unmount, mount) never makes a link that swallows the other side's first messages.
  useEffect(() => {
    let race: RaceLink | null = null;
    let iv: number | undefined;
    let sentDone = false;
    let oppDone = false;
    let wallEnd = 0;
    const g = game;
    const tm = window.setTimeout(() => {
      race = new RaceLink(peer);
      race.onStart(() => { scene.go(); setStarted(true); wallEnd = Date.now() + (COUNTDOWN_S + LIMIT_S + 5) * 1000; });
      race.onOpp((p: RaceProgress) => {
        const e = p.extra as BoatReport | undefined;
        if (!e || e.g !== g) return;
        scene.setGhost(e.x, e.y, e.h / 100, e.st === 2);
        if (e.st === 1) { scene.oppFinished(); wallEnd = Math.min(wallEnd || Infinity, Date.now() + (GRACE_S + 3) * 1000); }
        setOppNow(e);
        if (p.done) { oppDone = true; setTheirs(e); if (sentDone) race?.dispose(); }
      });
      race.ready();
      iv = window.setInterval(() => {
        if (!race || !race.started || sentDone || scene.t <= 0) return;
        if (wallEnd && Date.now() > wallEnd) scene.forceEnd();
        const r = report(g, scene.me, scene.status, scene.t);
        const done = scene.status !== 0;
        race.report({ score: progress(r.y), done, extra: r });
        if (done) { sentDone = true; setMine(r); if (oppDone) race.dispose(); }
      }, 100);
    }, 0);
    return () => { clearTimeout(tm); clearInterval(iv); race?.dispose(); };
  }, [game]); // eslint-disable-line react-hooks/exhaustive-deps

  useRealUnmount(() => peer.close());

  // Steering: the two pads, and the arrow keys or A / D.
  const steer = (action: 'left' | 'right', on: boolean) => {
    scene.control(0, action, on);
    setDown((d) => (d[action] === on ? d : { ...d, [action]: on }));
  };
  useEffect(() => {
    const keys: Record<string, 'left' | 'right'> = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
    const kd = (e: KeyboardEvent) => { const a = keys[e.code]; if (!a) return; e.preventDefault(); if (!e.repeat) steer(a, true); };
    const ku = (e: KeyboardEvent) => { const a = keys[e.code]; if (!a) return; e.preventDefault(); steer(a, false); };
    addEventListener('keydown', kd);
    addEventListener('keyup', ku);
    return () => { removeEventListener('keydown', kd); removeEventListener('keyup', ku); };
  }, [scene]); // eslint-disable-line react-hooks/exhaustive-deps

  const over = !!(mine && theirs);
  const outcome = over ? decide(mine!, theirs!) : null;

  useEffect(() => {
    if (recorded.current === game) return;
    if (over) {
      recorded.current = game;
      recordResult(GAME, { outcome: outcome!, score: mine!.st === 1 ? mine!.t / 100 : undefined, lowerIsBetter: true }, () => []);
    } else if (gone) {
      recorded.current = game;
      recordResult(GAME, { outcome: 'win' }, () => []);
    }
  }, [over, gone, game]); // eslint-disable-line react-hooks/exhaustive-deps

  const rematch = useRematch(peer, () => {
    setGame(gameRef.current + 1);
    setStarted(false); setMine(null); setTheirs(null); setOppNow(null); setDown({ left: false, right: false });
  });

  const them = peer.them.name;
  const oppStatus = !started ? t('Getting ready…', 'তৈরি হচ্ছে…')
    : !oppNow ? t('On the start line', 'শুরুর দাগে')
    : oppNow.st === 1 ? t(`Finished · ${(oppNow.t / 100).toFixed(1)} s`, `পৌঁছে গেছে · ${n((oppNow.t / 100).toFixed(1))} সেকেন্ড`)
    : oppNow.st === 2 ? t('Sunk!', 'ডুবে গেছে!')
    : oppNow.st === 3 ? t('Out of time', 'সময় শেষ')
    : `${n(Math.round(progress(oppNow.y) / 10))}%`;
  const oppPct = oppNow ? progress(oppNow.y) / 10 : 0;

  let chip = '';
  if (!started && !gone) chip = t(`Waiting for ${them}…`, `${them}-এর অপেক্ষায়…`);
  else if (mine && !theirs && !gone) chip = (mine.st === 1 ? t('You made it! ', 'পৌঁছে গেছ! ') : mine.st === 2 ? t('Your boat sank. ', 'তোমার নৌকা ডুবে গেছে। ') : '') + t(`Waiting for ${them} to finish…`, `${them}-এর শেষ হওয়ার অপেক্ষা…`);

  const title = outcome === 'win' ? t('You win the boat race!', 'তোমার নৌকা জিতেছে!')
    : outcome === 'loss' ? t(`${them} wins the boat race`, `${them}-এর নৌকা জিতেছে`)
    : t('A dead heat!', 'একদম সমান সমান!');

  return (
    <div className="pb-online" data-testid="online-match">
      <OppBar peer={peer} gone={gone} status={oppStatus} extra={<span className="pb-opp-prog" aria-hidden="true"><i style={{ width: `${oppPct}%` }} /></span>} />
      <div className="pb-stage">
        <GameCanvas scene={scene} paused={false} label={t('Paper Boat Race', 'কাগজের নৌকা')} />
        {chip && <div className="pb-chip" role="status" data-testid="race-status">{chip}</div>}
        {!mine && !gone && (
          <div className="shell-pads">
            {(['left', 'right'] as const).map((a) => (
              <div key={a} className={`pad-area area-${a === 'left' ? 'bl' : 'br'}`}>
                <button
                  className={`touch-pad shell-pad size-l ${down[a] ? 'down' : ''}`}
                  style={{ background: 'rgba(192,57,43,0.85)' }}
                  data-testid={`pad-0-${a}`}
                  aria-label={tx(a)}
                  onPointerDown={(e) => { e.preventDefault(); capturePointer(e); steer(a, true); }}
                  onPointerUp={() => steer(a, false)}
                  onPointerCancel={() => steer(a, false)}
                  onContextMenu={(e) => e.preventDefault()}
                >
                  <span className="lbl">{tx(a)}</span>
                  <span className="key-hint hide-touch">{a === 'left' ? '← A' : '→ D'}</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      {(over || gone) && (
        <OnlineEnd
          title={title}
          outcome={outcome === 'win' || outcome === 'loss' || outcome === 'tie' ? outcome : undefined}
          lines={over ? (
            <div className="pb-end-lines" data-testid="race-lines">
              <p><b>{peer.me.name}</b> <span>{said(mine!, x)}</span></p>
              <p><b>{them}</b> <span>{said(theirs!, x)}</span></p>
            </div>
          ) : undefined}
          gone={gone && !over} oppName={them}
          rematch={gone ? undefined : rematch.state} onRematch={gone ? undefined : rematch.ask}
          onLeave={onLeave}
        />
      )}
    </div>
  );
}
