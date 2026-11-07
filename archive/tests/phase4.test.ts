import { describe, expect, it } from 'vitest';
import { createRng } from '../src/engine/rng';
import { TEAMS, flagSvg, lineup, teamsFor } from '../src/shared/teams';
import { createTournament, cricketSimulator, footballSimulator, nextFixture, playerResult, standings } from '../src/shared/tournament';
import { dailySeed, todayKey } from '../src/shared/daily';
import { dailyChase, isUnlocked, ladder, starsFor } from '../src/shared/cricketModes';
import { newChase as hcChase, playBall, limitsOf } from '../src/games/hand-cricket/logic';
import { NUMS, NumberAI, judge as ncJudge, parFor, rulesFor } from '../src/games/number-cricket/model';
import { aiMove, apply, freeLines, newGame } from '../src/games/dots-boxes/model';
import { graphemes, guess, lettersOf, newRound, validWord } from '../src/games/hangman/model';
import { CATEGORIES } from '../src/games/hangman/words';
import { PITCH, ball, cloneWorld, flick, settle, discsOf } from '../src/games/flikk-football/physics';
import { aiChoose, kickoff, judge as ffJudge } from '../src/games/flikk-football/match';
import { FLICKS_PER_TURN, aiChooseFixed, fixedKickoff, flickBall, judgeFixed, placeBall, powerFor, ballReach, previewFixed, receiver, tackler } from '../src/games/flikk-football/fixed';
import { decided, nextKicker, judge as pkJudge, type Shootout } from '../src/games/penalty/model';
import { GROUPS, advance, backHandCatch, newProgress } from '../src/games/five-stones/model';
import { flick as efFlick, newEraser, settle as efSettle, type World } from '../src/games/eraser-flip/model';
import { LEVELS, flickScore } from '../src/games/eraser-flip/levels';
import { TYPES, WORLD, launch, makeCourse, stepPlane, throwScore } from '../src/games/paper-plane/model';

describe('teams and flags', () => {
  it('has cricket and football nations with flags and eleven invented names', () => {
    expect(teamsFor('cricket').length).toBeGreaterThanOrEqual(12);
    expect(teamsFor('football').length).toBeGreaterThanOrEqual(16);
    for (const t of TEAMS) {
      expect(flagSvg(t.id)).toMatch(/^<svg[^>]*viewBox="0 0 30 20"/);
      expect(lineup(t, 'en')).toHaveLength(11);
      expect(lineup(t, 'bn')).toHaveLength(11);
    }
    expect(lineup(TEAMS[0], 'en')).toEqual(lineup(TEAMS[0], 'en'));
  });
});

describe('tournament', () => {
  const play = (sport: 'cricket' | 'football', alwaysWin: boolean) => {
    const sim = sport === 'cricket' ? cricketSimulator('cricket', 12, 2.6, 3) : footballSimulator();
    let t = createTournament('x', sport, 'ban', 12, 42);
    for (let guard = 0; guard < 10 && nextFixture(t); guard++) {
      const f = nextFixture(t)!;
      const meHome = f.home === 'ban';
      const win: [number, number] = alwaysWin ? (meHome ? [30, 10] : [10, 30]) : (meHome ? [10, 30] : [30, 10]);
      t = playerResult(t, f.id, { score: win, balls: [12, 12], winner: alwaysWin ? 'ban' : (meHome ? f.away : f.home) }, sim);
    }
    return t;
  };
  it('has two groups of four with three matchdays each', () => {
    const t = createTournament('x', 'cricket', 'ban', 12, 1);
    expect(t.groups.A).toHaveLength(4);
    expect(t.groups.B).toHaveLength(4);
    expect(t.fixtures.filter((f) => f.group === 'A')).toHaveLength(6);
    expect(new Set(t.teams).size).toBe(8);
  });
  it('a team that wins everything lifts the cup after five matches', () => {
    for (const sport of ['cricket', 'football'] as const) {
      const t = play(sport, true);
      expect(t.status).toBe('won');
      expect(t.champion).toBe('ban');
      expect(t.fixtures.filter((f) => f.home === 'ban' || f.away === 'ban')).toHaveLength(5);
      expect(standings(t, 'A')[0].team).toBe('ban');
    }
  });
  it('a team that loses everything goes out and the cup still finds a champion', () => {
    const t = play('football', false);
    expect(t.status).toBe('out');
    expect(t.champion).toBeTruthy();
    expect(t.champion).not.toBe('ban');
    expect(t.fixtures.every((f) => f.played)).toBe(true);
  });
});

