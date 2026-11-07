import type { Bi } from '../../platform/i18n';
import { inside, type Box, type Eraser } from './model';

// Eraser Flip challenges. Three flicks per level, each flick starts from the same spot.

export type Zone =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; faceDown?: boolean; label: 'notebook' | 'zone' }
  | { kind: 'rings'; x: number; y: number; r: [number, number, number] }
  | { kind: 'edge' }
  | { kind: 'coin'; x: number; y: number }
  | { kind: 'top'; x: number; y: number; a: number };

export interface Level { id: string; title: Bi; desc: Bi; start: { x: number; y: number; a: number }; boxes: Box[]; zone: Zone; stars: [number, number, number] }

const S = { x: 300, y: 700, a: -Math.PI / 2 + Math.PI / 2 };

export const LEVELS: Level[] = [
  { id: 'e1', title: { bn: 'খাতার উপর', en: 'On the notebook' }, desc: { bn: 'রাবার খাতার উপর থামাও।', en: 'Stop the eraser on the notebook.' }, start: S, boxes: [], zone: { kind: 'rect', x: 170, y: 250, w: 260, h: 190, label: 'notebook' }, stars: [100, 200, 300] },
  { id: 'e2', title: { bn: 'চাঁদমারি', en: 'Bullseye' }, desc: { bn: 'পেনসিলে আঁকা গোলের মাঝখানে থামাও।', en: 'Stop in the middle of the pencil rings.' }, start: S, boxes: [], zone: { kind: 'rings', x: 300, y: 360, r: [30, 62, 96] }, stars: [120, 200, 260] },
  { id: 'e3', title: { bn: 'উল্টে দাও', en: 'Flip it over' }, desc: { bn: 'রাবার উল্টো হয়ে ঘরের ভেতরে পড়ুক।', en: 'Land it upside down inside the box.' }, start: S, boxes: [], zone: { kind: 'rect', x: 180, y: 300, w: 240, h: 170, faceDown: true, label: 'zone' }, stars: [100, 160, 230] },
  { id: 'e4', title: { bn: 'স্কেলের উপর দিয়ে', en: 'Over the ruler' }, desc: { bn: 'স্কেল পেরিয়ে খাতায় নামাও।', en: 'Hop the ruler and land on the notebook.' }, start: S, boxes: [{ x: 90, y: 470, w: 420, h: 22, height: 26, kind: 'ruler' }], zone: { kind: 'rect', x: 170, y: 190, w: 260, h: 200, label: 'notebook' }, stars: [100, 200, 300] },
  { id: 'e5', title: { bn: 'কিনারার খেলা', en: 'Edge of the desk' }, desc: { bn: 'যত পারো ডেস্কের কিনারে থামাও, পড়ে যেয়ো না!', en: 'Stop as close to the far edge as you dare. Don’t fall!' }, start: S, boxes: [], zone: { kind: 'edge' }, stars: [150, 220, 260] },
  { id: 'e6', title: { bn: 'পয়সা ঢাকো', en: 'Cover the coin' }, desc: { bn: 'রাবার দিয়ে পয়সাটা ঢেকে দাও।', en: 'Land the eraser over the coin.' }, start: S, boxes: [{ x: 120, y: 330, w: 70, h: 120, height: 40, kind: 'pencilbox' }], zone: { kind: 'coin', x: 330, y: 300 }, stars: [100, 180, 260] },
  { id: 'e7', title: { bn: 'দুই পেনসিলের ফাঁকে', en: 'Between the pencils' }, desc: { bn: 'দুই পেনসিলের মাঝ দিয়ে গিয়ে গোলে থামাও।', en: 'Slip between two pencils into the rings.' }, start: S, boxes: [{ x: 140, y: 420, w: 120, h: 12, height: 12, kind: 'pencil' }, { x: 340, y: 420, w: 120, h: 12, height: 12, kind: 'pencil' }, { x: 250, y: 300, w: 20, h: 20, height: 22, kind: 'sharpener' }], zone: { kind: 'rings', x: 300, y: 230, r: [30, 62, 96] }, stars: [90, 160, 220] },
  { id: 'e8', title: { bn: 'স্যারের রাবারে চড়ো', en: 'Top the teacher’s eraser' }, desc: { bn: 'স্যারের বড় রাবারের উপর তোমার রাবার বসাও।', en: 'Land yours on top of the teacher’s eraser.' }, start: S, boxes: [], zone: { kind: 'top', x: 300, y: 330, a: 0.3 }, stars: [150, 300, 400] },
];

/** Points for one flick. Standing on its side earns a bonus anywhere. */
export function flickScore(L: Level, e: Eraser, topId: number | null): number {
  if (e.fallen) return 0;
  const bonus = e.stand ? 100 : 0;
  const z = L.zone;
  switch (z.kind) {
    case 'rect': {
      const inZone = e.x > z.x && e.x < z.x + z.w && e.y > z.y && e.y < z.y + z.h;
      if (!inZone) return bonus;
      if (z.faceDown) return (Math.cos(e.flip) < 0 ? 100 : 30) + bonus;
      return 100 + bonus;
    }
    case 'rings': {
      const d = Math.hypot(e.x - z.x, e.y - z.y);
      return (d < z.r[0] ? 100 : d < z.r[1] ? 60 : d < z.r[2] ? 30 : 0) + bonus;
    }
    case 'edge': return Math.max(0, Math.round(100 - (e.y - 30 - 18) / 2.5)) + bonus;
    case 'coin': return (inside(e, z.x, z.y) ? 100 : Math.hypot(e.x - z.x, e.y - z.y) < 70 ? 40 : 0) + bonus;
    case 'top': return (topId !== null && e.onTop === topId ? 150 : Math.hypot(e.x - z.x, e.y - z.y) < 80 ? 30 : 0) + bonus;
  }
}

export const starsFor = (L: Level, total: number) => (total >= L.stars[2] ? 3 : total >= L.stars[1] ? 2 : total >= L.stars[0] ? 1 : 0);
