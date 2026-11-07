import type { GameProps } from '../../platform/registry';
import { useT, type StringTable } from '../../platform/i18n';
import { sfx, vibrate } from '../../platform/audio';
import { createRng, type Rng } from '../../engine/rng';
import { GameShell, type PadDef, type ShellConfig } from '../../components/GameShell';
import { RaceScene, type RacerBase, type RaceTexts } from '../../shared/race';
import { raceRoster, raceTexts } from '../../shared/raceKit';
import { drawKid, LOOKS } from '../../shared/kid';
import { SpoonAI, newRunner, stepRunner, type Runner } from './model';

const S: StringTable<'title' | 'lede' | 'r1' | 'r2' | 'r3' | 'r4' | 'run' | 'drop' | 'drops' | 'rule' | 'pickup' | 'restart'> = {
  en: {
    title: 'Spoon & Marble Race', lede: 'A spoon in your mouth, a marble in the spoon. Steady now!',
    r1: 'Hold RUN to go. Let go to slow down.', r2: 'Speeding up rolls the marble back. Slowing down rolls it forward. Watch the bubble above your head.',
    r3: 'Faster running makes bigger bumps. If the marble falls, you stop to pick it up.', r4: 'First to the finish with the marble wins.',
    run: 'RUN', drop: 'Dropped!', drops: 'Drops', rule: 'If the marble falls', pickup: 'Pick it up (2 s)', restart: 'Back to the start',
  },
  bn: {
    title: 'চামচ-মার্বেল দৌড়', lede: 'মুখে চামচ, চামচে মার্বেল। সাবধানে!',
    r1: 'দৌড় চেপে ধরলে চলবে। ছেড়ে দিলে আস্তে হবে।', r2: 'জোরে চললে মার্বেল পিছনে গড়ায়। আস্তে হলে সামনে গড়ায়। মাথার উপরের বুদবুদে চোখ রাখো।',
    r3: 'যত জোরে দৌড়াবে, তত ঝাঁকুনি। মার্বেল পড়লে থেমে তুলতে হবে।', r4: 'মার্বেল নিয়ে যে আগে শেষ দাগে, সে জিতবে।',
    run: 'দৌড়', drop: 'পড়ে গেল!', drops: 'মার্বেল পড়েছে', rule: 'মার্বেল পড়লে', pickup: 'তুলে নাও (২ সে.)', restart: 'শুরুতে ফিরে যাও',
  },
};

interface SpoonRacer extends RacerBase { m: Runner; ai: SpoonAI | null; look: number; hue: string }
type Txt = ReturnType<typeof useT<'drop' | 'drops'>>;
const MARBLES = ['#2b7bd8', '#d83b2b', '#22a06b', '#9b4fd6'];

class SpoonScene extends RaceScene<SpoonRacer> {
  private rule: 'pickup' | 'start';
  constructor(cfg: ShellConfig, rt: RaceTexts, private tx: Txt, private rng: Rng) {
    super(rt, cfg.reducedMotion);
    this.trackLen = 1300;
    this.rule = cfg.opts.rule === 'start' ? 'start' : 'pickup';
    const roster = raceRoster(cfg, cfg.mode === 'local2p' ? 1 : 2);
    this.racers = roster.map((r, i) => ({
      ...r, x: this.startX, finished: false, finishT: null, m: newRunner(this.startX), look: [3, 1, 2, 0][i % 4], hue: MARBLES[i % 4],
      ai: r.player < 0 ? new SpoonAI(cfg.diff) : null,
    }));
  }

  control(player: number, action: string, down: boolean) {
    if (action !== 'run') return;
    const r = this.racers.find((x) => x.player === player);
    if (r) r.m.hold = down;
  }

  protected stepRacer(r: SpoonRacer, dt: number) {
    r.ai?.update(r.m);
    if (stepRunner(r.m, dt, this.rng, this.rule, this.startX) === 'drop') {
      if (r.player >= 0) { this.texts.add(r.x + 30, 70, this.tx('drop'), '#ffd2c8', 28); sfx('boing', { pitch: 1.6 }); vibrate([30, 30, 30]); }
      if (!this.reducedMotion) this.fx.burst(r.m.x + 30, 150, 5, { color: r.hue, speed: 160, size: 6, gravity: 900, max: 0.6 });
    }
    r.x = r.m.x;
  }

