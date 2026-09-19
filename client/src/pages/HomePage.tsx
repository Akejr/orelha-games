import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AVATARS, GAME_CATALOG, MAX_PLAYERS, MIN_PLAYERS } from '@shared/index';
import { useMusicMood } from '@/audio/useAudio';
import { Creature } from '@/components/avatar/Creature';
import { GameCard } from '@/components/games/GameCard';
import { GamePreview } from '@/components/games/GamePreview';
import { PageShell, SectionTitle } from '@/components/layout/PageShell';
import { Button, ButtonLink } from '@/components/ui/Button';
import { cn } from '@/utils/cn';

/**
 * Home.
 *
 * O foco é um só: criar a sala e chamar a galera. O herói é escuro e denso de
 * propósito — a versão clara com bichinhos flutuando parecia site de jogo
 * infantil, e o produto é para grupo de amigos adulto jogando no sofá ou na call.
 * As criaturas continuam aparecendo, mas onde têm função: dentro dos previews e
 * na vitrine do elenco.
 */

const SESSION_STEPS = [
  {
    title: 'Cria a sala',
    text: 'Você escolhe de quantas rodadas é o campeonato. Sai um código de 4 letras.',
  },
  {
    title: 'Manda o código',
    text: 'Link no grupo, código na call. Entram em segundos, sem baixar nada.',
  },
  {
    title: 'O jogo é sorteado',
    text: 'Ninguém escolhe. Cada rodada cai um jogo diferente e todo mundo aprende junto.',
  },
  {
    title: 'O placar decide',
    text: 'Colocação de cada rodada vale ponto. No fim tem campeão e tem revanche.',
  },
];

/** Tela que passeia pelos jogos com um HUD falso de campeonato por cima. */
function HeroScreen(): JSX.Element {
  const [index, setIndex] = useState(0);
  const game = GAME_CATALOG[index];

  useEffect(() => {
    const timer = window.setInterval(() => {
      setIndex((value) => (value + 1) % GAME_CATALOG.length);
    }, 3600);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="relative">
      <div className="rounded-[1.75rem] border border-white/15 bg-white/10 p-2 shadow-[0_40px_80px_-40px_rgba(0,0,0,0.8)] backdrop-blur-xl">
        <div className="relative overflow-hidden rounded-[1.35rem]">
          <AnimatePresence mode="wait">
            <motion.div
              key={game.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
            >
              <GamePreview gameId={game.id} className="aspect-[16/10]" rounded="rounded-[1.35rem]" />
            </motion.div>
          </AnimatePresence>

          {/* HUD de campeonato sobreposto */}
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3">
            <span className="rounded-xl bg-black/45 px-2.5 py-1 font-display text-[11px] font-extrabold text-white backdrop-blur-md">
              rodada {(index % 5) + 1} de 5
            </span>
            <span className="rounded-xl bg-black/45 px-2.5 py-1 font-display text-[11px] font-extrabold text-white backdrop-blur-md">
              {game.name}
            </span>
          </div>

          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/70 to-transparent p-3">
            <div className="flex gap-1.5">
              {AVATARS.slice(0, 4).map((avatar, slot) => (
                <span
                  key={avatar.id}
                  className="flex items-center gap-1 rounded-xl bg-black/45 py-1 pl-1 pr-2 backdrop-blur-md"
                >
                  <Creature
                    avatar={avatar.id}
                    slot={slot}
                    size={22}
                    animated={false}
                    shadow={false}
                    label={null}
                  />
                  <span className="font-display text-[11px] font-extrabold text-white tabular-nums">
                    {[9, 7, 5, 4][slot]}
                  </span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* etiqueta de código, reforçando o fluxo */}
      <motion.div
        initial={{ opacity: 0, y: 10, rotate: -6 }}
        animate={{ opacity: 1, y: 0, rotate: -6 }}
        transition={{ delay: 0.5 }}
        className="absolute -left-3 -top-5 rounded-2xl bg-white px-3 py-2 shadow-card sm:-left-6"
      >
        <p className="text-[9px] font-extrabold uppercase tracking-[0.2em] text-ink-mute">sala</p>
        <p className="font-display text-xl font-extrabold tracking-[0.3em] text-grape-700">KP7T</p>
      </motion.div>
    </div>
  );
}

function JoinByCode({ dark = false }: { dark?: boolean }): JSX.Element {
  const [code, setCode] = useState('');
  const navigate = useNavigate();

  return (
    <form
      className="flex w-full gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        navigate(`/entrar${code ? `?codigo=${code}` : ''}`);
      }}
    >
      <input
        value={code}
        onChange={(event) =>
          setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))
        }
        placeholder="CÓDIGO"
        aria-label="Código da sala"
        className={cn(
          'h-13 min-w-0 flex-1 rounded-2xl border-2 px-4 text-center font-display text-lg font-extrabold uppercase tracking-[0.3em] outline-none transition [height:3.25rem]',
          dark
            ? 'border-white/20 bg-white/10 text-white placeholder:text-white/40 focus:border-white/50'
            : 'border-white bg-white/85 text-grape-700 shadow-soft focus:border-grape-300',
        )}
      />
      <Button type="submit" variant={dark ? 'dark' : 'secondary'} size="lg">
        Entrar
      </Button>
    </form>
  );
}

