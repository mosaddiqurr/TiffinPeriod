import { useEffect, useRef, useState } from 'react';
import { recordResult } from '../../platform/scores';
import { sfx, unlockAudio } from '../../platform/audio';
import { readJSON, writeJSON } from '../../platform/storage';
import { Seg, useGameBar } from '../../components/ui';
import { MoveClock, OnlineEnd, OnlineLobby, OppBar, useMoveClock, useOppGone, useRealUnmount, useRematch, type MatchProps } from '../../components/online/OnlineLobby';
import { useTx } from '../../components/sport/SportKit';
import { KIT } from './desk3d';
import { PenFightGame, powerColor, type PFEnd, type PFHud } from './game';
import type { PenId } from './model';
import { PenArt, PenPick } from './parts';
import { FLICK_SECONDS, PICK_SECONDS, QUICK, gameSeed, gameStarter, makePenBot, type FlickMsg, type PenMsg, type PFSettings, type StateMsg } from './duel';
import './pen-fight.css';

// Pen Fight online. The host has the blue cap (side 0), the guest the red cap (side 1).
// Each player picks a pen first ("pen"); then PenFightGame plays side `me` here and the
// other side from the messages (see duel.ts for the protocol). 15 seconds a flick.

const GAME = 'pen-fight';

export function OnlinePenFight({ onBack, code }: { onBack: () => void; code?: string }) {
  const { t, n } = useTx();
  return (
    <OnlineLobby<PFSettings>
      game={GAME}
      title={t('Pen Fight', 'কলম যুদ্ধ')}
      onBack={onBack}
      code={code}
      defaultSettings={QUICK}
      quickSettings={QUICK}
      describe={(s) => t(`First to ${s.target} points`, `প্রথমে ${n(s.target)} পয়েন্ট`)}
      Options={({ value, onChange }) => (
        <Seg label={t('Points to win', 'জিততে পয়েন্ট')} value={value.target} onChange={(v) => onChange({ target: v })} options={[3, 5].map((v) => ({ v, label: t(`${v} points`, `${n(v)} পয়েন্ট`) }))} />
      )}
      makeBot={(me, s, seed) => makePenBot(me, s, seed)}
      Match={PFMatch}
      help={[
        t('Each player chooses a pen. The room creator has the blue cap.', 'দুজনেই নিজের কলম বাছবে। রুম যে খুলেছে তার নীল ঢাকনা।'),
        t(`${FLICK_SECONDS} seconds for each flick; if time runs out, a flick is made for you.`, `প্রতি টোকার জন্য ${n(FLICK_SECONDS)} সেকেন্ড; সময় শেষ হলে তোমার হয়ে টোকা দেওয়া হবে।`),
      ]}
    />
  );
}

type Msg = [string, FlickMsg | StateMsg];

