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
import { clamp, dist, normalize, round2 } from '../math';
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
import { ARENA_CENTER, buildResults, livesLabel, stepBodies } from './kit';

/**
 * DOIS!
 *
 * O número é chamado e todo mundo tem que se juntar em grupos EXATAMENTE desse
 * tamanho antes do tempo acabar. Grupo com gente sobrando vale nada, grupo com
 * gente faltando vale nada, e quando o número é 1 é o contrário: você tem que
 * estar sozinho.
 *
 * É o jogo mais social do portal: dá para puxar amigo, empurrar intruso e correr
 * de quem quer entrar no seu grupo.
 *
 * Códigos do snapshot: n = [número chamado, tempo, resolvendo, tamanho do grupo
 * de cada jogador na ordem do snapshot].
 */

const TIME_LIMIT = 82;
const LIVES = 3;
/** Distância que conta como "junto". O cliente desenha o laço com o mesmo valor. */
export const GROUP_RANGE = 104;
const RESOLVE_TIME = 1.4;

export interface DoisState extends BaseMatchState {
  called: number;
  timer: number;
  span: number;
  resolving: number;
  roundIndex: number;
  /** tamanho do grupo de cada jogador, recalculado todo passo */
  groupSize: Record<string, number>;
  safeRounds: Record<string, number>;
  rng: Rng;
}

function callTimeFor(index: number): number {
  return clamp(5.4 - index * 0.32, 2.8, 5.4);
}

/** Sorteia o número da rodada: nunca o mesmo duas vezes seguidas. */
function callFor(state: DoisState, alive: number): number {
  const options: number[] = [];
  if (alive >= 2) options.push(2, 2);
  if (alive >= 3) options.push(3);
  if (alive >= 4) options.push(2);
  // "sozinho" só entra em sala com gente suficiente para sobrar alguém
  if (alive >= 3) options.push(1);
  const pool = options.filter((value) => value !== state.called);
  const list = pool.length > 0 ? pool : options;
  return list.length > 0 ? list[state.rng.int(0, list.length - 1)] : 1;
}

/**
 * Tamanho do grupo de cada jogador (componentes conectados por proximidade).
 *
 * União simples por varredura: com até cinco jogadores não vale a pena um
 * union-find de verdade, e o resultado tem que ser idêntico no servidor e no
 * cliente — então nada de aleatoriedade na ordem.
 */
function computeGroups(state: DoisState): void {
  const alive = aliveFighters(state);
  const label = new Map<string, number>();
  alive.forEach((f, index) => label.set(f.id, index));

  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < alive.length; i += 1) {
      for (let j = i + 1; j < alive.length; j += 1) {
        const a = alive[i];
        const b = alive[j];
        if (dist(a.x, a.y, b.x, b.y) > GROUP_RANGE) continue;
        const la = label.get(a.id) ?? 0;
        const lb = label.get(b.id) ?? 0;
        const low = Math.min(la, lb);
        if (la !== low || lb !== low) {
          label.set(a.id, low);
          label.set(b.id, low);
          changed = true;
        }
      }
    }
  }

  const counts = new Map<number, number>();
  for (const f of alive) {
    const key = label.get(f.id) ?? 0;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  state.groupSize = {};
  for (const f of alive) {
    state.groupSize[f.id] = counts.get(label.get(f.id) ?? 0) ?? 1;
  }
}

