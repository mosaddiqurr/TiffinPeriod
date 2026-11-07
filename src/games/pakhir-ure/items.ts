import type { Bi } from '../../platform/i18n';

// The call list for Pakhir Ure ("the bird flies").
// Rule for this list: only clear cases. Animals whose flying is debatable
// (domestic chicken, domestic duck, goose) are left out. Tricky but clear
// cases are marked `tricky` and show an explanation after the call.
// Pictures: Microsoft Fluent Emoji (Flat), MIT licence. See art/LICENSE-fluentui-emoji.txt.

export interface Item {
  id: string;          // also the picture file name
  name: Bi;
  flies: boolean;
  kind: 'animal' | 'thing';
  tricky?: boolean;
  note?: Bi;
}

const A = (id: string, bn: string, en: string, flies: boolean, extra: Partial<Item> = {}): Item => ({ id, name: { bn, en }, flies, kind: 'animal', ...extra });
const T = (id: string, bn: string, en: string, flies: boolean, extra: Partial<Item> = {}): Item => ({ id, name: { bn, en }, flies, kind: 'thing', ...extra });

export const ITEMS: Item[] = [
  // Animals that fly
  A('bird', 'পাখি', 'Bird', true),
  A('parrot', 'টিয়া', 'Parrot', true),
  A('dove', 'ঘুঘু', 'Dove', true),
  A('eagle', 'ঈগল', 'Eagle', true),
  A('owl', 'পেঁচা', 'Owl', true),
  A('honeybee', 'মৌমাছি', 'Honeybee', true),
  A('butterfly', 'প্রজাপতি', 'Butterfly', true),
  A('mosquito', 'মশা', 'Mosquito', true),
  A('fly', 'মাছি', 'Housefly', true),
  A('beetle', 'গুবরে পোকা', 'Beetle', true, { tricky: true, note: { bn: 'গুবরে পোকার শক্ত পাখার নিচে উড়ার পাখা থাকে।', en: 'A beetle has flying wings under its hard wing covers.' } }),
  A('bat', 'বাদুড়', 'Bat', true, { tricky: true, note: { bn: 'বাদুড় পাখি না, স্তন্যপায়ী প্রাণী। তবু সে উড়তে পারে।', en: 'A bat is a mammal, not a bird. But it can fly.' } }),
  A('peacock', 'ময়ূর', 'Peacock', true, { tricky: true, note: { bn: 'ময়ূর ভারী হলেও অল্প দূর উড়ে গাছে বসতে পারে।', en: 'A peacock is heavy, but it can fly short distances up to trees.' } }),
  // Animals that do not fly
  A('cow', 'গরু', 'Cow', false),
  A('goat', 'ছাগল', 'Goat', false),
  A('cat', 'বিড়াল', 'Cat', false),
  A('dog', 'কুকুর', 'Dog', false),
  A('elephant', 'হাতি', 'Elephant', false),
  A('tiger', 'বাঘ', 'Tiger', false),
  A('fish', 'ইলিশ মাছ', 'Hilsa fish', false),
  A('frog', 'ব্যাঙ', 'Frog', false),
  A('snake', 'সাপ', 'Snake', false),
  A('crocodile', 'কুমির', 'Crocodile', false),
  A('horse', 'ঘোড়া', 'Horse', false),
  A('monkey', 'বানর', 'Monkey', false),
  A('rabbit', 'খরগোশ', 'Rabbit', false),
  A('turtle', 'কচ্ছপ', 'Turtle', false),
  A('rhinoceros', 'গণ্ডার', 'Rhinoceros', false),
  A('camel', 'উট', 'Camel', false),
  A('lion', 'সিংহ', 'Lion', false),
  A('snail', 'শামুক', 'Snail', false),
  A('deer', 'হরিণ', 'Deer', false),
  A('water_buffalo', 'মহিষ', 'Water buffalo', false),
  A('spider', 'মাকড়সা', 'Spider', false, { tricky: true, note: { bn: 'মাকড়সার পাখা নেই। সে জাল বোনে, ওড়ে না।', en: 'A spider has no wings. It makes webs, but it does not fly.' } }),
  A('mouse', 'ইঁদুর', 'Mouse', false),
  A('bear', 'ভালুক', 'Bear', false),
  A('giraffe', 'জিরাফ', 'Giraffe', false),
  A('penguin', 'পেঙ্গুইন', 'Penguin', false, { tricky: true, note: { bn: 'পেঙ্গুইন পাখি, কিন্তু উড়তে পারে না। সে সাঁতার কাটে।', en: 'A penguin is a bird, but it cannot fly. It swims.' } }),
  // Things (harder levels)
  T('kite', 'ঘুড়ি', 'Kite', true),
  T('airplane', 'উড়োজাহাজ', 'Aeroplane', true),
  T('helicopter', 'হেলিকপ্টার', 'Helicopter', true),
  T('rocket', 'রকেট', 'Rocket', true),
  T('balloon', 'বেলুন', 'Balloon', true, { tricky: true, note: { bn: 'গ্যাস বেলুন সুতো ছাড়লেই আকাশে উড়ে যায়।', en: 'A gas balloon flies away when you let go of the string.' } }),
  T('brick', 'ইট', 'Brick', false),
  T('chair', 'চেয়ার', 'Chair', false),
  T('auto_rickshaw', 'সিএনজি', 'CNG auto-rickshaw', false),
  T('bicycle', 'সাইকেল', 'Bicycle', false),
  T('bus', 'বাস', 'Bus', false),
  T('canoe', 'নৌকা', 'Boat', false),
  T('closed_book', 'বই', 'Book', false),
];

const ART = import.meta.glob('./art/*.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export function artFor(id: string): string | undefined {
  return ART[`./art/${id}.svg`];
}

/**
 * Fetch and decode every picture once, when the game opens. Each picture otherwise loads only
 * when its call happens, and on a phone it would pop in after the words. The images are kept
 * here so the browser keeps them decoded.
 */
const kept: HTMLImageElement[] = [];
export function preloadArt() {
  if (kept.length || typeof Image === 'undefined') return;
  for (const url of Object.values(ART)) {
    const im = new Image();
    im.decoding = 'async';
    im.src = url;
    im.decode?.().catch(() => { /* still cached */ });
    kept.push(im);
  }
}
