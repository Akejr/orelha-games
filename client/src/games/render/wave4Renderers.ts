import { ARENA, ARENA_CENTER, WORLD, clamp01, paletteForSlot } from '@shared/index';
import { drawBigText, drawFighters, drawVignette } from './common';
import {
  drawInvulnOverlay,
  drawKitArena,
  drawLifeOverlay,
  drawTimerBar,
  itemsOf,
} from './primitives';
import type { GameRenderer, RenderView } from './types';

/**
 * Renderers da quarta leva: ONDA!, SEMÁFORO!, CARIMBO!, TREM!, GANGORRA!.
 *
 * Os cinco têm cenário muito próprio (água, sinal de trânsito, carimbos, trilho,
 * prancha), então as peças de desenho vivem aqui mesmo em vez de virar primitiva
 * compartilhada — só o que é reaproveitado de verdade está em `primitives.ts`.
 */

const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// ONDA!
// ---------------------------------------------------------------------------

function drawRock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  t: number,
  alert: number,
): void {
  ctx.save();

  // sombra molhada em volta
  ctx.globalAlpha = 0.2;
  ctx.fillStyle = '#0B2B5E';
  ctx.beginPath();
  ctx.ellipse(x, y + radius * 0.3, radius * 1.02, radius * 0.64, 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;

  // corpo da pedra: polígono irregular estável (a semente é a posição)
  const seed = Math.floor(x * 0.31 + y * 0.17);
  ctx.beginPath();
  const points = 9;
  for (let i = 0; i <= points; i += 1) {
    const angle = (i / points) * TAU;
    const wobble = 0.86 + ((Math.sin(seed + i * 2.7) + 1) / 2) * 0.22;
    const px = x + Math.cos(angle) * radius * wobble;
    const py = y + Math.sin(angle) * radius * wobble * 0.82;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  const body = ctx.createLinearGradient(x, y - radius, x, y + radius);
  body.addColorStop(0, '#C8D7E8');
  body.addColorStop(0.55, '#8FA4BC');
  body.addColorStop(1, '#5B708B');
  ctx.fillStyle = body;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#33465F';
  ctx.stroke();

  // topo seco
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  ctx.ellipse(x - radius * 0.12, y - radius * 0.22, radius * 0.58, radius * 0.3, -0.2, 0, TAU);
  ctx.fillStyle = '#EAF6FF';
  ctx.fill();
  ctx.restore();

  // aviso de onda: quem está em cima está seguro
  if (alert > 0) {
    ctx.save();
    ctx.globalAlpha = 0.5 + Math.sin(t * 7) * 0.2;
    ctx.setLineDash([14, 12]);
    ctx.lineDashOffset = -t * 40;
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#FFE38C';
    ctx.beginPath();
    ctx.ellipse(x, y, radius + 6, radius * 0.86 + 6, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
}

/** Faixa de água atravessando a arena, com espuma na frente. */
function drawWaveBand(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  dir: number,
  t: number,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(ARENA.x + 11, ARENA.y + 11, ARENA.w - 22, ARENA.h - 22, 36);
  ctx.clip();

  const horizontal = dir === 0 || dir === 1;
  const left = x - w / 2;
  const top = y - h / 2;

  const water = horizontal
    ? ctx.createLinearGradient(left, 0, left + w, 0)
    : ctx.createLinearGradient(0, top, 0, top + h);
  const forward = dir === 0 || dir === 2;
  water.addColorStop(0, forward ? 'rgba(63,198,255,0.15)' : 'rgba(255,255,255,0.9)');
  water.addColorStop(forward ? 0.72 : 0.28, 'rgba(63,198,255,0.75)');
  water.addColorStop(1, forward ? 'rgba(255,255,255,0.9)' : 'rgba(63,198,255,0.15)');
  ctx.fillStyle = water;
  ctx.fillRect(left, top, w, h);

  // espuma: bolhas correndo na crista
  ctx.globalAlpha = 0.75;
  ctx.fillStyle = '#FFFFFF';
  for (let i = 0; i < 16; i += 1) {
    const along = ((i * 97 + t * 260) % (horizontal ? h : w)) - 20;
    const crest = forward ? (horizontal ? left + w - 14 : top + h - 14) : horizontal ? left + 14 : top + 14;
    const px = horizontal ? crest + Math.sin(t * 6 + i) * 10 : ARENA.x + along;
    const py = horizontal ? ARENA.y + along : crest + Math.sin(t * 6 + i) * 10;
    ctx.beginPath();
    ctx.arc(px, py, 6 + (i % 3) * 3, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/** Seta grande na borda mostrando de onde a onda vem. */
function drawWaveWarning(
  ctx: CanvasRenderingContext2D,
  dir: number,
  progress: number,
  t: number,
): void {
  const angle = dir === 0 ? 0 : dir === 1 ? Math.PI : dir === 2 ? Math.PI / 2 : -Math.PI / 2;
  const edge =
    dir === 0
      ? { x: ARENA.x + 54, y: ARENA_CENTER.y }
      : dir === 1
        ? { x: ARENA.x + ARENA.w - 54, y: ARENA_CENTER.y }
        : dir === 2
          ? { x: ARENA_CENTER.x, y: ARENA.y + 54 }
          : { x: ARENA_CENTER.x, y: ARENA.y + ARENA.h - 54 };

  ctx.save();
  ctx.translate(edge.x, edge.y);
  ctx.rotate(angle);
  const pulse = 0.55 + Math.sin(t * 12) * 0.3;
  ctx.globalAlpha = 0.35 + progress * 0.55;

  for (let i = 0; i < 3; i += 1) {
    const offset = i * 34 - 20 + ((t * 120) % 34);
    ctx.globalAlpha = (0.25 + progress * 0.6) * (1 - i * 0.22) * pulse;
    ctx.fillStyle = '#3FC6FF';
    ctx.beginPath();
    ctx.moveTo(offset + 30, 0);
    ctx.lineTo(offset - 6, -30);
    ctx.lineTo(offset - 6, 30);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

export function createOndaRenderer(): GameRenderer {
  return (view) => {
    const { ctx, t } = view;
    const wave = itemsOf(view, 1)[0];
    const warn = itemsOf(view, 2)[0];

    drawKitArena(view);

    for (const rock of itemsOf(view, 0)) {
      drawRock(ctx, rock.x, rock.y, rock.r, t, wave || warn ? 1 : 0);
    }

    view.fx.drawBehind(ctx);
    drawFighters(view, {
      radius: 26,
      dangerFor: () => (wave ? 1 : 0),
    });

    if (wave) {
      drawWaveBand(ctx, wave.x, wave.y, wave.w ?? 120, wave.h ?? 120, wave.a ?? 0, t);
    }
    if (warn) {
      drawWaveWarning(ctx, warn.a ?? 0, warn.v ?? 0, t);
    }

    drawLifeOverlay(view, 3);
    drawInvulnOverlay(view);
    drawVignette(view, 0.26);
  };
}

// ---------------------------------------------------------------------------
// SEMÁFORO!
// ---------------------------------------------------------------------------

const LIGHT_COLORS = ['#2BD9A8', '#FFC93C', '#FF4D5E'];

function drawTrafficLight(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  light: number,
  t: number,
): void {
  const w = 74;
  const h = 176;
  ctx.save();
  ctx.translate(x, y);

  ctx.globalAlpha = 0.28;
  ctx.fillStyle = '#08432F';
  ctx.beginPath();
  ctx.roundRect(-w / 2 + 6, -h / 2 + 10, w, h, 22);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, 22);
  const box = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  box.addColorStop(0, '#3B4A63');
  box.addColorStop(1, '#1B2536');
  ctx.fillStyle = box;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#0E1522';
  ctx.stroke();

  for (let i = 0; i < 3; i += 1) {
    const cy = -h / 2 + 34 + i * 54;
    const on = i === light;
    if (on) {
      const glow = ctx.createRadialGradient(0, cy, 4, 0, cy, 44);
      glow.addColorStop(0, LIGHT_COLORS[i]);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.65 + Math.sin(t * 8) * 0.15;
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, cy, 44, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.beginPath();
    ctx.arc(0, cy, 20, 0, TAU);
    ctx.fillStyle = on ? LIGHT_COLORS[i] : 'rgba(255,255,255,0.12)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.stroke();
  }
  ctx.restore();
}

export function createSemaforoRenderer(): GameRenderer {
  return (view) => {
    const { ctx, t } = view;
    const numbers = view.snapshot.ex?.n ?? [];
    const light = Math.round(numbers[0] ?? 0);
    const timer = numbers[1] ?? 0;

    drawKitArena(view);

    // faixas verticais de corrida
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(ARENA.x + 11, ARENA.y + 11, ARENA.w - 22, ARENA.h - 22, 36);
    ctx.clip();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = view.theme.ink;
    const lanes = 6;
    for (let i = 0; i < lanes; i += 1) {
      if (i % 2 === 1) continue;
      const w = ARENA.w / lanes;
      ctx.fillRect(ARENA.x + i * w, ARENA.y, w, ARENA.h);
    }
    ctx.restore();

    // linha de largada
    const start = itemsOf(view, 1)[0];
    if (start) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.setLineDash([22, 16]);
      ctx.lineWidth = start.h ?? 10;
      ctx.strokeStyle = view.theme.ink;
      ctx.beginPath();
      ctx.moveTo(start.x - (start.w ?? 0) / 2, start.y);
      ctx.lineTo(start.x + (start.w ?? 0) / 2, start.y);
      ctx.stroke();
      ctx.restore();
    }

    // linha de chegada quadriculada
    const finish = itemsOf(view, 0)[0];
    if (finish) {
      const w = finish.w ?? 0;
      const h = finish.h ?? 16;
      const cells = 22;
      ctx.save();
      for (let i = 0; i < cells; i += 1) {
        for (let row = 0; row < 2; row += 1) {
          ctx.fillStyle = (i + row) % 2 === 0 ? '#FFFFFF' : '#1B2536';
          ctx.fillRect(
            finish.x - w / 2 + (i * w) / cells,
            finish.y - h / 2 + row * (h / 2),
            w / cells,
            h / 2,
          );
        }
      }
      ctx.globalAlpha = 0.5 + Math.sin(t * 4) * 0.2;
      ctx.lineWidth = 3;
      ctx.strokeStyle = view.theme.accent;
      ctx.beginPath();
      ctx.moveTo(finish.x - w / 2, finish.y - h / 2 - 5);
      ctx.lineTo(finish.x + w / 2, finish.y - h / 2 - 5);
      ctx.stroke();
      ctx.restore();
    }

    view.fx.drawBehind(ctx);
    drawFighters(view, {
      radius: 26,
      dangerFor: () => (light === 2 ? 1 : 0),
    });

    drawTrafficLight(ctx, ARENA.x + ARENA.w - 92, ARENA.y + 118, light, t);

    // moldura da arena na cor do sinal: lê de canto de olho
    ctx.save();
    ctx.globalAlpha = light === 2 ? 0.6 + Math.sin(t * 9) * 0.2 : 0.45;
    ctx.lineWidth = 12;
    ctx.strokeStyle = LIGHT_COLORS[light] ?? '#FFFFFF';
    ctx.beginPath();
    ctx.roundRect(ARENA.x + 6, ARENA.y + 6, ARENA.w - 12, ARENA.h - 12, 40);
    ctx.stroke();
    ctx.restore();

    if (light === 2) {
      drawBigText(view, timer.toFixed(1), WORLD.h - 30, { size: 40, color: '#FF4D5E' });
    }

    drawVignette(view, 0.22);
  };
}

// ---------------------------------------------------------------------------
// CARIMBO!
// ---------------------------------------------------------------------------

const SYMBOL_COLORS = ['#FF4D5E', '#3FC6FF', '#FFC93C', '#2BD9A8', '#FF5CA3', '#8F66FF'];

/** Os seis símbolos dos carimbos, desenhados em volta de (0,0). */
function drawSymbol(
  ctx: CanvasRenderingContext2D,
  kind: number,
  size: number,
  color: string,
): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(3, size * 0.16);
  ctx.strokeStyle = 'rgba(30,20,64,0.55)';
  ctx.lineJoin = 'round';
  ctx.beginPath();

  if (kind === 0) {
    // triângulo
    ctx.moveTo(0, -size);
    ctx.lineTo(size * 0.92, size * 0.7);
    ctx.lineTo(-size * 0.92, size * 0.7);
    ctx.closePath();
  } else if (kind === 1) {
    // círculo
    ctx.arc(0, 0, size * 0.9, 0, TAU);
  } else if (kind === 2) {
    // quadrado
    ctx.roundRect(-size * 0.82, -size * 0.82, size * 1.64, size * 1.64, size * 0.22);
  } else if (kind === 3) {
    // estrela
    for (let i = 0; i < 10; i += 1) {
      const angle = (i / 10) * TAU - Math.PI / 2;
      const r = i % 2 === 0 ? size : size * 0.46;
      const px = Math.cos(angle) * r;
      const py = Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  } else if (kind === 4) {
    // coração
    ctx.moveTo(0, size * 0.85);
    ctx.bezierCurveTo(-size * 1.4, -size * 0.2, -size * 0.5, -size * 1.1, 0, -size * 0.35);
    ctx.bezierCurveTo(size * 0.5, -size * 1.1, size * 1.4, -size * 0.2, 0, size * 0.85);
  } else {
    // raio
    ctx.moveTo(-size * 0.3, -size);
    ctx.lineTo(size * 0.62, -size * 0.12);
    ctx.lineTo(size * 0.1, -size * 0.06);
    ctx.lineTo(size * 0.42, size);
    ctx.lineTo(-size * 0.6, size * 0.05);
    ctx.lineTo(-size * 0.06, -size * 0.02);
    ctx.closePath();
  }

  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export function createCarimboRenderer(): GameRenderer {
  return (view) => {
    const { ctx, t } = view;
    const numbers = view.snapshot.ex?.n ?? [];
    const sequence = numbers.slice(0, 3);

    // progresso do jogador local: n[3 + índice no snapshot]
    let myStep = 0;
    view.snapshot.ps.forEach((fighter, index) => {
      if (fighter.i === view.selfId) myStep = numbers[3 + index] ?? 0;
    });
    const wanted = sequence[myStep];

    drawKitArena(view, { grid: true });

    for (const pad of itemsOf(view)) {
      const color = SYMBOL_COLORS[pad.k % SYMBOL_COLORS.length];
      const position = pad.o ?? -1;
      const isNext = pad.k === wanted;

      ctx.save();
      ctx.translate(pad.x, pad.y);

      // base do carimbo
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = '#7A3B00';
      ctx.beginPath();
      ctx.ellipse(0, pad.r * 0.28, pad.r * 0.95, pad.r * 0.34, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.beginPath();
      ctx.arc(0, 0, pad.r, 0, TAU);
      const base = ctx.createRadialGradient(0, -pad.r * 0.3, pad.r * 0.2, 0, 0, pad.r);
      base.addColorStop(0, '#FFFFFF');
      base.addColorStop(1, position >= 0 ? '#FFF1D6' : '#E9E2F2');
      ctx.fillStyle = base;
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = position >= 0 ? color : 'rgba(30,20,64,0.25)';
      ctx.stroke();

      // faz parte da sequência: mostra a ordem
      if (position >= 0) {
        ctx.globalAlpha = 0.9;
        ctx.font = '800 19px "Baloo 2", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = color;
        ctx.fillText(`${position + 1}`, 0, -pad.r + 14);
        ctx.globalAlpha = 1;
      }

      drawSymbol(ctx, pad.k, pad.r * 0.46, color);

      // o próximo da MINHA sequência pulsa
      if (isNext) {
        ctx.globalAlpha = 0.55 + Math.sin(t * 7) * 0.3;
        ctx.lineWidth = 8;
        ctx.strokeStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(0, 0, pad.r + 9, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    }

    view.fx.drawBehind(ctx);
    drawFighters(view, { radius: 26 });

    // a ordem chamada, no topo, com o meu progresso marcado
    const chipGap = 86;
    const baseX = ARENA_CENTER.x - ((sequence.length - 1) * chipGap) / 2;
    sequence.forEach((symbol, index) => {
      const x = baseX + index * chipGap;
      const y = ARENA.y + 44;
      const done = index < myStep;
      ctx.save();
      ctx.globalAlpha = done ? 0.4 : 1;
      ctx.beginPath();
      ctx.roundRect(x - 30, y - 30, 60, 60, 18);
      ctx.fillStyle = 'rgba(20,10,45,0.55)';
      ctx.fill();
      ctx.lineWidth = index === myStep ? 5 : 2.5;
      ctx.strokeStyle = index === myStep ? '#FFFFFF' : 'rgba(255,255,255,0.4)';
      ctx.stroke();
      ctx.translate(x, y);
      drawSymbol(ctx, symbol, 17, SYMBOL_COLORS[symbol % SYMBOL_COLORS.length]);
      if (done) {
        ctx.globalAlpha = 0.95;
        ctx.lineWidth = 6;
        ctx.strokeStyle = '#2BD9A8';
        ctx.beginPath();
        ctx.moveTo(-13, 0);
        ctx.lineTo(-3, 11);
        ctx.lineTo(15, -12);
        ctx.stroke();
      }
      ctx.restore();
    });

    drawVignette(view, 0.22);
  };
}

// ---------------------------------------------------------------------------
// TREM!
// ---------------------------------------------------------------------------

function drawWagon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  angle: number,
  slot: number,
  filled: boolean,
  locomotive: boolean,
  t: number,
): void {
  const palette = paletteForSlot(slot);
  const w = radius * 1.9;
  const h = radius * 1.4;

  ctx.save();
  ctx.translate(x, y);

  // marca no chão: é aqui que você precisa estar
  ctx.globalAlpha = filled ? 0.55 : 0.3 + Math.sin(t * 5 + slot) * 0.1;
  ctx.setLineDash([12, 10]);
  ctx.lineDashOffset = -t * 26;
  ctx.lineWidth = 4;
  ctx.strokeStyle = filled ? '#2BD9A8' : palette.base;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  ctx.rotate(angle);

  ctx.globalAlpha = 0.24;
  ctx.fillStyle = '#160A3D';
  ctx.beginPath();
  ctx.roundRect(-w / 2 + 4, -h / 2 + 10, w, h, 12);
  ctx.fill();
  ctx.globalAlpha = 1;

  // caixa do vagão
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, 12);
  const body = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  body.addColorStop(0, palette.light);
  body.addColorStop(1, palette.base);
  ctx.fillStyle = body;
  ctx.fill();
  ctx.lineWidth = 4.5;
  ctx.strokeStyle = palette.shade;
  ctx.stroke();

  // rodas
  ctx.fillStyle = '#25304A';
  for (const side of [-0.28, 0.28]) {
    ctx.beginPath();
    ctx.arc(w * side, h / 2, radius * 0.2, 0, TAU);
    ctx.fill();
  }

  if (locomotive) {
    // chaminé + fumaça: mostra onde começa o trem
    ctx.beginPath();
    ctx.roundRect(-w * 0.34, -h * 0.98, radius * 0.38, radius * 0.46, 4);
    ctx.fillStyle = '#25304A';
    ctx.fill();
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#FFFFFF';
    for (let i = 0; i < 3; i += 1) {
      const life = ((t * 0.9 + i / 3) % 1);
      ctx.globalAlpha = 0.35 * (1 - life);
      ctx.beginPath();
      ctx.arc(-w * 0.28, -h * 1.1 - life * 34, 7 + life * 9, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

export function createTremRenderer(): GameRenderer {
  return (view) => {
    const { ctx, t } = view;
    const numbers = view.snapshot.ex?.n ?? [];
    const timer = numbers[0] ?? 0;
    const whistle = (numbers[2] ?? 0) > 0.5;
    const wagons = itemsOf(view, 0);
    const rail = itemsOf(view, 1)[0];

    drawKitArena(view);

    // trilho com dormentes
    if (rail) {
      const angle = rail.a ?? 0;
      const w = rail.w ?? 0;
      ctx.save();
      ctx.translate(rail.x, rail.y);
      ctx.rotate(angle);
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = 'rgba(30,20,64,0.35)';
      for (let i = -w / 2; i <= w / 2; i += 34) {
        ctx.beginPath();
        ctx.roundRect(i - 5, -34, 10, 68, 4);
        ctx.fill();
      }
      ctx.lineWidth = 7;
      ctx.strokeStyle = '#C8D2E8';
      for (const offset of [-22, 22]) {
        ctx.beginPath();
        ctx.moveTo(-w / 2, offset);
        ctx.lineTo(w / 2, offset);
        ctx.stroke();
      }
      ctx.restore();
    }

    // o meu vagão ganha um aviso por cima
    const selfSlot = view.selfId ? view.meta.get(view.selfId)?.slot ?? -1 : -1;

    wagons.forEach((wagon, index) => {
      drawWagon(
        ctx,
        wagon.x,
        wagon.y,
        wagon.r,
        wagon.a ?? 0,
        wagon.o ?? 0,
        (wagon.v ?? 0) > 0.5,
        index === 0,
        t,
      );
      if ((wagon.o ?? -1) === selfSlot) {
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.translate(wagon.x, wagon.y - wagon.r - 30 + Math.sin(t * 6) * 5);
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.moveTo(0, 16);
        ctx.lineTo(-13, -8);
        ctx.lineTo(13, -8);
        ctx.closePath();
        ctx.fill();
        ctx.font = '800 15px "Baloo 2", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(30,20,64,0.8)';
        ctx.strokeText('SEU VAGÃO', 0, -16);
        ctx.fillText('SEU VAGÃO', 0, -16);
        ctx.restore();
      }
    });

    view.fx.drawBehind(ctx);
    drawFighters(view, { radius: 26 });

    drawTimerBar(
      ctx,
      whistle ? 1 : clamp01(timer / 4.6),
      whistle ? '#2BD9A8' : timer < 1.2 ? '#FF4D5E' : '#FFFFFF',
      whistle ? 'APITO!' : 'ACHE O SEU VAGÃO',
    );

    drawVignette(view, 0.24);
  };
}

// ---------------------------------------------------------------------------
// GANGORRA!
// ---------------------------------------------------------------------------

/** Quanto a prancha gira na tela no talo da inclinação. */
const TILT_RAD = 0.15;

function drawCrate(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
): void {
  const size = radius * 1.72;
  ctx.save();
  ctx.globalAlpha = 0.26;
  ctx.fillStyle = '#3D1330';
  ctx.beginPath();
  ctx.ellipse(x, y + radius * 0.7, radius * 0.95, radius * 0.3, 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.translate(x, y);
  ctx.beginPath();
  ctx.roundRect(-size / 2, -size / 2, size, size, 8);
  const wood = ctx.createLinearGradient(-size / 2, -size / 2, size / 2, size / 2);
  wood.addColorStop(0, '#E8B978');
  wood.addColorStop(1, '#A9702F');
  ctx.fillStyle = wood;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#5E2410';
  ctx.stroke();

  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-size / 2 + 4, -size / 2 + 4);
  ctx.lineTo(size / 2 - 4, size / 2 - 4);
  ctx.moveTo(size / 2 - 4, -size / 2 + 4);
  ctx.lineTo(-size / 2 + 4, size / 2 - 4);
  ctx.strokeStyle = 'rgba(94,36,16,0.6)';
  ctx.stroke();
  ctx.restore();
}

export function createGangorraRenderer(): GameRenderer {
  return (view) => {
    const { ctx, t } = view;
    const plank = itemsOf(view, 1)[0];
    const tilt = plank?.a ?? 0;
    const halfWidth = (plank?.w ?? ARENA.w) / 2;
    const pivotX = plank?.x ?? ARENA_CENTER.x;
    const pivotY = plank?.y ?? ARENA_CENTER.y;

    // fundo (não gira: é o horizonte)
    const sky = ctx.createLinearGradient(0, 0, WORLD.w, WORLD.h);
    sky.addColorStop(0, view.theme.backdrop);
    sky.addColorStop(1, view.theme.backdropDeep);
    ctx.fillStyle = sky;
    ctx.fillRect(-200, -200, WORLD.w + 400, WORLD.h + 400);

    // apoio central
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.moveTo(pivotX, pivotY + ARENA.h / 2 - 40);
    ctx.lineTo(pivotX - 74, pivotY + ARENA.h / 2 + 62);
    ctx.lineTo(pivotX + 74, pivotY + ARENA.h / 2 + 62);
    ctx.closePath();
    const base = ctx.createLinearGradient(pivotX, pivotY, pivotX, pivotY + ARENA.h / 2 + 62);
    base.addColorStop(0, '#FF9E7A');
    base.addColorStop(1, '#5E2410');
    ctx.fillStyle = base;
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#3D1330';
    ctx.stroke();
    ctx.restore();

    // tudo o que está SOBRE a prancha gira junto com ela
    ctx.save();
    ctx.translate(pivotX, pivotY);
    ctx.rotate(tilt * TILT_RAD);
    ctx.translate(-pivotX, -pivotY);

    // prancha
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = '#3D1330';
    ctx.beginPath();
    ctx.roundRect(pivotX - halfWidth + 6, ARENA.y + 18, halfWidth * 2, ARENA.h, 26);
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.roundRect(pivotX - halfWidth, ARENA.y, halfWidth * 2, ARENA.h, 26);
    ctx.fillStyle = view.theme.arenaEdge;
    ctx.fill();

    ctx.beginPath();
    ctx.roundRect(pivotX - halfWidth + 10, ARENA.y + 10, halfWidth * 2 - 20, ARENA.h - 20, 18);
    const floor = ctx.createLinearGradient(pivotX - halfWidth, 0, pivotX + halfWidth, 0);
    floor.addColorStop(0, view.theme.arena);
    floor.addColorStop(0.5, '#FFFFFF');
    floor.addColorStop(1, view.theme.arena);
    ctx.fillStyle = floor;
    ctx.fill();

    // veios da madeira + marca do apoio
    ctx.save();
    ctx.clip();
    ctx.globalAlpha = 0.1;
    ctx.strokeStyle = view.theme.ink;
    ctx.lineWidth = 3;
    for (let y = ARENA.y + 40; y < ARENA.y + ARENA.h; y += 46) {
      ctx.beginPath();
      ctx.moveTo(pivotX - halfWidth, y);
      ctx.lineTo(pivotX + halfWidth, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = view.theme.ink;
    ctx.fillRect(pivotX - 5, ARENA.y, 10, ARENA.h);
    ctx.restore();

    for (const crate of itemsOf(view, 0)) drawCrate(ctx, crate.x, crate.y, crate.r);

    view.fx.drawBehind(ctx);
    drawFighters(view, {
      radius: 26,
      dangerFor: (fighter) => clamp01((Math.abs(fighter.x - pivotX) - (halfWidth - 110)) / 110),
    });
    ctx.restore();

    // nível de bolha: para que lado a prancha pende
    const levelW = 210;
    const levelX = ARENA_CENTER.x - levelW / 2;
    const levelY = ARENA.y - 26;
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.roundRect(levelX, levelY, levelW, 18, 9);
    ctx.fillStyle = 'rgba(20,10,45,0.45)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ARENA_CENTER.x + tilt * (levelW / 2 - 12), levelY + 9, 9, 0, TAU);
    ctx.fillStyle = Math.abs(tilt) > 0.75 ? '#FF4D5E' : '#3FC6FF';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#FFFFFF';
    ctx.stroke();
    ctx.restore();

    void t;
    drawVignette(view, 0.28);
  };
}
