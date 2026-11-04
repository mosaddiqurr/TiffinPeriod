import type { View } from '../../engine/GameCanvas';
import type { GameProps } from '../../platform/registry';
import { useT, type StringTable } from '../../platform/i18n';
import { sfx, speak, vibrate } from '../../platform/audio';
import { createRng, type Rng } from '../../engine/rng';
import { GameShell, type PadDef, type ShellConfig } from '../../components/GameShell';
import { HUD_H, RaceScene, type RacerBase, type RaceTexts } from '../../shared/race';
import { raceRoster, raceTexts } from '../../shared/raceKit';
import { drawKid, LOOKS } from '../../shared/kid';
import { CHANT_BN, CHANT_EN, Caller, WalkerAI, isCaught, stepWalker, type Walker } from './model';

const S: StringTable<'title' | 'lede' | 'r1' | 'r2' | 'r3' | 'r4' | 'walk' | 'caught' | 'watching' | 'caughtN' | 'touched'> = {
  en: {
    title: 'Elonti Belonti', lede: '“Elonti Belonti, ghori baje ting ting, ek dui tin!” Then — freeze!',
    r1: 'Hold WALK to move toward the caller under the mango tree.', r2: 'The caller chants with their back to you. The speed changes every time.',
    r3: 'On “tin!” the caller turns. If you are still moving, you go back to the start. You need a moment to stop!', r4: 'The first player to reach the caller wins.',
    walk: 'WALK', caught: 'Caught! Back to the start', watching: 'Watching!', caughtN: 'Times caught', touched: 'Touched!',
  },
  bn: {
    title: 'এলন্টি বেলন্টি', lede: '“এলন্টি বেলন্টি, ঘড়ি বাজে টিং টিং, এক দুই তিন!” তারপর — থামো!',
    r1: 'হাঁটো চেপে ধরলে আমগাছের নিচে দাঁড়ানো ডাকনেওয়ালার দিকে এগোবে।', r2: 'ডাকনেওয়ালা পেছন ফিরে ছড়া বলে। প্রতিবার গতি আলাদা।',
    r3: '“তিন!” বলেই ঘুরে তাকাবে। তখনো নড়লে শুরুতে ফিরে যেতে হবে। থামতে একটু সময় লাগে!', r4: 'যে আগে ডাকনেওয়ালাকে ছুঁতে পারবে, সে জিতবে।',
    walk: 'হাঁটো', caught: 'ধরা পড়েছ! শুরুতে ফেরো', watching: 'দেখছে!', caughtN: 'ধরা পড়েছে', touched: 'ছুঁয়ে দিয়েছে!',
  },
};

interface EBRacer extends RacerBase { w: Walker; ai: WalkerAI | null; look: number }
type Txt = ReturnType<typeof useT<'caught' | 'watching' | 'caughtN'>>;
const FONT = '"Baloo Da 2", sans-serif';

class ElontiScene extends RaceScene<EBRacer> {
  caller: Caller;
  private words: string[];
  constructor(cfg: ShellConfig, rt: RaceTexts, private tx: Txt, rng: Rng) {
    super(rt, cfg.reducedMotion);
    this.trackLen = 1500;
    this.timeLimit = 150;
    this.grace = 0.5;
    this.caller = new Caller(rng);
    this.words = cfg.lang === 'bn' ? CHANT_BN : CHANT_EN;
    const roster = raceRoster(cfg, cfg.mode === 'local2p' ? 1 : 2);
    this.racers = roster.map((r, i) => ({
      ...r, x: this.startX, finished: false, finishT: null, w: { x: this.startX, v: 0, hold: false, caught: 0 }, look: [2, 4, 3, 0][i % 4],
      ai: r.player < 0 ? new WalkerAI(cfg.diff, rng) : null,
    }));
  }

  control(player: number, action: string, down: boolean) {
    if (action !== 'walk') return;
    const r = this.racers.find((x) => x.player === player);
    if (r) r.w.hold = down;
  }

  update(dt: number) {
    if (this.started && !this.ended) {
      const ev = this.caller.update(dt);
      if (ev === 'word') {
        const wd = this.caller.word;
        sfx(wd === 4 || wd === 5 ? 'good' : 'tick', wd === 4 || wd === 5 ? { pitch: 1.8, gain: 0.5 } : { gain: 0.6 });
        if (wd === 6) speak('এক দুই তিন', 'one two three', 1.3);
      }
      if (ev === 'turned') sfx('whoosh');
      if (ev === 'away') speak('এলন্টি বেলন্টি', 'Elonti Belonti', 1.2);
    }
    super.update(dt);
  }

  protected stepRacer(r: EBRacer, dt: number) {
    r.ai?.update(r.w, this.caller);
    stepWalker(r.w, dt);
    if (isCaught(r.w, this.caller)) {
      r.w.caught++;
      r.w.x = this.startX;
      r.w.v = 0;
      r.w.hold = false;
      if (r.player >= 0) { this.texts.add(this.startX + 140, 60, this.tx('caught'), '#ffd2c8', 26, 1.4); sfx('out'); vibrate([60, 40, 60]); }
    }
    r.x = r.w.x;
  }

