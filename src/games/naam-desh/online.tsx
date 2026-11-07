import { useEffect, useMemo, useRef, useState } from 'react';
import { sfx, vibrate } from '../../platform/audio';
import { recordResult } from '../../platform/scores';
import type { Profile } from '../../platform/net/rooms';
import { Seg, useGameBar } from '../../components/ui';
import { MoveClock, OnlineEnd, OnlineLobby, OppBar, useOppGone, useRealUnmount, useRematch, type MatchProps } from '../../components/online/OnlineLobby';
import { useTx, type Tx } from '../../components/sport/SportKit';
import { ScoreStrip } from '../bench-kit/BenchKit';
import { canReview, knownWord, type Letter } from './model';
import { LAST_SECONDS, NDDuel, QUICK, REVIEW_SECONDS, matchWinner, needsCheck, type NDSettings, type NDView } from './duel';
import { makeNaamDeshBot } from './bot';
import './naam-desh.css';

// Naam Desh Ful Fol online (protocol in duel.ts). Each round: the same letter for both, the
// four columns written at the same time, then both khatas side by side. Unknown words that
// start with the letter go to the other player to tick or cross.

const GAME = 'naam-desh';
const NEXT_SECONDS = 8;

const labelsOf = (t: Tx['t']) => [t('Name', 'নাম'), t('Country', 'দেশ'), t('Flower', 'ফুল'), t('Fruit', 'ফল')];

function NDOptions({ value, onChange }: { value: NDSettings; onChange: (v: NDSettings) => void }) {
  const { t, n } = useTx();
  return (
    <>
      <div className="opt-label">{t('Rounds', 'রাউন্ড')}</div>
      <Seg label={t('Rounds', 'রাউন্ড')} value={value.rounds} onChange={(v) => onChange({ ...value, rounds: v })} options={[3, 5].map((v) => ({ v, label: n(v) }))} />
      <div className="opt-label">{t('Seconds to write', 'লেখার সময় (সেকেন্ড)')}</div>
      <Seg label={t('Seconds to write', 'লেখার সময় (সেকেন্ড)')} value={value.seconds} onChange={(v) => onChange({ ...value, seconds: v })} options={[45, 60, 90].map((v) => ({ v, label: n(v) }))} />
    </>
  );
}

export function OnlineNaamDesh({ onBack, code }: { onBack: () => void; code?: string }) {
  const { t, n } = useTx();
  return (
    <OnlineLobby<NDSettings>
      game={GAME}
      title={t('Naam Desh Ful Fol', 'নাম দেশ ফুল ফল')}
      onBack={onBack}
      code={code}
      defaultSettings={QUICK}
      quickSettings={QUICK}
      describe={(s) => t(`${s.rounds} rounds · ${s.seconds} s each`, `${n(s.rounds)} রাউন্ড · প্রতিটায় ${n(s.seconds)} সেকেন্ড`)}
      Options={NDOptions}
      makeBot={(me: Profile, s, seed) => makeNaamDeshBot(me, s, seed)}
      Match={NDMatch}
      help={[
        t('You both get the same letter and write a name, a country, a flower and a fruit at the same time.', 'দুজনে একই অক্ষর পাবে, আর একসাথে নাম, দেশ, ফুল ও ফল লিখবে।'),
        t(`When one of you is done, the other has ${LAST_SECONDS} seconds left.`, `একজন শেষ করলে অন্যজন আর ${n(LAST_SECONDS)} সেকেন্ড পাবে।`),
        t('Words the game doesn’t know go to the other player to tick or cross. 10 points a word, 5 each for the same word.', 'খেলার অচেনা শব্দ অন্যজন টিক বা কাটা দেবে। প্রতি শব্দে ১০, দুজনের একই শব্দে ৫ করে।'),
      ]}
    />
  );
}

type Mark = 'ok' | 'no' | 'ask' | 'blank';
function markOf(letter: Letter, cat: number, w: string, verdict: boolean | null | undefined): Mark {
  if (!w.trim()) return 'blank';
  if (knownWord(letter, cat, w)) return 'ok';
  if (!canReview(letter, cat, w)) return 'no';
  return verdict == null ? 'ask' : verdict ? 'ok' : 'no';
}

