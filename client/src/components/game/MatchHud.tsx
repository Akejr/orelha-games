import { motion } from 'framer-motion';
import {
  formatClock,
  getGameMeta,
  type AvatarId,
  type GameCatalogEntry,
  type GameId,
  type MatchPhase,
  type Palette,
} from '@shared/index';
import { Creature } from '@/components/avatar/Creature';
import { cn } from '@/utils/cn';

export interface HudPlayer {
  id: string;
  name: string;
  avatar: AvatarId;
  slot: number;
  palette: Palette;
  isSelf: boolean;
  alive: boolean;
  place: number;
  score: number;
  lives: number;
  bot: boolean;
  connected: boolean;
}

export interface HudState {
  phase: MatchPhase;
  countdown: number;
  elapsed: number;
  remaining: number;
  alive: number;
  total: number;
  players: HudPlayer[];
  /** meta de pontuação do jogo (coroa, zona, corrida…) */
  target: number;
  crownHolder: string | null;
  crownMultiplier: number;
  bombFuse: number;
  bombHolder: string | null;
  bombHolders: string[];
  paintRush: boolean;
  /** instrução dinâmica enviada pelo jogo (ex: "PISE NO AZUL!") */
  objective: string | null;
  /** rodada do campeonato */
  seriesRound: number;
  seriesRounds: number;
}

/**
 * O placar de cada jogo é lido a partir do catálogo (`scoreKind`), não de um
 * `switch (gameId)`. Foi o que permitiu passar de 5 para 15 minijogos sem
 * reescrever o HUD.
 */
function ScoreValue({
  meta,
  player,
  hud,
}: {
  meta: GameCatalogEntry;
  player: HudPlayer;
  hud: HudState;
}): JSX.Element {
  switch (meta.scoreKind) {
    case 'time':
      return (
        <span className="tabular-nums">
          {player.score.toFixed(1)}
          {hud.target > 0 ? <span className="text-[10px] opacity-70">/{hud.target}s</span> : 's'}
        </span>
      );
    case 'percent':
      return <span className="tabular-nums">{player.score.toFixed(1)}%</span>;
    case 'points':
      return (
        <span className="tabular-nums">
          {Math.round(player.score)}
          {hud.target > 0 ? <span className="text-[10px] opacity-70">/{hud.target}</span> : ' pts'}
        </span>
      );
    default:
      return player.alive ? (
        <span className="text-mint-300">vivo</span>
      ) : (
        <span className="opacity-60">{player.place}º</span>
      );
  }
}

function ScoreBar({
  meta,
  player,
  hud,
}: {
  meta: GameCatalogEntry;
  player: HudPlayer;
  hud: HudState;
}): JSX.Element | null {
  const max = meta.scoreKind === 'percent' ? 100 : hud.target;
  if (max <= 0 || meta.scoreKind === 'survive') return null;
  const ratio = Math.min(1, player.score / max);
  return (
    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/20">
      <div
        className="h-full rounded-full transition-[width] duration-200"
        style={{ width: `${ratio * 100}%`, backgroundColor: player.palette.base }}
      />
    </div>
  );
}

/** Vidas como bolinhas — jogos de eliminação direta não mostram nada. */
function Lives({ player, max: declared }: { player: HudPlayer; max: number }): JSX.Element | null {
  // alguns jogos dão vida extra em sala pequena (CADEIRAS!), então o catálogo é
  // só o piso: quem tem mais vida que o declarado mostra mais bolinhas
  const max = Math.max(declared, player.lives);
  if (max <= 1) return null;
  return (
    <span className="mt-1 flex gap-0.5" aria-label={`${player.lives} de ${max} vidas`}>
      {Array.from({ length: max }).map((_, index) => (
        <span
          key={index}
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            index < player.lives ? 'bg-bubble-300' : 'bg-white/25',
          )}
        />
      ))}
    </span>
  );
}