  protected drawLaneProps(ctx: CanvasRenderingContext2D) {
    // Mango tree and the caller at the end of the lane
    const tx = this.finishX + 70, gy = 240;
    ctx.fillStyle = '#6b4a2b';
    ctx.fillRect(tx + 30, gy - 160, 22, 160);
    ctx.fillStyle = '#3f7d34';
    for (const [x, y, r] of [[41, -190, 62], [-5, -170, 40], [86, -172, 44]] as const) { ctx.beginPath(); ctx.arc(tx + x, gy + y, r, 0, 6.283); ctx.fill(); }
    ctx.fillStyle = '#f1c40f';
    for (const [x, y] of [[10, -160], [70, -150], [40, -200], [95, -185]] as const) { ctx.beginPath(); ctx.ellipse(tx + x, gy + y, 5, 7, 0.3, 0, 6.283); ctx.fill(); }
    const c = this.caller;
    const facing = c.state === 'watch' || (c.state === 'turning' && c.stateT > 0.1) || (c.state === 'back' && c.stateT < 0.1) ? -1 : 1;
    drawKid(ctx, tx, gy, facing as 1 | -1, LOOKS[5], { lean: 0, step: 0, stride: 0, lift: 0, arms: facing === 1 ? 'up' : 'back', mouthOpen: c.state === 'chant' ? 0.6 : 0.1 });
  }

  protected drawRacer(ctx: CanvasRenderingContext2D, r: EBRacer, gy: number) {
    const s = r.w.v / 140;
    drawKid(ctx, r.w.x, gy, 1, LOOKS[r.look], { lean: -s * 0.1, step: r.w.x * 0.06, stride: s, lift: 0, arms: s > 0.1 ? 'back' : 'back', mouthOpen: this.caller.state === 'watch' ? 0.05 : 0.2, cheeks: this.caller.state === 'watch' });
  }

  render(ctx: CanvasRenderingContext2D, v: View) {
    super.render(ctx, v);
    if (!this.started || this.ended) return;
    // Chant banner: the words so far, or "Watching!"
    const c = this.caller;
    const cx = (v.left + v.right) / 2, y = HUD_H + 26;
    ctx.font = `800 22px ${FONT}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (c.state === 'chant') {
      const text = this.words.slice(0, c.word + 1).join(' ');
      const w = Math.min(v.right - v.left - 20, ctx.measureText(text).width + 30);
      ctx.fillStyle = 'rgba(255, 253, 246, 0.95)';
      ctx.beginPath(); ctx.roundRect?.(cx - w / 2, y - 18, w, 36, 18); ctx.fill();
      ctx.fillStyle = c.word >= 6 ? '#c62f2f' : '#1f3a93';
      ctx.fillText(text, cx, y + 1, w - 16);
    } else if (c.state === 'watch' || c.state === 'turning') {
      ctx.fillStyle = 'rgba(198, 47, 47, 0.95)';
      ctx.beginPath(); ctx.roundRect?.(cx - 90, y - 20, 180, 40, 20); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(`◉ ${this.tx('watching')} ◉`, cx, y + 1);
    }
  }

  protected extraRows(r: EBRacer): Array<[string, string | number]> {
    return [[`${r.name} — ${this.tx('caughtN')}`, r.w.caught]];
  }

  protected achievements(st: EBRacer[]): string[] {
    const ids: string[] = [];
    const p1 = this.racers.find((r) => r.player === 0)!;
    if (st[0] === p1 && p1.finished && !this.racers.some((r) => r.player === 1)) ids.push('eb-win');
    if (this.racers.some((r) => r.player >= 0 && r.finished && r.w.caught === 0)) ids.push('eb-statue');
    return ids;
  }
}

export default function ElontiBelonti({ onExit }: GameProps) {
  const t = useT(S);
  const pads = (cfg: ShellConfig): PadDef[] => {
    const list: PadDef[] = [{ player: 0, action: 'walk', label: t('walk'), area: 'br', size: 'l', color: 'rgba(192,57,43,0.88)', keys: cfg.mode === 'local2p' ? ['KeyA'] : ['Space', 'KeyA', 'ArrowRight', 'KeyD'], keyHint: cfg.mode === 'local2p' ? 'A' : 'Space' }];
    if (cfg.mode === 'local2p') list.push({ player: 1, action: 'walk', label: t('walk'), area: 'tr', size: 'l', flip: true, color: 'rgba(31,78,156,0.88)', keys: ['KeyL'], keyHint: 'L' });
    return list;
  };
  return (
    <GameShell
      gameId="elonti-belonti" onExit={onExit} title={t('title')} lede={t('lede')}
      rules={[t('r1'), t('r2'), <b key="r3">{t('r3')}</b>, t('r4')]}
      modes={['ai', 'local2p']} difficulty={() => true}
      createScene={(cfg) => new ElontiScene(cfg, { ...raceTexts(cfg.lang), won: (n) => `${n} — ${t('touched')}` }, t, createRng())}
      pads={pads}
    />
  );
}
