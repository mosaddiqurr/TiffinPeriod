import type { Scene, View } from '../../engine/GameCanvas';
import { useT, fmtNum, type StringTable } from '../../platform/i18n';
import { sfx, vibrate } from '../../platform/audio';
import { createRng, type Rng } from '../../engine/rng';
import { FloatTexts, Particles } from '../../engine/particles';
import { GameShell, type PadDef, type ShellConfig, type ShellResult, type ShellScene } from '../../components/GameShell';
import { addBall, currentOver, decideMatch, inningsComplete, newInnings, oversText, type Innings, type Limits } from '../../shared/cricket';
import { drawKid, LOOKS } from '../../shared/kid';
import {
  VENUES, aiBat, aiBowl, ballAt, deliveryTime, hitsStumps, judgeSwing, launchFor, makeDelivery, simulateShot,
  type BallResult, type Delivery, type Length, type Line, type Shot, type Venue, type VenueId,
} from './engine';

// One cricket game screen, used by the four street-cricket venues.

const S: StringTable<
  | 'defend' | 'drive' | 'loft' | 'fast' | 'slow' | 'overs' | 'wickets' | 'batFirst' | 'me' | 'them' | 'bowlPick' | 'bowling' | 'batting' | 'target' | 'need'
  | 'dot' | 'runs' | 'four' | 'six' | 'tank' | 'bowled' | 'caught' | 'sixOut' | 'offRoof' | 'house' | 'oneTip' | 'won' | 'tied' | 'inn' | 'breakT' | 'roofRule' | 'roofOut' | 'roofSix' | 'keys' | 'over'
> = {
  en: {
    defend: 'Block', drive: 'Drive', loft: 'Loft', fast: 'Fast', slow: 'Slow', overs: 'Overs', wickets: 'Wickets', batFirst: 'Who bats first?', me: 'Player 1', them: 'Player 2',
    bowlPick: '{name}: tap where to bowl', bowling: '{name} is bowling', batting: '{name} is batting', target: 'Target {n}', need: 'Need {r} from {b}',
    dot: 'Dot ball', runs: '{n} run(s)', four: 'FOUR!', six: 'SIX!', tank: 'Water tank! 2 runs', bowled: 'BOWLED!', caught: 'CAUGHT!', sixOut: 'Six = OUT!', offRoof: 'Off the roof — OUT!', house: 'Into the house — OUT!', oneTip: 'One tip, one hand — OUT!',
    won: '{name} wins!', tied: 'Match tied!', inn: 'Innings — {name}', breakT: 'Change over! Target {n}', roofRule: 'Ball off the roof', roofOut: 'OUT (house rule)', roofSix: 'Six', keys: 'Keys: A block, Space drive, D loft · bowling: 1–9 and F', over: 'Over {o}',
  },
  bn: {
    defend: 'ঠেকাও', drive: 'মারো', loft: 'উঁচিয়ে', fast: 'জোরে', slow: 'আস্তে', overs: 'ওভার', wickets: 'উইকেট', batFirst: 'আগে কে ব্যাট করবে?', me: 'খেলোয়াড় ১', them: 'খেলোয়াড় ২',
    bowlPick: '{name}: কোথায় বল ফেলবে, চাপো', bowling: '{name} বল করছে', batting: '{name} ব্যাট করছে', target: 'লক্ষ্য {n}', need: '{b} বলে {r} লাগবে',
    dot: 'ডট বল', runs: '{n} রান', four: 'চার!', six: 'ছক্কা!', tank: 'ট্যাংকে লেগেছে! ২ রান', bowled: 'বোল্ড!', caught: 'ক্যাচ আউট!', sixOut: 'ছক্কা মানে আউট!', offRoof: 'ছাদের বাইরে — আউট!', house: 'বাড়ির ভেতরে — আউট!', oneTip: 'এক টিপ এক হাত — আউট!',
    won: '{name} জিতেছে!', tied: 'ম্যাচ টাই!', inn: 'ইনিংস — {name}', breakT: 'ইনিংস বদল! লক্ষ্য {n}', roofRule: 'বল ছাদের বাইরে গেলে', roofOut: 'আউট (ছাদের নিয়ম)', roofSix: 'ছক্কা', keys: 'কী-বোর্ড: A ঠেকাও, Space মারো, D উঁচিয়ে · বল: ১–৯ আর F', over: 'ওভার {o}',
  },
};
type Txt = ReturnType<typeof useT<keyof (typeof S)['en']>>;
const FONT = '"Baloo Da 2", sans-serif';
const LENGTHS: Length[] = ['short', 'good', 'full'];
const LINES: Line[] = ['leg', 'middle', 'off'];

