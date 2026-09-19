import {
  advancePhase,
  aiThink,
  baseSnapshotFields,
  createBaseState,
  createFighter,
  requestBotDash,
  ringSpawns,
} from '../engine';
import { clamp, dist, normalize, round1, round2 } from '../math';
import { createRng, type Rng } from '../rng';
import type {
  BaseMatchState,
  GameModule,
  InputState,
  MatchContext,
  MatchResults,
  Snapshot,
} from '../types';
import { ARENA, ARENA_CENTER, buildResults, closeByScore, item, pointsLabel, stepBodies } from './kit';

/**
 * ESPELHO!
 *
 * Tem uma linha de espelho no meio da arena, e você joga com DOIS corpos: você e
 * o seu reflexo. Os dois pegam estrela, os dois empurram gente. O espelho desliza
 * devagar, então o seu reflexo se move mesmo com você parado.
 *
 * Aqui não tem controle invertido: a piada é você precisar pensar nos dois lados
 * ao mesmo tempo.
 *
 * Códigos do snapshot: k=0 estrela, k=1 eixo do espelho, k=2 reflexo de jogador
 * (o = slot do dono).
 */

const TIME_LIMIT = 68;
const STAR_RADIUS = 22;
const STARS = 2;
/** Distância mínima da estrela nova até qualquer corpo (real ou reflexo). */
const STAR_CLEARANCE = 300;
/** Tempo que a estrela leva para virar pegável. */
const RIPE_TIME = 0.6;
const AXIS_SPEED = 46;
const AXIS_MARGIN = 190;
/** Empurrão que o reflexo dá em quem ele encosta. */
const MIRROR_PUSH = 560;

export interface EspelhoState extends BaseMatchState {
  /** `born` sobe até 1: estrela verde só conta depois de nascer */
  stars: { x: number; y: number; born: number }[];
  /** posição x do espelho */
  axis: number;
  axisDir: number;
  /** carência do empurrão do reflexo, por par */
  bumped: Record<string, number>;
  rng: Rng;
}

/** Posição do reflexo de um jogador. */
export function mirrorOf(axis: number, f: { x: number; y: number }): { x: number; y: number } {
  return { x: axis * 2 - f.x, y: f.y };
}

/**
 * Estrela nova longe de todos os corpos — inclusive dos reflexos.
 *
 * Com dois corpos por jogador, uma estrela sorteada em qualquer lugar caía no
 * colo de alguém: o vencedor fazia 180 pontos em 68 segundos, o que não é
 * pontuação, é caminhada.
 */
function spawnStar(state: EspelhoState): { x: number; y: number; born: number } {
  let best = { x: ARENA_CENTER.x, y: ARENA_CENTER.y, born: 0 };
  let bestScore = -1;
  for (let tries = 0; tries < 12; tries += 1) {
    const candidate = {
      x: state.rng.range(ARENA.x + 80, ARENA.x + ARENA.w - 80),
      y: state.rng.range(ARENA.y + 80, ARENA.y + ARENA.h - 80),
      born: 0,
    };
    let nearest = Infinity;
    for (const f of state.fighters) {
      if (!f.alive) continue;
      const twin = mirrorOf(state.axis, f);
      nearest = Math.min(
        nearest,
        dist(f.x, f.y, candidate.x, candidate.y),
        dist(twin.x, twin.y, candidate.x, candidate.y),
      );
    }
    for (const star of state.stars) {
      nearest = Math.min(nearest, dist(star.x, star.y, candidate.x, candidate.y));
    }
    if (nearest === Infinity || nearest > STAR_CLEARANCE) return candidate;
    if (nearest > bestScore) {
      bestScore = nearest;
      best = candidate;
    }
  }
  return best;
}

