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
import { clamp, dist, normalize, round2, TAU } from '../math';
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
import { ARENA_CENTER, buildResults, item, stepBodies } from './kit';

/**
 * CADEIRAS!
 *
 * Dança das cadeiras. Enquanto a música toca as cadeiras giram pela arena; no
 * apito elas param e quem não estiver em cima de uma sai. Sempre tem uma cadeira
 * menos que gente — e a cada rodada sai outra.
 *
 * Códigos do snapshot: k=0 cadeira livre, k=1 cadeira ocupada, k=2 cadeira
 * girando (música tocando).
 */

const TIME_LIMIT = 95;
const CHAIR_RADIUS = 58;
const ORBIT = 150;

export interface CadeirasState extends BaseMatchState {
  /** posição das cadeiras (giram durante a música) */
  chairs: { x: number; y: number }[];
  chairCount: number;
  spin: number;
  spinSpeed: number;
  /** 'musica' -> 'apito' -> pausa curta */
  phaseName: 'musica' | 'apito';
  timer: number;
  roundIndex: number;
  claimed: Record<string, number>;
  saves: Record<string, number>;
  rng: Rng;
}

/**
 * Vidas por tamanho de sala.
 *
 * Com eliminação direta, uma sala de 2 pessoas acabava em 6 segundos (uma rodada
 * e pronto). Duas vidas resolveram para sala cheia, mas o duelo continuava curto
 * — só uma pessoa perde vida por apito, então quanto menos gente, menos apitos
 * cabem na partida. Sala pequena ganha uma vida a mais.
 */
function livesFor(count: number): number {
  return count <= 3 ? 4 : 2;
}

/** Música mais longa em sala pequena: menos gente disputando, menos correria. */
function musicTimeFor(index: number, players: number): number {
  const base = players <= 3 ? 7.5 : 6.5;
  return clamp(base - index * 0.5, players <= 3 ? 4.5 : 3, base);
}

function layoutChairs(state: CadeirasState): void {
  const count = state.chairCount;
  state.chairs = [];
  for (let i = 0; i < count; i += 1) {
    const angle = state.spin + (i / Math.max(1, count)) * TAU;
    state.chairs.push({
      x: ARENA_CENTER.x + Math.cos(angle) * ORBIT,
      y: ARENA_CENTER.y + Math.sin(angle) * ORBIT * 0.78,
    });
  }
}

