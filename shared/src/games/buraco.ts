import {
  advancePhase,
  aiThink,
  aliveFighters,
  baseSnapshotFields,
  closeMatch,
  createBaseState,
  createFighter,
  eliminate,
  requestBotDash,
  ringSpawns,
} from '../engine';
import { clamp, clamp01, dist, normalize, round2 } from '../math';
import { createRng, type Rng } from '../rng';
import type {
  BaseMatchState,
  GameModule,
  InputState,
  MatchContext,
  MatchResults,
  Snapshot,
} from '../types';
import { ARENA, ARENA_CENTER, buildResults, item, stepBodies } from './kit';

/**
 * BURACO!
 *
 * Um buraco puxa todo mundo, sem parar, cada vez mais forte. Não tem o que
 * atacar: o inimigo é a física. O dash serve de escapatória, e empurrar alguém
 * em direção ao centro é a jogada suja da casa.
 *
 * Códigos do snapshot: k=0 buraco (v = intensidade da atração).
 */

const TIME_LIMIT = 80;
const EVENT_HORIZON = 58;
const PULL_BASE = 260;
/**
 * A atração tem que passar da aceleração do jogador (4400) em algum momento,
 * senão dá para escapar circulando para sempre — era o que acontecia com
 * crescimento lento: 80 segundos sem ninguém cair.
 */
const PULL_GROWTH = 62;
const DRIFT_SPEED = 26;

export interface BuracoState extends BaseMatchState {
  hole: { x: number; y: number; vx: number; vy: number };
  pull: number;
  rng: Rng;
}

export const buracoGame: GameModule<BuracoState> = {
  id: 'buraco',
  timeLimit: TIME_LIMIT,

  create(ctx: MatchContext): BuracoState {
    const rng = createRng(ctx.seed);
    const spawns = ringSpawns(ctx.players.length, ARENA_CENTER.x, ARENA_CENTER.y, 230);
    const fighters = ctx.players.map((seed, i) =>
      createFighter(seed, spawns[i].x, spawns[i].y, 26),
    );
    const angle = rng.range(0, Math.PI * 2);
    return {
      ...createBaseState('buraco', ctx, fighters),
      hole: {
        x: ARENA_CENTER.x,
        y: ARENA_CENTER.y,
        vx: Math.cos(angle) * DRIFT_SPEED,
        vy: Math.sin(angle) * DRIFT_SPEED,
      },
      pull: PULL_BASE,
      rng,
    };
  },

  step(state, dt, inputs) {
    const playing = advancePhase(state, dt);
    stepBodies(state, dt, inputs, playing, { knockScale: 1.1 });
    if (!playing) return;

    // o buraco passeia devagar pela arena
    const hole = state.hole;
    hole.x += hole.vx * dt;
    hole.y += hole.vy * dt;
    const marginX = ARENA.x + 150;
    const marginY = ARENA.y + 120;
    if (hole.x < marginX || hole.x > ARENA.x + ARENA.w - 150) hole.vx *= -1;
    if (hole.y < marginY || hole.y > ARENA.y + ARENA.h - 120) hole.vy *= -1;
    hole.x = clamp(hole.x, marginX, ARENA.x + ARENA.w - 150);
    hole.y = clamp(hole.y, marginY, ARENA.y + ARENA.h - 120);

    state.pull = PULL_BASE + state.elapsed * PULL_GROWTH;

    for (const f of state.fighters) {
      if (!f.alive) continue;
      const dx = hole.x - f.x;
      const dy = hole.y - f.y;
      const d = Math.hypot(dx, dy);
      if (d < EVENT_HORIZON) {
        eliminate(state, f, { v: 1 });
        continue;
      }
      // atração cresce perto do centro, com teto para não virar teleporte
      const n = normalize(dx, dy);
      const strength = state.pull * clamp(260 / Math.max(80, d), 0.3, 3.2);
      f.vx += n.x * strength * dt;
      f.vy += n.y * strength * dt;
      f.score = f.survived;
    }

    const alive = aliveFighters(state);
    if (alive.length <= 1 || state.elapsed >= TIME_LIMIT) {
      closeMatch(state, (a, b) => b.survived - a.survived || a.stagger - b.stagger);
    }
  },

  isOver(state) {
    return state.phase === 'over';
  },

  results(state): MatchResults {
    return buildResults(state, 'buraco', (f) => `${f.survived.toFixed(1)}s fora do buraco`);
  },

  snapshot(state, seq, now): Snapshot {
    return {
      ...baseSnapshotFields(state, seq, now, Math.max(0, TIME_LIMIT - state.elapsed)),
      ex: {
        items: [
          item(state.hole.x, state.hole.y, EVENT_HORIZON, 0, {
            v: round2(clamp01((state.pull - PULL_BASE) / 400)),
          }),
        ],
      },
    };
  },

  bot(state, f, dt): InputState {
    const rng = state.rng;
    aiThink(f, dt, 0.3, rng.next);
    const hole = state.hole;
    const d = dist(f.x, f.y, hole.x, hole.y);
    const away = normalize(f.x - hole.x, f.y - hole.y);

    // longe do buraco, mas sem colar na parede (lá não tem para onde correr)
    const cornerX = clamp01((f.x - ARENA.x) / 120) * clamp01((ARENA.x + ARENA.w - f.x) / 120);
    const cornerY = clamp01((f.y - ARENA.y) / 120) * clamp01((ARENA.y + ARENA.h - f.y) / 120);
    const wallRisk = 1 - Math.min(cornerX, cornerY);
    const tangent = { x: -away.y, y: away.x };
    const side = f.ai.jitterX >= 0 ? 1 : -1;

    const dir = normalize(
      away.x * (1.2 - wallRisk) + tangent.x * side * (0.6 + wallRisk),
      away.y * (1.2 - wallRisk) + tangent.y * side * (0.6 + wallRisk),
    );
    return {
      mx: dir.x,
      my: dir.y,
      dash: d < 170 && f.dashCooldown <= 0 && rng.chance(dt * 6) ? requestBotDash(f) : f.dashSeen,
    };
  },
};
