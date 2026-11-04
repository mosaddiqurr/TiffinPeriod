import type { GameProps } from '../../platform/registry';
import { useT, type StringTable } from '../../platform/i18n';
import { sfx, vibrate } from '../../platform/audio';
import { createRng, type Rng } from '../../engine/rng';
import { GameShell, type PadDef, type ShellConfig } from '../../components/GameShell';
import { RaceScene, type RacerBase, type RaceTexts } from '../../shared/race';
import { raceRoster, raceTexts } from '../../shared/raceKit';
import { drawKid, LOOKS } from '../../shared/kid';
import { HopAI, hop, newHopper, stepHopper, type Hopper } from './model';

const S: StringTable<'title' | 'lede' | 'r1' | 'r2' | 'r3' | 'r4' | 'hop' | 'perfect' | 'soon' | 'fall' | 'hops' | 'falls' | 'perfects'> = {
  en: {
    title: 'Sack Race', lede: 'Feet in a jute sack. Hop to the finish!',
    r1: 'Tap HOP to jump forward in your sack.', r2: 'The best hop comes just after you land. Find the rhythm.',
    r3: 'Tapping too soon, or in the air, makes you wobble. Wobble too much and you fall.', r4: 'First across the finish line wins.',
    hop: 'HOP', perfect: 'Perfect!', soon: 'Wobble!', fall: 'Oops!', hops: 'Hops', falls: 'Falls', perfects: 'Perfect hops',
  },
  bn: {
    title: 'বস্তা দৌড়', lede: 'পাটের বস্তায় পা। লাফিয়ে লাফিয়ে শেষ দাগ!',
    r1: 'লাফ চাপলে বস্তা নিয়ে সামনে লাফ দেবে।', r2: 'মাটিতে নামার একটু পরেই সেরা লাফ। তালটা ধরো।',
    r3: 'খুব তাড়াতাড়ি বা শূন্যে চাপলে টলমল করবে। বেশি টলমল করলে পড়ে যাবে।', r4: 'যে আগে শেষ দাগ পার হবে, সে জিতবে।',
    hop: 'লাফ', perfect: 'দারুণ!', soon: 'টলমল!', fall: 'ধপাস!', hops: 'লাফ', falls: 'পড়েছে', perfects: 'নিখুঁত লাফ',
  },
};

interface SackRacer extends RacerBase { m: Hopper; ai: HopAI | null; look: number }
type Txt = ReturnType<typeof useT<'perfect' | 'soon' | 'fall' | 'hops' | 'falls' | 'perfects'>>;

class SackScene extends RaceScene<SackRacer> {
  constructor(cfg: ShellConfig, rt: RaceTexts, private tx: Txt, rng: Rng) {
    super(rt, cfg.reducedMotion);
    this.trackLen = 1400;
    const roster = raceRoster(cfg, cfg.mode === 'local2p' ? 1 : 2);
    this.racers = roster.map((r, i) => ({
      ...r, x: this.startX, finished: false, finishT: null, m: newHopper(this.startX), look: [0, 4, 2, 3][i % 4],
      ai: r.player < 0 ? new HopAI(cfg.diff, rng) : null,
    }));
  }

  control(player: number, action: string, down: boolean) {
    if (!down || action !== 'hop' || !this.started || this.ended) return;
    const r = this.racers.find((x) => x.player === player);
    if (r && !r.finished) this.doHop(r);
  }

  private doHop(r: SackRacer) {
    const j = hop(r.m);
    const human = r.player >= 0;
    if (j === 'perfect' && human) { this.texts.add(r.x + 20, 70, this.tx('perfect'), '#ffffff', 24, 0.6); sfx('boing', { pitch: 1.3, gain: 0.6 }); }
    if ((j === 'soon' || j === 'air') && human) { this.texts.add(r.x + 20, 70, this.tx('soon'), '#ffe27a', 24, 0.6); vibrate(20); }
    if (r.m.fallen > 0 && r.m.fallen > 1.25) { if (human) { this.texts.add(r.x, 60, this.tx('fall'), '#ffd2c8', 30); sfx('thud'); vibrate([40, 30, 40]); } }
    else if (j !== 'down' && j !== 'air' && human) sfx('boing', { gain: 0.35 });
  }