export function MatchHud({
  gameId,
  hud,
  latency,
  onLeave,
}: {
  gameId: GameId;
  hud: HudState;
  latency: number;
  onLeave: () => void;
}): JSX.Element {
  const meta = getGameMeta(gameId);
  const sorted = hud.players.slice().sort((a, b) => {
    if (meta.scoreKind !== 'survive') return b.score - a.score;
    if (a.alive !== b.alive) return a.alive ? -1 : 1;
    if (a.lives !== b.lives) return b.lives - a.lives;
    return a.place === 0 ? -1 : a.place - b.place;
  });

  const timeLeft = hud.remaining >= 0 ? hud.remaining : 0;
  const urgent = timeLeft <= 10 && hud.phase === 'playing';

  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      {/* topo */}
      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3 safe-top sm:p-4">
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onLeave}
            className="grid h-9 w-9 place-items-center rounded-2xl bg-black/35 text-lg font-extrabold text-white backdrop-blur-md transition hover:bg-black/50"
            aria-label="Sair da partida"
          >
            ←
          </button>
          <div className="rounded-2xl bg-black/35 px-3 py-1.5 backdrop-blur-md">
            <p className="flex items-center gap-2 font-display text-sm font-extrabold leading-none text-white sm:text-base">
              {meta.name}
              {hud.seriesRounds > 0 ? (
                <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-extrabold text-white/90">
                  rodada {hud.seriesRound}/{hud.seriesRounds}
                </span>
              ) : null}
            </p>
            <p className="mt-0.5 hidden text-[11px] font-bold leading-none text-white/70 sm:block">
              {meta.objective}
            </p>
          </div>
        </div>

        {/* cronômetro */}
        <div
          className={cn(
            'rounded-2xl px-4 py-1.5 text-center backdrop-blur-md',
            urgent ? 'bg-bubble-500/80' : 'bg-black/35',
          )}
        >
          <p
            className={cn(
              'font-display text-2xl font-extrabold leading-none tabular-nums text-white sm:text-3xl',
              urgent && 'animate-ticker-flash',
            )}
          >
            {formatClock(timeLeft)}
          </p>
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-white/70">
            tempo
          </p>
        </div>

        <div className="rounded-2xl bg-black/35 px-3 py-1.5 text-right backdrop-blur-md">
          {meta.scoreKind === 'survive' ? (
            <p className="font-display text-sm font-extrabold leading-none text-white">
              {hud.alive} <span className="text-white/60">de {hud.total} vivos</span>
            </p>
          ) : (
            <p className="font-display text-sm font-extrabold leading-none text-lemon-300">
              {hud.target > 0 ? `meta ${hud.target}` : meta.hudHint}
            </p>
          )}
          <p className="mt-0.5 text-[10px] font-bold leading-none text-white/60 tabular-nums">
            {latency} ms
          </p>
        </div>
      </div>

      {/* faixa de instrução dinâmica (CORES!, ZONA! disputada, final rush…) */}
      {hud.objective || hud.paintRush ? (
        <div className="absolute inset-x-0 top-[72px] flex justify-center px-4 sm:top-[84px]">
          <p className="animate-ticker-flash rounded-2xl bg-black/45 px-4 py-1.5 font-display text-sm font-extrabold text-white backdrop-blur-md sm:text-base">
            {hud.objective ?? 'FINAL RUSH!'}
          </p>
        </div>
      ) : null}

      {/* barra de tinta empilhada */}
      {gameId === 'paint' ? (
        <div className="absolute inset-x-0 top-[76px] flex justify-center px-4 sm:top-[86px]">
          <div className="flex h-4 w-full max-w-lg overflow-hidden rounded-full bg-black/30 backdrop-blur-md">
            {sorted.map((player) => (
              <div
                key={player.id}
                className="h-full transition-[width] duration-200"
                style={{
                  width: `${player.score}%`,
                  backgroundColor: player.palette.base,
                  boxShadow: player.isSelf ? 'inset 0 0 0 2px rgba(255,255,255,0.9)' : undefined,
                }}
                title={`${player.name}: ${player.score.toFixed(1)}%`}
              />
            ))}
          </div>
        </div>
      ) : null}

      {/* pavio da bomba */}
      {gameId === 'bomb' && hud.bombHolder ? (
        <div className="absolute inset-x-0 top-[76px] flex justify-center px-4 sm:top-[86px]">
          <div className="w-full max-w-sm rounded-full bg-black/35 p-1 backdrop-blur-md">
            <div className="h-3 overflow-hidden rounded-full bg-white/15">
              <motion.div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(2, hud.bombFuse * 100)}%`,
                  background:
                    hud.bombFuse > 0.5
                      ? 'linear-gradient(90deg,#FFC93C,#FF7A59)'
                      : 'linear-gradient(90deg,#FF7A59,#F5348A)',
                }}
              />
            </div>
          </div>
        </div>
      ) : null}

      {/* multiplicador da coroa */}
      {gameId === 'crown' && hud.crownMultiplier > 1.05 ? (
        <div className="absolute inset-x-0 top-[76px] flex justify-center px-4 sm:top-[86px]">
          <p className="rounded-2xl bg-lemon-400/90 px-3 py-1 font-display text-sm font-extrabold text-[#6B3D00] backdrop-blur-md">
            coroa x{hud.crownMultiplier.toFixed(1)}
          </p>
        </div>
      ) : null}

      {/* jogadores */}
      <div className="absolute inset-x-0 bottom-0 p-3 safe-bottom sm:p-4">
        <div className="mx-auto flex max-w-3xl flex-wrap items-end justify-center gap-1.5 sm:gap-2">
          {sorted.map((player) => (
            <motion.div
              key={player.id}
              layout
              className={cn(
                'flex min-w-[86px] items-center gap-2 rounded-2xl px-2 py-1.5 backdrop-blur-md transition-opacity sm:min-w-[112px]',
                player.alive ? 'bg-black/38' : 'bg-black/22 opacity-60',
                player.isSelf && 'ring-2 ring-white/70',
              )}
            >
              <div className="relative">
                <Creature
                  avatar={player.avatar}
                  slot={player.slot}
                  size={30}
                  animated={false}
                  shadow={false}
                  expression={player.alive ? 'idle' : 'dizzy'}
                  label={null}
                />
                {player.id === hud.crownHolder ? (
                  <span className="absolute -right-1 -top-1 text-[13px]" aria-hidden>
                    👑
                  </span>
                ) : null}
                {hud.bombHolders.includes(player.id) ? (
                  <span
                    className="absolute -right-1 -top-1 animate-ticker-flash text-[13px]"
                    aria-hidden
                  >
                    💥
                  </span>
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-extrabold leading-none text-white">
                  {player.isSelf ? 'Você' : player.name}
                  {player.bot ? <span className="ml-1 opacity-60">bot</span> : null}
                </p>
                <p className="mt-0.5 text-[11px] font-bold leading-none text-white/80">
                  <ScoreValue meta={meta} player={player} hud={hud} />
                </p>
                <Lives player={player} max={meta.lives} />
                <ScoreBar meta={meta} player={player} hud={hud} />
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
