import { motion } from 'framer-motion';
import { paletteForSlot, type PlayerPublic } from '@shared/index';
import { Creature } from '@/components/avatar/Creature';
import { cn } from '@/utils/cn';

export function PlayerSlot({
  player,
  isSelf,
  canRemove,
  onRemove,
  emote,
}: {
  player: PlayerPublic;
  isSelf: boolean;
  canRemove: boolean;
  onRemove?: () => void;
  emote?: string | null;
}): JSX.Element {
  const palette = paletteForSlot(player.slot);

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 16, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
      className={cn(
        'relative flex items-center gap-3 rounded-3xl border-2 bg-white/85 p-3 shadow-soft backdrop-blur-sm transition-colors',
        isSelf ? 'border-grape-300' : 'border-white',
        !player.connected && 'opacity-60',
      )}
    >
      <div
        className="relative grid h-14 w-14 shrink-0 place-items-center rounded-2xl"
        style={{ background: `linear-gradient(140deg, ${palette.light}, ${palette.base})` }}
      >
        <Creature
          avatar={player.avatar}
          slot={player.slot}
          size={52}
          expression={player.ready ? 'cheer' : 'idle'}
          label={null}
        />
        {player.isHost ? (
          <span
            className="absolute -right-1.5 -top-2 rounded-full bg-lemon-400 px-1.5 py-0.5 text-[10px] font-extrabold text-[#6B3D00] shadow-pop-sm"
            title="Host da sala"
          >
            HOST
          </span>
        ) : null}
        {emote ? (
          <motion.span
            key={emote}
            initial={{ scale: 0, y: 10 }}
            animate={{ scale: 1, y: -8 }}
            exit={{ scale: 0 }}
            className="absolute -top-6 left-1/2 -translate-x-1/2 text-2xl drop-shadow"
            aria-hidden
          >
            {emote}
          </motion.span>
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate font-display text-base font-extrabold text-ink">
          {player.name}
          {isSelf ? (
            <span className="rounded-full bg-grape-100 px-1.5 py-0.5 text-[10px] font-extrabold text-grape-700">
              você
            </span>
          ) : null}
          {player.bot ? (
            <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-extrabold text-[#0A4767]">
              bot
            </span>
          ) : null}
        </p>
        <p className="mt-0.5 text-xs font-bold text-ink-mute">
          {!player.connected
            ? 'reconectando…'
            : player.wins > 0
              ? `${player.wins} ${player.wins === 1 ? 'vitória' : 'vitórias'} · ${player.rounds} rodadas`
              : player.rounds > 0
                ? `${player.rounds} rodadas`
                : 'estreando na sala'}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <span
          className={cn(
            'grid h-8 w-8 place-items-center rounded-full text-sm font-extrabold transition-colors',
            player.ready ? 'bg-mint-300 text-[#08553F]' : 'bg-grape-50 text-ink-mute',
          )}
          title={player.ready ? 'Pronto' : 'Aguardando'}
        >
          {player.ready ? '✓' : '…'}
        </span>
        {canRemove ? (
          <button
            type="button"
            onClick={onRemove}
            className="grid h-8 w-8 place-items-center rounded-full bg-bubble-100 text-sm font-extrabold text-bubble-600 transition hover:bg-bubble-200"
            aria-label={`Remover ${player.name} da sala`}
            title="Remover da sala"
          >
            ×
          </button>
        ) : null}
      </div>
    </motion.li>
  );
}

export function EmptySlot({
  index,
  onAddBot,
  onInvite,
  canAct,
}: {
  index: number;
  onAddBot: () => void;
  onInvite: () => void;
  canAct: boolean;
}): JSX.Element {
  return (
    <li className="flex items-center gap-3 rounded-3xl border-2 border-dashed border-grape-200 bg-white/45 p-3">
      <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-grape-50 font-display text-xl font-extrabold text-grape-300">
        {index + 1}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-display text-base font-extrabold text-ink-mute">Vaga livre</p>
        <p className="text-xs font-bold text-ink-mute/80">Chame alguém ou complete com bot</p>
      </div>
      {canAct ? (
        <div className="flex shrink-0 gap-1.5">
          <button
            type="button"
            onClick={onInvite}
            className="rounded-full bg-grape-100 px-3 py-1.5 text-xs font-extrabold text-grape-700 transition hover:bg-grape-200"
          >
            convidar
          </button>
          <button
            type="button"
            onClick={onAddBot}
            className="rounded-full bg-sky-100 px-3 py-1.5 text-xs font-extrabold text-[#0A4767] transition hover:bg-sky-200"
          >
            + bot
          </button>
        </div>
      ) : null}
    </li>
  );
}
