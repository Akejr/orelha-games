import {
  advancePhase,
  aiThink,
  baseSnapshotFields,
  closeMatch,
  containInRect,
  createBaseState,
  createFighter,
  moveConfig,
  nearestOther,
  requestBotDash,
  resolveFighterCollisions,
  ringSpawns,
  stepFighter,
} from '../engine';
import { clamp, clamp01, dist, len, normalize, round1, round2 } from '../math';
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
 * CROWN!
 * A coroa dá pontos por segundo, mas transforma o portador no alvo de todos.
 * Roubo por toque, queda por trombada e um sprint final quando alguém encosta
 * na meta.
 */

export interface CrownState extends BaseMatchState {
  arena: { x: number; y: number; w: number; h: number };
  crown: { x: number; y: number; vx: number; vy: number; grounded: boolean; groundLock: number };
  holderId: string | null;
  prevHolderId: string | null;
  immunity: number;
  prevImmunity: number;
  target: number;
  steals: Record<string, number>;
  alerted: boolean;
  /** tempo de posse contínua do portador atual (s) */
  streak: number;
  /** maior posse contínua de cada jogador, para o destaque do resultado */
  bestStreak: Record<string, number>;
  rng: Rng;
}

const ARENA = { x: 62, y: 74, w: WORLD.w - 124, h: WORLD.h - 148 };
const CROWN_RADIUS = 22;
const TIME_LIMIT = 105;

/**
 * A meta cai conforme entra gente: com 5 perseguidores a posse média é de
 * poucos segundos, e uma meta alta fazia a rodada bater no tempo limite sem
 * ninguém chegar perto.
 */
function targetForPlayers(count: number): number {
  if (count <= 2) return 22;
  if (count === 3) return 16;
  if (count === 4) return 13;
  return 10;
}

/**
 * Segurar a coroa sem perder vale cada vez mais (até 1,6x), mas o portador vai
 * ficando mais lento. Isso cria a decisão que faltava: correr atrás da meta em
 * uma única posse longa ou soltar e recuperar depois.
 */
const STREAK_GAIN = 0.08;
const STREAK_MAX = 0.6;
const WEIGHT_PER_SECOND = 0.016;
const WEIGHT_MAX = 0.13;

const CFG = moveConfig({
  accel: 5300,
  maxSpeed: 435,
  friction: 0.858,
  radius: 26,
  dashSpeed: 1160,
  dashTime: 0.19,
  dashCooldown: 0.6,
  knockback: 660,
  bounce: 0.52,
});

function crownCenter(state: CrownState): { x: number; y: number } {
  if (state.holderId) {
    const holder = state.fighters.find((f) => f.id === state.holderId);
    if (holder) return { x: holder.x, y: holder.y - holder.radius - 16 };
  }
  return { x: state.crown.x, y: state.crown.y };
}

function registerStreak(state: CrownState): void {
  if (state.holderId) {
    const best = state.bestStreak[state.holderId] ?? 0;
    state.bestStreak[state.holderId] = Math.max(best, state.streak);
  }
  state.streak = 0;
}

function giveCrown(state: CrownState, f: Fighter, steal: boolean): void {
  registerStreak(state);
  const previous = state.holderId;
  state.prevHolderId = previous;
  state.holderId = f.id;
  state.crown.grounded = false;
  state.crown.groundLock = 0;
  state.crown.vx = 0;
  state.crown.vy = 0;
  state.immunity = steal ? 0.5 : 0.35;
  state.prevImmunity = steal ? 1 : 0.5;
  f.squash = 0.5;
  if (steal) {
    state.steals[f.id] = (state.steals[f.id] ?? 0) + 1;
    state.events.push({ k: 'crown-steal', id: f.id, id2: previous ?? undefined, x: f.x, y: f.y });
  } else {
    state.events.push({ k: 'crown-grab', id: f.id, x: f.x, y: f.y });
  }
}

function dropCrown(state: CrownState, x: number, y: number, vx: number, vy: number): void {
  registerStreak(state);
  state.prevHolderId = state.holderId;
  state.holderId = null;
  state.crown.x = clamp(x, ARENA.x + CROWN_RADIUS, ARENA.x + ARENA.w - CROWN_RADIUS);
  state.crown.y = clamp(y, ARENA.y + CROWN_RADIUS, ARENA.y + ARENA.h - CROWN_RADIUS);
  state.crown.vx = vx;
  state.crown.vy = vy;
  state.crown.grounded = true;
  state.crown.groundLock = 0.42;
  state.immunity = 0;
  state.prevImmunity = 0.35;
  state.events.push({ k: 'crown-drop', x: state.crown.x, y: state.crown.y });
}

