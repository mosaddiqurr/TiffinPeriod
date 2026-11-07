import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Chan, Link, Member } from '../src/platform/net/link';

// Party rooms run over an in-memory hub: every "device" gets its own Link with its own id,
// messages arrive after a small delay, presence works like the real thing.

const hub = new Map<string, Map<string, { joinedAt: number; handlers: Map<string, Set<(d: any, f: string) => void>>; pres: Set<(m: Member[]) => void> }>>();
let current: Link | null = null;
let clock = 0;

function device(id: string): Link {
  return {
    kind: 'local',
    async join(name: string): Promise<Chan> {
      if (!hub.has(name)) hub.set(name, new Map());
      const room = hub.get(name)!;
      const mine = { joinedAt: ++clock, handlers: new Map(), pres: new Set<(m: Member[]) => void>() };
      room.set(id, mine);
      const list = () => [...room].map(([mid, v]) => ({ id: mid, joinedAt: v.joinedAt })).sort((a, b) => a.joinedAt - b.joinedAt);
      const presence = () => setTimeout(() => room.forEach((v) => v.pres.forEach((cb) => cb(list()))), 1);
      presence();
      let left = false;
      return {
        name, me: id,
        members: list,
        send: (type, data) => {
          if (left) return;
          const copy = data === undefined ? undefined : JSON.parse(JSON.stringify(data));
          setTimeout(() => room.forEach((v, mid) => { if (mid !== id) v.handlers.get(type)?.forEach((cb: (d: any, f: string) => void) => cb(copy, id)); }), 1 + Math.random() * 3);
        },
        on: (type, cb) => { if (!mine.handlers.has(type)) mine.handlers.set(type, new Set()); mine.handlers.get(type)!.add(cb); return () => mine.handlers.get(type)?.delete(cb); },
        onPresence: (cb) => { mine.pres.add(cb); return () => mine.pres.delete(cb); },
        leave: () => { if (left) return; left = true; room.delete(id); presence(); },
      };
    },
  };
}

vi.mock('../src/platform/net/link', () => ({ getLink: () => (current ? Promise.resolve(current) : Promise.reject(new Error('offline'))) }));

const { createParty, joinParty, quickParty, groupOf, soloParty, PartyError } = await import('../src/platform/net/party');
const { ChorTable, dealFor } = await import('../src/games/chor-police/table');
const { hostTable, seatsFor } = await import('../src/games/chor-police/host');
type CPView = import('../src/games/chor-police/table').CPView;
type CPAction = import('../src/games/chor-police/table').CPAction;
type Party = import('../src/platform/net/party').Party;

const as = <T,>(id: string, fn: () => T): T => { current = device(id); return fn(); };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(ok: () => boolean, ms = 8000) {
  const t0 = Date.now();
  while (!ok()) { if (Date.now() - t0 > ms) throw new Error('timed out'); await wait(10); }
}

beforeEach(() => {
  hub.clear();
  (globalThis as any).addEventListener ??= () => {};
  (globalThis as any).removeEventListener ??= () => {};
});
const open: Party[] = [];
afterEach(() => { open.splice(0).forEach((p) => p.close()); });
const keep = (p: Party) => { open.push(p); return p; };

