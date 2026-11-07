import type { Scene, View } from '../../engine/GameCanvas';
import type { GameProps } from '../../platform/registry';
import { useT, fmtNum, type StringTable } from '../../platform/i18n';
import { createSpatialSource, sfx, speak, vibrate, type SpatialSource } from '../../platform/audio';
import { createRng, type Rng } from '../../engine/rng';
import { FloatTexts, Particles } from '../../engine/particles';
import { GameShell, type PadDef, type ShellConfig, type ShellResult, type ShellScene } from '../../components/GameShell';
import { BlindAI, HB, friendShout, newBlind, placePot, stepBlind, swing, type Blind, type Shout } from './model';

const S: StringTable<
  | 'title' | 'lede' | 'r1' | 'r2' | 'r3' | 'r4' | 'left' | 'right' | 'walk' | 'hitBtn' | 'peek' | 'peekBig' | 'peekSmall' | 'peekNone'
  | 'sLeft' | 'sRight' | 'sStraight' | 'sHit' | 'sBack' | 'broke' | 'missed' | 'timeUp' | 'turnOf' | 'swings' | 'time' | 'tapToGo' | 'won' | 'draw' | 'naughty' | 'headphones' | 'result'
> = {
  en: {
    title: 'Haari Bhanga', lede: 'Blindfolded, spun round, a stick in your hand. Find the pot and break it!',
    r1: 'You start blindfolded and spun round. Turn with ◀ ▶ and walk with ▲.', r2: 'Listen: the pot goes “tung”. It is faster when you are close. Headphones help.',
    r3: 'Your friends shout “left!”, “right!” or “straight!”. In hard mode one friend sometimes lies!', r4: 'You have three swings and 60 seconds. Swing when the pot is right in front of you.',
    left: '◀', right: '▶', walk: '▲', hitBtn: 'HIT!', peek: 'Peek under the blindfold', peekBig: 'A lot (easy)', peekSmall: 'A little', peekNone: 'No peeking (hard)',
    sLeft: 'Left!', sRight: 'Right!', sStraight: 'Straight on!', sHit: 'Hit it now!', sBack: 'Turn round!', broke: 'CRASH! The pot is broken!', missed: 'Whoosh — missed!', timeUp: 'Time is up!',
    turnOf: '{name}’s turn', swings: 'Swings', time: 'Time', tapToGo: 'Tap to start', won: '{name} wins!', draw: 'Nobody broke the pot', naughty: 'Naughty friend', headphones: 'Use headphones for the best sound.', result: 'Result',
  },
  bn: {
    title: 'হাঁড়িভাঙা', lede: 'চোখ বাঁধা, ঘুরিয়ে দেওয়া হয়েছে, হাতে লাঠি। হাঁড়ি খুঁজে ভাঙো!',
    r1: 'চোখ বেঁধে ঘুরিয়ে ছেড়ে দেওয়া হবে। ◀ ▶ দিয়ে ঘোরো, ▲ দিয়ে হাঁটো।', r2: 'কান পাতো: হাঁড়ি “টুং” করে। কাছে গেলে দ্রুত বাজে। হেডফোনে সবচেয়ে ভালো।',
    r3: 'বন্ধুরা চিৎকার করবে “বামে!”, “ডানে!”, “সোজা!”। কঠিন মোডে এক দুষ্টু বন্ধু মাঝে মাঝে মিথ্যা বলে!', r4: 'তিনবার লাঠি মারতে পারবে, সময় ৬০ সেকেন্ড। হাঁড়ি ঠিক সামনে এলে মারো।',
    left: '◀', right: '▶', walk: '▲', hitBtn: 'মারো!', peek: 'চোখের বাঁধনের নিচ দিয়ে দেখা', peekBig: 'অনেকটা (সহজ)', peekSmall: 'একটুখানি', peekNone: 'একদম না (কঠিন)',
    sLeft: 'বামে!', sRight: 'ডানে!', sStraight: 'সোজা যাও!', sHit: 'এখনই মারো!', sBack: 'পেছনে ঘোরো!', broke: 'ঠাস! হাঁড়ি ভেঙেছে!', missed: 'সাঁই — ফসকে গেল!', timeUp: 'সময় শেষ!',
    turnOf: '{name}-এর পালা', swings: 'লাঠি বাকি', time: 'সময়', tapToGo: 'শুরু করতে চাপো', won: '{name} জিতেছে!', draw: 'কেউ হাঁড়ি ভাঙতে পারেনি', naughty: 'দুষ্টু বন্ধু', headphones: 'হেডফোন লাগালে শব্দ সবচেয়ে ভালো বোঝা যায়।', result: 'ফলাফল',
  },
};