export const crownGame: GameModule<CrownState> = {
  id: 'crown',
  timeLimit: TIME_LIMIT,

  create(ctx: MatchContext): CrownState {
    const rng = createRng(ctx.seed);
    const spawns = ringSpawns(ctx.players.length, WORLD.w / 2, WORLD.h / 2, 215);
    const fighters = ctx.players.map((seed, i) =>
      createFighter(seed, spawns[i].x, spawns[i].y, 26),
    );
    const base = createBaseState('crown', ctx, fighters);
    return {
      ...base,
      arena: ARENA,
      crown: {
        x: WORLD.w / 2,
        y: WORLD.h / 2,
        vx: 0,
        vy: 0,
        grounded: true,
        groundLock: 0,
      },
      holderId: null,
      prevHolderId: null,
      immunity: 0,
      prevImmunity: 0,
      target: targetForPlayers(ctx.players.length),
      steals: Object.fromEntries(fighters.map((f) => [f.id, 0])),
      alerted: false,
      streak: 0,
      bestStreak: Object.fromEntries(fighters.map((f) => [f.id, 0])),
      rng,
    };
  },

  step(state, dt, inputs) {
    const playing = advancePhase(state, dt);

    state.immunity = Math.max(0, state.immunity - dt);
    state.prevImmunity = Math.max(0, state.prevImmunity - dt);
    state.crown.groundLock = Math.max(0, state.crown.groundLock - dt);

    for (const f of state.fighters) {
      const isHolder = f.id === state.holderId;
      const input = playing ? inputs[f.id] ?? emptyInput() : emptyInput();
      stepFighter(f, input, CFG, dt, state.events, {
        // a coroa "pesa": quanto mais tempo na cabeça, mais lento o portador
        speedScale: isHolder
          ? 0.96 - Math.min(WEIGHT_MAX, state.streak * WEIGHT_PER_SECOND)
          : 1.03,
      });
      containInRect(f, ARENA.x, ARENA.y, ARENA.w, ARENA.h, 0.35);
      if (playing) f.survived = state.elapsed;
    }

    resolveFighterCollisions(state.fighters, CFG, state.events, {
      knockScale: 0.92,
      onHit: (attacker, victim, power) => {
        // trombada forte derruba a coroa: instante caótico de corrida livre
        if (victim.id === state.holderId && power > CFG.knockback * 1.15) {
          const n = normalize(victim.vx, victim.vy);
          dropCrown(state, victim.x + n.x * 26, victim.y + n.y * 26, n.x * 210, n.y * 210);
        }
      },
    });

    if (!playing) return;

    // coroa no chão desliza e desacelera
    if (state.crown.grounded) {
      const drag = Math.pow(0.9, dt * 60);
      state.crown.vx *= drag;
      state.crown.vy *= drag;
      state.crown.x += state.crown.vx * dt;
      state.crown.y += state.crown.vy * dt;
      const minX = ARENA.x + CROWN_RADIUS;
      const maxX = ARENA.x + ARENA.w - CROWN_RADIUS;
      const minY = ARENA.y + CROWN_RADIUS;
      const maxY = ARENA.y + ARENA.h - CROWN_RADIUS;
      if (state.crown.x < minX) {
        state.crown.x = minX;
        state.crown.vx = Math.abs(state.crown.vx) * 0.5;
      } else if (state.crown.x > maxX) {
        state.crown.x = maxX;
        state.crown.vx = -Math.abs(state.crown.vx) * 0.5;
      }
      if (state.crown.y < minY) {
        state.crown.y = minY;
        state.crown.vy = Math.abs(state.crown.vy) * 0.5;
      } else if (state.crown.y > maxY) {
        state.crown.y = maxY;
        state.crown.vy = -Math.abs(state.crown.vy) * 0.5;
      }

      if (state.crown.groundLock <= 0) {
        let best: Fighter | null = null;
        let bestD = Infinity;
        for (const f of state.fighters) {
          if (!f.alive) continue;
          if (f.id === state.prevHolderId && state.prevImmunity > 0) continue;
          const d = dist(f.x, f.y, state.crown.x, state.crown.y);
          if (d < f.radius + CROWN_RADIUS && d < bestD) {
            bestD = d;
            best = f;
          }
        }
        if (best) giveCrown(state, best, false);
      }
    } else if (state.holderId) {
      const holder = state.fighters.find((f) => f.id === state.holderId);
      if (!holder || !holder.alive) {
        dropCrown(state, state.crown.x, state.crown.y, 0, 0);
      } else {
        state.streak += dt;
        holder.score += dt * (1 + Math.min(STREAK_MAX, state.streak * STREAK_GAIN));
        state.crown.x = holder.x;
        state.crown.y = holder.y - holder.radius - 16;

        // roubo por toque
        if (state.immunity <= 0) {
          for (const f of state.fighters) {
            if (!f.alive || f.id === holder.id) continue;
            if (f.id === state.prevHolderId && state.prevImmunity > 0) continue;
            if (dist(f.x, f.y, holder.x, holder.y) < f.radius + holder.radius + 4) {
              giveCrown(state, f, true);
              break;
            }
          }
        }
      }
    }

    // aviso de "quase lá"
    const leader = state.fighters.reduce<Fighter | null>(
      (acc, f) => (!acc || f.score > acc.score ? f : acc),
      null,
    );
    if (!state.alerted && leader && leader.score >= state.target - 3.2) {
      state.alerted = true;
      state.events.push({ k: 'crown-alert', id: leader.id, v: 1 });
    }

    if ((leader && leader.score >= state.target) || state.elapsed >= TIME_LIMIT) {
      closeMatch(state, (a, b) => b.score - a.score || b.survived - a.survived);
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
        const steals = state.steals[f.id] ?? 0;
        const best = state.bestStreak[f.id] ?? 0;
        const highlight =
          best >= 4
            ? `posse de ${round1(best).toFixed(1)}s`
            : steals > 0
              ? `${steals} ${steals === 1 ? 'roubo' : 'roubos'}`
              : null;
        return {
          playerId: f.id,
          place: f.place || 99,
          score: round1(f.score),
          scoreLabel: `${round1(f.score).toFixed(1)} de coroa`,
          highlight,
        };
      });
    const winner = rows.find((r) => r.place === 1);
    return {
      gameId: 'crown',
      rows,
      winnerId: winner?.playerId ?? null,
      duration: round1(state.elapsed),
      round: state.round,
    };
  },

  snapshot(state, seq, now): Snapshot {
    const remaining = Math.max(0, TIME_LIMIT - state.elapsed);
    const c = crownCenter(state);
    return {
      ...baseSnapshotFields(state, seq, now, remaining),
      crown: {
        h: state.holderId,
        x: round1(c.x),
        y: round1(c.y),
        dr: state.crown.grounded ? 1 : 0,
        tg: state.target,
        im: round2(clamp01(state.immunity / 0.5)),
        mu: round2(1 + Math.min(STREAK_MAX, state.streak * STREAK_GAIN)),
      },
    };
  },

  bot(state, f, dt): InputState {
    const rng = state.rng;
    const beat = aiThink(f, dt, 0.42, rng.next);
    let dash = f.dashSeen;
    let tx: number;
    let ty: number;

    const isHolder = f.id === state.holderId;

    if (isHolder) {
      const chaser = nearestOther(state.fighters, f);
      if (chaser) {
        const away = normalize(f.x - chaser.x, f.y - chaser.y);
        // fugir, mas puxando para o centro para não travar na parede
        const toCenter = normalize(WORLD.w / 2 - f.x, WORLD.h / 2 - f.y);
        const edgeDanger =
          clamp01(1 - (f.x - ARENA.x) / 150) +
          clamp01(1 - (ARENA.x + ARENA.w - f.x) / 150) +
          clamp01(1 - (f.y - ARENA.y) / 150) +
          clamp01(1 - (ARENA.y + ARENA.h - f.y) / 150);
        const mixX = away.x + toCenter.x * (0.4 + edgeDanger * 0.9);
        const mixY = away.y + toCenter.y * (0.4 + edgeDanger * 0.9);
        tx = f.x + mixX * 240 + f.ai.jitterX * 0.3;
        ty = f.y + mixY * 240 + f.ai.jitterY * 0.3;
        const d = dist(f.x, f.y, chaser.x, chaser.y);
        if (beat && d < 110 && f.dashCooldown <= 0 && rng.chance(0.55)) dash = requestBotDash(f);
      } else {
        tx = WORLD.w / 2;
        ty = WORLD.h / 2;
      }
    } else if (state.crown.grounded) {
      tx = state.crown.x;
      ty = state.crown.y;
      const d = dist(f.x, f.y, tx, ty);
      if (beat && d > 150 && d < 340 && f.dashCooldown <= 0 && rng.chance(0.4)) {
        dash = requestBotDash(f);
      }
    } else {
      const holder = state.fighters.find((p) => p.id === state.holderId);
      if (holder) {
        // interceptação simples: mira um pouco à frente do portador
        tx = holder.x + holder.vx * 0.28 + f.ai.jitterX * 0.2;
        ty = holder.y + holder.vy * 0.28 + f.ai.jitterY * 0.2;
        const d = dist(f.x, f.y, holder.x, holder.y);
        if (beat && d < 140 && f.dashCooldown <= 0 && rng.chance(0.45 + f.ai.aggression * 0.3)) {
          dash = requestBotDash(f);
        }
      } else {
        tx = state.crown.x;
        ty = state.crown.y;
      }
    }

    const dir = normalize(tx - f.x, ty - f.y);
    return { mx: dir.x, my: dir.y, dash };
  },
};