describe('party rooms', () => {
  it('quick-match groups are four, oldest first', () => {
    const ms = Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, joinedAt: i }));
    expect(groupOf(ms, 'p0')).toEqual(['p0', 'p1', 'p2', 'p3']);
    expect(groupOf(ms, 'p3')).toEqual(['p0', 'p1', 'p2', 'p3']);
    expect(groupOf(ms, 'p5')).toEqual(['p4', 'p5']);
    expect(groupOf(ms, 'nobody')).toBeNull();
  });

  it('three friends join; everyone sees the seats fill; a fifth is turned away; messages go to one or all', async () => {
    const host = keep(await as('H', () => createParty('cp', { name: 'Host', team: '' })));
    const g1 = keep(await as('A', () => joinParty('cp', host.code, { name: 'Anik', team: '' })));
    const g2 = keep(await as('B', () => joinParty('cp', host.code, { name: 'Bappi', team: '' })));
    await until(() => g1.members().length === 3 && g2.members().length === 3);
    expect(host.members().map((m) => m.profile.name)).toEqual(['Host', 'Anik', 'Bappi']);
    expect(g1.members().map((m) => m.profile.name)).toEqual(['Host', 'Anik', 'Bappi']);
    const g3 = keep(await as('C', () => joinParty('cp', host.code, { name: 'Chinmoy', team: '' })));
    await until(() => g1.members().length === 4);
    await expect(as('D', () => joinParty('cp', host.code, { name: 'Dipu', team: '' }))).rejects.toMatchObject({ code: 'full' });

    const got: Record<string, unknown[]> = { A: [], B: [], C: [] };
    g1.on('x', (d) => got.A.push(d)); g2.on('x', (d) => got.B.push(d)); g3.on('x', (d) => got.C.push(d));
    host.send('x', 1);           // everyone
    host.send('x', 'secret', 'B'); // only Bappi
    host.send('x', 2);
    await until(() => got.A.length === 2 && got.B.length === 3 && got.C.length === 2);
    expect(got.B).toEqual([1, 'secret', 2]);
    expect(got.A).toEqual([1, 2]);
    const fromHost: Array<[unknown, string]> = [];
    host.on('act', (d, from) => fromHost.push([d, from]));
    g2.send('act', 'hi');
    await until(() => fromHost.length === 1);
    expect(fromHost[0]).toEqual(['hi', 'B']);
    await expect(joinParty('cp', 'ZZZZZ', { name: 'x', team: '' }, { cancelled: false }, 800)).rejects.toBeInstanceOf(PartyError);
  });

  it('a locked room says the game has started; a guest leaving and the host leaving are noticed', async () => {
    const host = keep(await as('H', () => createParty('cp', { name: 'Host', team: '' })));
    const g1 = keep(await as('A', () => joinParty('cp', host.code, { name: 'Anik', team: '' })));
    const g2 = keep(await as('B', () => joinParty('cp', host.code, { name: 'Bappi', team: '' })));
    host.lock(true);
    await expect(as('C', () => joinParty('cp', host.code, { name: 'Chinmoy', team: '' }))).rejects.toMatchObject({ code: 'started' });
    const left: string[] = [];
    host.onLeft((id) => left.push(id));
    g1.close();
    await until(() => left.includes('A'));
    await until(() => g2.members().length === 2);
    let hostGone = '';
    g2.onLeft((id) => { hostGone = id; });
    host.close();
    await until(() => hostGone === 'H');
  });

  it('quick match: two searchers end up in one room; the longer waiter hosts', async () => {
    const pa = as('Q1', () => quickParty('cpq', { name: 'One', team: '' }, { waitMs: 400 }));
    await wait(30);
    const pb = as('Q2', () => quickParty('cpq', { name: 'Two', team: '' }, { waitMs: 400 }));
    const [a, b] = await Promise.all([pa, pb]);
    keep(a); keep(b);
    expect(a.host).toBe(true);
    expect(b.host).toBe(false);
    expect(b.code).toBe(a.code);
    await until(() => a.members().length === 2);
  });

  it('quick match alone (or offline) gives a party of one', async () => {
    const t0 = Date.now();
    const a = keep(await as('S', () => quickParty('cps', { name: 'Solo', team: '' }, { waitMs: 300 })));
    expect(Date.now() - t0).toBeGreaterThanOrEqual(280);
    expect(a.host).toBe(true);
    expect(a.members()).toHaveLength(1);
    current = null;
    const b = await quickParty('cps', { name: 'Off', team: '' }, { waitMs: 100 });
    expect(b.members()).toHaveLength(1);
    expect(soloParty({ name: 'x', team: '' }).code).toBe('');
  });
});

describe('the Chor Police table (host)', () => {
  it('deals the same chits from the same seed, a full set every round', () => {
    expect(dealFor(7, 1, 2)).toEqual(dealFor(7, 1, 2));
    for (let r = 1; r < 30; r++) expect([...dealFor(99, 1, r)].sort()).toEqual(['babu', 'chor', 'dakat', 'police']);
  });

  it('four stand-ins play a whole game; secrets stay secret until the reveal', async () => {
    const views: CPView[][] = [[], [], [], []];
    const table = new ChorTable({ rounds: 4, seed: 5, speed: 60, seats: ['A', 'B', 'C', 'D'].map((name) => ({ name, human: false })), send: (s, v) => views[s].push(v) });
    table.start();
    await until(() => table.state.step === 'done', 20000);
    const last = views[0][views[0].length - 1];
    expect(last.scores.reduce((a, b) => a + b, 0)).toBe(1600 * 4);
    for (const vs of views) for (const v of vs) {
      const shown = v.roles.filter((r) => r !== null).length;
      if (v.step === 'read') expect(shown).toBe(1);
      if (v.step === 'guess') expect(shown).toBeLessThanOrEqual(3);
      if (v.step === 'reveal' || v.step === 'done') expect(shown).toBe(4);
      expect(v.roles[v.seat]).not.toBeNull();
    }
    table.dispose();
  }, 30000);

  it('a human Police who does not answer is guessed for when the clock runs out; stale actions are ignored', async () => {
    let mine: CPView | null = null;
    const table = new ChorTable({ rounds: 1, seed: 11, speed: 40, seats: [{ name: 'Me', human: true }, { name: 'B', human: false }, { name: 'C', human: false }, { name: 'D', human: false }], send: (s, v) => { if (s === 0) mine = v; } });
    table.start();
    table.act(0, { g: 9, r: 1, kind: 'hide' });
    expect(mine!.hidden[0]).toBe(false);
    table.act(0, { g: 1, r: 1, kind: 'hide' });
    expect(mine!.hidden[0]).toBe(true);
    await until(() => table.state.step === 'done', 10000);
    expect(mine!.guess).not.toBeNull();
    table.dispose();
  });
});