type Txt = ReturnType<typeof useT<'sLeft' | 'sRight' | 'sStraight' | 'sHit' | 'sBack' | 'broke' | 'missed' | 'timeUp' | 'turnOf' | 'swings' | 'time' | 'tapToGo' | 'won' | 'draw' | 'result'>>;
const FONT = '"Baloo Da 2", sans-serif';

interface Turn { player: number; name: string; ai: BlindAI | null; b: Blind; pot: { x: number; y: number } }

class HaariScene implements Scene, ShellScene {
  designW = HB.fieldW;
  designH = HB.fieldH;
  originY = 0;
  private portrait = false;
  private camX = 0;
  onOver?: (r: ShellResult) => void;
  private turns: Turn[] = [];
  private cur = 0;
  private phase: 'ready' | 'spin' | 'play' | 'reveal' = 'ready';
  private phaseT = 0;
  private spatial: SpatialSource | null = null;
  private nextPing = 0;
  private nextShout = 1.2;
  private bubbles: Array<{ s: Shout; side: number; life: number }> = [];
  private fx = new Particles(300);
  private texts = new FloatTexts();
  private time = 0;
  private peekR: number;
  private lie: number;
  private ended = false;

  constructor(private cfg: ShellConfig, private tx: Txt, private rng: Rng) {
    const peek = String(cfg.opts.peek);
    this.peekR = peek === 'big' ? 95 : peek === 'small' ? 50 : 0;
    this.lie = peek === 'none' ? 0.2 : 0;
    const start = { x: 120, y: HB.fieldH / 2 };
    const pot = placePot(rng, start.x, start.y);
    const mk = (player: number, name: string, ai: boolean): Turn => ({
      player, name, ai: ai ? new BlindAI(rng, cfg.diff === 'easy' ? 0.9 : cfg.diff === 'medium' ? 0.55 : 0.3) : null,
      b: newBlind(start.x, start.y, rng.range(-Math.PI, Math.PI)), pot: { ...pot },
    });
    this.turns.push(mk(0, cfg.names[0], false));
    if (cfg.mode === 'local2p') this.turns.push(mk(1, cfg.names[1], false));
    if (cfg.mode === 'ai') this.turns.push(mk(-1, cfg.names[1], true));
  }

  private get t(): Turn {
    return this.turns[this.cur];
  }

  control(player: number, action: string, down: boolean) {
    const tn = this.t;
    if (this.phase === 'ready') { if (down) this.begin(); return; }
    if (this.phase !== 'play' || tn.ai || (tn.player !== player && this.cfg.mode !== 'local2p')) return;
    const b = tn.b;
    if (action === 'left') b.turn = down ? -1 : b.turn === -1 ? 0 : b.turn;
    if (action === 'right') b.turn = down ? 1 : b.turn === 1 ? 0 : b.turn;
    if (action === 'walk') b.walking = down;
    if (action === 'hit' && down) this.doSwing();
  }

  pointerDown() {
    if (this.phase === 'ready' && !this.t.ai) this.begin();
  }

  private begin() {
    this.phase = 'spin';
    this.phaseT = 0;
    sfx('whoosh');
    if (!this.spatial) this.spatial = createSpatialSource(0.012);
  }

  private doSwing() {
    const r = swing(this.t.b, this.t.pot);
    if (r === 'none') return;
    sfx('whoosh', { pitch: 1.4 });
    if (r === 'hit') {
      sfx('popBig'); sfx('crunch'); vibrate([40, 30, 80]);
      const p = this.t.pot;
      this.fx.burst(p.x, p.y, 30, { colors: ['#b5651d', '#8a4b16', '#d8894a'], shape: 'crumb', speed: 320, size: 9, gravity: 0, drag: 3, max: 1.2 });
      this.fx.burst(p.x, p.y, 24, { colors: ['#e3127d', '#ffc20e', '#009e96', '#fff'], shape: 'rect', speed: 260, size: 8, gravity: 0, drag: 2, max: 1.6 });
      this.texts.add(p.x, p.y - 40, this.tx('broke'), '#ffe27a', 34, 1.8);
    } else {
      this.texts.add(this.t.b.x, this.t.b.y - 50, this.tx('missed'), '#ffffff', 26);
    }
  }

