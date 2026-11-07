export const ROLES = ['babu', 'police', 'dakat', 'chor'] as const;
export type Role = typeof ROLES[number];
export const ROLE_POINTS: Record<Role, number> = { babu: 1000, police: 100, dakat: 500, chor: 0 };

export function dealRoles(random: () => number = Math.random): Role[] {
  const roles: Role[] = [...ROLES];
  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [roles[i], roles[j]] = [roles[j], roles[i]];
  }
  return roles;
}

/** Babu is public; the police has to distinguish the two hidden suspects. */
export function suspects(roles: Role[]): number[] {
  return roles.flatMap((r, i) => r === 'chor' || r === 'dakat' ? [i] : []);
}

export function scoreChits(roles: Role[], guess: number): { correct: boolean; points: number[] } {
  if (roles.length !== 4 || new Set(roles).size !== 4 || !suspects(roles).includes(guess)) throw new Error('Invalid chit round');
  const correct = roles[guess] === 'chor';
  return { correct, points: roles.map((r) => r === 'police' ? (correct ? 100 : 0) : r === 'chor' ? (correct ? 0 : 100) : ROLE_POINTS[r]) };
}