describe('cricket modes', () => {
  it('ladders get harder and unlock in order', () => {
    for (const g of ['hand-cricket', 'book-cricket', 'number-cricket']) {
      const L = ladder(g);
      expect(L).toHaveLength(12);
      const rate = (l: (typeof L)[number]) => l.target / l.balls;
      expect(rate(L[11])).toBeGreaterThan(rate(L[0]));
    }
    expect(isUnlocked({}, 1)).toBe(true);
    expect(isUnlocked({}, 2)).toBe(false);
    expect(isUnlocked({ 1: 1 }, 2)).toBe(true);
  });
  it('stars reward spare balls and wickets', () => {
    const c = { target: 20, balls: 12, wickets: 2 };
    expect(starsFor(c, false, 12, 2)).toBe(0);
    expect(starsFor(c, true, 12, 1)).toBe(1);
    expect(starsFor(c, true, 8, 0)).toBe(3);
  });
  it('the daily chase is the same all day and changes by date', () => {
    const k = todayKey(new Date('2026-11-07T10:00:00'));
    expect(k).toBe('2026-11-07');
    expect(dailyChase('hand-cricket', k)).toEqual(dailyChase('hand-cricket', k));
    expect(dailySeed('hand-cricket', '2026-11-07')).not.toBe(dailySeed('hand-cricket', '2026-11-08'));
  });
  it('a chase starts in the second innings with the target set', () => {
    const m = hcChase({ wickets: 2, overs: null, balls: 9 }, 20);
    expect(m.current).toBe(1);
    expect(limitsOf(m.config).balls).toBe(9);
    let s = m;
    for (let i = 0; i < 4; i++) s = playBall(s, 5, 1);
    expect(s.done).toBe(true);
    expect(s.result?.winnerSide).toBe(0);
  });
});

describe('Number Cricket', () => {
  it('same number is out; the zero rule steals the bowler’s number', () => {
    expect(ncJudge('zero', 3, 3).out).toBe(true);
    expect(ncJudge('zero', 0, 6)).toMatchObject({ out: false, runs: 6 });
    expect(ncJudge('zero', 0, 0).out).toBe(true);
    expect(ncJudge('ten', 9, 2).runs).toBe(9);
    expect(rulesFor('zero').valid(7)).toBe(false);
    expect(rulesFor('ten').valid(10)).toBe(true);
    expect(parFor('zero')).toBeCloseTo(3, 5);
  });
  it('the computer learns a habit and bowls into it', () => {
    const ai = new NumberAI('hard', createRng(3), 'zero');
    for (let i = 0; i < 30; i++) ai.observe('bat', 4);
    let hits = 0;
    for (let i = 0; i < 300; i++) if (ai.choose('bowl', { wicketsLeft: 2, ballsLeft: null }) === 4) hits++;
    expect(hits).toBeGreaterThan(120);
    for (let i = 0; i < 50; i++) expect(NUMS.zero).toContain(ai.choose('bat', { wicketsLeft: 1, ballsLeft: 3, need: 5 }));
  });
});

describe('Dots and Boxes', () => {
  it('closing a box scores and gives another turn', () => {
    let s = newGame(1, 1);
    s = apply(s, 0); s = apply(s, 1); s = apply(s, 2);
    expect(s.turn).toBe(1);
    s = apply(s, 3);
    expect(s.score).toEqual([0, 1]);
    expect(s.turn).toBe(1);
    expect(s.done).toBe(true);
  });
  it('every level finishes a full game with legal moves', () => {
    for (const lvl of ['easy', 'medium', 'hard'] as const) {
      const rng = createRng(11);
      let s = newGame(3, 3);
      for (let i = 0; i < 100 && !s.done; i++) {
        const m = aiMove(s, lvl, rng);
        expect(freeLines(s)).toContain(m);
        s = apply(s, m);
      }
      expect(s.done).toBe(true);
      expect(s.score[0] + s.score[1]).toBe(9);
    }
  });
  it('hard beats easy on a 3×3 board most of the time', () => {
    let hardWins = 0;
    for (let g = 0; g < 10; g++) {
      const rng = createRng(100 + g);
      let s = newGame(3, 3, (g % 2) as 0 | 1);
      while (!s.done) s = apply(s, aiMove(s, s.turn === 0 ? 'hard' : 'easy', rng));
      if (s.score[0] > s.score[1]) hardWins++;
    }
    expect(hardWins).toBeGreaterThanOrEqual(7);
  });
});

