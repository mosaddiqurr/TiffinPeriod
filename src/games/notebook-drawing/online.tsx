import { useEffect, useRef, useState } from 'react';
import { sfx, vibrate } from '../../platform/audio';
import { recordResult } from '../../platform/scores';
import { Seg, useGameBar } from '../../components/ui';
import { MoveClock, OnlineEnd, OnlineLobby, OppBar, useOppGone, useRealUnmount, useRematch, type MatchProps } from '../../components/online/OnlineLobby';
import { useTx } from '../../components/sport/SportKit';
import { ScoreStrip } from '../bench-kit/BenchKit';
import { makeNotebookBot, QUICK } from './bot';
import { DRAW_SECONDS, LOCK_SECONDS, NDDuel, PICK_SECONDS, WORDS, type NDSettings, type NDView } from './duel';
import { COLORS, Khata, PAPER } from './khata';
import './notebook-drawing.css';

// Online Notebook Drawing: two players take turns to draw while the other guesses.
// The protocol and the rules are NDDuel (duel.ts); the quick-match stand-in is bot.ts.

const GAME = 'notebook-drawing';

export function OnlineNotebook({ onBack, code }: { onBack: () => void; code?: string }) {
  const { t, n } = useTx();
  return (
    <OnlineLobby<NDSettings>
      game={GAME}
      title={t('Notebook Drawing Battle', 'খাতায় আঁকাআঁকি')}
      onBack={onBack}
      code={code}
      defaultSettings={QUICK}
      quickSettings={QUICK}
      describe={(s) => t(`${s.each} drawings each`, `প্রত্যেকে ${n(s.each)}টা করে ছবি`)}
      Options={({ value, onChange }) => (
        <Seg label={t('Drawings each', 'প্রত্যেকে কয়টা ছবি আঁকবে')} value={value.each} onChange={(v) => onChange({ each: v })} options={[2, 3].map((v) => ({ v, label: n(v) }))} />
      )}
      makeBot={(me, s, seed) => makeNotebookBot(me, s, seed)}
      Match={NDMatch}
      help={[
        t('Take turns: one draws a secret word, the other guesses it from the choices.', 'পালা করে: একজন গোপন শব্দটা আঁকবে, অন্যজন উত্তরগুলো থেকে ধরবে।'),
        t(`${DRAW_SECONDS} seconds for each drawing. The faster the right guess, the more points for both.`, `প্রতিটা ছবির জন্য ${n(DRAW_SECONDS)} সেকেন্ড। যত তাড়াতাড়ি ঠিক উত্তর, দুজনেরই তত বেশি পয়েন্ট।`),
      ]}
    />
  );
}

/** Seconds left until `deadline`, ticking. */
function useLeft(deadline: number, on: boolean): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!on) return;
    setNow(Date.now());
    const iv = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(iv);
  }, [deadline, on]);
  return Math.max(0, (deadline - now) / 1000);
}

