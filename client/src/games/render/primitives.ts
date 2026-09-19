import { ARENA, WORLD, paletteForSlot, type GenericItem } from '@shared/index';
import type { RenderView } from './types';

/**
 * Peças de cenário reaproveitadas pelos jogos da segunda leva.
 *
 * Os cinco jogos originais têm arte própria de ponta a ponta. Já os dez
 * seguintes compartilham a mesma arena retangular e um punhado de primitivas
 * (estrela, anel, zona, barra, feixe, sombra, bola, gol, bloco) — é isso que
 * permite um renderer novo caber em algumas dezenas de linhas sem parecer
 * genérico.
 */

const TAU = Math.PI * 2;

export function itemsOf(view: RenderView, kind?: number): GenericItem[] {
  const items = view.snapshot.ex?.items ?? [];
  return kind === undefined ? items : items.filter((entry) => entry.k === kind);
}

/** Arena retangular padrão: moldura grossa, piso claro e sombra de baixo. */
export function drawKitArena(view: RenderView, options: { grid?: boolean } = {}): void {
  const { ctx, theme } = view;

  const sky = ctx.createLinearGradient(0, 0, WORLD.w, WORLD.h);
  sky.addColorStop(0, theme.backdrop);
  sky.addColorStop(1, theme.backdropDeep);
  ctx.fillStyle = sky;
  ctx.fillRect(-200, -200, WORLD.w + 400, WORLD.h + 400);

  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#150B32';
  ctx.beginPath();
  ctx.roundRect(ARENA.x + 6, ARENA.y + 16, ARENA.w, ARENA.h, 44);
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  ctx.roundRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h, 44);
  ctx.fillStyle = theme.arenaEdge;
  ctx.fill();

  ctx.beginPath();
  ctx.roundRect(ARENA.x + 11, ARENA.y + 11, ARENA.w - 22, ARENA.h - 22, 36);
  const floor = ctx.createLinearGradient(ARENA.x, ARENA.y, ARENA.x + ARENA.w, ARENA.y + ARENA.h);
  floor.addColorStop(0, '#ffffff');
  floor.addColorStop(0.5, theme.arena);
  floor.addColorStop(1, theme.arena);
  ctx.fillStyle = floor;
  ctx.fill();

  if (options.grid) {
    ctx.save();
    ctx.clip();
    ctx.globalAlpha = 0.07;
    ctx.strokeStyle = theme.ink;
    ctx.lineWidth = 2;
    for (let x = ARENA.x + 64; x < ARENA.x + ARENA.w; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, ARENA.y);
      ctx.lineTo(x, ARENA.y + ARENA.h);
      ctx.stroke();
    }
    for (let y = ARENA.y + 64; y < ARENA.y + ARENA.h; y += 64) {
      ctx.beginPath();
      ctx.moveTo(ARENA.x, y);
      ctx.lineTo(ARENA.x + ARENA.w, y);
      ctx.stroke();
    }
    ctx.restore();
  }
}