  dispose() {
    this.spatial?.stop();
  }

  update(dt: number) {
    this.time += dt;
    const camTarget = this.portrait ? Math.min(HB.fieldW - this.designW, Math.max(0, this.t.b.x - this.designW / 2)) : 0;
    this.camX += (camTarget - this.camX) * Math.min(1, dt * 4);
    this.fx.update(dt);
    this.texts.update(dt);
    this.bubbles = this.bubbles.filter((b) => (b.life -= dt) > 0);
    const tn = this.t;
    if (this.ended) return;
    if (this.phase === 'ready' && tn.ai) this.begin();
    if (this.phase === 'spin') {
      this.phaseT += dt;
      tn.b.heading += dt * 9 * (1 - this.phaseT / 1.4);
      if (this.phaseT >= 1.4) { this.phase = 'play'; this.phaseT = 0; sfx('whistle'); }
      return;
    }
    if (this.phase === 'play') {
      if (tn.ai && tn.ai.update(tn.b, tn.pot, dt)) this.doSwing();
      stepBlind(tn.b, dt);
      const d = Math.hypot(tn.pot.x - tn.b.x, tn.pot.y - tn.b.y);
      this.spatial?.update(tn.b.x, tn.b.y, tn.b.heading, tn.pot.x, tn.pot.y);
      this.nextPing -= dt;
      if (this.nextPing <= 0) { this.spatial?.ping(); this.nextPing = 0.22 + Math.min(1, d / 600) * 1.0; }
      this.nextShout -= dt;
      if (this.nextShout <= 0 && !tn.ai) {
        this.nextShout = this.rng.range(1.3, 2.2);
        const s = friendShout(tn.b, tn.pot, this.rng, this.lie);
        const side = s === 'left' ? -1 : s === 'right' ? 1 : 0;
        this.bubbles.push({ s, side, life: 1.3 });
        const words: Record<Shout, [string, string]> = { left: ['বামে', 'left'], right: ['ডানে', 'right'], straight: ['সোজা', 'straight'], hit: ['মারো', 'hit it'], back: ['পেছনে', 'turn round'] };
        speak(words[s][0], words[s][1], 1.25);
      }
      if (tn.b.done) {
        if (!tn.b.broke && tn.b.time >= HB.time) this.texts.add(500, 300, this.tx('timeUp'), '#ffffff', 34);
        this.phase = 'reveal'; this.phaseT = 0;
      }
      return;
    }
    if (this.phase === 'reveal') {
      this.phaseT += dt;
      if (this.phaseT > 2.6) {
        if (this.cur + 1 < this.turns.length) { this.cur++; this.phase = 'ready'; this.bubbles = []; this.nextShout = 1.2; }
        else this.finish();
      }
    }
  }

  private finish() {
    this.ended = true;
    const n = (v: number | string) => fmtNum(v, this.cfg.lang);
    const score = (tn: Turn) => (tn.b.broke ? tn.b.time : Infinity);
    const ranked = [...this.turns].sort((a, b) => score(a) - score(b) || b.b.swingsLeft - a.b.swingsLeft);
    const best = ranked[0];
    const someone = best.b.broke;
    const tie = this.turns.length > 1 && someone && score(ranked[0]) === score(ranked[1]);
    const me = this.turns[0];
    let outcome: ShellResult['outcome'] = 'none';
    if (this.cfg.mode === 'solo') outcome = me.b.broke ? 'win' : 'loss';
    if (this.cfg.mode === 'ai') outcome = !someone ? 'tie' : best === me ? 'win' : 'loss';
    const rows: Array<[string, string | number]> = [];
    for (const tn of this.turns) {
      rows.push([`${tn.name} — ${this.tx('result')}`, tn.b.broke ? `${n(tn.b.time.toFixed(1))} s` : '✗']);
      rows.push([`${tn.name} — ${this.tx('swings')}`, tn.b.swingsLeft]);
    }
    this.onOver?.({
      outcome,
      title: !someone ? this.tx('draw') : this.cfg.mode === 'solo' ? this.tx('broke') : tie ? this.tx('draw') : this.tx('won', { name: best.name }),
      rows,
      score: me.b.broke ? Math.round(me.b.time * 10) / 10 : undefined,
      lowerIsBetter: true,
      achievements: [...(me.b.broke ? ['hb-break'] : []), ...(me.b.broke && me.b.swingsLeft === HB.swings - 1 ? ['hb-one-swing'] : [])],
    });
  }

