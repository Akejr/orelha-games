import { Link } from 'react-router-dom';
import { GAME_CATALOG } from '@shared/index';
import { LogoMark } from './Logo';

export function Footer(): JSX.Element {
  return (
    <footer className="relative mt-20 overflow-hidden border-t border-white/60 bg-white/60 backdrop-blur-xl">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-brand-gradient bg-[length:200%_100%] animate-gradient-pan"
        aria-hidden
      />
      <div className="container-page grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-3">
            <LogoMark size={44} />
            <div>
              <p className="font-display text-xl font-extrabold text-ink">Orelha Games</p>
              <p className="text-sm font-bold text-grape-500">
                Jogos simples. Caos com amigos. Diversão imediata.
              </p>
            </div>
          </div>
          <p className="mt-5 max-w-sm text-sm leading-relaxed text-ink-soft">
            Um portal de minijogos multiplayer para partidas de 2 a 5 pessoas. Cria a sala, manda o
            código no grupo e em trinta segundos todo mundo já está rindo.
          </p>
        </div>

        <div>
          <p className="label-caps">Minijogos</p>
          <ul className="mt-4 space-y-2.5">
            {GAME_CATALOG.map((game) => (
              <li key={game.id}>
                <Link
                  to={`/jogos/${game.id}`}
                  className="text-sm font-extrabold text-ink-soft transition-colors hover:text-grape-600"
                >
                  {game.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="label-caps">Partida rápida</p>
          <ul className="mt-4 space-y-2.5 text-sm font-extrabold text-ink-soft">
            <li>
              <Link to="/criar" className="transition-colors hover:text-grape-600">
                Criar uma sala
              </Link>
            </li>
            <li>
              <Link to="/entrar" className="transition-colors hover:text-grape-600">
                Entrar com código
              </Link>
            </li>
            <li>
              <Link to="/como-funciona" className="transition-colors hover:text-grape-600">
                Como funciona
              </Link>
            </li>
            <li>
              <Link to="/perfil" className="transition-colors hover:text-grape-600">
                Meu personagem
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="container-page flex flex-col items-center justify-between gap-3 border-t border-grape-100 py-6 text-xs font-bold text-ink-mute sm:flex-row">
        <p>© {new Date().getFullYear()} Orelha Games · Feito para jogar com quem você gosta.</p>
        <p className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-mint-400" aria-hidden />
          Multiplayer em tempo real · 2 a 5 jogadores
        </p>
      </div>
    </footer>
  );
}
