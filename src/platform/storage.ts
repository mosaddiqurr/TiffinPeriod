// Safe local storage. Private windows and blocked storage can throw.
// All reads and writes go through this module, so a storage failure
// never breaks a game.

const PREFIX = 'tp.v1.';
const memory = new Map<string, string>();

function backend(): Storage | null {
  try {
    const s = globalThis.localStorage;
    if (!s) return null;
    const probe = PREFIX + '__probe';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

const store = backend();

export function readJSON<T>(key: string, fallback: T): T {
  const full = PREFIX + key;
  try {
    const raw = store ? store.getItem(full) : memory.get(full) ?? null;
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown): void {
  const full = PREFIX + key;
  const raw = JSON.stringify(value);
  try {
    if (store) store.setItem(full, raw);
    else memory.set(full, raw);
  } catch {
    memory.set(full, raw);
  }
}

export function clearAll(): void {
  try {
    if (store) {
      const keys: string[] = [];
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        if (k && k.startsWith(PREFIX)) keys.push(k);
      }
      keys.forEach((k) => store.removeItem(k));
    }
  } catch {
    /* ignore */
  }
  memory.clear();
}