interface VenueLook { sky: [string, string]; ground: string; pitch: string; side: string; title: string }
const LOOK: Record<VenueId, VenueLook> = {
  'short-pitch': { sky: ['#a7d8f0', '#eaf4e0'], ground: '#86b84a', pitch: '#c9a86a', side: '#e7d5a8', title: 'Para field' },
  'tape-tennis': { sky: ['#9fc8e6', '#efe6d0'], ground: '#8d8d8d', pitch: '#a5a5a5', side: '#d9b48a', title: 'Street' },
  rooftop: { sky: ['#f6c78a', '#fde9c2'], ground: '#b7b2a8', pitch: '#cfc9bd', side: '#e8d7a6', title: 'Rooftop' },
  goli: { sky: ['#bcd6e8', '#f2ead6'], ground: '#9c8f7f', pitch: '#b5a896', side: '#c96f55', title: 'Alley' },
};

type Phase = 'pick' | 'runup' | 'delivery' | 'shot' | 'result' | 'break' | 'done';

class CricketScene implements Scene, ShellScene {
  designW = 900;
  designH = 640;
  onOver?: (r: ShellResult) => void;
  private v: Venue;
  private innings: [Innings, Innings] = [newInnings(), newInnings()];
  private cur: 0 | 1 = 0;
  private battingFirst: 0 | 1;
  private lim: Limits;
  private phase: Phase = 'pick';
  private phaseT = 0;
  private d: Delivery | null = null;
  private press: { shot: Shot; t: number } | null = null;
  private shot: BallResult | null = null;
  private frame = 0;
  private banner = '';
  private bannerKind: 'good' | 'out' | 'plain' = 'plain';
  private fast = false;
  private fx = new Particles(150);
  private texts = new FloatTexts();
  private time = 0;
  private sixes = [0, 0];
  private tankHits = 0;

  constructor(private cfg: ShellConfig, venueId: VenueId, private tx: Txt, private rng: Rng) {
    const base = VENUES[venueId];
    this.v = venueId === 'rooftop' && cfg.opts.roof === 'six' ? { ...base, overWall: 'none', fullBoundary: 'six', wallH: 0.9 } : base;
    this.lim = { wickets: Number(cfg.opts.wickets ?? 3), balls: Number(cfg.opts.overs ?? 2) * 6 };
    this.battingFirst = Number(cfg.opts.first ?? 0) as 0 | 1;
    this.startBall();
  }

  private get batSide(): 0 | 1 { return (this.cur === 0 ? this.battingFirst : 1 - this.battingFirst) as 0 | 1; }
  private get bowlSide(): 0 | 1 { return (1 - this.batSide) as 0 | 1; }
  private isAI(side: number) { return this.cfg.mode === 'ai' && side === 1; }
  private target() { return this.cur === 1 ? this.innings[0].runs + 1 : undefined; }

  private startBall() {
    this.press = null;
    this.shot = null;
    this.d = null;
    this.phaseT = 0;
    if (this.isAI(this.bowlSide)) { this.d = aiBowl(this.v, this.cfg.diff, this.rng); this.phase = 'runup'; }
    else this.phase = 'pick';
  }

  private bowl(len: Length, line: Line) {
    if (this.phase !== 'pick') return;
    this.d = makeDelivery(this.v, len, line, this.fast, this.rng, 0.95);
    this.phase = 'runup';
    this.phaseT = 0;
    sfx('click');
  }

  control(_p: number, action: string, down: boolean) {
    if (!down) return;
    if (action === 'fast') { this.fast = !this.fast; sfx('click'); return; }
    if (action.startsWith('b') && this.phase === 'pick') {
      const n = Number(action.slice(1)) - 1;
      this.bowl(LENGTHS[Math.floor(n / 3)], LINES[n % 3]);
      return;
    }
    if ((action === 'drive' || action === 'loft' || action === 'defend') && !this.isAI(this.batSide)) {
      if ((this.phase === 'delivery' || this.phase === 'runup') && !this.press) this.press = { shot: action, t: this.phase === 'runup' ? -1 : this.phaseT };
    }
  }

