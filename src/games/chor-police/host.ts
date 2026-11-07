import { createRng } from '../../engine/rng';
import { botProfile } from '../../platform/net/bot';
import { PARTY_MAX, type Party, type PartyMember } from '../../platform/net/party';
import { ChorTable, type CPAction, type CPView, type TableSeat } from './table';

// The host's side of an online Chor Police game: the table (table.ts) wired to the party.
// Seat 0 is the host, then the guests in the order they joined, then stand-ins.

/**
 * Players with the same name (often the default "Player 1") get a number after it, so everyone at
 * the table can tell them apart: "Rafi", "Rafi 2". Bangla names get Bangla digits.
 */
export function uniqueNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((nm) => {
    const key = nm.trim().toLowerCase();
    const k = (seen.get(key) ?? 0) + 1;
    seen.set(key, k);
    if (k === 1) return nm;
    const digits = /[ঀ-৿]/.test(nm) ? String(k).replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[+d]) : String(k);
    return `${nm} ${digits}`;
  });
}

/** The four seats for a game: everyone in the room (host first), then stand-ins with ordinary names. */
export function seatsFor(members: PartyMember[], seed: number): { seats: TableSeat[]; ids: Array<string | null> } {
  const names = uniqueNames(members.slice(0, PARTY_MAX).map((m) => m.profile.name));
  const seats: TableSeat[] = names.map((name) => ({ name, human: true }));
  const ids: Array<string | null> = members.slice(0, PARTY_MAX).map((m) => m.id);
  const rng = createRng((seed ^ 0x7f4a7c15) >>> 0);
  const used = new Set(seats.map((s) => s.name.toLowerCase()));
  while (seats.length < PARTY_MAX) {
    let nm = botProfile(rng).name;
    for (let k = 0; k < 20 && used.has(nm.toLowerCase()); k++) nm = botProfile(rng).name;
    used.add(nm.toLowerCase());
    seats.push({ name: nm, human: false });
    ids.push(null);
  }
  return { seats, ids };
}

/** Host side: the table, wired to the party. Returns start() and the host's own view. */
export function hostTable(party: Party, rounds: number, seed: number, onMine: (v: CPView) => void, speed = 1) {
  let ids: Array<string | null> = [];
  const table = new ChorTable({
    rounds, seed, seats: [], speed,
    send: (seat, v) => { const id = ids[seat]; if (id === party.me) onMine(v); else if (id) party.send('st', v, id); },
  });
  const offs = [
    party.on('act', (a: CPAction, from: string) => { const s = ids.indexOf(from); if (s >= 0) table.act(s, a); }),
    party.onLeft((id) => { const s = ids.indexOf(id); if (s >= 0) { ids = ids.map((x) => (x === id ? null : x)); table.standIn(s); } }),
  ];
  let games = 0;
  return {
    table,
    start() {
      const seated = seatsFor(party.members(), (seed + games * 7919) >>> 0);
      games += 1;
      ids = seated.ids;
      party.lock(true);
      table.start(seated.seats);
    },
    dispose() { offs.forEach((f) => f()); table.dispose(); },
  };
}

