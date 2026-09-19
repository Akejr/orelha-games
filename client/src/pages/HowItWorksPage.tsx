import { motion } from 'framer-motion';
import { GAME_CATALOG, MAX_PLAYERS, MIN_PLAYERS } from '@shared/index';
import { useMusicMood } from '@/audio/useAudio';
import { GamePreview } from '@/components/games/GamePreview';
import { PageShell, SectionTitle } from '@/components/layout/PageShell';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';

const FLOW = [
  {
    title: 'Crie a sala',
    text: 'Escolha o primeiro minijogo, ajuste seu personagem e a sala nasce com um código de 4 letras.',
    detail: 'Você é o host: escolhe o jogo e dá a largada.',
  },
  {
    title: 'Compartilhe o código',
    text: 'Mande o código ou o link no grupo. Quem clicar já entra na sala com o código preenchido.',
    detail: 'Até 5 pessoas por sala, incluindo bots.',
  },
  {
    title: 'Todos prontos, largada',
    text: 'A partida abre com contagem de 3 segundos para ninguém ser pego de surpresa.',
    detail: 'Movimento no WASD/arraste e dash no espaço/botão.',
  },
  {
    title: 'Placar e revanche',
    text: 'No fim aparece o pódio com o desempenho de cada um. Um clique e a próxima rodada começa.',
    detail: 'Dá para trocar de jogo sem desfazer a sala.',
  },
];

const FAQ = [
  {
    q: 'Preciso instalar ou criar conta?',
    a: 'Não. Roda direto no navegador, no celular ou no computador. Seu apelido e personagem ficam salvos localmente.',
  },
  {
    q: 'Quantas pessoas jogam juntas?',
    a: `De ${MIN_PLAYERS} a ${MAX_PLAYERS} por sala. Se faltar gente, o host adiciona bots para completar.`,
  },
  {
    q: 'Quanto dura uma partida?',
    a: 'Entre 30 e 90 segundos, dependendo do jogo. A ideia é caber várias rodadas em qualquer intervalo.',
  },
  {
    q: 'E se alguém cair no meio da partida?',
    a: 'O personagem entra em piloto automático para a rodada não travar, e a vaga fica reservada por alguns minutos para a pessoa voltar.',
  },
  {
    q: 'Funciona no celular?',
    a: 'Sim. O direcional aparece onde você toca e o dash é um botão grande do lado direito.',
  },
  {
    q: 'A sala expira?',
    a: 'A sala vive enquanto tiver alguém dentro. Quando todos saem, o código é liberado.',
  },
];

export function HowItWorksPage(): JSX.Element {
  useMusicMood('menu');

  return (
    <PageShell>
      <div className="container-page py-8 sm:py-12">
        <SectionTitle
          eyebrow="como funciona"
          title="Do zero à primeira risada em 30 segundos"
          description="O Orelha Games foi desenhado para não ter fricção: nenhum passo entre a vontade de jogar e o primeiro dash."
        />

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {FLOW.map((step, index) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ duration: 0.42, delay: index * 0.06 }}
              className="surface relative p-6"
            >
              <span className="absolute right-5 top-4 font-display text-5xl font-extrabold text-grape-100">
                {index + 1}
              </span>
              <p className="relative font-display text-xl font-extrabold text-ink">{step.title}</p>
              <p className="relative mt-2 text-sm leading-relaxed text-ink-soft">{step.text}</p>
              <p className="relative mt-3 text-xs font-extrabold text-grape-600">{step.detail}</p>
            </motion.div>
          ))}
        </div>

        <div className="surface mt-10 overflow-hidden">
          <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <div className="p-7">
              <Badge tone="mint">controles</Badge>
              <h2 className="mt-3 font-display text-2xl font-extrabold text-ink sm:text-3xl">
                Dois botões e você já sabe jogar tudo
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-ink-soft sm:text-base">
                Todos os minijogos usam o mesmo esquema: mover e dar dash. O dash empurra, atravessa
                buracos, pinta mais grosso e alcança quem está fugindo — o significado muda com o
                jogo, o controle não.
              </p>
              <ul className="mt-5 space-y-3 text-sm font-bold text-ink-soft">
                <li className="flex items-center gap-3">
                  <span className="flex gap-1">
                    {['W', 'A', 'S', 'D'].map((key) => (
                      <kbd
                        key={key}
                        className="grid h-8 w-8 place-items-center rounded-lg bg-white font-display text-xs text-ink shadow-pop-sm"
                      >
                        {key}
                      </kbd>
                    ))}
                  </span>
                  mover (ou setas)
                </li>
                <li className="flex items-center gap-3">
                  <kbd className="grid h-8 w-24 place-items-center rounded-lg bg-white font-display text-xs text-ink shadow-pop-sm">
                    espaço
                  </kbd>
                  dash com recarga
                </li>
                <li className="flex items-center gap-3">
                  <span className="grid h-8 w-24 place-items-center rounded-lg bg-white font-display text-xs text-ink shadow-pop-sm">
                    arrastar
                  </span>
                  direcional no celular
                </li>
              </ul>
            </div>
            <div className="relative min-h-[280px]">
              <GamePreview gameId="push" className="h-full min-h-[280px]" rounded="rounded-none" />
            </div>
          </div>
        </div>

        <div className="mt-12">
          <SectionTitle eyebrow="perguntas" title="Dúvidas rápidas" align="center" />
          <div className="mx-auto mt-6 grid max-w-3xl gap-3">
            {FAQ.map((item) => (
              <details
                key={item.q}
                className="group surface overflow-hidden p-0 [&_summary]:cursor-pointer"
              >
                <summary className="flex items-center justify-between gap-3 px-5 py-4 font-display text-base font-extrabold text-ink marker:hidden [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <span
                    aria-hidden
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-grape-100 text-grape-700 transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="px-5 pb-5 text-sm leading-relaxed text-ink-soft">{item.a}</p>
              </details>
            ))}
          </div>
        </div>

        <div className="surface mt-12 flex flex-col items-center gap-4 p-8 text-center">
          <h2 className="font-display text-2xl font-extrabold text-ink sm:text-3xl">
            {GAME_CATALOG.length} minijogos, uma sala, zero enrolação
          </h2>
          <div className="flex flex-wrap justify-center gap-3">
            <ButtonLink to="/criar" size="lg">
              Criar sala
            </ButtonLink>
            <ButtonLink to="/jogos" size="lg" variant="secondary">
              Ver os jogos
            </ButtonLink>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
