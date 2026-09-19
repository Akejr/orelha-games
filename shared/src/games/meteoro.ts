import {
  advancePhase,
  aiThink,
  aliveFighters,
  baseSnapshotFields,
  closeMatch,
  createBaseState,
  createFighter,
  hurt,
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
import { ARENA, ARENA_CENTER, buildResults, item, livesLabel, stepBodies } from './kit';

/**
 * METEORO!
 *
 * Meteoros caem sem parar e sempre avisam: uma sombra cresce no chão marcando o
 * impacto. A graça é que a onda de choque empurra mesmo quem escapou — dá para
 * ser jogado de uma sombra para dentro da outra.
 *
 * Códigos do snapshot: k=0 sombra (v = progresso até o impacto), k=1 crateras/
 * explosão recente.
 */

const TIME_LIMIT = 90;
const LIVES = 3;
/**
 * Aviso curto e impacto largo: com 1,15s de sombra e raio pequeno, qualquer um
 * escapava andando e a rodada inteira passava sem um arranhão.
 */
const WARN_TIME = 0.62;
const BLAST_LIFE = 0.5;

interface Meteor {
  x: number;
  y: number;
  radius: number;
  timer: number;
  /** meteoro que mira em alguém (mais tenso que o aleatório) */
  tracking: boolean;
}

export interface MeteoroState extends BaseMatchState {
  meteors: Meteor[];
  blasts: { x: number; y: number; radius: number; life: number }[];
  spawnTimer: number;
  dodged: Record<string, number>;
  rng: Rng;
}

export const meteoroGame: GameModule<MeteoroState> = {
  id: 'meteoro',
  timeLimit: TIME_LIMIT,

  create(ctx: MatchContext): MeteoroState {
    const rng = createRng(ctx.seed);
    const spawns = ringSpawns(ctx.players.length, ARENA_CENTER.x, ARENA_CENTER.y, 170);
    const fighters = ctx.players.map((seed, i) =>
      createFighter(seed, spawns[i].x, spawns[i].y, 26),
    );
    for (const fighter of fighters) fighter.lives = LIVES;
    return {
      ...createBaseState('meteoro', ctx, fighters),
      meteors: [],
      blasts: [],
      spawnTimer: 1.4,
      dodged: Object.fromEntries(fighters.map((f) => [f.id, 0])),
      rng,
    };
  },

  step(state, dt, inputs) {
    const playing = advancePhase(state, dt);
    stepBodies(state, dt, inputs, playing, { knockScale: 1 });
    if (!playing) return;

    for (let i = state.blasts.length - 1; i >= 0; i -= 1) {
      state.blasts[i].life -= dt;
      if (state.blasts[i].life <= 0) state.blasts.splice(i, 1);
    }

    // chuva cada vez mais densa
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      const pressure = clamp01(state.elapsed / 55);
      state.spawnTimer = clamp(1.15 - pressure * 0.78, 0.32, 1.15);

      const alive = aliveFighters(state);
      const tracking = alive.length > 0 && state.rng.chance(0.6);
      const radius = state.rng.range(92, 172);
      let x: number;
      let y: number;
      if (tracking) {
        // mira onde o jogador estará, não onde está
        const victim = alive[state.rng.int(0, alive.length - 1)];
        x = victim.x + victim.vx * 0.55;
        y = victim.y + victim.vy * 0.55;
      } else {
        x = state.rng.range(ARENA.x + 60, ARENA.x + ARENA.w - 60);
        y = state.rng.range(ARENA.y + 60, ARENA.y + ARENA.h - 60);
      }
      const meteor: Meteor = {
        x: clamp(x, ARENA.x + 50, ARENA.x + ARENA.w - 50),
        y: clamp(y, ARENA.y + 50, ARENA.y + ARENA.h - 50),
        radius,
        timer: WARN_TIME,
        tracking,
      };
      state.meteors.push(meteor);
      state.events.push({ k: 'meteor-warn', x: meteor.x, y: meteor.y, v: tracking ? 1 : 0.5 });
    }

    for (let i = state.meteors.length - 1; i >= 0; i -= 1) {
      const meteor = state.meteors[i];
      meteor.timer -= dt;
      if (meteor.timer > 0) continue;

      state.meteors.splice(i, 1);
      state.blasts.push({ x: meteor.x, y: meteor.y, radius: meteor.radius, life: BLAST_LIFE });
      state.events.push({ k: 'meteor-hit', x: meteor.x, y: meteor.y, v: 1, i: Math.round(meteor.radius) });

      for (const f of state.fighters) {
        if (!f.alive) continue;
        const d = dist(f.x, f.y, meteor.x, meteor.y);

        // impacto direto
        if (d < meteor.radius + f.radius * 0.5) {
          hurt(state, f, { invuln: 1.7, x: f.x, y: f.y, kind: 'life-lost' });
          continue;
        }

        // onda de choque: empurra quem passou raspando
        const shock = meteor.radius * 2.1;
        if (d < shock) {
          const n = normalize(f.x - meteor.x, f.y - meteor.y);
          const force = (1 - d / shock) * 640;
          f.vx += n.x * force;
          f.vy += n.y * force;
          f.squash = -0.4;
          if (f.invuln <= 0) state.dodged[f.id] = (state.dodged[f.id] ?? 0) + 1;
        }
      }
    }

    const alive = aliveFighters(state);
    for (const f of alive) f.score = f.survived;
    if (alive.length <= 1 || state.elapsed >= TIME_LIMIT) {
      closeMatch(state, (a, b) => b.lives - a.lives || b.survived - a.survived);
    }
  },

  isOver(state) {
    return state.phase === 'over';
  },

  results(state): MatchResults {
    return buildResults(
      state,
      'meteoro',
      (f) => livesLabel(f),
      (f) => {
        const near = state.dodged[f.id] ?? 0;
        return near > 2 ? `${near} quase-acertos` : null;
      },
    );
  },

  snapshot(state, seq, now): Snapshot {
    return {
      ...baseSnapshotFields(state, seq, now, Math.max(0, TIME_LIMIT - state.elapsed)),
      ex: {
        items: [
          ...state.meteors.map((meteor) =>
            item(meteor.x, meteor.y, meteor.radius, 0, {
              v: round2(1 - meteor.timer / WARN_TIME),
              o: meteor.tracking ? 1 : 0,
            }),
          ),
          ...state.blasts.map((blast) =>
            item(blast.x, blast.y, blast.radius, 1, {
              v: round2(blast.life / BLAST_LIFE),
            }),
          ),
        ],
        n: [state.meteors.length],
      },
    };
  },

  bot(state, f, dt): InputState {
    const rng = state.rng;
    aiThink(f, dt, 0.24, rng.next);

    let escapeX = 0;
    let escapeY = 0;
    let danger = 0;

    for (const meteor of state.meteors) {
      // tempo de reação: o bot não "vê" a sombra no primeiro instante
      if (meteor.timer > WARN_TIME - f.ai.reaction * 1.6) continue;
      const d = dist(f.x, f.y, meteor.x, meteor.y);
      const zone = meteor.radius * 2.3;
      if (d > zone) continue;
      // quanto menos tempo sobra, mais urgente é sair
      const urgency = (1 - clamp01(meteor.timer / WARN_TIME)) * 1.6 + 0.4;
      const weight = (1 - clamp01(d / zone)) * urgency;
      const away = normalize(f.x - meteor.x, f.y - meteor.y);
      escapeX += away.x * weight * 3;
      escapeY += away.y * weight * 3;
      danger = Math.max(danger, weight);
    }

    // sem perigo: circula pelo miolo, onde há mais saída
    if (danger < 0.05) {
      const toCenter = normalize(
        ARENA_CENTER.x - f.x + f.ai.jitterX,
        ARENA_CENTER.y - f.y + f.ai.jitterY,
      );
      return { mx: toCenter.x * 0.7, my: toCenter.y * 0.7, dash: f.dashSeen };
    }

    const dir = normalize(escapeX, escapeY);
    return {
      mx: dir.x,
      my: dir.y,
      dash: danger > 0.75 && f.dashCooldown <= 0 && rng.chance(dt * 6) ? requestBotDash(f) : f.dashSeen,
    };
  },
};
