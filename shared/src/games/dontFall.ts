import {
  advancePhase,
  aiThink,
  aliveFighters,
  baseSnapshotFields,
  closeMatch,
  createBaseState,
  createFighter,
  eliminate,
  keepInWorld,
  moveConfig,
  nearestOther,
  requestBotDash,
  resolveFighterCollisions,
  ringSpawns,
  stepDead,
  stepFighter,
} from '../engine';
import { clamp01, dist, normalize, round1 } from '../math';
import { rleEncode } from '../rle';
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

/**
 * DON'T FALL!
 * O chão é um mosaico. Cada bloco tem "vida" que só cai enquanto alguém está
 * em cima dele — correr de passagem quase não machuca, ficar rondando a mesma
 * área destrói o próprio terreno. Dash serve de ponte sobre os buracos.
 */

export const FALL_COLS = 15;
export const FALL_ROWS = 10;
export const FALL_TILE = 58;
export const FALL_GAP = 6;
export const FALL_PITCH = FALL_TILE + FALL_GAP;
export const FALL_OX = Math.round((WORLD.w - (FALL_COLS * FALL_PITCH - FALL_GAP)) / 2);
export const FALL_OY = Math.round((WORLD.h - (FALL_ROWS * FALL_PITCH - FALL_GAP)) / 2);
export const FALL_TOTAL = FALL_COLS * FALL_ROWS;

/**
 * Tempo de contato acumulado necessário para destruir um bloco (s).
 *
 * Calibrado com o playtest headless: um jogador atravessa ~4,7 blocos por
 * segundo, então este número define quanto tempo o mapa inteiro aguenta. Em
 * 1,15s o piso de 150 blocos dura ~45s com 4 jogadores — que é a duração alvo da
 * rodada. Baixar isso faz a partida acabar em 20 segundos.
 */
const DWELL_TIME = 1.45;
/** Depois de machucado (hp < 0.5) o bloco cede sozinho neste ritmo (s). */
const SELF_DECAY = 3.2;
/**
 * Janela de desabamento: quando a vida do bloco acaba ele ainda segura o
 * jogador por um instante, chacoalhando. Sem isso o jogo é injusto — você morria
 * no mesmo frame em que o chão sob os seus pés terminava de rachar.
 */
const COLLAPSE_TIME = 0.5;
/** Tolerância antes de cair ao ficar sobre o vazio (s). */
const COYOTE = 0.18;
const TIME_LIMIT = 100;

export interface FallState extends BaseMatchState {
  hp: Float32Array;
  touched: Uint8Array;
  /** tempo restante de desabamento (0 = não está caindo) */
  collapse: Float32Array;
  coyote: Record<string, number>;
  autoTimer: number;
  broken: number;
  rng: Rng;
}

const CFG = moveConfig({
  accel: 4300,
  maxSpeed: 420,
  friction: 0.862,
  radius: 25,
  // dash longo: é a ponte sobre os buracos, precisa atravessar 2 blocos
  dashSpeed: 1230,
  dashTime: 0.21,
  dashCooldown: 0.6,
  knockback: 700,
  bounce: 0.5,
});

/** Blocos reforçados aguentam o dobro e formam ilhas seguras no fim da rodada. */
const REINFORCED = 14;

export function tileCenter(index: number): { x: number; y: number } {
  const col = index % FALL_COLS;
  const row = Math.floor(index / FALL_COLS);
  return {
    x: FALL_OX + col * FALL_PITCH + FALL_TILE / 2,
    y: FALL_OY + row * FALL_PITCH + FALL_TILE / 2,
  };
}

export function tileIndexAt(x: number, y: number): number {
  const col = Math.floor((x - FALL_OX) / FALL_PITCH);
  const row = Math.floor((y - FALL_OY) / FALL_PITCH);
  if (col < 0 || col >= FALL_COLS || row < 0 || row >= FALL_ROWS) return -1;
  return row * FALL_COLS + col;
}

/** Estado visual: 5 reforçado, 4 intacto, 3/2 rachando, 1 desabando, 0 vazio. */
export function tileStage(hp: number, touched: boolean, collapsing = false): number {
  if (collapsing) return 1;
  if (hp <= 0) return 0;
  if (hp > 1) return 5;
  if (!touched) return 4;
  if (hp > 0.6) return 3;
  if (hp > 0.25) return 2;
  return 1;
}

/** Bloco ainda segura alguém? Vale enquanto estiver desabando. */
function solid(state: FallState, index: number): boolean {
  if (index < 0) return false;
  return state.hp[index] > 0 || state.collapse[index] > 0;
}

function isSupported(state: FallState, f: Fighter): boolean {
  const r = f.radius * 0.55;
  const samples = [
    [0, 0],
    [r, 0],
    [-r, 0],
    [0, r],
    [0, -r],
  ];
  for (const [dx, dy] of samples) {
    if (solid(state, tileIndexAt(f.x + dx, f.y + dy))) return true;
  }
  return false;
}