describe('Hangman', () => {
  it('splits Bangla into clusters and needs each letter, with vowel signs as vowels', () => {
    expect(graphemes('কাঁঠাল').length).toBeGreaterThanOrEqual(3);
    expect(lettersOf('কি', 'bn')).toEqual(['ক', 'ই']);
    expect(lettersOf('ক্ষ', 'bn')).toEqual(['ক', 'ষ']);
    expect(lettersOf('ড়', 'bn')).toEqual(['ড়']);
    let s = newRound('আম', 'bn', 6);
    s = guess(s, 'আ'); s = guess(s, 'ম');
    expect(s.status).toBe('won');
  });
  it('wrong letters use up chances', () => {
    let s = newRound('MANGO', 'en', 3);
    s = guess(s, 'Z'); s = guess(s, 'Q'); s = guess(s, 'X');
    expect(s.status).toBe('lost');
  });
  it('every listed word can be typed on its keyboard', () => {
    for (const c of CATEGORIES) {
      expect(c.bn.length).toBeGreaterThanOrEqual(15);
      for (const w of c.bn) expect(validWord(w, 'bn'), w).toBe(true);
      for (const w of c.en) expect(validWord(w, 'en'), w).toBe(true);
    }
  });
});

describe('Flikk Football', () => {
  const teams = [{ formation: '4-3-3', mentality: 'balanced' }, { formation: '4-4-2', mentality: 'balanced' }] as const;
  it('kick-off puts 11 pieces a side and the ball on the spot, with nobody overlapping', () => {
    const w = kickoff([teams[0], teams[1]], 0, [200, 200]);
    expect(discsOf(w, 0)).toHaveLength(10);
    expect(discsOf(w, 1)).toHaveLength(10);
    expect(ball(w).y).toBe(PITCH.midY);
    for (const a of w.bodies) for (const b of w.bodies) if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(a.r + b.r - 0.5);
  });
  it('the same flick gives the same result (deterministic)', () => {
    const w = kickoff([teams[0], teams[1]], 0, [200, 200]);
    const a = cloneWorld(w), b = cloneWorld(w);
    const striker = discsOf(a, 0).sort((p, q) => Math.hypot(p.x - 300, p.y - 480) - Math.hypot(q.x - 300, q.y - 480))[0];
    flick(a, striker.id, -Math.PI / 2, 0.7); flick(b, striker.id, -Math.PI / 2, 0.7);
    settle(a); settle(b);
    expect(ball(a).x).toBe(ball(b).x);
    expect(ball(a).y).toBe(ball(b).y);
    expect(ball(a).y).toBeLessThan(PITCH.midY);
  });
  it('a straight shot into an empty net is a goal', () => {
    const w = kickoff([teams[0], teams[1]], 0, [0, 0]);
    const first = w.bodies.find((b) => b.kind === 'disc')!;
    w.bodies = w.bodies.filter((b) => b.kind === 'ball' || b === first);
    const bl = ball(w); bl.x = 300; bl.y = 200;
    const d = w.bodies.find((b) => b.kind === 'disc')!; d.x = 300; d.y = 260;
    flick(w, d.id, -Math.PI / 2, 0.8);
    settle(w);
    expect(w.goal).toBe(0);
    expect(ffJudge(w, 0, d.id).goal).toBe(0);
  });
  it('the computer finds a flick that moves the ball', () => {
    const w = kickoff([teams[0], teams[1]], 1, [200, 200]);
    const m = aiChoose(w, 1, 0.95, createRng(5), 3);
    const sim = cloneWorld(w);
    flick(sim, m.piece, m.angle, m.power);
    settle(sim);
    expect(Math.hypot(ball(sim).x - 300, ball(sim).y - PITCH.midY)).toBeGreaterThan(20);
  });
});

