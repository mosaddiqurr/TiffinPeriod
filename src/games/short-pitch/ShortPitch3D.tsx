import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import type { GameProps } from '../../platform/registry';
import { useT, type StringTable } from '../../platform/i18n';
import { UI } from '../../platform/strings';
import { useSettings } from '../../platform/settings';
import { recordResult, type Outcome } from '../../platform/scores';
import { sfx, unlockAudio } from '../../platform/audio';
import { capturePointer } from '../../engine/timing';
import { oversText } from '../../shared/cricket';
import { DifficultySeg, ModeSeg, Overlay, PauseMenu, ReportCard, Seg, useGameBar, usePlayerNames, type Difficulty, type Mode } from '../../components/ui';
import { ShortPitchGame, TEAM, type HudState, type ShotName, type SPResult } from './game';
import type { DType } from './sim';

// 3D Short-Pitch Cricket: the para game with a circular boundary where a
// six is out. React draws the setup sheet, the HUD and the touch controls;
// the match itself runs in ShortPitchGame (Three.js).

type K =
  | 'title' | 'lede' | 'r1' | 'r2' | 'r3' | 'r4' | 'r5' | 'r6' | 'keys'
  | 'overs' | 'wickets' | 'batFirst' | 'defend' | 'hit' | 'loft' | 'run' | 'bowl' | 'safe' | 'risky'
  | 'fast' | 'medium' | 'slow' | 'offspin' | 'legspin'
  | 'tapPitch' | 'bats' | 'bowls' | 'target' | 'need' | 'thisOver'
  | 'four' | 'sixOut' | 'caught' | 'bowled' | 'runOut' | 'run1' | 'runsN' | 'dot' | 'wide' | 'dropped' | 'break' | 'won' | 'tied'
  | 'perfect' | 'good' | 'early' | 'late' | 'edge' | 'miss'
  | 'noGl' | 'byRuns' | 'byWk' | 'batter' | 'fours' | 'best' | 'straight' | 'off' | 'leg' | 'stickHint' | 'swipeHint' | 'tip'
  | ShotName;

