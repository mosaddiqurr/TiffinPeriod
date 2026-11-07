import type { Scene, View } from '../../engine/GameCanvas';
import type { GameProps } from '../../platform/registry';
import { useT, fmtNum, type StringTable } from '../../platform/i18n';
import { playMelody, sfx, vibrate, type MusicHandle, type Note } from '../../platform/audio';
import { createRng } from '../../engine/rng';
import { FloatTexts } from '../../engine/particles';
import { GameShell, type PadDef, type ShellConfig, type ShellResult, type ShellScene } from '../../components/GameShell';
import { ChairsModel, MC, type Kid } from './model';

const S: StringTable<'title' | 'lede' | 'r1' | 'r2' | 'r3' | 'r4' | 'sit' | 'playing' | 'stopped' | 'out' | 'foul' | 'round' | 'winner' | 'youOut' | 'place' | 'fouls' | 'next'> = {
  en: {
    title: 'Musical Chairs', lede: 'The harmonium plays. Walk round the chairs. When it stops — sit!',
    r1: 'Everyone walks round the chairs while the music plays.', r2: 'When the music STOPS, press SIT. You run to the nearest free chair.',
    r3: 'Pressing SIT while the music plays is a foul: you trip. Watch out for a fake dip in the music!', r4: 'The kid without a chair is out. One chair goes each round. The last kid wins.',
    sit: 'SIT!', playing: 'Music playing…', stopped: 'SIT!', out: '{name} is out', foul: 'Foul! Tripped', round: 'Round {n}', winner: '{name} wins musical chairs!', youOut: 'Out in round {n}', place: 'Your place', fouls: 'Fouls', next: 'Next round…',
  },
  bn: {
    title: 'মিউজিক্যাল চেয়ার', lede: 'হারমোনিয়াম বাজছে। চেয়ারের চারপাশে ঘোরো। থামলেই — বসো!',
    r1: 'গান চলার সময় সবাই চেয়ারের চারপাশে ঘুরবে।', r2: 'গান থামলেই বসো চাপো। কাছের খালি চেয়ারে দৌড়ে যাবে।',
    r3: 'গান চলার সময় বসো চাপলে ফাউল: হোঁচট খাবে। গানের নকল থামা থেকে সাবধান!', r4: 'চেয়ার না পেলে বাদ। প্রতি রাউন্ডে একটা চেয়ার কমবে। শেষ জন জিতবে।',
    sit: 'বসো!', playing: 'গান চলছে…', stopped: 'বসো!', out: '{name} বাদ', foul: 'ফাউল! হোঁচট', round: 'রাউন্ড {n}', winner: '{name} মিউজিক্যাল চেয়ারে জিতেছে!', youOut: '{n} নম্বর রাউন্ডে বাদ', place: 'তোমার স্থান', fouls: 'ফাউল', next: 'পরের রাউন্ড…',
  },
};

// An original, simple tune in a folk-like major scale (MIDI notes, beats).
const TUNE: Note[] = [[67, 0.5], [69, 0.5], [71, 1], [71, 0.5], [69, 0.5], [67, 1], [64, 0.5], [67, 0.5], [69, 1], [67, 2],
  [71, 0.5], [72, 0.5], [74, 1], [72, 0.5], [71, 0.5], [69, 1], [67, 0.5], [69, 0.5], [71, 0.5], [69, 0.5], [67, 2]];
const BASS: Note[] = [[55, 2], [52, 2], [50, 2], [55, 2], [55, 2], [50, 2], [52, 2], [55, 2]];

const COLORS = ['#c0392b', '#1f4e9c', '#127a59', '#7d3c98', '#d68910'];
const HAIR = ['#1d140e', '#20160f', '#17110c', '#1d140e', '#20160f'];
const FONT = '"Baloo Da 2", sans-serif';
type Txt = ReturnType<typeof useT<'playing' | 'stopped' | 'out' | 'foul' | 'round' | 'winner' | 'youOut' | 'place' | 'fouls' | 'next'>>;

class ChairsScene implements Scene, ShellScene {
  designW = 800;
  designH = 820;
  m: ChairsModel;
  onOver?: (r: ShellResult) => void;
  private music: MusicHandle | null = null;
  private texts = new FloatTexts();
  private time = 0;
  private between = 0;
  private bg: HTMLCanvasElement | null = null;
  private ended = false;
  private placeOf = new Map<number, number>();

  constructor(private cfg: ShellConfig, private tx: Txt) {
    const ai = cfg.lang === 'bn' ? ['রাফি', 'সাকিব', 'শুভ', 'তামিম'] : ['Rafi', 'Sakib', 'Shuvo', 'Tamim'];
    const kids: Array<Pick<Kid, 'player' | 'name' | 'color'>> = [{ player: 0, name: cfg.names[0], color: COLORS[0] }];
    if (cfg.mode === 'local2p') kids.push({ player: 1, name: cfg.names[1], color: COLORS[1] });
    while (kids.length < 5) kids.push({ player: -1, name: ai[kids.length - 1], color: COLORS[kids.length] });
    this.m = new ChairsModel(400, 440, kids, cfg.diff, createRng());
    this.between = 1.2; // short pause before the first song
  }

