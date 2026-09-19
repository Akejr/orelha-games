import { motion } from 'framer-motion';
import { Link, useParams } from 'react-router-dom';
import { GAME_CATALOG, getGameMeta, isGameId } from '@shared/index';
import { useMusicMood } from '@/audio/useAudio';
import { GamePreview } from '@/components/games/GamePreview';
import { PageShell } from '@/components/layout/PageShell';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { NotFoundPage } from './NotFoundPage';

export function GameDetailPage(): JSX.Element {
  const { gameId } = useParams<{ gameId: string }>();
  useMusicMood('menu');

  if (!isGameId(gameId)) return <NotFoundPage />;
  const game = getGameMeta(gameId);
  const others = GAME_CATALOG.filter((entry) => entry.id !== game.id);

  return (
    <PageShell>
      <div className="container-page py-8 sm:py-12">
        <Link
          to="/jogos"
          className="inline-flex items-center gap-1.5 text-sm font-extrabold text-ink-soft transition-colors hover:text-grape-600"
        >
          ← todos os jogos
        </Link>

        <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="surface overflow-hidden"
          >
            <div className="relative">
              <GamePreview gameId={game.id} className="aspect-[16/9]" rounded="rounded-none" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/55 to-transparent" />
              <div className="absolute inset-x-5 bottom-4">
                <h1 className="font-display text-4xl font-extrabold text-white drop-shadow sm:text-5xl">
                  {game.name}
                </h1>
                <p className="mt-1 font-display text-sm font-extrabold text-white/90 sm:text-base">
                  {game.tagline}
                </p>
              </div>
            </div>

            <div className="space-y-5 p-6">
              <div className="flex flex-wrap gap-2">
                <Badge tone="grape">⏱ {game.durationLabel}</Badge>
                <Badge tone="bubble">
                  {game.minPlayers}–{game.maxPlayers} jogadores
                </Badge>
                <Badge tone="mint">{game.difficulty}</Badge>
                <Badge tone="lemon">caos {game.chaos}/5</Badge>
                {game.tags.map((tag) => (
                  <Badge key={tag} tone="neutral">
                    {tag}
                  </Badge>
                ))}
              </div>

              <p className="text-base leading-relaxed text-ink-soft sm:text-lg">
                {game.description}
              </p>

              <div className="rounded-3xl bg-grape-50 p-5">
                <p className="label-caps">objetivo</p>
                <p className="mt-1 font-display text-xl font-extrabold text-ink">{game.objective}</p>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <p className="label-caps mb-2">como jogar</p>
                  <ul className="space-y-2">
                    {game.howTo.map((step, index) => (
                      <li key={step} className="flex gap-2.5 text-sm font-bold text-ink-soft">
                        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-grape-200 text-[11px] font-extrabold text-grape-800">
                          {index + 1}
                        </span>
                        {step}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="label-caps mb-2">dicas de quem já perdeu</p>
                  <ul className="space-y-2">
                    {game.tips.map((tip) => (
                      <li key={tip} className="flex gap-2.5 text-sm font-bold text-ink-soft">
                        <span aria-hidden className="text-base leading-none">
                          💡
                        </span>
                        {tip}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="rounded-3xl border-2 border-dashed border-grape-200 p-4">
                <p className="label-caps">na tela durante a partida</p>
                <p className="mt-1 text-sm font-bold text-ink-soft">{game.hudHint}</p>
              </div>
            </div>
          </motion.div>

          <div className="space-y-5">
            <div className="surface p-6 text-center">
              <p className="font-display text-xl font-extrabold text-ink">
                {game.name} entra no sorteio
              </p>
              <p className="mt-1 text-sm text-ink-soft">
                Os jogos de cada rodada são sorteados na sala — esse é um dos{' '}
                {GAME_CATALOG.length}.
              </p>
              <ButtonLink to="/criar" size="xl" block className="mt-4">
                Criar sala
              </ButtonLink>
              <ButtonLink to="/entrar" variant="ghost" size="sm" className="mt-2">
                tenho um código →
              </ButtonLink>
            </div>

            <div className="surface p-5">
              <p className="label-caps mb-3">controles</p>
              <ul className="space-y-2 text-sm font-bold text-ink-soft">
                <li className="flex items-center gap-2">
                  <kbd className="rounded-lg bg-white px-2 py-1 font-display text-xs text-ink shadow-pop-sm">
                    WASD
                  </kbd>
                  <kbd className="rounded-lg bg-white px-2 py-1 font-display text-xs text-ink shadow-pop-sm">
                    setas
                  </kbd>
                  mover
                </li>
                <li className="flex items-center gap-2">
                  <kbd className="rounded-lg bg-white px-2.5 py-1 font-display text-xs text-ink shadow-pop-sm">
                    espaço
                  </kbd>
                  dash
                </li>
                <li className="flex items-center gap-2">
                  <span className="rounded-lg bg-white px-2 py-1 font-display text-xs text-ink shadow-pop-sm">
                    toque
                  </span>
                  arraste para mover + botão de dash
                </li>
              </ul>
            </div>

            <div>
              <p className="label-caps mb-3">outros jogos</p>
              <div className="grid grid-cols-2 gap-3">
                {others.map((entry) => (
                  <Link
                    key={entry.id}
                    to={`/jogos/${entry.id}`}
                    className="group overflow-hidden rounded-3xl border-2 border-white bg-white/70 shadow-soft transition-all duration-200 ease-pop hover:-translate-y-1 hover:shadow-card"
                  >
                    <GamePreview
                      gameId={entry.id}
                      className="aspect-[16/10]"
                      rounded="rounded-none"
                      speed={0.85}
                    />
                    <p className="px-3 py-2 font-display text-sm font-extrabold text-ink">
                      {entry.name}
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
