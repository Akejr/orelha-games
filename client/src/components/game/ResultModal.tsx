import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import {
  getGameMeta,
  paletteForSlot,
  type GameId,
  type MatchResults,
  type PlayerPublic,
} from '@shared/index';
import { Creature } from '@/components/avatar/Creature';
import { GamePreview } from '@/components/games/GamePreview';
import { SeriesStandings } from '@/components/lobby/SeriesStandings';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/utils/cn';
import { placeLabel } from '@/utils/format';

const MEDALS = ['🥇', '🥈', '🥉'];

/** Contagem para o início automático da próxima rodada. */
function useCountdown(target: number): number {
  const [left, setLeft] = useState(() => Math.max(0, Math.ceil((target - Date.now()) / 1000)));
  useEffect(() => {
    if (!target) return;
    const tick = (): void => setLeft(Math.max(0, Math.ceil((target - Date.now()) / 1000)));
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [target]);
  return target ? left : 0;
}

export interface ResultModalProps {
  open: boolean;
  results: MatchResults;
  players: PlayerPublic[];
  selfId: string | null;
  isHost: boolean;
  /** campeonato */
  rounds: number;
  seriesRound: number;
  seriesDone: boolean;
  nextGameId: GameId | null;
  nextRoundAt: number;
  onNext: () => void;
  onLobby: () => void;
  onExit: () => void;
}

export function ResultModal({
  open,
  results,
  players,
  selfId,
  isHost,
  rounds,
  seriesRound,
  seriesDone,
  nextGameId,
  nextRoundAt,
  onNext,
  onLobby,
  onExit,
}: ResultModalProps): JSX.Element {
  const meta = getGameMeta(results.gameId);
  const rows = results.rows.slice().sort((a, b) => a.place - b.place);
  const selfRow = rows.find((row) => row.playerId === selfId);
  const selfWon = Boolean(selfRow && selfRow.place === 1);
  const secondsLeft = useCountdown(nextRoundAt);

  const earnedById: Record<string, number> = {};
  for (const row of rows) earnedById[row.playerId] = row.earned ?? 0;

  // campeão da série: ordena pelo placar acumulado
  const ranked = players.slice().sort((a, b) => b.points - a.points || b.wins - a.wins);
  const champion = ranked[0];
  const championIsSelf = champion?.id === selfId;

  // ----------------------------------------------------------- fim da série
  if (seriesDone) {
    return (
      <Modal open={open} locked size="lg" className="!bg-cream">
        <div className="-mt-2 text-center">
          <p className="label-caps">campeonato encerrado · {rounds} rodadas</p>
          <h2 className="mt-1 font-display text-3xl font-extrabold text-ink sm:text-4xl">
            {championIsSelf ? 'Você é o campeão! 🏆' : `${champion?.name ?? '—'} é o campeão!`}
          </h2>
          <p className="mt-1 text-sm font-bold text-ink-soft">
            {champion?.points ?? 0} pontos em {rounds} {rounds === 1 ? 'rodada' : 'rodadas'}
          </p>
        </div>

        <div className="mt-5 flex justify-center">
          <motion.div
            initial={{ scale: 0.6, opacity: 0, rotate: -8 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 18 }}
            className="relative"
          >
            <div className="absolute -inset-6 animate-pulse-ring rounded-full bg-lemon-300/50" />
            <Creature
              avatar={champion?.avatar ?? 'blob'}
              slot={champion?.slot ?? 0}
              size={132}
              expression="cheer"
              label={null}
            />
          </motion.div>
        </div>

        <div className="mt-5">
          <p className="label-caps mb-2">placar final</p>
          <SeriesStandings players={players} selfId={selfId} />
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          {isHost ? (
            <Button block size="lg" onClick={onNext}>
              Novo campeonato
            </Button>
          ) : (
            <div className="flex-1 rounded-2xl bg-white px-4 py-3 text-center text-sm font-extrabold text-ink-soft ring-1 ring-grape-100">
              Aguardando o host começar outro…
            </div>
          )}
          <Button variant="secondary" size="lg" onClick={onLobby}>
            Voltar ao lobby
          </Button>
          <Button variant="ghost" size="lg" onClick={onExit} className="sm:w-auto">
            Sair
          </Button>
        </div>
      </Modal>
    );
  }

  // ------------------------------------------------------ resultado da rodada
  return (
    <Modal open={open} locked size="lg" className="!bg-cream">
      <div className="-mt-2 text-center">
        <p className="label-caps">
          rodada {seriesRound} de {rounds} · {meta.name}
        </p>
        <h2 className="mt-1 font-display text-2xl font-extrabold text-ink sm:text-3xl">
          {selfRow
            ? selfWon
              ? 'Você levou essa! 🎉'
              : `${placeLabel(selfRow.place)} nessa rodada`
            : 'Fim da rodada'}
        </h2>
      </div>

      {/* pódio compacto */}
      <div className="mt-4 flex items-end justify-center gap-3 sm:gap-5">
        {[1, 0, 2].map((position) => {
          const row = rows[position];
          if (!row) return null;
          const player = players.find((entry) => entry.id === row.playerId);
          const height = position === 0 ? 'h-16' : position === 1 ? 'h-11' : 'h-8';
          const size = position === 0 ? 68 : 52;
          return (
            <motion.div
              key={row.playerId}
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 + position * 0.08, type: 'spring', stiffness: 320, damping: 24 }}
              className="flex w-[78px] flex-col items-center sm:w-[96px]"
            >
              <span className="mb-0.5 text-lg" aria-hidden>
                {MEDALS[row.place - 1] ?? ''}
              </span>
              <Creature
                avatar={player?.avatar ?? 'blob'}
                slot={player?.slot ?? 0}
                size={size}
                expression={row.place === 1 ? 'cheer' : row.place === rows.length ? 'sad' : 'idle'}
                label={null}
              />
              <p className="mt-0.5 max-w-full truncate text-center text-[11px] font-extrabold text-ink">
                {player?.name ?? 'Saiu'}
              </p>
              <p className="text-[11px] font-bold text-ink-mute">{row.scoreLabel}</p>
              <div
                className={cn(
                  'mt-1 w-full rounded-t-2xl',
                  height,
                  row.place === 1
                    ? 'bg-gradient-to-b from-lemon-300 to-lemon-500'
                    : 'bg-gradient-to-b from-grape-200 to-grape-300',
                )}
              >
                <p className="pt-1 text-center font-display text-base font-extrabold text-white drop-shadow">
                  +{row.earned ?? 0}
                </p>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* placar do campeonato */}
      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <p className="label-caps">placar do campeonato</p>
          <p className="text-[11px] font-extrabold text-ink-mute">
            faltam {Math.max(0, rounds - seriesRound)}{' '}
            {rounds - seriesRound === 1 ? 'rodada' : 'rodadas'}
          </p>
        </div>
        <SeriesStandings players={players} selfId={selfId} showEarned earnedById={earnedById} />
      </div>

      {/* próximo jogo */}
      <AnimatePresence>
        {nextGameId ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="mt-5 overflow-hidden rounded-3xl border-2 border-grape-200 bg-white"
          >
            <div className="flex items-center gap-3 p-3">
              <div className="w-28 shrink-0 overflow-hidden rounded-2xl sm:w-36">
                <GamePreview gameId={nextGameId} className="aspect-[16/10]" rounded="rounded-2xl" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="label-caps">próximo jogo sorteado</p>
                <p className="truncate font-display text-xl font-extrabold text-ink">
                  {getGameMeta(nextGameId).name}
                </p>
                <p className="truncate text-xs font-bold text-ink-soft">
                  {getGameMeta(nextGameId).tagline}
                </p>
              </div>
              {secondsLeft > 0 ? (
                <div className="shrink-0 text-center">
                  <p className="font-display text-3xl font-extrabold tabular-nums text-grape-600">
                    {secondsLeft}
                  </p>
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-ink-mute">
                    começa
                  </p>
                </div>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        {isHost ? (
          <Button block size="lg" onClick={onNext}>
            Começar agora
          </Button>
        ) : (
          <div className="flex-1 rounded-2xl bg-white px-4 py-3 text-center text-sm font-extrabold text-ink-soft ring-1 ring-grape-100">
            {secondsLeft > 0 ? `Próxima rodada em ${secondsLeft}s` : 'Começando…'}
          </div>
        )}
        {isHost ? (
          <Button variant="secondary" size="lg" onClick={onLobby}>
            Encerrar série
          </Button>
        ) : null}
        <Button variant="ghost" size="lg" onClick={onExit} className="sm:w-auto">
          Sair
        </Button>
      </div>
    </Modal>
  );
}
