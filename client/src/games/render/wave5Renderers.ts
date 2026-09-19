import {
  ARENA,
  ARENA_CENTER,
  GROUP_RANGE,
  WORLD,
  bolhaRadius,
  clamp01,
  paletteForSlot,
} from '@shared/index';
import { drawBigText, drawCircleArena, drawFighters, drawVignette } from './common';
import { drawCreature } from './creature';
import {
  drawInvulnOverlay,
  drawKitArena,
  drawLifeOverlay,
  drawStarPickup,
  itemsOf,
} from './primitives';
import type { GameRenderer, PlayerMeta, RenderView } from './types';

/**
 * Renderers da quinta leva: BOLHA!, ÍMÃ!, ESPELHO!, DOIS!, CAÇA!.
 *
 * Os cinco compartilham a mesma ideia de leitura: o estado importante do jogo
 * mora EM VOLTA do personagem (bolha, polo, reflexo, laço do grupo, temperatura),
 * então o desenho é quase todo feito como camada sob e sobre a criatura.
 */

const TAU = Math.PI * 2;

/** Valores por jogador vindos de `ex.n` (ordem do snapshot, com deslocamento). */
function perPlayer(view: RenderView, offset = 0): Map<string, number> {
  const out = new Map<string, number>();
  const numbers = view.snapshot.ex?.n ?? [];
  view.snapshot.ps.forEach((fighter, index) => {
    out.set(fighter.i, numbers[offset + index] ?? 0);
  });
  return out;
}

// ---------------------------------------------------------------------------
// BOLHA!
// ---------------------------------------------------------------------------

