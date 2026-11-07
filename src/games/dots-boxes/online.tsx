import { useEffect, useRef, useState } from 'react';
import type { Rng } from '../../engine/rng';
import { sfx, vibrate } from '../../platform/audio';
import { recordResult } from '../../platform/scores';
import { makeBotPeer, thinkMs, type BotEnd } from '../../platform/net/bot';
import type { Peer, Profile } from '../../platform/net/rooms';
import { Seg, useGameBar } from '../../components/ui';
import { MoveClock, OnlineEnd, OnlineLobby, OppBar, useMoveClock, useOppGone, useRealUnmount, useRematch, type MatchProps } from '../../components/online/OnlineLobby';
import { useTx } from '../../components/sport/SportKit';
import { ScoreStrip } from '../bench-kit/BenchKit';
import { DBBoard, INK } from './Board';
import { aiMove, apply, freeLines, newGame, type DBState } from './model';

// Dots and Boxes online. The host is side 0. Each move is { g: game number, l: line }.
// Both devices apply the same moves to the same pure model, so they always agree; a move
// out of turn or on a drawn line is ignored. Side 0 starts game 1, then the starter swaps.
// 15 seconds per move; when it runs out a random free line is drawn for you.

export interface DBSettings { size: number }
const GAME = 'dots-boxes';
const MOVE_SECONDS = 15;
const QUICK: DBSettings = { size: 4 };

export function OnlineDotsBoxes({ onBack, code }: { onBack: () => void; code?: string }) {
  const { t, n } = useTx();
  return (
    <OnlineLobby<DBSettings>
      game={GAME}
      title={t('Dots and Boxes', 'ঘর কাটা')}
      onBack={onBack}
      code={code}
      defaultSettings={QUICK}
      quickSettings={QUICK}
      describe={(s) => t(`${s.size} × ${s.size} boxes`, `${n(s.size)} × ${n(s.size)} ঘর`)}
      Options={({ value, onChange }) => (
        <Seg label={t('Board size', 'বোর্ডের মাপ')} value={value.size} onChange={(v) => onChange({ size: v })} options={[3, 4, 5, 6].map((v) => ({ v, label: `${n(v)}×${n(v)}` }))} />
      )}
      makeBot={(me, s, seed) => makeDotsBot(me, s, seed)}
      Match={DBMatch}
      help={[t(`${MOVE_SECONDS} seconds for each line; if time runs out, a line is drawn for you.`, `প্রতিটা দাগের জন্য ${n(MOVE_SECONDS)} সেকেন্ড; সময় শেষ হলে তোমার হয়ে একটা দাগ টানা হবে।`)]}
    />
  );
}