export const espelhoGame: GameModule<EspelhoState> = {
  id: 'espelho',
  timeLimit: TIME_LIMIT,

  create(ctx: MatchContext): EspelhoState {
    const rng = createRng(ctx.seed);
    const spawns = ringSpawns(ctx.players.length, ARENA_CENTER.x, ARENA_CENTER.y, 170);
    const fighters = ctx.players.map((seed, i) =>
      createFighter(seed, spawns[i].x, spawns[i].y, 26),
    );
    const state: EspelhoState = {
      ...createBaseState('espelho', ctx, fighters),
      stars: [],
      axis: ARENA_CENTER.x,
      axisDir: rng.sign(),
      bumped: {},
      rng,
    };
    for (let i = 0; i < STARS; i += 1) state.stars.push(spawnStar(state));
    return state;
  },

  step(state, dt, inputs) {
    const playing = advancePhase(state, dt);
    stepBodies(state, dt, inputs, playing, { knockScale: 1 });
    if (!playing) return;

    // o espelho desliza de um lado para o outro
    state.axis += state.axisDir * AXIS_SPEED * dt;
    const min = ARENA.x + AXIS_MARGIN;
    const max = ARENA.x + ARENA.w - AXIS_MARGIN;
    if (state.axis < min || state.axis > max) {
      state.axisDir *= -1;
      state.axis = clamp(state.axis, min, max);
    }

    for (const id of Object.keys(state.bumped)) {
      state.bumped[id] = Math.max(0, state.bumped[id] - dt);
    }

    // estrela precisa nascer antes de valer: não dá para campear o ponto de spawn
    for (const star of state.stars) {
      star.born = Math.min(1, star.born + dt / RIPE_TIME);
    }

    // estrelas: o corpo real E o reflexo pegam
    for (const f of state.fighters) {
      if (!f.alive) continue;
      const twin = mirrorOf(state.axis, f);
      for (let i = state.stars.length - 1; i >= 0; i -= 1) {
        const star = state.stars[i];
        if (star.born < 1) continue;
        const byBody = dist(f.x, f.y, star.x, star.y) <= f.radius + STAR_RADIUS;
        const byTwin = dist(twin.x, twin.y, star.x, star.y) <= f.radius + STAR_RADIUS;
        if (!byBody && !byTwin) continue;
        state.stars.splice(i, 1);
        state.stars.push(spawnStar(state));
        f.score += 1;
        f.squash = 0.5;
        state.events.push({
          k: 'pickup',
          id: f.id,
          x: star.x,
          y: star.y,
          v: byTwin && !byBody ? 1 : 0.5,
          i: 1,
        });
      }
    }

    // reflexo empurra: o corpo do outro lado do espelho é sólido
    for (const owner of state.fighters) {
      if (!owner.alive) continue;
      const twin = mirrorOf(state.axis, owner);
      for (const victim of state.fighters) {
        if (victim === owner || !victim.alive) continue;
        const key = `${owner.id}>${victim.id}`;
        if ((state.bumped[key] ?? 0) > 0) continue;
        const d = dist(twin.x, twin.y, victim.x, victim.y);
        if (d > owner.radius + victim.radius) continue;

        const away = normalize(victim.x - twin.x, victim.y - twin.y);
        const force = MIRROR_PUSH * (0.6 + Math.min(1, Math.hypot(owner.vx, owner.vy) / 420));
        victim.vx += away.x * force;
        victim.vy += away.y * force;
        victim.squash = -0.5;
        victim.hitFlash = 0.8;
        state.bumped[key] = 0.35;
        state.events.push({ k: 'hit', id: victim.id, id2: owner.id, x: victim.x, y: victim.y, v: 0.7 });
      }
    }

    if (state.elapsed >= TIME_LIMIT) closeByScore(state);
  },

  isOver(state) {
    return state.phase === 'over';
  },

  results(state): MatchResults {
    return buildResults(state, 'espelho', (f) => pointsLabel(f, 'estrela'));
  },

  snapshot(state, seq, now): Snapshot {
    return {
      ...baseSnapshotFields(state, seq, now, Math.max(0, TIME_LIMIT - state.elapsed)),
      ex: {
        items: [
          ...state.stars.map((star) => item(star.x, star.y, STAR_RADIUS, 0, { v: round2(star.born) })),
          item(state.axis, ARENA_CENTER.y, 0, 1, { h: Math.round(ARENA.h) }),
          // os reflexos vão prontos: o cliente não precisa saber a regra
          ...state.fighters
            .filter((f) => f.alive)
            .map((f) => {
              const twin = mirrorOf(state.axis, f);
              return item(twin.x, twin.y, f.radius, 2, {
                o: f.slot,
                a: round1(Math.atan2(f.vy, -f.vx)),
              });
            }),
        ],
        n: [round1(state.axis)],
        s: undefined,
      },
    };
  },

  bot(state, f, dt): InputState {
    const rng = state.rng;
    aiThink(f, dt, 0.36, rng.next);
    const twin = mirrorOf(state.axis, f);

    // escolhe a estrela mais perto de QUALQUER um dos seus dois corpos
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    let useTwin = false;
    for (const star of state.stars) {
      const dBody = dist(f.x, f.y, star.x, star.y);
      const dTwin = dist(twin.x, twin.y, star.x, star.y);
      if (dBody < bestD) {
        bestD = dBody;
        best = star;
        useTwin = false;
      }
      if (dTwin < bestD) {
        bestD = dTwin;
        best = star;
        useTwin = true;
      }
    }

    if (!best) {
      const dir = normalize(ARENA_CENTER.x - f.x, ARENA_CENTER.y - f.y);
      return { mx: dir.x, my: dir.y, dash: f.dashSeen };
    }

    // para mover o reflexo até a estrela, o corpo real anda para o lado oposto
    const goal = useTwin ? mirrorOf(state.axis, best) : best;
    const dir = normalize(goal.x - f.x, goal.y - f.y);
    return {
      mx: dir.x,
      my: dir.y,
      dash: bestD > 230 && f.dashCooldown <= 0 && rng.chance(dt * 3) ? requestBotDash(f) : f.dashSeen,
    };
  },
};
