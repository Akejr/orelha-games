/**
 * Camada de efeitos da partida.
 *
 * Tudo é pooled: as partículas são pré-alocadas e reutilizadas, então uma
 * partida inteira de explosões e confetes não gera pressão de GC (que apareceria
 * como micro-travadas justo nos momentos mais intensos).
 */

const TAU = Math.PI * 2;
const MAX_PARTICLES = 520;

export type ParticleKind = 'spark' | 'ring' | 'smoke' | 'shard' | 'confetti' | 'text' | 'splat';

interface Particle {
  active: boolean;
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  growth: number;
  gravity: number;
  drag: number;
  spin: number;
  angle: number;
  color: string;
  text: string;
  alpha: number;
  behind: boolean;
}

function createParticle(): Particle {
  return {
    active: false,
    kind: 'spark',
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 0,
    maxLife: 1,
    size: 4,
    growth: 0,
    gravity: 0,
    drag: 0.92,
    spin: 0,
    angle: 0,
    color: '#ffffff',
    text: '',
    alpha: 1,
    behind: false,
  };
}

export class FxLayer {
  private pool: Particle[] = Array.from({ length: MAX_PARTICLES }, createParticle);
  private cursor = 0;
  shake = 0;
  shakeX = 0;
  shakeY = 0;
  flashAlpha = 0;
  flashColor = '#ffffff';

  private take(): Particle {
    // ring buffer: se estourar o limite, o mais antigo cede o lugar
    for (let i = 0; i < MAX_PARTICLES; i += 1) {
      const index = (this.cursor + i) % MAX_PARTICLES;
      if (!this.pool[index].active) {
        this.cursor = (index + 1) % MAX_PARTICLES;
        return this.pool[index];
      }
    }
    const fallback = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % MAX_PARTICLES;
    return fallback;
  }

  reset(): void {
    for (const particle of this.pool) particle.active = false;
    this.shake = 0;
    this.flashAlpha = 0;
  }

  addShake(amount: number): void {
    this.shake = Math.min(26, this.shake + amount);
  }

  flash(color = '#ffffff', alpha = 0.35): void {
    this.flashColor = color;
    this.flashAlpha = Math.max(this.flashAlpha, alpha);
  }

  spark(options: {
    x: number;
    y: number;
    count?: number;
    color: string;
    speed?: number;
    size?: number;
    life?: number;
    gravity?: number;
    spread?: number;
    angle?: number;
    behind?: boolean;
  }): void {
    const {
      x,
      y,
      count = 8,
      color,
      speed = 220,
      size = 5,
      life = 0.5,
      gravity = 420,
      spread = TAU,
      angle = 0,
      behind = false,
    } = options;
    for (let i = 0; i < count; i += 1) {
      const p = this.take();
      const direction = angle + (Math.random() - 0.5) * spread;
      const velocity = speed * (0.45 + Math.random() * 0.85);
      p.active = true;
      p.kind = 'spark';
      p.x = x;
      p.y = y;
      p.vx = Math.cos(direction) * velocity;
      p.vy = Math.sin(direction) * velocity;
      p.life = life * (0.7 + Math.random() * 0.6);
      p.maxLife = p.life;
      p.size = size * (0.6 + Math.random() * 0.8);
      p.growth = -size * 0.4;
      p.gravity = gravity;
      p.drag = 0.9;
      p.color = color;
      p.alpha = 1;
      p.behind = behind;
    }
  }

  ring(options: {
    x: number;
    y: number;
    color: string;
    size?: number;
    growth?: number;
    life?: number;
    behind?: boolean;
  }): void {
    const { x, y, color, size = 12, growth = 320, life = 0.42, behind = false } = options;
    const p = this.take();
    p.active = true;
    p.kind = 'ring';
    p.x = x;
    p.y = y;
    p.vx = 0;
    p.vy = 0;
    p.life = life;
    p.maxLife = life;
    p.size = size;
    p.growth = growth;
    p.gravity = 0;
    p.drag = 1;
    p.color = color;
    p.alpha = 1;
    p.behind = behind;
  }

  smoke(options: {
    x: number;
    y: number;
    count?: number;
    color?: string;
    size?: number;
    life?: number;
    speed?: number;
  }): void {
    const { x, y, count = 5, color = 'rgba(255,255,255,0.55)', size = 16, life = 0.7, speed = 60 } = options;
    for (let i = 0; i < count; i += 1) {
      const p = this.take();
      const direction = Math.random() * TAU;
      p.active = true;
      p.kind = 'smoke';
      p.x = x + (Math.random() - 0.5) * size;
      p.y = y + (Math.random() - 0.5) * size;
      p.vx = Math.cos(direction) * speed;
      p.vy = Math.sin(direction) * speed - 30;
      p.life = life * (0.7 + Math.random() * 0.7);
      p.maxLife = p.life;
      p.size = size * (0.6 + Math.random() * 0.7);
      p.growth = size * 1.6;
      p.gravity = -20;
      p.drag = 0.93;
      p.color = color;
      p.alpha = 0.8;
      p.behind = false;
    }
  }