function NDMatch({ peer, settings, onLeave }: MatchProps<NDSettings>) {
  const x = useTx();
  const { t, n } = x;
  const me = peer.host ? 0 : 1;
  const duelRef = useRef<NDDuel | null>(null);
  const [v, setV] = useState<NDView | null>(null);
  const [tool, setTool] = useState({ color: COLORS[0], eraser: false });
  const gone = useOppGone(peer);
  const recorded = useRef(0);
  const opp = peer.them.name;
  const names = me === 0 ? [peer.me.name, opp] : [opp, peer.me.name];

  useEffect(() => {
    // Made once (an effect, not during render, so React's practice runs make no second copy).
    if (!duelRef.current) {
      duelRef.current = new NDDuel(peer, me, settings);
      (window as unknown as { __ndOnline?: NDDuel }).__ndOnline = duelRef.current;
    }
    const d = duelRef.current;
    setV(d.view);
    const off = d.onChange(setV);
    return () => { off(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useRealUnmount(() => { duelRef.current?.dispose(); peer.close(); delete (window as unknown as { __ndOnline?: NDDuel }).__ndOnline; });

  useGameBar({ help: <ol>
    <li>{t('Take turns as the drawer. Pick one of three words and draw it. No letters or numbers!', 'পালা করে আঁকিয়ে হবে। তিনটা শব্দের একটা বেছে আঁকো। অক্ষর বা সংখ্যা লেখা যাবে না!')}</li>
    <li>{t(`The other player picks the answer. A wrong guess means waiting ${LOCK_SECONDS} seconds.`, `অন্যজন উত্তর বেছে নেবে। ভুল হলে ${n(LOCK_SECONDS)} সেকেন্ড থামতে হবে।`)}</li>
    <li>{t('A fast right guess gives more points, to the guesser and to the drawer.', 'যত তাড়াতাড়ি ঠিক উত্তর, ধরনেওয়ালা আর আঁকিয়ে দুজনেই তত বেশি পয়েন্ট।')}</li>
  </ol> }, [x.lang]);

  const rematch = useRematch(peer, () => { duelRef.current?.restart(); });

  // Sounds for what happens.
  const prev = useRef<NDView | null>(null);
  useEffect(() => {
    const p = prev.current;
    prev.current = v;
    if (!v || !p) return;
    if (p.phase !== v.phase) {
      if (v.phase === 'pick' && v.drawer === me) { sfx('bell'); vibrate(20); }
      if (v.phase === 'draw') sfx('whistle');
      if (v.phase === 'reveal') sfx(v.last?.got ? 'fanfare' : 'bad');
    }
    if (v.wrong.length > p.wrong.length && v.phase === 'draw') sfx('bad', { gain: 0.5 });
  }, [v, me]);

  useEffect(() => {
    if (!v || v.phase !== 'done' || recorded.current === v.g) return;
    recorded.current = v.g;
    const w = duelRef.current!.winner();
    recordResult(GAME, { outcome: w === null ? 'tie' : w === me ? 'win' : 'loss' }, () => []);
  }, [v?.phase, v?.g]); // eslint-disable-line react-hooks/exhaustive-deps

  const live = !!v && (v.phase === 'pick' || v.phase === 'draw');
  const left = useLeft(v?.deadline ?? 0, live && !gone);
  const [, force] = useState(0);
  // Re-render when a wrong-guess pause ends.
  useEffect(() => {
    if (!v || !v.lockUntil) return;
    const ms = v.lockUntil - Date.now();
    if (ms <= 0) return;
    const id = window.setTimeout(() => force((k) => k + 1), ms + 20);
    return () => window.clearTimeout(id);
  }, [v?.lockUntil]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!v) return <div className="sport-page nd-online" data-testid="online-match" />;
  const d = duelRef.current!;
  const iDraw = v.drawer === me;
  const word = (i: number) => x.bi(WORDS[i]);
  const done = v.phase === 'done';
  const locked = d.locked();
  const color = tool.eraser ? PAPER : tool.color;
  const width = tool.eraser ? 9 : 2.2;

  let status: string;
  if (v.phase === 'pick') status = iDraw ? t('Pick a word to draw', 'আঁকার জন্য একটা শব্দ বাছো') : t(`${opp} is choosing a word…`, `${opp} শব্দ বাছছে…`);
  else if (v.phase === 'draw') status = iDraw ? t(`Draw: ${word(v.word)}`, `আঁকো: ${word(v.word)}`) : v.sent ? t('Sent! Checking…', 'পাঠানো হলো! দেখা হচ্ছে…') : locked ? t('Not that! Wait a moment…', 'ওটা না! একটু থামো…') : t(`${opp} is drawing. What is it?`, `${opp} আঁকছে। এটা কী?`);
  else status = '';

  const oppState = done ? '' : v.phase === 'reveal' ? '' : iDraw ? (v.phase === 'draw' ? t('Guessing…', 'আন্দাজ করছে…') : t('Waiting', 'অপেক্ষায়')) : v.phase === 'pick' ? t('Choosing a word', 'শব্দ বাছছে') : t('Drawing…', 'আঁকছে…');

  const L = v.last;
  const revealLine = L && (L.got
    ? (iDraw ? t(`${opp} guessed it!`, `${opp} ধরে ফেলেছে!`) : t('You guessed it!', 'তুমি ধরে ফেলেছ!'))
    : t('Nobody got it this time.', 'এবার কেউ ধরতে পারেনি।'));
  const myPts = L ? (iDraw ? L.dp : L.gp) : 0;
  const oppPts = L ? (iDraw ? L.gp : L.dp) : 0;
  const w = done ? d.winner() : null;

  return (
    <div className="sport-page nd-online" data-testid="online-match" data-phase={v.phase} data-round={v.r} data-drawer={iDraw ? 'me' : 'them'}>
      <OppBar peer={peer} gone={gone} status={oppState} />
      <ScoreStrip names={names} scores={v.scores} active={done ? undefined : v.drawer} n={n} />
      <div className="nd-ostatus" aria-live="polite">
        <span className="nd-round">{t(`Drawing ${v.r + 1}/${v.rounds}`, `ছবি ${n(v.r + 1)}/${n(v.rounds)}`)}</span>
        <span className={`nd-otext ${iDraw && v.phase === 'draw' ? 'secret' : ''}`} data-testid="nd-status">{status}</span>
        {live && (iDraw || v.phase === 'draw') && <MoveClock left={left} seconds={v.phase === 'pick' ? PICK_SECONDS : DRAW_SECONDS} />}
      </div>
      <div className="nd-stage">
        <Khata
          className="nd-ocanvas"
          strokes={v.strokes}
          enabled={iDraw && v.phase === 'draw' && !gone}
          onBegin={([px, py]) => d.begin(color, width, px, py)}
          onMove={([px, py]) => d.point(px, py)}
          onEnd={() => undefined}
        />
        {v.phase === 'pick' && iDraw && !gone && (
          <div className="nd-float" data-testid="nd-pick">
            <b>{t('Pick a word to draw', 'আঁকার জন্য একটা শব্দ বাছো')}</b>
            <div className="nd-words">{v.choices.map((c, i) => <button key={c} className="btn big secondary" onClick={() => d.choose(i)} data-testid="nd-word">{word(c)}</button>)}</div>
          </div>
        )}
        {v.phase === 'reveal' && L && (
          <div className="nd-float" data-testid="nd-reveal">
            <b>{t(`It was: ${word(L.word)}`, `উত্তর: ${word(L.word)}`)}</b>
            <span>{revealLine}</span>
            {L.got && <span className="nd-pts">{t(`You +${myPts} · ${opp} +${oppPts}`, `তুমি +${n(myPts)} · ${opp} +${n(oppPts)}`)}</span>}
          </div>
        )}
      </div>
      {v.phase === 'draw' && iDraw && (
        <div className="nd-tools nd-otools">
          {COLORS.map((c) => <button key={c} className={`nd-color ${!tool.eraser && tool.color === c ? 'on' : ''}`} style={{ background: c }} aria-label={t('Pen colour', 'কলমের রং')} onClick={() => setTool({ color: c, eraser: false })} />)}
          <button className={`btn secondary ${tool.eraser ? 'on' : ''}`} onClick={() => setTool({ ...tool, eraser: !tool.eraser })}>{t('Eraser', 'রাবার')}</button>
          <button className="btn secondary" onClick={() => d.undo()}>{t('Undo', 'আগেরটা বাদ')}</button>
          <button className="btn secondary" onClick={() => d.clear()} data-testid="nd-clear">{t('Clear', 'মুছে ফেলো')}</button>
        </div>
      )}
      {v.phase === 'draw' && !iDraw && (
        <div className="nd-oopts">
          {v.opts.map((o) => {
            const bad = v.wrong.includes(o);
            return <button key={o} className={`btn secondary ${bad ? 'bad' : ''}`} disabled={bad || locked || v.sent || gone} onClick={() => { if (d.guess(o)) sfx('click'); }} data-testid="nd-opt" data-w={o}>{word(o)}</button>;
          })}
        </div>
      )}
      {v.phase === 'draw' && iDraw && v.wrong.length > 0 && (
        <p className="nd-tries">{t(`${opp} said:`, `${opp} বলেছে:`)} {v.wrong.map((o) => <s key={o}>{word(o)}</s>)}</p>
      )}
      {(done || gone) && (
        <OnlineEnd
          title={w === null ? t('A draw!', 'ড্র!') : w === me ? t('You win!', 'তুমি জিতেছ!') : t(`${opp} wins`, `${opp} জিতেছে`)}
          outcome={w === null ? 'tie' : w === me ? 'win' : 'loss'}
          me={{ name: peer.me.name, team: peer.me.team, score: n(v.scores[me]) }} them={{ name: opp, team: peer.them.team, score: n(v.scores[1 - me]) }}
          gone={gone && !done} oppName={opp}
          rematch={gone ? undefined : rematch.state} onRematch={gone ? undefined : rematch.ask}
          onLeave={onLeave}
        />
      )}
    </div>
  );
}