const S: StringTable<K> = {
  en: {
    title: 'Short-Pitch Cricket 3D',
    lede: 'The para field after school: a round ground, a tennis ball, a short pitch, and one strict law.',
    r1: 'Along the ground over the rope = FOUR. Over the rope in the air = OUT. A six is out!',
    r2: 'Caught, bowled and run out are out. Run between the wickets for 1, 2 or 3.',
    r3: 'Bat: hold the stick for the direction (up = straight, left = off side, right = leg side). Tap Hit, Loft or Block when the ball reaches you. Or swipe on the field to hit in that direction.',
    r4: 'Timing: early pulls the ball to the leg side, late pushes it to the off side or gives an edge.',
    r5: 'Bowl: choose the type, tap the pitch where the ball must land, then tap Bowl. No run-up: stand and bowl.',
    r6: 'Tap Run when there is time. Watch the small map at the top.',
    keys: 'Keyboard: arrows = direction · J = block · K or Space = hit · L = loft · R = run. Bowling: 1–5 = type, arrows = spot, Space = bowl.',
    overs: 'Overs', wickets: 'Wickets', batFirst: 'Who bats first?',
    defend: 'Block', hit: 'Hit', loft: 'Loft', run: 'Run', bowl: 'Bowl', safe: 'Safe', risky: 'Risky',
    fast: 'Fast', medium: 'Medium', slow: 'Slow', offspin: 'Off spin', legspin: 'Leg spin',
    tapPitch: 'Tap the pitch where the ball must land',
    bats: '{name} bats', bowls: '{name} bowls', target: 'Target {n}', need: 'Need {r} from {b}', thisOver: 'This over',
    four: 'FOUR!', sixOut: 'SIX IS OUT!', caught: 'CAUGHT!', bowled: 'BOWLED!', runOut: 'RUN OUT!', run1: '1 run', runsN: '{n} runs', dot: 'Dot ball', wide: 'Wide! +1', dropped: 'Dropped!',
    break: 'Innings break — target {n}', won: '{name} wins!', tied: 'Match tied!',
    perfect: 'Perfect!', good: 'Good', early: 'Early', late: 'Late', edge: 'Edged!', miss: 'Missed',
    noGl: 'This game needs 3D graphics (WebGL). Please try another browser or turn on hardware acceleration.',
    byRuns: '{name} won by {n} runs', byWk: '{name} won by {n} wickets', batter: 'Batter {n}', fours: 'Fours', best: 'Top batter',
    straight: 'straight', off: 'off', leg: 'leg', stickHint: 'Hold for direction', swipeHint: 'or swipe on the field',
    tip: 'Tap Hit when the ball reaches the bat. Hold the stick to choose the direction.',
    straightDrive: 'Straight drive', coverDrive: 'Cover drive', onDrive: 'On drive', squareCut: 'Square cut', pull: 'Pull shot',
    lateCut: 'Late cut', glance: 'Leg glance', edged: 'Off the edge!', defended: 'Blocked', lofted: 'In the air!',
  },
  bn: {
    title: 'শর্ট-পিচ ক্রিকেট ৩ডি',
    lede: 'স্কুল ছুটির পর পাড়ার মাঠ: গোল মাঠ, টেনিস বল, ছোট পিচ, আর একটা কড়া আইন।',
    r1: 'মাটি দিয়ে দড়ি পার হলে চার। উড়ে দড়ি পার হলে আউট — ছক্কা মানে আউট!',
    r2: 'ক্যাচ, বোল্ড আর রান আউট হলে আউট। দুই উইকেটের মাঝে দৌড়ে ১, ২ বা ৩ রান নাও।',
    r3: 'ব্যাট: স্টিক ধরে দিক ঠিক করো (ওপরে = সোজা, বাঁয়ে = অফ সাইড, ডানে = লেগ সাইড)। বল কাছে এলে মারো, উঁচিয়ে বা ঠেকাও চাপো। অথবা মাঠে আঙুল টেনে সেই দিকে মারো।',
    r4: 'সময়: আগে মারলে বল লেগ সাইডে যায়, দেরিতে মারলে অফ সাইডে যায় বা কানায় লাগে।',
    r5: 'বল: ধরন বেছে নাও, পিচে চাপো যেখানে বল পড়বে, তারপর ‘বল করো’ চাপো। দৌড়ে আসা নেই — দাঁড়িয়ে বল।',
    r6: 'সময় থাকলে ‘দৌড়’ চাপো। ওপরের ছোট মানচিত্রে চোখ রাখো।',
    keys: 'কী-বোর্ড: তীর = দিক · J = ঠেকাও · K বা Space = মারো · L = উঁচিয়ে · R = দৌড়। বল: ১–৫ = ধরন, তীর = জায়গা, Space = বল করো।',
    overs: 'ওভার', wickets: 'উইকেট', batFirst: 'আগে কে ব্যাট করবে?',
    defend: 'ঠেকাও', hit: 'মারো', loft: 'উঁচিয়ে', run: 'দৌড়', bowl: 'বল করো', safe: 'নিরাপদ', risky: 'ঝুঁকি',
    fast: 'জোরে', medium: 'মাঝারি', slow: 'আস্তে', offspin: 'অফ স্পিন', legspin: 'লেগ স্পিন',
    tapPitch: 'পিচে চাপো: বল কোথায় পড়বে',
    bats: '{name} ব্যাট করছে', bowls: '{name} বল করছে', target: 'লক্ষ্য {n}', need: '{b} বলে {r} রান লাগবে', thisOver: 'এই ওভার',
    four: 'চার!', sixOut: 'ছক্কা মানে আউট!', caught: 'ক্যাচ আউট!', bowled: 'বোল্ড!', runOut: 'রান আউট!', run1: '১ রান', runsN: '{n} রান', dot: 'ডট বল', wide: 'ওয়াইড! +১', dropped: 'ক্যাচ মিস!',
    break: 'ইনিংস বদল — লক্ষ্য {n}', won: '{name} জিতেছে!', tied: 'ম্যাচ টাই!',
    perfect: 'নিখুঁত!', good: 'ভালো', early: 'আগে', late: 'দেরিতে', edge: 'কানায় লেগেছে!', miss: 'ফসকে গেছে',
    noGl: 'এই খেলার জন্য ৩ডি গ্রাফিক্স (WebGL) লাগে। অন্য ব্রাউজারে চেষ্টা করো।',
    byRuns: '{name} {n} রানে জিতেছে', byWk: '{name} {n} উইকেটে জিতেছে', batter: 'ব্যাটার {n}', fours: 'চার', best: 'সেরা ব্যাটার',
    straight: 'সোজা', off: 'অফ', leg: 'লেগ', stickHint: 'ধরে রেখে দিক ঠিক করো', swipeHint: 'অথবা মাঠে আঙুল টানো',
    tip: 'বল ব্যাটের কাছে এলে ‘মারো’ চাপো। স্টিক ধরে দিক ঠিক করো।',
    straightDrive: 'সোজা ড্রাইভ', coverDrive: 'কভার ড্রাইভ', onDrive: 'অন ড্রাইভ', squareCut: 'স্কয়ার কাট', pull: 'পুল শট',
    lateCut: 'লেট কাট', glance: 'লেগ গ্লান্স', edged: 'ব্যাটের কানায়!', defended: 'ঠেকিয়ে দিল', lofted: 'উড়ে যাচ্ছে!',
  },
};

