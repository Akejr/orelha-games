import {
  PAINT_CELL,
  PAINT_COLS,
  PAINT_ROWS,
  PAINT_TOTAL,
  WORLD,
  paletteForSlot,
  rleDecode,
} from '@shared/index';
import { drawBackdrop, drawFighters, drawVignette } from './common';
import type { GameRenderer } from './types';

const TAU = Math.PI * 2;

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

/**
 * PAINT!: o grid vem do servidor em RLE. O truque de render é pintar o grid num
 * canvas offscreen de 40x28 pixels e ampliar com suavização — sai uma tinta
 * orgânica e macia, e custa um único drawImage por frame.
 */
export function createPaintRenderer(): GameRenderer {
  const off = document.createElement('canvas');
  off.width = PAINT_COLS;
  off.height = PAINT_ROWS;
  const offCtx = off.getContext('2d', { willReadFrequently: true });
  const image = offCtx?.createImageData(PAINT_COLS, PAINT_ROWS) ?? null;

  const colors: [number, number, number][] = [
    [246, 241, 255],
    ...[0, 1, 2, 3, 4].map((slot) => hexToRgb(paletteForSlot(slot).base)),
  ];
  const lightColors: [number, number, number][] = [
    [255, 255, 255],
    ...[0, 1, 2, 3, 4].map((slot) => hexToRgb(paletteForSlot(slot).light)),
  ];

  let cells = new Uint8Array(PAINT_TOTAL);

  return (view) => {
    const paint = view.snapshot.paint;
    if (!paint) return;
    const { ctx, t } = view;

    drawBackdrop(view, 0.4);
    cells = rleDecode(paint.g, PAINT_TOTAL);

    if (offCtx && image) {
      const data = image.data;
      for (let i = 0; i < PAINT_TOTAL; i += 1) {
        const owner = cells[i];
        // xadrez sutil no chão vazio para dar textura
        const checker = ((i % PAINT_COLS) + Math.floor(i / PAINT_COLS)) % 2 === 0;
        const source = owner === 0 ? (checker ? lightColors[0] : colors[0]) : colors[owner];
        const offset = i * 4;
        data[offset] = source[0];
        data[offset + 1] = source[1];
        data[offset + 2] = source[2];
        data[offset + 3] = 255;
      }
      offCtx.putImageData(image, 0, 0);
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(off, 0, 0, WORLD.w, WORLD.h);
      ctx.restore();
    }

    // grade por cima: ajuda a ler o território
    ctx.save();
    ctx.globalAlpha = 0.09;
    ctx.strokeStyle = '#0A5741';
    ctx.lineWidth = 1.4;
    for (let col = 1; col < PAINT_COLS; col += 1) {
      ctx.beginPath();
      ctx.moveTo(col * PAINT_CELL, 0);
      ctx.lineTo(col * PAINT_CELL, WORLD.h);
      ctx.stroke();
    }
    for (let row = 1; row < PAINT_ROWS; row += 1) {
      ctx.beginPath();
      ctx.moveTo(0, row * PAINT_CELL);
      ctx.lineTo(WORLD.w, row * PAINT_CELL);
      ctx.stroke();
    }
    ctx.restore();

    // moldura da quadra
    ctx.save();
    ctx.strokeStyle = view.theme.arenaEdge;
    ctx.lineWidth = 14;
    ctx.strokeRect(7, 7, WORLD.w - 14, WORLD.h - 14);
    ctx.restore();

    view.fx.drawBehind(ctx);

    // rolos de tinta no chão
    for (const power of paint.pu ?? []) {
      ctx.save();
      ctx.translate(power.x, power.y + Math.sin(t * 4 + power.x * 0.02) * 4);
      const glow = ctx.createRadialGradient(0, 0, 6, 0, 0, 44);
      glow.addColorStop(0, 'rgba(255,92,163,0.55)');
      glow.addColorStop(1, 'rgba(255,92,163,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, 44, 0, TAU);
      ctx.fill();
      ctx.rotate(Math.sin(t * 2) * 0.25);
      ctx.beginPath();
      ctx.roundRect(-20, -9, 40, 18, 9);
      ctx.fillStyle = '#FF5CA3';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#7A0E42';
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, 9);
      ctx.lineTo(0, 22);
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.restore();
    }

    // aura de quem pegou o rolo (bo segue a ordem de ps no snapshot)
    const boosts = paint.bo ?? [];
    view.snapshot.ps.forEach((net, index) => {
      if ((boosts[index] ?? 0) <= 0.02) return;
      const fighter = view.fighters.find((entry) => entry.id === net.i);
      const meta = view.meta.get(net.i);
      if (!fighter || !meta) return;
      ctx.save();
      ctx.globalAlpha = 0.35 + Math.sin(t * 8) * 0.15;
      ctx.lineWidth = 6;
      ctx.strokeStyle = meta.palette.light;
      ctx.beginPath();
      ctx.arc(fighter.x, fighter.y, 46, 0, TAU);
      ctx.stroke();
      ctx.restore();
    });

    drawFighters(view, {
      radius: 25,
      labels: true,
      underlay: (fighter, meta) => {
        // pincel sob o personagem
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = meta.palette.light;
        ctx.beginPath();
        ctx.arc(fighter.x, fighter.y, fighter.dashing ? 34 : 26, 0, TAU);
        ctx.fill();
        ctx.restore();
      },
    });

    // final rush: moldura piscando
    if (paint.ru === 1) {
      ctx.save();
      ctx.globalAlpha = 0.35 + Math.sin(t * 9) * 0.25;
      ctx.strokeStyle = '#FF5CA3';
      ctx.lineWidth = 20;
      ctx.strokeRect(10, 10, WORLD.w - 20, WORLD.h - 20);
      ctx.restore();
    }

    drawVignette(view, 0.18);
  };
}