  render(ctx: CanvasRenderingContext2D, v: View) {
    const tn = this.t;
    const b = tn.b;
    const blind = !tn.ai && (this.phase === 'play' || this.phase === 'spin');
    // World layer, with a camera that follows the player on portrait screens.
    const cam = this.camX;
    ctx.save();
    ctx.translate(-cam, 0);
    const wv = { left: v.left + cam, right: v.right + cam, top: v.top, bottom: v.bottom };
    // Field (school ground with chalk lines) and the pot on a bamboo stand
    ctx.fillStyle = '#7fb145'; ctx.fillRect(wv.left, wv.top, wv.right - wv.left, wv.bottom - wv.top);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 3;
    ctx.strokeRect(30, 30, HB.fieldW - 60, HB.fieldH - 60);
    ctx.beginPath(); ctx.arc(120, HB.fieldH / 2, 40, 0, 6.283); ctx.stroke();
    if (!(b.broke && this.phase === 'reveal')) this.drawPot(ctx, tn.pot.x, tn.pot.y);
    // Path (only after the turn)
    if (!blind) {
      ctx.strokeStyle = 'rgba(31, 58, 147, 0.7)'; ctx.lineWidth = 3; ctx.setLineDash([8, 8]);
      ctx.beginPath(); b.path.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
    }
    this.drawPlayer(ctx, b);
    this.fx.draw(ctx);
    if (blind) {
      // The blindfold: dark cloth, with a small gap at the bottom to peek through.
      ctx.save();
      const g = ctx.createRadialGradient(b.x, b.y, Math.max(1, this.peekR * 0.6), b.x, b.y, Math.max(2, this.peekR));
      g.addColorStop(0, 'rgba(40, 8, 8, 0)');
      g.addColorStop(1, 'rgba(40, 8, 8, 1)');
      ctx.fillStyle = this.peekR > 0 ? g : 'rgba(40, 8, 8, 1)';
      ctx.fillRect(wv.left, wv.top, wv.right - wv.left, wv.bottom - wv.top);
      // Gamchha checks on the cloth
      ctx.globalAlpha = 0.08; ctx.fillStyle = '#ffffff';
      for (let x = Math.floor(wv.left / 60) * 60; x < wv.right; x += 60) ctx.fillRect(x, wv.top, 6, wv.bottom - wv.top);
      for (let y = Math.floor(wv.top / 60) * 60; y < wv.bottom; y += 60) ctx.fillRect(wv.left, y, wv.right - wv.left, 6);
      ctx.restore();
      if (this.peekR > 0) this.drawPlayer(ctx, b);
    }
    this.texts.draw(ctx, FONT);
    ctx.restore();
    // HUD
    ctx.font = `800 24px ${FONT}`; ctx.textBaseline = 'middle';
    ctx.textAlign = 'left'; ctx.fillStyle = '#fff';
    ctx.fillText(`${this.tx('turnOf', { name: tn.name })}`, v.left + 16, v.top + 28);
    ctx.textAlign = 'right';
    ctx.fillText(`${this.tx('swings')} ${'●'.repeat(b.swingsLeft)}   ${this.tx('time')} ${fmtNum(Math.max(0, Math.ceil(HB.time - b.time)), this.cfg.lang)}`, v.right - 16, v.top + 28);
    // Friends' shouts at the screen edges
    for (const bb of this.bubbles) {
      const label = { left: this.tx('sLeft'), right: this.tx('sRight'), straight: this.tx('sStraight'), hit: this.tx('sHit'), back: this.tx('sBack') }[bb.s];
      const cx = bb.side < 0 ? v.left + 110 : bb.side > 0 ? v.right - 110 : (v.left + v.right) / 2;
      const cy = bb.side === 0 ? v.top + 90 : (v.top + v.bottom) / 2;
      ctx.globalAlpha = Math.min(1, bb.life * 2);
      ctx.fillStyle = '#fffdf6';
      ctx.font = `800 30px ${FONT}`;
      const w = ctx.measureText(label).width + 36;
      ctx.beginPath(); ctx.roundRect?.(cx - w / 2, cy - 26, w, 52, 26); ctx.fill();
      ctx.fillStyle = '#c62f2f'; ctx.textAlign = 'center';
      ctx.fillText(label, cx, cy + 1);
      ctx.globalAlpha = 1;
    }
    if (this.phase === 'ready' && !tn.ai) {
      const mx = (v.left + v.right) / 2, my = (v.top + v.bottom) / 2;
      ctx.fillStyle = 'rgba(20,10,5,0.55)'; ctx.fillRect(v.left, v.top, v.right - v.left, v.bottom - v.top);
      ctx.fillStyle = '#fff'; ctx.font = `800 40px ${FONT}`; ctx.textAlign = 'center';
      ctx.fillText(this.tx('turnOf', { name: tn.name }), mx, my - 30);
      ctx.font = `700 26px ${FONT}`;
      ctx.fillText(this.tx('tapToGo'), mx, my + 30);
    }
  }

