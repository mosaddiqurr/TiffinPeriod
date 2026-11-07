import type { Bi } from '../platform/i18n';
import { createRng } from '../engine/rng';

// National teams for the cricket and football games.
// Flags are drawn in code as small SVGs (30 × 20). There are no image files and
// no federation crests or logos: only the national flags and kit colours.
// Player names are invented and are not real players.

export type Sport = 'cricket' | 'football';

export interface Team {
  id: string;
  /** Three-letter label shown on scoreboards. */
  code: string;
  name: Bi;
  /** Kit colours: main and trim. */
  kit: [string, string];
  /** Strength from 1 (weak) to 10 (strong). */
  cricket?: number;
  football?: number;
  pool: NamePool;
}

type NamePool = 'bd' | 'sa' | 'en' | 'nl' | 'la' | 'eu' | 'af' | 'jp';

const T = (id: string, code: string, bn: string, en: string, kit: [string, string], pool: NamePool, cricket?: number, football?: number): Team =>
  ({ id, code, name: { bn, en }, kit, pool, cricket, football });

export const TEAMS: Team[] = [
  T('ban', 'BAN', 'বাংলাদেশ', 'Bangladesh', ['#006a4e', '#f42a41'], 'bd', 7, 4),
  T('ind', 'IND', 'ভারত', 'India', ['#1f5fbf', '#ff9933'], 'sa', 10, 4),
  T('pak', 'PAK', 'পাকিস্তান', 'Pakistan', ['#01411c', '#ffffff'], 'sa', 8),
  T('sl', 'SL', 'শ্রীলঙ্কা', 'Sri Lanka', ['#123d8c', '#ffbe29'], 'sa', 7),
  T('afg', 'AFG', 'আফগানিস্তান', 'Afghanistan', ['#1e50a0', '#d32011'], 'sa', 7),
  T('aus', 'AUS', 'অস্ট্রেলিয়া', 'Australia', ['#f6c700', '#00843d'], 'en', 10, 6),
  T('eng', 'ENG', 'ইংল্যান্ড', 'England', ['#1d2c5e', '#ce1124'], 'en', 9, 9),
  T('nz', 'NZ', 'নিউজিল্যান্ড', 'New Zealand', ['#1a1a1a', '#ffffff'], 'en', 9),
  T('rsa', 'SA', 'দক্ষিণ আফ্রিকা', 'South Africa', ['#007a4d', '#ffb612'], 'en', 9),
  T('wi', 'WI', 'ওয়েস্ট ইন্ডিজ', 'West Indies', ['#7b1e3c', '#f5c518'], 'en', 7),
  T('zim', 'ZIM', 'জিম্বাবুয়ে', 'Zimbabwe', ['#d40000', '#ffd200'], 'en', 5),
  T('ire', 'IRE', 'আয়ারল্যান্ড', 'Ireland', ['#169b62', '#ffffff'], 'en', 5),
  T('ned', 'NED', 'নেদারল্যান্ডস', 'Netherlands', ['#f36c21', '#21468b'], 'nl', 5, 9),
  T('sco', 'SCO', 'স্কটল্যান্ড', 'Scotland', ['#2a2f6e', '#ffffff'], 'en', 4),
  T('nep', 'NEP', 'নেপাল', 'Nepal', ['#dc143c', '#003893'], 'sa', 4),
  T('uae', 'UAE', 'আমিরাত', 'UAE', ['#8a8d91', '#ff0000'], 'sa', 3),
  T('usa', 'USA', 'যুক্তরাষ্ট্র', 'USA', ['#1f2a5c', '#b22234'], 'en', 4, 7),
  T('arg', 'ARG', 'আর্জেন্টিনা', 'Argentina', ['#74acdf', '#ffffff'], 'la', undefined, 10),
  T('bra', 'BRA', 'ব্রাজিল', 'Brazil', ['#ffdc02', '#009c3b'], 'la', undefined, 10),
  T('fra', 'FRA', 'ফ্রান্স', 'France', ['#1c3f94', '#ef4135'], 'eu', undefined, 10),
  T('ger', 'GER', 'জার্মানি', 'Germany', ['#f4f4f4', '#1a1a1a'], 'eu', undefined, 9),
  T('esp', 'ESP', 'স্পেন', 'Spain', ['#c60b1e', '#ffc400'], 'eu', undefined, 10),
  T('por', 'POR', 'পর্তুগাল', 'Portugal', ['#a50021', '#006600'], 'eu', undefined, 9),
  T('ita', 'ITA', 'ইতালি', 'Italy', ['#1f62c4', '#ffffff'], 'eu', undefined, 8),
  T('bel', 'BEL', 'বেলজিয়াম', 'Belgium', ['#d0202e', '#fdda24'], 'eu', undefined, 8),
  T('cro', 'CRO', 'ক্রোয়েশিয়া', 'Croatia', ['#e8112d', '#ffffff'], 'eu', undefined, 8),
  T('uru', 'URU', 'উরুগুয়ে', 'Uruguay', ['#5cbfeb', '#1a1a1a'], 'la', undefined, 8),
  T('mar', 'MAR', 'মরক্কো', 'Morocco', ['#c1272d', '#006233'], 'af', undefined, 8),
  T('jpn', 'JPN', 'জাপান', 'Japan', ['#0b3c8c', '#ffffff'], 'jp', undefined, 7),
  T('kor', 'KOR', 'দক্ষিণ কোরিয়া', 'South Korea', ['#cd2e3a', '#0047a0'], 'jp', undefined, 7),
  T('sen', 'SEN', 'সেনেগাল', 'Senegal', ['#ffffff', '#00853f'], 'af', undefined, 7),
  T('nga', 'NGA', 'নাইজেরিয়া', 'Nigeria', ['#008751', '#ffffff'], 'af', undefined, 7),
  T('col', 'COL', 'কলম্বিয়া', 'Colombia', ['#fcd116', '#003893'], 'la', undefined, 7),
  T('mex', 'MEX', 'মেক্সিকো', 'Mexico', ['#006847', '#ce1126'], 'la', undefined, 7),
  T('den', 'DEN', 'ডেনমার্ক', 'Denmark', ['#c8102e', '#ffffff'], 'eu', undefined, 7),
  T('swe', 'SWE', 'সুইডেন', 'Sweden', ['#fecc00', '#006aa7'], 'eu', undefined, 6),
  T('gha', 'GHA', 'ঘানা', 'Ghana', ['#f4f4f4', '#ce1126'], 'af', undefined, 6),
];

