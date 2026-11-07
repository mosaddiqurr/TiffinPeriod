export const CATEGORIES = ['name', 'country', 'flower', 'fruit'] as const;
export type Answers = [string, string, string, string];
export type Letter = { bn: string; roman: string; words: [string[], string[], string[], string[]] };
// Original, deliberately small offline reference list. Unknown words go to human review.
export const LETTERS: Letter[] = [
  { bn: 'আ', roman: 'Aa', words: [['আকাশ', 'আয়েশা', 'আনিস', 'akash', 'ayesha', 'anis'], ['আর্জেন্টিনা', 'আয়ারল্যান্ড', 'argentina', 'ireland'], ['আকন্দ', 'আকাশমণি', 'akondo', 'akand', 'akashmoni'], ['আম', 'আনারস', 'আতা', 'aam', 'am', 'anarosh', 'anaras', 'ata']] },
  { bn: 'ক', roman: 'K', words: [['করিম', 'কামাল', 'কবির', 'karim', 'kamal', 'kabir'], ['কানাডা', 'কাতার', 'কুয়েত', 'canada', 'kanada', 'qatar', 'kuwait'], ['কদম', 'কামিনী', 'কৃষ্ণচূড়া', 'kodom', 'kadam', 'kamini', 'krishnochura'], ['কাঁঠাল', 'কলা', 'কামরাঙা', 'kathal', 'kola', 'kamranga']] },
  { bn: 'চ', roman: 'Ch', words: [['চন্দন', 'চম্পা', 'চৈতি', 'chandan', 'champa', 'chaiti'], ['চীন', 'চিলি', 'chin', 'china', 'chile'], ['চামেলি', 'চাঁপা', 'চন্দ্রমল্লিকা', 'chameli', 'chapa', 'chandramallika'], ['চালতা', 'চেরি', 'chalta', 'cherry']] },
  { bn: 'জ', roman: 'J', words: [['জামাল', 'জয়', 'জসিম', 'jamal', 'joy', 'jasim'], ['জাপান', 'জার্মানি', 'জর্ডান', 'japan', 'germany', 'jarmani', 'jordan'], ['জবা', 'জুঁই', 'জারুল', 'joba', 'jui', 'jarul'], ['জাম', 'জামরুল', 'জলপাই', 'jambura', 'জাম্বুরা', 'jam', 'jamrul', 'jolpai']] },
  { bn: 'ন', roman: 'N', words: [['নাবিল', 'নাসিম', 'নাদিয়া', 'nabil', 'nasim', 'nadia'], ['নেপাল', 'নরওয়ে', 'নাইজেরিয়া', 'nepal', 'norway', 'nigeria'], ['নয়নতারা', 'নাগেশ্বর', 'নাগলিঙ্গম', 'noyontara', 'nayantara', 'nageshwar'], ['নারকেল', 'নাশপাতি', 'narikel', 'narkel', 'nashpati']] },
  { bn: 'প', roman: 'P', words: [['পলাশ', 'পিয়াল', 'পূজা', 'palash', 'piyal', 'puja'], ['পাকিস্তান', 'পর্তুগাল', 'পেরু', 'pakistan', 'portugal', 'peru'], ['পদ্ম', 'পলাশ', 'পপি', 'poddo', 'padma', 'palash', 'poppy'], ['পেয়ারা', 'পেঁপে', 'পিচ', 'peyara', 'pepe', 'peach']] },
  { bn: 'ব', roman: 'B', words: [['বাবুল', 'বিপ্লব', 'বৃষ্টি', 'babul', 'biplob', 'brishti'], ['বাংলাদেশ', 'ব্রাজিল', 'বেলজিয়াম', 'bangladesh', 'brazil', 'belgium'], ['বেলি', 'বকুল', 'বাগানবিলাস', 'beli', 'bokul', 'baganbilash'], ['বরই', 'বেল', 'বাতাবি লেবু', 'boroi', 'bel', 'batabi lebu']] },
  { bn: 'ম', roman: 'M', words: [['মিনা', 'মিতু', 'মাহিম', 'মামুন', 'mina', 'mitu', 'mahim', 'mamun'], ['মিশর', 'মালয়েশিয়া', 'মালদ্বীপ', 'মেক্সিকো', 'mishor', 'malaysia', 'maldives', 'mexico'], ['মাধবীলতা', 'মল্লিকা', 'মোরগফুল', 'madhobilota', 'mallika', 'morogful'], ['মাল্টা', 'মিষ্টি লেবু', 'malta', 'mishti lebu']] },
  { bn: 'র', roman: 'R', words: [['রুবেল', 'রহিম', 'রিনা', 'রাফি', 'rubel', 'rahim', 'rina', 'rafi'], ['রাশিয়া', 'রোমানিয়া', 'রুয়ান্ডা', 'russia', 'romania', 'rwanda'], ['রজনীগন্ধা', 'রঙ্গন', 'rojonigondha', 'rajanigandha', 'rongon'], ['রাম্বুটান', 'rambutan']] },
  { bn: 'শ', roman: 'Sh', words: [['শামীম', 'শিলা', 'শাহিন', 'shamim', 'shila', 'shahin'], ['শ্রীলঙ্কা', 'sri lanka', 'srilanka'], ['শাপলা', 'শিউলি', 'shapla', 'shiuli'], ['শরিফা', 'শসা', 'shorifa', 'sharifa', 'shosha']] },
  { bn: 'স', roman: 'S', words: [['সুমন', 'সাবিনা', 'সাকিব', 'সাদিয়া', 'sumon', 'suman', 'sabina', 'sakib', 'sadia'], ['সৌদি আরব', 'সিঙ্গাপুর', 'সুইডেন', 'saudi arab', 'saudi arabia', 'singapore', 'sweden'], ['সূর্যমুখী', 'সন্ধ্যামালতী', 'সাদা গোলাপ', 'surjomukhi', 'surjamukhi', 'sondhamaloti'], ['সফেদা', 'সীতাফল', 'sofeda', 'safeda', 'sitafal']] },
  { bn: 'ল', roman: 'L', words: [['লিমা', 'লাবনী', 'লিটন', 'lima', 'laboni', 'liton'], ['লাওস', 'লেবানন', 'লাইবেরিয়া', 'laos', 'lebanon', 'liberia'], ['লিলি', 'ল্যাভেন্ডার', 'lily', 'lavender'], ['লিচু', 'লেবু', 'lichu', 'lebu']] },
];