  shards(options: { x: number; y: number; color: string; count?: number; speed?: number }): void {
    const { x, y, color, count = 7, speed = 200 } = options;
    for (let i = 0; i < count; i += 1) {
      const p = this.take();
      const direction = Math.random() * TAU;
      p.active = true;
      p.kind = 'shard';
      p.x = x;
      p.y = y;
      p.vx = Math.cos(direction) * speed * (0.4 + Math.random());
      p.vy = Math.sin(direction) * speed * (0.4 + Math.random()) - 80;
      p.life = 0.75 + Math.random() * 0.35;
      p.maxLife = p.life;
      p.size = 7 + Math.random() * 7;
      p.growth = 0;
      p.gravity = 900;
      p.drag = 0.985;
      p.spin = (Math.random() - 0.5) * 14;
      p.angle = Math.random() * TAU;
      p.color = color;
      p.alpha = 1;
      p.behind = false;
    }
  }

  splat(options: { x: number; y: number; color: string; count?: number; size?: number }): void {
    const { x, y, color, count = 6, size = 14 } = options;
    for (let i = 0; i < count; i += 1) {
      const p = this.take();
      const direction = Math.random() * TAU;
      const distance = Math.random() * size * 1.6;
      p.active = true;
      p.kind = 'splat';
      p.x = x + Math.cos(direction) * distance;
      p.y = y + Math.sin(direction) * distance;
      p.vx = 0;
      p.vy = 0;
      p.life = 0.9 + Math.random() * 0.5;
      p.maxLife = p.life;
      p.size = size * (0.35 + Math.random() * 0.6);
      p.growth = size * 0.4;
      p.gravity = 0;
      p.drag = 1;
      p.color = color;
      p.alpha = 0.85;
      p.behind = true;
    }
  }

  floatingText(options: {
    x: number;
    y: number;
    text: string;
    color: string;
    size?: number;
    life?: number;
  }): void {
    const { x, y, text, color, size = 26, life = 1.05 } = options;
    const p = this.take();
    p.active = true;
    p.kind = 'text';
    p.x = x;
    p.y = y;
    p.vx = 0;
    p.vy = -110;
    p.life = life;
    p.maxLife = life;
    p.size = size;
    p.growth = 0;
    p.gravity = 90;
    p.drag = 0.94;
    p.color = color;
    p.text = text;
    p.alpha = 1;
    p.behind = false;
  }

  confetti(options: { width: number; height: number; count?: number; colors?: string[] }): void {
    const {
      width,
      height,
      count = 90,
      colors = ['#FFC93C', '#FF5CA3', '#2BD9A8', '#3FC6FF', '#8F66FF', '#FFFFFF'],
    } = options;
    for (let i = 0; i < count; i += 1) {
      const p = this.take();
      p.active = true;
      p.kind = 'confetti';
      p.x = Math.random() * width;
      p.y = -20 - Math.random() * height * 0.6;
      p.vx = (Math.random() - 0.5) * 160;
      p.vy = 140 + Math.random() * 220;
      p.life = 2.4 + Math.random() * 1.6;
      p.maxLife = p.life;
      p.size = 8 + Math.random() * 9;
      p.growth = 0;
      p.gravity = 130;
      p.drag = 0.998;
      p.spin = (Math.random() - 0.5) * 12;
      p.angle = Math.random() * TAU;
      p.color = colors[Math.floor(Math.random() * colors.length)];
      p.alpha = 1;
      p.behind = false;
    }
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      const drag = Math.pow(p.drag, dt * 60);
      p.vx *= drag;
      p.vy = p.vy * drag + p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.angle += p.spin * dt;
      if (p.growth) p.size = Math.max(0.4, p.size + p.growth * dt);
    }

    this.shake *= Math.pow(0.86, dt * 60);
    if (this.shake < 0.05) this.shake = 0;
    const magnitude = this.shake;
    this.shakeX = (Math.random() - 0.5) * magnitude;
    this.shakeY = (Math.random() - 0.5) * magnitude;
    this.flashAlpha = Math.max(0, this.flashAlpha - dt * 2.4);
  }

  private drawParticle(ctx: CanvasRenderingContext2D, p: Particle): void {
    const fade = Math.min(1, p.life / (p.maxLife * 0.55));
    ctx.globalAlpha = p.alpha * fade;
    switch (p.kind) {
      case 'ring': {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(1.2, 5 * fade);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TAU);
        ctx.stroke();
        break;
      }
      case 'smoke': {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TAU);
        ctx.fill();
        break;
      }
      case 'shard':
      case 'confetti': {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.color;
        const w = p.size;
        const h = p.size * (p.kind === 'confetti' ? 0.5 : 0.8);
        ctx.beginPath();
        ctx.roundRect(-w / 2, -h / 2, w, h, Math.min(3, h / 2));
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'splat': {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TAU);
        ctx.fill();
        break;
      }
      case 'text': {
        ctx.save();
        ctx.font = `800 ${p.size}px "Baloo 2", system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = p.size * 0.22;
        ctx.strokeStyle = 'rgba(30,20,64,0.85)';
        ctx.lineJoin = 'round';
        ctx.strokeText(p.text, p.x, p.y);
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, p.x, p.y);
        ctx.restore();
        break;
      }
      default: {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.5, p.size), 0, TAU);
        ctx.fill();
        break;
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Marcas que ficam no chão (respingos de tinta, poeira). */
  drawBehind(ctx: CanvasRenderingContext2D): void {
    for (const p of this.pool) {
      if (p.active && p.behind) this.drawParticle(ctx, p);
    }
  }

  drawFront(ctx: CanvasRenderingContext2D): void {
    for (const p of this.pool) {
      if (p.active && !p.behind) this.drawParticle(ctx, p);
    }
  }
}
