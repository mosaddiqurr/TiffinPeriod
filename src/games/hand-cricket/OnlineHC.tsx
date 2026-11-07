import { useEffect, useMemo, useRef, useState } from 'react';
import { sfx, vibrate } from '../../platform/audio';
import { recordResult } from '../../platform/scores';
import type { Peer } from '../../platform/net/rooms';
import { Overlay, Seg, useGameBar } from '../../components/ui';
import { OnlineEnd, OnlineLobby, useRealUnmount, type MatchProps } from '../../components/online/OnlineLobby';
import { ChaseHud, Flag, useTx } from '../../components/sport/SportKit';
import { ballsLeft, currentOver, oversText } from '../../shared/cricket';
import { getTeam } from '../../shared/teams';
import { Hand } from './Hand';
import { makeHandCricketBot, QUICK_SETUP } from './bot';
import { HCDuel, type DuelEvent, type DuelSetup, type DuelView } from './duel';
import { battingSide, limitsOf, other, targetOf, type Side } from './logic';

// Online 1v1 Hand Cricket: quick match, create a room (code + link), or join with a code.
// The match itself is HCDuel; the other end is a real player through InsForge, or, in quick
// match when nobody is waiting, the stand-in (bot.ts) on the same protocol.

const GAME = 'hand-cricket';
/** Seconds for each pick, call or choice. */
export const PICK_SECONDS = 10;

export function OnlineHandCricket({ onBack, code }: { onBack: () => void; code?: string }) {
  const { t, n } = useTx();
  return (
    <OnlineLobby<DuelSetup>
      game={GAME}
      title={t('Hand Cricket', 'হ্যান্ড ক্রিকেট')}
      onBack={onBack}
      code={code}
      sport="cricket"
      defaultSettings={QUICK_SETUP}
      quickSettings={QUICK_SETUP}
      describe={(s) => t(`${s.overs} over${s.overs > 1 ? 's' : ''} · ${s.wickets} wicket${s.wickets > 1 ? 's' : ''}`, `${n(s.overs)} ওভার · ${n(s.wickets)} উইকেট`)}
      Options={HCOptions}
      makeBot={(me, s, seed) => makeHandCricketBot(me, seed, 1, s)}
      Match={HCMatch}
      help={[t('Both players lock a number at the same time. Nobody can see or change it before both have picked. You have 10 seconds.', 'দুজনেই একসাথে সংখ্যা ঠিক করে। দুজনের বাছাই শেষ হওয়ার আগে কেউ দেখতে বা বদলাতে পারে না। সময় ১০ সেকেন্ড।')]}
    />
  );
}

function HCOptions({ value, onChange }: { value: DuelSetup; onChange: (v: DuelSetup) => void }) {
  const { t, n } = useTx();
  return (
    <>
      <Seg label={t('Overs', 'ওভার')} value={value.overs} onChange={(v) => onChange({ ...value, overs: v })} options={[1, 2, 5].map((v) => ({ v, label: t(`${v} ov`, `${n(v)} ওভার`) }))} />
      <Seg label={t('Wickets', 'উইকেট')} value={value.wickets} onChange={(v) => onChange({ ...value, wickets: v })} options={[1, 2, 3].map((v) => ({ v, label: t(`${v} wkt`, `${n(v)} উইকেট`) }))} />
    </>
  );
}

function HCMatch({ peer, settings, onLeave }: MatchProps<DuelSetup>) {
  return <OnlineMatch peer={peer} setup={settings} onLeave={onLeave} />;
}

// ---------- The match ----------

