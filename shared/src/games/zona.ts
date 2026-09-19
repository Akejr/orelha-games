import {
  advancePhase,
  aiThink,
  baseSnapshotFields,
  closeMatch,
  createBaseState,
  createFighter,
  nearestOther,
  requestBotDash,
  ringSpawns,
} from '../engine';
import { clamp01, dist, normalize, round2 } from '../math';
import { createRng, type Rng } from '../rng';
import type {
  BaseMatchState,
  GameModule,
  InputState,
  MatchContext,
  MatchResults,
  Snapshot,
} from '../types';
import { ARENA_CENTER, buildResults, freeSpot, item, stepBodies } from './kit';

/**
 * ZONA!
 *
 * Rei da colina com uma regra que muda tudo: se tiver mais de um jogador dentro
 * do círculo, NINGUÉM pontua. Não basta chegar primeiro, é preciso chegar
 * sozinho — o que transforma um jogo de corrida em um jogo de empurrão.
 *
 * Códigos do snapshot: k=0 zona ativa, k=1 próxima zona (aviso).
 */

const TIME_LIMIT = 95;
const ZONE_RADIUS = 142;
const ZONE_EVERY = 11;
const WARN_TIME = 1.8;
/**
 * Com a zona disputada ninguém pontuava e a rodada morria no tempo limite. Agora
 * quem está mais perto do centro pontua devagar: sempre há progresso, mas
 * expulsar os outros ainda rende 2,5x mais.
 */
const CONTESTED_RATE = 0.4;

export interface ZonaState extends BaseMatchState {
  zone: { x: number; y: number };
  next: { x: number; y: number };
  timer: number;
  target: number;
  /** tempo que cada um passou dominando sozinho */
  solo: Record<string, number>;
  contested: boolean;
  ownerId: string | null;
  rng: Rng;
}

function targetForPlayers(count: number): number {
  if (count <= 2) return 18;
  if (count === 3) return 13;
  return 10;
}

export const zonaGame: GameModule<ZonaState> = {
  id: 'zona',
  timeLimit: TIME_LIMIT,

  create(ctx: MatchContext): ZonaState {
    const rng = createRng(ctx.seed);
    const spawns = ringSpawns(ctx.players.length, ARENA_CENTER.x, ARENA_CENTER.y, 200);
    const fighters = ctx.players.map((seed, i) =>
      createFighter(seed, spawns[i].x, spawns[i].y, 26),
    );
    return {
      ...createBaseState('zona', ctx, fighters),
      zone: { x: ARENA_CENTER.x, y: ARENA_CENTER.y },
      next: freeSpot(rng, fighters, 150, 200),
      timer: ZONE_EVERY,
      target: targetForPlayers(ctx.players.length),
      solo: Object.fromEntries(fighters.map((f) => [f.id, 0])),
      contested: false,
      ownerId: null,
      rng,
    };
  },

  step(state, dt, inputs) {
    const playing = advancePhase(state, dt);
    stepBodies(state, dt, inputs, playing, { knockScale: 1.1 });
    if (!playing) return;

    // troca de zona
    state.timer -= dt;
    if (state.timer <= 0) {
      state.timer = ZONE_EVERY;
      state.zone = state.next;
      state.next = freeSpot(state.rng, state.fighters, 150, 200);
      state.events.push({ k: 'zone-move', x: state.zone.x, y: state.zone.y, v: 1 });
    }

    // quem está dentro?
    const inside = state.fighters.filter(
      (f) => f.alive && dist(f.x, f.y, state.zone.x, state.zone.y) < ZONE_RADIUS,
    );
    state.contested = inside.length > 1;

    if (inside.length === 1) {
      const owner = inside[0];
      owner.score += dt;
      state.solo[owner.id] = (state.solo[owner.id] ?? 0) + dt;
      state.ownerId = owner.id;
    } else if (inside.length > 1) {
      // disputa: quem está mais no miolo leva, mas a passos curtos
      const closest = inside.reduce((best, f) =>
        dist(f.x, f.y, state.zone.x, state.zone.y) < dist(best.x, best.y, state.zone.x, state.zone.y)
          ? f
          : best,
      );
      closest.score += dt * CONTESTED_RATE;
      state.ownerId = closest.id;
    } else {
      state.ownerId = null;
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
      'zona',
      (f) => `${f.score.toFixed(1)}s dominando`,
      (f) => (f.score >= state.target ? 'bateu a meta' : null),
    );
  },

  snapshot(state, seq, now): Snapshot {
    return {
      ...baseSnapshotFields(state, seq, now, Math.max(0, TIME_LIMIT - state.elapsed)),
      ex: {
        items: [
          item(state.zone.x, state.zone.y, ZONE_RADIUS, 0, {
            v: state.contested ? 1 : 0,
          }),
          // aviso da próxima zona nos últimos segundos
          ...(state.timer <= WARN_TIME
            ? [
                item(state.next.x, state.next.y, ZONE_RADIUS, 1, {
                  v: round2(1 - state.timer / WARN_TIME),
                }),
              ]
            : []),
        ],
        tg: state.target,
        n: [state.target, round2(state.timer)],
        h: state.ownerId,
        s: state.contested ? 'ZONA DISPUTADA!' : undefined,
      },
    };
  },

  bot(state, f, dt): InputState {
    const rng = state.rng;
    const beat = aiThink(f, dt, 0.4, rng.next);
    const myDist = dist(f.x, f.y, state.zone.x, state.zone.y);
    const inZone = myDist < ZONE_RADIUS;

    // a zona vai mudar: sai na frente para chegar antes
    if (state.timer <= WARN_TIME * 0.8) {
      const dir = normalize(state.next.x - f.x, state.next.y - f.y);
      const d = dist(f.x, f.y, state.next.x, state.next.y);
      return {
        mx: dir.x,
        my: dir.y,
        dash: d > 220 && f.dashCooldown <= 0 && rng.chance(dt * 3) ? requestBotDash(f) : f.dashSeen,
      };
    }

    if (inZone) {
      // dentro: expulsa quem entrou junto
      const rival = nearestOther(state.fighters, f, (p) =>
        dist(p.x, p.y, state.zone.x, state.zone.y) < ZONE_RADIUS + 40,
      );
      if (rival) {
        const dir = normalize(rival.x - f.x, rival.y - f.y);
        const d = dist(f.x, f.y, rival.x, rival.y);
        return {
          mx: dir.x,
          my: dir.y,
          dash: beat && d < 170 && f.dashCooldown <= 0 && rng.chance(0.8) ? requestBotDash(f) : f.dashSeen,
        };
      }
      // sozinho: fica no miolo da zona
      const dir = normalize(state.zone.x - f.x, state.zone.y - f.y);
      const hold = clamp01(myDist / (ZONE_RADIUS * 0.5));
      return { mx: dir.x * hold, my: dir.y * hold, dash: f.dashSeen };
    }

    // fora: corre para dentro
    const dir = normalize(state.zone.x - f.x, state.zone.y - f.y);
    return {
      mx: dir.x,
      my: dir.y,
      dash: myDist > 230 && f.dashCooldown <= 0 && rng.chance(dt * 4) ? requestBotDash(f) : f.dashSeen,
    };
  },
};
