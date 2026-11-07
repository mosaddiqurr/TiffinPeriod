import type { Scene, View } from '../../engine/GameCanvas';
import { useT, fmtNum, type StringTable } from '../../platform/i18n';
import { sfx, vibrate } from '../../platform/audio';
import type { Rng } from '../../engine/rng';
import { FloatTexts } from '../../engine/particles';
import type { ShellConfig, ShellResult, ShellScene } from '../../components/GameShell';
import { BoatAI, RIVER, banks, makeObstacles, newBoat, stepBoat, stepObstacles, type Boat, type Obstacle } from './model';

export const S: StringTable<'title' | 'lede' | 'r1' | 'r2' | 'r3' | 'r4' | 'left' | 'right' | 'sunk' | 'soak' | 'won' | 'allSunk' | 'time' | 'bumps' | 'place'> = {
  en: {
    title: 'Paper Boat Race', lede: 'Monsoon rain, a stream down the lane, and a boat made of newspaper.',
    r1: 'The current carries your boat up the stream. Hold ◀ or ▶ to steer.', r2: 'Bricks, sandals and leaves bump your boat. Whirlpools near the drains pull it in.',
    r3: 'Every bump and every whirlpool soaks the paper. At 100 % your boat sinks.', r4: 'The middle of the stream is fastest. First boat under the bamboo bridge wins.',
    left: '◀', right: '▶', sunk: 'Sunk!', soak: 'Wet', won: '{name} wins the boat race!', allSunk: 'Every boat sank!', time: 'Time', bumps: 'Bumps', place: 'Place',
  },
  bn: {
    title: 'কাগজের নৌকা', lede: 'বর্ষার বৃষ্টি, গলিতে পানির স্রোত, আর খবরের কাগজের নৌকা।',
    r1: 'স্রোত নৌকা সামনে নিয়ে যাবে। ◀ বা ▶ চেপে দিক ঠিক করো।', r2: 'ইট, স্যান্ডেল আর পাতায় ধাক্কা লাগে। ড্রেনের পাশের ঘূর্ণি নৌকা টেনে নেয়।',
    r3: 'প্রতি ধাক্কা আর ঘূর্ণিতে কাগজ ভিজে যায়। ১০০% ভিজলে নৌকা ডুবে যাবে।', r4: 'মাঝখানের স্রোত সবচেয়ে জোরে। যে নৌকা আগে বাঁশের সাঁকোর নিচে যাবে, সে জিতবে।',
    left: '◀', right: '▶', sunk: 'ডুবে গেল!', soak: 'ভেজা', won: '{name}-এর নৌকা জিতেছে!', allSunk: 'সব নৌকা ডুবে গেছে!', time: 'সময়', bumps: 'ধাক্কা', place: 'স্থান',
  },
};
export type Txt = ReturnType<typeof useT<'sunk' | 'soak' | 'won' | 'allSunk' | 'time' | 'bumps' | 'place'>>;
const FONT = '"Baloo Da 2", sans-serif';
const PAPER = ['#f3efe2', '#dfe9f3', '#f5e3e3', '#e5f0dc'];
const FLAG = ['#c0392b', '#1f4e9c', '#127a59', '#7d3c98'];

interface Racer { name: string; player: number; boat: Boat; ai: BoatAI | null; t: number | null; i: number }

/** Online race: only my boat sails here; the other player's boat is a ghost from their reports. */
export interface OnlineOpts { obstacles: Obstacle[]; startX: number; oppName: string; limit: number; grace: number }
interface Ghost { x: number; y: number; h: number; sunk: boolean; tx: number; ty: number; th: number; vx: number; vy: number; at: number; seen: boolean }

export class BoatScene implements Scene, ShellScene {
  designW = RIVER.w;
  designH = 900;
  originY = 0;
  onOver?: (r: ShellResult) => void;
  private racers: Racer[] = [];
  private obs: Obstacle[];
  private camY = RIVER.len - 700;
  t = -3;
  private texts = new FloatTexts();
  private time = 0;
  private ended = false;
  private endIn: number | null = null;
  /** Online only: false until both players are ready (the countdown waits). */
  private started = true;
  private ghost: Ghost | null = null;
  /** Online only: how my race ended (1 finished, 2 sunk, 3 out of time), 0 while racing. */
  status: 0 | 1 | 2 | 3 = 0;

