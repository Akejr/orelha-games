import {
  advancePhase,
  aiThink,
  aliveFighters,
  baseSnapshotFields,
  closeMatch,
  createBaseState,
  createFighter,
  eliminate,
  isOutsideCircle,
  moveConfig,
  nearestOther,
  requestBotDash,
  resolveFighterCollisions,
  ringSpawns,
  stepDead,
  stepFighter,
} from '../engine';
import { clamp01, dist, normalize, round2 } from '../math';
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
import { buildResults, freeSpot, item } from './kit';

/**
 * PESO!
 *
 * Halteres caem na arena. Cada um que você pega te deixa mais lento, mas muito
 * mais difícil de empurrar — e a sua trombada passa a arremessar. É o jogo de
 * escolha do portal: ficar leve e ágil ou virar um tanque que não sai do lugar.
 *
 * Códigos do snapshot: k=0 halteres no chão.
 */

const CENTER = { x: WORLD.w / 2, y: WORLD.h / 2 };
const RADIUS_START = 280;
/**
 * A arena fecha devagar, mas não menos que isso.
 *
 * Raio menor que ~190 com dash de 220 unidades transforma o dash em suicídio: o
 * jogo trava porque ninguém ataca. Aqui a pressão vem de fechar a arena E de
 * parar de soltar halteres, não de apertar até a borda encostar em todo mundo.
 */
const RADIUS_MIN = 188;
const SHRINK_AT = 9;
const SHRINK_DURATION = 46;
const TIME_LIMIT = 80;
const MAX_LOAD = 5;
const SPAWN_EVERY = 2.6;
const MAX_ON_FLOOR = 4;
/**
 * Depois disso não cai mais haltere.
 *
 * Enquanto havia peso no chão os bots ficavam farmando e a partida terminava no
 * tempo com zero eliminações. Sem haltere novo, o chão esvazia e a única coisa
 * que sobra para fazer é empurrar alguém.
 */
const SPAWN_UNTIL = 48;

const CFG = moveConfig({
  accel: 5200,
  maxSpeed: 440,
  friction: 0.86,
  radius: 27,
  dashSpeed: 1180,
  dashTime: 0.19,
  dashCooldown: 0.6,
  knockback: 700,
  bounce: 0.55,
});

export interface PesoState extends BaseMatchState {
  weights: { x: number; y: number }[];
  spawnTimer: number;
  radius: number;
  /** quantos halteres cada um carrega (0..MAX_LOAD) */
  load: Record<string, number>;
  rng: Rng;
}

/** Cada haltere tira velocidade e adiciona resistência/força. */
function speedFor(load: number): number {
  return 1 - Math.min(0.4, load * 0.09);
}
function powerFor(load: number): number {
  return 1 + load * 0.3;
}
function resistFor(load: number): number {
  return 1 / (1 + load * 0.45);
}

