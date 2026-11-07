export type Parity = 'even' | 'odd';
export function fingerRound(first: number, second: number, call: Parity) {
  if (![first, second].every((n) => Number.isInteger(n) && n >= 0 && n <= 5)) throw new Error('Choose 0–5 fingers');
  const total = first + second;
  const parity: Parity = total % 2 === 0 ? 'even' : 'odd';
  return { total, parity, winner: parity === call ? 0 : 1 };
}