export const blankAnswers = (): Answers => ['', '', '', ''];
export function normalizeWord(s: string): string {
  return s.normalize('NFC').replace(/[\u200B-\u200D\uFEFF]/g, '').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}
export function knownWord(letter: Letter, category: number, answer: string): boolean {
  return letter.words[category].some((w) => normalizeWord(w) === normalizeWord(answer));
}
export function matchesLetter(letter: Letter, answer: string): boolean {
  const word = normalizeWord(answer);
  return word.length >= 2 && (word.startsWith(letter.bn) || word.startsWith(letter.roman.toLowerCase()));
}
export function canReview(letter: Letter, category: number, answer: string): boolean {
  return knownWord(letter, category, answer) || matchesLetter(letter, answer);
}
const ALIAS_GROUPS = [
  'আকাশ|akash', 'আয়েশা|ayesha', 'আনিস|anis', 'আর্জেন্টিনা|argentina', 'আয়ারল্যান্ড|ireland', 'আকন্দ|akondo|akand', 'আকাশমণি|akashmoni', 'আম|aam|am', 'আনারস|anarosh|anaras', 'আতা|ata',
  'করিম|karim', 'কামাল|kamal', 'কবির|kabir', 'কানাডা|canada|kanada', 'কাতার|qatar', 'কুয়েত|kuwait', 'কদম|kodom|kadam', 'কামিনী|kamini', 'কৃষ্ণচূড়া|krishnochura', 'কাঁঠাল|kathal', 'কলা|kola', 'কামরাঙা|kamranga',
  'চন্দন|chandan', 'চম্পা|champa', 'চৈতি|chaiti', 'চীন|chin|china', 'চিলি|chile', 'চামেলি|chameli', 'চাঁপা|chapa', 'চন্দ্রমল্লিকা|chandramallika', 'চালতা|chalta', 'চেরি|cherry',
  'জামাল|jamal', 'জয়|joy', 'জসিম|jasim', 'জাপান|japan', 'জার্মানি|germany|jarmani', 'জর্ডান|jordan', 'জবা|joba', 'জুঁই|jui', 'জারুল|jarul', 'জাম|jam', 'জামরুল|jamrul', 'জলপাই|jolpai', 'জাম্বুরা|jambura',
  'নাবিল|nabil', 'নাসিম|nasim', 'নাদিয়া|nadia', 'নেপাল|nepal', 'নরওয়ে|norway', 'নাইজেরিয়া|nigeria', 'নয়নতারা|noyontara|nayantara', 'নাগেশ্বর|nageshwar', 'নারকেল|narikel|narkel', 'নাশপাতি|nashpati',
  'পলাশ|palash', 'পিয়াল|piyal', 'পূজা|puja', 'পাকিস্তান|pakistan', 'পর্তুগাল|portugal', 'পেরু|peru', 'পদ্ম|poddo|padma', 'পপি|poppy', 'পেয়ারা|peyara', 'পেঁপে|pepe', 'পিচ|peach',
  'বাবুল|babul', 'বিপ্লব|biplob', 'বৃষ্টি|brishti', 'বাংলাদেশ|bangladesh', 'ব্রাজিল|brazil', 'বেলজিয়াম|belgium', 'বেলি|beli', 'বকুল|bokul', 'বাগানবিলাস|baganbilash', 'বরই|boroi', 'বেল|bel', 'বাতাবি লেবু|batabi lebu',
  'মিনা|mina', 'মিতু|mitu', 'মাহিম|mahim', 'মামুন|mamun', 'মিশর|mishor', 'মালয়েশিয়া|malaysia', 'মালদ্বীপ|maldives', 'মেক্সিকো|mexico', 'মাধবীলতা|madhobilota', 'মল্লিকা|mallika', 'মোরগফুল|morogful', 'মাল্টা|malta', 'মিষ্টি লেবু|mishti lebu',
  'রুবেল|rubel', 'রহিম|rahim', 'রিনা|rina', 'রাফি|rafi', 'রাশিয়া|russia', 'রোমানিয়া|romania', 'রুয়ান্ডা|rwanda', 'রজনীগন্ধা|rojonigondha|rajanigandha', 'রঙ্গন|rongon', 'রাম্বুটান|rambutan',
  'শামীম|shamim', 'শিলা|shila', 'শাহিন|shahin', 'শ্রীলঙ্কা|sri lanka|srilanka', 'শাপলা|shapla', 'শিউলি|shiuli', 'শরিফা|shorifa|sharifa', 'শসা|shosha',
  'সুমন|sumon|suman', 'সাবিনা|sabina', 'সাকিব|sakib', 'সাদিয়া|sadia', 'সৌদি আরব|saudi arab|saudi arabia', 'সিঙ্গাপুর|singapore', 'সুইডেন|sweden', 'সূর্যমুখী|surjomukhi|surjamukhi', 'সন্ধ্যামালতী|sondhamaloti', 'সফেদা|sofeda|safeda', 'সীতাফল|sitafal',
  'লিমা|lima', 'লাবনী|laboni', 'লিটন|liton', 'লাওস|laos', 'লেবানন|lebanon', 'লাইবেরিয়া|liberia', 'লিলি|lily', 'ল্যাভেন্ডার|lavender', 'লিচু|lichu', 'লেবু|lebu',
];
const canonical = new Map(ALIAS_GROUPS.flatMap((group) => {
  const words = group.split('|').map(normalizeWord);
  return words.map((word) => [word, words[0]] as const);
}));
function sameAnswer(a: string, b: string) {
  const first = normalizeWord(a), second = normalizeWord(b);
  return (canonical.get(first) ?? first) === (canonical.get(second) ?? second);
}
export function scoreWords(letter: Letter, answers: Answers[], accepted: boolean[][]): number[][] {
  return answers.map((row, player) => row.map((answer, cat) => {
    if (!accepted[player]?.[cat] || !canReview(letter, cat, answer)) return 0;
    const duplicate = answers.some((other, i) => i !== player && accepted[i]?.[cat] && canReview(letter, cat, other[cat]) && sameAnswer(answer, other[cat]));
    return duplicate ? 5 : 10;
  }));
}
