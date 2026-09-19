import { motion } from 'framer-motion';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { GameCatalogEntry } from '@shared/index';
import { sound } from '@/audio/SoundManager';
import { Badge } from '@/components/ui/Badge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { cn } from '@/utils/cn';
import { GamePreview } from './GamePreview';

function ChaosMeter({ level }: { level: number }): JSX.Element {
  return (
    <span className="inline-flex items-center gap-1" title={`Nível de caos: ${level} de 5`}>
      {[1, 2, 3, 4, 5].map((step) => (
        <span
          key={step}
          aria-hidden
          className={cn(
            'h-1.5 w-4 rounded-full transition-colors',
            step <= level ? 'bg-bubble-400' : 'bg-grape-100',
          )}
        />
      ))}
      <span className="sr-only">Nível de caos {level} de 5</span>
    </span>
  );
}

export interface GameCardProps {
  game: GameCatalogEntry;
  index?: number;
  onPlay?: (game: GameCatalogEntry) => void;
  playLabel?: string;
  compact?: boolean;
}

export function GameCard({
  game,
  index = 0,
  onPlay,
  playLabel = 'Criar sala',
  compact = false,
}: GameCardProps): JSX.Element {
  const [hover, setHover] = useState(false);

  return (
    <motion.article
      initial={{ opacity: 0, y: 26 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.45, delay: Math.min(index * 0.07, 0.35), ease: [0.22, 1, 0.36, 1] }}
      className="group relative"
      onPointerEnter={() => {
        setHover(true);
        sound.play('hover');
      }}
      onPointerLeave={() => setHover(false)}
      onTouchStart={() => setHover(true)}
    >
      <div
        className={cn(
          'relative flex h-full flex-col overflow-hidden rounded-4xl border border-white/70 bg-white/85 shadow-card backdrop-blur-xl transition-all duration-300 ease-pop',
          'group-hover:-translate-y-1.5 group-hover:shadow-[0_28px_60px_-24px_rgba(52,26,126,0.5)]',
        )}
      >
        {/* aro de brilho no hover */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-4xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{ boxShadow: `inset 0 0 0 2.5px ${game.theme.from}55` }}
        />

        <div className="relative">
          <GamePreview
            gameId={game.id}
            speed={hover ? 1.35 : 1}
            rounded="rounded-none"
            className={cn(compact ? 'aspect-[16/8]' : 'aspect-[16/9]')}
          />
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/45 to-transparent"
            aria-hidden
          />
          <div className="pointer-events-none absolute inset-x-4 bottom-3 flex items-end justify-between gap-3">
            <h3 className="font-display text-2xl font-extrabold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.35)] sm:text-[28px]">
              {game.name}
            </h3>
            <span className="rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-extrabold text-ink shadow-soft">
              {game.minPlayers}–{game.maxPlayers} jogadores
            </span>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-3 p-5">
          <p className="font-display text-base font-bold text-grape-600">{game.tagline}</p>
          <p className="text-sm leading-relaxed text-ink-soft">{game.pitch}</p>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Badge tone="grape" icon={<span aria-hidden>⏱</span>}>
              {game.durationLabel}
            </Badge>
            <Badge tone="neutral">{game.tags[0]}</Badge>
            <span className="ml-auto flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wider text-ink-mute">
              caos
              <ChaosMeter level={game.chaos} />
            </span>
          </div>

          <div className="mt-auto flex items-center gap-2 pt-3">
            {onPlay ? (
              <Button block onClick={() => onPlay(game)}>
                {playLabel}
              </Button>
            ) : (
              /* o jogo da rodada é sorteado, então o CTA leva para a sala */
              <ButtonLink to="/criar" block>
                {playLabel}
              </ButtonLink>
            )}
            <Link
              to={`/jogos/${game.id}`}
              onClick={() => sound.play('click')}
              className="grid h-11 shrink-0 place-items-center rounded-2xl bg-grape-50 px-4 text-sm font-extrabold text-grape-700 ring-1 ring-grape-100 transition hover:bg-grape-100"
            >
              Regras
            </Link>
          </div>
        </div>
      </div>
    </motion.article>
  );
}
