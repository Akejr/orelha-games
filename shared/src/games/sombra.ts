import {
  advancePhase,
  aiThink,
  baseSnapshotFields,
  createBaseState,
  createFighter,
  nearestOther,
  requestBotDash,
  ringSpawns,
} from '../engine';
import { dist, normalize, round1 } from '../math';
import { createRng, type Rng } from '../rng';
import type {
  BaseMatchState,
  GameModule,
  InputState,
  MatchContext,
  MatchResults,
  Snapshot,
} from '../types';
import { ARENA_CENTER, buildResults, closeByScore, stepBodies } from './kit';

/**
 * SOMBRA!
 *
 * Um caçador no começo. Quem é pego vira caçador também, então a arena vai
 * virando uma matilha atrás dos últimos sobreviventes. Ninguém sai da partida —
 * você só troca de lado, o que mantém todo mundo jogando até o fim.
 *
 * Pontuação: segundos vividos como fugitivo.
 */

const TIME_LIMIT = 70;
/**
 * O caçador é mais LENTO que o fugitivo.
 *
 * Com velocidades iguais, quem persegue mirando à frente sempre alcança — a
 * primeira versão do jogo acabava em 4 segundos. A desvantagem de velocidade é o
 * que obriga o caçador a encurralar, usar o dash e trabalhar em dupla.
 */
const HUNTER_SPEED = 0.95;
const RUNNER_SPEED = 1.06;
const TAG_GRACE = 1.1;
/** Tempo para os fugitivos se espalharem antes da caçada começar. */
const HEAD_START = 1.6;
/** Congelamento entre caçadas, para dar tempo de ler quem virou caçador. */
const BREAK_TIME = 1.5;

export interface SombraState extends BaseMatchState {
  hunters: Set<string>;
  /** carência após virar caçador, para não pegar geral no mesmo instante */
  grace: Record<string, number>;
  tags: Record<string, number>;
  /** caçada atual (o jogo é uma sequência delas até o tempo acabar) */
  wave: number;
  /** congelamento entre caçadas */
  breakTimer: number;
  rng: Rng;
}

/** Espalha todo mundo de novo e zera as velocidades para a próxima caçada. */
function resetPositions(state: SombraState): void {
  const spawns = ringSpawns(state.fighters.length, ARENA_CENTER.x, ARENA_CENTER.y, 200);
  state.fighters.forEach((fighter, index) => {
    const spot = state.hunters.has(fighter.id) ? ARENA_CENTER : spawns[index];
    fighter.x = spot.x;
    fighter.y = spot.y;
    fighter.vx = 0;
    fighter.vy = 0;
    fighter.dashTimer = 0;
    fighter.dashCooldown = 0;
    fighter.stunTimer = 0;
  });
}

/**
 * Começa uma caçada nova com um único caçador.
 *
 * O caçador escolhido é quem está LIDERANDO em tempo livre. É rubber band de
 * propósito: quem fugiu bem na caçada anterior passa a próxima correndo atrás
 * dos outros, e o placar não vira uma fila indiana.
 */
function startWave(state: SombraState): void {
  const leader = state.fighters
    .slice()
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))[0];
  state.hunters = new Set([leader.id]);
  state.grace = { [leader.id]: HEAD_START + BREAK_TIME };
  state.wave += 1;
  state.breakTimer = BREAK_TIME;
  resetPositions(state);
  state.events.push({ k: 'call', id: leader.id, x: leader.x, y: leader.y, v: 1 });
}