describe('Chor Police over a party: host, two friends and a stand-in', () => {
  it('a whole game with the same scores everywhere; a friend leaves and a stand-in takes over', async () => {
    const host = keep(await as('H', () => createParty('cpg', { name: 'Host', team: '' })));
    const g1 = keep(await as('A', () => joinParty('cpg', host.code, { name: 'Anik', team: '' })));
    const g2 = keep(await as('B', () => joinParty('cpg', host.code, { name: 'Bappi', team: '' })));
    await until(() => host.members().length === 3);
    const seen: Record<string, CPView | null> = { H: null, A: null, B: null };
    const secrets: string[] = [];
    let hostApi: ReturnType<typeof hostTable> | null = null;
    // A player who hides at once and, as Police, guesses the first suspect.
    const play = (who: string, v: CPView, send: (a: CPAction) => void) => {
      seen[who] = v;
      if (v.step === 'read') secrets.push(`${who}:${v.roles.filter((r) => r !== null).length}`);
      if (v.step === 'read' && !v.hidden[v.seat]) send({ g: v.game, r: v.round, kind: 'hide' });
      if (v.step === 'guess' && v.police === v.seat) { const t = v.roles.findIndex((r) => r === null); send({ g: v.game, r: v.round, kind: 'guess', target: t }); }
    };
    g1.on('st', (v: CPView) => play('A', v, (a) => g1.send('act', a)));
    const offB = g2.on('st', (v: CPView) => play('B', v, (a) => g2.send('act', a)));
    hostApi = hostTable(host, 3, 1234, (v) => setTimeout(() => play('H', v, (a) => hostApi!.table.act(0, a)), 1), 40);
    hostApi.start();
    expect(hostApi.table.state.seats.map((s) => s.human)).toEqual([true, true, true, false]);
    await until(() => seen.H?.step === 'done' && seen.A?.step === 'done' && seen.B?.step === 'done', 20000);
    expect(seen.A!.scores).toEqual(seen.H!.scores);
    expect(seen.B!.scores).toEqual(seen.H!.scores);
    expect(seen.H!.scores.reduce((a, b) => a + b, 0)).toBe(1600 * 3);
    expect(new Set(secrets.map((s) => s.split(':')[1]))).toEqual(new Set(['1']));
    expect(seen.A!.names).toEqual(seen.H!.names);
    expect(seen.H!.names.slice(0, 3)).toEqual(['Host', 'Anik', 'Bappi']);

    // Play again; Bappi leaves in the middle: his seat goes on as a stand-in.
    hostApi.start();
    await until(() => seen.A?.step === 'read' && seen.A.game === 2);
    offB();
    g2.close();
    await until(() => seen.A?.notice?.name === 'Bappi', 8000);
    expect(seen.A!.away[2]).toBe(true);
    await until(() => seen.H?.step === 'done' && seen.H.game === 2 && seen.A?.step === 'done' && seen.A.game === 2, 20000);
    expect(seen.A!.scores).toEqual(seen.H!.scores);
    hostApi.dispose();
  }, 60000);

  it('seats: humans first, then stand-ins with ordinary, different names', () => {
    const { seats, ids } = seatsFor([{ id: 'h', profile: { name: 'Rafi', team: '' } }], 3);
    expect(seats).toHaveLength(4);
    expect(ids).toEqual(['h', null, null, null]);
    expect(new Set(seats.map((s) => s.name.toLowerCase())).size).toBe(4);
    for (const s of seats.slice(1)) { expect(s.human).toBe(false); expect(s.name).not.toMatch(/bot|computer|cpu/i); }
  });
});

describe('Chor Police online: names', () => {
  it('numbers players who share a name, with Bangla digits for Bangla names', async () => {
    const { uniqueNames } = await import('../src/games/chor-police/host');
    expect(uniqueNames(['খেলোয়াড় ১', 'খেলোয়াড় ১', 'Rafi', 'rafi'])).toEqual(['খেলোয়াড় ১', 'খেলোয়াড় ১ ২', 'Rafi', 'rafi 2']);
  });
});