  /** Portrait phones: a taller, narrower view with a camera that follows the player. */
  onResize(w: number, h: number) {
    this.portrait = h > w;
    this.designW = this.portrait ? 560 : HB.fieldW;
    this.designH = this.portrait ? 860 : HB.fieldH;
    this.originY = this.portrait ? -80 : 0;
  }

  private drawPot(ctx: CanvasRenderingContext2D, x: number, y: number) {
    ctx.strokeStyle = '#b89545'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(x - 50, y - 60); ctx.lineTo(x + 50, y - 60); ctx.stroke();
    ctx.strokeStyle = '#8a6d2c'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y - 60); ctx.lineTo(x, y - 22); ctx.stroke();
    ctx.fillStyle = '#b5651d';
    ctx.beginPath(); ctx.ellipse(x, y, 26, 23, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#8a4b16'; ctx.fillRect(x - 12, y - 26, 24, 7);
    ctx.strokeStyle = '#f2e6c9'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(x, y + 2, 18, 6, 0, 0, Math.PI); ctx.stroke();
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, b: Blind) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.heading);
    const sw = b.swingT > 0 ? Math.sin((0.45 - b.swingT) / 0.45 * Math.PI) * 1.4 - 0.7 : -0.7;
    ctx.save(); ctx.rotate(sw);
    ctx.strokeStyle = '#7a5530'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(8, 6); ctx.lineTo(HB.reach + 8, 6); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#f4f4ef'; ctx.beginPath(); ctx.ellipse(0, 0, 14, 22, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.ellipse(0, 0, 10, 16, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#1d140e'; ctx.beginPath(); ctx.arc(0, 0, 10, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#d62a2a'; ctx.fillRect(4, -10, 5, 20); // blindfold band
    ctx.restore();
  }
}

export default function HaariBhanga({ onExit }: GameProps) {
  const t = useT(S);
  const pads = (_cfg: ShellConfig): PadDef[] => {
    const p = 0;
    return [
      { player: p, action: 'left', label: t('left'), area: 'bl', size: 'm', keys: ['ArrowLeft', 'KeyA'], keyHint: '← A' },
      { player: p, action: 'right', label: t('right'), area: 'bl', size: 'm', keys: ['ArrowRight', 'KeyD'], keyHint: '→ D' },
      { player: p, action: 'walk', label: t('walk'), area: 'br', size: 'm', keys: ['ArrowUp', 'KeyW'], keyHint: '↑ W' },
      { player: p, action: 'hit', label: t('hitBtn'), area: 'br', size: 'l', color: 'rgba(192,57,43,0.9)', keys: ['Space', 'Enter'], keyHint: 'Space' },
    ];
  };
  return (
    <GameShell
      gameId="haari-bhanga" onExit={onExit} title={t('title')} lede={t('lede')}
      rules={[t('r1'), t('r2'), t('r3'), <b key="r4">{t('r4')}</b>]}
      modes={['solo', 'ai', 'local2p']} difficulty={(m) => m === 'ai'}
      options={[{ key: 'peek', label: t('peek'), def: 'small', choices: [{ v: 'big', label: t('peekBig') }, { v: 'small', label: t('peekSmall') }, { v: 'none', label: t('peekNone') }] }]}
      hint={t('headphones')}
      createScene={(cfg) => new HaariScene(cfg, t, createRng())}
      pads={pads}
    />
  );
}