  pointerDown(x: number, y: number) {
    if (this.phase !== 'pick') return;
    const cell = this.gridCell(x, y);
    if (cell) this.bowl(cell[0], cell[1]);
  }

  // ---- Perspective of the delivery view ----
  private proj(z: number, xm: number, h: number) {
    const f = Math.max(-0.08, z / this.v.pitch);
    const p = 1 / (1 + 2.4 * f);
    const pTop = 1 / 3.4;
    const y = 250 + 350 * (p - pTop) / (1 - pTop);
    return { x: 450 + xm * 110 * p, y: y - h * 110 * p, s: p };
  }
  private gridCell(x: number, y: number): [Length, Line] | null {
    for (const [li, len] of LENGTHS.entries()) for (const [ci, line] of LINES.entries()) {
      const r = this.cellRect(li, ci);
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return [len, line];
    }
    return null;
  }
  private cellRect(li: number, ci: number) {
    const zs = [this.v.pitch * 0.62, this.v.pitch * 0.38, this.v.pitch * 0.15];
    const a = this.proj(zs[li] + 1.4, -0.75 + ci * 0.5, 0), b = this.proj(zs[li] - 1.4, -0.25 + ci * 0.5, 0);
    return { x: a.x - 6, y: a.y, w: b.x - a.x + 12, h: b.y - a.y };
  }

  update(dt: number) {
    this.time += dt;
    this.phaseT += dt;
    this.fx.update(dt);
    this.texts.update(dt);
    if (this.phase === 'runup' && this.phaseT > 0.8) { this.phase = 'delivery'; this.phaseT = 0; if (this.press) this.press.t = -1; }
    if (this.phase === 'delivery' && this.d) {
      const T = deliveryTime(this.v, this.d);
      if (this.isAI(this.batSide) && !this.press) {
        const tg = this.target();
        const a = aiBat(this.v, this.d, this.cfg.diff, this.rng, tg !== undefined ? tg - this.innings[this.cur].runs : undefined);
        this.press = { shot: a.shot, t: T + a.dt };
      }
      if (this.phaseT >= T + 0.3 || (this.press && this.press.t >= 0 && this.phaseT >= Math.max(this.press.t, 0) && this.phaseT >= T - 0.02)) this.resolve(T);
    }
    if (this.phase === 'shot' && this.shot) {
      this.frame += dt * 60;
      if (this.frame >= this.shot.frames.length - 1) { this.frame = this.shot.frames.length - 1; this.finishBall(this.shot.runs, this.shot.out !== null, this.shot.label); }
    }
    if (this.phase === 'result' && this.phaseT > 1.3) this.afterBall();
    if (this.phase === 'break' && this.phaseT > 2) { this.cur = 1; this.startBall(); }
  }

  private resolve(T: number) {
    const d = this.d!;
    const pr = this.press;
    const shot: Shot = pr && pr.t >= 0 ? pr.shot : 'none';
    const j = judgeSwing(shot, pr ? pr.t - T : 9);
    if (shot !== 'none') sfx('whoosh', { gain: 0.5 });
    if (j.contact === 'miss') {
      if (hitsStumps(this.v, d)) { sfx('crunch'); this.finishBall(0, true, 'bowled'); }
      else this.finishBall(0, false, 'dot');
      return;
    }
    sfx('click', { pitch: j.contact === 'clean' ? 0.7 : 1.4, gain: 1 });
    this.shot = simulateShot(this.v, launchFor(shot, j.contact, j.quality, (pr?.t ?? T) - T, this.v, d, this.rng), this.rng, this.cfg.diff === 'easy' && !this.isAI(this.batSide) ? 0.65 : 0.8);
    this.frame = 0;
    this.phase = 'shot';
    this.phaseT = 0;
  }

