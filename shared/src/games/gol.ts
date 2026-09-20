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
import { dist, normalize, round1, round2, TAU } from '../math';
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
import { ARENA, ARENA_CENTER, buildResults, item, pointsLabel, stepBodies } from './kit';

/**
 * GOL!
 *
 * Cada jogador defende o próprio gol na borda da arena e tenta empurrar a bola
 * para o gol dos outros. Sem times, sem juiz: o mesmo movimento serve para
 * atacar e defender, e é isso que gera a bagunça.
 *
 * Códigos do snapshot: k=0 bola, k=1 gol (o = slot do dono, v = vidas/3).
 */

const TIME_LIMIT = 100;
/**
 * Vidas do gol por tamanho de sala.
 *
 * No duelo existe um único gol para atacar, então cada chute certo conta o dobro
 * do que conta numa sala cheia: com três vidas o duelo acabava em 20 segundos.
 * Sala de dois ganha trave mais resistente.
 */
function livesFor(count: number): number {
  return count <= 2 ? 6 : count === 3 ? 4 : 3;
}
/** Referência para a barra de vida do gol no renderer. */
const LIVES = 6;
const BALL_RADIUS = 24;
const GOAL_RADIUS = 62;
/** Bola leve e que corre: com atrito alto ela morria no meio do amontoado. */
const BALL_FRICTION = 0.992;
const BALL_MAX = 1100;
const RESET_PAUSE = 0.9;
/**
 * Um toque só "assina" a bola por um tempo. Sem isso, chutar para o gol
 * adversário, errar e ver a bola rebater na parede e cruzar a arena inteira até
 * o seu próprio gol contava como gol contra — quatro deles em sete segundos.
 * Bola que rolou demais sem ninguém tocar é gol de ninguém: só reposiciona.
 */
const TOUCH_MEMORY = 1.7;

interface Goal {
  x: number;
  y: number;
  ownerId: string;
  slot: number;
}

export interface GolState extends BaseMatchState {
  ball: { x: number; y: number; vx: number; vy: number };
  goals: Goal[];
  lastTouch: string | null;
  /** tempo desde o último toque; passou de TOUCH_MEMORY, a bola fica neutra */
  touchAge: number;
  pause: number;
  goalsScored: Record<string, number>;
  ownGoals: Record<string, number>;
  rng: Rng;
}