export const getTeam = (id: string): Team => TEAMS.find((t) => t.id === id) ?? TEAMS[0];
export const teamsFor = (sport: Sport): Team[] => TEAMS.filter((t) => (sport === 'cricket' ? t.cricket : t.football) !== undefined);
export const ratingOf = (t: Team, sport: Sport): number => (sport === 'cricket' ? t.cricket : t.football) ?? 5;

/** A good default opponent: the strongest team that is not the player's team. */
export function defaultOpponent(sport: Sport, mine: string): string {
  const list = teamsFor(sport).filter((t) => t.id !== mine).sort((a, b) => ratingOf(b, sport) - ratingOf(a, sport));
  return list[0].id;
}

// ---------- Flags ----------

const rect = (x: number, y: number, w: number, h: number, c: string) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`;
const hb = (cols: string[], w: number[] = cols.map(() => 1)) => {
  const tot = w.reduce((a, b) => a + b, 0);
  let y = 0;
  return cols.map((c, i) => { const h = (20 * w[i]) / tot; const r = rect(0, y, 30, h + 0.05, c); y += h; return r; }).join('');
};
const vb = (cols: string[], w: number[] = cols.map(() => 1)) => {
  const tot = w.reduce((a, b) => a + b, 0);
  let x = 0;
  return cols.map((c, i) => { const ww = (30 * w[i]) / tot; const r = rect(x, 0, ww + 0.05, 20, c); x += ww; return r; }).join('');
};
const circle = (cx: number, cy: number, r: number, c: string, extra = '') => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${c}" ${extra}/>`;
function star(cx: number, cy: number, r: number, c: string, pts = 5, extra = ''): string {
  const p: string[] = [];
  for (let i = 0; i < pts * 2; i++) {
    const rr = i % 2 === 0 ? r : r * (pts === 5 ? 0.4 : 0.45);
    const a = -Math.PI / 2 + (i * Math.PI) / pts;
    p.push(`${(cx + Math.cos(a) * rr).toFixed(2)},${(cy + Math.sin(a) * rr).toFixed(2)}`);
  }
  return `<polygon points="${p.join(' ')}" fill="${c}" ${extra}/>`;
}
const nordic = (bg: string, cross: string) => rect(0, 0, 30, 20, bg) + rect(9, 0, 3.4, 20, cross) + rect(0, 8.3, 30, 3.4, cross);
const union = () =>
  `<svg x="0" y="0" width="15" height="10" viewBox="0 0 30 20">${rect(0, 0, 30, 20, '#012169')}` +
  `<path d="M0,0 L30,20 M30,0 L0,20" stroke="#fff" stroke-width="4"/><path d="M0,0 L30,20 M30,0 L0,20" stroke="#c8102e" stroke-width="1.4"/>` +
  `${rect(12, 0, 6, 20, '#fff')}${rect(0, 7, 30, 6, '#fff')}${rect(13.2, 0, 3.6, 20, '#c8102e')}${rect(0, 8.2, 30, 3.6, '#c8102e')}</svg>`;