  control(player: number, action: string, down: boolean) {
    if (!down || action !== 'sit' || this.between > 0) return;
    const r = this.m.sit(player);
    const k = this.m.kids.find((x) => x.player === player)!;
    if (r === 'foul') { this.texts.add(k.x, k.y - 40, this.tx('foul'), '#ffd2c8', 26); sfx('bad'); vibrate(80); }
    if (r === 'go') sfx('whoosh', { gain: 0.6 });
  }

  onPause(p: boolean) {
    if (p) { this.music?.stop(); this.music = null; }
  }

  dispose() {
    this.music?.stop();
    this.music = null;
  }

  update(dt: number) {
    this.time += dt;
    this.texts.update(dt);
    if (this.ended) return;
    if (this.between > 0) {
      this.between -= dt;
      if (this.between <= 0) {
        if (this.m.phase === 'roundOver') this.m.nextRound();
      }
      return;
    }
    if (this.m.phase === 'music' && !this.music) this.music = playMelody(TUNE, 132, BASS);
    this.music?.level(this.m.musicLevel);
    for (const e of this.m.update(dt)) {
      if (e.type === 'stop') { this.music?.stop(); this.music = null; sfx('tick', { pitch: 0.7 }); }
      if (e.type === 'sit' && e.kid) { sfx(e.kid.player >= 0 ? 'good' : 'thud', { gain: e.kid.player >= 0 ? 1 : 0.4 }); }
      if (e.type === 'out' && e.kid) {
        this.placeOf.set(e.kid.id, this.m.active.length + 1);
        this.texts.add(400, 440, this.tx('out', { name: e.kid.name }), '#ffffff', 34, 1.6);
        sfx(e.kid.player >= 0 ? 'out' : 'clap', { gain: e.kid.player >= 0 ? 1 : 0.5 });
        const humansLeft = this.m.active.some((k) => k.player >= 0);
        if (!humansLeft && this.cfg.mode !== 'local2p') { this.finish(); return; }
        if (this.cfg.mode === 'local2p' && this.m.active.filter((k) => k.player >= 0).length === 0) { this.finish(); return; }
        this.between = 2;
      }
      if (e.type === 'done') { this.finish(); return; }
    }
  }

  private finish() {
    if (this.ended) return;
    this.ended = true;
    this.music?.stop();
    const winner = this.m.active.length === 1 ? this.m.active[0] : null;
    if (winner) this.placeOf.set(winner.id, 1);
    const me = this.m.kids[0];
    const myPlace = this.placeOf.get(me.id) ?? this.m.active.length;
    const vsAI = this.cfg.mode === 'ai';
    const rows: Array<[string, string | number]> = this.m.kids
      .map((k) => [k, this.placeOf.get(k.id) ?? 1] as const)
      .sort((a, b) => a[1] - b[1])
      .map(([k, p]) => [`${fmtNum(p, this.cfg.lang)}. ${k.name}`, k.player >= 0 ? `${this.tx('fouls')}: ${fmtNum(k.fouls, this.cfg.lang)}` : '—'] as [string, string]);
    this.onOver?.({
      outcome: vsAI ? (myPlace === 1 ? 'win' : 'loss') : 'none',
      title: winner ? this.tx('winner', { name: winner.name }) : this.tx('youOut', { n: this.m.round }),
      rows: [[this.tx('place'), fmtNum(myPlace, this.cfg.lang)], ...rows],
      score: vsAI ? 6 - myPlace : undefined,
      achievements: [...(vsAI && myPlace === 1 ? ['mc-win'] : []), ...(myPlace === 1 && me.fouls === 0 ? ['mc-clean'] : [])],
    });
  }

  private background(v: View) {
    if (this.bg) return this.bg;
    const c = document.createElement('canvas');
    c.width = 1600; c.height = 1640;
    const g = c.getContext('2d')!;
    g.scale(2, 2);
    // School courtyard: brick-red floor tiles and a chalk circle
        g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 3; g.setLineDash([12, 10]);
    g.beginPath(); g.arc(400, 440, MC.walkR, 0, 6.283); g.stroke(); g.setLineDash([]);
    // Harmonium on a mat at the top
    g.fillStyle = '#2e6b4f'; g.fillRect(300, 40, 200, 70);
    g.fillStyle = '#6b3d1f'; g.fillRect(330, 52, 140, 44);
    g.fillStyle = '#fff'; for (let i = 0; i < 12; i++) g.fillRect(336 + i * 11, 80, 9, 14);
    g.fillStyle = '#111'; for (const i of [1, 2, 4, 5, 6, 8, 9, 11]) g.fillRect(336 + i * 11 - 3, 80, 5, 8);
    void v;
    this.bg = c;
    return c;
  }

  private tile: CanvasPattern | null = null;