describe('Flikk Football, fixed players', () => {
  const teams = [{ formation: '4-3-3', mentality: 'balanced' }, { formation: '4-4-2', mentality: 'balanced' }] as const;
  const kick = () => fixedKickoff([teams[0], teams[1]], 0, [230, 230]);
  const aimAt = (w: ReturnType<typeof kick>['w'], x: number, y: number) => Math.atan2(y - ball(w).y, x - ball(w).x);
  it('pins 22 players over the whole pitch with room for the ball between them', () => {
    const { w, holder } = fixedKickoff([teams[0], teams[1]], 0, [200, 200]);
    expect(w.pinned).toBe(true);
    const ds = w.bodies.filter((b) => b.kind === 'disc');
    expect(ds).toHaveLength(20);
    for (const a of ds) for (const b of ds) if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(a.r + b.r + 20);
    expect(discsOf(w, 0).some((d) => d.y < PITCH.midY - 120)).toBe(true);
    expect(discsOf(w, 1).some((d) => d.y > PITCH.midY + 120)).toBe(true);
    expect(w.bodies.find((b) => b.id === holder)!.side).toBe(0);
  });
  it('players never move, only the ball, and the same flick gives the same result', () => {
    const a = kick(), b = kick();
    const before = a.w.bodies.filter((x) => x.kind === 'disc').map((x) => [x.x, x.y]);
    flickBall(a.w, -1.2, 0.8, 0, a.holder); flickBall(b.w, -1.2, 0.8, 0, b.holder);
    settle(a.w); settle(b.w);
    expect(a.w.bodies.filter((x) => x.kind === 'disc').map((x) => [x.x, x.y])).toEqual(before);
    expect(ball(a.w).x).toBe(ball(b.w).x);
    expect(ball(a.w).y).toBe(ball(b.w).y);
  });
  it('the first player the ball touches collects it, even if the pass was hit hard', () => {
    const { w, holder } = kick();
    const mate = discsOf(w, 0).filter((d) => d.id !== holder).sort((p, q) => Math.hypot(p.x - ball(w).x, p.y - ball(w).y) - Math.hypot(q.x - ball(w).x, q.y - ball(w).y))[0];
    flickBall(w, aimAt(w, mate.x, mate.y), 1, 0, holder);
    settle(w);
    const first = w.touches.find((id) => id !== holder);
    expect(w.collected).toBe(first);
    const r = judgeFixed(w, 0, holder);
    expect(r.event).toBe('collect');
    expect(r.holder).toBe(first);
    expect(Math.hypot(ball(w).vx, ball(w).vy)).toBe(0);
  });
  it('over a side line is a throw-in to the other team; over an end line a goal kick', () => {
    const { w, holder } = kick();
    w.bodies = w.bodies.filter((b) => b.kind !== 'disc' || b.id === holder || b.side === 1 && b.y < 300);
    const bl = ball(w); bl.x = 300; bl.y = 600;
    flickBall(w, 0, 1, 0, holder);
    settle(w);
    expect(w.outAt?.kind).toBe('throw');
    const r = judgeFixed(w, 0, holder);
    expect(r.event).toBe('throw');
    expect(w.bodies.find((b) => b.id === r.holder)!.side).toBe(1);
    const k = kick();
    k.w.bodies = k.w.bodies.filter((b) => b.kind === 'ball' || b.id === k.holder || b.kind === 'keeper');
    const b2 = ball(k.w); b2.x = 120; b2.y = 300;
    flickBall(k.w, -Math.PI / 2, 1, 0, k.holder);
    settle(k.w);
    expect(k.w.outAt?.kind).toBe('goalkick');
    const r2 = judgeFixed(k.w, 0, k.holder);
    expect(r2.event).toBe('goalkick');
    expect(k.w.bodies.find((b) => b.id === r2.holder)!.kind).toBe('keeper');
  });
  it('a shot at the keeper is a save; a shot past him is a goal', () => {
    const { w, holder } = kick();
    w.bodies = w.bodies.filter((b) => b.kind === 'ball' || b.id === holder || b.kind === 'keeper');
    const bl = ball(w); bl.x = 300; bl.y = 260;
    flickBall(w, -Math.PI / 2, 0.9, 0, holder);
    settle(w);
    expect(judgeFixed(w, 0, holder).event).toBe('save');
    const k = kick();
    k.w.bodies = k.w.bodies.filter((b) => b.kind === 'ball' || b.id === k.holder);
    const b2 = ball(k.w); b2.x = 300; b2.y = 260;
    flickBall(k.w, -Math.PI / 2, 0.9, 0, k.holder);
    settle(k.w);
    expect(k.w.goal).toBe(0);
  });
  it('after the last flick of a turn the nearest opponent tackles', () => {
    const { w } = kick();
    const t = tackler(w, 0);
    expect(t.side).toBe(1);
    expect(FLICKS_PER_TURN).toBe(3);
  });
  it('the guide shows exactly where the ball goes and who gets it', () => {
    const { w, holder } = kick();
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2, power = 0.2 + (i % 4) * 0.2;
      const pv = previewFixed(w, holder, angle, power);
      const sim = cloneWorld(w);
      flickBall(sim, angle, power, 0, holder);
      settle(sim, 7);
      const [ex, ey] = pv.path[pv.path.length - 1];
      expect(Math.hypot(ball(sim).x - ex, ball(sim).y - ey)).toBeLessThan(0.001);
      const r = judgeFixed(sim, 0, holder);
      if (pv.end !== 'goal') expect(r.holder).toBe(pv.who!.id);
    }
  });
  it('the guide power matches how far the ball really rolls', () => {
    const { w } = kick();
    w.bodies = w.bodies.filter((b) => b.kind === 'ball');
    const bl = ball(w); bl.x = 300; bl.y = 850;
    flickBall(w, -Math.PI / 2, powerFor(300));
    settle(w);
    expect(Math.abs((850 - ball(w).y) - 300)).toBeLessThan(30);
    expect(ballReach(0)).toBe(0);
    void placeBall; void receiver;
  });
  it('computer against computer, three flicks a turn: passes, turnovers and goals', () => {
    const rng = createRng(11);
    let goals = 0, passes = 0, turnovers = 0, tackles = 0;
    for (let game = 0; game < 3; game++) {
      let { w, holder } = kick();
      let flicks = 0;
      for (let n = 0; n < 40; n++) {
        const side = w.bodies.find((b) => b.id === holder)!.side as 0 | 1;
        const m = aiChooseFixed(w, side, holder, 0.8, rng, FLICKS_PER_TURN - flicks);
        flickBall(w, m.angle, m.power, 0, holder);
        settle(w, 7);
        flicks++;
        if (w.goal !== null) { goals++; ({ w, holder } = fixedKickoff([teams[0], teams[1]], w.goal === 0 ? 1 : 0, [230, 230])); flicks = 0; continue; }
        const r = judgeFixed(w, side, holder);
        if (r.pass) passes++;
        holder = r.holder;
        if (r.keep && flicks >= FLICKS_PER_TURN) { holder = tackler(w, side).id; tackles++; }
        if (!r.keep || flicks >= FLICKS_PER_TURN) { turnovers++; flicks = 0; }
        placeBall(w, holder);
      }
    }
    expect(passes).toBeGreaterThan(8);
    expect(turnovers).toBeGreaterThan(5);
    expect(goals + tackles).toBeGreaterThan(0);
  }, 60000);
});

