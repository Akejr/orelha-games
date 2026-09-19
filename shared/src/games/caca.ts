import {
  advancePhase,
  aiThink,
  baseSnapshotFields,
  createBaseState,
  createFighter,
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
import { ARENA_CENTER, buildResults, closeByScore, freeSpot, pointsLabel, stepBodies } from './kit';

/**
 * CAÇA!
 *
 * Tem um baú enterrado em algum lugar e ninguém sabe onde. O que você tem é um
 * medidor: quanto mais perto, mais quente. Dash cava — cavou no lugar certo, o
 * baú é seu e outro é enterrado em outro canto.
 *
 * O detalhe que faz o jogo virar social: o calor dos OUTROS também é visível.
 * Quando alguém começa a esquentar, todo mundo corre para cima.
 *
 * O baú nunca vai no snapshot: só a temperatura de cada um. É o que impede que um
 * cliente modificado saiba a resposta.
 */

const TIME_LIMIT = 75;
const DIG_RADIUS = 62;
/** Distância a partir da qual o medidor está totalmente frio. */
const COLD_AT = 520;

export interface CacaState extends BaseMatchState {
  chest: { x: number; y: number };
  /** true enquanto o jogador está no meio de um dash (para cavar uma vez só) */
  digging: Record<string, boolean>;
  finds: Record<string, number>;
  digs: Record<string, number>;
  rng: Rng;
}

function heatFor(state: CacaState, x: number, y: number): number {
  return clamp01(1 - dist(x, y, state.chest.x, state.chest.y) / COLD_AT);
}

export const cacaGame: GameModule<CacaState> = {
  id: 'caca',
  timeLimit: TIME_LIMIT,

  create(ctx: MatchContext): CacaState {
    const rng = createRng(ctx.seed);
    const spawns = ringSpawns(ctx.players.length, ARENA_CENTER.x, ARENA_CENTER.y, 180);
    const fighters = ctx.players.map((seed, i) =>
      createFighter(seed, spawns[i].x, spawns[i].y, 26),
    );
    const state: CacaState = {
      ...createBaseState('caca', ctx, fighters),
      chest: { x: ARENA_CENTER.x, y: ARENA_CENTER.y },
      digging: {},
      finds: Object.fromEntries(fighters.map((f) => [f.id, 0])),
      digs: Object.fromEntries(fighters.map((f) => [f.id, 0])),
      rng,
    };
    state.chest = freeSpot(rng, fighters, 110, 230);
    return state;
  },

  step(state, dt, inputs) {
    const playing = advancePhase(state, dt);
    stepBodies(state, dt, inputs, playing, { knockScale: 1.05 });
    if (!playing) return;

    for (const f of state.fighters) {
      if (!f.alive) continue;

      // dash = pá. Conta uma vez por dash, no frame em que ele começa.
      const inDash = f.dashTimer > 0;
      const started = inDash && !state.digging[f.id];
      state.digging[f.id] = inDash;
      if (!started) continue;

      state.digs[f.id] = (state.digs[f.id] ?? 0) + 1;
      const distance = dist(f.x, f.y, state.chest.x, state.chest.y);
      if (distance <= DIG_RADIUS) {
        state.finds[f.id] = (state.finds[f.id] ?? 0) + 1;
        f.score = state.finds[f.id];
        f.squash = 0.6;
        // o evento carrega a posição: é assim que o cliente mostra o baú
        state.events.push({
          k: 'pickup',
          id: f.id,
          x: state.chest.x,
          y: state.chest.y,
          v: 1,
          i: 1,
        });
        state.chest = freeSpot(state.rng, state.fighters, 120, 260);
        state.events.push({ k: 'zone-move', x: f.x, y: f.y, v: 0.5 });
      } else {
        state.events.push({ k: 'tile-crack', id: f.id, x: f.x, y: f.y, v: 0.4 });
      }
    }

    if (state.elapsed >= TIME_LIMIT) closeByScore(state);
  },

  isOver(state) {
    return state.phase === 'over';
  },

  results(state): MatchResults {
    return buildResults(
      state,
      'caca',
      (f) => pointsLabel(f, 'baú'),
      (f) => {
        const digs = state.digs[f.id] ?? 0;
        const finds = state.finds[f.id] ?? 0;
        if (digs === 0) return 'não cavou nada';
        return `${finds}/${digs} cavadas certas`;
      },
    );
  },

  snapshot(state, seq, now): Snapshot {
    return {
      ...baseSnapshotFields(state, seq, now, Math.max(0, TIME_LIMIT - state.elapsed)),
      ex: {
        // temperatura de cada jogador, na ordem do snapshot (o baú NÃO vai aqui)
        n: state.fighters.map((f) => round2(heatFor(state, f.x, f.y))),
        s: 'DASH PARA CAVAR',
      },
    };
  },

  bot(state, f, dt): InputState {
    const rng = state.rng;
    const beat = aiThink(f, dt, 0.24, rng.next);
    const heat = heatFor(state, f.x, f.y);

    // memória do bot: ai.tx guarda o calor anterior, ai.ty a direção que deu certo
    const before = f.ai.tx;
    f.ai.tx = heat;

    // esquentou? continua na mesma direção. esfriou? vira.
    if (beat) {
      const improving = heat > before;
      if (!improving) f.ai.ty = f.ai.ty + Math.PI * 0.5 + rng.range(-0.6, 0.6);
    }
    const angle = f.ai.ty || 0;
    const dir = { x: Math.cos(angle), y: Math.sin(angle) };

    // muito quente: cava
    if (heat > 0.86 && f.dashCooldown <= 0 && rng.chance(0.85)) {
      return { mx: dir.x * 0.3, my: dir.y * 0.3, dash: requestBotDash(f) };
    }

    // alguém claramente mais quente? segue a pessoa (é o que um humano faz)
    let hotter: { x: number; y: number } | null = null;
    let hottest = heat + 0.12;
    for (const other of state.fighters) {
      if (other === f || !other.alive) continue;
      const otherHeat = heatFor(state, other.x, other.y);
      if (otherHeat > hottest) {
        hottest = otherHeat;
        hotter = { x: other.x, y: other.y };
      }
    }
    if (hotter && rng.chance(0.55)) {
      const toHot = normalize(hotter.x - f.x, hotter.y - f.y);
      return { mx: toHot.x, my: toHot.y, dash: f.dashSeen };
    }

    // mantém o rumo, puxando para dentro da arena
    const toCenter = normalize(ARENA_CENTER.x - f.x, ARENA_CENTER.y - f.y);
    const blend = normalize(dir.x + toCenter.x * 0.35, dir.y + toCenter.y * 0.35);
    return { mx: blend.x, my: blend.y, dash: f.dashSeen };
  },
};
