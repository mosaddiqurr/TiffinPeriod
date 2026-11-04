// Small, allocation-light particle system for bursts, dust and confetti.

export type ParticleShape = 'dot' | 'rect' | 'shred' | 'crumb';

export interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number;
  size: number; rot: number; vr: number;
  color: string; shape: ParticleShape;
  gravity: number; drag: number;
}

export class Particles {
  items: Particle[] = [];
  constructor(private cap = 400) {}

  burst(x: number, y: number, n: number, o: Partial<Particle> & { speed?: number; spread?: number; angle?: number; colors?: string[] }) {
    const speed = o.speed ?? 300;
    const spread = o.spread ?? Math.PI * 2;
    const base = o.angle ?? -Math.PI / 2;
    for (let i = 0; i < n; i++) {
      if (this.items.length >= this.cap) this.items.shift();
      const a = base + (Math.random() - 0.5) * spread;
      const s = speed * (0.35 + Math.random() * 0.65);
      const life = (o.max ?? 0.8) * (0.6 + Math.random() * 0.4);
      this.items.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life, max: life,
        size: (o.size ?? 6) * (0.6 + Math.random() * 0.8),
        rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 12,
        color: o.colors ? o.colors[(Math.random() * o.colors.length) | 0] : o.color ?? '#fff',
        shape: o.shape ?? 'dot',
        gravity: o.gravity ?? 900, drag: o.drag ?? 1.5,
      });
    }
  }

  update(dt: number) {
    const arr = this.items;
    for (let i = arr.length - 1; i >= 0; i--) {
      const p = arr[i];
      p.life -= dt;
      if (p.life <= 0) { arr.splice(i, 1); continue; }
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vy = p.vy * k + p.gravity * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    for (const p of this.items) {
      const a = Math.min(1, p.life / (p.max * 0.5));
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if (p.shape === 'dot') {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size / 2, 0, 6.283); ctx.fill();
      } else {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        if (p.shape === 'rect') ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        else if (p.shape === 'crumb') ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.8);
        else {
          ctx.beginPath(); ctx.moveTo(-p.size / 2, 0); ctx.quadraticCurveTo(0, -p.size / 2, p.size / 2, 0);
          ctx.lineTo(p.size / 3, p.size / 4); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }
}

/** Floating score or word that rises and fades. */
export interface FloatText { x: number; y: number; text: string; color: string; life: number; max: number; size: number }

export class FloatTexts {
  items: FloatText[] = [];
  add(x: number, y: number, text: string, color = '#fff', size = 34, life = 0.9) {
    this.items.push({ x, y, text, color, life, max: life, size });
    if (this.items.length > 40) this.items.shift();
  }
  update(dt: number) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const f = this.items[i];
      f.life -= dt; f.y -= 60 * dt;
      if (f.life <= 0) this.items.splice(i, 1);
    }
  }
  draw(ctx: CanvasRenderingContext2D, font: string) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const f of this.items) {
      const t = 1 - f.life / f.max;
      const s = t < 0.15 ? 0.6 + (t / 0.15) * 0.5 : 1.1 - Math.min(0.1, (t - 0.15));
      ctx.globalAlpha = Math.min(1, f.life / (f.max * 0.4));
      ctx.font = `700 ${Math.round(f.size * s)}px ${font}`;
      ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(30,20,10,0.55)';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }
}