  render(ctx: CanvasRenderingContext2D, v: View) {
    if (!this.tile) {
      const c = document.createElement('canvas');
      c.width = 40; c.height = 40;
      const g = c.getContext('2d')!;
      g.fillStyle = '#c9876a'; g.fillRect(0, 0, 40, 40);
      g.strokeStyle = 'rgba(120, 60, 40, 0.25)'; g.lineWidth = 2; g.strokeRect(0, 0, 40, 40);
      this.tile = ctx.createPattern(c, 'repeat');
    }
    ctx.fillStyle = this.tile ?? '#c9876a';
    ctx.fillRect(v.left, v.top, v.right - v.left, v.bottom - v.top);
    ctx.drawImage(this.background(v), 0, 0, 800, 820);
    const m = this.m;
    // Music notes over the harmonium
    if (m.phase === 'music' && this.between <= 0 && m.musicLevel > 0.5) {
      ctx.fillStyle = '#1f3a93'; ctx.font = `700 26px ${FONT}`; ctx.textAlign = 'center';
      for (let i = 0; i < 3; i++) { const p = (this.time * 0.8 + i / 3) % 1; ctx.globalAlpha = 1 - p; ctx.fillText('♪', 400 + Math.sin(p * 6 + i) * 60, 40 - p * 40 + 20); }
      ctx.globalAlpha = 1;
    }
    // Chairs (top view): seat and backrest facing outward
    for (const c of m.chairs) {
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.a);
      ctx.scale(1.35, 1.35);
      ctx.fillStyle = '#8b5a2b'; ctx.fillRect(-20, -20, 40, 40);
      ctx.fillStyle = '#6e4420'; ctx.fillRect(-26, -22, 8, 44);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.strokeRect(-20, -20, 40, 40);
      ctx.restore();
    }
    // Kids (top view)
    for (const k of m.kids) {
      if (k.out) continue;
      const bob = m.phase === 'music' ? Math.sin(this.time * 9 + k.id) * 2 : 0;
      ctx.save();
      ctx.translate(k.x, k.y + bob);
      const face = m.phase === 'music' ? k.angle + Math.PI / 2 : Math.atan2(440 - k.y, 400 - k.x);
      ctx.rotate(face);
      ctx.scale(1.45, 1.45);
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(3, 4, 22, 16, 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#f4f4ef'; ctx.beginPath(); ctx.ellipse(0, 0, 22, 14, 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = k.color; ctx.beginPath(); ctx.ellipse(0, 0, 15, 11, 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = HAIR[k.id % HAIR.length]; ctx.beginPath(); ctx.arc(0, 0, 10, 0, 6.283); ctx.fill();
      ctx.restore();
      if (k.trip > 0) { ctx.fillStyle = '#ffd23f'; for (let i = 0; i < 3; i++) { const a = this.time * 8 + i * 2.1; ctx.beginPath(); ctx.arc(k.x + Math.cos(a) * 18, k.y - 6 + Math.sin(a) * 6, 4, 0, 6.283); ctx.fill(); } }
      if (k.player >= 0) {
        ctx.fillStyle = k.color; ctx.font = `800 16px ${FONT}`; ctx.textAlign = 'center';
        ctx.fillText(`▼ ${k.name}`, k.x, k.y - 42);
      }
    }
    // Banner
    const text = this.between > 0 && m.round > 1 ? this.tx('next') : m.phase === 'music' ? this.tx('playing') : this.tx('stopped');
    ctx.font = `800 30px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + 40;
    ctx.fillStyle = m.phase === 'rush' ? 'rgba(198,47,47,0.95)' : 'rgba(255,253,246,0.95)';
    ctx.beginPath(); ctx.roundRect?.(400 - w / 2, 150, w, 46, 23); ctx.fill();
    ctx.fillStyle = m.phase === 'rush' ? '#fff' : '#1f3a93';
    ctx.fillText(text, 400, 174);
    ctx.font = `700 20px ${FONT}`; ctx.fillStyle = '#fff';
    ctx.fillText(this.tx('round', { n: m.round }), 400, 790);
    this.texts.draw(ctx, FONT);
  }
}

export default function MusicalChairs({ onExit }: GameProps) {
  const t = useT(S);
  const pads = (cfg: ShellConfig): PadDef[] => {
    const list: PadDef[] = [{ player: 0, action: 'sit', label: t('sit'), sub: cfg.mode === 'local2p' ? cfg.names[0] : undefined, area: 'br', size: 'l', color: 'rgba(192,57,43,0.9)', keys: cfg.mode === 'local2p' ? ['KeyA'] : ['Space', 'KeyA', 'Enter'], keyHint: cfg.mode === 'local2p' ? 'A' : 'Space' }];
    if (cfg.mode === 'local2p') list.push({ player: 1, action: 'sit', label: t('sit'), sub: cfg.names[1], area: 'tr', size: 'l', flip: true, color: 'rgba(31,78,156,0.9)', keys: ['KeyL'], keyHint: 'L' });
    return list;
  };
  return (
    <GameShell
      gameId="musical-chairs" onExit={onExit} title={t('title')} lede={t('lede')}
      rules={[t('r1'), <b key="r2">{t('r2')}</b>, t('r3'), t('r4')]}
      modes={['ai', 'local2p']} difficulty={() => true}
      createScene={(cfg) => new ChairsScene(cfg, t)}
      pads={pads}
      rootClass="mc-root"
    />
  );
}