  private finishBall(runs: number, out: boolean, label: string) {
    if (this.phase === 'result') return;
    const inn = addBall(this.innings[this.cur], { runs, out, legal: true });
    this.innings[this.cur] = inn;
    if (label === 'six') this.sixes[this.batSide]++;
    if (label === 'tank' && !this.isAI(this.batSide)) this.tankHits++;
    const map: Record<string, string> = {
      dot: this.tx('dot'), runs: this.tx('runs', { n: runs }), four: this.tx('four'), six: this.tx('six'), tank: this.tx('tank'), bowled: this.tx('bowled'),
      caught: this.tx('caught'), 'six-out': this.tx('sixOut'), 'off-roof': this.tx('offRoof'), house: this.tx('house'), 'one-tip': this.tx('oneTip'),
    };
    this.banner = map[label] ?? '';
    this.bannerKind = out ? 'out' : runs >= 4 ? 'good' : 'plain';
    if (out) { sfx('out'); vibrate([30, 40, 60]); }
    else if (runs >= 4) { sfx(runs === 6 ? 'six' : 'fanfare'); if (!this.cfg.reducedMotion) this.fx.burst(450, 200, 26, { colors: ['#e3127d', '#ffc20e', '#009e96', '#fff'], shape: 'rect', speed: 320, size: 8, gravity: 300, max: 1.2 }); }
    else if (runs > 0) sfx('good', { pitch: 0.8 + runs * 0.1 });
    this.phase = 'result';
    this.phaseT = 0;
  }

  private afterBall() {
    const inn = this.innings[this.cur];
    if (inningsComplete(inn, this.lim, this.target())) {
      if (this.cur === 0) { this.phase = 'break'; this.phaseT = 0; sfx('whistle'); this.banner = this.tx('breakT', { n: inn.runs + 1 }); this.bannerKind = 'plain'; return; }
      return this.finish();
    }
    this.startBall();
  }

  private finish() {
    this.phase = 'done';
    const r = decideMatch(this.innings[0], this.innings[1], this.lim);
    const winnerSide = r.winner === null ? null : r.winner === 0 ? this.battingFirst : 1 - this.battingFirst;
    const n = (x: number | string) => fmtNum(x, this.cfg.lang);
    const side = (i: number) => (i === 0 ? this.battingFirst : 1 - this.battingFirst);
    const vsAI = this.cfg.mode === 'ai';
    const id = this.v.id;
    const ach: string[] = [];
    if (vsAI && winnerSide === 0) ach.push(`${short(id)}-win`);
    if (id === 'tape-tennis' && this.sixes[0] >= 3) ach.push('tt-sixes');
    if (id === 'rooftop' && this.tankHits >= 2) ach.push('rc-tank');
    this.onOver?.({
      outcome: vsAI ? (winnerSide === null ? 'tie' : winnerSide === 0 ? 'win' : 'loss') : winnerSide === null ? 'tie' : 'none',
      title: winnerSide === null ? this.tx('tied') : this.tx('won', { name: this.cfg.names[winnerSide] }),
      rows: [0, 1].map((i) => [this.tx('inn', { name: this.cfg.names[side(i)] }), `${n(this.innings[i].runs)}/${n(this.innings[i].wickets)} (${n(oversText(this.innings[i].balls))})`] as [string, string]),
      score: vsAI ? this.innings[this.battingFirst === 0 ? 0 : 1].runs : undefined,
      achievements: ach,
    });
  }

