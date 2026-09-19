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
import { clamp01, dist, normalize, TAU } from '../math';
import { createRng, type Rng } from '../rng';
import type {
  BaseMatchState,
  GameModule,
  GenericItem,
  InputState,
  MatchContext,
  MatchResults,
  Snapshot,
} from '../types';
import { ARENA_CENTER, buildResults, item, livesLabel, stepBodies } from './kit';

/**
 * RASTRO!
 *
 * Todo mundo deixa um rastro que endurece um instante depois de passar. Encostar
 * em qualquer rastro — inclusive no seu — custa uma vida. Como os rastros somem
 * com o tempo, a arena está sempre se reabrindo, e o jogo virou o mais caótico
 * do portal: dá para fechar o amigo numa espiral.
 *
 * Rede: enviar o rastro inteiro a cada snapshot custaria dezenas de KB/s. Em vez
 * disso o servidor manda apenas os pontos NOVOS de cada snapshot (k=2) e o
 * cliente acumula e expira pelo tempo de vida em `n[0]`. Perder um pacote custa
 * um pontinho de rastro no desenho, nunca a lógica — a colisão é do servidor.
 */

const TIME_LIMIT = 95;
const LIVES = 4;
const POINT_EVERY = 0.1;
const POINT_LIFE = 4.2;
/**
 * Tempo até o rastro endurecer.
 *
 * O raio de curva na velocidade atual é ~45 u, e o personagem percorre ~240 u em
 * 0,55s. Endurecer antes disso fazia o jogador morrer na própria curva no
 * primeiro segundo de jogo — o rastro precisa ficar macio o suficiente para
 * caber uma manobra.
 */
const HARDEN = 0.55;
const POINT_RADIUS = 12;

interface TrailPoint {
  x: number;
  y: number;
  slot: number;
  ownerId: string;
  age: number;
  big: boolean;
}

export interface RastroState extends BaseMatchState {
  trail: TrailPoint[];
  emit: Record<string, number>;
  /** pontos criados desde o último snapshot (delta de rede) */
  fresh: TrailPoint[];
  crashes: Record<string, number>;
  rng: Rng;
}

export const rastroGame: GameModule<RastroState> = {
  id: 'rastro',
  timeLimit: TIME_LIMIT,

  create(ctx: MatchContext): RastroState {
    const rng = createRng(ctx.seed);
    const spawns = ringSpawns(ctx.players.length, ARENA_CENTER.x, ARENA_CENTER.y, 190);
    const fighters = ctx.players.map((seed, i) =>
      createFighter(seed, spawns[i].x, spawns[i].y, 25),
    );
    for (const fighter of fighters) fighter.lives = LIVES;
    return {
      ...createBaseState('rastro', ctx, fighters),
      trail: [],
      emit: Object.fromEntries(fighters.map((f) => [f.id, 0])),
      fresh: [],
      crashes: Object.fromEntries(fighters.map((f) => [f.id, 0])),
      rng,
    };
  },

  step(state, dt, inputs) {
    const playing = advancePhase(state, dt);
    stepBodies(state, dt, inputs, playing, { knockScale: 1, bounce: 0.5 });
    if (!playing) return;

    // envelhece e expira o rastro
    for (let i = state.trail.length - 1; i >= 0; i -= 1) {
      state.trail[i].age += dt;
      if (state.trail[i].age > POINT_LIFE) state.trail.splice(i, 1);
    }

    // emite pontos novos
    for (const f of state.fighters) {
      if (!f.alive) continue;
      state.emit[f.id] = (state.emit[f.id] ?? 0) - dt;
      if (state.emit[f.id] > 0) continue;
      state.emit[f.id] = POINT_EVERY;
      const point: TrailPoint = {
        x: f.x,
        y: f.y,
        slot: f.slot,
        ownerId: f.id,
        age: 0,
        big: f.dashTimer > 0,
      };
      state.trail.push(point);
      state.fresh.push(point);
    }

    // colisão com rastro endurecido
    for (const f of state.fighters) {
      if (!f.alive || f.invuln > 0) continue;
      for (const point of state.trail) {
        if (point.age < HARDEN) continue;
        const radius = point.big ? POINT_RADIUS * 1.5 : POINT_RADIUS;
        if (dist(f.x, f.y, point.x, point.y) > f.radius + radius - 8) continue;

        state.crashes[f.id] = (state.crashes[f.id] ?? 0) + 1;
        state.events.push({
          k: 'trail-hit',
          id: f.id,
          id2: point.ownerId,
          x: f.x,
          y: f.y,
          v: 1,
        });
        hurt(state, f, { invuln: 1.8, kind: 'life-lost' });
        // limpa o rastro de quem bateu: dá espaço para voltar ao jogo
        state.trail = state.trail.filter((entry) => entry.ownerId !== f.id);
        break;
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
      'rastro',
      (f) => livesLabel(f),
      (f) => {
        const crashes = state.crashes[f.id] ?? 0;
        return crashes > 0 ? `${crashes} batida${crashes === 1 ? '' : 's'}` : 'sem encostar em nada';
      },
    );
  },

  snapshot(state, seq, now): Snapshot {
    const items: GenericItem[] = state.fresh.map((point) =>
      item(point.x, point.y, point.big ? POINT_RADIUS * 1.5 : POINT_RADIUS, 2, {
        o: point.slot,
        v: point.big ? 1 : 0,
      }),
    );
    state.fresh = [];
    return {
      ...baseSnapshotFields(state, seq, now, Math.max(0, TIME_LIMIT - state.elapsed)),
      ex: { items, n: [POINT_LIFE, HARDEN] },
    };
  },

  bot(state, f, dt): InputState {
    const rng = state.rng;
    aiThink(f, dt, 0.22, rng.next);

    // procura a direção mais livre olhando em leque à frente
    const forward = Math.atan2(f.vy || 0.01, f.vx || 0.01);
    let bestAngle = forward;
    let bestScore = -Infinity;

    for (let i = 0; i < 16; i += 1) {
      const angle = forward + (i - 8) * 0.28;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const px = f.x + cos * 220;
      const py = f.y + sin * 220;

      let score = 0;
      // varre o raio inteiro, não só a ponta: rastro no meio do caminho mata
      for (const point of state.trail) {
        if (point.age < HARDEN * 0.6) continue;
        let nearest = Infinity;
        for (const reach of [70, 130, 190, 240]) {
          const d = dist(f.x + cos * reach, f.y + sin * reach, point.x, point.y);
          if (d < nearest) nearest = d;
        }
        if (nearest < 95) score -= (95 - nearest) * 1.8;
      }
      // penaliza parede
      const margin = Math.min(
        px - (ARENA_CENTER.x - 420),
        ARENA_CENTER.x + 420 - px,
        py - (ARENA_CENTER.y - 260),
        ARENA_CENTER.y + 260 - py,
      );
      if (margin < 90) score -= (90 - margin) * 2.2;
      // prefere manter o rumo (curvas suaves)
      score -= Math.abs(i - 8) * 3.2;
      score += clamp01(1 - Math.abs(i - 8) / 8) * 6;

      if (score > bestScore) {
        bestScore = score;
        bestAngle = angle;
      }
    }

    const dir = { x: Math.cos(bestAngle), y: Math.sin(bestAngle) };
    // encurralado: dash para furar o corredor
    const trapped = bestScore < -140;
    return {
      mx: dir.x,
      my: dir.y,
      dash: trapped && f.dashCooldown <= 0 && rng.chance(dt * 4) ? requestBotDash(f) : f.dashSeen,
    };
  },
};
