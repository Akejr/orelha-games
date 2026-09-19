import { WORLD, clamp01 } from '@shared/index';
import { drawBackdrop, drawCircleArena, drawFighters, drawVignette } from './common';
import type { GameRenderer } from './types';

const TAU = Math.PI * 2;
const CX = WORLD.w / 2;
const CY = WORLD.h / 2;

/** PUSH!: arena flutuante que encolhe, com os modificadores da rodada. */
export function createPushRenderer(): GameRenderer {
  return (view) => {
    const push = view.snapshot.push;
    if (!push) return;
    const { ctx, t } = view;

    drawBackdrop(view, 1);

    const danger = clamp01(1 - (push.r - 80) / 200);
    drawCircleArena(view, CX, CY, push.r, { danger: danger * 0.9, rotation: push.sp });

    // gelo: brilho azulado no piso
    if (push.mods.includes('ice')) {
      ctx.save();
      ctx.globalAlpha = 0.4;
      const ice = ctx.createRadialGradient(CX, CY, push.r * 0.1, CX, CY, push.r);
      ice.addColorStop(0, 'rgba(223,244,255,0.9)');
      ice.addColorStop(1, 'rgba(63,198,255,0.45)');
      ctx.fillStyle = ice;
      ctx.beginPath();
      ctx.arc(CX, CY, push.r - 8, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      for (let i = 0; i < 6; i += 1) {
        const angle = (i / 6) * TAU + push.sp * 0.4;
        ctx.beginPath();
        ctx.moveTo(CX + Math.cos(angle) * push.r * 0.25, CY + Math.sin(angle) * push.r * 0.25);
        ctx.lineTo(CX + Math.cos(angle + 0.5) * push.r * 0.8, CY + Math.sin(angle + 0.5) * push.r * 0.8);
        ctx.stroke();
      }
      ctx.restore();
    }

    // buracos
    for (const hole of push.holes) {
      ctx.save();
      const gradient = ctx.createRadialGradient(hole.x, hole.y, hole.r * 0.1, hole.x, hole.y, hole.r);
      gradient.addColorStop(0, '#0B0522');
      gradient.addColorStop(0.7, '#1B0F3C');
      gradient.addColorStop(1, 'rgba(27,15,60,0.15)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.ellipse(hole.x, hole.y, hole.r, hole.r * 0.82, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(20,10,45,0.55)';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.restore();
    }

    // molas
    for (const spring of push.springs) {
      const squeeze = 1 + Math.sin(t * 3 + spring.x * 0.02) * 0.06;
      ctx.save();
      ctx.translate(spring.x, spring.y);
      ctx.scale(1, squeeze);
      ctx.beginPath();
      ctx.arc(0, 0, spring.r, 0, TAU);
      ctx.fillStyle = '#FF7A59';
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#7A2A18';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, spring.r * 0.55, 0, TAU);
      ctx.fillStyle = '#FFC93C';
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // paredes móveis
    for (const wall of push.walls) {
      ctx.save();
      ctx.translate(wall.x, wall.y);
      ctx.rotate(wall.a);
      ctx.beginPath();
      ctx.roundRect(-wall.w / 2, -wall.h / 2, wall.w, wall.h, wall.h / 2);
      ctx.fillStyle = '#8F66FF';
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#2B1466';
      ctx.stroke();
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.roundRect(-wall.w / 2 + 8, -wall.h / 2 + 5, wall.w - 16, wall.h * 0.3, wall.h * 0.15);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.restore();
      ctx.restore();
    }

    // ventilador ligado: rajadas atravessando a arena
    if (push.fan && push.fan.on === 1) {
      ctx.save();
      ctx.globalAlpha = 0.32;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      const dx = Math.cos(push.fan.a);
      const dy = Math.sin(push.fan.a);
      for (let i = 0; i < 9; i += 1) {
        const offset = ((t * 420 + i * 130) % 900) - 450;
        const px = CX - dx * 450 + dx * (offset + 450) - dy * ((i - 4) * 62);
        const py = CY - dy * 450 + dy * (offset + 450) + dx * ((i - 4) * 62);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + dx * 56, py + dy * 56);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawFighters(view, {
      radius: 27,
      showStagger: true,
      dangerFor: (fighter) =>
        clamp01(Math.hypot(fighter.x - CX, fighter.y - CY) / Math.max(1, push.r) - 0.25),
    });

    drawVignette(view, 0.3 + danger * 0.12);
  };
}