export const cadeirasGame: GameModule<CadeirasState> = {
  id: 'cadeiras',
  timeLimit: TIME_LIMIT,

  create(ctx: MatchContext): CadeirasState {
    const rng = createRng(ctx.seed);
    const spawns = ringSpawns(ctx.players.length, ARENA_CENTER.x, ARENA_CENTER.y, 230);
    const fighters = ctx.players.map((seed, i) =>
      createFighter(seed, spawns[i].x, spawns[i].y, 26),
    );
    for (const fighter of fighters) fighter.lives = livesFor(fighters.length);
    const state: CadeirasState = {
      ...createBaseState('cadeiras', ctx, fighters),
      chairs: [],
      chairCount: Math.max(1, fighters.length - 1),
      spin: rng.range(0, TAU),
      spinSpeed: rng.chance(0.5) ? 0.55 : -0.55,
      phaseName: 'musica',
      timer: musicTimeFor(0, fighters.length),
      roundIndex: 0,
      claimed: Object.fromEntries(fighters.map((f) => [f.id, 0])),
      saves: Object.fromEntries(fighters.map((f) => [f.id, 0])),
      rng,
    };
    layoutChairs(state);
    return state;
  },

  step(state, dt, inputs) {
    const playing = advancePhase(state, dt);
    stepBodies(state, dt, inputs, playing, { knockScale: 1.15 });
    if (!playing) return;

    if (state.phaseName === 'musica') {
      state.spin += state.spinSpeed * dt;
      layoutChairs(state);
    }

    state.timer -= dt;
    if (state.timer > 0) return;

    if (state.phaseName === 'musica') {
      // APITO: as cadeiras congelam e vale quem está em cima
      state.phaseName = 'apito';
      state.timer = 1.3;
      state.events.push({ k: 'call', v: 1 });

      const taken = new Set<number>();
      const survivors: Fighter[] = [];
      const alive = aliveFighters(state);

      // quem está mais no centro da cadeira garante o lugar
      const claims = alive
        .map((fighter) => {
          let bestIndex = -1;
          let bestDist = Infinity;
          state.chairs.forEach((chair, index) => {
            const d = dist(fighter.x, fighter.y, chair.x, chair.y);
            if (d < CHAIR_RADIUS && d < bestDist) {
              bestDist = d;
              bestIndex = index;
            }
          });
          return { fighter, chair: bestIndex, distance: bestDist };
        })
        .sort((a, b) => a.distance - b.distance);

      for (const claim of claims) {
        if (claim.chair < 0 || taken.has(claim.chair)) continue;
        taken.add(claim.chair);
        survivors.push(claim.fighter);
        state.claimed[claim.fighter.id] = (state.claimed[claim.fighter.id] ?? 0) + 1;
        claim.fighter.score = state.claimed[claim.fighter.id];
        state.events.push({
          k: 'mine-safe',
          id: claim.fighter.id,
          x: claim.fighter.x,
          y: claim.fighter.y,
          v: 0.5,
        });
      }

      for (const fighter of alive) {
        if (survivors.includes(fighter)) continue;
        hurt(state, fighter, { invuln: 0.2, kind: 'life-lost' });
      }
      return;
    }

    // fim da pausa: começa a próxima música com uma cadeira menos
    const alive = aliveFighters(state);
    if (alive.length <= 1) {
      closeMatch(state, (a, b) => b.score - a.score || b.survived - a.survived);
      return;
    }
    state.roundIndex += 1;
    // sempre uma cadeira menos que gente na pista
    state.chairCount = Math.max(1, alive.length - 1);
    state.spinSpeed = (state.rng.chance(0.5) ? 1 : -1) * (0.55 + state.roundIndex * 0.12);
    state.phaseName = 'musica';
    state.timer = musicTimeFor(state.roundIndex, state.fighters.length);
    layoutChairs(state);
    state.events.push({ k: 'wall-spawn', v: 0.5 });

    if (state.elapsed >= TIME_LIMIT) {
      closeMatch(state, (a, b) => b.score - a.score || b.survived - a.survived);
    }
  },

  isOver(state) {
    return state.phase === 'over';
  },

  results(state): MatchResults {
    return buildResults(
      state,
      'cadeiras',
      (f) => {
        const claims = state.claimed[f.id] ?? 0;
        return `${claims} ${claims === 1 ? 'cadeira' : 'cadeiras'}`;
      },
      (f) => (f.place === 1 ? 'última de pé' : null),
    );
  },

  snapshot(state, seq, now): Snapshot {
    const music = state.phaseName === 'musica';
    return {
      ...baseSnapshotFields(state, seq, now, Math.max(0, TIME_LIMIT - state.elapsed)),
      ex: {
        items: state.chairs.map((chair) => item(chair.x, chair.y, CHAIR_RADIUS, music ? 2 : 0)),
        n: [state.chairCount, round2(Math.max(0, state.timer)), music ? 1 : 0],
        s: music ? 'MÚSICA TOCANDO…' : 'APITO! ACHOU CADEIRA?',
      },
    };
  },

  bot(state, f, dt): InputState {
    const rng = state.rng;
    aiThink(f, dt, 0.3, rng.next);

    // escolhe a cadeira mais próxima que ninguém está disputando de perto
    let best: { x: number; y: number } | null = null;
    let bestScore = -Infinity;
    for (const chair of state.chairs) {
      const myD = dist(f.x, f.y, chair.x, chair.y);
      let rivalD = Infinity;
      for (const other of state.fighters) {
        if (other === f || !other.alive) continue;
        rivalD = Math.min(rivalD, dist(other.x, other.y, chair.x, chair.y));
      }
      const score = -myD + (rivalD === Infinity ? 0 : Math.min(rivalD, 220)) * 0.55;
      if (score > bestScore) {
        bestScore = score;
        best = chair;
      }
    }
    if (!best) {
      const dir = normalize(ARENA_CENTER.x - f.x, ARENA_CENTER.y - f.y);
      return { mx: dir.x, my: dir.y, dash: f.dashSeen };
    }

    const d = dist(f.x, f.y, best.x, best.y);
    const dir = normalize(best.x - f.x, best.y - f.y);
    // com a música tocando fica rondando por perto; no apito é corrida
    const urgency = state.phaseName === 'musica' ? state.timer < 1.4 : true;
    const keepClose = !urgency && d < CHAIR_RADIUS * 1.6 ? 0.35 : 1;
    return {
      mx: dir.x * keepClose,
      my: dir.y * keepClose,
      dash:
        urgency && d > 130 && f.dashCooldown <= 0 && rng.chance(dt * 6)
          ? requestBotDash(f)
          : f.dashSeen,
    };
  },
};
