import { clamp, clamp01, clampVector, dist, len, normalize, round1, round2, TAU } from './math';
import type {
  BaseMatchState,
  Fighter,
  FighterSeed,
  GameEvent,
  InputState,
  MatchContext,
  MatchPhase,
  NetFighter,
} from './types';
import { WORLD } from './types';

/**
 * Motor compartilhado dos minijogos.
 *
 * O servidor roda `step` a 60 Hz e é a autoridade. O cliente reaproveita as
 * mesmas constantes para prever o movimento do próprio personagem, o que dá
 * resposta imediata ao input sem abrir mão da sincronia.
 */

export interface MoveConfig {
  accel: number;
  maxSpeed: number;
  /** atrito aplicado por frame de 60 Hz */
  friction: number;
  radius: number;
  dashSpeed: number;
  dashTime: number;
  dashCooldown: number;
  dashDrag: number;
  /** controle durante o dash (0 = nenhum) */
  dashSteer: number;
  /** impulso base de uma trombada com dash */
  knockback: number;
  /** elasticidade entre personagens */
  bounce: number;
}

/**
 * Números calibrados no playtest headless (`scripts/smoke.ts`): um dash cobre
 * ~23% do diâmetro da arena e a trombada só arremessa de verdade depois que a
 * vítima acumula pancada (stagger). É o que faz a partida durar ~1 minuto em
 * vez de acabar em 3 segundos.
 */
export const DEFAULT_MOVE: MoveConfig = {
  // resposta: chega na velocidade máxima em ~0,1s (controle imediato)
  accel: 4300,
  // 430 u/s cruza a arena (584 u) em 1,35s
  maxSpeed: 430,
  // atrito curto para o personagem parar onde você soltou
  friction: 0.86,
  radius: 26,
  // dash percorre ~200 u = 35% do diâmetro da arena: é um ataque, não um passinho
  dashSpeed: 1150,
  dashTime: 0.19,
  dashCooldown: 0.62,
  dashDrag: 0.93,
  // pouco controle durante o dash: dashar é se comprometer
  dashSteer: 0.16,
  /**
   * Knockback base empurra ~78 u; com a pancada acumulada (stagger) chega a
   * ~215 u. A separação entre os dois é o que dá virada no fim da rodada.
   */
  knockback: 700,
  bounce: 0.54,
};

export const COUNTDOWN_TIME = 3.35;

export function moveConfig(overrides: Partial<MoveConfig> = {}): MoveConfig {
  return { ...DEFAULT_MOVE, ...overrides };
}

// ---------------------------------------------------------------------------
// Criação
// ---------------------------------------------------------------------------

export function createFighter(seed: FighterSeed, x: number, y: number, radius: number): Fighter {
  return {
    id: seed.id,
    slot: seed.slot,
    x,
    y,
    vx: 0,
    vy: 0,
    radius,
    facing: 1,
    alive: true,
    dashTimer: 0,
    dashCooldown: 0,
    dashSeen: 0,
    dashDirX: 1,
    dashDirY: 0,
    stagger: 0,
    stunTimer: 0,
    hitFlash: 0,
    squash: 0,
    score: 0,
    place: 0,
    survived: 0,
    lives: 1,
    invuln: 0,
    bot: seed.bot,
    connected: seed.connected,
    ai: {
      targetId: null,
      tx: x,
      ty: y,
      think: 0,
      jitterX: 0,
      jitterY: 0,
      aggression: 0.55 + (seed.slot % 3) * 0.15,
      reaction: 0.12 + (seed.slot % 4) * 0.05,
    },
  };
}