  protected drawRacer(ctx: CanvasRenderingContext2D, r: SpoonRacer, gy: number) {
    const m = r.m;
    const s = m.v / 230;
    const bending = m.down > 0;
    drawKid(ctx, m.x, gy, 1, LOOKS[r.look], { lean: bending ? -0.9 : -s * 0.08, step: m.phase * 2, stride: s, lift: 0, arms: 'back', mouthOpen: 0 });
    if (bending) {
      ctx.fillStyle = r.hue;
      ctx.beginPath(); ctx.arc(m.x + 46, gy - 6, 6, 0, 6.283); ctx.fill();
      return;
    }
    // Spoon from the mouth, and the marble on it
    const mx = m.x + 14, my = gy - 141 + Math.sin(m.phase * 2) * 2 * s;
    ctx.strokeStyle = '#b8bec6'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx + 26, my - 2); ctx.stroke();
    ctx.fillStyle = '#d5dbe1';
    ctx.beginPath(); ctx.ellipse(mx + 38, my - 2, 13, 5, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = r.hue;
    ctx.beginPath(); ctx.arc(mx + 38 + m.m * 11, my - 8, 5.5, 0, 6.283); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath(); ctx.arc(mx + 36.5 + m.m * 11, my - 9.5, 1.8, 0, 6.283); ctx.fill();
    // Zoom bubble above the head: the spoon bowl and the marble, large
    if (r.player >= 0) {
      const bx = m.x + 10, by = gy - 205;
      ctx.fillStyle = 'rgba(255, 253, 246, 0.95)';
      ctx.beginPath(); ctx.roundRect?.(bx - 62, by - 20, 124, 40, 20); ctx.fill();
      const danger = Math.abs(m.m);
      ctx.strokeStyle = danger > 0.75 ? '#c62f2f' : danger > 0.5 ? '#e6a100' : '#127a59';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(bx - 50, by - 6); ctx.quadraticCurveTo(bx, by + 14, bx + 50, by - 6); ctx.stroke();
      ctx.fillStyle = 'rgba(198,47,47,0.6)';
      ctx.fillRect(bx - 54, by - 14, 4, 16); ctx.fillRect(bx + 50, by - 14, 4, 16);
      const px = bx + m.m * 50, py = by - 6 + (1 - m.m * m.m) * 10 - 8;
      ctx.fillStyle = r.hue;
      ctx.beginPath(); ctx.arc(px, py, 8, 0, 6.283); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath(); ctx.arc(px - 2.5, py - 2.5, 2.5, 0, 6.283); ctx.fill();
    }
  }

  protected extraRows(r: SpoonRacer): Array<[string, string | number]> {
    return [[`${r.name} — ${this.tx('drops')}`, r.m.drops]];
  }

  protected achievements(st: SpoonRacer[]): string[] {
    const ids: string[] = [];
    const p1 = this.racers.find((r) => r.player === 0)!;
    if (st[0] === p1 && p1.finished && !this.racers.some((r) => r.player === 1)) ids.push('sm-win');
    if (this.racers.some((r) => r.player >= 0 && r.finished && r.m.drops === 0)) ids.push('sm-steady');
    return ids;
  }
}

export default function SpoonMarble({ onExit }: GameProps) {
  const t = useT(S);
  const pads = (cfg: ShellConfig): PadDef[] => {
    const list: PadDef[] = [{ player: 0, action: 'run', label: t('run'), area: 'br', size: 'l', color: 'rgba(192,57,43,0.88)', keys: cfg.mode === 'local2p' ? ['KeyA'] : ['Space', 'KeyA', 'ArrowRight', 'KeyD'], keyHint: cfg.mode === 'local2p' ? 'A' : 'Space' }];
    if (cfg.mode === 'local2p') list.push({ player: 1, action: 'run', label: t('run'), area: 'tr', size: 'l', flip: true, color: 'rgba(31,78,156,0.88)', keys: ['KeyL'], keyHint: 'L' });
    return list;
  };
  return (
    <GameShell
      gameId="spoon-marble" onExit={onExit} title={t('title')} lede={t('lede')}
      rules={[t('r1'), <b key="r2">{t('r2')}</b>, t('r3'), t('r4')]}
      modes={['ai', 'local2p']} difficulty={() => true}
      options={[{ key: 'rule', label: t('rule'), def: 'pickup', choices: [{ v: 'pickup', label: t('pickup') }, { v: 'start', label: t('restart') }] }]}
      createScene={(cfg) => new SpoonScene(cfg, raceTexts(cfg.lang), t, createRng())}
      pads={pads}
    />
  );
}
