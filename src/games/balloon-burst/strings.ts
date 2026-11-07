import type { StringTable } from '../../platform/i18n';

// Balloon Burst's own strings, shared by the offline game and online races.

export const S: StringTable<
  | 'title' | 'lede' | 'r1' | 'r2' | 'r3' | 'r4' | 'r5' | 'length' | 'sec' | 'pop' | 'miss' | 'cloud' | 'time' | 'target'
  | 'red' | 'yellow' | 'green' | 'blue' | 'pink' | 'orange' | 'score' | 'pops' | 'combo' | 'acc' | 'clouds' | 'over' | 'won' | 'draw' | 'aiName'
  | 'how' | 'pin' | 'gun' | 'pinSub' | 'gunSub' | 'g1' | 'g2' | 'g3' | 'pellets' | 'bonus' | 'empty' | 'hint' | 'shots' | 'outOf'
> = {
  en: {
    title: 'Balloon Burst', lede: 'The balloon stall at the mela. A pin, or the air gun? Go!',
    r1: 'Tap a balloon to pop it. Fast hits in a row build a combo (×1.5, ×2, ×3).',
    r2: 'The banner calls a colour. That colour gives double points.',
    r3: 'Gold balloons are small and fast: 30 points. Big ringed balloons need two hits.',
    r4: 'Do NOT pop the grey rain cloud. It costs points and soaks your screen.',
    r5: 'Tapping empty sky breaks your combo. Aim before you tap!',
    length: 'Round length', sec: '{n} s', pop: 'Pop!', miss: 'Miss', cloud: 'Rain!', time: 'Time', target: '{c} ×2',
    red: 'Red', yellow: 'Yellow', green: 'Green', blue: 'Blue', pink: 'Pink', orange: 'Orange',
    score: 'Score', pops: 'Balloons popped', combo: 'Best combo', acc: 'Accuracy', clouds: 'Rain clouds popped', over: 'Time up!', won: '{name} wins!', draw: 'Draw!',
    aiName: 'Rakib',
    how: 'How to pop', pin: 'Pin', gun: 'Mela air gun', pinSub: 'Tap a balloon to pop it', gunSub: 'Aim the sight and shoot, like the stall at the fair',
    g1: 'Drag anywhere to move the sight. Let go to shoot. Your finger never hides the balloon.',
    g2: 'The sight sways a little, like a real hand, and the pellet takes a moment to fly: aim a touch above a rising balloon.',
    g3: 'You get {n} pellets for the round. A gold balloon gives {b} more. The round ends when time or pellets run out.',
    pellets: 'Pellets', bonus: '+{b} pellets!', empty: 'Out of pellets', hint: 'Drag to aim · let go to shoot', shots: 'Pellets fired', outOf: 'Out of pellets!',
  },
  bn: {
    title: 'বেলুন ফাটানো', lede: 'মেলায় বেলুনের দোকান। আলপিন নাকি বন্দুক? শুরু!',
    r1: 'বেলুনে ট্যাপ করলেই ফাটবে। পরপর তাড়াতাড়ি ফাটালে কম্বো (×১.৫, ×২, ×৩)।',
    r2: 'ব্যানারে একটা রং ডাকা হবে। সেই রঙের বেলুনে দ্বিগুণ পয়েন্ট।',
    r3: 'সোনালি বেলুন ছোট আর দ্রুত: ৩০ পয়েন্ট। দাগওয়ালা বড় বেলুনে দুইবার লাগবে।',
    r4: 'ধূসর মেঘলা বেলুন ফাটাবে না! পয়েন্ট কাটবে, পর্দায় বৃষ্টি নামবে।',
    r5: 'ফাঁকা আকাশে ট্যাপ করলে কম্বো ভাঙবে। আগে তাক করো!',
    length: 'সময়', sec: '{n} সেকেন্ড', pop: 'ফট!', miss: 'ফসকে গেল', cloud: 'বৃষ্টি!', time: 'সময়', target: '{c} ×২',
    red: 'লাল', yellow: 'হলুদ', green: 'সবুজ', blue: 'নীল', pink: 'গোলাপি', orange: 'কমলা',
    score: 'পয়েন্ট', pops: 'বেলুন ফাটিয়েছ', combo: 'সেরা কম্বো', acc: 'নিশানা', clouds: 'মেঘলা বেলুন', over: 'সময় শেষ!', won: '{name} জিতেছে!', draw: 'সমান সমান!',
    aiName: 'রাকিব',
    how: 'কীভাবে ফাটাবে', pin: 'আলপিন', gun: 'মেলার বন্দুক', pinSub: 'বেলুনে ট্যাপ করে ফাটাও', gunSub: 'মেলার দোকানের মতো নিশানা করে গুলি করো',
    g1: 'যেকোনো জায়গায় টেনে নিশানা সরাও। ছেড়ে দিলেই গুলি। আঙুলে বেলুন ঢাকা পড়বে না।',
    g2: 'আসল হাতের মতো নিশানা একটু কাঁপে, আর গুলি পৌঁছাতে একটু সময় লাগে: ওপরে উঠতে থাকা বেলুনের একটু ওপরে তাক করো।',
    g3: 'এই রাউন্ডে {n}টা গুলি। সোনালি বেলুনে আরও {b}টা। সময় বা গুলি ফুরালে রাউন্ড শেষ।',
    pellets: 'গুলি', bonus: '+{b}টা গুলি!', empty: 'গুলি শেষ', hint: 'টেনে নিশানা · ছাড়লে গুলি', shots: 'গুলি ছুড়েছ', outOf: 'গুলি শেষ!',
  },
};