function OnlineMatch({ peer, setup, onLeave }: { peer: Peer; setup: DuelSetup; onLeave: () => void }) {
  const x = useTx();
  const { t, n } = x;
  const duel = useMemo(() => new HCDuel(peer, peer.host ? 0 : 1, setup), []); // eslint-disable-line react-hooks/exhaustive-deps
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
    return () => { offA(); offB(); offC(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useRealUnmount(() => { duel.dispose(); peer.close(); timers.current.forEach(clearTimeout); delete (window as unknown as { __hcOnline?: HCDuel }).__hcOnline; });

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

  // Ten seconds for each decision; when time runs out a random choice is made for you.
  const decide = !gone && !v.cheat && (canPick || (v.phase === 'call' && duel.iCall) || (v.phase === 'choose' && duel.iChoose));
  const clockKey = decide ? `${v.game}|${v.phase}|${v.step}` : '';
  const [left, setLeft] = useState(PICK_SECONDS);
  useEffect(() => {
    if (!clockKey) return;
    const t0 = Date.now();
    setLeft(PICK_SECONDS);
    const iv = window.setInterval(() => {
      const rest = PICK_SECONDS - (Date.now() - t0) / 1000;
      setLeft(Math.max(0, rest));
      if (rest <= 3 && rest > 2.9) sfx('tick', { gain: 0.5 });
      if (rest <= 0) {
        window.clearInterval(iv);
        const d = duel.view;
        if (d.phase === 'call') duel.callToss(Math.random() < 0.5 ? 'odd' : 'even');
        else if (d.phase === 'choose') duel.choose(Math.random() < 0.5);
        else if (d.myPick === null) { sfx('click'); void duel.pick(1 + Math.floor(Math.random() * 6)); setAuto(true); window.setTimeout(() => setAuto(false), 1600); }
      }
    }, 100);
    return () => window.clearInterval(iv);
  }, [clockKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const [auto, setAuto] = useState(false);
  const clock = decide ? <span className={`ol-clock ${left <= 3 ? 'low' : ''}`} data-testid="clock" style={{ ['--p' as string]: String(left / PICK_SECONDS) }}><b>{n(Math.ceil(left))}</b></span> : null;

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
          <span className="hc-pad-state">{auto ? t('Time up: picked for you', 'সময় শেষ: তোমার হয়ে বাছা হলো') : v.myPick !== null ? t('Locked ✓ · waiting', 'বাছাই হয়েছে ✓ · অপেক্ষা') : canPick ? t('Pick your number', 'সংখ্যা বাছো') : ''}</span>
          {canPick && clock}
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
              <h2>{t('Toss: odd or even?', 'টস: জোড় না বিজোড়?')} {clock}</h2>
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
            {v.tossWin === mySide && <p>{t('Choose within the time:', 'সময়ের মধ্যে বেছে নাও:')} {clock}</p>}
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
        <OnlineEnd
          title={v.cheat ? t('Connection problem. The match was stopped.', 'সংযোগে সমস্যা। খেলা থামানো হলো।') : winner === null ? t('A tie!', 'টাই!') : winner === mySide ? t('You win!', 'তুমি জিতেছ!') : t(`${names[oppSide]} wins`, `${names[oppSide]} জিতেছে`)}
          outcome={v.cheat ? 'none' : winner === null ? 'tie' : winner === mySide ? 'win' : 'loss'}
          {...(m && !v.cheat ? {
            me: { name: names[mySide], team: teams[mySide], score: `${n(m.innings[m.battingFirst === mySide ? 0 : 1].runs)}/${n(m.innings[m.battingFirst === mySide ? 0 : 1].wickets)}` },
            them: { name: names[oppSide], team: teams[oppSide], score: `${n(m.innings[m.battingFirst === oppSide ? 0 : 1].runs)}/${n(m.innings[m.battingFirst === oppSide ? 0 : 1].wickets)}` },
          } : {})}
          gone={gone && v.phase !== 'over' && !v.cheat} oppName={names[oppSide]}
          rematch={v.phase === 'over' && !gone && !v.cheat ? v.rematch : undefined}
          onRematch={v.phase === 'over' && !gone && !v.cheat ? () => duel.askRematch() : undefined}
          onLeave={onLeave}
        />
      ) : null}
    </div>
  );
}
