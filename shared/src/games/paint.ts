import {
  advancePhase,
  aiThink,
  baseSnapshotFields,
  closeMatch,
  containInRect,
  createBaseState,
  createFighter,
  moveConfig,
  requestBotDash,
  resolveFighterCollisions,
  ringSpawns,
  stepFighter,
} from '../engine';
import { clamp01, dist, normalize, round1, round2 } from '../math';
import { rleEncode } from '../rle';
import { createRng, type Rng } from '../rng';
import type {
  BaseMatchState,
  Fighter,
  GameModule,
  InputState,
  MatchContext,
  MatchResults,
  Snapshot,
} from '../types';
import { emptyInput, WORLD } from '../types';

/**
 * PAINT!
 * Territorial puro: andar pinta, dash pinta grosso e cobrir a cor do inimigo
 * vale mais. Nos 10 segundos finais o pincel engrossa e a virada acontece.
 */

export const PAINT_CELL = 25;
export const PAINT_COLS = Math.round(WORLD.w / PAINT_CELL); // 40
export const PAINT_ROWS = Math.round(WORLD.h / PAINT_CELL); // 28
export const PAINT_TOTAL = PAINT_COLS * PAINT_ROWS;

const MATCH_TIME = 75;
const RUSH_AT = 12;
/** Rolo de tinta: pincel quase o dobro por alguns segundos. */
const POWER_EVERY = 11;
const POWER_TIME = 7;
const POWER_BRUSH = 1.8;
const MAX_POWERUPS = 3;

export interface PaintState extends BaseMatchState {
  cells: Uint8Array;
  counts: number[];
  steals: Record<string, number>;
  rush: boolean;
  splashCooldown: number;
  /** rolos disponíveis no chão */
  powerups: { x: number; y: number }[];
  powerTimer: number;
  /** tempo restante de pincel grande por jogador */
  boost: Record<string, number>;
  rng: Rng;
}

const CFG = moveConfig({
  accel: 4200,
  maxSpeed: 405,
  friction: 0.866,
  radius: 25,
  dashSpeed: 1120,
  dashTime: 0.2,
  dashCooldown: 0.62,
  knockback: 480,
  bounce: 0.45,
});

function stamp(state: PaintState, f: Fighter, radius: number): number {
  const owner = f.slot + 1;
  const minCol = Math.max(0, Math.floor((f.x - radius) / PAINT_CELL));
  const maxCol = Math.min(PAINT_COLS - 1, Math.floor((f.x + radius) / PAINT_CELL));
  const minRow = Math.max(0, Math.floor((f.y - radius) / PAINT_CELL));
  const maxRow = Math.min(PAINT_ROWS - 1, Math.floor((f.y + radius) / PAINT_CELL));
  const r2 = radius * radius;
  let stolen = 0;

  for (let row = minRow; row <= maxRow; row += 1) {
    const cy = row * PAINT_CELL + PAINT_CELL / 2;
    for (let col = minCol; col <= maxCol; col += 1) {
      const cx = col * PAINT_CELL + PAINT_CELL / 2;
      const dx = cx - f.x;
      const dy = cy - f.y;
      if (dx * dx + dy * dy > r2) continue;
      const index = row * PAINT_COLS + col;
      const previous = state.cells[index];
      if (previous === owner) continue;
      state.cells[index] = owner;
      state.counts[previous] -= 1;
      state.counts[owner] += 1;
      if (previous !== 0) stolen += 1;
    }
  }
  return stolen;
}