  constructor(private cfg: ShellConfig, private tx: Txt, rng: Rng, private online?: OnlineOpts) {
    if (online) {
      this.obs = online.obstacles;
      this.started = false;
      this.racers = [{ name: cfg.names[0], player: 0, i: 0, boat: newBoat(online.startX), ai: null, t: null }];
      this.ghost = { x: online.startX, y: RIVER.len - 120, h: -Math.PI / 2, sunk: false, tx: online.startX, ty: RIVER.len - 120, th: -Math.PI / 2, vx: 0, vy: 0, at: 0, seen: false };
      return;
    }
    this.obs = makeObstacles(rng);
    const ai = cfg.lang === 'bn' ? ['রাফি', 'মিতু'] : ['Rafi', 'Mitu'];
    const skill = cfg.diff === 'easy' ? 0.6 : cfg.diff === 'medium' ? 0.8 : 0.95;
    const list: Array<[string, number]> = [[cfg.names[0], 0]];
    if (cfg.mode === 'local2p') list.push([cfg.names[1], 1]);
    while (list.length < 3) list.push([ai[list.length - (cfg.mode === 'local2p' ? 2 : 1)], -1]);
    this.racers = list.map(([name, player], i) => ({ name, player, i, boat: newBoat(220 + i * 100), ai: player < 0 ? new BoatAI(rng, skill) : null, t: null }));
  }

  control(player: number, action: string, down: boolean) {
    const r = this.racers.find((x) => x.player === player);
    if (!r) return;
    if (action === 'left') r.boat.steer = down ? -1 : r.boat.steer === -1 ? 0 : r.boat.steer;
    if (action === 'right') r.boat.steer = down ? 1 : r.boat.steer === 1 ? 0 : r.boat.steer;
  }

  /** Online: both players are ready, start the countdown. */
  go() { this.started = true; }
  get me(): Boat { return this.racers[0].boat; }

  /** Online: the other player's latest report (integers, see race.ts). */
  setGhost(x: number, y: number, h: number, sunk: boolean) {
    const g = this.ghost;
    if (!g) return;
    const dt = Math.max(0.05, this.time - g.at);
    if (g.seen) { g.vx = (x - g.tx) / dt; g.vy = (y - g.ty) / dt; } else { g.x = x; g.y = y; g.h = h; }
    if (sunk) { g.vx = 0; g.vy = 0; }
    g.tx = x; g.ty = y; g.th = h; g.sunk = sunk; g.at = this.time; g.seen = true;
  }

  /** Online: stop my race now (out of time), if it is still running. */
  forceEnd() { if (this.online && this.status === 0) { this.status = 3; this.ended = true; this.racers[0].boat.steer = 0; } }

  /** Online: the other boat finished, so I have `grace` seconds left. */
  oppFinished() { if (this.online && this.endIn === null && this.status === 0) this.endIn = this.online.grace; }

  private stepGhost(dt: number) {
    const g = this.ghost;
    if (!g) return;
    // Aim a little ahead of the last report (it is a quarter-second old), and ease toward it.
    const ahead = Math.min(0.4, this.time - g.at);
    const ax = g.tx + g.vx * ahead, ay = Math.max(-20, g.ty + g.vy * ahead);
    const k = Math.min(1, dt * 6);
    g.x += (ax - g.x) * k; g.y += (ay - g.y) * k;
    let dh = g.th - g.h;
    while (dh > Math.PI) dh -= 2 * Math.PI;
    while (dh < -Math.PI) dh += 2 * Math.PI;
    g.h += dh * k;
  }

