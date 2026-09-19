import {
  ARENA,
  ARENA_CENTER,
  CORES_NAMES,
  MINA_COLS,
  MINA_TOTAL,
  WORLD,
  clamp01,
  minaCellCenter,
  minaCellSize,
  paletteForSlot,
  rleDecode,
} from '@shared/index';
import { drawBigText, drawFighters, drawVignette } from './common';
import {
  drawBall,
  drawBeam,
  drawBlastRing,
  drawGoalMouth,
  drawInvulnOverlay,
  drawKitArena,
  drawLifeOverlay,
  drawMeteorShadow,
  drawStarPickup,
  drawTargetRing,
  drawWallBar,
  drawZone,
  itemsOf,
} from './primitives';
import type { GameRenderer, RenderView } from './types';

/**
 * Renderers da segunda leva de minijogos.
 *
 * Ficam juntos de propósito: os dez compartilham a mesma arena e o mesmo
 * vocabulário de primitivas, então manter o conjunto em um arquivo deixa
 * evidente o que é padrão e o que é específico de cada jogo. Cada bloco abaixo é
 * autocontido e lê apenas os códigos `k` que o seu módulo de simulação envia.
 */

const TAU = Math.PI * 2;

// os dois overlays abaixo viraram primitivas (a terceira e a quarta leva também
// usam), então aqui ficam só os apelidos locais
const lifeOverlay = drawLifeOverlay;
const invulnOverlay = drawInvulnOverlay;

// ---------------------------------------------------------------------------
// COLETA!
// ---------------------------------------------------------------------------

export function createColetaRenderer(): GameRenderer {
  return (view) => {
    drawKitArena(view, { grid: true });
    view.fx.drawBehind(view.ctx);
    for (const star of itemsOf(view)) {
      drawStarPickup(view.ctx, star.x, star.y, star.r, view.t, star.k === 1, star.v ?? 1);
    }
    drawFighters(view, { radius: 26 });
    drawVignette(view, 0.2);
  };
}

// ---------------------------------------------------------------------------
// ZONA!
// ---------------------------------------------------------------------------