export const sombraGame: GameModule<SombraState> = {
  id: 'sombra',
  timeLimit: TIME_LIMIT,

  create(ctx: MatchContext): SombraState {
    const rng = createRng(ctx.seed);
    const spawns = ringSpawns(ctx.players.length, ARENA_CENTER.x, ARENA_CENTER.y, 200);
    const fighters = ctx.players.map((seed, i) =>
      createFighter(seed, spawns[i].x, spawns[i].y, 26),
    );
    const first = fighters[rng.int(0, fighters.length - 1)];
    return {
      ...createBaseState('sombra', ctx, fighters),
      hunters: new Set([first.id]),
      grace: { [first.id]: HEAD_START },
      tags: Object.fromEntries(fighters.map((f) => [f.id, 0])),
      wave: 1,
      breakTimer: 0,
      rng,
    };
  },

  step(state, dt, inputs) {
    const playing = advancePhase(state, dt);
    // durante o congelamento o relógio anda, mas ninguém controla nada
    const active = playing && state.breakTimer <= 0;
    stepBodies(state, dt, inputs, active, {
      knockScale: 0.8,
      speedScale: (f) => (state.hunters.has(f.id) ? HUNTER_SPEED : RUNNER_SPEED),
    });
    if (!playing) return;

    for (const id of Object.keys(state.grace)) {
      state.grace[id] = Math.max(0, state.grace[id] - dt);
    }

    if (state.breakTimer > 0) {
      state.breakTimer = Math.max(0, state.breakTimer - dt);
      if (state.breakTimer === 0) state.events.push({ k: 'go' });
      if (state.elapsed >= TIME_LIMIT) closeByScore(state);
      return;
    }

    // fugitivo pontua enquanto sobrevive
    for (const f of state.fighters) {
      if (state.hunters.has(f.id)) continue;
      f.score += dt;
    }

    // pegou: virou caçador
    for (const hunter of state.fighters) {
      if (!state.hunters.has(hunter.id) || (state.grace[hunter.id] ?? 0) > 0) continue;
      for (const prey of state.fighters) {
        if (state.hunters.has(prey.id)) continue;
        if (dist(hunter.x, hunter.y, prey.x, prey.y) > hunter.radius + prey.radius + 4) continue;

        state.hunters.add(prey.id);
        state.grace[prey.id] = TAG_GRACE;
        state.tags[hunter.id] = (state.tags[hunter.id] ?? 0) + 1;
        prey.squash = -0.7;
        prey.hitFlash = 1;
        state.events.push({
          k: 'trail-hit',
          id: prey.id,
          id2: hunter.id,
          x: prey.x,
          y: prey.y,
          v: 1,
        });
        break;
      }
    }

    if (state.elapsed >= TIME_LIMIT) {
      closeByScore(state);
      return;
    }

    /**
     * Matilha completa: a caçada acabou, começa outra.
     *
     * Antes o jogo terminava aqui — e terminava em 4 segundos numa sala de dois.
     * Agora a partida é uma sequência de caçadas dentro do tempo limite, então
     * ninguém fica de fora e o placar tem tempo de virar.
     */
    const runners = state.fighters.filter((f) => !state.hunters.has(f.id));
    if (runners.length === 0) startWave(state);
  },

  isOver(state) {
    return state.phase === 'over';
  },

  results(state): MatchResults {
    return buildResults(
      state,
      'sombra',
      (f) => `${round1(f.score).toFixed(1)}s livre`,
      (f) => {
        const tags = state.tags[f.id] ?? 0;
        return tags > 0 ? `${tags} pegou` : null;
      },
    );
  },

  snapshot(state, seq, now): Snapshot {
    const runners = state.fighters.filter((f) => !state.hunters.has(f.id)).length;
    const total = state.fighters.length;
    let banner: string | undefined;
    if (state.breakTimer > 0) banner = `CAÇADA ${state.wave}`;
    else if (runners === 1 && total > 2) banner = 'ÚLTIMO FUGITIVO!';
    return {
      ...baseSnapshotFields(state, seq, now, Math.max(0, TIME_LIMIT - state.elapsed)),
      ex: {
        ids: [...state.hunters],
        n: [runners, total, state.wave],
        s: banner,
      },
    };
  },

  bot(state, f, dt): InputState {
    const rng = state.rng;
    const beat = aiThink(f, dt, 0.34, rng.next);
    const isHunter = state.hunters.has(f.id);

    if (isHunter) {
      const prey = nearestOther(state.fighters, f, (p) => !state.hunters.has(p.id));
      if (!prey) {
        const dir = normalize(ARENA_CENTER.x - f.x, ARENA_CENTER.y - f.y);
        return { mx: dir.x, my: dir.y, dash: f.dashSeen };
      }
      // mira à frente do fugitivo
      const dir = normalize(prey.x + prey.vx * 0.22 - f.x, prey.y + prey.vy * 0.22 - f.y);
      const d = dist(f.x, f.y, prey.x, prey.y);
      return {
        mx: dir.x,
        my: dir.y,
        dash: beat && d < 180 && f.dashCooldown <= 0 && rng.chance(0.7) ? requestBotDash(f) : f.dashSeen,
      };
    }

    // fugitivo: soma a fuga de todos os caçadores e puxa para o centro
    let fleeX = 0;
    let fleeY = 0;
    let nearest = Infinity;
    for (const hunter of state.fighters) {
      if (!state.hunters.has(hunter.id)) continue;
      const d = dist(f.x, f.y, hunter.x, hunter.y);
      nearest = Math.min(nearest, d);
      const away = normalize(f.x - hunter.x, f.y - hunter.y);
      const weight = 1 / Math.max(60, d);
      fleeX += away.x * weight * 600;
      fleeY += away.y * weight * 600;
    }
    const toCenter = normalize(ARENA_CENTER.x - f.x, ARENA_CENTER.y - f.y);
    const dir = normalize(fleeX + toCenter.x * 0.5, fleeY + toCenter.y * 0.5);
    return {
      mx: dir.x,
      my: dir.y,
      dash: nearest < 130 && f.dashCooldown <= 0 && rng.chance(dt * 5) ? requestBotDash(f) : f.dashSeen,
    };
  },
};
