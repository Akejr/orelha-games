import { ARENA, ARENA_CENTER, WORLD, clamp01 } from '@shared/index';
import { drawCircleArena, drawFighters, drawVignette } from './common';
import {
  drawCarryStack,
  drawChair,
  drawCoin,
  drawDumbbell,
  drawFreeMark,
  drawLoadRing,
  drawMusicNotes,
  drawShadowAura,
  drawTimerBar,
  drawVault,
  drawVortex,
  itemsOf,
  drawKitArena,
} from './primitives';
import type { GameRenderer, RenderView } from './types';

/**
 * Renderers da terceira leva: SOMBRA!, BURACO!, PESO!, LADRÃO!, CADEIRAS!.
 *
 * Mesma ideia do arquivo da segunda leva: o vocabulário visual mora em
 * `primitives.ts` e aqui fica só a composição de cada jogo, na ordem em que as
 * camadas entram na tela.
 */

const TAU = Math.PI * 2;

/**
 * Valor por jogador vindo de `ex.n`.
 *
 * O canal genérico manda um número por jogador na ORDEM DO SNAPSHOT, e
 * `view.fighters` não garante essa ordem (vem de um Map interpolado). Então o
 * índice tem que sair de `snapshot.ps`.
 */
function perPlayer(view: RenderView): Map<string, number> {
  const out = new Map<string, number>();
  const numbers = view.snapshot.ex?.n ?? [];
  view.snapshot.ps.forEach((fighter, index) => {
    out.set(fighter.i, numbers[index] ?? 0);
  });
  return out;
}

// ---------------------------------------------------------------------------
// SOMBRA!
// ---------------------------------------------------------------------------

export function createSombraRenderer(): GameRenderer {
  return (view) => {
    const { ctx, t } = view;
    const hunters = new Set(view.snapshot.ex?.ids ?? []);

    drawKitArena(view, { grid: true });

    // linha de tensão entre o caçador mais perto e o jogador local
    const self = view.fighters.find((fighter) => fighter.id === view.selfId);
    if (self && self.alive && !hunters.has(self.id)) {
      let nearest: { x: number; y: number; d: number } | null = null;
      for (const fighter of view.fighters) {
        if (!hunters.has(fighter.id) || !fighter.alive) continue;
        const d = Math.hypot(fighter.x - self.x, fighter.y - self.y);
        if (!nearest || d < nearest.d) nearest = { x: fighter.x, y: fighter.y, d };
      }
      if (nearest && nearest.d < 320) {
        ctx.save();
        ctx.globalAlpha = clamp01(1 - nearest.d / 320) * 0.7;
        ctx.strokeStyle = '#FF5CA3';
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 12]);
        ctx.lineDashOffset = -t * 60;
        ctx.beginPath();
        ctx.moveTo(self.x, self.y);
        ctx.lineTo(nearest.x, nearest.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
    }

    view.fx.drawBehind(ctx);

    drawFighters(view, {
      radius: 26,
      underlay: (fighter) => {
        if (hunters.has(fighter.id)) drawShadowAura(ctx, fighter.x, fighter.y, 26, t);
        else drawFreeMark(ctx, fighter.x, fighter.y, 26, t);
      },
      dangerFor: (fighter) => {
        if (hunters.has(fighter.id)) return 0;
        let nearest = Infinity;
        for (const other of view.fighters) {
          if (!hunters.has(other.id) || !other.alive) continue;
          nearest = Math.min(nearest, Math.hypot(other.x - fighter.x, other.y - fighter.y));
        }
        return nearest === Infinity ? 0 : clamp01(1 - nearest / 260);
      },
    });

    drawVignette(view, 0.34);
  };
}

// ---------------------------------------------------------------------------
// BURACO!
// ---------------------------------------------------------------------------