  private updateOnline(dt: number) {
    this.stepGhost(dt);
    if (this.ended || !this.started) return;
    const before = Math.ceil(-this.t);
    this.t += dt;
    if (this.t < 0) { if (Math.ceil(-this.t) !== before) sfx('tick'); return; }
    if (this.t - dt < 0) sfx('whistle');
    stepObstacles(this.obs, dt);
    const r = this.racers[0];
    const ev = stepBoat(r.boat, this.obs, dt);
    if (ev === 'bump') { sfx('thud', { gain: 0.5 }); vibrate(20); }
    if (ev === 'bank') sfx('splash', { gain: 0.3 });
    if (ev === 'sink') { this.texts.add(r.boat.x, r.boat.y - 30, this.tx('sunk'), '#ffffff', 30, 1.5); sfx('out'); this.status = 2; }
    if (ev === 'finish') { r.t = this.t; sfx('fanfare'); this.status = 1; }
    if (this.endIn !== null && this.status === 0) { this.endIn -= dt; if (this.endIn <= 0) this.status = 3; }
    if (this.status === 0 && this.t >= this.online!.limit) this.status = 3;
    if (this.status !== 0) { this.ended = true; r.boat.steer = 0; }
    this.camY += (Math.min(RIVER.len - 700, Math.max(-150, r.boat.y - 640)) - this.camY) * Math.min(1, dt * 3);
  }

  update(dt: number) {
    if (this.online) { this.time += dt; this.texts.update(dt); this.updateOnline(dt); return; }
    this.time += dt;
    this.texts.update(dt);
    if (this.ended) return;
    const before = Math.ceil(-this.t);
    this.t += dt;
    if (this.t < 0) { if (Math.ceil(-this.t) !== before) sfx('tick'); return; }
    if (this.t - dt < 0) sfx('whistle');
    stepObstacles(this.obs, dt);
    for (const r of this.racers) {
      r.ai?.update(r.boat, this.obs);
      const ev = stepBoat(r.boat, this.obs, dt);
      const human = r.player >= 0;
      if (ev === 'bump' && human) { sfx('thud', { gain: 0.5 }); vibrate(20); }
      if (ev === 'bank' && human) sfx('splash', { gain: 0.3 });
      if (ev === 'sink') { this.texts.add(r.boat.x, r.boat.y - 30, this.tx('sunk'), '#ffffff', 30, 1.5); sfx(human ? 'out' : 'splash', { gain: human ? 1 : 0.5 }); }
      if (ev === 'finish') { r.t = this.t; sfx(human ? 'fanfare' : 'clap', { gain: human ? 1 : 0.5 }); if (this.endIn === null) this.endIn = 8; }
    }
    const humans = this.racers.filter((r) => r.player >= 0);
    const humansDone = humans.every((r) => r.boat.finished || r.boat.sunk);
    const allDone = this.racers.every((r) => r.boat.finished || r.boat.sunk);
    if (this.endIn !== null) this.endIn -= dt;
    if (allDone || humansDone || (this.endIn !== null && this.endIn <= 0) || this.t > 120) this.finish();
    // Camera follows the leading human boat that is still afloat.
    const lead = humans.filter((r) => !r.boat.sunk).sort((a, b) => a.boat.y - b.boat.y)[0] ?? humans[0];
    this.camY += (Math.min(RIVER.len - 700, Math.max(-150, lead.boat.y - 640)) - this.camY) * Math.min(1, dt * 3);
  }

  private finish() {
    if (this.ended) return;
    this.ended = true;
    const st = [...this.racers].sort((a, b) => {
      const ka = a.t ?? (a.boat.sunk ? 1e6 + a.boat.y : 1e5 + a.boat.y);
      const kb = b.t ?? (b.boat.sunk ? 1e6 + b.boat.y : 1e5 + b.boat.y);
      return ka - kb;
    });
    const n = (v: number | string) => fmtNum(v, this.cfg.lang);
    const winner = st[0].t !== null ? st[0] : null;
    const me = this.racers[0];
    const vsAI = this.cfg.mode === 'ai';
    this.onOver?.({
      outcome: vsAI ? (winner === me ? 'win' : 'loss') : 'none',
      title: winner ? this.tx('won', { name: winner.name }) : this.tx('allSunk'),
      rows: st.flatMap((r, i) => [
        [`${n(i + 1)}. ${r.name}`, r.t !== null ? `${n(r.t.toFixed(1))} s` : r.boat.sunk ? this.tx('sunk') : '—'],
        ...(r.player >= 0 ? [[`${r.name} — ${this.tx('soak')}`, `${n(Math.round(r.boat.soak * 100))}%`] as [string, string], [`${r.name} — ${this.tx('bumps')}`, r.boat.bumps] as [string, number]] : []),
      ] as Array<[string, string | number]>),
      score: vsAI && me.t !== null ? Math.round(me.t * 10) / 10 : undefined,
      lowerIsBetter: true,
      achievements: [...(vsAI && winner === me ? ['pb-win'] : []), ...(me.t !== null && me.boat.soak < 0.35 ? ['pb-dry'] : [])],
    });
  }