export function HomePage(): JSX.Element {
  useMusicMood('menu');
  const featured = GAME_CATALOG.slice(0, 6);

  return (
    <PageShell>
      {/* ---------------------------------------------------------------- herói */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 -z-10"
          style={{
            background:
              'radial-gradient(1200px 600px at 15% 10%, #4B23B8 0%, transparent 60%), radial-gradient(900px 500px at 85% 0%, #B81E4F 0%, transparent 55%), linear-gradient(160deg, #1B1035 0%, #2B1466 55%, #160A2B 100%)',
          }}
        />
        <div className="absolute inset-0 -z-10 opacity-[0.18] [background-image:radial-gradient(rgba(255,255,255,0.7)_1px,transparent_1px)] [background-size:26px_26px]" />

        <div className="container-page grid items-center gap-12 py-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:py-20">
          <div>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 backdrop-blur-md"
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-mint-400" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-mint-400" />
              </span>
              <span className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-white/80">
                campeonato de minijogos · {MIN_PLAYERS} a {MAX_PLAYERS} pessoas
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.05 }}
              className="mt-6 font-display text-[2.7rem] font-extrabold leading-[0.98] text-white text-balance sm:text-6xl lg:text-[4.1rem]"
            >
              Uma sala.
              <br />
              Seus amigos.
              <br />
              <span
                className="bg-clip-text text-transparent"
                style={{ backgroundImage: 'linear-gradient(100deg,#FFC93C,#FF5CA3 55%,#3FC6FF)' }}
              >
                {GAME_CATALOG.length} jogos sorteados.
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.12 }}
              className="mt-5 max-w-xl text-lg leading-relaxed text-white/75"
            >
              Cria a sala, manda o código no grupo e o campeonato começa. Cada rodada sorteia um
              jogo diferente, a colocação vira ponto, e no fim tem um campeão — e pedido de
              revanche.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.18 }}
              className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center"
            >
              <ButtonLink to="/criar" size="xl" className="sm:w-auto">
                Criar sala e convidar
              </ButtonLink>
              <div className="w-full sm:max-w-[260px]">
                <JoinByCode dark />
              </div>
            </motion.div>

            <motion.ul
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.28 }}
              className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm font-bold text-white/60"
            >
              {['sem cadastro', 'sem download', 'roda no celular', 'bots se faltar gente'].map(
                (item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-mint-400" aria-hidden />
                    {item}
                  </li>
                ),
              )}
            </motion.ul>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          >
            <HeroScreen />
          </motion.div>
        </div>
      </section>

      {/* -------------------------------------------------- como a sessão rola */}
      <section className="container-page py-14">
        <SectionTitle
          eyebrow="a sessão"
          title="Feito para grupo, não para jogador solo"
          description="O portal inteiro gira em volta da sala: entrar é instantâneo, o jogo é sorteado para ninguém discutir escolha, e o placar mantém todo mundo na próxima rodada."
        />
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {SESSION_STEPS.map((step, index) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.4, delay: index * 0.06 }}
              className="surface p-5"
            >
              <p className="font-display text-4xl font-extrabold text-grape-200">
                {String(index + 1).padStart(2, '0')}
              </p>
              <p className="mt-1 font-display text-lg font-extrabold text-ink">{step.title}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{step.text}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ----------------------------------------------------------- os jogos */}
      <section className="container-page py-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionTitle
            eyebrow={`${GAME_CATALOG.length} minijogos`}
            title="Todos entram no sorteio"
            description="Os previews rodam de verdade: é o mesmo código que desenha a partida. Passe o olho e você já sabe jogar."
          />
          <ButtonLink to="/jogos" variant="secondary">
            Ver os {GAME_CATALOG.length} jogos
          </ButtonLink>
        </div>

        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((game, index) => (
            <GameCard key={game.id} game={game} index={index} />
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------ o elenco */}
      <section className="container-page py-14">
        <div className="surface overflow-hidden">
          <div className="grid gap-8 p-6 sm:p-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-center">
            <div>
              <p className="label-caps">o elenco</p>
              <h2 className="mt-2 font-display text-3xl font-extrabold text-ink sm:text-4xl">
                {AVATARS.length} criaturas para brigar por
              </h2>
              <p className="mt-3 text-base leading-relaxed text-ink-soft">
                Escolha a sua dentro da sala e troque quando quiser. A cor vem do seu lugar na
                mesa, então ninguém se confunde no meio do caos — nem quando duas pessoas
                escolhem o mesmo bicho.
              </p>
              <div className="mt-5">
                <ButtonLink to="/criar" size="lg">
                  Criar sala
                </ButtonLink>
              </div>
            </div>
            <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8">
              {AVATARS.map((avatar, index) => (
                <div
                  key={avatar.id}
                  className="grid aspect-square place-items-center rounded-2xl bg-white/70 transition-transform duration-200 ease-pop hover:-translate-y-1"
                  title={`${avatar.name} — ${avatar.tagline}`}
                >
                  <Creature
                    avatar={avatar.id}
                    slot={index % 5}
                    size={40}
                    animated={index % 4 === 0}
                    shadow={false}
                    label={null}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- cta final */}
      <section className="container-page pb-16">
        <div
          className="relative overflow-hidden rounded-4xl p-8 text-center sm:p-14"
          style={{
            background:
              'radial-gradient(800px 400px at 20% 0%, #5A2FD8 0%, transparent 60%), linear-gradient(140deg,#1B1035,#3A1670 60%,#160A2B)',
          }}
        >
          <div className="absolute inset-0 opacity-[0.15] [background-image:radial-gradient(rgba(255,255,255,0.8)_1px,transparent_1px)] [background-size:24px_24px]" />
          <h2 className="relative font-display text-3xl font-extrabold text-white sm:text-5xl">
            Chama a galera e começa
          </h2>
          <p className="relative mx-auto mt-3 max-w-xl text-base font-bold text-white/70 sm:text-lg">
            Jogos simples. Caos com amigos. Diversão imediata.
          </p>
          <div className="relative mx-auto mt-8 flex max-w-xl flex-col items-center gap-3 sm:flex-row">
            <ButtonLink to="/criar" size="xl" className="w-full sm:w-auto">
              Criar sala
            </ButtonLink>
            <div className="w-full">
              <JoinByCode dark />
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