function PFMatch({ peer, settings, seed, onLeave }: MatchProps<PFSettings>) {
  const x = useTx();
  const { t, n } = x;
  const me: 0 | 1 = peer.host ? 0 : 1;
  const opp = (1 - me) as 0 | 1;
  const names: [string, string] = me === 0 ? [peer.me.name, peer.them.name] : [peer.them.name, peer.me.name];
  const [pref] = useState<PenId>(() => { const p = readJSON<[PenId, PenId]>('pf.pens', ['classic', 'gel'])[0]; return p === 'gel' ? 'gel' : 'classic'; });
  const [choice, setChoice] = useState<PenId>(pref);
  const [myPen, setMyPen] = useState<PenId | null>(null);
  const [theirPen, setTheirPen] = useState<PenId | null>(null);
  const [g, setG] = useState(1);
  const gRef = useRef(g);
  gRef.current = g;
  const [hud, setHud] = useState<PFHud | null>(null);
  const [over, setOver] = useState<PFEnd | null>(null);
  const [glError, setGlError] = useState(false);
  const gone = useOppGone(peer);
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<PenFightGame | null>(null);
  /** Flicks and snapshots so far, so a game made a moment later (or made twice in development) sees them. */
  const log = useRef<Msg[]>([]);
  const recorded = useRef(0);

  useGameBar({ help: <p>{t('Touch your pen, pull back and let go. Knock the other pen off the desk; keep yours on.', 'নিজের কলমে আঙুল রাখো, পেছনে টেনে ছাড়ো। অন্যের কলম বেঞ্চ থেকে ফেলো, নিজেরটা রাখো।')}</p> }, [x.lang]);

  useEffect(() => {
    const offs = (['flick', 'state', 'aim'] as const).map((type) => peer.on(type, (d: FlickMsg | StateMsg) => {
      if (type !== 'aim') log.current.push([type, d]);
      gameRef.current?.remote(type, d);
    }));
    offs.push(peer.on('pen', (d: PenMsg) => { if (d && (d.pen === 'classic' || d.pen === 'gel')) setTheirPen((p) => p ?? d.pen); }));
    return () => offs.forEach((f) => f());
  }, [peer]);
  useRealUnmount(() => peer.close());

  const pick = (id: PenId) => {
    if (myPen) return;
    unlockAudio();
    sfx('click');
    setMyPen(id);
    peer.send('pen', { pen: id });
    const saved = readJSON<[PenId, PenId]>('pf.pens', ['classic', 'gel']);
    writeJSON('pf.pens', [id, saved[1] ?? 'gel']);
  };
  const pickLeft = useMoveClock(!myPen && !gone ? 'pen' : '', PICK_SECONDS, () => pick(choice));

  const ready = !!myPen && !!theirPen;
  useEffect(() => {
    if (!ready || !hostRef.current) return;
    const pens: [PenId, PenId] = me === 0 ? [myPen!, theirPen!] : [theirPen!, myPen!];
    let gm: PenFightGame;
    try {
      gm = new PenFightGame(hostRef.current, {
        mode: 'online', diff: 'easy', pens, target: settings.target, seed: gameSeed(seed, g),
        net: { me, g, starter: gameStarter(g), send: (type, d) => peer.send(type, d) },
      }, {
        onHud: setHud,
        onHidden: () => { /* online play never pauses */ },
        onOver: (e) => { window.setTimeout(() => setOver(e), 600); },
      });
    } catch (err) {
      console.error('[pen-fight] WebGL failed', err);
      setGlError(true);
      return;
    }
    gameRef.current = gm;
    (window as unknown as { __penFight?: PenFightGame }).__penFight = gm;
    if (g === 1) sfx('bell', { gain: 0.5 });
    for (const [type, d] of log.current) if (d.g === g) gm.remote(type, d);
    return () => {
      gm.dispose();
      if (gameRef.current === gm) gameRef.current = null;
    };
  }, [ready, g]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (gone) gameRef.current?.setPaused(true); }, [gone]);

  useEffect(() => {
    if (!over || recorded.current === g) return;
    recorded.current = g;
    recordResult(GAME, { outcome: over.winner === me ? 'win' : 'loss', score: over.scores[me] - over.scores[opp] }, () => []);
  }, [over, g]); // eslint-disable-line react-hooks/exhaustive-deps

  const rematch = useRematch(peer, () => {
    log.current = log.current.filter(([, d]) => d.g > gRef.current);
    setOver(null);
    setHud(null);
    setG(gRef.current + 1);
  });

  const h = hud;
  const myTurn = !!h && ready && h.phase === 'aim' && h.turn === me && !over && !gone;
  const left = useMoveClock(myTurn ? `${g}|${h!.seq}` : '', FLICK_SECONDS, () => gameRef.current?.autoFlick());
  const pw = h?.drag?.power ?? 0;
  const oppStatus = !ready
    ? theirPen ? t('Ready', 'তৈরি') : t('Choosing a pen…', 'কলম বাছছে…')
    : over ? '' : h?.phase === 'aim' && h.turn === opp ? t('Aiming…', 'তাক করছে…') : t('Waiting', 'অপেক্ষায়');
  const won = over ? over.winner === me : false;
  const penName = (id: PenId) => (id === 'gel' ? t('gel pen', 'জেল পেন') : t('classic ballpoint', 'সাদা বলপেন'));

  return (
    <div className="pf-root playing pf-online" data-testid="online-match">
      <div className="pf-host" ref={hostRef} />
      {glError && <div className="pf-nogl">{t('This game needs 3D graphics (WebGL). Please try another browser or turn on hardware acceleration.', 'এই খেলার জন্য ৩ডি গ্রাফিক্স (WebGL) লাগে। অন্য ব্রাউজারে চেষ্টা করো।')}</div>}
      <OppBar peer={peer} gone={gone} status={oppStatus} />
      {ready && (
        <div className="pf-hud" aria-live="polite">
          {[0, 1].map((i) => (
            <div key={i} className={`pf-chip ${h?.turn === i && h.phase === 'aim' ? 'on' : ''} ${i ? 'right' : ''}`} style={{ ['--cap' as string]: KIT[i].cap }} data-testid={`score-${i}`}>
              <PenArt id={(i === me ? myPen : theirPen)!} cap={KIT[i].cap} small />
              <span className="pf-name">{i === me ? t('You', 'তুমি') : names[i]}</span>
              <span className="pf-pips">{Array.from({ length: settings.target }, (_, j) => <i key={j} className={j < (h?.scores[i] ?? 0) ? 'on' : ''} />)}</span>
              <b>{n(h?.scores[i] ?? 0)}</b>
            </div>
          ))}
        </div>
      )}
      {h && ready && h.phase === 'aim' && !over && (
        <div className={`pf-turn ${h.turn !== me ? 'ai' : ''}`} style={{ ['--cap' as string]: KIT[h.turn].cap }} data-testid="turn">
          {h.turn === me ? t('Your turn', 'তোমার পালা') : t(`${peer.them.name} is aiming…`, `${peer.them.name} তাক করছে…`)}
          {myTurn && <MoveClock left={left} seconds={FLICK_SECONDS} />}
        </div>
      )}
      {myTurn && !h?.drag && <div className="pf-touch" data-testid="touch-hint"><span className="pf-hand" aria-hidden="true">👆</span>{t('Touch your pen · pull back · let go', 'কলমে আঙুল রাখো · পেছনে টানো · ছাড়ো')}</div>}
      {h?.drag && (
        <>
          {h.drag.x >= 0 && (
            <div className="pf-power-tag" style={{ left: h.drag.x, top: h.drag.y, ['--pc' as string]: powerColor(pw) }} data-testid="power-tag">
              <b>{n(Math.round(pw * 100))}%</b>
            </div>
          )}
          <div className="pf-power" data-testid="power-bar" style={{ ['--pc' as string]: powerColor(pw) }}>
            <span>{t('Power', 'জোর')}</span>
            <div className="pf-power-track"><div className="pf-power-fill" style={{ width: `${Math.round(pw * 100)}%` }} /><i style={{ left: '40%' }} /><i style={{ left: '75%' }} /></div>
            <b>{n(Math.round(pw * 100))}%</b>
          </div>
        </>
      )}
      {h?.phase === 'point' && h.point !== null && (
        <div className="pf-banner" style={{ ['--cap' as string]: KIT[h.point].cap }} data-testid="point">
          {h.selfOut && <small>{h.point === me ? t(`${peer.them.name}’s own pen fell!`, `${peer.them.name}-এর নিজের কলম পড়ে গেছে!`) : t('Your own pen fell!', 'তোমার নিজের কলম পড়ে গেছে!')}</small>}
          <b>{h.point === me ? t('Your point!', 'পয়েন্ট তোমার!') : t(`Point to ${peer.them.name}!`, `পয়েন্ট ${peer.them.name}-এর!`)}</b>
        </div>
      )}
      {!ready && !gone && (
        <div className="overlay" role="dialog" aria-modal="true" aria-label={t('Choose your pen', 'তোমার কলম বাছো')}>
          <div className="sheet ruled pf-pick" data-testid="pen-pick">
            <h2>{t('Choose your pen', 'তোমার কলম বাছো')}</h2>
            <p className="lede">{me === 0 ? t('Your pen has the blue cap.', 'তোমার কলমের ঢাকনা নীল।') : t('Your pen has the red cap.', 'তোমার কলমের ঢাকনা লাল।')} {t(`First to ${settings.target} points wins.`, `প্রথমে ${n(settings.target)} পয়েন্ট পেলে জয়।`)}</p>
            <PenPick label={t('Your pen', 'তোমার কলম')} cap={KIT[me].cap} value={myPen ?? choice} onChange={setChoice} testId={(id) => `pen-pick-${id}`} disabled={!!myPen} />
            <p className="pf-pick-opp" data-testid="opp-pen">
              {theirPen ? t(`${peer.them.name} chose the ${penName(theirPen)}.`, `${peer.them.name} ${penName(theirPen)} নিয়েছে।`) : t(`${peer.them.name} is choosing…`, `${peer.them.name} বাছছে…`)}
            </p>
            <div className="actions">
              {myPen
                ? <p className="ol-note">{t(`Waiting for ${peer.them.name}…`, `${peer.them.name}-এর অপেক্ষায়…`)}</p>
                : <><button className="btn big" onClick={() => pick(choice)} data-testid="pen-ready">{t('Ready', 'তৈরি')}</button><MoveClock left={pickLeft} seconds={PICK_SECONDS} /></>}
            </div>
          </div>
        </div>
      )}
      {(over || gone) && (
        <OnlineEnd
          title={won ? t('You win the pen fight!', 'তুমি কলম যুদ্ধে জিতেছ!') : t(`${peer.them.name} wins the pen fight`, `${peer.them.name} কলম যুদ্ধে জিতেছে`)}
          outcome={over ? (won ? 'win' : 'loss') : undefined}
          {...(over ? { me: { name: peer.me.name, score: n(over.scores[me]) }, them: { name: peer.them.name, score: n(over.scores[opp]) } } : {})}
          gone={gone && !over} oppName={peer.them.name}
          rematch={gone ? undefined : rematch.state} onRematch={gone ? undefined : rematch.ask}
          onLeave={onLeave}
        />
      )}
    </div>
  );
}