const TYPES: DType[] = ['fast', 'medium', 'slow', 'offspin', 'legspin'];

interface Done { r: SPResult; outcome: Outcome; newBest: boolean }

export default function ShortPitch3D({ onExit }: GameProps) {
  const t = useT(S);
  const u = useT(UI);
  const st = useSettings();
  const [n1, n2] = usePlayerNames();
  const [mode, setMode] = useState<Mode>('ai');
  const [diff, setDiff] = useState<Difficulty>('medium');
  const [overs, setOvers] = useState(2);
  const [wickets, setWickets] = useState(3);
  const [first, setFirst] = useState<0 | 1>(0);
  const [matchId, setMatchId] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hud, setHud] = useState<HudState | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [glError, setGlError] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<ShortPitchGame | null>(null);
  const names: [string, string] = mode === 'ai' ? [u('you'), u('computer')] : [n1, n2];
  const cfgRef = useRef({ mode, diff, overs, wickets, first, names });
  cfgRef.current = { mode, diff, overs, wickets, first, names };

  const rules = [t('r1'), t('r2'), t('r3'), t('r4'), t('r5'), t('r6')];
  const help = <><ol>{rules.map((r, i) => <li key={i}>{r}</li>)}</ol><p className="hide-touch" style={{ fontSize: 14, color: 'var(--ink-soft)' }}>{t('keys')}</p></>;

  const start = useCallback(() => {
    unlockAudio();
    sfx('bell', { gain: 0.6 });
    setDone(null);
    setHud(null);
    setPaused(false);
    setMatchId((m) => m + 1);
  }, []);

  // One engine per match. The cleanup frees the WebGL context.
  useEffect(() => {
    if (matchId === 0 || !hostRef.current) return;
    const c = cfgRef.current;
    let g: ShortPitchGame;
    try {
      g = new ShortPitchGame(hostRef.current, {
        mode: c.mode === 'local2p' ? 'local2p' : 'ai', diff: c.diff, overs: c.overs, wickets: c.wickets, first: c.first, reducedMotion: st.reducedMotion,
      }, {
        onHud: setHud,
        onHidden: () => setPaused(true),
        onOver: (r) => {
          const vsAI = c.mode === 'ai';
          const w = r.winnerSide;
          const outcome: Outcome = vsAI ? (w === null ? 'tie' : w === 0 ? 'win' : 'loss') : w === null ? 'tie' : 'none';
          const own = r.battingFirst === 0 ? 0 : 1;
          const rec = recordResult('short-pitch', { outcome, score: vsAI ? r.innings[own].runs : undefined }, () => (vsAI && w === 0 ? ['sp-win'] : []));
          setDone({ r, outcome, newBest: rec.newBest });
        },
      });
    } catch (err) {
      console.error('[short-pitch] WebGL failed', err);
      setGlError(true);
      return;
    }
    gameRef.current = g;
    g.setMinimap(mapRef.current);
    (window as unknown as { __shortPitch?: ShortPitchGame }).__shortPitch = g;
    return () => {
      g.dispose();
      if (gameRef.current === g) gameRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  useEffect(() => { gameRef.current?.setPaused(paused); }, [paused]);

  useGameBar({ onPause: matchId > 0 && !done ? () => setPaused(true) : undefined, help }, [matchId, !!done, st.lang]);

  if (matchId === 0) {
    return (
      <div className="sp-root">
        <Overlay label={t('title')}>
          <div className="sheet ruled" data-testid="setup">
            <h2>{t('title')}</h2>
            <p className="lede">{t('lede')}</p>
            <ol>{rules.map((r, i) => <li key={i}>{r}</li>)}</ol>
            <ModeSeg value={mode} onChange={setMode} modes={['ai', 'local2p']} />
            {mode === 'ai' && <DifficultySeg value={diff} onChange={setDiff} />}
            <div className="opt-label">{t('overs')}</div>
            <Seg label={t('overs')} value={overs} onChange={setOvers} options={[1, 2, 3, 5].map((v) => ({ v, label: t.n(v) }))} />
            <div className="opt-label">{t('wickets')}</div>
            <Seg label={t('wickets')} value={wickets} onChange={setWickets} options={[2, 3, 5].map((v) => ({ v, label: t.n(v) }))} />
            <div className="opt-label">{t('batFirst')}</div>
            <Seg label={t('batFirst')} value={first} onChange={setFirst} options={[{ v: 0 as const, label: names[0] }, { v: 1 as const, label: names[1] }]} />
            <p className="hide-touch" style={{ margin: '10px 0 0', fontSize: 14, color: 'var(--ink-soft)' }}>{t('keys')}</p>
            <div className="actions"><button className="btn big" onClick={start} data-testid="start">{u('start')}</button></div>
          </div>
        </Overlay>
      </div>
    );
  }

  const g = gameRef.current;
  const h = hud;
  const batName = h ? names[h.batSide] : '';
  const bowlName = h ? names[1 - (h?.batSide ?? 0)] : '';
  const showBowl = !!h && h.humanBowls && h.phase === 'pick';
  const showBat = !!h && h.humanBats && !showBowl && h.phase !== 'break' && h.phase !== 'done';
  const sc = h ? h.scores[h.inn] : null;

  return (
    <div className="sp-root playing">
      <div className="sp-host" ref={hostRef} />
      <canvas className="sp-map" ref={mapRef} aria-hidden="true" />
      {glError && (
        <Overlay label={t('title')}>
          <div className="sheet ruled"><h2>{t('title')}</h2><p>{t('noGl')}</p><div className="actions"><button className="btn" onClick={onExit}>{u('quit')}</button></div></div>
        </Overlay>
      )}
      {h && sc && (
        <>
          <div className="sp-score" data-testid="sp-score" style={{ ['--team' as string]: TEAM[h.batSide].shirt }}>
            <div className="sp-team">{batName}</div>
            <div className="sp-big"><b data-testid="sp-runs">{t.n(sc.runs)}/{t.n(sc.wickets)}</b><span>({t.n(oversText(sc.balls))}/{t.n(overs)})</span></div>
            {h.target !== null && h.need && <div className="sp-need">{h.need.runs > 0 ? t('need', { r: h.need.runs, b: h.need.balls }) : t('target', { n: h.target })}</div>}
            <div className="sp-batters">
              <span>{t('batter', { n: h.striker.no })} <b>{t.n(h.striker.runs)}*</b> ({t.n(h.striker.balls)})</span>
              <span>{t('batter', { n: h.partner.no })} <b>{t.n(h.partner.runs)}</b> ({t.n(h.partner.balls)})</span>
            </div>
          </div>
          <div className="sp-over" aria-label={t('thisOver')}>
            {h.over.map((s, i) => <span key={i} className={`b ${s === 'W' ? 'w' : s === '4' ? 'f' : s === 'wd' ? 'x' : ''}`}>{s === 'W' || s === 'wd' || s === '•' ? s : t.n(s)}</span>)}
          </div>
          {h.current && <div className="sp-dtype">{t(h.current)}</div>}
          {h.banner && (
            <div key={h.banner.id} className={`sp-banner ${h.banner.kind} ${h.banner.small ? 'small' : ''}`} data-testid="sp-banner" role="status">
              {bannerText(h, t, names)}
            </div>
          )}
          {h.timing && h.humanBats && (h.phase === 'delivery' || h.phase === 'play' || h.phase === 'result') && (
            <div key={h.timing.id} className={`sp-timing t-${h.timing.t}`} data-testid="sp-timing">
              <div className="bar"><i style={{ left: `${50 + Math.max(-1, Math.min(1, h.timing.dt / 0.2)) * 46}%` }} /></div>
              <b>{t(h.timing.t)}</b>
            </div>
          )}
          {h.shotName && <div className="sp-turn shot" data-testid="sp-shotname">{t(h.shotName)}</div>}
          {h.tip && <div className="sp-tip" role="note">{t('tip')}</div>}
          {(h.phase === 'pick' || h.phase === 'windup') && <div className="sp-turn">{showBowl ? t('bowls', { name: bowlName }) : t('bats', { name: batName })}</div>}
        </>
      )}

      {showBat && h && (
        <div className="sp-controls bat">
          {h.phase === 'play' || h.phase === 'result' ? (
            <button
              className={`sp-btn run ${h.runSafe === true ? 'safe' : h.runSafe === false ? 'risky' : ''} ${h.running ? 'on' : ''}`}
              data-testid="sp-run" disabled={!h.canRun}
              onPointerDown={(e) => { e.preventDefault(); g?.run(); }}
              onContextMenu={(e) => e.preventDefault()}
            >
              {t('run')}{h.runSafe !== null && <small>{h.runSafe ? t('safe') : t('risky')}</small>}
            </button>
          ) : (
            <Stick onChange={(v) => g?.setStick(v)} labels={[t('straight'), t('off'), t('leg')]} hint={t('stickHint')} />
          )}
          <div className="sp-shots">
            <ShotBtn cls="loft" label={t('loft')} k="L" onPress={() => g?.shot('loft')} disabled={!h.canShot} testid="sp-loft" />
            <ShotBtn cls="defend" label={t('defend')} k="J" onPress={() => g?.shot('defend')} disabled={!h.canShot} testid="sp-defend" />
            <ShotBtn cls="hit" label={t('hit')} k="K" onPress={() => g?.shot('ground')} disabled={!h.canShot} testid="sp-hit" />
          </div>
        </div>
      )}

      {showBowl && h && (
        <div className="sp-controls bowl">
          <div className="sp-hint">{t('tapPitch')}</div>
          <div className="sp-types" role="group" aria-label={t('bowl')}>
            {TYPES.map((ty, i) => (
              <button key={ty} type="button" className="sp-chip" aria-pressed={h.dtype === ty} data-testid={`sp-type-${ty}`} onClick={() => g?.pickType(ty)}>
                {t(ty)}<span className="key-hint hide-touch">{i + 1}</span>
              </button>
            ))}
          </div>
          <button className="sp-btn bowl-btn" data-testid="sp-bowl" onClick={() => g?.bowl()}>{t('bowl')}</button>
        </div>
      )}

      {paused && !done && <PauseMenu onResume={() => setPaused(false)} onRestart={start} onQuit={onExit} help={help} />}
      {done && <Result d={done} names={names} overs={overs} t={t} onAgain={start} onSetup={() => { setMatchId(0); setDone(null); setHud(null); }} onQuit={onExit} />}
    </div>
  );
}

type Tr = ReturnType<typeof useT<K>>;

function bannerText(h: HudState, t: Tr, names: [string, string]) {
  const b = h.banner!;
  switch (b.key) {
    case 'runs': return (b.n ?? 0) === 1 ? t('run1') : t('runsN', { n: b.n ?? 0 });
    case 'break': return t('break', { n: b.n ?? 0 });
    case 'won': return t('won', { name: names[b.side ?? 0] });
    default: return t(b.key);
  }
}

function ShotBtn({ cls, label, k, onPress, disabled, testid }: { cls: string; label: string; k: string; onPress: () => void; disabled: boolean; testid: string }) {
  return (
    <button
      className={`sp-btn shot ${cls}`} data-testid={testid} aria-disabled={disabled}
      onPointerDown={(e) => { e.preventDefault(); capturePointer(e); onPress(); }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}<span className="key-hint hide-touch">{k}</span>
    </button>
  );
}

/** The direction stick: up = straight, left = off side, right = leg side. */
function Stick({ onChange, labels, hint }: { onChange: (v: { x: number; y: number } | null) => void; labels: [string, string, string]; hint: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useRef<number | null>(null);
  const [knob, setKnob] = useState<{ x: number; y: number } | null>(null);
  const move = (e: RPointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const R = r.width / 2;
    let x = (e.clientX - (r.left + R)) / R, y = (e.clientY - (r.top + R)) / R;
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    setKnob({ x, y });
    onChange(m < 0.25 ? null : { x, y });
  };
  const end = (e: RPointerEvent) => {
    if (id.current !== e.pointerId) return;
    id.current = null;
    setKnob(null);
    onChange(null);
  };
  const cbRef = useRef(onChange);
  cbRef.current = onChange;
  useEffect(() => () => cbRef.current(null), []);
  return (
    <div
      className={`sp-stick ${knob ? 'on' : ''}`} ref={ref} data-testid="sp-stick" aria-label={hint} role="slider" aria-valuetext={knob ? `${Math.round(Math.atan2(-knob.x, -knob.y) * 57)}°` : '0'}
      onPointerDown={(e) => { e.preventDefault(); capturePointer(e); id.current = e.pointerId; move(e); }}
      onPointerMove={(e) => { if (id.current === e.pointerId) move(e); }}
      onPointerUp={end} onPointerCancel={end}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="lbl top">↑ {labels[0]}</span>
      <span className="lbl left">{labels[1]}</span>
      <span className="lbl right">{labels[2]}</span>
      <div className="knob" style={knob ? { transform: `translate(${knob.x * 34}px, ${knob.y * 34}px)` } : undefined} />
    </div>
  );
}

function Result({ d, names, overs, t, onAgain, onSetup, onQuit }: { d: Done; names: [string, string]; overs: number; t: Tr; onAgain: () => void; onSetup: () => void; onQuit: () => void }) {
  const { r } = d;
  const side = (i: number) => (i === 0 ? r.battingFirst : 1 - r.battingFirst);
  const title = r.winnerSide === null ? t('tied') : t('won', { name: names[r.winnerSide] });
  const sub = r.winnerSide === null ? undefined : r.kind === 'runs' ? t('byRuns', { name: names[r.winnerSide], n: r.margin }) : t('byWk', { name: names[r.winnerSide], n: r.margin });
  const rows: Array<[string, string]> = [0, 1].map((i) => {
    const inn = r.innings[i];
    return [names[side(i)], `${t.n(inn.runs)}/${t.n(inn.wickets)} (${t.n(oversText(inn.balls))}/${t.n(overs)})`];
  });
  rows.push([t('fours'), `${names[0]} ${t.n(r.fours[0])} · ${names[1]} ${t.n(r.fours[1])}`]);
  const best = [0, 1].map((s) => ({ s, b: r.best[s] })).filter((x) => x.b).sort((a, b) => (b.b!.runs - a.b!.runs))[0];
  if (best?.b) rows.push([t('best'), `${names[best.s]} · ${t('batter', { n: best.b.no })} ${t.n(best.b.runs)} (${t.n(best.b.balls)})`]);
  return <ReportCard outcome={d.outcome} title={title} subtitle={sub} rows={rows} newBest={d.newBest} onAgain={onAgain} onSetup={onSetup} onQuit={onQuit} />;
}
