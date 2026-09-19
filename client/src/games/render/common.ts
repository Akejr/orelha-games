import { WORLD, clamp01, type Expression } from '@shared/index';
import type { FighterView } from '@/multiplayer/snapshotBuffer';
import { drawCreature } from './creature';
import { createFighterFx, type FighterFx, type PlayerMeta, type RenderView } from './types';

const TAU = Math.PI * 2;
export const DEATH_ANIM = 0.95;

// ---------------------------------------------------------------------------
// Cenário
// ---------------------------------------------------------------------------

/** Fundo do mundo com "céu" da cor do jogo e formas em parallax leve. */
export function drawBackdrop(view: RenderView, drift = 1): void {
  const { ctx, theme, t } = view;
  const gradient = ctx.createLinearGradient(0, -80, 0, WORLD.h + 80);
  gradient.addColorStop(0, theme.backdrop);
  gradient.addColorStop(1, theme.backdropDeep);
  ctx.fillStyle = gradient;
  ctx.fillRect(-200, -200, WORLD.w + 400, WORLD.h + 400);

  ctx.save();
  ctx.globalAlpha = 0.09;
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 7; i += 1) {
    const seed = i * 137.5;
    const x = ((seed * 3.1 + t * 9 * drift) % (WORLD.w + 300)) - 150;
    const y = 60 + ((seed * 1.7) % (WORLD.h - 120));
    const r = 40 + (i % 3) * 26;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.62, 0, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  // brilho suave no topo
  ctx.save();
  const glow = ctx.createRadialGradient(WORLD.w / 2, -120, 40, WORLD.w / 2, -120, WORLD.h);
  glow.addColorStop(0, 'rgba(255,255,255,0.22)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(-200, -200, WORLD.w + 400, WORLD.h + 400);
  ctx.restore();
}

export function drawCircleArena(
  view: RenderView,
  cx: number,
  cy: number,
  radius: number,
  options: { danger?: number; rotation?: number } = {},
): void {
  const { ctx, theme, t } = view;
  const danger = options.danger ?? 0;

  // "pilar" embaixo da plataforma
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = '#150B32';
  ctx.beginPath();
  ctx.ellipse(cx, cy + radius * 0.36, radius * 0.94, radius * 0.34, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  // borda grossa
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, TAU);
  ctx.fillStyle = theme.arenaEdge;
  ctx.fill();

  // piso
  const floor = ctx.createRadialGradient(cx - radius * 0.3, cy - radius * 0.4, radius * 0.2, cx, cy, radius);
  floor.addColorStop(0, '#ffffff');
  floor.addColorStop(0.6, theme.arena);
  floor.addColorStop(1, theme.arena);
  ctx.beginPath();
  ctx.arc(cx, cy, radius - Math.max(6, radius * 0.045), 0, TAU);
  ctx.fillStyle = floor;
  ctx.fill();

  // anéis decorativos girando junto com a arena
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(options.rotation ?? 0);
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = theme.arenaEdge;
  ctx.lineWidth = 3;
  for (const factor of [0.42, 0.72]) {
    ctx.beginPath();
    ctx.arc(0, 0, radius * factor, 0, TAU);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.35;
  ctx.setLineDash([14, 18]);
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.9, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // aviso de encolhimento
  if (danger > 0) {
    ctx.save();
    const pulse = 0.35 + Math.sin(t * 6) * 0.22;
    ctx.globalAlpha = clamp01(danger) * pulse;
    ctx.strokeStyle = '#FF5CA3';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(cx, cy, radius - 5, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
}

export function drawRectArena(
  view: RenderView,
  x: number,
  y: number,
  w: number,
  h: number,
  radius = 46,
): void {
  const { ctx, theme } = view;
  ctx.save();
  ctx.globalAlpha = 0.24;
  ctx.fillStyle = '#150B32';
  ctx.beginPath();
  ctx.roundRect(x + 8, y + 16, w, h, radius);
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fillStyle = theme.arenaEdge;
  ctx.fill();

  ctx.beginPath();
  ctx.roundRect(x + 9, y + 9, w - 18, h - 18, radius - 8);
  const floor = ctx.createLinearGradient(x, y, x + w, y + h);
  floor.addColorStop(0, '#ffffff');
  floor.addColorStop(0.55, theme.arena);
  floor.addColorStop(1, theme.arena);
  ctx.fillStyle = floor;
  ctx.fill();
}

export function drawVignette(view: RenderView, strength = 0.3): void {
  const { ctx } = view;
  ctx.save();
  const gradient = ctx.createRadialGradient(
    WORLD.w / 2,
    WORLD.h / 2,
    WORLD.h * 0.34,
    WORLD.w / 2,
    WORLD.h / 2,
    WORLD.h * 0.95,
  );
  gradient.addColorStop(0, 'rgba(0,0,0,0)');
  gradient.addColorStop(1, `rgba(20,8,50,${strength})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(-200, -200, WORLD.w + 400, WORLD.h + 400);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Personagens
// ---------------------------------------------------------------------------

export function fxFor(view: RenderView, id: string): FighterFx {
  let fx = view.local.get(id);
  if (!fx) {
    fx = createFighterFx();
    view.local.set(id, fx);
  }
  return fx;
}

/**
 * Deriva squash & stretch, piscadas e expressões a partir do snapshot. O
 * servidor manda o mínimo (flash, stagger, dash) e o cliente transforma isso em
 * personagem vivo.
 */
export function updateFighterFx(
  view: RenderView,
  fighter: FighterView,
  hints: { crown?: boolean; bomb?: boolean; danger?: number } = {},
): FighterFx {
  const fx = fxFor(view, fighter.id);
  const { dt, t } = view;

  // impacto: flash subiu => achata
  if (fighter.flash > fx.lastFlash + 0.12) {
    fx.squash = -0.75;
    fx.expression = 'dizzy';
    fx.expressionUntil = t + 0.55;
  }
  fx.lastFlash = fighter.flash;

  // início do dash => estica
  if (fighter.dashing && !fx.wasDashing) {
    fx.squash = 0.6;
  }
  fx.wasDashing = fighter.dashing;

  if (fx.wasAlive && !fighter.alive) {
    fx.deadAt = t;
    fx.expression = 'dizzy';
    fx.expressionUntil = t + 4;
  }
  if (!fx.wasAlive && fighter.alive) {
    fx.deadAt = null;
  }
  fx.wasAlive = fighter.alive;

  fx.squash += (0 - fx.squash) * Math.min(1, dt * 8);

  if (t > fx.expressionUntil) {
    if (!fighter.alive) fx.expression = 'dizzy';
    else if (view.winnerId === fighter.id) fx.expression = 'cheer';
    else if (hints.bomb) fx.expression = 'scared';
    else if (fighter.dashing) fx.expression = 'angry';
    else if (hints.crown) fx.expression = 'happy';
    else if ((hints.danger ?? 0) > 0.8) fx.expression = 'scared';
    else fx.expression = 'idle';
  }

  fx.emphasis += ((hints.crown || hints.bomb ? 1 : 0) - fx.emphasis) * Math.min(1, dt * 6);
  return fx;
}

export interface DrawFightersOptions {
  /** raio do personagem em unidades de mundo */
  radius?: number;
  crownHolderId?: string | null;
  bombHolderId?: string | null;
  /** BOMB! pode ter duas bombas em jogo ao mesmo tempo */
  bombHolders?: (string | null)[];
  /** 0..1, quanto o personagem está em perigo (usado na expressão) */
  dangerFor?: (fighter: FighterView) => number;
  /** desenhado logo antes do personagem (marcas no chão) */
  underlay?: (fighter: FighterView, meta: PlayerMeta) => void;
  labels?: boolean;
  /** anel de pancada acumulada (PUSH!) */
  showStagger?: boolean;
}

export function drawFighters(view: RenderView, options: DrawFightersOptions = {}): void {
  const { ctx, t } = view;
  const radius = options.radius ?? 26;
  const labels = options.labels ?? true;

  // ordena por Y para dar sensação de profundidade
  const ordered = view.fighters.slice().sort((a, b) => a.y - b.y);

  for (const fighter of ordered) {
    const meta = view.meta.get(fighter.id);
    if (!meta) continue;
    const isCrown = options.crownHolderId === fighter.id;
    const isBomb =
      options.bombHolderId === fighter.id ||
      (options.bombHolders?.includes(fighter.id) ?? false);
    const danger = options.dangerFor?.(fighter) ?? 0;
    const fx = updateFighterFx(view, fighter, { crown: isCrown, bomb: isBomb, danger });

    const dying = fx.deadAt !== null;
    const deadFor = dying ? t - (fx.deadAt as number) : 0;
    if (dying && deadFor > DEATH_ANIM) continue;

    const fall = dying ? clamp01(deadFor / DEATH_ANIM) : 0;
    const alpha = dying ? 1 - fall * 0.95 : 1;
    const scale = dying ? 1 - fall * 0.55 : 1;
    const y = fighter.y + (dying ? fall * fall * 220 : 0);
    const spin = dying ? fall * 3.4 : 0;

    options.underlay?.(fighter, meta);

    // rastro de dash
    if (fighter.dashing && !dying) {
      const speed = Math.hypot(fighter.vx, fighter.vy);
      if (speed > 60) {
        const nx = fighter.vx / speed;
        const ny = fighter.vy / speed;
        const length = Math.min(96, radius + speed * 0.09);
        const gradient = ctx.createLinearGradient(
          fighter.x,
          fighter.y,
          fighter.x - nx * length,
          fighter.y - ny * length,
        );
        gradient.addColorStop(0, meta.palette.trail);
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.save();
        ctx.strokeStyle = gradient;
        ctx.lineWidth = radius * 1.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(fighter.x, fighter.y);
        ctx.lineTo(fighter.x - nx * length, fighter.y - ny * length);
        ctx.stroke();
        ctx.restore();
      }
    }

    // marcador do próprio jogador
    if (meta.isSelf && !dying) {
      ctx.save();
      ctx.globalAlpha = 0.55 + Math.sin(t * 4) * 0.16;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.ellipse(fighter.x, fighter.y + radius * 0.92, radius * 1.05, radius * 0.38, 0, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    // anel de pancada acumulada
    if (options.showStagger && fighter.stagger > 0.04 && !dying) {
      ctx.save();
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.arc(fighter.x, fighter.y, radius * 1.32, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = fighter.stagger > 0.66 ? '#FF4D4D' : fighter.stagger > 0.33 ? '#FFC93C' : '#FFFFFF';
      ctx.beginPath();
      ctx.arc(
        fighter.x,
        fighter.y,
        radius * 1.32,
        -Math.PI / 2,
        -Math.PI / 2 + clamp01(fighter.stagger) * TAU,
      );
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    if (dying) {
      ctx.translate(fighter.x, y);
      ctx.rotate(spin);
      ctx.translate(-fighter.x, -y);
    }
    drawCreature(ctx, {
      type: meta.avatar,
      palette: meta.palette,
      x: fighter.x,
      y,
      r: radius * scale,
      t,
      vx: fighter.vx,
      vy: fighter.vy,
      squash: fx.squash,
      expression: fx.expression,
      flash: fighter.flash,
      alpha,
      shadow: !dying,
      phase: meta.slot * 1.9,
      glow: isCrown
        ? 'rgba(255,201,60,0.55)'
        : isBomb
          ? 'rgba(255,90,60,0.5)'
          : meta.isSelf
            ? 'rgba(255,255,255,0.28)'
            : null,
      glowSize: isCrown || isBomb ? 1.15 : 0.9,
    });
    ctx.restore();

    if (labels && !dying) {
      drawNameTag(view, fighter.x, fighter.y - radius * 1.85, meta);
    }

    // desconectado: aviso discreto
    if (!meta.connected && !dying) {
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.font = '700 15px Nunito, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#FFE38C';
      ctx.fillText('piloto automático', fighter.x, fighter.y - radius * 2.5);
      ctx.restore();
    }
  }
}

export function drawNameTag(
  view: RenderView,
  x: number,
  y: number,
  meta: PlayerMeta,
): void {
  const { ctx } = view;
  const label = meta.isSelf ? `você` : meta.name;
  ctx.save();
  ctx.font = `800 ${meta.isSelf ? 17 : 15}px "Baloo 2", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const width = ctx.measureText(label).width + 18;
  const height = 22;

  ctx.globalAlpha = meta.isSelf ? 0.98 : 0.82;
  ctx.fillStyle = meta.isSelf ? meta.palette.base : 'rgba(20,10,45,0.55)';
  ctx.beginPath();
  ctx.roundRect(x - width / 2, y - height / 2, width, height, 11);
  ctx.fill();
  if (meta.isSelf) {
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(label, x, y + 1);
  ctx.restore();
}

/** Texto grande de fase (contagem, "SOBREVIVA!", etc). */
export function drawBigText(
  view: RenderView,
  text: string,
  y: number,
  options: { size?: number; color?: string; alpha?: number; scale?: number } = {},
): void {
  const { ctx } = view;
  const { size = 96, color = '#ffffff', alpha = 1, scale = 1 } = options;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(WORLD.w / 2, y);
  ctx.scale(scale, scale);
  ctx.font = `800 ${size}px "Baloo 2", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = size * 0.16;
  ctx.strokeStyle = 'rgba(30,20,64,0.85)';
  ctx.lineJoin = 'round';
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = color;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}
