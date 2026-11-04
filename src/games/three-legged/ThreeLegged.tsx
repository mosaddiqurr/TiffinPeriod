import type { GameProps } from '../../platform/registry';
import { useT, type StringTable } from '../../platform/i18n';
import { sfx, vibrate } from '../../platform/audio';
import { createRng, type Rng } from '../../engine/rng';
import { GameShell, type PadDef, type ShellConfig } from '../../components/GameShell';
import { RaceScene, RACER_COLORS, type RacerBase, type RaceTexts } from '../../shared/race';
import { raceTexts } from '../../shared/raceKit';
import { drawKid, LOOKS } from '../../shared/kid';
import { PairAI, newPair, stepFoot, stepPair, type Foot, type Pair } from './model';

const S: StringTable<'title' | 'lede' | 'r1' | 'r2' | 'r3' | 'r4' | 'left' | 'right' | 'outer' | 'tied' | 'stumble' | 'fall' | 'stumbles' | 'falls' | 'team' | 'coop' | 'modeHelp'> = {
  en: {
    title: 'Three-Legged Race', lede: 'Two friends, one gamchha, three legs. Step together!',
    r1: 'Your pair has two moves: the OUTER legs and the TIED legs.', r2: 'Alternate them: outer, tied, outer, tied… at a steady pace.',
    r3: 'Same move twice, both at once, or too fast = a stumble. Too many stumbles and you both fall.', r4: 'Two players: each friend controls one move. Talk to each other!',
    left: 'Outer', right: 'Tied', outer: 'outer legs', tied: 'tied legs', stumble: 'Oops!', fall: 'Dhopash!', stumbles: 'Stumbles', falls: 'Falls',
    team: 'Your pair', coop: 'Team', modeHelp: 'In two-player mode you are ONE team: Player 1 has the outer legs, Player 2 has the tied legs.',
  },
  bn: {
    title: 'তিন পায়ে দৌড়', lede: 'দুই বন্ধু, এক গামছা, তিন পা। একসাথে পা ফেলো!',
    r1: 'তোমাদের জোড়ার দুটো চাল: বাইরের পা আর বাঁধা পা।', r2: 'পালা করে ফেলো: বাইরের, বাঁধা, বাইরের, বাঁধা… সমান তালে।',
    r3: 'একই চাল দুইবার, দুটো একসাথে, বা খুব তাড়াতাড়ি = হোঁচট। বেশি হোঁচট খেলে দুজনেই পড়বে।', r4: 'দুইজনে খেললে একেকজন একেকটা চাল দেবে। কথা বলে তাল মেলাও!',
    left: 'বাইরের', right: 'বাঁধা', outer: 'বাইরের পা', tied: 'বাঁধা পা', stumble: 'হোঁচট!', fall: 'ধপাস!', stumbles: 'হোঁচট', falls: 'পড়েছে',
    team: 'তোমাদের জোড়া', coop: 'দল', modeHelp: 'দুইজন মানে একটাই দল: খেলোয়াড় ১ বাইরের পা, খেলোয়াড় ২ বাঁধা পা।',
  },
};

interface PairRacer extends RacerBase { m: Pair; ai: PairAI | null; looks: [number, number] }
type Txt = ReturnType<typeof useT<'stumble' | 'fall' | 'stumbles' | 'falls'>>;

class ThreeLeggedScene extends RaceScene<PairRacer> {
  constructor(cfg: ShellConfig, rt: RaceTexts, private tx: Txt, rng: Rng, teamName: string) {
    super(rt, cfg.reducedMotion);
    this.trackLen = 1200;
    const ai = cfg.lang === 'bn' ? ['রাফি–মিতু', 'শুভ–রিয়া'] : ['Rafi–Mitu', 'Shuvo–Riya'];
    const mk = (player: number, name: string, color: string, looks: [number, number]): PairRacer => ({
      player, name, color, x: this.startX, finished: false, finishT: null, m: newPair(this.startX), looks,
      ai: player < 0 ? new PairAI(cfg.diff, rng) : null,
    });
    this.racers = [mk(-1, ai[0], RACER_COLORS[2], [2, 4]), mk(-1, ai[1], RACER_COLORS[3], [3, 1]), mk(0, teamName, RACER_COLORS[0], [0, 1])];
  }