  // ---------- Drawing ----------
  render(ctx: CanvasRenderingContext2D, v: View) {
    if (this.phase === 'shot' || (this.phase === 'result' && this.shot)) this.drawField(ctx, v);
    else this.drawDelivery(ctx, v);
    this.drawHud(ctx, v);
    this.fx.draw(ctx);
    this.texts.draw(ctx, FONT);
    if ((this.phase === 'result' || this.phase === 'break') && this.banner) {
      ctx.font = `800 40px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const w = ctx.measureText(this.banner).width + 50;
      ctx.fillStyle = this.bannerKind === 'out' ? 'rgba(198,47,47,0.95)' : this.bannerKind === 'good' ? 'rgba(243,182,31,0.97)' : 'rgba(255,253,246,0.96)';
      ctx.beginPath(); ctx.roundRect?.(450 - w / 2, 290, w, 64, 18); ctx.fill();
      ctx.fillStyle = this.bannerKind === 'plain' ? '#1f3a93' : this.bannerKind === 'good' ? '#3a2a00' : '#fff';
      ctx.fillText(this.banner, 450, 323);
    }
  }

  private drawBackdrop(ctx: CanvasRenderingContext2D, v: View) {
    const L = LOOK[this.v.id];
    const g = ctx.createLinearGradient(0, v.top, 0, 260);
    g.addColorStop(0, L.sky[0]); g.addColorStop(1, L.sky[1]);
    ctx.fillStyle = g; ctx.fillRect(v.left, v.top, v.right - v.left, 260 - v.top);
    ctx.fillStyle = L.ground; ctx.fillRect(v.left, 250, v.right - v.left, v.bottom - 250);
    const id = this.v.id;
    if (id === 'short-pitch' || id === 'tape-tennis') {
      // Houses of the para / shops of the street, far behind the bowler
      for (let i = -3; i < 12; i++) {
        const x = i * 90, h = 70 + ((i * 37) % 50);
        ctx.fillStyle = ['#e8d7a6', '#f2c6a0', '#c9dfc1', '#bcd3e8', '#f0b8b8'][((i % 5) + 5) % 5];
        ctx.fillRect(x, 250 - h, 84, h);
        ctx.fillStyle = '#2f7d55';
        ctx.fillRect(x + 14, 250 - h + 14, 18, 20); ctx.fillRect(x + 50, 250 - h + 14, 18, 20);
        if (id === 'tape-tennis') { ctx.fillStyle = ['#e3127d', '#009e96', '#ffc20e'][((i % 3) + 3) % 3]; ctx.fillRect(x, 250 - 26, 84, 8); }
      }
    } else if (id === 'rooftop') {
      ctx.fillStyle = 'rgba(120, 130, 150, 0.45)';
      for (let i = -3; i < 14; i++) ctx.fillRect(i * 70, 250 - 60 - ((i * 53) % 70), 60, 200);
      ctx.fillStyle = '#1d1d1d'; ctx.fillRect(610, 160, 60, 60); // water tank
      ctx.strokeStyle = '#555'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(v.left, 205); ctx.lineTo(v.right, 195); ctx.stroke(); // clothes line
      ['#e3127d', '#ffc20e', '#2b7bd8'].forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(140 + i * 60, 200 - i, 30, 34); });
      ctx.fillStyle = '#d9d2c3'; ctx.fillRect(v.left, 240, v.right - v.left, 14); // parapet
    } else {
      // Alley: tall walls on both sides with doors and windows
      ctx.fillStyle = '#c96f55';
      ctx.beginPath(); ctx.moveTo(v.left, v.top); ctx.lineTo(380, 150); ctx.lineTo(380, 260); ctx.lineTo(v.left, v.bottom); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#d58a6e';
      ctx.beginPath(); ctx.moveTo(v.right, v.top); ctx.lineTo(520, 150); ctx.lineTo(520, 260); ctx.lineTo(v.right, v.bottom); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#2f7d55'; ctx.fillRect(120, 230, 40, 80); ctx.fillRect(730, 230, 40, 80);
    }
  }

  private drawDelivery(ctx: CanvasRenderingContext2D, v: View) {
    this.drawBackdrop(ctx, v);
    const L = LOOK[this.v.id];
    // Pitch in perspective
    const a = this.proj(this.v.pitch + 1, -1, 0), b = this.proj(this.v.pitch + 1, 1, 0), c = this.proj(-1.2, 1, 0), d0 = this.proj(-1.2, -1, 0);
    ctx.fillStyle = L.pitch;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d0.x, d0.y); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 3;
    const cr = this.proj(1.2, -1, 0), cr2 = this.proj(1.2, 1, 0);
    ctx.beginPath(); ctx.moveTo(cr.x, cr.y); ctx.lineTo(cr2.x, cr2.y); ctx.stroke();
    // Far stumps (bricks in the alley)
    const fs = this.proj(this.v.pitch, 0, 0);
    this.drawStumps(ctx, fs.x, fs.y, fs.s);
    // Bowling grid
    if (this.phase === 'pick') {
      for (let li = 0; li < 3; li++) for (let ci = 0; ci < 3; ci++) {
        const r = this.cellRect(li, ci);
        ctx.fillStyle = `rgba(31, 58, 147, ${0.18 + li * 0.06})`; ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(r.x, r.y, r.w, r.h);
        ctx.fillStyle = '#fff'; ctx.font = `700 ${Math.round(14 + li * 3)}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(fmtNum(li * 3 + ci + 1, this.cfg.lang), r.x + r.w / 2, r.y + r.h / 2);
      }
    }
    // Bowler running in
    const run = this.phase === 'runup' ? this.phaseT / 0.8 : this.phase === 'delivery' ? 1 : 0;
    const bp = this.proj(this.v.pitch + 3 - run * 3, 0.2, 0);
    ctx.save(); ctx.translate(bp.x, bp.y); ctx.scale(bp.s * 1.15, bp.s * 1.15);
    drawKid(ctx, 0, 0, -1, LOOKS[this.bowlSide === 0 ? 0 : 3], { lean: -0.1, step: run * 12, stride: this.phase === 'runup' ? 0.8 : 0, lift: 0, arms: this.phase === 'delivery' && this.phaseT < 0.15 ? 'up' : 'back' });
    ctx.restore();
    // Ball and its shadow
    if (this.phase === 'delivery' && this.d) {
      const p = ballAt(this.v, this.d, this.phaseT);
      const sh = this.proj(p.z, p.x, 0), bl = this.proj(p.z, p.x, p.h);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(sh.x, sh.y, 9 * sh.s + 2, 3.5 * sh.s + 1, 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = this.v.id === 'tape-tennis' ? '#d62a2a' : '#f2e14a';
      ctx.beginPath(); ctx.arc(bl.x, bl.y, 9 * bl.s + 2, 0, 6.283); ctx.fill();
      if (this.v.id === 'tape-tennis') { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(bl.x, bl.y, 6 * bl.s + 1, 0, 3.1); ctx.stroke(); }
    }
    // Near stumps and the batter
    const ns = this.proj(0, 0, 0);
    this.drawStumps(ctx, ns.x, ns.y, ns.s);
    const swing = this.press && this.press.t >= 0 ? Math.min(1, Math.max(0, (this.phaseT - this.press.t) / 0.18)) : 0;
    ctx.save(); ctx.translate(ns.x - 70, ns.y + 10);
    drawKid(ctx, 0, 0, 1, LOOKS[this.batSide === 0 ? 0 : 3], { lean: 0.15, step: 0, stride: 0.3, lift: 0, arms: 'hold', hand: { x: 40, y: -95 } });
    ctx.save(); ctx.translate(40, -95); ctx.rotate(-0.9 + swing * 2.2 * (this.press?.shot === 'defend' ? 0.4 : 1));
    ctx.fillStyle = '#c8a46a'; ctx.strokeStyle = '#7a5530'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect?.(-4, 0, 14, 78, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1b1b1b'; ctx.fillRect(-1, -22, 8, 24);
    ctx.restore(); ctx.restore();
  }

  private drawStumps(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
    if (this.v.id === 'goli') {
      ctx.fillStyle = '#a5452f';
      for (let k = 0; k < 3; k++) ctx.fillRect(x - 22 * s, y - (k + 1) * 14 * s, 44 * s, 13 * s); // stacked bricks
      return;
    }
    ctx.fillStyle = '#f5f0e0';
    for (const dx of [-12, 0, 12]) ctx.fillRect(x + dx * s - 3 * s, y - 70 * s, 6 * s, 70 * s);
    ctx.fillStyle = '#c8a46a'; ctx.fillRect(x - 15 * s, y - 72 * s, 30 * s, 4 * s);
  }

  /** Top view of the field during the shot. */
  private drawField(ctx: CanvasRenderingContext2D, v: View) {
    const V = this.v;
    const L = LOOK[V.id];
    const maxY = V.shape === 'circle' ? V.radius : V.len;
    const halfX = V.shape === 'circle' ? V.radius : V.halfW;
    const sc = Math.min(560 / (maxY + 5), 800 / (halfX * 2 + 4));
    const ox = 450, oy = 600;
    const P = (x: number, y: number) => ({ x: ox + x * sc, y: oy - y * sc });
    ctx.fillStyle = V.id === 'rooftop' ? '#6f7f8f' : V.id === 'goli' ? '#6b4a3a' : '#5e8f34';
    ctx.fillRect(v.left, v.top, v.right - v.left, v.bottom - v.top);
    ctx.fillStyle = L.ground;
    if (V.shape === 'circle') { const c = P(0, 0); ctx.beginPath(); ctx.arc(c.x, c.y, V.radius * sc, Math.PI, 0); ctx.lineTo(c.x + V.radius * sc, c.y + 40); ctx.lineTo(c.x - V.radius * sc, c.y + 40); ctx.fill(); }
    else { const a = P(-V.halfW, V.len), b = P(V.halfW, -4); ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y); }
    // Zones
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2; ctx.setLineDash([8, 8]);
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = `700 16px ${FONT}`; ctx.textAlign = 'center';
    V.zones.forEach((z, i) => {
      if (V.zoneBy === 'radius') { const c = P(0, 0); ctx.beginPath(); ctx.arc(c.x, c.y, z * sc, Math.PI, 0); ctx.stroke(); ctx.fillText(fmtNum(i + 1, this.cfg.lang), c.x, c.y - z * sc + 16); }
      else { const a = P(-halfX, z), b = P(halfX, z); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.fillText(fmtNum(i + 1, this.cfg.lang), a.x + 16, a.y - 6); }
    });
    ctx.setLineDash([]);
    // Boundary and walls
    ctx.strokeStyle = V.id === 'rooftop' ? '#d9d2c3' : V.id === 'goli' ? '#c96f55' : '#ffffff';
    ctx.lineWidth = V.walls ? 8 : 4;
    if (V.shape === 'circle') { const c = P(0, 0); ctx.beginPath(); ctx.arc(c.x, c.y, V.radius * sc, Math.PI, 0); ctx.stroke(); }
    else { const a = P(-V.halfW, V.len), b = P(V.halfW, -4); ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y); }
    if (V.tank) { const t = P(V.tank.x, V.tank.y); ctx.fillStyle = '#1d1d1d'; ctx.beginPath(); ctx.arc(t.x, t.y, V.tank.r * sc, 0, 6.283); ctx.fill(); }
    // Pitch strip
    const p1 = P(-0.8, V.pitch), p2 = P(0.8, -0.6);
    ctx.fillStyle = L.pitch; ctx.fillRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
    const shot = this.shot!;
    const f = Math.min(shot.frames.length - 1, Math.floor(this.frame));
    // Fielders
    shot.fielders.forEach((path, i) => {
      const [fx, fy] = path[Math.min(path.length - 1, f)];
      const q = P(fx, fy);
      ctx.fillStyle = i === shot.catcher && f >= shot.frames.length - 1 ? '#f3b61f' : this.bowlSide === 0 ? '#c0392b' : '#1f4e9c';
      ctx.beginPath(); ctx.arc(q.x, q.y, 9, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#1d140e'; ctx.beginPath(); ctx.arc(q.x, q.y, 5, 0, 6.283); ctx.fill();
    });
    // Batter
    const bt = P(0, 0);
    ctx.fillStyle = this.batSide === 0 ? '#c0392b' : '#1f4e9c'; ctx.beginPath(); ctx.arc(bt.x - 8, bt.y, 9, 0, 6.283); ctx.fill();
    // Ball: shadow on the ground, ball raised by its height
    const [bx, by, bh] = shot.frames[f];
    const g = P(bx, by);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(g.x, g.y, 6, 3, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = V.id === 'tape-tennis' ? '#d62a2a' : '#f2e14a';
    ctx.beginPath(); ctx.arc(g.x, g.y - bh * sc * 0.8, 6 + bh * 1.2, 0, 6.283); ctx.fill();
    // Trail
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2; ctx.beginPath();
    for (let k = Math.max(0, f - 30); k <= f; k++) { const [x, y, h] = shot.frames[k]; const q = P(x, y); if (k === Math.max(0, f - 30)) ctx.moveTo(q.x, q.y - h * sc * 0.8); else ctx.lineTo(q.x, q.y - h * sc * 0.8); }
    ctx.stroke();
  }

  private drawHud(ctx: CanvasRenderingContext2D, v: View) {
    const inn = this.innings[this.cur];
    const n = (x: number | string) => fmtNum(x, this.cfg.lang);
    ctx.fillStyle = 'rgba(36, 57, 45, 0.92)';
    ctx.fillRect(v.left, v.top, v.right - v.left, 54);
    ctx.fillStyle = '#e9efe6'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.font = `800 26px ${FONT}`;
    ctx.fillText(`${this.cfg.names[this.batSide]}  ${n(inn.runs)}/${n(inn.wickets)}`, v.left + 14, v.top + 27);
    ctx.font = `600 17px ${FONT}`;
    const tg = this.target();
    const left = this.lim.balls! - inn.balls;
    const extra = tg !== undefined ? `   ${this.tx('need', { r: Math.max(0, tg - inn.runs), b: left })}` : '';
    ctx.textAlign = 'right';
    ctx.fillText(`${this.tx('over', { o: n(oversText(inn.balls)) })} / ${n(this.lim.balls! / 6)}${extra}`, v.right - 14, v.top + 27);
    // This over
    const over = currentOver(inn.events);
    over.forEach((e, i) => {
      const x = v.left + 16 + i * 30, y = v.top + 72;
      ctx.fillStyle = e.out ? '#c62f2f' : e.runs >= 4 ? '#f3b61f' : 'rgba(255,253,246,0.92)';
      ctx.beginPath(); ctx.arc(x, y, 12, 0, 6.283); ctx.fill();
      ctx.fillStyle = e.out ? '#fff' : '#3a2516'; ctx.font = `800 13px ${FONT}`; ctx.textAlign = 'center';
      ctx.fillText(e.out ? 'W' : n(e.runs), x, y + 1);
    });
    if (this.phase === 'pick') {
      ctx.font = `800 22px ${FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = '#1f3a93';
      ctx.fillText(this.tx('bowlPick', { name: this.cfg.names[this.bowlSide] }) + `  (${this.fast ? this.tx('fast') : this.tx('slow')})`, 450, 120);
    }
  }
}

function short(id: VenueId) {
  return id === 'short-pitch' ? 'sp' : id === 'tape-tennis' ? 'tt' : id === 'rooftop' ? 'rc' : 'gc';
}


export interface CricketTexts { title: string; lede: string; rules: string[] }

export function CricketGame({ venue, onExit, texts }: { venue: VenueId; onExit: () => void; texts: CricketTexts }) {
  const t = useT(S);
  const pads = (cfg: ShellConfig): PadDef[] => {
    const list: PadDef[] = [
      { player: 0, action: 'defend', label: t('defend'), area: 'bl', size: 'l', color: 'rgba(31,78,156,0.85)', keys: ['KeyA', 'ArrowLeft'], keyHint: 'A' },
      { player: 0, action: 'drive', label: t('drive'), area: 'br', size: 'l', color: 'rgba(18,122,89,0.9)', keys: ['Space', 'ArrowUp'], keyHint: 'Space' },
      { player: 0, action: 'loft', label: t('loft'), area: 'br', size: 'm', color: 'rgba(192,57,43,0.9)', keys: ['KeyD', 'ArrowRight'], keyHint: 'D' },
      { player: 0, action: 'fast', label: '⚡', sub: `${t('fast')}/${t('slow')}`, area: 'bc', size: 's', color: 'rgba(122,85,48,0.85)', keys: ['KeyF'], keyHint: 'F' },
    ];
    for (let k = 1; k <= 9; k++) list.push({ player: 0, action: `b${k}`, label: String(k), area: 'bc', hidden: true, keys: [`Digit${k}`, `Numpad${k}`] });
    void cfg;
    return list;
  };
  return (
    <GameShell
      gameId={venue === 'rooftop' ? 'rooftop-cricket' : venue === 'goli' ? 'goli-cricket' : venue} onExit={onExit} title={texts.title} lede={texts.lede}
      rules={texts.rules.map((r, i) => (i === 1 ? <b key={i}>{r}</b> : r))}
      modes={['ai', 'local2p']} difficulty={(m) => m === 'ai'}
      options={[
        { key: 'overs', label: t('overs'), def: 2, choices: [1, 2, 3].map((x) => ({ v: x, label: fmtNum(x, t.lang) })) },
        { key: 'wickets', label: t('wickets'), def: 3, choices: [2, 3, 5].map((x) => ({ v: x, label: fmtNum(x, t.lang) })) },
        { key: 'first', label: t('batFirst'), def: 0, choices: [{ v: 0, label: t('me') }, { v: 1, label: t('them') }] },
        ...(venue === 'rooftop' ? [{ key: 'roof', label: t('roofRule'), def: 'out', choices: [{ v: 'out', label: t('roofOut') }, { v: 'six', label: t('roofSix') }] }] : []),
      ]}
      hint={t('keys')}
      createScene={(cfg) => new CricketScene(cfg, venue, t, createRng())}
      pads={pads}
    />
  );
}
