import {
  advancePhase,
  aiThink,
  aliveFighters,
  baseSnapshotFields,
  createBaseState,
  createFighter,
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
import { ARENA, ARENA_CENTER, buildResults, closeByScore, item, stepBodies } from './kit';

/**
 * TREM!
 *
 * A cada apito o trem tem que estar montado: uma fila de vagões, e cada vagão
 * tem a cor de um jogador. Você olha onde está o SEU vagão, corre para lá e
 * segura a posição — sabendo que o vagão do lado é de alguém que também está
 * com pressa.
 *
 * Vagão certo vale ponto. Vagão certo colado em outro vagão certo vale dois: se
 * o cara do seu lado acertar também, os dois ganham — o que faz aliança nascer
 * sozinha no meio da correria.
 *
 * Códigos do snapshot: k=0 vagão (o = cor do dono, v = ocupado certo), k=1
 * trilho; n = [tempo, rodada, apito].
 */

const TIME_LIMIT = 78;
const SLOT_RADIUS = 40;
const SPACING = 98;
const WHISTLE_PAUSE = 1.4;
/** O trem anda enquanto você embarca — parar em cima da marca não basta. */
const TRAIN_SPEED = 88;
const TRAIN_SPIN = 0.32;

export interface TremState extends BaseMatchState {
  /** dono de cada vagão, na ordem do trem */
  order: string[];
  slots: { x: number; y: number }[];
  /** centro do trilho (anda durante o embarque) */
  cx: number;
  cy: number;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
  timer: number;
  span: number;
  /** >0 durante a pausa depois do apito */
  whistle: number;
  roundIndex: number;
  /** tempo desde a última mudança de ordem (o bot usa para "ler" o trem) */
  since: number;
  /** true quando a troca do meio da rodada já aconteceu */
  swapped: boolean;
  wagons: Record<string, number>;
  misses: Record<string, number>;
  rng: Rng;
}

function boardTimeFor(index: number): number {
  return clamp(4.6 - index * 0.28, 2.2, 4.6);
}

/** Recalcula a posição dos vagões a partir do trilho atual. */
function placeSlots(state: TremState): void {
  const count = state.order.length;
  state.slots = state.order.map((_, index) => {
    const offset = (index - (count - 1) / 2) * SPACING;
    return {
      x: state.cx + Math.cos(state.angle) * offset,
      y: state.cy + Math.sin(state.angle) * offset,
    };
  });
}

/** Sorteia trilho e ordem dos vagões para a rodada. */
function layoutTrain(state: TremState): void {
  const alive = aliveFighters(state);
  state.order = state.rng.shuffle(alive.map((f) => f.id));

  const angle = state.rng.range(-0.42, 0.42) + (state.rng.chance(0.5) ? 0 : Math.PI);
  state.angle = angle;
  state.spin = state.rng.sign() * TRAIN_SPIN * state.rng.range(0.5, 1);
  state.cx = ARENA_CENTER.x + state.rng.range(-70, 70);
  state.cy = ARENA_CENTER.y + state.rng.range(-50, 50);
  const drift = state.rng.range(0, Math.PI * 2);
  state.vx = Math.cos(drift) * TRAIN_SPEED;
  state.vy = Math.sin(drift) * TRAIN_SPEED * 0.7;
  placeSlots(state);
}

/** Move o trilho, mantendo a fila inteira dentro da arena. */
function driveTrain(state: TremState, dt: number): void {
  const count = state.order.length;
  const half = ((count - 1) / 2) * SPACING;
  state.angle += state.spin * dt;
  state.cx += state.vx * dt;
  state.cy += state.vy * dt;

  const roomX = Math.max(30, ARENA.w / 2 - Math.abs(Math.cos(state.angle)) * half - 60);
  const roomY = Math.max(30, ARENA.h / 2 - Math.abs(Math.sin(state.angle)) * half - 60);
  if (state.cx < ARENA_CENTER.x - roomX || state.cx > ARENA_CENTER.x + roomX) {
    state.vx *= -1;
    state.cx = clamp(state.cx, ARENA_CENTER.x - roomX, ARENA_CENTER.x + roomX);
  }
  if (state.cy < ARENA_CENTER.y - roomY || state.cy > ARENA_CENTER.y + roomY) {
    state.vy *= -1;
    state.cy = clamp(state.cy, ARENA_CENTER.y - roomY, ARENA_CENTER.y + roomY);
  }
  placeSlots(state);
}

function slotOf(state: TremState, id: string): { x: number; y: number } | null {
  const index = state.order.indexOf(id);
  return index < 0 ? null : state.slots[index] ?? null;
}

function inPlace(state: TremState, f: Fighter): boolean {
  const slot = slotOf(state, f.id);
  return slot ? dist(f.x, f.y, slot.x, slot.y) <= SLOT_RADIUS : false;
}

export const tremGame: GameModule<TremState> = {
  id: 'trem',
  timeLimit: TIME_LIMIT,

  create(ctx: MatchContext): TremState {
    const rng = createRng(ctx.seed);
    const spawns = ringSpawns(ctx.players.length, ARENA_CENTER.x, ARENA_CENTER.y, 200);
    const fighters = ctx.players.map((seed, i) =>
      createFighter(seed, spawns[i].x, spawns[i].y, 26),
    );
    const state: TremState = {
      ...createBaseState('trem', ctx, fighters),
      order: [],
      slots: [],
      cx: ARENA_CENTER.x,
      cy: ARENA_CENTER.y,
      vx: 0,
      vy: 0,
      angle: 0,
      spin: 0,
      timer: boardTimeFor(0),
      span: boardTimeFor(0),
      whistle: 0,
      roundIndex: 0,
      since: 0,
      swapped: false,
      wagons: Object.fromEntries(fighters.map((f) => [f.id, 0])),
      misses: Object.fromEntries(fighters.map((f) => [f.id, 0])),
      rng,
    };
    layoutTrain(state);
    return state;
  },

  step(state, dt, inputs) {
    const playing = advancePhase(state, dt);
    stepBodies(state, dt, inputs, playing, { knockScale: 1.2 });
    if (!playing) return;

    if (state.whistle > 0) {
      state.whistle -= dt;
      if (state.whistle <= 0) {
        state.roundIndex += 1;
        state.span = boardTimeFor(state.roundIndex);
        state.timer = state.span;
        state.since = 0;
        state.swapped = false;
        layoutTrain(state);
        state.events.push({ k: 'call', v: 0.7 });
      }
      if (state.elapsed >= TIME_LIMIT) closeByScore(state);
      return;
    }

    driveTrain(state, dt);
    state.since += dt;

    /**
     * TROCA! Na metade do embarque dois vagões trocam de dono.
     *
     * Sem isso o jogo não tinha disputa nenhuma: cada um ia para a sua marca e
     * todos acertavam sempre, empatando a partida. A troca obriga a reler o trem
     * no meio do caminho — e joga dois jogadores em rota de colisão.
     */
    if (!state.swapped && state.order.length > 1 && state.timer < state.span * 0.55) {
      state.swapped = true;
      const a = state.rng.int(0, state.order.length - 1);
      let b = state.rng.int(0, state.order.length - 2);
      if (b >= a) b += 1;
      const tmp = state.order[a];
      state.order[a] = state.order[b];
      state.order[b] = tmp;
      state.since = 0;
      placeSlots(state);
      state.events.push({ k: 'call', v: 1, x: state.cx, y: state.cy });
    }

    state.timer -= dt;
    if (state.timer <= 0) {
      // APITO: confere a fila inteira
      const correct = state.order.map((id) => {
        const fighter = state.fighters.find((f) => f.id === id);
        return fighter ? inPlace(state, fighter) : false;
      });

      state.order.forEach((id, index) => {
        const fighter = state.fighters.find((f) => f.id === id);
        if (!fighter) return;
        const slot = state.slots[index];
        if (!correct[index]) {
          state.misses[id] = (state.misses[id] ?? 0) + 1;
          fighter.squash = -0.5;
          state.events.push({ k: 'hit', id, x: fighter.x, y: fighter.y, v: 0.4 });
          return;
        }
        // engatou no vagão vizinho? vale dobrado
        const coupled = correct[index - 1] === true || correct[index + 1] === true;
        const gain = coupled ? 2 : 1;
        state.wagons[id] = (state.wagons[id] ?? 0) + gain;
        fighter.score = state.wagons[id];
        fighter.squash = 0.45;
        state.events.push({
          k: coupled ? 'score' : 'mine-safe',
          id,
          x: slot.x,
          y: slot.y,
          v: coupled ? 1 : 0.5,
          i: gain,
        });
      });

      state.whistle = WHISTLE_PAUSE;
      state.events.push({ k: 'checkpoint', v: 1 });
    }

    if (state.elapsed >= TIME_LIMIT) closeByScore(state);
  },

  isOver(state) {
    return state.phase === 'over';
  },

  results(state): MatchResults {
    return buildResults(
      state,
      'trem',
      (f) => {
        const total = Math.round(f.score);
        return `${total} ${total === 1 ? 'vagão' : 'vagões'}`;
      },
      (f) => {
        const misses = state.misses[f.id] ?? 0;
        return misses > 0 ? `${misses} apito${misses === 1 ? '' : 's'} perdido${misses === 1 ? '' : 's'}` : 'nunca perdeu o trem';
      },
    );
  },

  snapshot(state, seq, now): Snapshot {
    const items = state.slots.map((slot, index) => {
      const id = state.order[index];
      const fighter = state.fighters.find((f) => f.id === id);
      // os vagões vão na ordem do trem: o renderer desenha o primeiro como locomotiva
      return item(slot.x, slot.y, SLOT_RADIUS, 0, {
        o: fighter?.slot ?? 0,
        v: fighter && inPlace(state, fighter) ? 1 : 0,
        a: round2(state.angle),
      });
    });

    const first = state.slots[0];
    const last = state.slots[state.slots.length - 1];
    if (first && last) {
      items.push(
        item((first.x + last.x) / 2, (first.y + last.y) / 2, 0, 1, {
          w: Math.round(dist(first.x, first.y, last.x, last.y) + SLOT_RADIUS * 2.4),
          h: 26,
          a: round2(state.angle),
        }),
      );
    }

    return {
      ...baseSnapshotFields(state, seq, now, Math.max(0, TIME_LIMIT - state.elapsed)),
      ex: {
        items,
        n: [round2(Math.max(0, state.timer)), state.roundIndex + 1, state.whistle > 0 ? 1 : 0],
        s: state.whistle > 0 ? 'APITO!' : 'MONTE O TREM!',
      },
    };
  },

  bot(state, f, dt): InputState {
    const rng = state.rng;
    aiThink(f, dt, 0.3, rng.next);

    // ler o trem leva um tempo: até achar a sua cor, o bot só se ajeita
    if (state.since < 0.2 + f.ai.reaction * 2.2) {
      const dir = normalize(f.ai.jitterX, f.ai.jitterY);
      return { mx: dir.x * 0.5, my: dir.y * 0.5, dash: f.dashSeen };
    }

    const slot = slotOf(state, f.id);
    if (!slot) {
      const dir = normalize(ARENA_CENTER.x - f.x, ARENA_CENTER.y - f.y);
      return { mx: dir.x * 0.4, my: dir.y * 0.4, dash: f.dashSeen };
    }

    const d = dist(f.x, f.y, slot.x, slot.y);
    const dir = normalize(slot.x - f.x, slot.y - f.y);

    if (d <= SLOT_RADIUS * 0.65) {
      // no lugar: empurra intruso e segura a posição
      const intruder = state.fighters.find(
        (p) => p !== f && p.alive && dist(p.x, p.y, slot.x, slot.y) < SLOT_RADIUS * 0.9,
      );
      if (intruder && f.dashCooldown <= 0 && rng.chance(dt * 2.5)) {
        const toIntruder = normalize(intruder.x - f.x, intruder.y - f.y);
        return { mx: toIntruder.x, my: toIntruder.y, dash: requestBotDash(f) };
      }
      return { mx: dir.x * 0.3, my: dir.y * 0.3, dash: f.dashSeen };
    }

    const hurry = state.timer < 1.5 && d > 120;
    return {
      mx: dir.x,
      my: dir.y,
      dash:
        (hurry || d > 260) && f.dashCooldown <= 0 && rng.chance(dt * 5)
          ? requestBotDash(f)
          : f.dashSeen,
    };
  },
};
