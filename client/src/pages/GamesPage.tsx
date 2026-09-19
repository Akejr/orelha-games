import { GAME_CATALOG, MAX_PLAYERS } from '@shared/index';
import { useMusicMood } from '@/audio/useAudio';
import { GameCard } from '@/components/games/GameCard';
import { PageShell, SectionTitle } from '@/components/layout/PageShell';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';

export function GamesPage(): JSX.Element {
  useMusicMood('menu');
  const totalSeconds = GAME_CATALOG.reduce((sum, game) => sum + game.avgSeconds, 0);

  return (
    <PageShell>
      <div className="container-page py-8 sm:py-12">
        <SectionTitle
          eyebrow="catálogo"
          title="Todos os minijogos"
          description="Cinco jogos originais, mesma linguagem visual, mesmos personagens. Você aprende um e já sabe jogar os outros."
        />

        <div className="mt-5 flex flex-wrap gap-2">
          <Badge tone="grape">{GAME_CATALOG.length} jogos</Badge>
          <Badge tone="bubble">2 a {MAX_PLAYERS} jogadores</Badge>
          <Badge tone="mint">
            rodada média de {Math.round(totalSeconds / GAME_CATALOG.length)}s
          </Badge>
          <Badge tone="lemon">mesma sala, jogos diferentes</Badge>
        </div>

        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {GAME_CATALOG.map((game, index) => (
            <GameCard key={game.id} game={game} index={index} />
          ))}
        </div>

        <div className="surface mt-10 flex flex-col items-center gap-4 p-8 text-center">
          <h2 className="font-display text-2xl font-extrabold text-ink sm:text-3xl">
            Todos entram no sorteio da sala
          </h2>
          <p className="max-w-xl text-sm text-ink-soft sm:text-base">
            Você não escolhe o jogo: cada rodada do campeonato sorteia um. É o que faz todo mundo
            jogar de tudo — inclusive o que ninguém escolheria.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <ButtonLink to="/criar" size="lg">
              Criar sala
            </ButtonLink>
            <ButtonLink to="/entrar" size="lg" variant="secondary">
              Entrar com código
            </ButtonLink>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
