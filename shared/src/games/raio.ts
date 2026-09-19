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
import { clamp, normalize, round2, TAU } from '../math';
import { createRng, type Rng } from '../rng';
import type {
  BaseMatchState,
  GameModule,
  InputState,
  MatchContext,
  MatchResults,
  Snapshot,
} from '../types';
import { ARENA_CENTER, buildResults, item, livesLabel, stepBodies } from './kit';

/**
 * RAIO!
 *
 * Feixes giram a partir do centro e a arena vira um relógio que machuca. O jogo
 * é achar o vão e andar no ritmo dele; a graça extra é empurrar o amigo para
 * dentro do feixe no último instante.
 *
 * Códigos do snapshot: k=0 feixe aceso, k=1 feixe avisando.
 */

const TIME_LIMIT = 95;
const LIVES = 3;
const BEAM_LENGTH = 620;
const BEAM_THICKNESS = 34;
const NEW_BEAM_EVERY = 17;
const MAX_BEAMS = 4;

interface Beam {
  angle: number;
  speed: number;
  warn: number;
}

export interface RaioState extends BaseMatchState {
  beams: Beam[];
  beamTimer: number;
  grazes: Record<string, number>;
  rng: Rng;
}

function makeBeam(rng: Rng, index: number): Beam {
  return {
    angle: rng.range(0, TAU),
    // alterna o sentido e acelera conforme entram feixes novos
    speed: (rng.chance(0.5) ? 1 : -1) * (0.45 + index * 0.12),
    warn: 1.6,
  };
}

/** Distância de um ponto até o feixe (segmento do centro para fora). */
function beamDistance(beam: Beam, x: number, y: number): number {
  const dx = x - ARENA_CENTER.x;
  const dy = y - ARENA_CENTER.y;
  const along = dx * Math.cos(beam.angle) + dy * Math.sin(beam.angle);
  if (along < 0 || along > BEAM_LENGTH) return Infinity;
  const perp = -dx * Math.sin(beam.angle) + dy * Math.cos(beam.angle);
  return Math.abs(perp);
}

export const raioGame: GameModule<RaioState> = {
  id: 'raio',
  timeLimit: TIME_LIMIT,

  create(ctx: MatchContext): RaioState {
    const rng = createRng(ctx.seed);
    const spawns = ringSpawns(ctx.players.length, ARENA_CENTER.x, ARENA_CENTER.y, 195);
    const fighters = ctx.players.map((seed, i) =>
      createFighter(seed, spawns[i].x, spawns[i].y, 26),
    );
    for (const fighter of fighters) fighter.lives = LIVES;
    return {
      ...createBaseState('raio', ctx, fighters),
      beams: [makeBeam(rng, 0)],
      beamTimer: NEW_BEAM_EVERY,
      grazes: Object.fromEntries(fighters.map((f) => [f.id, 0])),
      rng,
    };
  },

  step(state, dt, inputs) {
    const playing = advancePhase(state, dt);
    stepBodies(state, dt, inputs, playing, { knockScale: 1.05 });
    if (!playing) return;

    // entra feixe novo de vez em quando
    state.beamTimer -= dt;
    if (state.beamTimer <= 0 && state.beams.length < MAX_BEAMS) {
      state.beamTimer = NEW_BEAM_EVERY;
      state.beams.push(makeBeam(state.rng, state.beams.length));
      state.events.push({ k: 'beam-warn', v: 1 });
    }

    for (const beam of state.beams) {
      if (beam.warn > 0) {
        beam.warn = Math.max(0, beam.warn - dt);
        continue;
      }
      beam.angle = (beam.angle + beam.speed * dt) % TAU;

      for (const f of state.fighters) {
        if (!f.alive || f.invuln > 0) continue;
        const d = beamDistance(beam, f.x, f.y);
        if (d > BEAM_THICKNESS / 2 + f.radius) continue;

        // empurra para fora do feixe junto com o dano
        const push = normalize(
          -Math.sin(beam.angle) * Math.sign(beam.speed),
          Math.cos(beam.angle) * Math.sign(beam.speed),
        );
        f.vx += push.x * 420;
        f.vy += push.y * 420;
        hurt(state, f, { invuln: 1.6, kind: 'beam-hit' });
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
    return buildResults(state, 'raio', (f) => livesLabel(f));
  },

  snapshot(state, seq, now): Snapshot {
    return {
      ...baseSnapshotFields(state, seq, now, Math.max(0, TIME_LIMIT - state.elapsed)),
      ex: {
        items: state.beams.map((beam) =>
          item(ARENA_CENTER.x, ARENA_CENTER.y, 0, beam.warn > 0 ? 1 : 0, {
            a: round2(beam.angle),
            w: BEAM_LENGTH,
            h: BEAM_THICKNESS,
            v: round2(beam.warn),
          }),
        ),
        n: [state.beams.length],
      },
    };
  },

  bot(state, f, dt): InputState {
    const rng = state.rng;
    aiThink(f, dt, 0.28, rng.next);

    // foge do feixe mais próximo, acompanhando o sentido da rotação
    let escapeX = 0;
    let escapeY = 0;
    for (const beam of state.beams) {
      const d = beamDistance(beam, f.x, f.y);
      const threat = beam.warn > 0 ? 0.4 : 1;
      if (d > 190) continue;
      const weight = (1 - clamp(d / 190, 0, 1)) * threat;
      // perpendicular ao feixe, no sentido em que ele está indo
      const away = normalize(
        -Math.sin(beam.angle) * Math.sign(beam.speed),
        Math.cos(beam.angle) * Math.sign(beam.speed),
      );
      escapeX += away.x * weight * 2.4;
      escapeY += away.y * weight * 2.4;
    }

    // mantém distância confortável do centro (lá os feixes passam rápido)
    const fromCenter = normalize(f.x - ARENA_CENTER.x, f.y - ARENA_CENTER.y);
    const radius = Math.hypot(f.x - ARENA_CENTER.x, f.y - ARENA_CENTER.y);
    const radial = radius < 170 ? 1 : radius > 260 ? -1 : 0;
    escapeX += fromCenter.x * radial * 0.8;
    escapeY += fromCenter.y * radial * 0.8;

    const dir = normalize(escapeX + f.ai.jitterX * 0.004, escapeY + f.ai.jitterY * 0.004);
    const urgent = state.beams.some((beam) => beam.warn <= 0 && beamDistance(beam, f.x, f.y) < 70);
    return {
      mx: dir.x,
      my: dir.y,
      dash: urgent && f.dashCooldown <= 0 && rng.chance(dt * 5) ? requestBotDash(f) : f.dashSeen,
    };
  },
};