  control(_player: number, action: string, down: boolean) {
    if (!down || !this.started || this.ended) return;
    const r = this.racers.find((x) => x.player === 0)!;
    if (r.finished) return;
    const j = stepFoot(r.m, action as Foot, this.t);
    if (j === 'same' || j === 'together' || j === 'fast') { this.texts.add(r.x + 20, 70, this.tx('stumble'), '#ffe27a', 24, 0.6); vibrate(25); sfx('bad', { gain: 0.4 }); }
    else if (j !== 'down') sfx('thud', { gain: 0.25, pitch: action === 'L' ? 1 : 1.25 });
    if (r.m.fallen > 1.45) { this.texts.add(r.x, 60, this.tx('fall'), '#ffd2c8', 30); sfx('thud'); vibrate([40, 30, 40]); }
  }

  protected stepRacer(r: PairRacer, dt: number) {
    r.ai?.update(r.m, this.t);
    stepPair(r.m, dt);
    r.x = r.m.x;
  }

  protected drawRacer(ctx: CanvasRenderingContext2D, r: PairRacer, gy: number) {
    const m = r.m;
    const wob = Math.sin(this.time * 11) * m.wobble * 0.3;
    const lean = m.fallen > 0 ? -1.3 : wob - Math.min(0.12, m.v / 1500);
    const moving = Math.min(1, m.v / 120);
    // Back kid first (darker, slightly behind), then the front kid.
    ctx.save();
    ctx.globalAlpha = 0.92;
    drawKid(ctx, m.x + 16, gy - 4, 1, LOOKS[r.looks[1]], { lean, step: m.phase + Math.PI, stride: 0.35 + moving * 0.4, lift: 0, arms: 'hold', hand: { x: m.x + 4, y: gy - 120 }, mouthOpen: 0.2 });
    ctx.restore();
    drawKid(ctx, m.x, gy, 1, LOOKS[r.looks[0]], { lean, step: m.phase, stride: 0.35 + moving * 0.4, lift: 0, arms: 'hold', hand: { x: m.x + 16, y: gy - 118 }, mouthOpen: m.wobble > 0.4 ? 0.7 : 0.15 });
    // Gamchha: a red-and-white checked cloth tied round the middle legs
    ctx.save();
    ctx.translate(m.x + 8 + Math.sin(m.phase) * 4, gy - 30);
    ctx.rotate(-lean * 0.4);
    ctx.fillStyle = '#d62a2a';
    ctx.fillRect(-14, -7, 28, 14);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let k = -12; k < 14; k += 7) ctx.fillRect(k, -7, 2.5, 14);
    ctx.fillRect(-14, -1.5, 28, 3);
    ctx.fillStyle = '#d62a2a';
    ctx.beginPath(); ctx.moveTo(12, -2); ctx.lineTo(26, 10 + Math.sin(this.time * 8) * 3); ctx.lineTo(20, 12); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  protected extraRows(r: PairRacer): Array<[string, string | number]> {
    return [[`${r.name} — ${this.tx('stumbles')}`, r.m.stumbles], [`${r.name} — ${this.tx('falls')}`, r.m.falls]];
  }

  protected achievements(st: PairRacer[]): string[] {
    const me = this.racers.find((r) => r.player === 0)!;
    const ids: string[] = [];
    if (st[0] === me && me.finished) ids.push('tl-win');
    if (me.finished && me.m.stumbles === 0) ids.push('tl-clean');
    return ids;
  }
}

export default function ThreeLegged({ onExit }: GameProps) {
  const t = useT(S);
  const pads = (cfg: ShellConfig): PadDef[] => {
    const coop = cfg.mode === 'local2p';
    return [
      { player: 0, action: 'L', label: t('left'), sub: coop ? cfg.names[0] : undefined, area: 'bl', size: 'l', color: 'rgba(192,57,43,0.88)', keys: coop ? ['KeyA'] : ['KeyA', 'ArrowLeft', 'KeyF'], keyHint: coop ? 'A' : 'A / ←' },
      { player: coop ? 1 : 0, action: 'R', label: t('right'), sub: coop ? cfg.names[1] : undefined, area: 'br', size: 'l', color: 'rgba(31,78,156,0.88)', keys: coop ? ['KeyL'] : ['KeyD', 'ArrowRight', 'KeyJ'], keyHint: coop ? 'L' : 'D / →' },
    ];
  };
  return (
    <GameShell
      gameId="three-legged" onExit={onExit} title={t('title')} lede={t('lede')}
      rules={[t('r1'), t('r2'), <b key="r3">{t('r3')}</b>, t('r4')]}
      modes={['ai', 'local2p']} difficulty={() => true} hint={t('modeHelp')}
      createScene={(cfg) => new ThreeLeggedScene(cfg, raceTexts(cfg.lang), t, createRng(), cfg.mode === 'local2p' ? `${cfg.names[0]} + ${cfg.names[1]}` : t('team'))}
      pads={pads}
    />
  );
}
