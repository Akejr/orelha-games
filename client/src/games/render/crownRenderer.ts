import { WORLD, clamp01 } from '@shared/index';
import { drawCrown } from './creature';
import { drawBackdrop, drawFighters, drawRectArena, drawVignette } from './common';
import type { GameRenderer } from './types';

const TAU = Math.PI * 2;
const ARENA = { x: 62, y: 74, w: WORLD.w - 124, h: WORLD.h - 148 };

/** CROWN!: salão dourado, holofote no portador e a coroa sempre visível. */
export function createCrownRenderer(): GameRenderer {
  return (view) => {
    const crown = view.snapshot.crown;
    if (!crown) return;
    const { ctx, t } = view;

    drawBackdrop(view, 0.6);
    drawRectArena(view, ARENA.x, ARENA.y, ARENA.w, ARENA.h, 52);

    // tapete central
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#F5AE10';
    ctx.lineWidth = 4;
    ctx.setLineDash([18, 16]);
    ctx.beginPath();
    ctx.roundRect(ARENA.x + 54, ARENA.y + 54, ARENA.w - 108, ARENA.h - 108, 38);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.28;
    ctx.beginPath();
    ctx.arc(WORLD.w / 2, WORLD.h / 2, 120, 0, TAU);
    ctx.fillStyle = '#FFE38C';
    ctx.fill();
    ctx.restore();

    // holofote no portador
    const holder = crown.h ? view.fighters.find((f) => f.id === crown.h) : null;
    if (holder) {
      ctx.save();
      const spot = ctx.createRadialGradient(holder.x, holder.y, 20, holder.x, holder.y, 190);
      spot.addColorStop(0, 'rgba(255,231,140,0.55)');
      spot.addColorStop(1, 'rgba(255,231,140,0)');
      ctx.fillStyle = spot;
      ctx.beginPath();
      ctx.arc(holder.x, holder.y, 190, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    drawFighters(view, {
      radius: 26,
      crownHolderId: crown.h,
      underlay: (fighter) => {
        if (fighter.id !== crown.h) return;
        // trilha dourada de quem está com a coroa
        ctx.save();
        ctx.globalAlpha = 0.25 + Math.sin(t * 5) * 0.1;
        ctx.fillStyle = '#FFC93C';
        ctx.beginPath();
        ctx.ellipse(fighter.x, fighter.y + 22, 40, 14, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      },
    });

    // a coroa (no chão ou na cabeça)
    const bob = crown.dr === 1 ? 0 : -4;
    drawCrown(ctx, crown.x, crown.y + bob, 22, t, { grounded: crown.dr === 1 });

    if (crown.dr === 1) {
      // coroa livre: seta pulsante para chamar atenção
      ctx.save();
      ctx.globalAlpha = 0.5 + Math.sin(t * 8) * 0.3;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 5;
      const pulse = 34 + Math.sin(t * 6) * 6;
      ctx.beginPath();
      ctx.arc(crown.x, crown.y, pulse, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    // imunidade recém-roubada
    if (crown.im > 0.02 && holder) {
      ctx.save();
      ctx.globalAlpha = crown.im * 0.7;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.arc(holder.x, holder.y, 40, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    drawVignette(view, 0.26);
  };
}
