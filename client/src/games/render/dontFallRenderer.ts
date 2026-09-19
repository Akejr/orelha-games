import {
  FALL_COLS,
  FALL_OX,
  FALL_OY,
  FALL_PITCH,
  FALL_ROWS,
  FALL_TILE,
  FALL_TOTAL,
  WORLD,
  rleDecode,
} from '@shared/index';
import { drawFighters, drawVignette } from './common';
import type { GameRenderer } from './types';

const TAU = Math.PI * 2;

/** DON'T FALL!: mosaico sobre o vazio. A cor do bloco conta quanto ele aguenta. */
export function createDontFallRenderer(): GameRenderer {
  // memória local só para animar a queda do bloco depois que o servidor o remove
  const vanish = new Map<number, number>();
  let cells = new Uint8Array(FALL_TOTAL);

  return (view) => {
    const fall = view.snapshot.fall;
    if (!fall) return;
    const { ctx, t, theme } = view;

    // vazio embaixo do mosaico
    const sky = ctx.createRadialGradient(WORLD.w / 2, WORLD.h / 2, 120, WORLD.w / 2, WORLD.h / 2, WORLD.w * 0.8);
    sky.addColorStop(0, theme.backdrop);
    sky.addColorStop(1, '#1A0B33');
    ctx.fillStyle = sky;
    ctx.fillRect(-200, -200, WORLD.w + 400, WORLD.h + 400);

    // estrelinhas no fundo
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 26; i += 1) {
      const seed = i * 197.3;
      const x = (seed * 2.3) % WORLD.w;
      const y = (seed * 3.7) % WORLD.h;
      const twinkle = 0.4 + Math.abs(Math.sin(t * 1.6 + i)) * 0.6;
      ctx.globalAlpha = 0.16 * twinkle;
      ctx.beginPath();
      ctx.arc(x, y, 2.4 + (i % 3), 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    const previous = cells;
    cells = rleDecode(fall.g, FALL_TOTAL);
    for (let i = 0; i < FALL_TOTAL; i += 1) {
      if (previous[i] > 0 && cells[i] === 0 && !vanish.has(i)) vanish.set(i, t);
    }

    const drawTile = (index: number, stage: number, fallProgress: number): void => {
      const col = index % FALL_COLS;
      const row = Math.floor(index / FALL_COLS);
      const x = FALL_OX + col * FALL_PITCH;
      const y = FALL_OY + row * FALL_PITCH;

      const shiver = stage === 1 ? Math.sin(t * 26 + index) * 2.2 : 0;
      const drop = fallProgress > 0 ? fallProgress * fallProgress * 420 : 0;
      const alpha = fallProgress > 0 ? Math.max(0, 1 - fallProgress * 1.25) : 1;
      if (alpha <= 0.01) return;

      const colors: Record<number, string> = {
        5: '#C9E4FF', // bloco reforçado: aguenta o dobro
        4: theme.arena,
        3: '#FFE9C7',
        2: '#FFC38F',
        1: '#FF8FA8',
      };

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x + FALL_TILE / 2 + shiver, y + FALL_TILE / 2 + drop);
      if (fallProgress > 0) ctx.rotate(fallProgress * 0.7);

      // lateral do bloco (dá volume)
      ctx.beginPath();
      ctx.roundRect(-FALL_TILE / 2, -FALL_TILE / 2 + 7, FALL_TILE, FALL_TILE, 13);
      ctx.fillStyle = theme.arenaEdge;
      ctx.fill();

      ctx.beginPath();
      ctx.roundRect(-FALL_TILE / 2, -FALL_TILE / 2, FALL_TILE, FALL_TILE, 13);
      ctx.fillStyle = colors[stage] ?? theme.arena;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(75,16,80,0.28)';
      ctx.stroke();

      // brilho superior
      ctx.save();
      ctx.globalAlpha = alpha * 0.55;
      ctx.beginPath();
      ctx.roundRect(-FALL_TILE / 2 + 7, -FALL_TILE / 2 + 6, FALL_TILE - 14, FALL_TILE * 0.3, 8);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.restore();

      // parafusos marcam o bloco reforçado
      if (stage === 5) {
        ctx.fillStyle = '#5A7FA8';
        for (const [bx, by] of [
          [-18, -18],
          [18, -18],
          [-18, 18],
          [18, 18],
        ]) {
          ctx.beginPath();
          ctx.arc(bx, by, 3.4, 0, TAU);
          ctx.fill();
        }
      }

      // rachaduras conforme o desgaste
      if (stage <= 3) {
        ctx.strokeStyle = 'rgba(75,16,80,0.55)';
        ctx.lineWidth = stage === 1 ? 3.2 : 2.2;
        ctx.beginPath();
        ctx.moveTo(-14, -16);
        ctx.lineTo(-4, -2);
        ctx.lineTo(-10, 10);
        if (stage <= 2) {
          ctx.moveTo(8, -14);
          ctx.lineTo(14, 2);
          ctx.lineTo(6, 14);
        }
        if (stage === 1) {
          ctx.moveTo(-18, 6);
          ctx.lineTo(0, 8);
          ctx.lineTo(18, -4);
        }
        ctx.stroke();
      }
      ctx.restore();
    };

    for (let i = 0; i < FALL_TOTAL; i += 1) {
      const stage = cells[i];
      if (stage > 0) {
        drawTile(i, stage, 0);
        continue;
      }
      const at = vanish.get(i);
      if (at === undefined) continue;
      const progress = (t - at) / 0.8;
      if (progress >= 1) {
        vanish.delete(i);
        continue;
      }
      drawTile(i, 1, progress);
    }

    drawFighters(view, { radius: 25, showStagger: true });
    drawVignette(view, 0.34);
  };
}