  protected stepRacer(r: SackRacer, dt: number) {
    if (r.ai && r.ai.update(r.m, dt)) this.doHop(r);
    if (stepHopper(r.m, dt) === 'land' && !this.reducedMotion) {
      this.fx.burst(r.m.x, 150, 3, { color: '#c7a978', speed: 90, angle: -Math.PI / 2, spread: 2.5, size: 5, gravity: 500, max: 0.35 });
    }
    r.x = r.m.x;
  }

  protected drawRacer(ctx: CanvasRenderingContext2D, r: SackRacer, gy: number) {
    const m = r.m;
    const sway = Math.sin(this.time * 10) * m.wobble * 0.35;
    const lying = m.fallen > 0 ? -1.35 : 0;
    const lean = lying || sway;
    const look = LOOKS[r.look];
    drawKid(ctx, m.x, gy, 1, look, { lean, step: 0, stride: 0, lift: -m.h, arms: 'hold', hand: { x: m.x + 14 - Math.sin(lean) * 60, y: gy - m.h - 78 }, mouthOpen: m.grounded ? 0.1 : 0.6 });
    // The jute sack over the legs (rotates with the body)
    ctx.save();
    ctx.translate(m.x, gy - m.h);
    ctx.rotate(-lean);
    ctx.fillStyle = '#c9a25e';
    ctx.strokeStyle = '#8a6a32'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-24, -84); ctx.lineTo(26, -84); ctx.lineTo(24, -4); ctx.quadraticCurveTo(0, 6, -22, -4); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(120, 90, 40, 0.45)'; ctx.lineWidth = 1;
    for (let y = -78; y < -4; y += 7) { ctx.beginPath(); ctx.moveTo(-22, y); ctx.lineTo(24, y); ctx.stroke(); }
    ctx.fillStyle = '#b3884a';
    ctx.fillRect(-27, -90, 56, 10);
    ctx.fillStyle = '#6b4a1f';
    ctx.font = '700 12px "Baloo Da 2", sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('চিনি', 2, -40);
    ctx.restore();
    if (m.fallen > 0) {
      for (let k = 0; k < 3; k++) {
        const a = this.time * 7 + k * 2.1;
        ctx.fillStyle = '#ffd23f';
        ctx.beginPath(); ctx.arc(m.x - 40 + Math.cos(a) * 16, gy - 40 + Math.sin(a) * 5, 4, 0, 6.283); ctx.fill();
      }
    }
  }

  protected extraRows(r: SackRacer): Array<[string, string | number]> {
    return [[`${r.name} — ${this.tx('perfects')}`, r.m.perfects], [`${r.name} — ${this.tx('falls')}`, r.m.falls]];
  }

  protected achievements(st: SackRacer[]): string[] {
    const ids: string[] = [];
    const p1 = this.racers.find((r) => r.player === 0)!;
    if (st[0] === p1 && this.racers.some((r) => r.player < 0) && !this.racers.some((r) => r.player === 1)) ids.push('sr-win');
    if (this.racers.some((r) => r.player >= 0 && r.finished && r.m.falls === 0)) ids.push('sr-nofall');
    return ids;
  }
}

export default function SackRace({ onExit }: GameProps) {
  const t = useT(S);
  const pads = (cfg: ShellConfig): PadDef[] => {
    const list: PadDef[] = [{ player: 0, action: 'hop', label: t('hop'), area: 'br', size: 'l', color: 'rgba(192,57,43,0.88)', keys: cfg.mode === 'local2p' ? ['KeyA'] : ['Space', 'KeyA', 'ArrowUp', 'KeyW'], keyHint: cfg.mode === 'local2p' ? 'A' : 'Space' }];
    if (cfg.mode === 'local2p') list.push({ player: 1, action: 'hop', label: t('hop'), area: 'tr', size: 'l', flip: true, color: 'rgba(31,78,156,0.88)', keys: ['KeyL'], keyHint: 'L' });
    return list;
  };
  return (
    <GameShell
      gameId="sack-race" onExit={onExit} title={t('title')} lede={t('lede')}
      rules={[t('r1'), t('r2'), <b key="r3">{t('r3')}</b>, t('r4')]}
      modes={['ai', 'local2p']} difficulty={() => true}
      createScene={(cfg) => new SackScene(cfg, raceTexts(cfg.lang), t, createRng())}
      pads={pads}
    />
  );
}
