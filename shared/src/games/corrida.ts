import {
  advancePhase,
  aiThink,
  baseSnapshotFields,
  closeMatch,
  createBaseState,
  createFighter,
  requestBotDash,
  ringSpawns,
} from '../engine';
import { dist, normalize, round2 } from '../math';
import { createRng, type Rng } from '../rng';
import type {
  BaseMatchState,
  GameModule,
  InputState,
  MatchContext,
  MatchResults,
  Snapshot,
} from '../types';
import { ARENA_CENTER, buildResults, freeSpot, item, pointsLabel, stepBodies } from './kit';

/**
 * CORRIDA!
 *
 * Um anel por vez, todos atrás do mesmo ponto. Simples de entender e ótimo com
 * amigos porque a disputa é sempre direta: dá para ver quem vai chegar primeiro
 * e decidir se vale correr ou atropelar.
 *
 * Códigos do snapshot: k=0 anel atual.
 */

const TIME_LIMIT = 85;
const RING_RADIUS = 46;
/** O anel só vale ponto depois de "acender": evita ponto de graça no spawn. */
const ARM_TIME = 0.35;

export interface CorridaState extends BaseMatchState {
  ring: { x: number; y: number };
  /** animação de entrada do anel */
  born: number;
  target: number;
  streak: Record<string, number>;
  lastWinner: string | null;
  bestStreak: Record<string, number>;
  rng: Rng;
}

/**
 * Meta alta de propósito: com a velocidade nova cada anel cai em ~2s, então 5
 * pontos acabavam a rodada em 5 segundos.
 */
function targetForPlayers(count: number): number {
  return count <= 2 ? 18 : count === 3 ? 16 : 14;
}

export const corridaGame: GameModule<CorridaState> = {
  id: 'corrida',
  timeLimit: TIME_LIMIT,

  create(ctx: MatchContext): CorridaState {
    const rng = createRng(ctx.seed);
    const spawns = ringSpawns(ctx.players.length, ARENA_CENTER.x, ARENA_CENTER.y, 170);
    const fighters = ctx.players.map((seed, i) =>
      createFighter(seed, spawns[i].x, spawns[i].y, 26),
    );
    return {
      ...createBaseState('corrida', ctx, fighters),
      ring: freeSpot(rng, fighters, 90, 210),
      born: 0,
      target: targetForPlayers(ctx.players.length),
      streak: Object.fromEntries(fighters.map((f) => [f.id, 0])),
      bestStreak: Object.fromEntries(fighters.map((f) => [f.id, 0])),
      lastWinner: null,
      rng,
    };
  },

  step(state, dt, inputs) {
    const playing = advancePhase(state, dt);
    stepBodies(state, dt, inputs, playing, { knockScale: 1.05 });
    if (!playing) return;

    state.born = Math.min(1, state.born + dt / ARM_TIME);

    for (const f of state.fighters) {
      if (!f.alive || state.born < 1) continue;
      if (dist(f.x, f.y, state.ring.x, state.ring.y) > f.radius + RING_RADIUS) continue;

      f.score += 1;
      state.events.push({ k: 'checkpoint', id: f.id, x: state.ring.x, y: state.ring.y, v: 1 });

      // sequência de anéis seguidos rende o destaque do resultado
      if (state.lastWinner === f.id) {
        state.streak[f.id] = (state.streak[f.id] ?? 0) + 1;
      } else {
        for (const other of state.fighters) if (other.id !== f.id) state.streak[other.id] = 0;
        state.streak[f.id] = 1;
      }
      state.bestStreak[f.id] = Math.max(state.bestStreak[f.id] ?? 0, state.streak[f.id]);
      state.lastWinner = f.id;

      // o próximo anel nasce longe de TODOS (longe só de quem marcou fazia o
      // anel nascer no colo de outro jogador, que pontuava de graça)
      state.ring = freeSpot(state.rng, state.fighters, 100, 300);
      state.born = 0;
      break;
    }

    const leader = state.fighters.reduce<(typeof state.fighters)[number] | null>(
      (acc, f) => (!acc || f.score > acc.score ? f : acc),
      null,
    );
    if ((leader && leader.score >= state.target) || state.elapsed >= TIME_LIMIT) {
      closeMatch(state, (a, b) => b.score - a.score);
    }
  },

  isOver(state) {
    return state.phase === 'over';
  },

  results(state): MatchResults {
    return buildResults(
      state,
      'corrida',
      (f) => pointsLabel(f, 'anel'),
      (f) => {
        const best = state.bestStreak[f.id] ?? 0;
        return best >= 2 ? `${best} seguidos` : null;
      },
    );
  },

  snapshot(state, seq, now): Snapshot {
    return {
      ...baseSnapshotFields(state, seq, now, Math.max(0, TIME_LIMIT - state.elapsed)),
      ex: {
        items: [item(state.ring.x, state.ring.y, RING_RADIUS, 0, { v: round2(state.born) })],
        tg: state.target,
      },
    };
  },

  bot(state, f, dt): InputState {
    const rng = state.rng;
    aiThink(f, dt, 0.45, rng.next);
    const d = dist(f.x, f.y, state.ring.x, state.ring.y);
    const dir = normalize(state.ring.x - f.x, state.ring.y - f.y);

    // alguém vai chegar antes? então atropela em vez de correr atrás
    let rivalCloser: (typeof state.fighters)[number] | null = null;
    for (const other of state.fighters) {
      if (other === f || !other.alive) continue;
      const rivalD = dist(other.x, other.y, state.ring.x, state.ring.y);
      if (rivalD < d - 40 && dist(f.x, f.y, other.x, other.y) < 150) rivalCloser = other;
    }
    if (rivalCloser && f.dashCooldown <= 0 && rng.chance(dt * 4)) {
      const toRival = normalize(rivalCloser.x - f.x, rivalCloser.y - f.y);
      return { mx: toRival.x, my: toRival.y, dash: requestBotDash(f) };
    }

    return {
      mx: dir.x,
      my: dir.y,
      dash: d > 200 && f.dashCooldown <= 0 && rng.chance(dt * 4) ? requestBotDash(f) : f.dashSeen,
    };
  },
};