function DBMatch({ peer, settings, onLeave }: MatchProps<DBSettings>) {
  const x = useTx();
  const { t, n } = x;
  const me: 0 | 1 = peer.host ? 0 : 1;
  const opp = (1 - me) as 0 | 1;
  const [game, setGame] = useState(1);
  const [st, setSt] = useState<DBState>(() => newGame(settings.size, settings.size, 0));
  const [recent, setRecent] = useState<number[]>([]);
  const stRef = useRef(st);
  stRef.current = st;
  const gameRef = useRef(game);
  gameRef.current = game;
  const gone = useOppGone(peer);
  const recorded = useRef(0);
  const names = me === 0 ? [peer.me.name, peer.them.name] : [peer.them.name, peer.me.name];
  const initials = names.map((nm) => [...nm.trim()][0]?.toUpperCase() ?? '?');
  useGameBar({ help: <p>{t('Take turns drawing lines. Close a box to draw again.', 'পালা করে দাগ টানো। ঘর বন্ধ করলে আবার পালা।')}</p> }, [x.lang]);

  const applyLine = (l: number, by: 0 | 1) => {
    const s = stRef.current;
    if (s.done || s.turn !== by || s.drawn[l] >= 0) return false;
    const nx = apply(s, l);
    const got = nx.score[by] - s.score[by];
    if (got) { sfx('good', { pitch: 1 + got * 0.1 }); if (by === me) vibrate(15); } else sfx('tick', { gain: 0.5 });
    setRecent((r) => (got ? [...r, l] : [l]));
    stRef.current = nx;
    setSt(nx);
    return true;
  };

  useEffect(() => peer.on('line', (d: { g: number; l: number }) => { if (d.g === gameRef.current) applyLine(d.l, opp); }), [peer]); // eslint-disable-line react-hooks/exhaustive-deps
  useRealUnmount(() => peer.close());

  const myTurn = !gone && !st.done && st.turn === me;
  const play = (l: number) => { if (myTurn && applyLine(l, me)) peer.send('line', { g: game, l }); };
  const left = useMoveClock(myTurn ? `${game}|${st.drawn.filter((d) => d >= 0).length}` : '', MOVE_SECONDS, () => {
    const free = freeLines(stRef.current);
    if (free.length) play(free[Math.floor(Math.random() * free.length)]);
  });

  const rematch = useRematch(peer, () => {
    const g = gameRef.current + 1;
    setGame(g);
    const s = newGame(settings.size, settings.size, ((g - 1) % 2) as 0 | 1);
    stRef.current = s;
    setSt(s);
    setRecent([]);
  });

  useEffect(() => {
    if (!st.done || recorded.current === game) return;
    recorded.current = game;
    const w = st.score[0] === st.score[1] ? null : st.score[0] > st.score[1] ? 0 : 1;
    recordResult(GAME, { outcome: w === null ? 'tie' : w === me ? 'win' : 'loss' }, () => []);
  }, [st.done, game]); // eslint-disable-line react-hooks/exhaustive-deps

  const w = st.score[0] === st.score[1] ? null : st.score[0] > st.score[1] ? 0 : 1;
  return (
    <div className="sport-page db-online" data-testid="online-match">
      <OppBar peer={peer} gone={gone} status={st.done ? '' : st.turn === opp ? t('Drawing…', 'দাগ টানছে…') : t('Waiting', 'অপেক্ষায়')} />
      <ScoreStrip names={names} scores={st.score} active={st.done ? undefined : st.turn} n={n} />
      <div className="db-turn" aria-live="polite" style={{ color: INK[st.turn], display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        {st.done ? t('All boxes closed!', 'সব ঘর বন্ধ!') : myTurn ? t('Your turn: draw a line', 'তোমার পালা: একটা দাগ টানো') : t(`${peer.them.name} is drawing…`, `${peer.them.name} দাগ টানছে…`)}
        {myTurn && <MoveClock left={left} seconds={MOVE_SECONDS} />}
      </div>
      <DBBoard st={st} canPlay={myTurn} recent={recent} initials={initials} onPlay={play} label={(l) => t(`Line ${l + 1}`, `দাগ ${n(l + 1)}`)} />
      {(st.done || gone) && (
        <OnlineEnd
          title={w === null ? t('A draw!', 'ড্র!') : w === me ? t('You win!', 'তুমি জিতেছ!') : t(`${peer.them.name} wins`, `${peer.them.name} জিতেছে`)}
          outcome={w === null ? 'tie' : w === me ? 'win' : 'loss'}
          me={{ name: peer.me.name, team: peer.me.team, score: n(st.score[me]) }} them={{ name: peer.them.name, team: peer.them.team, score: n(st.score[opp]) }}
          gone={gone && !st.done} oppName={peer.them.name}
          rematch={gone ? undefined : rematch.state} onRematch={gone ? undefined : rematch.ask}
          onLeave={onLeave}
        />
      )}
    </div>
  );
}

// ---------- The stand-in ----------

export function dotsBrain(speed = 1) {
  return (end: BotEnd, ctx: { rng: Rng; settings: DBSettings }) => {
    const rng = ctx.rng;
    const level = rng.chance(0.55) ? 'medium' : 'easy';
    let g = 1;
    let st = newGame(ctx.settings.size, ctx.settings.size, 0);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let wantRematch = false;
    // The stand-in is side 0.
    const think = () => {
      clearTimeout(timer);
      if (st.done || st.turn !== 0) return;
      timer = setTimeout(() => {
        if (st.done || st.turn !== 0) return;
        const l = aiMove(st, level, rng);
        st = apply(st, l);
        end.send('line', { g, l });
        think();
      }, thinkMs(rng, 0.7, 2.4, speed));
    };
    const offs = [
      end.on('line', (d: { g: number; l: number }) => {
        if (d.g !== g || st.done || st.turn !== 1 || st.drawn[d.l] >= 0) return;
        st = apply(st, d.l);
        think();
      }),
      end.on('rematch', () => {
        if (wantRematch) return;
        wantRematch = true;
        setTimeout(() => {
          end.send('rematch');
          g += 1;
          wantRematch = false;
          st = newGame(ctx.settings.size, ctx.settings.size, ((g - 1) % 2) as 0 | 1);
          think();
        }, thinkMs(rng, 1, 2.2, speed));
      }),
    ];
    think();
    return () => { offs.forEach((f) => f()); clearTimeout(timer); };
  };
}

export function makeDotsBot(me: Profile, settings: DBSettings, seed?: number, speed = 1): Peer {
  return makeBotPeer(me, { settings, seed, brain: dotsBrain(speed), speed });
}