export function drawStarPickup(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  t: number,
  gold: boolean,
  born = 1,
): void {
  const scale = 0.4 + born * 0.6;
  const spin = t * (gold ? 1.9 : 1.1) + x * 0.01;
  const bob = Math.sin(t * 3 + x * 0.02) * radius * 0.12;

  ctx.save();
  ctx.translate(x, y + bob);
  ctx.scale(scale, scale);
  ctx.rotate(spin);

  const glow = ctx.createRadialGradient(0, 0, radius * 0.2, 0, 0, radius * 2.4);
  glow.addColorStop(0, gold ? 'rgba(255,201,60,0.6)' : 'rgba(255,255,255,0.4)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 2.4, 0, TAU);
  ctx.fill();

  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const angle = (i / 10) * TAU - Math.PI / 2;
    const r = i % 2 === 0 ? radius : radius * 0.46;
    const px = Math.cos(angle) * r;
    const py = Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  const body = ctx.createLinearGradient(0, -radius, 0, radius);
  body.addColorStop(0, gold ? '#FFF3C4' : '#FFFFFF');
  body.addColorStop(1, gold ? '#F5AE10' : '#FFC93C');
  ctx.fillStyle = body;
  ctx.fill();
  ctx.lineWidth = Math.max(2, radius * 0.18);
  ctx.strokeStyle = gold ? '#6B3D00' : '#8A5A00';
  ctx.lineJoin = 'round';
  ctx.stroke();

  if (gold) {
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.22, 0, TAU);
    ctx.fillStyle = '#FF5CA3';
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

export function drawTargetRing(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  t: number,
  armed: number,
  color: string,
): void {
  const pulse = 1 + Math.sin(t * 6) * 0.06;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(t * 0.9);
  ctx.scale(pulse * (0.5 + armed * 0.5), pulse * (0.5 + armed * 0.5));

  const glow = ctx.createRadialGradient(0, 0, radius * 0.3, 0, 0, radius * 2);
  glow.addColorStop(0, 'rgba(255,255,255,0.45)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 2, 0, TAU);
  ctx.fill();

  ctx.lineWidth = radius * 0.3;
  ctx.strokeStyle = color;
  ctx.setLineDash([radius * 0.7, radius * 0.45]);
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.lineWidth = radius * 0.12;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.6, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

export function drawZone(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  t: number,
  options: { contested?: boolean; warn?: number; color?: string },
): void {
  const { contested = false, warn, color = '#6C41F5' } = options;
  const isWarn = warn !== undefined;

  ctx.save();
  if (isWarn) {
    // prévia da próxima zona
    ctx.globalAlpha = 0.25 + (warn ?? 0) * 0.4;
    ctx.setLineDash([16, 14]);
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, radius * (0.7 + (warn ?? 0) * 0.3), 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    return;
  }

  const fill = ctx.createRadialGradient(x, y, radius * 0.2, x, y, radius);
  fill.addColorStop(0, contested ? 'rgba(255,92,163,0.42)' : 'rgba(255,255,255,0.5)');
  fill.addColorStop(1, contested ? 'rgba(255,92,163,0.08)' : 'rgba(255,255,255,0.05)');
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fill();

  ctx.lineWidth = 8;
  ctx.strokeStyle = contested ? '#FF5CA3' : color;
  ctx.globalAlpha = 0.85;
  ctx.setLineDash([26, 18]);
  ctx.lineDashOffset = -t * 40;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

export function drawWallBar(
  ctx: CanvasRenderingContext2D,
  item: GenericItem,
  theme: { accent: string; ink: string },
  warning: boolean,
): void {
  const w = item.w ?? 0;
  const h = item.h ?? 0;
  ctx.save();
  ctx.translate(item.x, item.y);
  if (warning) {
    ctx.globalAlpha = 0.35 + (1 - (item.v ?? 0)) * 0.3;
    ctx.setLineDash([18, 12]);
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, Math.min(w, h) / 2);
    ctx.stroke();
    ctx.restore();
    return;
  }

  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2 + 5, w, h, Math.min(w, h) / 2);
  ctx.fillStyle = 'rgba(20,10,45,0.35)';
  ctx.fill();

  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, Math.min(w, h) / 2);
  const body = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  body.addColorStop(0, '#B79BFF');
  body.addColorStop(1, '#5A2FD8');
  ctx.fillStyle = body;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = theme.ink;
  ctx.stroke();

  // faixas de perigo
  ctx.save();
  ctx.clip();
  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 10;
  const span = Math.max(w, h) + 40;
  for (let i = -span; i < span; i += 34) {
    ctx.beginPath();
    ctx.moveTo(-w / 2 + i, -h / 2 - 10);
    ctx.lineTo(-w / 2 + i + 22, h / 2 + 10);
    ctx.stroke();
  }
  ctx.restore();
  ctx.restore();
}

export function drawBeam(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  angle: number,
  length: number,
  thickness: number,
  warn: number,
  t: number,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);

  if (warn > 0) {
    ctx.globalAlpha = 0.25 + Math.abs(Math.sin(t * 14)) * 0.35;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.roundRect(0, -thickness / 4, length, thickness / 2, thickness / 4);
    ctx.fill();
    ctx.restore();
    return;
  }

  const glow = ctx.createLinearGradient(0, -thickness, 0, thickness);
  glow.addColorStop(0, 'rgba(255,92,163,0)');
  glow.addColorStop(0.5, 'rgba(255,92,163,0.55)');
  glow.addColorStop(1, 'rgba(255,92,163,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, -thickness, length, thickness * 2);

  const core = ctx.createLinearGradient(0, -thickness / 2, 0, thickness / 2);
  core.addColorStop(0, '#FFFFFF');
  core.addColorStop(0.5, '#FF9BC6');
  core.addColorStop(1, '#FFFFFF');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.roundRect(0, -thickness / 2, length, thickness, thickness / 2);
  ctx.fill();

  // faíscas correndo pelo feixe
  ctx.globalAlpha = 0.8;
  ctx.fillStyle = '#FFFFFF';
  for (let i = 0; i < 5; i += 1) {
    const p = ((t * 320 + i * 120) % length) / length;
    ctx.beginPath();
    ctx.arc(p * length, 0, thickness * 0.32, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

export function drawMeteorShadow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  progress: number,
  tracking: boolean,
): void {
  ctx.save();
  // sombra no chão
  ctx.globalAlpha = 0.25 + progress * 0.45;
  ctx.fillStyle = tracking ? 'rgba(255,92,163,0.6)' : 'rgba(20,10,45,0.55)';
  ctx.beginPath();
  ctx.arc(x, y, radius * (0.55 + progress * 0.45), 0, TAU);
  ctx.fill();

  ctx.globalAlpha = 0.9;
  ctx.lineWidth = 6;
  ctx.strokeStyle = tracking ? '#FF5CA3' : '#FFC93C';
  ctx.setLineDash([14, 10]);
  ctx.lineDashOffset = -progress * 40;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);

  // a pedra chegando
  const fall = 1 - progress;
  const size = radius * 0.42;
  ctx.globalAlpha = 1;
  ctx.translate(x, y - fall * 420);
  ctx.rotate(progress * 5);
  ctx.beginPath();
  ctx.arc(0, 0, size, 0, TAU);
  const rock = ctx.createRadialGradient(-size * 0.3, -size * 0.3, size * 0.2, 0, 0, size);
  rock.addColorStop(0, '#FFB27A');
  rock.addColorStop(0.6, '#8C3A1E');
  rock.addColorStop(1, '#3C1508');
  ctx.fillStyle = rock;
  ctx.fill();
  ctx.lineWidth = size * 0.2;
  ctx.strokeStyle = '#2A0E05';
  ctx.stroke();
  ctx.restore();
}

export function drawBlastRing(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  fade: number,
): void {
  ctx.save();
  ctx.globalAlpha = fade * 0.8;
  const glow = ctx.createRadialGradient(x, y, radius * 0.2, x, y, radius);
  glow.addColorStop(0, 'rgba(255,255,255,0.9)');
  glow.addColorStop(0.5, 'rgba(255,201,60,0.6)');
  glow.addColorStop(1, 'rgba(255,90,60,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, radius * (1.4 - fade * 0.4), 0, TAU);
  ctx.fill();
  ctx.restore();
}

export function drawBall(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  t: number,
  speed: number,
): void {
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#150B32';
  ctx.beginPath();
  ctx.ellipse(x, y + radius * 0.8, radius * 0.9, radius * 0.3, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(t * (2 + speed * 8));
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, TAU);
  const body = ctx.createRadialGradient(-radius * 0.3, -radius * 0.35, radius * 0.2, 0, 0, radius);
  body.addColorStop(0, '#FFFFFF');
  body.addColorStop(1, '#D9E6F2');
  ctx.fillStyle = body;
  ctx.fill();
  ctx.lineWidth = radius * 0.16;
  ctx.strokeStyle = '#25304A';
  ctx.stroke();

  // gomos
  ctx.fillStyle = '#25304A';
  for (let i = 0; i < 3; i += 1) {
    const angle = (i / 3) * TAU;
    ctx.beginPath();
    ctx.arc(Math.cos(angle) * radius * 0.42, Math.sin(angle) * radius * 0.42, radius * 0.2, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

export function drawGoalMouth(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  slot: number,
  health: number,
  t: number,
): void {
  const palette = paletteForSlot(slot);
  ctx.save();
  ctx.translate(x, y);

  ctx.globalAlpha = 0.3 + health * 0.25;
  const glow = ctx.createRadialGradient(0, 0, radius * 0.2, 0, 0, radius * 1.3);
  glow.addColorStop(0, palette.base);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.3, 0, TAU);
  ctx.fill();

  ctx.globalAlpha = 1;
  ctx.lineWidth = 9;
  ctx.strokeStyle = palette.base;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, TAU);
  ctx.stroke();

  // arco de vida restante
  ctx.lineWidth = 9;
  ctx.strokeStyle = '#ffffff';
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.arc(0, 0, radius, -Math.PI / 2, -Math.PI / 2 + health * TAU);
  ctx.stroke();

  // rede
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = palette.shade;
  for (let i = -2; i <= 2; i += 1) {
    ctx.beginPath();
    ctx.moveTo(i * radius * 0.35, -radius * 0.86);
    ctx.lineTo(i * radius * 0.35, radius * 0.86);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.9;
  ctx.restore();
}

/** Corações de vida desenhados acima do personagem. */
export function drawLifePips(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  lives: number,
  max: number,
): void {
  if (max <= 1) return;
  const size = 7;
  const gap = 5;
  const total = max * size * 2 + (max - 1) * gap;
  ctx.save();
  for (let i = 0; i < max; i += 1) {
    const px = x - total / 2 + i * (size * 2 + gap) + size;
    ctx.beginPath();
    ctx.arc(px, y, size, 0, TAU);
    ctx.fillStyle = i < lives ? '#FF5CA3' : 'rgba(255,255,255,0.28)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(30,20,64,0.5)';
    ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Terceira leva: sombra, buraco, peso, ladrão, cadeiras
// ---------------------------------------------------------------------------

/** Aura de caçador do SOMBRA!: mancha escura com pontas que pulsam. */
export function drawShadowAura(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  t: number,
  intensity = 1,
): void {
  ctx.save();
  ctx.translate(x, y);

  const halo = ctx.createRadialGradient(0, 0, radius * 0.3, 0, 0, radius * 2.5);
  halo.addColorStop(0, `rgba(18,8,41,${0.5 * intensity})`);
  halo.addColorStop(0.55, `rgba(24,10,56,${0.28 * intensity})`);
  halo.addColorStop(1, 'rgba(24,10,56,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 2.5, 0, TAU);
  ctx.fill();

  // pontas irregulares girando: dá a sensação de fumaça, não de círculo
  ctx.globalAlpha = 0.45 * intensity;
  ctx.fillStyle = '#1B0B3A';
  ctx.beginPath();
  const spikes = 9;
  for (let i = 0; i <= spikes; i += 1) {
    const angle = (i / spikes) * TAU + t * 0.9;
    const wobble = 1 + Math.sin(t * 3.4 + i * 1.7) * 0.22;
    const r = radius * 1.5 * wobble;
    const px = Math.cos(angle) * r;
    const py = Math.sin(angle) * r * 0.82;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();

  ctx.globalAlpha = 0.9 * intensity;
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(143,102,255,0.75)';
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.32, t * 2, t * 2 + Math.PI * 1.25);
  ctx.stroke();
  ctx.restore();
}

/** Marca de fugitivo: anel claro fininho, só para ler quem ainda está livre. */
export function drawFreeMark(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  t: number,
): void {
  ctx.save();
  ctx.globalAlpha = 0.4 + Math.sin(t * 3.2 + x * 0.02) * 0.12;
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#FFE38C';
  ctx.setLineDash([9, 11]);
  ctx.lineDashOffset = -t * 26;
  ctx.beginPath();
  ctx.arc(x, y, radius * 1.22, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

/** Buraco do BURACO!: poço escuro, disco de acreção e braços em espiral. */
export function drawVortex(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  t: number,
  power: number,
): void {
  const spin = t * (1.1 + power * 2.6);

  ctx.save();
  ctx.translate(x, y);

  // névoa de sucção bem larga
  const pull = ctx.createRadialGradient(0, 0, radius, 0, 0, radius * 5.2);
  pull.addColorStop(0, `rgba(30,12,66,${0.5 + power * 0.25})`);
  pull.addColorStop(0.45, `rgba(30,12,66,${0.16 + power * 0.14})`);
  pull.addColorStop(1, 'rgba(30,12,66,0)');
  ctx.fillStyle = pull;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 5.2, 0, TAU);
  ctx.fill();

  // braços em espiral
  ctx.save();
  ctx.rotate(spin);
  ctx.globalAlpha = 0.5 + power * 0.25;
  ctx.lineCap = 'round';
  for (let arm = 0; arm < 4; arm += 1) {
    ctx.beginPath();
    for (let step = 0; step <= 26; step += 1) {
      const p = step / 26;
      const angle = (arm / 4) * TAU + p * 2.4;
      const r = radius * (0.9 + p * 3.1);
      const px = Math.cos(angle) * r;
      const py = Math.sin(angle) * r * 0.9;
      if (step === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgba(143,102,255,0.4)';
    ctx.stroke();
  }
  ctx.restore();

  // disco de acreção
  ctx.save();
  ctx.rotate(-spin * 0.7);
  ctx.globalAlpha = 0.95;
  ctx.lineWidth = radius * 0.3;
  ctx.strokeStyle = '#3FC6FF';
  ctx.setLineDash([radius * 0.55, radius * 0.4]);
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.22, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // poço
  const well = ctx.createRadialGradient(0, 0, 2, 0, 0, radius);
  well.addColorStop(0, '#000000');
  well.addColorStop(0.62, '#0B0420');
  well.addColorStop(1, 'rgba(11,4,32,0.55)');
  ctx.fillStyle = well;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, TAU);
  ctx.fill();

  // borda de luz
  ctx.globalAlpha = 0.7 + Math.sin(t * 8) * 0.2;
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#8F66FF';
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.98, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

/** Haltere do PESO!: barra com dois discos e sombra no chão. */
export function drawDumbbell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  t: number,
): void {
  const bob = Math.sin(t * 2.4 + x * 0.03) * radius * 0.1;
  const plate = radius * 0.62;

  ctx.save();
  ctx.globalAlpha = 0.24;
  ctx.fillStyle = '#150B32';
  ctx.beginPath();
  ctx.ellipse(x, y + radius * 0.72, radius * 0.95, radius * 0.3, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(x, y + bob);
  ctx.rotate(-0.22);

  // barra
  ctx.beginPath();
  ctx.roundRect(-radius * 0.72, -radius * 0.17, radius * 1.44, radius * 0.34, radius * 0.17);
  const bar = ctx.createLinearGradient(0, -radius * 0.2, 0, radius * 0.2);
  bar.addColorStop(0, '#F3F6FF');
  bar.addColorStop(1, '#9AA7C4');
  ctx.fillStyle = bar;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#3A2A12';
  ctx.stroke();

  // discos
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.roundRect(side * radius * 0.72 - plate / 2, -plate, plate, plate * 2, plate * 0.34);
    const body = ctx.createLinearGradient(0, -plate, 0, plate);
    body.addColorStop(0, '#FFD873');
    body.addColorStop(1, '#C97A12');
    ctx.fillStyle = body;
    ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = '#6B3D00';
    ctx.stroke();

    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.roundRect(side * radius * 0.72 - plate * 0.28, -plate * 0.72, plate * 0.3, plate * 0.7, 4);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

/** Carga do PESO! em volta do personagem: um gomo aceso por haltere. */
export function drawLoadRing(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  load: number,
  max = 5,
): void {
  if (load <= 0) return;
  const gap = 0.16;
  const span = TAU / max - gap;
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 0; i < max; i += 1) {
    const start = -Math.PI / 2 + i * (span + gap);
    ctx.beginPath();
    ctx.arc(x, y, radius, start, start + span);
    ctx.lineWidth = i < load ? 7 : 3;
    ctx.strokeStyle = i < load ? '#FFC93C' : 'rgba(255,255,255,0.22)';
    ctx.stroke();
  }
  // quem está carregado fica com um "peso" visível embaixo
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = '#6B3D00';
  ctx.beginPath();
  ctx.ellipse(x, y + radius * 0.92, radius * (0.5 + load * 0.12), radius * 0.22, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** Moeda do LADRÃO! girando. */
export function drawCoin(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  t: number,
): void {
  const phase = t * 2.6 + x * 0.05;
  const squeeze = Math.abs(Math.cos(phase));
  const bob = Math.sin(t * 3 + x * 0.04) * radius * 0.18;

  ctx.save();
  ctx.globalAlpha = 0.2;
  ctx.fillStyle = '#0A5741';
  ctx.beginPath();
  ctx.ellipse(x, y + radius * 0.85, radius * 0.7, radius * 0.24, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(x, y + bob);

  const glow = ctx.createRadialGradient(0, 0, radius * 0.3, 0, 0, radius * 2.2);
  glow.addColorStop(0, 'rgba(255,201,60,0.45)');
  glow.addColorStop(1, 'rgba(255,201,60,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 2.2, 0, TAU);
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(0, 0, Math.max(radius * 0.18, radius * squeeze), radius, 0, 0, TAU);
  const body = ctx.createLinearGradient(-radius, -radius, radius, radius);
  body.addColorStop(0, '#FFF0B8');
  body.addColorStop(0.5, '#FFC93C');
  body.addColorStop(1, '#D98A0B');
  ctx.fillStyle = body;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#6B3D00';
  ctx.stroke();

  if (squeeze > 0.45) {
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#B06C00';
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * squeeze * 0.55, radius * 0.58, 0, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

/** Cofre do LADRÃO!: porta redonda, volante e anel de tempo até mudar de lugar. */
export function drawVault(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  t: number,
  settle: number,
): void {
  ctx.save();
  ctx.translate(x, y);

  const halo = ctx.createRadialGradient(0, 0, radius * 0.2, 0, 0, radius * 1.5);
  halo.addColorStop(0, 'rgba(43,217,168,0.5)');
  halo.addColorStop(1, 'rgba(43,217,168,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.5, 0, TAU);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, TAU);
  const door = ctx.createLinearGradient(0, -radius, 0, radius);
  door.addColorStop(0, '#E6FFF6');
  door.addColorStop(1, '#2BD9A8');
  ctx.fillStyle = door;
  ctx.fill();
  ctx.lineWidth = 7;
  ctx.strokeStyle = '#0A5741';
  ctx.stroke();

  // volante girando devagar
  ctx.save();
  ctx.rotate(t * 0.8);
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#0A5741';
  for (let i = 0; i < 3; i += 1) {
    const angle = (i / 3) * Math.PI;
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * radius * 0.42, Math.sin(angle) * radius * 0.42);
    ctx.lineTo(-Math.cos(angle) * radius * 0.42, -Math.sin(angle) * radius * 0.42);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.16, 0, TAU);
  ctx.fillStyle = '#0A5741';
  ctx.fill();
  ctx.restore();

  // anel de tempo até o cofre se mudar
  ctx.lineWidth = 6;
  ctx.strokeStyle = settle < 0.25 ? '#FF5CA3' : '#FFFFFF';
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.16, -Math.PI / 2, -Math.PI / 2 + Math.max(0.02, settle) * TAU);
  ctx.stroke();

  ctx.globalAlpha = 0.85;
  ctx.font = '800 15px "Baloo 2", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#0A5741';
  ctx.fillText('COFRE', 0, radius * 0.64);
  ctx.restore();
}

/** Moedas na mão, empilhadas acima da cabeça. */
export function drawCarryStack(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  count: number,
  t: number,
): void {
  if (count <= 0) return;
  const shown = Math.min(count, 5);
  ctx.save();
  for (let i = 0; i < shown; i += 1) {
    const py = y - i * 7 + Math.sin(t * 5 + i) * 1.2;
    ctx.beginPath();
    ctx.ellipse(x, py, 11, 5, 0, 0, TAU);
    ctx.fillStyle = i === shown - 1 ? '#FFF0B8' : '#FFC93C';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#6B3D00';
    ctx.stroke();
  }
  if (count > 5) {
    ctx.font = '800 15px "Baloo 2", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(30,20,64,0.8)';
    ctx.strokeText(`${count}`, x + 22, y - shown * 3.5);
    ctx.fillStyle = '#FFF0B8';
    ctx.fillText(`${count}`, x + 22, y - shown * 3.5);
  }
  ctx.restore();
}

/** Cadeira do CADEIRAS!: assento, encosto e pernas. `spinning` inclina. */
export function drawChair(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  t: number,
  options: { spinning: boolean; taken: boolean },
): void {
  const tilt = options.spinning ? Math.sin(t * 3.2 + x * 0.02) * 0.1 : 0;
  const seat = radius * 0.78;

  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#7A0E42';
  ctx.beginPath();
  ctx.ellipse(x, y + seat * 0.62, seat * 1.05, seat * 0.34, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  // alvo no chão: mostra exatamente o que conta como "em cima da cadeira"
  ctx.save();
  ctx.globalAlpha = options.spinning ? 0.3 : 0.6;
  ctx.setLineDash([12, 10]);
  ctx.lineDashOffset = options.spinning ? -t * 30 : 0;
  ctx.lineWidth = 4;
  ctx.strokeStyle = options.taken ? '#2BD9A8' : '#FFFFFF';
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);

  // pernas
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#7A0E42';
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * seat * 0.55, -seat * 0.05);
    ctx.lineTo(side * seat * 0.7, seat * 0.6);
    ctx.stroke();
  }

  // encosto
  ctx.beginPath();
  ctx.roundRect(-seat * 0.52, -seat * 1.35, seat * 1.04, seat * 0.5, 10);
  ctx.fillStyle = '#FF9BC6';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#7A0E42';
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(-seat * 0.1, -seat * 1.05, seat * 0.2, seat * 0.72, 6);
  ctx.fillStyle = '#FF9BC6';
  ctx.fill();
  ctx.stroke();

  // assento
  ctx.beginPath();
  ctx.roundRect(-seat * 0.62, -seat * 0.42, seat * 1.24, seat * 0.44, 12);
  const pad = ctx.createLinearGradient(0, -seat * 0.42, 0, seat * 0.02);
  pad.addColorStop(0, '#FFE1EE');
  pad.addColorStop(1, '#FF5CA3');
  ctx.fillStyle = pad;
  ctx.fill();
  ctx.lineWidth = 4.5;
  ctx.strokeStyle = '#7A0E42';
  ctx.stroke();
  ctx.restore();
}

/** Notas musicais subindo, para dizer sem texto que a música está tocando. */
export function drawMusicNotes(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  spread: number,
  t: number,
): void {
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = '#FFFFFF';
  for (let i = 0; i < 6; i += 1) {
    const life = ((t * 0.45 + i / 6) % 1);
    const angle = i * 2.4 + t * 0.4;
    const x = cx + Math.cos(angle) * spread;
    const y = cy + Math.sin(angle) * spread * 0.5 - life * 120;
    const size = 9 * (1 - life * 0.4);
    ctx.globalAlpha = 0.5 * (1 - life);
    ctx.beginPath();
    ctx.ellipse(x, y, size, size * 0.8, -0.4, 0, TAU);
    ctx.fill();
    ctx.fillRect(x + size * 0.75, y - size * 2.4, size * 0.34, size * 2.4);
  }
  ctx.restore();
}

/** Barra de tempo colada no topo da arena (música, rodada, etc). */
export function drawTimerBar(
  ctx: CanvasRenderingContext2D,
  ratio: number,
  color: string,
  label?: string,
): void {
  const w = ARENA.w * 0.52;
  const x = ARENA.x + (ARENA.w - w) / 2;
  const y = ARENA.y + 26;

  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.roundRect(x, y, w, 14, 7);
  ctx.fillStyle = 'rgba(20,10,45,0.35)';
  ctx.fill();

  ctx.beginPath();
  ctx.roundRect(x, y, Math.max(4, w * Math.max(0, Math.min(1, ratio))), 14, 7);
  ctx.fillStyle = color;
  ctx.fill();

  if (label) {
    ctx.font = '800 16px "Baloo 2", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(30,20,64,0.75)';
    ctx.strokeText(label, x + w / 2, y + 30);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(label, x + w / 2, y + 30);
  }
  ctx.restore();
}

/** Corações de vida em cima de todo mundo (jogos com mais de uma vida). */
export function drawLifeOverlay(view: RenderView, max: number): void {
  for (const fighter of view.fighters) {
    if (!fighter.alive) continue;
    drawLifePips(view.ctx, fighter.x, fighter.y - 52, fighter.lives, Math.max(max, fighter.lives));
  }
}

/** Pisca o personagem durante a invulnerabilidade pós-dano. */
export function drawInvulnOverlay(view: RenderView): void {
  const { ctx, t } = view;
  for (const fighter of view.fighters) {
    if (!fighter.alive || !fighter.invuln) continue;
    ctx.save();
    ctx.globalAlpha = 0.25 + Math.abs(Math.sin(t * 16)) * 0.3;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(fighter.x, fighter.y, 38, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
}