const FLAGS: Record<string, () => string> = {
  ban: () => rect(0, 0, 30, 20, '#006a4e') + circle(13.5, 10, 6, '#f42a41'),
  ind: () => hb(['#ff9933', '#ffffff', '#138808']) + circle(15, 10, 2.6, 'none', 'stroke="#000080" stroke-width="0.6"') + circle(15, 10, 0.6, '#000080'),
  pak: () => rect(0, 0, 7.5, 20, '#fff') + rect(7.5, 0, 22.5, 20, '#01411c') + circle(18.5, 10.5, 5.2, '#fff') + circle(19.9, 9.2, 4.6, '#01411c') + star(21.6, 7.6, 1.7, '#fff'),
  sl: () => rect(0, 0, 30, 20, '#ffbe29') + rect(1, 1, 4, 18, '#00534e') + rect(5, 1, 4, 18, '#eb7400') + rect(10, 1, 19, 18, '#8d153a') + `<path d="M15,14 q1,-6 4,-6 q3,0 3,-2 q2,1 1,3 q2,1 1,5 h-2 v-2 h-4 v2z" fill="#ffbe29"/>`,
  afg: () => vb(['#000000', '#be0000', '#007a36']) + circle(15, 10, 3, 'none', 'stroke="#fff" stroke-width="0.7"'),
  aus: () => rect(0, 0, 30, 20, '#012169') + union() + star(7.5, 15, 2.3, '#fff', 7) + star(22.5, 4.5, 1.1, '#fff', 7) + star(19.5, 9.5, 1.1, '#fff', 7) + star(25.5, 8.5, 1.1, '#fff', 7) + star(22.5, 16, 1.2, '#fff', 7) + star(24, 12, 0.6, '#fff'),
  eng: () => rect(0, 0, 30, 20, '#fff') + rect(13, 0, 4, 20, '#ce1124') + rect(0, 8, 30, 4, '#ce1124'),
  nz: () => rect(0, 0, 30, 20, '#012169') + union() + [[22.5, 4.5], [19.5, 9.5], [25.5, 8.5], [22.5, 16]].map(([x, y]) => star(x, y, 1.4, '#c8102e', 5, 'stroke="#fff" stroke-width="0.4"')).join(''),
  rsa: () => rect(0, 0, 30, 10, '#e03c31') + rect(0, 10, 30, 10, '#001489') +
    `<path d="M0,0 L11,10 L30,10 M0,20 L11,10" stroke="#fff" stroke-width="6.6" fill="none"/><path d="M0,0 L11,10 L30,10 M0,20 L11,10" stroke="#007749" stroke-width="4" fill="none"/>` +
    `<polygon points="0,1.6 9.2,10 0,18.4" fill="#ffb81c"/><polygon points="0,3.4 7.2,10 0,16.6" fill="#000"/>`,
  wi: () => rect(0, 0, 30, 20, '#7b1e3c') + circle(15, 9, 4.6, '#f5c518') + `<path d="M8,20 Q15,12 22,20 Z" fill="#2e7d32"/>`,
  zim: () => hb(['#006400', '#ffd200', '#d40000', '#000000', '#d40000', '#ffd200', '#006400']) + `<polygon points="0,0 11,10 0,20" fill="#fff" stroke="#000" stroke-width="0.6"/>` + star(4, 10, 2.6, '#d40000'),
  ire: () => vb(['#169b62', '#ffffff', '#ff883e']),
  ned: () => hb(['#ae1c28', '#ffffff', '#21468b']),
  sco: () => rect(0, 0, 30, 20, '#005eb8') + `<path d="M0,0 L30,20 M30,0 L0,20" stroke="#fff" stroke-width="3.4"/>`,
  nep: () => rect(0, 0, 30, 20, '#f6efdc') + `<polygon points="8,1 21.5,9.6 12.5,9.6 21.5,19 8,19" fill="#dc143c" stroke="#003893" stroke-width="1.2" stroke-linejoin="round"/>` + circle(11.5, 7, 1.6, '#fff') + star(11.5, 14.8, 2, '#fff', 12),
  uae: () => rect(0, 0, 7.5, 20, '#ff0000') + `<svg x="7.5" width="22.5" height="20" viewBox="0 0 30 20" preserveAspectRatio="none">${hb(['#00732f', '#ffffff', '#000000'])}</svg>`,
  usa: () => hb(Array.from({ length: 13 }, (_, i) => (i % 2 ? '#ffffff' : '#b22234'))) + rect(0, 0, 12, 10.8, '#3c3b6e') + Array.from({ length: 20 }, (_, i) => circle(1.3 + (i % 5) * 2.4, 1.4 + Math.floor(i / 5) * 2.6, 0.45, '#fff')).join(''),
  arg: () => hb(['#74acdf', '#ffffff', '#74acdf']) + circle(15, 10, 2.2, '#f6b40e'),
  bra: () => rect(0, 0, 30, 20, '#009c3b') + `<polygon points="3,10 15,2.2 27,10 15,17.8" fill="#ffdf00"/>` + circle(15, 10, 5, '#002776') + `<path d="M10.2,8.8 Q15,7.6 19.8,11.2" stroke="#fff" stroke-width="0.9" fill="none"/>`,
  fra: () => vb(['#0055a4', '#ffffff', '#ef4135']),
  ger: () => hb(['#000000', '#dd0000', '#ffce00']),
  esp: () => hb(['#aa151b', '#f1bf00', '#aa151b'], [1, 2, 1]) + rect(6, 7.2, 3.2, 5.4, '#aa151b'),
  por: () => rect(0, 0, 12, 20, '#006600') + rect(12, 0, 18, 20, '#ff0000') + circle(12, 10, 3.6, '#ffe000') + rect(10.6, 8.3, 2.8, 3.4, '#fff'),
  ita: () => vb(['#009246', '#ffffff', '#ce2b37']),
  bel: () => vb(['#000000', '#fdda24', '#ef3340']),
  cro: () => hb(['#ff0000', '#ffffff', '#171796']) + Array.from({ length: 15 }, (_, i) => rect(12.5 + (i % 5), 5.5 + Math.floor(i / 5) * 1.6, 1, 1.6, (i % 2) ? '#fff' : '#ff0000')).join(''),
  uru: () => hb(Array.from({ length: 9 }, (_, i) => (i % 2 ? '#0038a8' : '#ffffff'))) + rect(0, 0, 11, 11.1, '#fff') + circle(5.5, 5.5, 2.6, '#fcd116'),
  mar: () => rect(0, 0, 30, 20, '#c1272d') + star(15, 10.5, 4.6, 'none', 5, 'stroke="#006233" stroke-width="0.9"'),
  jpn: () => rect(0, 0, 30, 20, '#fff') + circle(15, 10, 6, '#bc002d'),
  kor: () => rect(0, 0, 30, 20, '#fff') + `<path d="M10,10 A5,5 0 0,1 20,10 A2.5,2.5 0 0,1 15,10 A2.5,2.5 0 0,0 10,10 Z" fill="#cd2e3a"/><path d="M20,10 A5,5 0 0,1 10,10 A2.5,2.5 0 0,1 15,10 A2.5,2.5 0 0,0 20,10 Z" fill="#0047a0"/>` +
    [[4.5, 4], [25.5, 4], [4.5, 16], [25.5, 16]].map(([x, y], i) => `<g transform="rotate(${i === 0 || i === 3 ? -34 : 34} ${x} ${y})">${rect(x - 2.4, y - 1.6, 4.8, 0.7, '#000')}${rect(x - 2.4, y - 0.35, 4.8, 0.7, '#000')}${rect(x - 2.4, y + 0.9, 4.8, 0.7, '#000')}</g>`).join(''),
  sen: () => vb(['#00853f', '#fdef42', '#e31b23']) + star(15, 10.4, 2.8, '#00853f'),
  nga: () => vb(['#008751', '#ffffff', '#008751']),
  col: () => hb(['#fcd116', '#003893', '#ce1126'], [2, 1, 1]),
  mex: () => vb(['#006847', '#ffffff', '#ce1126']) + circle(15, 10, 2.6, '#8c5a2b') + circle(15, 10, 1.5, '#6a8f2a'),
  den: () => nordic('#c8102e', '#ffffff'),
  swe: () => nordic('#006aa7', '#fecc00'),
  gha: () => hb(['#ce1126', '#fcd116', '#006b3f']) + star(15, 10.4, 3, '#000'),
};