export function createZonaRenderer(): GameRenderer {
  return (view) => {
    drawKitArena(view, { grid: true });
    const zone = itemsOf(view, 0)[0];
    const next = itemsOf(view, 1)[0];

    if (zone) {
      drawZone(view.ctx, zone.x, zone.y, zone.r, view.t, {
        contested: (zone.v ?? 0) > 0.5,
        color: view.theme.from,
      });
    }
    if (next) {
      drawZone(view.ctx, next.x, next.y, next.r, view.t, { warn: next.v ?? 0 });
    }

    const ownerId = view.snapshot.ex?.h ?? null;
    drawFighters(view, {
      radius: 26,
      crownHolderId: ownerId,
      underlay: (fighter) => {
        if (fighter.id !== ownerId) return;
        const { ctx } = view;
        ctx.save();
        ctx.globalAlpha = 0.3 + Math.sin(view.t * 5) * 0.12;
        ctx.fillStyle = '#FFC93C';
        ctx.beginPath();
        ctx.ellipse(fighter.x, fighter.y + 22, 42, 15, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      },
    });
    drawVignette(view, 0.24);
  };
}

// ---------------------------------------------------------------------------
// PAREDE!
// ---------------------------------------------------------------------------

export function createParedeRenderer(): GameRenderer {
  return (view) => {
    drawKitArena(view);
    for (const bar of itemsOf(view, 1)) drawWallBar(view.ctx, bar, view.theme, true);
    drawFighters(view, { radius: 26 });
    // as paredes passam POR CIMA dos personagens: reforça que elas machucam
    for (const bar of itemsOf(view, 0)) drawWallBar(view.ctx, bar, view.theme, false);
    lifeOverlay(view, 3);
    invulnOverlay(view);
    drawVignette(view, 0.26);
  };
}

// ---------------------------------------------------------------------------
// GOL!
// ---------------------------------------------------------------------------

export function createGolRenderer(): GameRenderer {
  return (view) => {
    drawKitArena(view);
    const { ctx } = view;

    // linha central, só para dar cara de campo
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = view.theme.ink;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(ARENA_CENTER.x, ARENA_CENTER.y, 96, 0, TAU);
    ctx.stroke();
    ctx.restore();

    for (const goal of itemsOf(view, 1)) {
      drawGoalMouth(ctx, goal.x, goal.y, goal.r, goal.o ?? 0, goal.v ?? 1, view.t);
    }

    drawFighters(view, { radius: 26 });

    const ball = itemsOf(view, 0)[0];
    if (ball) drawBall(ctx, ball.x, ball.y, ball.r, view.t, ball.v ?? 0);

    lifeOverlay(view, 3);
    invulnOverlay(view);
    drawVignette(view, 0.22);
  };
}

// ---------------------------------------------------------------------------
// CORRIDA!
// ---------------------------------------------------------------------------

export function createCorridaRenderer(): GameRenderer {
  return (view) => {
    drawKitArena(view, { grid: true });
    const ring = itemsOf(view, 0)[0];
    if (ring) {
      // seta apontando o anel a partir do jogador local
      const self = view.fighters.find((fighter) => fighter.id === view.selfId);
      if (self) {
        const dx = ring.x - self.x;
        const dy = ring.y - self.y;
        const distance = Math.hypot(dx, dy);
        if (distance > 220) {
          const { ctx } = view;
          const angle = Math.atan2(dy, dx);
          ctx.save();
          ctx.globalAlpha = 0.6;
          ctx.translate(self.x + Math.cos(angle) * 70, self.y + Math.sin(angle) * 70);
          ctx.rotate(angle);
          ctx.fillStyle = view.theme.accent;
          ctx.beginPath();
          ctx.moveTo(18, 0);
          ctx.lineTo(-10, -12);
          ctx.lineTo(-10, 12);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      }
      drawTargetRing(view.ctx, ring.x, ring.y, ring.r, view.t, ring.v ?? 1, view.theme.accent);
    }
    drawFighters(view, { radius: 26 });
    drawVignette(view, 0.2);
  };
}

// ---------------------------------------------------------------------------
// CORES!
// ---------------------------------------------------------------------------

const CORES_PALETTE = ['#FF4D5E', '#3FC6FF', '#FFC93C', '#2BD9A8', '#8F66FF', '#FF7A59'];

export function createCoresRenderer(): GameRenderer {
  return (view) => {
    const { ctx, t } = view;
    const numbers = view.snapshot.ex?.n ?? [];
    const called = numbers[0] ?? 0;
    const timeLeft = numbers[1] ?? 0;
    const roundTime = numbers[2] ?? 1;
    const resolving = (numbers[3] ?? 0) > 0.5;

    drawKitArena(view);

    for (const block of itemsOf(view)) {
      const w = block.w ?? 0;
      const h = block.h ?? 0;
      const isCalled = (block.v ?? 0) > 0.5;
      ctx.save();
      ctx.translate(block.x, block.y);
      ctx.beginPath();
      ctx.roundRect(-w / 2 + 6, -h / 2 + 6, w - 12, h - 12, 26);
      ctx.fillStyle = CORES_PALETTE[block.k % CORES_PALETTE.length];
      ctx.globalAlpha = isCalled ? 1 : resolving ? 0.35 : 0.82;
      ctx.fill();

      if (isCalled) {
        ctx.globalAlpha = 0.5 + Math.abs(Math.sin(t * 7)) * 0.5;
        ctx.lineWidth = 10;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
      }
      ctx.restore();
    }

    drawFighters(view, { radius: 26 });
    lifeOverlay(view, 3);
    invulnOverlay(view);

    // cronômetro da chamada, grande e no meio
    const urgency = clamp01(1 - timeLeft / Math.max(0.001, roundTime));
    drawBigText(view, CORES_NAMES[called] ?? '', ARENA.y - 4, {
      size: 58 + urgency * 22,
      color: CORES_PALETTE[called % CORES_PALETTE.length],
      alpha: resolving ? 0.4 : 1,
    });
    if (!resolving) {
      drawBigText(view, timeLeft.toFixed(1), WORLD.h - 26, {
        size: 44,
        color: urgency > 0.7 ? '#FF4D5E' : '#ffffff',
      });
    }
    drawVignette(view, 0.2);
  };
}

// ---------------------------------------------------------------------------
// RAIO!
// ---------------------------------------------------------------------------

export function createRaioRenderer(): GameRenderer {
  return (view) => {
    drawKitArena(view);
    const { ctx } = view;

    // eixo central de onde saem os feixes
    ctx.save();
    ctx.globalAlpha = 0.9;
    const core = ctx.createRadialGradient(
      ARENA_CENTER.x,
      ARENA_CENTER.y,
      4,
      ARENA_CENTER.x,
      ARENA_CENTER.y,
      46,
    );
    core.addColorStop(0, '#ffffff');
    core.addColorStop(1, 'rgba(143,102,255,0)');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(ARENA_CENTER.x, ARENA_CENTER.y, 46, 0, TAU);
    ctx.fill();
    ctx.restore();

    drawFighters(view, { radius: 26 });

    for (const beam of itemsOf(view)) {
      drawBeam(
        ctx,
        beam.x,
        beam.y,
        beam.a ?? 0,
        beam.w ?? 600,
        beam.h ?? 30,
        beam.k === 1 ? 1 : 0,
        view.t,
      );
    }

    lifeOverlay(view, 3);
    invulnOverlay(view);
    drawVignette(view, 0.3);
  };
}

// ---------------------------------------------------------------------------
// MINA!
// ---------------------------------------------------------------------------

export function createMinaRenderer(): GameRenderer {
  let cells = new Uint8Array(MINA_TOTAL);
  return (view) => {
    const { ctx, t } = view;
    drawKitArena(view);
    const grid = view.snapshot.ex?.grid;
    if (grid) cells = rleDecode(grid, MINA_TOTAL);
    const size = minaCellSize();

    for (let index = 0; index < MINA_TOTAL; index += 1) {
      const state = cells[index];
      const center = minaCellCenter(index);
      const w = size.w - 6;
      const h = size.h - 6;

      ctx.save();
      ctx.translate(center.x, center.y);
      ctx.beginPath();
      ctx.roundRect(-w / 2, -h / 2, w, h, 12);

      if (state === 0) {
        // bloco fechado: relevo para parecer "clicável"
        const closed = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
        closed.addColorStop(0, '#FFE8BF');
        closed.addColorStop(1, '#E8B978');
        ctx.fillStyle = closed;
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(107,61,0,0.35)';
        ctx.stroke();
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.roundRect(-w / 2 + 5, -h / 2 + 4, w - 10, h * 0.3, 8);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      } else if (state === 6) {
        // cratera
        ctx.fillStyle = '#3B1B0B';
        ctx.fill();
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#EE5533';
        ctx.stroke();
        ctx.globalAlpha = 0.6 + Math.sin(t * 4 + index) * 0.2;
        ctx.beginPath();
        ctx.arc(0, 0, Math.min(w, h) * 0.2, 0, TAU);
        ctx.fillStyle = '#FF7A59';
        ctx.fill();
      } else {
        const palette = paletteForSlot(state - 1);
        ctx.fillStyle = palette.base;
        ctx.globalAlpha = 0.85;
        ctx.fill();
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 2;
        ctx.strokeStyle = palette.shade;
        ctx.stroke();
      }
      ctx.restore();
    }

    view.fx.drawBehind(ctx);
    drawFighters(view, { radius: 26 });
    for (const blast of itemsOf(view, 0)) {
      drawBlastRing(ctx, blast.x, blast.y, blast.r, blast.v ?? 0);
    }
    lifeOverlay(view, 3);
    invulnOverlay(view);
    drawVignette(view, 0.24);
  };
}

// ---------------------------------------------------------------------------
// RASTRO!
// ---------------------------------------------------------------------------

interface TrailDot {
  x: number;
  y: number;
  r: number;
  slot: number;
  age: number;
  big: boolean;
}

export function createRastroRenderer(): GameRenderer {
  // o servidor manda apenas os pontos NOVOS de cada snapshot; o desenho do
  // rastro completo é responsabilidade do cliente
  const dots: TrailDot[] = [];
  let lastSeq = -1;

  return (view) => {
    const { ctx, t } = view;
    const ex = view.snapshot.ex;
    const life = ex?.n?.[0] ?? 4.2;
    const harden = ex?.n?.[1] ?? 0.55;

    if (ex && view.snapshot.seq !== lastSeq) {
      lastSeq = view.snapshot.seq;
      for (const point of ex.items ?? []) {
        if (point.k !== 2) continue;
        dots.push({
          x: point.x,
          y: point.y,
          r: point.r,
          slot: point.o ?? 0,
          age: 0,
          big: (point.v ?? 0) > 0.5,
        });
      }
    }

    for (let i = dots.length - 1; i >= 0; i -= 1) {
      dots[i].age += view.dt;
      if (dots[i].age > life) dots.splice(i, 1);
    }

    drawKitArena(view, { grid: true });

    // rastro macio (ainda não machuca) e rastro endurecido
    for (const dot of dots) {
      const palette = paletteForSlot(dot.slot);
      const hardened = dot.age >= harden;
      const fade = clamp01(1 - dot.age / life);
      ctx.save();
      ctx.globalAlpha = hardened ? 0.35 + fade * 0.5 : 0.22;
      ctx.fillStyle = hardened ? palette.base : palette.light;
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, dot.r * (hardened ? 1 : 0.7), 0, TAU);
      ctx.fill();
      if (hardened) {
        ctx.globalAlpha = 0.3 * fade;
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
      }
      ctx.restore();
    }

    drawFighters(view, { radius: 25 });
    lifeOverlay(view, 4);
    invulnOverlay(view);
    drawVignette(view, 0.28);
    void t;
  };
}

// ---------------------------------------------------------------------------
// METEORO!
// ---------------------------------------------------------------------------

export function createMeteoroRenderer(): GameRenderer {
  return (view) => {
    drawKitArena(view);
    const { ctx } = view;

    for (const shadow of itemsOf(view, 0)) {
      drawMeteorShadow(ctx, shadow.x, shadow.y, shadow.r, shadow.v ?? 0, (shadow.o ?? 0) > 0.5);
    }

    drawFighters(view, { radius: 26 });

    for (const blast of itemsOf(view, 1)) {
      drawBlastRing(ctx, blast.x, blast.y, blast.r, blast.v ?? 0);
    }

    lifeOverlay(view, 3);
    invulnOverlay(view);
    drawVignette(view, 0.3);
  };
}
