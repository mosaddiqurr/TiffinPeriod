import type { ComponentType } from 'react';
import type { Bi } from './i18n';

export type Phase = 1 | 2 | 3;
export type Category = 'bench' | 'sports' | 'para';

export interface GameProps {
  /** Leave the game and go back to the hub. */
  onExit: () => void;
}

export interface GameEntry {
  id: string;
  no: number;
  phase: Phase;
  category: Category;
  title: Bi;
  blurb: Bi;
  /** Built games have a lazy loader; planned games stay visible in the roadmap. */
  playable: boolean;
  modes: Array<'solo' | 'ai' | 'local2p' | 'local4p'>;
  accent: string;
  load?: () => Promise<{ default: ComponentType<GameProps> }>;
}

export const CATEGORIES: Record<Category, Bi> = {
  bench: { bn: 'ক্লাসের বেঞ্চে', en: 'On the class bench' },
  sports: { bn: 'বার্ষিক ক্রীড়া', en: 'School sports day' },
  para: { bn: 'পাড়া, ছাদ আর গলি', en: 'Para, rooftop and alley' },
};

export const GAMES: GameEntry[] = [
  {
    id: 'hand-cricket', no: 1, phase: 1, category: 'bench', playable: true, accent: '#c0392b',
    title: { bn: 'হ্যান্ড ক্রিকেট', en: 'Hand Cricket' },
    blurb: { bn: 'আঙুলে রান, মিললেই আউট।', en: 'Runs on your fingers. Same number? Out.' },
    modes: ['ai', 'local2p'],
    load: () => import('../games/hand-cricket/HandCricket'),
  },
  {
    id: 'book-cricket', no: 2, phase: 1, category: 'bench', playable: true, accent: '#8d5a2b',
    title: { bn: 'বই ক্রিকেট', en: 'Book Cricket' },
    blurb: { bn: 'বই খোলো, পাতার নম্বরেই রান।', en: 'Open the book. The page number gives the runs.' },
    modes: ['ai', 'local2p'],
    load: () => import('../games/book-cricket/BookCricket'),
  },
  {
    id: 'pakhir-ure', no: 3, phase: 1, category: 'bench', playable: true, accent: '#1f6f8b',
    title: { bn: 'পাখি উড়ে', en: 'Pakhir Ure' },
    blurb: { bn: 'যে উড়ে, তার নামে আঙুল তোলো।', en: 'Lift your finger only for things that fly.' },
    modes: ['solo', 'ai', 'local2p'],
    load: () => import('../games/pakhir-ure/PakhirUre'),
  },
  {
    id: 'tug-of-war', no: 4, phase: 1, category: 'sports', playable: true, accent: '#b9770e',
    title: { bn: 'দড়ি টানাটানি', en: 'Tug of War' },
    blurb: { bn: 'হেঁইয়ো! তালে তালে টানো।', en: 'Heave in time with the chant.' },
    modes: ['ai', 'local2p'],
    load: () => import('../games/tug-of-war/TugOfWar'),
  },
  {
    id: 'balloon-burst', no: 5, phase: 1, category: 'sports', playable: true, accent: '#d6336c',
    title: { bn: 'বেলুন ফাটানো', en: 'Balloon Burst' },
    blurb: { bn: 'আলপিন হাতে, মেঘলা বেলুন বাদে সব ফাটাও।', en: 'Pin in hand. Pop them all, but not the rain cloud.' },
    modes: ['solo', 'ai', 'local2p'],
    load: () => import('../games/balloon-burst/BalloonBurst'),
  },
  {
    id: 'biscuit-race', no: 6, phase: 1, category: 'sports', playable: true, accent: '#a0522d',
    title: { bn: 'বিস্কুট দৌড়', en: 'Biscuit Race' },
    blurb: { bn: 'হাত পিছনে, লাফ দাও, বিস্কুট কামড়াও।', en: 'Hands behind your back. Jump and bite the biscuit.' },
    modes: ['ai', 'local2p'],
    load: () => import('../games/biscuit-race/BiscuitRace'),
  },
  // ---- Phase 2 (planned) ----
  p(7, 'pen-fight', 2, 'bench', '#2c3e8f', 'কলম যুদ্ধ', 'Pen Fight', 'বেঞ্চের উপর টোকা দিয়ে কলম ফেলে দাও।', 'Flick your pen. Push the other pen off the bench.'),
  p(8, 'rubber-band', 2, 'bench', '#7d3c98', 'রাবার ব্যান্ড শুটিং', 'Rubber Band Shooting', 'টেনে ছাড়ো, নিশানায় লাগাও।', 'Stretch, aim and release at the targets.'),
  p(9, 'notebook-drawing', 2, 'bench', '#1f4e9c', 'খাতায় আঁকাআঁকি', 'Notebook Drawing Battle', 'একজন আঁকবে, বাকিরা ধরবে।', 'One friend draws. The others guess.'),
  p(10, 'elonti-belonti', 2, 'para', '#117a65', 'এলন্টি বেলন্টি', 'Elonti Belonti', 'ঘড়ি বাজে টিং টিং — তারপর থামো!', '“Ghori baje ting ting” — then freeze!'),
  p(11, 'spoon-marble', 2, 'sports', '#5d6d7e', 'চামচ-মার্বেল দৌড়', 'Spoon & Marble Race', 'মুখে চামচ, চামচে মার্বেল।', 'Spoon in mouth, marble on spoon.'),
  p(12, 'haari-bhanga', 2, 'sports', '#a04000', 'হাঁড়িভাঙা', 'Haari Bhanga', 'চোখ বাঁধা, শব্দ শুনে হাঁড়ি ভাঙো।', 'Blindfolded. Follow the sound and break the pot.'),
  p(13, 'paper-plane', 2, 'para', '#2e86c1', 'কাগজের উড়োজাহাজ', 'Paper Airplane Challenge', 'ভাঁজ করো, ছাদ থেকে উড়াও: দূরত্ব, নিশানা আর বাধা।', 'Fold it, launch it: distance, accuracy and obstacle challenges.'),
  p(14, 'paper-boat', 2, 'para', '#148f77', 'কাগজের নৌকা', 'Paper Boat Racing', 'বর্ষার পানিতে নৌকা ভাসাও।', 'Race paper boats in the monsoon water.'),
  p(15, 'musical-chairs', 2, 'sports', '#cb4335', 'মিউজিক্যাল চেয়ার', 'Musical Chairs', 'গান থামলেই চেয়ার দখল।', 'When the music stops, grab a chair.'),
  p(16, 'sack-race', 2, 'sports', '#9a7d0a', 'বস্তা দৌড়', 'Sack Race', 'বস্তায় পা, লাফিয়ে লাফিয়ে।', 'Feet in the sack. Hop to the finish.'),
  p(17, 'three-legged', 2, 'sports', '#6c3483', 'তিন পায়ে দৌড়', 'Three-Legged Race', 'বন্ধুর সাথে পা বাঁধা, তাল মিলিয়ে দৌড়।', 'Legs tied to a friend. Run in step.'),
  // ---- Phase 3 (planned) ----
  p(18, 'short-pitch', 3, 'para', '#196f3d', 'শর্ট-পিচ ক্রিকেট ৩ডি', 'Short-Pitch Cricket 3D', 'গোল মাঠ, মাটি দিয়ে চার — ছক্কা মারলে আউট!', 'A round para field. Fours along the ground — a six is out!'),
  p(19, 'tape-tennis', 3, 'para', '#1a5276', 'টেপ-টেনিস ক্রিকেট', 'Tape Tennis Cricket', 'টেপ পেঁচানো বলে রাস্তার ক্রিকেট।', 'Street cricket with a taped tennis ball.'),
  p(20, 'rooftop-cricket', 3, 'para', '#7b241c', 'ছাদ ক্রিকেট', 'Rooftop Cricket', 'বল ছাদের বাইরে গেলে আউট।', 'Ball off the roof? You are out.'),
  p(21, 'goli-cricket', 3, 'para', '#4d5656', 'গলি ক্রিকেট', 'Goli Cricket', 'ইটের উইকেট, দেয়ালে লাগলে রান।', 'Brick stumps. Runs off the walls.'),
  p(22, 'pillow-fight', 3, 'sports', '#af601a', 'বালিশ যুদ্ধ', 'Pillow Fight', 'বাঁশের উপর বসে বালিশ পেটা।', 'Sit on the bamboo pole. Swing the pillow.'),
  p(23, 'kabaddi', 3, 'para', '#0e6655', 'হা-ডু-ডু', 'Kabaddi / Ha-du-du', 'এক দমে ঢুকে ছুঁয়ে ফিরে এসো।', 'One breath. Go in, touch, come back.'),
  p(24, 'rooftop-badminton', 3, 'para', '#1b4f72', 'ছাদে ব্যাডমিন্টন', 'Rooftop Badminton', 'শীতের সন্ধ্যায় ছাদে শাটল।', 'Winter evening shuttle on the roof.'),
  { id: 'chor-police', no: 25, phase: 3, category: 'bench', playable: true, accent: '#1f3a93',
    title: { bn: 'চোর-পুলিশ', en: 'Chor Police' }, blurb: { bn: 'চার কাগজে গোপন পরিচয়। পুলিশ চোরকে ধরবে।', en: 'Four secret chits. Can the police find the thief?' },
    modes: ['ai', 'local4p'], load: () => import('../games/chor-police/ChorPolice') },
  { id: 'naam-desh', no: 26, phase: 3, category: 'bench', playable: true, accent: '#117a65',
    title: { bn: 'নাম দেশ ফুল ফল', en: 'Naam Desh Ful Fol' }, blurb: { bn: 'এক অক্ষরে নাম, দেশ, ফুল, ফল — ঘণ্টার আগে লেখো।', en: 'One Bangla letter. Name, country, flower, fruit. Beat the bell.' },
    modes: ['solo', 'local2p'], load: () => import('../games/naam-desh/NaamDesh') },
  { id: 'jor-bejor', no: 27, phase: 3, category: 'bench', playable: true, accent: '#a0522d',
    title: { bn: 'জোড়-বিজোড়', en: 'Jor-Bejor' }, blurb: { bn: 'হাত মেলাও, আঙুল গোনো। জোড় নাকি বিজোড়?', en: 'Hands out, fingers counted. Jor or Bejor?' },
    modes: ['ai', 'local2p'], load: () => import('../games/jor-bejor/JorBejor') },
  { id: 'bagh-bandi', no: 28, phase: 3, category: 'bench', playable: true, accent: '#0b5d43',
    title: { bn: 'বাঘবন্দী', en: 'Bagh Bandi' }, blurb: { bn: 'দুই বাঘ, কুড়ি ছাগল। ছক কষে বাঘকে আটকাও।', en: 'Two tigers. Twenty goats. Plan the perfect trap.' },
    modes: ['ai', 'local2p'], load: () => import('../games/bagh-bandi/BaghBandi') },
  // ---- Phase 4: national teams, desk games and the football pair ----
  { id: 'number-cricket', no: 29, phase: 3, category: 'bench', playable: true, accent: '#1f4e9c',
    title: { bn: 'নম্বর ক্রিকেট', en: 'Number Cricket' }, blurb: { bn: 'চিরকুটে গোপন সংখ্যা। মিললেই আউট, শূন্যে চুরি।', en: 'Secret numbers on chits. Match = out. Zero steals.' },
    modes: ['ai', 'local2p'], load: () => import('../games/number-cricket/NumberCricket') },
  { id: 'flikk-football', no: 30, phase: 3, category: 'bench', playable: true, accent: '#11804a',
    title: { bn: 'ফ্লিক ফুটবল', en: 'Flikk Football' }, blurb: { bn: 'দেশ বাছো, ফরমেশন সাজাও, টোকা দিয়ে পাস আর গোল।', en: 'Pick a country and a formation. Flick to pass and score.' },
    modes: ['ai', 'local2p'], load: () => import('../games/flikk-football/FlikkFootball') },
  { id: 'penalty', no: 31, phase: 3, category: 'sports', playable: true, accent: '#7a1f9a',
    title: { bn: 'পেনাল্টি শুটআউট', en: 'Penalty Shootout' }, blurb: { bn: 'শট নাও, ঝাঁপিয়ে বাঁচাও, কাপ জেতো।', en: 'Take the kick, dive for the save, win the cup.' },
    modes: ['ai', 'local2p'], load: () => import('../games/penalty/Penalty') },
  { id: 'five-stones', no: 32, phase: 3, category: 'para', playable: true, accent: '#8a6d3b',
    title: { bn: 'পাঁচ গুটি', en: 'Five Stones' }, blurb: { bn: 'গুটি ছোড়ো, মেঝে থেকে তোলো, পড়ার আগেই ধরো।', en: 'Toss, scoop and catch before it lands.' },
    modes: ['solo', 'ai', 'local2p'], load: () => import('../games/five-stones/FiveStones') },
  { id: 'dots-boxes', no: 33, phase: 3, category: 'bench', playable: true, accent: '#c0392b',
    title: { bn: 'ঘর কাটা', en: 'Dots and Boxes' }, blurb: { bn: 'দাগ টানো, ঘর বন্ধ করো, নিজের নাম লেখো।', en: 'Draw lines, close boxes, sign your initial.' },
    modes: ['ai', 'local2p'], load: () => import('../games/dots-boxes/DotsBoxes') },
  { id: 'hangman', no: 34, phase: 3, category: 'bench', playable: true, accent: '#34495e',
    title: { bn: 'হ্যাংম্যান', en: 'Hangman' }, blurb: { bn: 'অক্ষর ধরো, শব্দ বাঁচাও। বাংলা আর ইংরেজি।', en: 'Guess the letters, save the word. Bangla and English.' },
    modes: ['solo', 'local2p'], load: () => import('../games/hangman/Hangman') },
  { id: 'eraser-flip', no: 35, phase: 3, category: 'bench', playable: true, accent: '#d35400',
    title: { bn: 'রাবার টোকা', en: 'Eraser Flip' }, blurb: { bn: 'টোকা দিয়ে রাবার উল্টাও, বন্ধুর রাবারের উপর বসাও।', en: 'Flick and flip your eraser. Land on your friend’s.' },
    modes: ['solo', 'ai', 'local2p'], load: () => import('../games/eraser-flip/EraserFlip') },
];

