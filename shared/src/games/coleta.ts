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
import { dist, normalize } from '../math';
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
 * COLETA!
 *
 * O jogo mais direto do portal: estrela vale ponto, dourada vale três, e não tem
 * eliminação. Serve de porta de entrada para quem nunca jogou nada — e mesmo
 * assim rende trombada, porque empurrar quem ia pegar a dourada é meio caminho.
 *
 * Códigos do snapshot: k=0 estrela comum, k=1 estrela dourada.
 */

const MATCH_TIME = 70;
const MAX_STARS = 6;
const SPAWN_EVERY = 0.75;
const GOLD_EVERY = 13;
const GOLD_VALUE = 3;

interface Star {
  x: number;
  y: number;
  gold: boolean;
  /** animação de entrada (0..1) */
  born: number;
}

export interface ColetaState extends BaseMatchState {
  stars: Star[];
  spawnTimer: number;
  goldTimer: number;
  grabs: Record<string, number>;
  golds: Record<string, number>;
  rng: Rng;
}

export const coletaGame: GameModule<ColetaState> = {
  id: 'coleta',
  timeLimit: MATCH_TIME,

  create(ctx: MatchContext): ColetaState {
    const rng = createRng(ctx.seed);
    const spawns = ringSpawns(ctx.players.length, ARENA_CENTER.x, ARENA_CENTER.y, 160);
    const fighters = ctx.players.map((seed, i) =>
      createFighter(seed, spawns[i].x, spawns[i].y, 26),
    );
    const state: ColetaState = {
      ...createBaseState('coleta', ctx, fighters),
      stars: [],
      spawnTimer: 0,
      goldTimer: GOLD_EVERY * 0.5,
      grabs: Object.fromEntries(fighters.map((f) => [f.id, 0])),
      golds: Object.fromEntries(fighters.map((f) => [f.id, 0])),
      rng,
    };
    // já começa com estrelas no chão para ninguém esperar parado
    for (let i = 0; i < 4; i += 1) {
      const spot = freeSpot(rng, fighters, 80, 150);
      state.stars.push({ ...spot, gold: false, born: 0 });
    }
    return state;
  },

  step(state, dt, inputs) {
    const playing = advancePhase(state, dt);
    stepBodies(state, dt, inputs, playing, { knockScale: 0.95 });
    if (!playing) return;

    for (const star of state.stars) star.born = Math.min(1, star.born + dt * 4);

    // reposição contínua
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0 && state.stars.length < MAX_STARS) {
      state.spawnTimer = SPAWN_EVERY;
      const spot = freeSpot(state.rng, state.fighters, 75, 110);
      state.stars.push({ ...spot, gold: false, born: 0 });
    }

    // a dourada é o momento de tensão do jogo
    state.goldTimer -= dt;
    if (state.goldTimer <= 0) {
      state.goldTimer = GOLD_EVERY;
      const spot = freeSpot(state.rng, state.fighters, 90, 170);
      state.stars.push({ ...spot, gold: true, born: 0 });
      state.events.push({ k: 'call', x: spot.x, y: spot.y, v: 1 });
    }

    // coleta
    for (const f of state.fighters) {
      if (!f.alive) continue;
      for (let i = state.stars.length - 1; i >= 0; i -= 1) {
        const star = state.stars[i];
        if (dist(f.x, f.y, star.x, star.y) > f.radius + 24) continue;
        state.stars.splice(i, 1);
        const value = star.gold ? GOLD_VALUE : 1;
        f.score += value;
        state.grabs[f.id] = (state.grabs[f.id] ?? 0) + 1;
        if (star.gold) state.golds[f.id] = (state.golds[f.id] ?? 0) + 1;
        state.events.push({
          k: 'pickup',
          id: f.id,
          x: star.x,
          y: star.y,
          v: star.gold ? 1 : 0.4,
          i: value,
        });
      }
    }

    if (state.elapsed >= MATCH_TIME) {
      closeMatch(state, (a, b) => b.score - a.score);
    }
  },

  isOver(state) {
    return state.phase === 'over';
  },

  results(state): MatchResults {
    return buildResults(
      state,
      'coleta',
      (f) => pointsLabel(f),
      (f) => {
        const golds = state.golds[f.id] ?? 0;
        return golds > 0 ? `${golds} dourada${golds === 1 ? '' : 's'}` : null;
      },
    );
  },

  snapshot(state, seq, now): Snapshot {
    return {
      ...baseSnapshotFields(state, seq, now, Math.max(0, MATCH_TIME - state.elapsed)),
      ex: {
        items: state.stars.map((star) =>
          item(star.x, star.y, star.gold ? 26 : 19, star.gold ? 1 : 0, {
            v: Math.round(star.born * 100) / 100,
          }),
        ),
      },
    };
  },

  bot(state, f, dt): InputState {
    const rng = state.rng;
    aiThink(f, dt, 0.5, rng.next);

    // escolhe a estrela com melhor relação valor/distância
    let best: Star | null = null;
    let bestValue = -Infinity;
    for (const star of state.stars) {
      const d = dist(f.x, f.y, star.x, star.y);
      const value = (star.gold ? GOLD_VALUE * 2.2 : 1) * (520 / (d + 80));
      if (value > bestValue) {
        bestValue = value;
        best = star;
      }
    }

    if (!best) {
      const dir = normalize(ARENA_CENTER.x - f.x + f.ai.jitterX, ARENA_CENTER.y - f.y + f.ai.jitterY);
      return { mx: dir.x, my: dir.y, dash: f.dashSeen };
    }

    const d = dist(f.x, f.y, best.x, best.y);
    const dir = normalize(best.x - f.x, best.y - f.y);
    // dash para disputar estrela distante (ou dourada em qualquer distância)
    const worthDashing = best.gold ? d > 120 : d > 240;
    const dash =
      worthDashing && f.dashCooldown <= 0 && rng.chance(dt * 3) ? requestBotDash(f) : f.dashSeen;
    return { mx: dir.x, my: dir.y, dash };
  },
};