function NDMatch({ peer, settings, seed, onLeave }: MatchProps<NDSettings>) {
  const x = useTx();
  const { t, n } = x;
  const duel = useMemo(() => new NDDuel(peer, peer.host ? 0 : 1, settings, seed), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [v, setV] = useState<NDView>(duel.view);
  const [left, setLeft] = useState(settings.seconds);
  const gone = useOppGone(peer);
  const recorded = useRef(0);
  const labels = labelsOf(t);
  const them = peer.them.name;
  useGameBar({ help: <p>{t('Same letter for both. Write all four columns before the bell.', 'দুজনের একই অক্ষর। ঘণ্টা বাজার আগে চার ঘর লেখো।')}</p> }, [x.lang]);

  useEffect(() => {
    const off = duel.onChange(setV);
    duel.attach();
    setV(duel.view);
    (window as unknown as { __ndOnline?: NDDuel }).__ndOnline = duel;
    return () => { off(); duel.detach(); };
  }, [duel]);
  useRealUnmount(() => { duel.dispose(); peer.close(); delete (window as unknown as { __ndOnline?: NDDuel }).__ndOnline; });

  // The clocks.
  useEffect(() => {
    if (gone) return;
    const iv = window.setInterval(() => { duel.tick(); setLeft(duel.secondsLeft()); }, 150);
    return () => window.clearInterval(iv);
  }, [duel, gone]);

  // Sounds for the moments that matter.
  const prev = useRef(v);
  useEffect(() => {
    const p = prev.current;
    if (!p.theirDone && v.theirDone && v.phase === 'write') { sfx('tick'); vibrate(30); }
    if (p.phase === 'write' && v.phase !== 'write') sfx('bell', { gain: 0.4 });
    if (p.phase !== 'review' && v.phase === 'review') sfx('page');
    if (p.phase === 'review' && (v.phase === 'between' || v.phase === 'over')) sfx('good');
    prev.current = v;
  }, [v]);

  // Between rounds: the next letter comes by itself after a few seconds.
  const [nextLeft, setNextLeft] = useState(NEXT_SECONDS);
  useEffect(() => {
    if (v.phase !== 'between' || gone) return;
    const t0 = Date.now();
    setNextLeft(NEXT_SECONDS);
    const iv = window.setInterval(() => {
      const rest = NEXT_SECONDS - (Date.now() - t0) / 1000;
      setNextLeft(Math.max(0, rest));
      if (rest <= 0) { window.clearInterval(iv); duel.next(); }
    }, 200);
    return () => window.clearInterval(iv);
  }, [v.phase, v.r, v.g, gone]); // eslint-disable-line react-hooks/exhaustive-deps

  const rematch = useRematch(peer, () => duel.restart());

  useEffect(() => {
    if (v.phase !== 'over' || recorded.current === v.g) return;
    recorded.current = v.g;
    const w = matchWinner(v.totals);
    recordResult(GAME, { outcome: w === 0 ? 'tie' : w === 1 ? 'win' : 'loss' });
  }, [v.phase, v.g]); // eslint-disable-line react-hooks/exhaustive-deps

  const names = [peer.me.name, them];
  const last = v.results[v.results.length - 1];
  const shownResult = (v.phase === 'between' || v.phase === 'over') && last ? last : null;
  const pending = v.theirs ? needsCheck(v.letter, v.theirs) : [];
  const oppStatus = v.phase === 'write' || v.phase === 'wait'
    ? (v.theirDone ? t('Done', 'শেষ') : t('Writing…', 'লিখছে…'))
    : v.phase === 'review' ? (v.theirReview ? t('Checked', 'যাচাই শেষ') : t('Checking your words…', 'তোমার শব্দ দেখছে…'))
    : t('Ready', 'প্রস্তুত');
  const w = matchWinner(v.totals);
  const secs = Math.ceil(left);

  const myCell = (cat: number) => {
    const word = shownResult ? shownResult.answers[0][cat] : v.mine[cat];
    const m = shownResult ? (word.trim() ? (shownResult.accepted[0][cat] ? 'ok' : 'no') : 'blank') : markOf(v.letter, cat, word, v.theirReview?.[cat]);
    return (
      <td data-testid={`mine-${cat}`}>
        <span className={`ndo-word ${m}`}>{word || '—'}</span>
        <small>{shownResult ? `${n(shownResult.points[0][cat])} ${t('pts', 'পয়েন্ট')}` : m === 'ask' ? t(`${them} is checking`, `${them} দেখছে`) : m === 'no' && word.trim() ? t('wrong letter', 'ভুল অক্ষর') : ''}</small>
      </td>
    );
  };
  const theirCell = (cat: number) => {
    const word = shownResult ? shownResult.answers[1][cat] : v.theirs?.[cat] ?? '';
    const asking = !shownResult && pending.includes(cat);
    const m = shownResult ? (word.trim() ? (shownResult.accepted[1][cat] ? 'ok' : 'no') : 'blank') : markOf(v.letter, cat, word, asking ? (v.sentReview ? v.checks[cat] ?? true : v.checks[cat]) : null);
    return (
      <td data-testid={`theirs-${cat}`}>
        <span className={`ndo-word ${m}`}>{word || '—'}</span>
        {asking && !v.sentReview && !gone ? (
          <span className="ndo-judge" role="group" aria-label={t(`Is “${word}” a real ${labels[cat].toLowerCase()}?`, `“${word}” কি সত্যিই ${labels[cat]}?`)}>
            <button type="button" className={`ndo-yes ${v.checks[cat] === true ? 'on' : ''}`} aria-pressed={v.checks[cat] === true} onClick={() => { sfx('click'); duel.check(cat, true); }} data-testid={`rev-ok-${cat}`}>✓ {t('OK', 'ঠিক')}</button>
            <button type="button" className={`ndo-no ${v.checks[cat] === false ? 'on' : ''}`} aria-pressed={v.checks[cat] === false} onClick={() => { sfx('click'); duel.check(cat, false); }} data-testid={`rev-no-${cat}`}>✗ {t('No', 'না')}</button>
          </span>
        ) : (
          <small>{shownResult ? `${n(shownResult.points[1][cat])} ${t('pts', 'পয়েন্ট')}` : m === 'no' && word.trim() && !asking ? t('wrong letter', 'ভুল অক্ষর') : ''}</small>
        )}
      </td>
    );
  };

  const sum = (a: number[]) => a.reduce((p, q) => p + q, 0);

  return (
    <div className="sport-page ndo" data-testid="online-match">
      <OppBar peer={peer} gone={gone} status={v.phase === 'over' ? '' : oppStatus} />
      <ScoreStrip names={names} scores={v.totals} n={n} />
      <div className="ndo-head">
        <div className="word-letter ndo-letter" data-testid="letter">{v.letter.bn}</div>
        <div className="ndo-headtext">
          <div className="bench-round" data-testid="round">{t('Round', 'রাউন্ড')} {n(v.r + 1)} / {n(duel.rounds)}</div>
          <div className="bench-note">{t('Roman hint', 'রোমান ইঙ্গিত')}: {v.letter.roman}</div>
          {v.phase === 'write' && <div className={`word-timer ${secs <= 10 ? 'urgent' : ''}`} role="timer" aria-label={t('Seconds remaining', 'বাকি সেকেন্ড')} data-testid="timer">{n(secs)} {t('sec', 'সেকেন্ড')}</div>}
        </div>
      </div>

      {v.phase === 'write' ? (
        <form onSubmit={(e) => { e.preventDefault(); if (!gone && duel.finish()) vibrate(15); }}>
          {v.theirDone && <p className="ndo-alert" role="status" data-testid="opp-done">{t(`${them} is done! Hurry: ${LAST_SECONDS} seconds at most.`, `${them} শেষ করেছে! তাড়াতাড়ি: বড়জোর ${n(LAST_SECONDS)} সেকেন্ড।`)}</p>}
          <div className="word-fields ndo-fields">
            {labels.map((label, cat) => (
              <label key={cat} htmlFor={`ndo-word-${cat}`}>{label}
                <input id={`ndo-word-${cat}`} className="text-in" data-testid={`word-${cat}`} autoComplete="off" autoCapitalize="off" spellCheck={false} maxLength={60} value={v.mine[cat]} disabled={gone} onChange={(e) => duel.setAnswer(cat, e.target.value)} />
              </label>
            ))}
          </div>
          <div className="bench-actions"><button className="btn big" type="submit" disabled={gone} data-testid="submit-words">{t('Done · close my khata', 'হয়েছে · খাতা বন্ধ করো')}</button></div>
        </form>
      ) : v.phase === 'wait' ? (
        <div className="ndo-wait" data-testid="round-wait">
          <h2>{t('Khata closed', 'খাতা বন্ধ')}</h2>
          <ul className="ndo-mine">{labels.map((label, cat) => <li key={cat}><b>{label}</b> {v.mine[cat] || '—'}</li>)}</ul>
          <div className="ol-pulse"><i /><i /><i /> {t(`Waiting for ${them} to finish…`, `${them} শেষ করার অপেক্ষা…`)}</div>
        </div>
      ) : (
        <div data-testid={shownResult ? 'round-end' : 'review'}>
          <div className="word-table-wrap">
            <table className="word-review ndo-table">
              <thead><tr><th>{t('Column', 'ঘর')}</th><th>{peer.me.name}</th><th>{them}</th></tr></thead>
              <tbody>{labels.map((label, cat) => <tr key={cat}><th>{label}</th>{myCell(cat)}{theirCell(cat)}</tr>)}</tbody>
              {shownResult && <tfoot><tr><th>{t('Round', 'রাউন্ড')}</th><td data-testid="round-mine"><b>{n(sum(shownResult.points[0]))}</b></td><td data-testid="round-theirs"><b>{n(sum(shownResult.points[1]))}</b></td></tr></tfoot>}
            </table>
          </div>
          {v.phase === 'review' && !v.sentReview && pending.length > 0 && !gone && (
            <div className="ndo-revbar">
              <p>{t(`Check ${them}’s words the game doesn’t know. Unchecked words count as OK.`, `${them}-এর অচেনা শব্দগুলো দেখো। না দেখলে ঠিক ধরা হবে।`)}</p>
              <div className="ndo-revrow">
                <MoveClock left={left} seconds={REVIEW_SECONDS} />
                <button className="btn big" onClick={() => duel.sendReview()} data-testid="send-review">{t('Send my checks', 'যাচাই পাঠাও')}</button>
              </div>
            </div>
          )}
          {v.phase === 'review' && (v.sentReview || !pending.length) && (
            <div className="ol-pulse ndo-pulse"><i /><i /><i /> {t(`${them} is checking your words…`, `${them} তোমার শব্দ দেখছে…`)}</div>
          )}
          {v.phase === 'between' && shownResult && (
            <div className="bench-actions">
              <button className="btn big" onClick={() => duel.next()} data-testid="next-round">{t('Next letter', 'পরের অক্ষর')} ({n(Math.ceil(nextLeft))})</button>
            </div>
          )}
        </div>
      )}

      {(v.phase === 'over' || gone) && (
        <OnlineEnd
          title={w === 0 ? t('A shared win!', 'সমান সমান!') : w === 1 ? t('You win!', 'তুমি জিতেছ!') : t(`${them} wins`, `${them} জিতেছে`)}
          outcome={w === 0 ? 'tie' : w === 1 ? 'win' : 'loss'}
          me={{ name: peer.me.name, team: peer.me.team, score: n(v.totals[0]) }} them={{ name: them, team: peer.them.team, score: n(v.totals[1]) }}
          lines={<>
            <ol className="ndo-sum">
              {v.results.map((r, i) => <li key={i}><b>{r.letter.bn}</b> · {n(sum(r.points[0]))} – {n(sum(r.points[1]))}</li>)}
            </ol>
          </>}
          gone={gone && v.phase !== 'over'} oppName={them}
          rematch={gone ? undefined : rematch.state} onRematch={gone ? undefined : rematch.ask}
          onLeave={onLeave}
        />
      )}
    </div>
  );
}