export function createBolhaRenderer(): GameRenderer {
  return (view) => {
    const { ctx, t } = view;
    const fill = perPlayer(view);

    drawKitArena(view, { grid: true });
    view.fx.drawBehind(ctx);

    drawFighters(view, {
      radius: 26,
      underlay: (fighter) => {
        const air = fill.get(fighter.id) ?? 0;
        if (air <= 0.02) return;
        // sombra da bolha no chão: mostra o tamanho sem tampar o personagem
        ctx.save();
        ctx.globalAlpha = 0.16 + air * 0.16;
        ctx.fillStyle = '#123C7E';
        ctx.beginPath();
        ctx.ellipse(fighter.x, fighter.y + 26, bolhaRadius(air) * 0.9, bolhaRadius(air) * 0.3, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      },
    });

    // as bolhas vão por cima de todo mundo: é o que importa na tela
    for (const fighter of view.fighters) {
      if (!fighter.alive) continue;
      const air = fill.get(fighter.id) ?? 0;
      if (air <= 0.02) continue;
      const meta = view.meta.get(fighter.id);
      const radius = bolhaRadius(air);
      const wobble = 1 + Math.sin(t * 5 + fighter.x * 0.02) * 0.035 * air;
      const ready = air > 0.82;

      ctx.save();
      ctx.translate(fighter.x, fighter.y);
      ctx.scale(wobble, 1 / wobble);

      const skin = ctx.createRadialGradient(-radius * 0.3, -radius * 0.35, radius * 0.1, 0, 0, radius);
      skin.addColorStop(0, 'rgba(255,255,255,0.55)');
      skin.addColorStop(0.55, `rgba(63,198,255,${0.1 + air * 0.16})`);
      skin.addColorStop(1, `rgba(143,102,255,${0.16 + air * 0.24})`);
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, TAU);
      ctx.fill();

      ctx.lineWidth = ready ? 5 : 3;
      ctx.strokeStyle = ready
        ? `rgba(255,227,140,${0.6 + Math.sin(t * 12) * 0.3})`
        : `rgba(255,255,255,${0.35 + air * 0.35})`;
      ctx.stroke();

      // brilho e reflexo: é o que faz parecer bolha e não círculo
      ctx.globalAlpha = 0.65;
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.ellipse(-radius * 0.34, -radius * 0.42, radius * 0.2, radius * 0.11, -0.7, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.arc(radius * 0.42, radius * 0.3, radius * 0.08, 0, TAU);
      ctx.fill();
      ctx.restore();

      // quase estourando: aviso para quem está de fora também
      if (ready) {
        ctx.save();
        ctx.globalAlpha = 0.5 + Math.sin(t * 14) * 0.3;
        ctx.font = '800 15px "Baloo 2", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(30,20,64,0.8)';
        ctx.strokeText('QUASE!', fighter.x, fighter.y - radius - 12);
        ctx.fillStyle = meta?.palette.light ?? '#FFFFFF';
        ctx.fillText('QUASE!', fighter.x, fighter.y - radius - 12);
        ctx.restore();
      }
    }

    drawVignette(view, 0.22);
  };
}

// ---------------------------------------------------------------------------
// ÍMÃ!
// ---------------------------------------------------------------------------

const POLE_PLUS = '#FF7A59';
const POLE_MINUS = '#3FC6FF';

export function createImaRenderer(): GameRenderer {
  return (view) => {
    const { ctx, t } = view;
    const arena = itemsOf(view, 0)[0];
    const radius = arena?.r ?? 330;
    const cx = arena?.x ?? WORLD.w / 2;
    const cy = arena?.y ?? WORLD.h / 2;
    // n[0] é o aviso de troca; as polaridades começam em n[1]
    const warn = view.snapshot.ex?.n?.[0] ?? 0;
    const pole = perPlayer(view, 1);

    drawCircleArena(view, cx, cy, radius, {
      danger: warn > 0 ? 1 : (arena?.v ?? 0) > 0.7 ? 1 : 0,
      rotation: t * 0.1,
    });

    // linhas de campo entre os pares: atração puxa, repulsão risca
    ctx.save();
    for (let i = 0; i < view.fighters.length; i += 1) {
      for (let j = i + 1; j < view.fighters.length; j += 1) {
        const a = view.fighters[i];
        const b = view.fighters[j];
        if (!a.alive || !b.alive) continue;
        const distance = Math.hypot(b.x - a.x, b.y - a.y);
        if (distance > 340) continue;
        const same = (pole.get(a.id) ?? 1) === (pole.get(b.id) ?? 1);
        const strength = clamp01(1 - distance / 340);
        ctx.globalAlpha = strength * 0.5;
        ctx.lineWidth = 2 + strength * 4;
        ctx.strokeStyle = same ? POLE_PLUS : POLE_MINUS;
        ctx.setLineDash(same ? [6, 10] : [16, 8]);
        ctx.lineDashOffset = same ? t * 70 : -t * 70;
        ctx.beginPath();
        if (same) {
          // repulsão: linha empurrada para fora no meio
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          const nx = -(b.y - a.y) / (distance || 1);
          const ny = (b.x - a.x) / (distance || 1);
          const bulge = 26 * strength;
          ctx.moveTo(a.x, a.y);
          ctx.quadraticCurveTo(mx + nx * bulge, my + ny * bulge, b.x, b.y);
        } else {
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
        }
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
    ctx.restore();

    view.fx.drawBehind(ctx);

    drawFighters(view, {
      radius: 26,
      dangerFor: (fighter) =>
        clamp01((Math.hypot(fighter.x - cx, fighter.y - cy) - (radius - 110)) / 110),
      underlay: (fighter) => {
        const sign = pole.get(fighter.id) ?? 1;
        ctx.save();
        const glow = ctx.createRadialGradient(fighter.x, fighter.y, 6, fighter.x, fighter.y, 52);
        glow.addColorStop(0, sign > 0 ? 'rgba(255,122,89,0.45)' : 'rgba(63,198,255,0.45)');
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(fighter.x, fighter.y, 52, 0, TAU);
        ctx.fill();
        ctx.restore();
      },
    });

    // crachá de polaridade
    for (const fighter of view.fighters) {
      if (!fighter.alive) continue;
      const sign = pole.get(fighter.id) ?? 1;
      const x = fighter.x + 26;
      const y = fighter.y - 30;
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, 13, 0, TAU);
      ctx.fillStyle = sign > 0 ? POLE_PLUS : POLE_MINUS;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#FFFFFF';
      ctx.stroke();
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.moveTo(x - 6, y);
      ctx.lineTo(x + 6, y);
      if (sign > 0) {
        ctx.moveTo(x, y - 6);
        ctx.lineTo(x, y + 6);
      }
      ctx.stroke();
      ctx.restore();
    }

    if (warn > 0) {
      drawBigText(view, 'TROCA!', ARENA.y + 30, {
        size: 52 + warn * 20,
        color: '#FFC93C',
        alpha: 0.5 + warn * 0.5,
      });
    }

    drawVignette(view, 0.28);
  };
}

// ---------------------------------------------------------------------------
// ESPELHO!
// ---------------------------------------------------------------------------

export function createEspelhoRenderer(): GameRenderer {
  return (view) => {
    const { ctx, t } = view;
    const axisItem = itemsOf(view, 1)[0];
    const axis = axisItem?.x ?? ARENA_CENTER.x;

    drawKitArena(view, { grid: true });

    // o espelho: faixa de vidro com brilho correndo
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(ARENA.x + 11, ARENA.y + 11, ARENA.w - 22, ARENA.h - 22, 36);
    ctx.clip();
    const glass = ctx.createLinearGradient(axis - 26, 0, axis + 26, 0);
    glass.addColorStop(0, 'rgba(143,226,245,0)');
    glass.addColorStop(0.5, 'rgba(255,255,255,0.75)');
    glass.addColorStop(1, 'rgba(143,226,245,0)');
    ctx.fillStyle = glass;
    ctx.fillRect(axis - 26, ARENA.y, 52, ARENA.h);

    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#8FE3F5';
    ctx.beginPath();
    ctx.moveTo(axis, ARENA.y + 14);
    ctx.lineTo(axis, ARENA.y + ARENA.h - 14);
    ctx.stroke();

    // faíscas descendo pelo vidro
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#FFFFFF';
    for (let i = 0; i < 5; i += 1) {
      const y = ARENA.y + ((t * 90 + i * 150) % ARENA.h);
      ctx.beginPath();
      ctx.ellipse(axis, y, 4, 22, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    for (const star of itemsOf(view, 0)) {
      drawStarPickup(ctx, star.x, star.y, star.r, t, false, star.v ?? 1);
    }

    // reflexos: a mesma criatura, translúcida e espelhada
    const bySlot = new Map<number, PlayerMeta>();
    for (const meta of view.meta.values()) bySlot.set(meta.slot, meta);

    for (const twin of itemsOf(view, 2)) {
      const meta = bySlot.get(twin.o ?? -1);
      if (!meta) continue;
      ctx.save();
      ctx.globalAlpha = 0.5;
      // espelhado de verdade: escala -1 no eixo X
      ctx.translate(twin.x, twin.y);
      ctx.scale(-1, 1);
      drawCreature(ctx, {
        type: meta.avatar,
        palette: meta.palette,
        x: 0,
        y: 0,
        r: twin.r || 26,
        t,
        vx: 0,
        vy: 0,
        squash: 0,
        expression: 'idle',
        flash: 0,
        alpha: 0.6,
        shadow: false,
        phase: meta.slot * 1.9,
        glow: 'rgba(143,226,245,0.5)',
        glowSize: 1,
      });
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.setLineDash([8, 8]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = meta.palette.base;
      ctx.beginPath();
      ctx.arc(twin.x, twin.y, (twin.r || 26) * 1.25, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    view.fx.drawBehind(ctx);
    drawFighters(view, { radius: 26 });
    drawVignette(view, 0.22);
  };
}

// ---------------------------------------------------------------------------
// DOIS!
// ---------------------------------------------------------------------------

export function createDoisRenderer(): GameRenderer {
  return (view) => {
    const { ctx, t } = view;
    const numbers = view.snapshot.ex?.n ?? [];
    const called = Math.round(numbers[0] ?? 2);
    const timer = numbers[1] ?? 0;
    const resolving = (numbers[2] ?? 0) > 0.5;
    const groups = perPlayer(view, 3);

    drawKitArena(view, { grid: true });

    // o número chamado, gigante, no chão da arena
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.font = '800 300px "Baloo 2", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = view.theme.ink;
    ctx.fillText(called === 1 ? '1' : `${called}`, ARENA_CENTER.x, ARENA_CENTER.y + 10);
    ctx.restore();

    // laço entre quem está junto
    ctx.save();
    for (let i = 0; i < view.fighters.length; i += 1) {
      for (let j = i + 1; j < view.fighters.length; j += 1) {
        const a = view.fighters[i];
        const b = view.fighters[j];
        if (!a.alive || !b.alive) continue;
        const distance = Math.hypot(b.x - a.x, b.y - a.y);
        if (distance > GROUP_RANGE) continue;
        const sizeA = groups.get(a.id) ?? 1;
        const ok = sizeA === called;
        ctx.globalAlpha = 0.75;
        ctx.lineWidth = 7;
        ctx.strokeStyle = ok ? '#2BD9A8' : '#FF4D5E';
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
    ctx.restore();

    view.fx.drawBehind(ctx);

    drawFighters(view, {
      radius: 26,
      underlay: (fighter) => {
        const size = groups.get(fighter.id) ?? 1;
        const ok = size === called;
        ctx.save();
        ctx.globalAlpha = resolving ? 0.9 : 0.5 + Math.sin(t * 5) * 0.12;
        ctx.lineWidth = 6;
        ctx.strokeStyle = ok ? '#2BD9A8' : '#FF4D5E';
        ctx.beginPath();
        ctx.arc(fighter.x, fighter.y, 40, 0, TAU);
        ctx.stroke();
        // quantas pessoas o jogo conta no seu grupo agora
        ctx.globalAlpha = 0.95;
        ctx.font = '800 17px "Baloo 2", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(30,20,64,0.75)';
        ctx.strokeText(`${size}`, fighter.x - 32, fighter.y + 28);
        ctx.fillStyle = ok ? '#2BD9A8' : '#FF4D5E';
        ctx.fillText(`${size}`, fighter.x - 32, fighter.y + 28);
        ctx.restore();
      },
    });

    drawLifeOverlay(view, 3);
    drawInvulnOverlay(view);

    if (!resolving) {
      drawBigText(view, timer.toFixed(1), WORLD.h - 28, {
        size: 42,
        color: timer < 1.2 ? '#FF4D5E' : '#FFFFFF',
      });
    }

    drawVignette(view, 0.24);
  };
}

// ---------------------------------------------------------------------------
// CAÇA!
// ---------------------------------------------------------------------------

/** Azul (frio) → vermelho (fervendo). */
function heatColor(heat: number): string {
  if (heat > 0.86) return '#FF2E4C';
  if (heat > 0.68) return '#FF7A59';
  if (heat > 0.5) return '#FFC93C';
  if (heat > 0.3) return '#8FE3A0';
  return '#3FC6FF';
}

function heatWord(heat: number): string {
  if (heat > 0.86) return 'FERVENDO!';
  if (heat > 0.68) return 'QUENTE';
  if (heat > 0.5) return 'MORNO';
  if (heat > 0.3) return 'FRIO';
  return 'CONGELANDO';
}

export function createCacaRenderer(): GameRenderer {
  return (view) => {
    const { ctx, t } = view;
    const heat = perPlayer(view);

    drawKitArena(view, { grid: true });

    // terra batida: manchas fixas para dar textura de lugar onde se cava
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(ARENA.x + 11, ARENA.y + 11, ARENA.w - 22, ARENA.h - 22, 36);
    ctx.clip();
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = '#6B2410';
    for (let i = 0; i < 26; i += 1) {
      const x = ARENA.x + ((i * 197) % ARENA.w);
      const y = ARENA.y + ((i * 331) % ARENA.h);
      ctx.beginPath();
      ctx.ellipse(x, y, 40 + (i % 4) * 16, 22 + (i % 3) * 10, i, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    view.fx.drawBehind(ctx);

    drawFighters(view, {
      radius: 26,
      underlay: (fighter) => {
        const value = heat.get(fighter.id) ?? 0;
        const color = heatColor(value);
        ctx.save();
        // anel de temperatura: grosso e aceso quando está perto
        ctx.globalAlpha = 0.28 + value * 0.45;
        const glow = ctx.createRadialGradient(fighter.x, fighter.y, 8, fighter.x, fighter.y, 60);
        glow.addColorStop(0, color);
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(fighter.x, fighter.y, 60, 0, TAU);
        ctx.fill();

        ctx.globalAlpha = 0.9;
        ctx.lineWidth = 4 + value * 5;
        ctx.strokeStyle = color;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(fighter.x, fighter.y, 42, -Math.PI / 2, -Math.PI / 2 + Math.max(0.12, value) * TAU);
        ctx.stroke();
        ctx.globalAlpha = 0.25;
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(fighter.x, fighter.y, 42, 0, TAU);
        ctx.stroke();
        ctx.restore();
      },
    });

    // termômetro do jogador local
    const self = view.fighters.find((fighter) => fighter.id === view.selfId);
    if (self) {
      const value = heat.get(self.id) ?? 0;
      const color = heatColor(value);
      const w = 240;
      const x = ARENA_CENTER.x - w / 2;
      const y = ARENA.y + 30;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, y, w, 16, 8);
      ctx.fillStyle = 'rgba(20,10,45,0.45)';
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(x, y, Math.max(6, w * value), 16, 8);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.font = '800 19px "Baloo 2", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(30,20,64,0.8)';
      ctx.globalAlpha = value > 0.86 ? 0.7 + Math.sin(t * 12) * 0.3 : 1;
      ctx.strokeText(heatWord(value), x + w / 2, y + 36);
      ctx.fillStyle = color;
      ctx.fillText(heatWord(value), x + w / 2, y + 36);
      ctx.restore();
    }

    drawVignette(view, 0.26);
  };
}