function damageTile(state: FallState, index: number, amount: number, by?: string): void {
  if (index < 0 || state.hp[index] <= 0) return;
  if (!state.touched[index]) {
    state.touched[index] = 1;
    const c = tileCenter(index);
    state.events.push({ k: 'tile-crack', i: index, x: c.x, y: c.y, id: by });
  }
  state.hp[index] -= amount;
  if (state.hp[index] <= 0) {
    state.hp[index] = 0;
    state.collapse[index] = COLLAPSE_TIME;
    const c = tileCenter(index);
    // aviso final: o bloco chacoalha antes de sumir
    state.events.push({ k: 'tile-crack', i: index, x: c.x, y: c.y, v: 1 });
  }
}

export const dontFallGame: GameModule<FallState> = {
  id: 'dont-fall',
  timeLimit: TIME_LIMIT,

  create(ctx: MatchContext): FallState {
    const rng = createRng(ctx.seed);
    const spawns = ringSpawns(ctx.players.length, WORLD.w / 2, WORLD.h / 2, 185);
    const fighters = ctx.players.map((seed, i) =>
      createFighter(seed, spawns[i].x, spawns[i].y, 25),
    );
    const base = createBaseState('dont-fall', ctx, fighters);
    const hp = new Float32Array(FALL_TOTAL).fill(1);
    for (let i = 0; i < REINFORCED; i += 1) {
      hp[rng.int(0, FALL_TOTAL - 1)] = 2;
    }
    return {
      ...base,
      hp,
      touched: new Uint8Array(FALL_TOTAL),
      collapse: new Float32Array(FALL_TOTAL),
      coyote: Object.fromEntries(fighters.map((f) => [f.id, COYOTE])),
      autoTimer: 22,
      broken: 0,
      rng,
    };
  },

  step(state, dt, inputs) {
    const playing = advancePhase(state, dt);

    for (const f of state.fighters) {
      if (!f.alive) {
        stepDead(f, dt);
        continue;
      }
      const input = playing ? inputs[f.id] ?? emptyInput() : emptyInput();
      stepFighter(f, input, CFG, dt, state.events);
      keepInWorld(f, 220);
      if (playing) f.survived = state.elapsed;
    }

    resolveFighterCollisions(state.fighters, CFG, state.events, { knockScale: 1.05 });

    if (!playing) return;

    // desgaste por permanência: passar correndo quase não machuca
    for (const f of state.fighters) {
      if (!f.alive) continue;
      const index = tileIndexAt(f.x, f.y);
      if (index >= 0) damageTile(state, index, dt / DWELL_TIME, f.id);
    }

    // blocos já machucados continuam cedendo sozinhos
    for (let i = 0; i < FALL_TOTAL; i += 1) {
      if (!state.touched[i] || state.hp[i] <= 0 || state.hp[i] >= 0.5) continue;
      damageTile(state, i, dt / SELF_DECAY);
    }

    // desabamento: o bloco chacoalha e depois vira buraco
    for (let i = 0; i < FALL_TOTAL; i += 1) {
      if (state.collapse[i] <= 0) continue;
      state.collapse[i] -= dt;
      if (state.collapse[i] <= 0) {
        state.collapse[i] = 0;
        state.broken += 1;
        const c = tileCenter(i);
        state.events.push({ k: 'tile-fall', i, x: c.x, y: c.y });
      }
    }

    // pressão: perto do fim o chão começa a ceder por conta própria
    state.autoTimer -= dt;
    if (state.autoTimer <= 0) {
      const pressure = clamp01((state.elapsed - 22) / 50);
      state.autoTimer = 2.3 - pressure * 1.85;
      const candidates: number[] = [];
      for (let i = 0; i < FALL_TOTAL; i += 1) {
        if (state.hp[i] > 0.5 && !state.touched[i]) candidates.push(i);
      }
      if (candidates.length > 0) {
        const pick = candidates[state.rng.int(0, candidates.length - 1)];
        damageTile(state, pick, 0.55);
      }
    }

    // queda
    for (const f of state.fighters) {
      if (!f.alive) continue;
      if (isSupported(state, f) || f.dashTimer > 0) {
        state.coyote[f.id] = COYOTE;
        continue;
      }
      state.coyote[f.id] = (state.coyote[f.id] ?? COYOTE) - dt;
      if (state.coyote[f.id] <= 0) {
        eliminate(state, f, { v: 0.5 });
      }
    }

    const alive = aliveFighters(state);
    for (const f of alive) f.score = f.survived;
    if (alive.length <= 1 || state.elapsed >= TIME_LIMIT) {
      // empate no tempo limite: quem chegou menos machucado leva
      closeMatch(state, (a, b) => b.survived - a.survived || a.stagger - b.stagger);
    }
  },

  isOver(state) {
    return state.phase === 'over';
  },

  results(state): MatchResults {
    const rows = state.fighters
      .slice()
      .sort((a, b) => (a.place || 99) - (b.place || 99))
      .map((f) => ({
        playerId: f.id,
        place: f.place || 99,
        score: round1(f.survived),
        scoreLabel: `${round1(f.survived).toFixed(1)}s no ar`,
        highlight: null,
      }));
    const winner = rows.find((r) => r.place === 1);
    return {
      gameId: 'dont-fall',
      rows,
      winnerId: winner?.playerId ?? null,
      duration: round1(state.elapsed),
      round: state.round,
    };
  },

  snapshot(state, seq, now): Snapshot {
    const remaining = Math.max(0, TIME_LIMIT - state.elapsed);
    const bytes = new Uint8Array(FALL_TOTAL);
    for (let i = 0; i < FALL_TOTAL; i += 1) {
      bytes[i] = tileStage(state.hp[i], state.touched[i] === 1, state.collapse[i] > 0);
    }
    return {
      ...baseSnapshotFields(state, seq, now, remaining),
      fall: {
        g: rleEncode(bytes),
        alive: aliveFighters(state).length,
      },
    };
  },

  bot(state, f, dt): InputState {
    const rng = state.rng;
    const beat = aiThink(f, dt, 0.34, rng.next);
    let dash = f.dashSeen;

    // o chão sob os pés está indo? sair daqui é prioridade
    const under = tileIndexAt(f.x, f.y);
    const escaping = under >= 0 && (state.collapse[under] > 0 || state.hp[under] < 0.3);

    // avalia direções em duas distâncias e escolhe o chão mais firme
    let bestScore = -Infinity;
    let bestX = f.x;
    let bestY = f.y;
    const steps = 12;
    for (let i = 0; i < steps; i += 1) {
      const angle = (i / steps) * Math.PI * 2 + f.ai.jitterX * 0.004;
      for (const reach of escaping ? [80, 150] : [72, 140]) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const x = f.x + cos * reach;
        const y = f.y + sin * reach;
        const index = tileIndexAt(x, y);
        if (index < 0 || index === under) continue;
        const hp = state.hp[index];
        if (hp <= 0.1) continue;
        // o caminho até lá também precisa ter chão (andar em linha reta por
        // cima de um buraco era a principal causa de morte boba do bot)
        if (!solid(state, tileIndexAt(f.x + cos * reach * 0.5, f.y + sin * reach * 0.5))) continue;

        let score = hp * 110 + (state.touched[index] ? 0 : 40) - reach * 0.1;
        if (escaping) score += hp * 90;

        // margem de segurança: destino cercado de buraco vale menos
        let holes = 0;
        for (const [ox, oy] of [
          [FALL_PITCH, 0],
          [-FALL_PITCH, 0],
          [0, FALL_PITCH],
          [0, -FALL_PITCH],
        ]) {
          if (!solid(state, tileIndexAt(x + ox, y + oy))) holes += 1;
        }
        score -= holes * 24;

        for (const other of state.fighters) {
          if (other === f || !other.alive) continue;
          const d = dist(x, y, other.x, other.y);
          if (d < 120) score -= (120 - d) * 0.75;
        }
        score -= dist(x, y, WORLD.w / 2, WORLD.h / 2) * 0.025;
        if (score > bestScore) {
          bestScore = score;
          bestX = x;
          bestY = y;
        }
      }
    }

    const dir = normalize(bestX - f.x, bestY - f.y);

    // dash só quando há chão firme do outro lado: bot que dasha no vazio se mata
    const probe = tileIndexAt(f.x + dir.x * 62, f.y + dir.y * 62);
    const gapAhead = !solid(state, probe);
    const landingSafe = solid(state, tileIndexAt(f.x + dir.x * 150, f.y + dir.y * 150));
    if (
      landingSafe &&
      (gapAhead || escaping) &&
      f.dashCooldown <= 0 &&
      rng.chance(escaping ? 0.12 : 0.06)
    ) {
      dash = requestBotDash(f);
    }

    // agressividade ocasional: empurrar quem está de costas para o vazio
    const prey = nearestOther(state.fighters, f);
    if (beat && prey && f.dashCooldown <= 0 && dist(f.x, f.y, prey.x, prey.y) < 100) {
      const behind = tileIndexAt(prey.x + (prey.x - f.x) * 1.5, prey.y + (prey.y - f.y) * 1.5);
      const voidBehind = behind < 0 || state.hp[behind] <= 0.06;
      if (voidBehind && rng.chance(0.6)) {
        const toPrey = normalize(prey.x - f.x, prey.y - f.y);
        return { mx: toPrey.x, my: toPrey.y, dash: requestBotDash(f) };
      }
    }

    return { mx: dir.x, my: dir.y, dash };
  },
};