/** The flag as SVG markup with a 30 × 20 view box. */
export function flagSvg(id: string): string {
  const body = (FLAGS[id] ?? FLAGS.ban)();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 20" width="30" height="20">${body}</svg>`;
}

const urlCache = new Map<string, string>();
export function flagUrl(id: string): string {
  let u = urlCache.get(id);
  if (!u) { u = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(flagSvg(id))}`; urlCache.set(id, u); }
  return u;
}

/** A loaded flag image for canvas games. */
const imgCache = new Map<string, HTMLImageElement>();
export function flagImage(id: string): HTMLImageElement | null {
  if (typeof Image === 'undefined') return null;
  let img = imgCache.get(id);
  if (!img) { img = new Image(); img.src = flagUrl(id); imgCache.set(id, img); }
  return img;
}

// ---------- Invented player names ----------

const POOLS: Record<NamePool, { bn: string[]; en: string[] }> = {
  bd: { bn: ['রাফি', 'তানভীর', 'জামিল', 'শুভ', 'আরিফ', 'পলাশ', 'ইমরান', 'সাজিদ', 'ফাহিম', 'তুষার', 'রাসেল'], en: ['Rafi', 'Tanvir', 'Jamil', 'Shuvo', 'Arif', 'Palash', 'Imran', 'Sajid', 'Fahim', 'Tushar', 'Rasel'] },
  sa: { bn: ['আমান', 'রোহিত', 'কবির', 'দেব', 'ফারুক', 'বিক্রম', 'সমীর', 'আসিফ', 'নবীন', 'জুবায়ের', 'অনিল'], en: ['Aman', 'Rohit', 'Kabir', 'Dev', 'Farooq', 'Vikram', 'Sameer', 'Asif', 'Naveen', 'Zubair', 'Anil'] },
  en: { bn: ['জ্যাক', 'হ্যারি', 'টম', 'বেন', 'স্যাম', 'লিয়াম', 'ওলি', 'জো', 'ম্যাক্স', 'চার্লি', 'ড্যান'], en: ['Jack', 'Harry', 'Tom', 'Ben', 'Sam', 'Liam', 'Ollie', 'Joe', 'Max', 'Charlie', 'Dan'] },
  nl: { bn: ['ইয়ান', 'পিটার', 'বাস', 'টিম', 'লুক', 'রুড', 'ফ্লোর', 'সেম', 'থিস', 'ইয়োস্ট', 'নিলস'], en: ['Jan', 'Pieter', 'Bas', 'Tim', 'Luuk', 'Ruud', 'Floor', 'Sem', 'Thijs', 'Joost', 'Niels'] },
  la: { bn: ['মাতেও', 'লুকাস', 'দিয়েগো', 'গাব্রিয়েল', 'থিয়াগো', 'রাফায়েল', 'ব্রুনো', 'কার্লোস', 'পাবলো', 'হুয়ান', 'নিকোলাস'], en: ['Mateo', 'Lucas', 'Diego', 'Gabriel', 'Thiago', 'Rafael', 'Bruno', 'Carlos', 'Pablo', 'Juan', 'Nicolas'] },
  eu: { bn: ['লুকা', 'হুগো', 'মার্কো', 'ইয়োনাস', 'লিও', 'আন্দ্রে', 'ফেলিক্স', 'নোয়া', 'এমিল', 'পল', 'ইভান'], en: ['Luca', 'Hugo', 'Marco', 'Jonas', 'Leo', 'Andre', 'Felix', 'Noah', 'Emil', 'Paul', 'Ivan'] },
  af: { bn: ['ইউসুফ', 'কোফি', 'আমাদু', 'সালিফ', 'ইদ্রিস', 'মুসা', 'চিদি', 'কারিম', 'ওমার', 'ইসা', 'বাকারি'], en: ['Youssef', 'Kofi', 'Amadou', 'Salif', 'Idris', 'Musa', 'Chidi', 'Karim', 'Omar', 'Issa', 'Bakary'] },
  jp: { bn: ['হিরো', 'কেন', 'তাকুমি', 'মিনজুন', 'ইউকি', 'সোরা', 'জিহো', 'রেন', 'দাইকি', 'হায়েন', 'কাইতো'], en: ['Hiro', 'Ken', 'Takumi', 'Minjun', 'Yuki', 'Sora', 'Jiho', 'Ren', 'Daiki', 'Hayun', 'Kaito'] },
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Eleven invented names for a team, always in the same order for that team. */
export function lineup(team: Team, lang: 'bn' | 'en'): string[] {
  const pool = POOLS[team.pool];
  const idx = pool.en.map((_, i) => i);
  const rng = createRng(hash(team.id));
  for (let i = idx.length - 1; i > 0; i--) { const j = rng.int(0, i); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  return idx.map((i) => pool[lang][i]);
}

export { hash as hashString };
