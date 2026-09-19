/**
 * Verificação headless do código de desenho.
 *
 * O build do TypeScript garante tipos, mas não garante que uma função de render
 * não estoure em runtime (um `undefined` num gradiente, por exemplo). Aqui um
 * canvas falso registra as chamadas enquanto rodamos, de verdade, uma partida de
 * cada minijogo e desenhamos todos os personagens e expressões.
 *
 * Uso: npx tsx scripts/render-check.ts   (dentro de /client)
 */
import {
  GAME_CATALOG,
  emptyInput,
  getGameModule,
  paletteForSlot,
  type AvatarId,
  type BaseMatchState,
  type Expression,
  type GameId,
  type InputState,
  type Snapshot,
} from '@shared/index';
import { AVATAR_IDS } from '@shared/avatars';
import { drawBomb, drawCreature, drawCrown } from '@/games/render/creature';
import { FxLayer } from '@/games/render/fx';
import { createFighterFx, type PlayerMeta, type RenderView } from '@/games/render/types';
import { getPreview } from '@/components/games/previews';
import { createRenderer } from '@/games/render';

let calls = 0;

function makeGradient(): CanvasGradient {
  return { addColorStop: () => undefined } as unknown as CanvasGradient;
}

function makeContext(): CanvasRenderingContext2D {
  const target: Record<string, unknown> = {
    canvas: { width: 1200, height: 800 },
    createLinearGradient: () => makeGradient(),
    createRadialGradient: () => makeGradient(),
    createPattern: () => null,
    measureText: () => ({ width: 42 }) as TextMetrics,
    createImageData: (w: number, h: number) => ({
      width: w,
      height: h,
      data: new Uint8ClampedArray(w * h * 4),
      colorSpace: 'srgb',
    }),
    getImageData: (_x: number, _y: number, w: number, h: number) => ({
      width: w,
      height: h,
      data: new Uint8ClampedArray(w * h * 4),
      colorSpace: 'srgb',
    }),
    putImageData: () => undefined,
    getTransform: () => ({}),
    isPointInPath: () => false,
  };

  return new Proxy(target, {
    get(store, prop: string) {
      if (prop in store) return store[prop];
      // qualquer método de desenho: no-op contabilizado
      return (...args: unknown[]) => {
        calls += 1;
        void args;
        return undefined;
      };
    },
    set(store, prop: string, value) {
      store[prop] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

// shim mínimo de DOM para os renderers que criam canvas offscreen
const ctx = makeContext();
(globalThis as unknown as { document: unknown }).document = {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => ctx,
  }),
};
(globalThis as unknown as { window: unknown }).window = { devicePixelRatio: 1 };

function buildView(snapshot: Snapshot, gameId: GameId): RenderView {
  const meta = new Map<string, PlayerMeta>();
  const local = new Map<string, ReturnType<typeof createFighterFx>>();
  snapshot.ps.forEach((fighter, index) => {
    meta.set(fighter.i, {
      id: fighter.i,
      name: `Jogador ${index + 1}`,
      avatar: AVATAR_IDS[index % AVATAR_IDS.length],
      slot: index,
      palette: paletteForSlot(index),
      isSelf: index === 0,
      bot: index > 0,
      connected: index !== 2,
    });
    local.set(fighter.i, createFighterFx());
  });

  return {
    ctx,
    width: 1200,
    height: 800,
    scale: 1.2,
    t: 12.5,
    dt: 1 / 60,
    snapshot,
    fighters: snapshot.ps.map((fighter) => ({
      id: fighter.i,
      x: fighter.x,
      y: fighter.y,
      vx: fighter.vx,
      vy: fighter.vy,
      alive: fighter.a === 1,
      dashing: fighter.d === 1,
      stunned: fighter.s === 1,
      flash: fighter.h,
      stagger: fighter.g,
      score: fighter.c,
      place: fighter.p,
      facing: fighter.f,
    })),
    fx: new FxLayer(),
    meta,
    local,
    selfId: snapshot.ps[0]?.i ?? null,
    theme: GAME_CATALOG.find((game) => game.id === gameId)!.theme,
    countdown: snapshot.ph === 'countdown',
    winnerId: snapshot.ps.find((f) => f.p === 1)?.i ?? null,
  };
}

function runGame(gameId: GameId): void {
  const module = getGameModule(gameId);
  const state = module.create({
    seed: 12345,
    round: 1,
    players: [
      { id: 'p1', slot: 0, bot: false, connected: true },
      { id: 'p2', slot: 1, bot: true, connected: true },
      { id: 'p3', slot: 2, bot: true, connected: false },
      { id: 'p4', slot: 3, bot: true, connected: true },
    ],
  }) as BaseMatchState;

  const renderer = createRenderer(gameId);
  const dt = 1 / 60;
  let frames = 0;

  // ~25 segundos de partida, desenhando um frame a cada 10 ticks
  for (let tick = 0; tick < 1500; tick += 1) {
    const inputs: Record<string, InputState> = {};
    for (const fighter of state.fighters) {
      if (!fighter.alive) continue;
      inputs[fighter.id] =
        fighter.id === 'p1'
          ? { mx: Math.sin(tick / 40), my: Math.cos(tick / 55), dash: Math.floor(tick / 90) }
          : module.bot(state, fighter, dt);
    }
    module.step(state, dt, inputs);
    if (tick % 10 === 0) {
      const snapshot = module.snapshot(state, tick, Date.now());
      const view = buildView(snapshot, gameId);
      renderer(view);
      view.fx.update(dt);
      view.fx.drawFront(ctx);
      view.fx.drawBehind(ctx);
      frames += 1;
      state.events.length = 0;
    }
    if (module.isOver(state) && state.sinceOver > 1.4) break;
  }

  const results = module.results(state);
  console.log(
    `OK   ${gameId.padEnd(10)} ${frames} frames · ${results.rows.length} colocações · vencedor ${
      results.winnerId ?? '—'
    } · ${state.elapsed.toFixed(1)}s`,
  );
}

function runPreviews(): void {
  for (const game of GAME_CATALOG) {
    const preview = getPreview(game.id);
    const store: Record<string, unknown> = {};
    for (let frame = 0; frame < 90; frame += 1) {
      const p = (frame / 90) % 1;
      preview.draw({
        ctx,
        t: frame / 30,
        p,
        wrapped: frame === 0,
        theme: game.theme,
        store,
      });
    }
    console.log(`OK   preview ${game.id}`);
  }
}

function runCreatures(): void {
  const expressions: Expression[] = ['idle', 'happy', 'scared', 'angry', 'cheer', 'dizzy', 'sad'];
  for (const avatar of AVATAR_IDS as AvatarId[]) {
    for (const expression of expressions) {
      for (const squash of [-0.8, 0, 0.7]) {
        drawCreature(ctx, {
          type: avatar,
          palette: paletteForSlot(2),
          x: 100,
          y: 100,
          r: 26,
          t: 3.2,
          vx: 180,
          vy: -60,
          squash,
          expression,
          flash: 0.5,
          glow: 'rgba(255,255,255,0.3)',
          phase: 1.1,
        });
      }
    }
  }
  drawCrown(ctx, 50, 50, 22, 1.5, { grounded: true });
  drawCrown(ctx, 50, 50, 22, 1.5, { grounded: false });
  drawBomb(ctx, 50, 50, 18, 1.5, 0.8);
  drawBomb(ctx, 50, 50, 18, 1.5, 0.05);
  console.log(`OK   personagens (${AVATAR_IDS.length} criaturas × ${expressions.length} expressões)`);
}

try {
  runCreatures();
  runPreviews();
  for (const game of GAME_CATALOG) runGame(game.id);
  console.log(`\nTUDO DESENHOU SEM ERRO (${calls.toLocaleString('pt-BR')} chamadas de canvas)`);
} catch (error) {
  console.error('\nFALHOU no render:', error);
  process.exit(1);
}