export function createBuracoRenderer(): GameRenderer {
  return (view) => {
    const { ctx, t } = view;
    const hole = itemsOf(view, 0)[0];
    const power = hole?.v ?? 0;

    drawKitArena(view);

    if (hole) {
      // o piso "afunda" em direção ao buraco
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(ARENA.x + 11, ARENA.y + 11, ARENA.w - 22, ARENA.h - 22, 36);
      ctx.clip();
      ctx.globalAlpha = 0.16 + power * 0.14;
      ctx.strokeStyle = view.theme.ink;
      ctx.lineWidth = 2.5;
      for (let ring = 1; ring <= 7; ring += 1) {
        const r = hole.r + ring * 62 - ((t * 34) % 62);
        ctx.beginPath();
        ctx.ellipse(hole.x, hole.y, r, r * 0.9, 0, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();

      drawVortex(ctx, hole.x, hole.y, hole.r, t, power);
    }

    view.fx.drawBehind(ctx);

    drawFighters(view, {
      radius: 26,
      underlay: (fighter) => {
        if (!hole) return;
        // fiapo de luz apontando para o buraco: mostra para onde a física puxa
        const dx = hole.x - fighter.x;
        const dy = hole.y - fighter.y;
        const d = Math.hypot(dx, dy) || 1;
        const near = clamp01(1 - (d - hole.r) / 340);
        if (near <= 0.02) return;
        ctx.save();
        ctx.globalAlpha = near * 0.5;
        ctx.strokeStyle = '#8F66FF';
        ctx.lineWidth = 4 + near * 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(fighter.x, fighter.y);
        ctx.lineTo(fighter.x + (dx / d) * 44 * near, fighter.y + (dy / d) * 44 * near);
        ctx.stroke();
        ctx.restore();
      },
      dangerFor: (fighter) => {
        if (!hole) return 0;
        const d = Math.hypot(hole.x - fighter.x, hole.y - fighter.y);
        return clamp01(1 - (d - hole.r) / 220);
      },
    });

    drawVignette(view, 0.3 + power * 0.25);
  };
}

// ---------------------------------------------------------------------------
// PESO!
// ---------------------------------------------------------------------------

const PESO_MAX_LOAD = 5;

export function createPesoRenderer(): GameRenderer {
  return (view) => {
    const { ctx, t } = view;
    const arena = itemsOf(view, 1)[0];
    const radius = arena?.r ?? 280;
    const cx = arena?.x ?? WORLD.w / 2;
    const cy = arena?.y ?? WORLD.h / 2;
    const load = perPlayer(view);

    // fundo + plataforma circular (o resto da arena é "fora")
    drawCircleArena(view, cx, cy, radius, {
      danger: (arena?.v ?? 0) > 0.72 ? 1 : 0,
      rotation: t * 0.08,
    });

    for (const weight of itemsOf(view, 0)) {
      drawDumbbell(ctx, weight.x, weight.y, weight.r, t);
    }

    view.fx.drawBehind(ctx);

    drawFighters(view, {
      radius: 27,
      underlay: (fighter) => {
        drawLoadRing(ctx, fighter.x, fighter.y, 38, load.get(fighter.id) ?? 0, PESO_MAX_LOAD);
      },
      dangerFor: (fighter) => {
        const d = Math.hypot(fighter.x - cx, fighter.y - cy);
        return clamp01((d - (radius - 90)) / 90);
      },
    });

    drawVignette(view, 0.26);
  };
}

// ---------------------------------------------------------------------------
// LADRÃO!
// ---------------------------------------------------------------------------

export function createLadraoRenderer(): GameRenderer {
  return (view) => {
    const { ctx, t } = view;
    const bag = perPlayer(view);

    drawKitArena(view, { grid: true });

    const vault = itemsOf(view, 1)[0];
    if (vault) drawVault(ctx, vault.x, vault.y, vault.r, t, vault.v ?? 1);

    for (const coin of itemsOf(view, 0)) drawCoin(ctx, coin.x, coin.y, coin.r, t);

    view.fx.drawBehind(ctx);

    drawFighters(view, {
      radius: 26,
      // quem carrega moeda brilha como se tivesse a coroa: é o alvo da rodada
      crownHolderId:
        view.fighters
          .filter((fighter) => (bag.get(fighter.id) ?? 0) > 0)
          .sort((a, b) => (bag.get(b.id) ?? 0) - (bag.get(a.id) ?? 0))[0]?.id ?? null,
      underlay: (fighter) => {
        const carried = bag.get(fighter.id) ?? 0;
        if (carried <= 0) return;
        ctx.save();
        ctx.globalAlpha = 0.25 + Math.sin(t * 6 + fighter.x * 0.02) * 0.1;
        ctx.fillStyle = '#FFC93C';
        ctx.beginPath();
        ctx.ellipse(fighter.x, fighter.y + 22, 34 + carried * 3, 13, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      },
    });

    for (const fighter of view.fighters) {
      if (!fighter.alive) continue;
      drawCarryStack(ctx, fighter.x, fighter.y - 64, bag.get(fighter.id) ?? 0, t);
    }

    drawVignette(view, 0.22);
  };
}

// ---------------------------------------------------------------------------
// CADEIRAS!
// ---------------------------------------------------------------------------

export function createCadeirasRenderer(): GameRenderer {
  return (view) => {
    const { ctx, t } = view;
    const numbers = view.snapshot.ex?.n ?? [];
    const chairsLeft = numbers[0] ?? 0;
    const timer = numbers[1] ?? 0;
    const music = (numbers[2] ?? 0) > 0.5;

    drawKitArena(view);

    if (music) drawMusicNotes(ctx, ARENA_CENTER.x, ARENA_CENTER.y + 40, 220, t);

    for (const chair of itemsOf(view)) {
      drawChair(ctx, chair.x, chair.y, chair.r, t, {
        spinning: chair.k === 2,
        taken: chair.k === 1,
      });
    }

    view.fx.drawBehind(ctx);
    drawFighters(view, { radius: 26 });

    // barra da música: enche de tensão os últimos segundos
    const ratio = music ? clamp01(timer / 7.5) : 1;
    drawTimerBar(
      ctx,
      ratio,
      music ? (timer < 1.6 ? '#FF4D5E' : '#FFFFFF') : '#FFC93C',
      music
        ? `${chairsLeft} ${chairsLeft === 1 ? 'CADEIRA' : 'CADEIRAS'}`
        : 'APITO! SENTA!',
    );

    drawVignette(view, 0.24);
  };
}