export const doisGame: GameModule<DoisState> = {
  id: 'dois',
  timeLimit: TIME_LIMIT,

  create(ctx: MatchContext): DoisState {
    const rng = createRng(ctx.seed);
    const spawns = ringSpawns(ctx.players.length, ARENA_CENTER.x, ARENA_CENTER.y, 200);
    const fighters = ctx.players.map((seed, i) =>
      createFighter(seed, spawns[i].x, spawns[i].y, 26),
    );
    for (const fighter of fighters) fighter.lives = LIVES;
    const state: DoisState = {
      ...createBaseState('dois', ctx, fighters),
      called: 0,
      timer: callTimeFor(0),
      span: callTimeFor(0),
      resolving: 0,
      roundIndex: 0,
      groupSize: Object.fromEntries(fighters.map((f) => [f.id, 1])),
      safeRounds: Object.fromEntries(fighters.map((f) => [f.id, 0])),
      rng,
    };
    state.called = callFor(state, fighters.length);
    return state;
  },

  step(state, dt, inputs) {
    const playing = advancePhase(state, dt);
    stepBodies(state, dt, inputs, playing, { knockScale: 1.15 });
    if (!playing) return;

    computeGroups(state);

    if (state.resolving > 0) {
      state.resolving -= dt;
      if (state.resolving <= 0) {
        const alive = aliveFighters(state).length;
        state.roundIndex += 1;
        state.called = callFor(state, alive);
        state.span = callTimeFor(state.roundIndex);
        state.timer = state.span;
        state.events.push({ k: 'call', i: state.called, v: 1 });
      }
      return;
    }

    state.timer -= dt;
    if (state.timer <= 0) {
      for (const f of state.fighters) {
        if (!f.alive) continue;
        const size = state.groupSize[f.id] ?? 1;
        if (size === state.called) {
          state.safeRounds[f.id] = (state.safeRounds[f.id] ?? 0) + 1;
          f.score = state.safeRounds[f.id];
          state.events.push({ k: 'mine-safe', id: f.id, x: f.x, y: f.y, v: 0.5 });
        } else {
          hurt(state, f, { invuln: 1.2, kind: 'life-lost' });
        }
      }
      state.resolving = RESOLVE_TIME;
    }

    const alive = aliveFighters(state);
    if (alive.length <= 1 || state.elapsed >= TIME_LIMIT) {
      closeMatch(state, (a, b) => b.lives - a.lives || b.score - a.score);
    }
  },

  isOver(state) {
    return state.phase === 'over';
  },

  results(state): MatchResults {
    return buildResults(
      state,
      'dois',
      (f) => livesLabel(f),
      (f) => {
        const safe = state.safeRounds[f.id] ?? 0;
        return safe > 0 ? `${safe} grupo${safe === 1 ? '' : 's'} certo${safe === 1 ? '' : 's'}` : null;
      },
    );
  },

  snapshot(state, seq, now): Snapshot {
    return {
      ...baseSnapshotFields(state, seq, now, Math.max(0, TIME_LIMIT - state.elapsed)),
      ex: {
        n: [
          state.called,
          round2(Math.max(0, state.timer)),
          state.resolving > 0 ? 1 : 0,
          ...state.fighters.map((f) => state.groupSize[f.id] ?? 1),
        ],
        s:
          state.called === 1
            ? 'SOZINHO!'
            : `GRUPOS DE ${state.called}!`,
      },
    };
  },

  bot(state, f, dt): InputState {
    const rng = state.rng;
    aiThink(f, dt, 0.3, rng.next);
    const mySize = state.groupSize[f.id] ?? 1;
    const others = state.fighters.filter((p) => p !== f && p.alive);

    // reação humana: o bot leva um instante para entender o número novo
    const reacted = state.timer < state.span - f.ai.reaction * 2.6;

    if (state.resolving > 0 || !reacted) {
      const dir = normalize(f.ai.jitterX, f.ai.jitterY);
      return { mx: dir.x * 0.4, my: dir.y * 0.4, dash: f.dashSeen };
    }

    let nearest: Fighter | null = null;
    let nearestD = Infinity;
    for (const other of others) {
      const d = dist(f.x, f.y, other.x, other.y);
      if (d < nearestD) {
        nearestD = d;
        nearest = other;
      }
    }

    // "sozinho": o jogo é fugir de todo mundo
    if (state.called === 1) {
      if (!nearest) return { mx: 0, my: 0, dash: f.dashSeen };
      const away = normalize(f.x - nearest.x, f.y - nearest.y);
      const toCenter = normalize(ARENA_CENTER.x - f.x, ARENA_CENTER.y - f.y);
      const dir = normalize(away.x + toCenter.x * 0.3, away.y + toCenter.y * 0.3);
      return {
        mx: dir.x,
        my: dir.y,
        dash: nearestD < 150 && f.dashCooldown <= 0 && rng.chance(dt * 6) ? requestBotDash(f) : f.dashSeen,
      };
    }

    // grupo grande demais: sai de perto do que está mais longe do miolo
    if (mySize > state.called && nearest) {
      const away = normalize(f.x - nearest.x, f.y - nearest.y);
      return {
        mx: away.x,
        my: away.y,
        dash: f.dashCooldown <= 0 && rng.chance(dt * 4) ? requestBotDash(f) : f.dashSeen,
      };
    }

    // grupo certo: segura a posição
    if (mySize === state.called && nearest) {
      const hold = normalize(nearest.x - f.x, nearest.y - f.y);
      return { mx: hold.x * 0.2, my: hold.y * 0.2, dash: f.dashSeen };
    }

    // falta gente: corre para quem está mais perto e sozinho
    let target: Fighter | null = null;
    let targetScore = -Infinity;
    for (const other of others) {
      const size = state.groupSize[other.id] ?? 1;
      const d = dist(f.x, f.y, other.x, other.y);
      const score = -d - (size >= state.called ? 320 : 0);
      if (score > targetScore) {
        targetScore = score;
        target = other;
      }
    }
    if (!target) return { mx: 0, my: 0, dash: f.dashSeen };
    const dir = normalize(target.x - f.x, target.y - f.y);
    const d = dist(f.x, f.y, target.x, target.y);
    return {
      mx: dir.x,
      my: dir.y,
      dash:
        d > 200 && state.timer < 2 && f.dashCooldown <= 0 && rng.chance(dt * 6)
          ? requestBotDash(f)
          : f.dashSeen,
    };
  },
};