export const golGame: GameModule<GolState> = {
  id: 'gol',
  timeLimit: TIME_LIMIT,

  create(ctx: MatchContext): GolState {
    const rng = createRng(ctx.seed);
    const count = ctx.players.length;
    const spawns = ringSpawns(count, ARENA_CENTER.x, ARENA_CENTER.y, 150);
    const fighters = ctx.players.map((seed, i) =>
      createFighter(seed, spawns[i].x, spawns[i].y, 26),
    );
    for (const fighter of fighters) fighter.lives = livesFor(fighters.length);

    // gols distribuídos em elipse na borda, cada um alinhado com o spawn do dono
    const rx = ARENA.w / 2 - 26;
    const ry = ARENA.h / 2 - 26;
    const goals: Goal[] = fighters.map((fighter, i) => {
      const angle = -Math.PI / 2 + (i / count) * TAU;
      return {
        x: ARENA_CENTER.x + Math.cos(angle) * rx,
        y: ARENA_CENTER.y + Math.sin(angle) * ry,
        ownerId: fighter.id,
        slot: fighter.slot,
      };
    });

    return {
      ...createBaseState('gol', ctx, fighters),
      ball: { x: ARENA_CENTER.x, y: ARENA_CENTER.y, vx: 0, vy: 0 },
      goals,
      lastTouch: null,
      touchAge: 0,
      pause: 0,
      goalsScored: Object.fromEntries(fighters.map((f) => [f.id, 0])),
      ownGoals: Object.fromEntries(fighters.map((f) => [f.id, 0])),
      rng,
    };
  },

  step(state, dt, inputs) {
    const playing = advancePhase(state, dt);
    stepBodies(state, dt, inputs, playing, { knockScale: 0.9 });
    if (!playing) return;

    if (state.pause > 0) {
      state.pause -= dt;
      return;
    }

    const ball = state.ball;

    // contato dos jogadores: empurra a bola (dash chuta forte)
    for (const f of state.fighters) {
      if (!f.alive) continue;
      const d = dist(f.x, f.y, ball.x, ball.y);
      const min = f.radius + BALL_RADIUS;
      if (d > min || d < 1e-4) continue;

      const n = normalize(ball.x - f.x, ball.y - f.y);
      ball.x = f.x + n.x * min;
      ball.y = f.y + n.y * min;

      const speed = Math.hypot(f.vx, f.vy);
      const kick = (f.dashTimer > 0 ? 1.8 : 0.85) * Math.max(260, speed);
      ball.vx = n.x * kick + f.vx * 0.25;
      ball.vy = n.y * kick + f.vy * 0.25;
      state.lastTouch = f.id;
      state.touchAge = 0;
      f.squash = -0.3;
    }

    state.touchAge += dt;
    if (state.touchAge > TOUCH_MEMORY) state.lastTouch = null;

    // rolagem e quicada nas paredes
    const drag = Math.pow(BALL_FRICTION, dt * 60);
    ball.vx *= drag;
    ball.vy *= drag;
    const speed = Math.hypot(ball.vx, ball.vy);
    if (speed > BALL_MAX) {
      ball.vx = (ball.vx / speed) * BALL_MAX;
      ball.vy = (ball.vy / speed) * BALL_MAX;
    }
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    if (ball.x < ARENA.x + BALL_RADIUS) {
      ball.x = ARENA.x + BALL_RADIUS;
      ball.vx = Math.abs(ball.vx) * 0.55;
    } else if (ball.x > ARENA.x + ARENA.w - BALL_RADIUS) {
      ball.x = ARENA.x + ARENA.w - BALL_RADIUS;
      ball.vx = -Math.abs(ball.vx) * 0.55;
    }
    if (ball.y < ARENA.y + BALL_RADIUS) {
      ball.y = ARENA.y + BALL_RADIUS;
      ball.vy = Math.abs(ball.vy) * 0.55;
    } else if (ball.y > ARENA.y + ARENA.h - BALL_RADIUS) {
      ball.y = ARENA.y + ARENA.h - BALL_RADIUS;
      ball.vy = -Math.abs(ball.vy) * 0.55;
    }

    // gol?
    for (const goal of state.goals) {
      const owner = state.fighters.find((f) => f.id === goal.ownerId);
      if (!owner || !owner.alive) continue;
      if (dist(ball.x, ball.y, goal.x, goal.y) > GOAL_RADIUS) continue;

      // bola sem "assinatura" recente: gol de ninguém, só recoloca no centro
      const neutral = state.lastTouch === null;
      const scorer =
        state.lastTouch && state.lastTouch !== goal.ownerId
          ? state.fighters.find((f) => f.id === state.lastTouch)
          : null;

      if (scorer) {
        // gol de verdade: ponto para quem chutou, vida a menos para o dono
        scorer.score += 1;
        state.goalsScored[scorer.id] = (state.goalsScored[scorer.id] ?? 0) + 1;
        state.events.push({
          k: 'goal',
          id: scorer.id,
          id2: goal.ownerId,
          x: goal.x,
          y: goal.y,
          v: 1,
        });
        hurt(state, owner, { invuln: 1.4, x: goal.x, y: goal.y, kind: 'life-lost' });
      } else {
        /**
         * Gol contra e gol de ninguém só reposicionam a bola. Custar vida aqui
         * punia o jogador por CHUTAR: errar o gol adversário e ver a bola voltar
         * valia o mesmo que tomar um gol. O jogo é sobre marcar, não sobre ter
         * medo de tentar.
         */
        if (!neutral) state.ownGoals[goal.ownerId] = (state.ownGoals[goal.ownerId] ?? 0) + 1;
        state.events.push({ k: 'goal', id2: goal.ownerId, x: goal.x, y: goal.y, v: 0.3 });
      }

      ball.x = ARENA_CENTER.x;
      ball.y = ARENA_CENTER.y;
      ball.vx = 0;
      ball.vy = 0;
      state.lastTouch = null;
      state.touchAge = TOUCH_MEMORY;
      state.pause = RESET_PAUSE;
      break;
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
      'gol',
      (f) => `${pointsLabel(f, 'gol')} · ${Math.max(0, f.lives)} vidas`,
      (f) => {
        const own = state.ownGoals[f.id] ?? 0;
        return own > 0 ? `${own} gol contra 😬` : null;
      },
    );
  },

  snapshot(state, seq, now): Snapshot {
    const items = [
      item(state.ball.x, state.ball.y, BALL_RADIUS, 0, {
        v: round2(Math.min(1, Math.hypot(state.ball.vx, state.ball.vy) / BALL_MAX)),
      }),
    ];
    for (const goal of state.goals) {
      const owner = state.fighters.find((f) => f.id === goal.ownerId);
      items.push(
        item(goal.x, goal.y, GOAL_RADIUS, 1, {
          o: goal.slot,
          v: round2(Math.max(0, (owner?.lives ?? 0) / livesFor(state.fighters.length))),
        }),
      );
    }
    return {
      ...baseSnapshotFields(state, seq, now, Math.max(0, TIME_LIMIT - state.elapsed)),
      ex: { items, h: state.lastTouch, n: [round1(state.pause)] },
    };
  },

  bot(state, f, dt): InputState {
    const rng = state.rng;
    aiThink(f, dt, 0.32, rng.next);
    const ball = state.ball;
    const myGoal = state.goals.find((goal) => goal.ownerId === f.id);

    const ballToMyGoal = myGoal ? dist(ball.x, ball.y, myGoal.x, myGoal.y) : Infinity;

    /**
     * Toda decisão do bot é a mesma: escolher PARA ONDE a bola deve ir e então
     * se posicionar atrás dela nessa direção. Defender é só "para longe do meu
     * gol". A primeira versão corria direto na bola quando ela chegava perto do
     * próprio gol — e empurrava a bola para dentro. Quatro gols contra em sete
     * segundos.
     */
    let pushDir: { x: number; y: number };

    // limiar baixo de propósito: os gols ficam a ~262 u do centro, então um
    // limiar alto deixava TODOS os bots em modo defensivo para sempre — cem
    // segundos de partida sem um gol
    if (myGoal && ballToMyGoal < 170) {
      // defesa: chutar para longe do próprio gol
      pushDir = normalize(ball.x - myGoal.x, ball.y - myGoal.y);
    } else {
      // ataque: gol adversário mais próximo da bola
      let victim: Goal | null = null;
      let victimD = Infinity;
      for (const goal of state.goals) {
        if (goal.ownerId === f.id) continue;
        const owner = state.fighters.find((p) => p.id === goal.ownerId);
        if (!owner || !owner.alive) continue;
        const d = dist(ball.x, ball.y, goal.x, goal.y);
        if (d < victimD) {
          victimD = d;
          victim = goal;
        }
      }
      if (!victim) {
        const dir = normalize(ball.x - f.x, ball.y - f.y);
        return { mx: dir.x, my: dir.y, dash: f.dashSeen };
      }
      pushDir = normalize(victim.x - ball.x, victim.y - ball.y);
    }

    // ponto de apoio atrás da bola, na direção escolhida
    const standX = ball.x - pushDir.x * (BALL_RADIUS + f.radius + 14);
    const standY = ball.y - pushDir.y * (BALL_RADIUS + f.radius + 14);
    const standD = dist(f.x, f.y, standX, standY);
    const lined = standD < 54;
    const target = lined
      ? { x: ball.x + pushDir.x * 60, y: ball.y + pushDir.y * 60 }
      : { x: standX, y: standY };
    const dir = normalize(target.x - f.x, target.y - f.y);
    const canShoot = lined && dist(f.x, f.y, ball.x, ball.y) < 95;
    return {
      mx: dir.x,
      my: dir.y,
      dash: canShoot && f.dashCooldown <= 0 && rng.chance(dt * 8) ? requestBotDash(f) : f.dashSeen,
    };
  },
};