export const pesoGame: GameModule<PesoState> = {
  id: 'peso',
  timeLimit: TIME_LIMIT,

  create(ctx: MatchContext): PesoState {
    const rng = createRng(ctx.seed);
    const spawns = ringSpawns(ctx.players.length, CENTER.x, CENTER.y, 150);
    const fighters = ctx.players.map((seed, i) =>
      createFighter(seed, spawns[i].x, spawns[i].y, 27),
    );
    const state: PesoState = {
      ...createBaseState('peso', ctx, fighters),
      weights: [],
      spawnTimer: 1.2,
      radius: RADIUS_START,
      load: Object.fromEntries(fighters.map((f) => [f.id, 0])),
      rng,
    };
    for (let i = 0; i < 3; i += 1) {
      state.weights.push(freeSpot(rng, fighters, 120, 140));
    }
    return state;
  },

  step(state, dt, inputs) {
    const playing = advancePhase(state, dt);

    for (const f of state.fighters) {
      if (!f.alive) {
        stepDead(f, dt);
        continue;
      }
      const input = playing ? inputs[f.id] ?? emptyInput() : emptyInput();
      stepFighter(f, input, CFG, dt, state.events, {
        speedScale: speedFor(state.load[f.id] ?? 0),
      });
      if (playing) f.survived = state.elapsed;
    }

    // colisão com peso: o mais carregado arremessa, o mais leve voa
    resolveFighterCollisions(state.fighters, CFG, state.events, {
      onHit: (attacker, victim) => {
        const power = powerFor(state.load[attacker.id] ?? 0);
        const resist = resistFor(state.load[victim.id] ?? 0);
        const factor = power * resist - 1;
        if (Math.abs(factor) < 0.01) return;
        const n = normalize(victim.x - attacker.x, victim.y - attacker.y);
        const extra = CFG.knockback * factor;
        victim.vx += n.x * extra;
        victim.vy += n.y * extra;
      },
    });

    if (!playing) return;

    const shrink = clamp01((state.elapsed - SHRINK_AT) / SHRINK_DURATION);
    state.radius = RADIUS_START - (RADIUS_START - RADIUS_MIN) * shrink;

    // halteres novos
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0 && state.elapsed < SPAWN_UNTIL && state.weights.length < MAX_ON_FLOOR) {
      state.spawnTimer = SPAWN_EVERY;
      state.weights.push(freeSpot(state.rng, state.fighters, 110, 120));
    }

    for (const f of state.fighters) {
      if (!f.alive) continue;
      for (let i = state.weights.length - 1; i >= 0; i -= 1) {
        const weight = state.weights[i];
        if (dist(f.x, f.y, weight.x, weight.y) > f.radius + 24) continue;
        if ((state.load[f.id] ?? 0) >= MAX_LOAD) continue;
        state.weights.splice(i, 1);
        state.load[f.id] = (state.load[f.id] ?? 0) + 1;
        f.squash = -0.45;
        state.events.push({ k: 'pickup', id: f.id, x: weight.x, y: weight.y, v: 0.6 });
      }
    }

    for (const f of state.fighters) {
      if (!f.alive) continue;
      if (isOutsideCircle(f, CENTER.x, CENTER.y, state.radius)) eliminate(state, f, { v: 1 });
      else f.score = f.survived;
    }

    const alive = aliveFighters(state);
    if (alive.length <= 1 || state.elapsed >= TIME_LIMIT) {
      /**
       * No fim do tempo todos os sobreviventes têm o mesmo tempo de arena, então
       * o desempate é a carga: quem aguentou segurando mais peso leva.
       */
      closeMatch(
        state,
        (a, b) =>
          b.survived - a.survived ||
          (state.load[b.id] ?? 0) - (state.load[a.id] ?? 0) ||
          a.stagger - b.stagger,
      );
    }
  },

  isOver(state) {
    return state.phase === 'over';
  },

  results(state): MatchResults {
    return buildResults(
      state,
      'peso',
      (f) => `${f.survived.toFixed(1)}s na arena`,
      (f) => {
        const load = state.load[f.id] ?? 0;
        return load > 0 ? `${load} ${load === 1 ? 'haltere' : 'halteres'}` : 'ficou leve';
      },
    );
  },

  snapshot(state, seq, now): Snapshot {
    return {
      ...baseSnapshotFields(state, seq, now, Math.max(0, TIME_LIMIT - state.elapsed)),
      ex: {
        items: [
          // k=1 marca a borda da arena circular para o renderer (v = o quanto já fechou)
          item(CENTER.x, CENTER.y, state.radius, 1, {
            v: round2(clamp01((RADIUS_START - state.radius) / (RADIUS_START - RADIUS_MIN))),
          }),
          ...state.weights.map((weight) => item(weight.x, weight.y, 24, 0)),
        ],
        // carga de cada jogador, na ordem do snapshot
        n: state.fighters.map((f) => state.load[f.id] ?? 0),
      },
    };
  },

  bot(state, f, dt): InputState {
    const rng = state.rng;
    const beat = aiThink(f, dt, 0.4, rng.next);
    const myLoad = state.load[f.id] ?? 0;
    const margin = state.radius - dist(f.x, f.y, CENTER.x, CENTER.y);

    // perto da borda: volta para o miolo antes de qualquer coisa
    if (margin < 60) {
      const back = normalize(CENTER.x - f.x, CENTER.y - f.y);
      return {
        mx: back.x,
        my: back.y,
        dash: margin < 22 && f.dashCooldown <= 0 && rng.chance(0.4) ? requestBotDash(f) : f.dashSeen,
      };
    }

    const target = nearestOther(state.fighters, f);
    const targetLoad = target ? state.load[target.id] ?? 0 : 0;

    let best = state.weights[0];
    let bestD = Infinity;
    for (const weight of state.weights) {
      const d = dist(f.x, f.y, weight.x, weight.y);
      if (d < bestD) {
        bestD = d;
        best = weight;
      }
    }

    /**
     * Só vai atrás de haltere se estiver perto e ainda em desvantagem de peso.
     *
     * A regra antiga ("tem mais de 2 no chão") fazia o bot atravessar a arena
     * para catar peso a partida inteira, e o jogo terminava no tempo sem uma
     * única eliminação. Buscar vantagem é um meio; o fim é empurrar alguém.
     */
    const wantWeight =
      myLoad < MAX_LOAD && bestD < 250 && (myLoad < targetLoad + 1 || myLoad < 2);

    if (wantWeight && state.weights.length > 0 && best) {
      const dir = normalize(best.x - f.x, best.y - f.y);
      return {
        mx: dir.x,
        my: dir.y,
        dash: bestD > 190 && f.dashCooldown <= 0 && rng.chance(dt * 2) ? requestBotDash(f) : f.dashSeen,
      };
    }

    if (!target) {
      const dir = normalize(CENTER.x - f.x, CENTER.y - f.y);
      return { mx: dir.x, my: dir.y, dash: f.dashSeen };
    }

    // ataca quem está mais exposto, de preferência mais leve que você
    const dir = normalize(target.x - f.x, target.y - f.y);
    const targetMargin = state.radius - dist(target.x, target.y, CENTER.x, CENTER.y);
    const landing = dist(f.x + dir.x * 200, f.y + dir.y * 200, CENTER.x, CENTER.y);
    const safe = landing < state.radius - 24;
    // aceita brigar mesmo dois halteres atrás: exigir vantagem travava a partida
    const good = targetMargin < margin + 110 && myLoad >= targetLoad - 2;
    return {
      mx: dir.x,
      my: dir.y,
      dash:
        beat && safe && good && dist(f.x, f.y, target.x, target.y) < 235 && f.dashCooldown <= 0 && rng.chance(0.85)
          ? requestBotDash(f)
          : f.dashSeen,
    };
  },
};
