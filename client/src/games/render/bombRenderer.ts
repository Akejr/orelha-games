import { WORLD, clamp01 } from '@shared/index';
import { drawBomb } from './creature';
import { drawBackdrop, drawCircleArena, drawFighters, drawVignette } from './common';
import type { GameRenderer } from './types';

const TAU = Math.PI * 2;
const CX = WORLD.w / 2;
const CY = WORLD.h / 2;

/** BOMB!: arena apertando, uma ou duas bombas brilhando e o pavio queimando. */
export function createBombRenderer(): GameRenderer {
  return (view) => {
    const bomb = view.snapshot.bomb;
    if (!bomb) return;
    const { ctx, t } = view;
    const bombs = bomb.bombs ?? [];

    drawBackdrop(view, 1.4);

    // a bomba mais quente define a tensão visual da tela
    const hottest = bombs.reduce((min, entry) => Math.min(min, entry.fz), 1);
    const heat = 1 - hottest;

    drawCircleArena(view, CX, CY, bomb.r, {
      danger: clamp01(1 - (bomb.r - 170) / 130) * 0.7,
    });

    // pulso vermelho no piso conforme o pavio queima
    ctx.save();
    ctx.globalAlpha = 0.1 + heat * 0.3 * (0.6 + Math.sin(t * (4 + heat * 18)) * 0.4);
    const pulse = ctx.createRadialGradient(CX, CY, bomb.r * 0.15, CX, CY, bomb.r);
    pulse.addColorStop(0, 'rgba(255,120,80,0)');
    pulse.addColorStop(1, '#FF4D2E');
    ctx.fillStyle = pulse;
    ctx.beginPath();
    ctx.arc(CX, CY, bomb.r - 8, 0, TAU);
    ctx.fill();
    ctx.restore();

    const holderIds = bombs.map((entry) => entry.h);

    drawFighters(view, {
      radius: 26,
      bombHolders: holderIds,
      dangerFor: (fighter) => {
        const entry = bombs.find((item) => item.h === fighter.id);
        return entry ? 1 - entry.fz : 0;
      },
      underlay: (fighter) => {
        if (!holderIds.includes(fighter.id)) return;
        ctx.save();
        ctx.globalAlpha = 0.22 + heat * 0.3;
        ctx.fillStyle = '#FF5A3C';
        ctx.beginPath();
        ctx.ellipse(fighter.x, fighter.y + 22, 44, 15, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      },
    });

    // uma bomba flutuando sobre cada portador
    for (const entry of bombs) {
      if (!entry.h) continue;
      const holder = view.fighters.find((fighter) => fighter.id === entry.h);
      if (!holder) continue;

      drawBomb(ctx, holder.x, holder.y - 54, 18, t, entry.fz);

      // cooldown de passe: anel branco fechando
      if (entry.cd > 0.02) {
        ctx.save();
        ctx.globalAlpha = 0.7;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(
          holder.x,
          holder.y - 54,
          26,
          -Math.PI / 2,
          -Math.PI / 2 + clamp01(entry.cd / 0.4) * TAU,
        );
        ctx.stroke();
        ctx.restore();
      }
    }

    drawVignette(view, 0.28);

    // vinheta vermelha quando alguma bomba está quase estourando
    if (heat > 0.72) {
      ctx.save();
      ctx.globalAlpha = (heat - 0.72) * 1.1 * (0.55 + Math.sin(t * 22) * 0.45);
      ctx.fillStyle = '#FF2E2E';
      ctx.fillRect(-200, -200, WORLD.w + 400, WORLD.h + 400);
      ctx.restore();
    }
  };
}