  render(ctx: CanvasRenderingContext2D, v: View) {
    const cy = this.camY;
    ctx.save();
    ctx.translate(0, -cy);
    const top = cy + v.top, bot = cy + v.bottom;
    // Road and footpath on both sides
    ctx.fillStyle = '#7b7b7b'; ctx.fillRect(v.left, top, v.right - v.left, bot - top);
    // Water channel, drawn as strips
    for (let y = Math.floor(top / 20) * 20; y < bot; y += 20) {
      const [l, r] = banks(y);
      ctx.fillStyle = '#a3906a'; ctx.fillRect(l - 22, y, r - l + 44, 21);
      ctx.fillStyle = '#5f7f8f'; ctx.fillRect(l, y, r - l, 21);
    }
    // Flow streaks
    ctx.strokeStyle = 'rgba(220, 235, 245, 0.35)'; ctx.lineWidth = 2;
    for (let k = 0; k < 40; k++) {
      const y = top + ((k * 97 - this.time * 120) % (bot - top) + (bot - top)) % (bot - top);
      const [l, r] = banks(y);
      const x = l + ((k * 53) % 100) / 100 * (r - l);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 18); ctx.stroke();
    }
    // Bamboo bridge at the finish
    ctx.fillStyle = '#b89545'; ctx.fillRect(v.left, -26, v.right - v.left, 22);
    ctx.strokeStyle = '#8a6d2c'; ctx.lineWidth = 2; for (let x = Math.floor(v.left / 40) * 40; x < v.right; x += 40) { ctx.beginPath(); ctx.moveTo(x, -26); ctx.lineTo(x, -4); ctx.stroke(); }
    // Obstacles
    for (const o of this.obs) {
      if (o.y < top - 60 || o.y > bot + 60) continue;
      if (o.kind === 'whirl') {
        ctx.strokeStyle = 'rgba(30, 50, 60, 0.6)'; ctx.lineWidth = 3;
        for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(o.x, o.y, o.r * (0.35 + k * 0.25), this.time * 3 + k, this.time * 3 + k + 4); ctx.stroke(); }
        ctx.fillStyle = '#3b3b3b'; ctx.fillRect(o.x - 18, o.y - 6, 36, 12);
      } else if (o.kind === 'brick') {
        ctx.fillStyle = '#a5452f'; ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.x * 0.01); ctx.fillRect(-o.r, -o.r * 0.6, o.r * 2, o.r * 1.2); ctx.restore();
      } else if (o.kind === 'leaf') {
        ctx.fillStyle = '#4f8a3a'; ctx.beginPath(); ctx.ellipse(o.x, o.y, o.r, o.r * 0.5, o.y * 0.01, 0, 6.283); ctx.fill();
      } else {
        ctx.fillStyle = '#2b5fa8'; ctx.beginPath(); ctx.ellipse(o.x, o.y, o.r * 0.6, o.r, 0.2, 0, 6.283); ctx.fill();
        ctx.strokeStyle = '#f2f2f2'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(o.x - 6, o.y - 6); ctx.lineTo(o.x, o.y); ctx.lineTo(o.x + 6, o.y - 6); ctx.stroke();
      }
    }
    // The other player's boat: a see-through ghost on the same stream
    if (this.ghost && this.online) {
      const g = this.ghost;
      drawBoat(ctx, { ...newBoat(g.x), x: g.x, y: g.y, heading: g.h, sunk: g.sunk }, PAPER[1], FLAG[1], this.time, 0.5);
      if (!g.sunk) { ctx.fillStyle = 'rgba(31,78,156,0.75)'; ctx.font = `800 15px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText(this.online.oppName, g.x, g.y - 34); }
    }
    // Boats
    for (const r of this.racers) drawBoat(ctx, r.boat, PAPER[r.i % 4], FLAG[r.i % 4], this.time);
    for (const r of this.racers) {
      if (r.boat.sunk) continue;
      ctx.fillStyle = FLAG[r.i % 4]; ctx.font = `800 15px ${FONT}`; ctx.textAlign = 'center';
      ctx.fillText(r.name, r.boat.x, r.boat.y + 32);
    }
    this.texts.draw(ctx, FONT);
    ctx.restore();
    // Rain
    ctx.strokeStyle = 'rgba(220, 230, 240, 0.45)'; ctx.lineWidth = 1.5;
    for (let k = 0; k < 70; k++) {
      const x = v.left + ((k * 89 + this.time * 160) % (v.right - v.left));
      const y = v.top + ((k * 61 + this.time * 700) % (v.bottom - v.top));
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 5, y + 14); ctx.stroke();
    }
    // HUD: soak meter for each human
    let hy = v.top + 14;
    for (const r of this.racers.filter((x) => x.player >= 0)) {
      ctx.fillStyle = 'rgba(255,253,246,0.92)'; ctx.beginPath(); ctx.roundRect?.(v.left + 10, hy, 230, 30, 15); ctx.fill();
      ctx.fillStyle = '#5f7f8f'; ctx.fillRect(v.left + 110, hy + 9, 120, 12);
      ctx.fillStyle = r.boat.soak > 0.7 ? '#c62f2f' : '#2b7bd8'; ctx.fillRect(v.left + 110, hy + 9, 120 * r.boat.soak, 12);
      ctx.fillStyle = '#3a2516'; ctx.font = `800 15px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(`${r.name}`, v.left + 20, hy + 15);
      hy += 36;
    }
    ctx.textAlign = 'right'; ctx.fillStyle = '#fff'; ctx.font = `800 20px ${FONT}`;
    ctx.fillText(`${this.tx('time')} ${fmtNum(Math.max(0, this.t).toFixed(1), this.cfg.lang)}`, v.right - 14, v.top + 28);
    // Progress strip on the right
    const px = v.right - 14, p0 = v.top + 60, p1 = v.bottom - 120;
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(px, p0); ctx.lineTo(px, p1); ctx.stroke();
    if (this.ghost && this.online) { const f = 1 - this.ghost.y / RIVER.len; ctx.fillStyle = 'rgba(31,78,156,0.6)'; ctx.beginPath(); ctx.arc(px, p1 - (p1 - p0) * Math.max(0, Math.min(1, f)), 8, 0, 6.283); ctx.fill(); }
    for (const r of this.racers) { const f = 1 - r.boat.y / RIVER.len; ctx.fillStyle = FLAG[r.i % 4]; ctx.beginPath(); ctx.arc(px, p1 - (p1 - p0) * Math.max(0, Math.min(1, f)), 8, 0, 6.283); ctx.fill(); }
    if (this.t < 0 && this.started) { ctx.fillStyle = '#fff'; ctx.font = `800 100px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText(fmtNum(Math.ceil(-this.t), this.cfg.lang), (v.left + v.right) / 2, (v.top + v.bottom) / 2); }
  }
}

function drawBoat(ctx: CanvasRenderingContext2D, b: Boat, paper: string, flag: string, t: number, alpha = 1) {
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(b.heading + Math.PI / 2 + Math.sin(t * 3 + b.x) * 0.05);
  const sink = b.sunk ? 0.7 : 1.4;
  ctx.globalAlpha = (b.sunk ? 0.45 : 1) * alpha;
  ctx.scale(sink, sink);
  ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(3, 4, 13, 22, 0, 0, 6.283); ctx.fill();
  // Newspaper hull (top view): a long hexagon with the fold in the middle
  const wet = Math.min(1, b.soak);
  ctx.fillStyle = paper;
  ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(11, -10); ctx.lineTo(11, 10); ctx.lineTo(0, 24); ctx.lineTo(-11, 10); ctx.lineTo(-11, -10); ctx.closePath(); ctx.fill();
  ctx.fillStyle = `rgba(90, 120, 150, ${wet * 0.6})`; ctx.fill();
  ctx.strokeStyle = 'rgba(60,60,60,0.5)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.strokeStyle = 'rgba(60,60,60,0.35)';
  for (const y of [-8, -3, 2, 7]) { ctx.beginPath(); ctx.moveTo(-7, y); ctx.lineTo(7, y); ctx.stroke(); }
  ctx.fillStyle = flag; ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(6, 0); ctx.lineTo(0, 14); ctx.lineTo(-6, 0); ctx.closePath(); ctx.fill();
  ctx.restore();
}