export const paintGame: GameModule<PaintState> = {
  id: 'paint',
  timeLimit: MATCH_TIME,

  create(ctx: MatchContext): PaintState {
    const rng = createRng(ctx.seed);
    const spawns = ringSpawns(ctx.players.length, WORLD.w / 2, WORLD.h / 2, 210);
    const fighters = ctx.players.map((seed, i) =>
      createFighter(seed, spawns[i].x, spawns[i].y, 25),
    );
    const base = createBaseState('paint', ctx, fighters);
    const counts = new Array(6).fill(0);
    counts[0] = PAINT_TOTAL;
    return {
      ...base,
      cells: new Uint8Array(PAINT_TOTAL),
      counts,
      steals: Object.fromEntries(fighters.map((f) => [f.id, 0])),
      rush: false,
      splashCooldown: 0,
      powerups: [],
      powerTimer: 6,
      boost: Object.fromEntries(fighters.map((f) => [f.id, 0])),
      rng,
    };
  },

  step(state, dt, inputs) {
    const playing = advancePhase(state, dt);
    const remaining = MATCH_TIME - state.elapsed;

    if (playing && !state.rush && remaining <= RUSH_AT) {
      state.rush = true;
      state.events.push({ k: 'paint-rush', v: 1 });
    }
    state.splashCooldown = Math.max(0, state.splashCooldown - dt);

    for (const f of state.fighters) {
      const input = playing ? inputs[f.id] ?? emptyInput() : emptyInput();
      stepFighter(f, input, CFG, dt, state.events);
      containInRect(f, 0, 0, WORLD.w, WORLD.h, 0.3);
      if (playing) f.survived = state.elapsed;
    }

    resolveFighterCollisions(state.fighters, CFG, state.events, { knockScale: 0.7 });

    if (!playing) return;

    // rolos de tinta aparecendo no mapa
    state.powerTimer -= dt;
    if (state.powerTimer <= 0 && state.powerups.length < MAX_POWERUPS) {
      state.powerTimer = POWER_EVERY;
      state.powerups.push({
        x: state.rng.range(90, WORLD.w - 90),
        y: state.rng.range(90, WORLD.h - 90),
      });
    }

    for (const f of state.fighters) {
      state.boost[f.id] = Math.max(0, (state.boost[f.id] ?? 0) - dt);
      for (let i = state.powerups.length - 1; i >= 0; i -= 1) {
        const power = state.powerups[i];
        if (dist(f.x, f.y, power.x, power.y) < f.radius + 22) {
          state.powerups.splice(i, 1);
          state.boost[f.id] = POWER_TIME;
          state.events.push({ k: 'pickup', id: f.id, x: power.x, y: power.y, v: 1 });
        }
      }
    }

    for (const f of state.fighters) {
      const rushBonus = state.rush ? 1.5 : 1;
      const boostBonus = (state.boost[f.id] ?? 0) > 0 ? POWER_BRUSH : 1;
      const radius = (f.dashTimer > 0 ? 34 : 23) * rushBonus * boostBonus;
      const stolen = stamp(state, f, radius);
      if (stolen > 6 && state.splashCooldown <= 0) {
        state.splashCooldown = 0.22;
        state.events.push({
          k: 'paint-splash',
          id: f.id,
          x: f.x,
          y: f.y,
          v: clamp01(stolen / 26),
        });
        state.steals[f.id] = (state.steals[f.id] ?? 0) + stolen;
      } else if (stolen > 0) {
        state.steals[f.id] = (state.steals[f.id] ?? 0) + stolen;
      }
      f.score = (state.counts[f.slot + 1] / PAINT_TOTAL) * 100;
    }

    if (state.elapsed >= MATCH_TIME) {
      closeMatch(state, (a, b) => b.score - a.score);
    }
  },

  isOver(state) {
    return state.phase === 'over';
  },

  results(state): MatchResults {
    const rows = state.fighters
      .slice()
      .sort((a, b) => (a.place || 99) - (b.place || 99))
      .map((f) => {
        // `steals` conta células repintadas, e a mesma célula pode ser roubada
        // várias vezes na partida — por isso é expresso como "x vezes o mapa" e
        // não como porcentagem (que aparecia como "156% roubado").
        const stolen = state.steals[f.id] ?? 0;
        const laps = stolen / PAINT_TOTAL;
        return {
          playerId: f.id,
          place: f.place || 99,
          score: round1(f.score),
          scoreLabel: `${round1(f.score).toFixed(1)}% do mapa`,
          highlight: laps >= 0.15 ? `${laps.toFixed(1)}x o mapa roubado` : null,
        };
      });
    const winner = rows.find((r) => r.place === 1);
    return {
      gameId: 'paint',
      rows,
      winnerId: winner?.playerId ?? null,
      duration: round1(state.elapsed),
      round: state.round,
    };
  },

  snapshot(state, seq, now): Snapshot {
    const remaining = Math.max(0, MATCH_TIME - state.elapsed);
    return {
      ...baseSnapshotFields(state, seq, now, remaining),
      paint: {
        g: rleEncode(state.cells),
        ru: state.rush ? 1 : 0,
        pc: [1, 2, 3, 4, 5].map((slot) =>
          Math.round((state.counts[slot] / PAINT_TOTAL) * 1000) / 10,
        ),
        pu: state.powerups.map((power) => ({ x: round1(power.x), y: round1(power.y) })),
        bo: state.fighters.map((f) => round2(clamp01((state.boost[f.id] ?? 0) / POWER_TIME))),
      },
    };
  },

  bot(state, f, dt): InputState {
    const rng = state.rng;
    const owner = f.slot + 1;
    let dash = f.dashSeen;

    // rolo de tinta por perto vale mais que qualquer célula
    let bestPower: { x: number; y: number } | null = null;
    let bestPowerD = 320;
    for (const power of state.powerups) {
      const d = dist(f.x, f.y, power.x, power.y);
      if (d < bestPowerD) {
        bestPowerD = d;
        bestPower = power;
      }
    }
    if (bestPower) {
      const toPower = normalize(bestPower.x - f.x, bestPower.y - f.y);
      return {
        mx: toPower.x,
        my: toPower.y,
        dash:
          bestPowerD > 180 && f.dashCooldown <= 0 && rng.chance(dt * 2)
            ? requestBotDash(f)
            : f.dashSeen,
      };
    }

    const arrived = dist(f.x, f.y, f.ai.tx, f.ai.ty) < 46;
    if (aiThink(f, dt, 1.5, rng.next) || arrived) {
      // amostra alguns pontos e escolhe o melhor alvo (vazio ou do inimigo)
      let bestScore = -Infinity;
      let bx = f.ai.tx;
      let by = f.ai.ty;
      for (let i = 0; i < 26; i += 1) {
        const col = rng.int(0, PAINT_COLS - 1);
        const row = rng.int(0, PAINT_ROWS - 1);
        const cellOwner = state.cells[row * PAINT_COLS + col];
        if (cellOwner === owner) continue;
        const x = col * PAINT_CELL + PAINT_CELL / 2;
        const y = row * PAINT_CELL + PAINT_CELL / 2;
        const d = dist(f.x, f.y, x, y);
        const value = (cellOwner === 0 ? 1 : 1.45) * (520 / (d + 90));
        if (value > bestScore) {
          bestScore = value;
          bx = x;
          by = y;
        }
      }
      f.ai.tx = bx;
      f.ai.ty = by;
    }

    // chance por segundo (não por tick) para o bot não virar uma metralhadora de dash
    const d = dist(f.x, f.y, f.ai.tx, f.ai.ty);
    if (d > 210 && f.dashCooldown <= 0 && rng.chance(dt * 1.3)) dash = requestBotDash(f);

    const dir = normalize(f.ai.tx - f.x, f.ai.ty - f.y);
    return { mx: dir.x, my: dir.y, dash };
  },
};