describe('Penalty Shootout', () => {
  it('a keeper on the spot saves, a corner beats a keeper in the middle', () => {
    expect(pkJudge({ x: 0.1, y: 0.4, power: 0.6 }, { x: 0.1, y: 0.4 })).toBe('saved');
    expect(pkJudge({ x: 0.85, y: 0.8, power: 0.7 }, { x: 0, y: 0.42 })).toBe('goal');
    expect(pkJudge({ x: 0.2, y: 1.3, power: 1 }, { x: 0, y: 0.42 })).toBe('over');
  });
  it('decides early, goes to sudden death and alternates kickers', () => {
    const s = (a: boolean[], b: boolean[], first: 0 | 1 = 0): Shootout => ({ kicks: [a, b], first, best: 5 });
    expect(decided(s([true, true, true], [false, false, false]))).toBe(0);
    expect(decided(s([true, true], [true, true]))).toBe(null);
    expect(decided(s([true, true, true, true, true], [true, true, true, true, true]))).toBe(null);
    expect(decided(s([true, true, true, true, true, false], [true, true, true, true, true, true]))).toBe(1);
    expect(nextKicker(s([true], [], 0))).toBe(1);
    expect(nextKicker(s([true], [true], 0))).toBe(0);
  });
});

describe('Five Stones', () => {
  it('progress walks through the four stages', () => {
    let p = newProgress();
    const tosses = GROUPS.reduce((a, g) => a + g.length, 0);
    for (let i = 0; i < tosses; i++) p = advance(p);
    expect(p.stage).toBe(4);
    expect(p.points).toBeGreaterThan(0);
  });
  it('the back of the hand rewards timing', () => {
    expect(backHandCatch(0.01)).toBe(5);
    expect(backHandCatch(0.15)).toBe(2);
    expect(backHandCatch(0.5)).toBe(0);
  });
});

