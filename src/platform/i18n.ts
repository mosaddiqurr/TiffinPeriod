import { useSettings, settingsStore, type Lang } from './settings';

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

/** Convert ASCII digits in a string to Bangla digits. */
export function toBnDigits(s: string | number): string {
  return String(s).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);
}

export function fmtNum(n: number | string, lang: Lang): string {
  return lang === 'bn' ? toBnDigits(n) : String(n);
}

export type Bi = { bn: string; en: string };

/** A per-module string table: one entry per language with the same keys. */
export type StringTable<K extends string> = { en: Record<K, string>; bn: Record<K, string> };

/** Replace {name} tokens. Numbers are shown with the digits of the language. */
export function fill(template: string, vars: Record<string, string | number> | undefined, lang: Lang): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = vars[k];
    if (v === undefined) return `{${k}}`;
    return typeof v === 'number' ? fmtNum(v, lang) : v;
  });
}

export interface Translator<K extends string> {
  (key: K, vars?: Record<string, string | number>): string;
  lang: Lang;
  n: (v: number | string) => string;
  bi: (b: Bi) => string;
}

export function makeT<K extends string>(table: StringTable<K>, lang: Lang): Translator<K> {
  const fn = ((key: K, vars?: Record<string, string | number>) =>
    fill(table[lang][key] ?? table.en[key] ?? key, vars, lang)) as Translator<K>;
  fn.lang = lang;
  fn.n = (v) => fmtNum(v, lang);
  fn.bi = (b) => b[lang];
  return fn;
}

export function useT<K extends string>(table: StringTable<K>): Translator<K> {
  const { lang } = useSettings();
  return makeT(table, lang);
}

export function currentLang(): Lang {
  return settingsStore.get().lang;
}