function p(no: number, id: string, phase: Phase, category: Category, accent: string, bn: string, en: string, bbn: string, ben: string): GameEntry {
  return { id, no, phase, category, accent, playable: false, modes: [], title: { bn, en }, blurb: { bn: bbn, en: ben } };
}

// Games from Phase 2 and later that are built. Each entry turns a planned game into a playable one.
const BUILT: Record<string, { modes: GameEntry['modes']; load: GameEntry['load'] }> = {
  'pen-fight': { modes: ['ai', 'local2p'], load: () => import('../games/pen-fight/PenFight') },
  'rubber-band': { modes: ['solo', 'ai', 'local2p'], load: () => import('../games/rubber-band/RubberBand') },
  'paper-plane': { modes: ['solo', 'ai', 'local2p'], load: () => import('../games/paper-plane/PaperPlane') },
  'paper-boat': { modes: ['ai', 'local2p'], load: () => import('../games/paper-boat/PaperBoat') },
  'notebook-drawing': { modes: ['solo', 'local2p'], load: () => import('../games/notebook-drawing/NotebookDrawing') },
  'sack-race': { modes: ['ai', 'local2p'], load: () => import('../games/sack-race/SackRace') },
  'three-legged': { modes: ['ai', 'local2p'], load: () => import('../games/three-legged/ThreeLegged') },
  'spoon-marble': { modes: ['ai', 'local2p'], load: () => import('../games/spoon-marble/SpoonMarble') },
  'musical-chairs': { modes: ['ai', 'local2p'], load: () => import('../games/musical-chairs/MusicalChairs') },
  'haari-bhanga': { modes: ['solo', 'ai', 'local2p'], load: () => import('../games/haari-bhanga/HaariBhanga') },
  'elonti-belonti': { modes: ['ai', 'local2p'], load: () => import('../games/elonti-belonti/ElontiBelonti') },
  // Phase 3: the 3D cricket game
  'short-pitch': { modes: ['ai', 'local2p'], load: () => import('../games/short-pitch/ShortPitch3D') },
};
for (const g of GAMES) {
  const b = BUILT[g.id];
  if (b) Object.assign(g, { playable: true, modes: b.modes, load: b.load });
}

export function getGame(id: string): GameEntry | undefined {
  return GAMES.find((g) => g.id === id);
}