/** Posições iniciais distribuídas em círculo, sempre iguais para o mesmo N. */
export function ringSpawns(
  count: number,
  cx: number,
  cy: number,
  radius: number,
  offset = -Math.PI / 2,
): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i += 1) {
    const angle = offset + (i / Math.max(1, count)) * TAU;
    out.push({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
  }
  return out;
}

export function createBaseState(
  gameId: BaseMatchState['gameId'],
  ctx: MatchContext,
  fighters: Fighter[],
): BaseMatchState {
  return {
    gameId,
    phase: 'countdown',
    countdown: COUNTDOWN_TIME,
    elapsed: 0,
    fighters,
    events: [],
    seed: ctx.seed,
    round: ctx.round,
    nextPlace: fighters.length,
    sinceOver: 0,
  };
}

// ---------------------------------------------------------------------------
// Ciclo de vida do estado
// ---------------------------------------------------------------------------

/**
 * Avança countdown / tempo. Retorna true quando os inputs devem ser aplicados
 * (ou seja, a partida está de fato rolando).
 */
export function advancePhase(state: BaseMatchState, dt: number): boolean {
  if (state.phase === 'countdown') {
    const before = state.countdown;
    state.countdown = Math.max(0, state.countdown - dt);
    if (before > 0 && state.countdown === 0) {
      state.phase = 'playing';
      state.events.push({ k: 'go' });
    }
    return false;
  }
  if (state.phase === 'over') {
    state.sinceOver += dt;
    return false;
  }
  state.elapsed += dt;
  return true;
}

export function aliveFighters(state: BaseMatchState): Fighter[] {
  return state.fighters.filter((f) => f.alive);
}

export function findFighter(state: BaseMatchState, id: string): Fighter | undefined {
  return state.fighters.find((f) => f.id === id);
}

/**
 * Tira uma vida. Vários jogos novos (GOL!, RAIO!, METEORO!, MINA!) dão três
 * chances em vez de eliminar no primeiro erro — errar uma vez e continuar na
 * partida é mais divertido do que assistir os amigos jogarem.
 *
 * @returns true se o jogador foi eliminado nesta chamada.
 */
export function hurt(
  state: BaseMatchState,
  f: Fighter,
  options: { invuln?: number; x?: number; y?: number; kind?: GameEvent['k'] } = {},
): boolean {
  if (!f.alive || f.invuln > 0) return false;
  f.lives -= 1;
  f.hitFlash = 1;
  f.squash = -0.8;
  f.stunTimer = Math.max(f.stunTimer, 0.22);
  f.invuln = options.invuln ?? 1.4;
  state.events.push({
    k: options.kind ?? 'life-lost',
    id: f.id,
    x: options.x ?? f.x,
    y: options.y ?? f.y,
    v: f.lives / 3,
  });
  if (f.lives <= 0) {
    eliminate(state, f, { v: 1 });
    return true;
  }
  return false;
}

export function eliminate(state: BaseMatchState, f: Fighter, extra?: Partial<GameEvent>): void {
  if (!f.alive) return;
  f.alive = false;
  f.place = state.nextPlace;
  state.nextPlace = Math.max(1, state.nextPlace - 1);
  f.vx = 0;
  f.vy = 0;
  f.dashTimer = 0;
  state.events.push({ k: 'out', id: f.id, x: f.x, y: f.y, ...extra });
}

/**
 * Fecha a partida: quem sobrou recebe colocação por pontuação (desempate por
 * tempo sobrevivido).
 */
export function closeMatch(state: BaseMatchState, rank?: (a: Fighter, b: Fighter) => number): void {
  if (state.phase === 'over') return;
  const survivors = state.fighters.filter((f) => f.place === 0);
  const sorted = survivors.sort(
    rank ?? ((a, b) => b.score - a.score || b.survived - a.survived),
  );
  let place = 1;
  for (const f of sorted) {
    f.place = place;
    place += 1;
  }
  state.phase = 'over';
  state.sinceOver = 0;
  const winner = state.fighters.find((f) => f.place === 1);
  state.events.push({ k: 'finish', id: winner?.id, x: winner?.x, y: winner?.y });
}

// ---------------------------------------------------------------------------
// Movimento
// ---------------------------------------------------------------------------

export function stepFighter(
  f: Fighter,
  input: InputState,
  cfg: MoveConfig,
  dt: number,
  events: GameEvent[],
  opts: { speedScale?: number; canDash?: boolean; frictionScale?: number } = {},
): void {
  const speedScale = opts.speedScale ?? 1;
  const canDash = opts.canDash ?? true;

  f.dashCooldown = Math.max(0, f.dashCooldown - dt);
  f.stunTimer = Math.max(0, f.stunTimer - dt);
  f.invuln = Math.max(0, f.invuln - dt);
  f.hitFlash = Math.max(0, f.hitFlash - dt * 3.6);
  f.stagger = Math.max(0, f.stagger - dt * 0.045);
  f.squash += (0 - f.squash) * Math.min(1, dt * 9);

  const dashing = f.dashTimer > 0;
  const stunned = f.stunTimer > 0;

  const dir = clampVector(input.mx, input.my);
  const hasDir = len(dir.x, dir.y) > 0.08;

  // pedido de dash (contador monotônico evita perder o toque entre pacotes)
  if (canDash && input.dash > f.dashSeen) {
    const fresh = input.dash - f.dashSeen <= 3;
    f.dashSeen = input.dash;
    if (fresh && !dashing && !stunned && f.dashCooldown <= 0 && f.alive) {
      const d = hasDir ? normalize(dir.x, dir.y) : { x: f.dashDirX, y: f.dashDirY };
      f.dashDirX = d.x;
      f.dashDirY = d.y;
      f.vx = d.x * cfg.dashSpeed * speedScale;
      f.vy = d.y * cfg.dashSpeed * speedScale;
      f.dashTimer = cfg.dashTime;
      f.dashCooldown = cfg.dashCooldown;
      f.squash = 0.75;
      events.push({ k: 'dash', id: f.id, x: f.x, y: f.y });
    }
  }

  if (f.dashTimer > 0) {
    f.dashTimer = Math.max(0, f.dashTimer - dt);
    if (hasDir && cfg.dashSteer > 0) {
      f.vx += dir.x * cfg.accel * cfg.dashSteer * dt;
      f.vy += dir.y * cfg.accel * cfg.dashSteer * dt;
    }
    const drag = Math.pow(cfg.dashDrag, dt * 60);
    f.vx *= drag;
    f.vy *= drag;
  } else {
    if (!stunned && hasDir) {
      f.vx += dir.x * cfg.accel * dt;
      f.vy += dir.y * cfg.accel * dt;
      f.facing = dir.x !== 0 ? Math.sign(dir.x) : f.facing;
      f.dashDirX = dir.x;
      f.dashDirY = dir.y;
    }
    const friction = Math.pow(cfg.friction * (opts.frictionScale ?? 1), dt * 60);
    f.vx *= friction;
    f.vy *= friction;

    const max = cfg.maxSpeed * speedScale;
    const speed = len(f.vx, f.vy);
    if (speed > max) {
      const k = max / speed;
      // knockback pode passar do teto: só limita quando o jogador está no controle
      const soft = stunned ? Math.max(k, 0.985) : k;
      f.vx *= soft;
      f.vy *= soft;
    }
  }

  f.x += f.vx * dt;
  f.y += f.vy * dt;
}

/** Decaimento visual para quem não está mais jogando. */
export function stepDead(f: Fighter, dt: number): void {
  f.hitFlash = Math.max(0, f.hitFlash - dt * 3);
  f.squash += (0 - f.squash) * Math.min(1, dt * 6);
}

// ---------------------------------------------------------------------------
// Colisões
// ---------------------------------------------------------------------------

export interface CollisionOptions {
  knockScale?: number;
  staggerGrowth?: number;
  onHit?: (attacker: Fighter, victim: Fighter, power: number) => void;
  /** colisão entre dois jogadores mesmo sem dash gera evento a partir desta força */
  bumpThreshold?: number;
}

export function resolveFighterCollisions(
  fighters: Fighter[],
  cfg: MoveConfig,
  events: GameEvent[],
  opts: CollisionOptions = {},
): void {
  const knockScale = opts.knockScale ?? 1;
  const staggerGrowth = opts.staggerGrowth ?? 0.13;
  const bumpThreshold = opts.bumpThreshold ?? 260;

  for (let i = 0; i < fighters.length; i += 1) {
    const a = fighters[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < fighters.length; j += 1) {
      const b = fighters[j];
      if (!b.alive) continue;

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = len(dx, dy);
      const min = a.radius + b.radius;
      if (d >= min || d < 1e-4) continue;

      const nx = dx / d;
      const ny = dy / d;
      const overlap = min - d;

      a.x -= nx * overlap * 0.5;
      a.y -= ny * overlap * 0.5;
      b.x += nx * overlap * 0.5;
      b.y += ny * overlap * 0.5;

      const rvx = b.vx - a.vx;
      const rvy = b.vy - a.vy;
      const approach = rvx * nx + rvy * ny;
      if (approach < 0) {
        const impulse = -approach * (1 + cfg.bounce) * 0.5;
        a.vx -= nx * impulse;
        a.vy -= ny * impulse;
        b.vx += nx * impulse;
        b.vy += ny * impulse;
      }

      const aDash = a.dashTimer > 0;
      const bDash = b.dashTimer > 0;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;

      const smash = (attacker: Fighter, victim: Fighter, sign: number, scale: number): number => {
        const power = cfg.knockback * knockScale * scale * (1 + victim.stagger * 1.75);
        victim.vx += nx * sign * power;
        victim.vy += ny * sign * power;
        victim.stunTimer = Math.max(victim.stunTimer, 0.15 + victim.stagger * 0.12);
        victim.stagger = clamp01(victim.stagger + staggerGrowth);
        victim.hitFlash = 1;
        victim.squash = -0.7;
        attacker.dashTimer = Math.min(attacker.dashTimer, 0.03);
        attacker.vx *= 0.4;
        attacker.vy *= 0.4;
        attacker.squash = -0.35;
        opts.onHit?.(attacker, victim, power);
        return power;
      };

      let power = 0;
      if (aDash && !bDash) {
        power = smash(a, b, 1, 1);
      } else if (bDash && !aDash) {
        power = smash(b, a, -1, 1);
      } else if (aDash && bDash) {
        power = smash(a, b, 1, 0.62);
        smash(b, a, -1, 0.62);
      }

      const relSpeed = Math.abs(approach);
      if (power > 0) {
        events.push({ k: 'hit', x: mx, y: my, v: clamp01(power / (cfg.knockback * 1.9)) });
      } else if (relSpeed > bumpThreshold) {
        events.push({ k: 'hit', x: mx, y: my, v: clamp01(relSpeed / 900) * 0.5 });
        a.squash = Math.min(a.squash, -0.25);
        b.squash = Math.min(b.squash, -0.25);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Limites de arena
// ---------------------------------------------------------------------------

export function containInRect(
  f: Fighter,
  x: number,
  y: number,
  w: number,
  h: number,
  bounce = 0.45,
): boolean {
  let hit = false;
  const minX = x + f.radius;
  const maxX = x + w - f.radius;
  const minY = y + f.radius;
  const maxY = y + h - f.radius;
  if (f.x < minX) {
    f.x = minX;
    f.vx = Math.abs(f.vx) * bounce;
    hit = true;
  } else if (f.x > maxX) {
    f.x = maxX;
    f.vx = -Math.abs(f.vx) * bounce;
    hit = true;
  }
  if (f.y < minY) {
    f.y = minY;
    f.vy = Math.abs(f.vy) * bounce;
    hit = true;
  } else if (f.y > maxY) {
    f.y = maxY;
    f.vy = -Math.abs(f.vy) * bounce;
    hit = true;
  }
  return hit;
}

export function containInCircle(
  f: Fighter,
  cx: number,
  cy: number,
  radius: number,
  bounce = 0.4,
): boolean {
  const dx = f.x - cx;
  const dy = f.y - cy;
  const d = len(dx, dy);
  const max = radius - f.radius;
  if (d <= max || d < 1e-5) return false;
  const nx = dx / d;
  const ny = dy / d;
  f.x = cx + nx * max;
  f.y = cy + ny * max;
  const radial = f.vx * nx + f.vy * ny;
  if (radial > 0) {
    f.vx -= nx * radial * (1 + bounce);
    f.vy -= ny * radial * (1 + bounce);
  }
  return true;
}

/** Passou totalmente da borda? Usado para eliminação em arenas abertas. */
export function isOutsideCircle(f: Fighter, cx: number, cy: number, radius: number): boolean {
  return dist(f.x, f.y, cx, cy) > radius + f.radius * 0.55;
}

export function keepInWorld(f: Fighter, margin = 120): void {
  f.x = clamp(f.x, -margin, WORLD.w + margin);
  f.y = clamp(f.y, -margin, WORLD.h + margin);
}

// ---------------------------------------------------------------------------
// Helpers de IA
// ---------------------------------------------------------------------------

export function nearestOther(
  fighters: Fighter[],
  self: Fighter,
  filter?: (f: Fighter) => boolean,
): Fighter | null {
  let best: Fighter | null = null;
  let bestD = Infinity;
  for (const f of fighters) {
    if (f === self || !f.alive) continue;
    if (filter && !filter(f)) continue;
    const d = dist(self.x, self.y, f.x, f.y);
    if (d < bestD) {
      bestD = d;
      best = f;
    }
  }
  return best;
}

export function towards(self: Fighter, tx: number, ty: number, jitter = 0): InputState {
  const dir = normalize(tx - self.x + self.ai.jitterX * jitter, ty - self.y + self.ai.jitterY * jitter);
  return { mx: dir.x, my: dir.y, dash: self.dashSeen };
}

export function awayFrom(self: Fighter, tx: number, ty: number, jitter = 0): InputState {
  const input = towards(self, tx, ty, jitter);
  return { mx: -input.mx, my: -input.my, dash: self.dashSeen };
}

/** Atualiza o "cérebro" do bot em intervalos, gerando jitter humano. */
export function aiThink(f: Fighter, dt: number, interval: number, rand: () => number): boolean {
  f.ai.think -= dt;
  if (f.ai.think > 0) return false;
  f.ai.think = interval * (0.7 + rand() * 0.6);
  f.ai.jitterX = (rand() - 0.5) * 220;
  f.ai.jitterY = (rand() - 0.5) * 220;
  return true;
}

export function requestBotDash(f: Fighter): number {
  return f.dashSeen + 1;
}

// ---------------------------------------------------------------------------
// Serialização
// ---------------------------------------------------------------------------

export function netFighter(f: Fighter): NetFighter {
  return {
    i: f.id,
    x: round1(f.x),
    y: round1(f.y),
    vx: round1(f.vx),
    vy: round1(f.vy),
    a: f.alive ? 1 : 0,
    d: f.dashTimer > 0 ? 1 : 0,
    s: f.stunTimer > 0 ? 1 : 0,
    h: round2(f.hitFlash),
    g: round2(f.stagger),
    c: round2(f.score),
    p: f.place,
    f: f.facing >= 0 ? 1 : -1,
    l: f.lives,
    iv: f.invuln > 0 ? 1 : 0,
  };
}

export function baseSnapshotFields(
  state: BaseMatchState,
  seq: number,
  now: number,
  remaining: number,
): {
  seq: number;
  t: number;
  ph: MatchPhase;
  cd: number;
  el: number;
  rt: number;
  ps: NetFighter[];
  ev: GameEvent[];
} {
  return {
    seq,
    t: now,
    ph: state.phase,
    cd: round2(state.countdown),
    el: round2(state.elapsed),
    rt: round2(remaining),
    ps: state.fighters.map(netFighter),
    ev: state.events.slice(),
  };
}