describe('Eraser Flip', () => {
  it('a flick lands, slides and stops; too hard falls off the desk', () => {
    const w: World = { erasers: [newEraser(0, 300, 700, 0, ['#000', '#fff'])], boxes: [], t: 0, events: [] };
    efFlick(w.erasers[0], -Math.PI / 2, 0.4);
    efSettle(w);
    expect(w.erasers[0].fallen).toBe(false);
    expect(w.erasers[0].y).toBeLessThan(600);
    const w2: World = { erasers: [newEraser(0, 300, 200, 0, ['#000', '#fff'])], boxes: [], t: 0, events: [] };
    efFlick(w2.erasers[0], -Math.PI / 2, 1);
    efSettle(w2);
    expect(w2.erasers[0].fallen).toBe(true);
  });
  it('landing on the other eraser counts as on top', () => {
    const me = newEraser(0, 300, 600, 0, ['#000', '#fff']);
    const target = newEraser(1, 300, 600, 0, ['#000', '#fff']);
    const w: World = { erasers: [me, target], boxes: [], t: 0, events: [] };
    // Find a power that lands on the target placed ahead.
    let found = false;
    for (let p = 0.2; p <= 1 && !found; p += 0.02) {
      const sim: World = { erasers: [{ ...me, y: 700 }, { ...target, y: 450 }], boxes: [], t: 0, events: [] };
      efFlick(sim.erasers[0], -Math.PI / 2, p);
      efSettle(sim);
      if (sim.erasers[0].onTop === 1) found = true;
    }
    expect(found).toBe(true);
    void w;
  });
  it('every challenge can score points', () => {
    for (const L of LEVELS) {
      let best = 0;
      for (let p = 0.1; p <= 1; p += 0.03) {
        const w: World = { erasers: [newEraser(0, L.start.x, L.start.y, L.start.a, ['#000', '#fff'])], boxes: L.boxes, t: 0, events: [] };
        if (L.zone.kind === 'top') w.erasers.push(newEraser(9, L.zone.x, L.zone.y, L.zone.a, ['#000', '#fff'], true));
        const z = L.zone;
        const tx = 'x' in z ? z.x + ('w' in z ? z.w / 2 : 0) : 300;
        const ty = 'y' in z ? z.y + ('h' in z ? z.h / 2 : 0) : 30;
        efFlick(w.erasers[0], Math.atan2(ty - L.start.y, tx - L.start.x), p);
        efSettle(w);
        best = Math.max(best, flickScore(L, w.erasers[0], L.zone.kind === 'top' ? 9 : null));
      }
      expect(best, L.id).toBeGreaterThan(0);
    }
  });
});

describe('Paper Airplane challenges', () => {
  it('accuracy courses have a target roof and score a landing on it highest', () => {
    const c = makeCourse(createRng(4), 'accuracy');
    expect(c.target).toBeTruthy();
    const onIt = { ...launch(0.2, 0.5), x: c.target!.cx, y: c.target!.top, landed: true, alive: false };
    const off = { ...launch(0.2, 0.5), x: c.target!.cx + 900, y: 600, landed: false, alive: false };
    expect(throwScore(onIt, 'accuracy', c)).toBeGreaterThan(throwScore(off, 'accuracy', c));
  });
  it('the obstacle course is busier and the hawk fold flies', () => {
    const plain = makeCourse(createRng(9), 'distance');
    const busy = makeCourse(createRng(9), 'obstacle');
    expect(busy.wires.length).toBeGreaterThan(plain.wires.length);
    expect(busy.kites.length).toBeGreaterThan(plain.kites.length);
    const p = launch(0.25, 0.8);
    for (let i = 0; i < 2000 && p.alive; i++) stepPlane(p, TYPES.hawk, 0, { buildings: [], wires: [], rings: [], thermals: [], kites: [] }, 1 / 120);
    expect(p.x).toBeGreaterThan(WORLD.startX + 300);
  });
});
