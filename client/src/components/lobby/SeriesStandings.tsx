import { motion } from 'framer-motion';
import { paletteForSlot, type PlayerPublic } from '@shared/index';
import { Creature } from '@/components/avatar/Creature';
import { cn } from '@/utils/cn';

/**
 * Placar acumulado do campeonato. Aparece no lobby, entre rodadas e no final —
 * é o fio que costura as partidas soltas em uma sessão com os amigos.
 */
export function SeriesStandings({
  players,
  selfId,
  showEarned,
  earnedById,
  className,
}: {
  players: PlayerPublic[];
  selfId: string | null;
  /** mostra o "+N" da rodada que acabou */
  showEarned?: boolean;
  earnedById?: Record<string, number>;
  className?: string;
}): JSX.Element {
  const ranked = players
    .slice()
    .sort((a, b) => b.points - a.points || b.wins - a.wins || a.slot - b.slot);
  const leader = ranked[0];
  const tied = ranked.filter((player) => player.points === leader?.points).length > 1;

  return (
    <ul className={cn('space-y-1.5', className)}>
      {ranked.map((player, index) => {
        const palette = paletteForSlot(player.slot);
        const isSelf = player.id === selfId;
        const isLeader = index === 0 && (player.points > 0 || false) && !tied;
        const earned = earnedById?.[player.id] ?? 0;

        return (
          <motion.li
            key={player.id}
            layout
            className={cn(
              'flex items-center gap-2.5 rounded-2xl px-2.5 py-2',
              isSelf ? 'bg-grape-100 ring-2 ring-grape-300' : 'bg-white/75',
            )}
          >
            <span className="w-5 text-center font-display text-sm font-extrabold text-ink-mute">
              {index + 1}
            </span>
            <span
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
              style={{ background: `linear-gradient(140deg, ${palette.light}, ${palette.base})` }}
            >
              <Creature
                avatar={player.avatar}
                slot={player.slot}
                size={34}
                animated={false}
                shadow={false}
                label={null}
              />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-sm font-extrabold text-ink">
                  {player.name}
                  {isSelf ? ' (você)' : ''}
                </span>
                {isLeader ? (
                  <span aria-label="Líder" title="Líder">
                    👑
                  </span>
                ) : null}
              </span>
              <span className="block text-[11px] font-bold text-ink-mute">
                {player.wins > 0 ? `${player.wins} rodada${player.wins === 1 ? '' : 's'} ganha${player.wins === 1 ? '' : 's'}` : 'ainda sem vitória'}
              </span>
            </span>
            {showEarned && earned > 0 ? (
              <motion.span
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.35 + index * 0.06, type: 'spring', stiffness: 400 }}
                className="rounded-full bg-mint-300 px-2 py-0.5 font-display text-xs font-extrabold text-[#08553F]"
              >
                +{earned}
              </motion.span>
            ) : null}
            <span className="w-10 text-right font-display text-lg font-extrabold tabular-nums text-grape-700">
              {player.points}
            </span>
          </motion.li>
        );
      })}
    </ul>
  );
}
