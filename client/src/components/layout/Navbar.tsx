import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAudioSettings } from '@/audio/useAudio';
import { Creature } from '@/components/avatar/Creature';
import { Button, ButtonLink, IconButton } from '@/components/ui/Button';
import { useProfile } from '@/app/ProfileContext';
import { cn } from '@/utils/cn';
import { Logo } from './Logo';

const LINKS = [
  { to: '/jogos', label: 'Jogos' },
  { to: '/como-funciona', label: 'Como funciona' },
  { to: '/perfil', label: 'Perfil' },
];

function SpeakerIcon({ on }: { on: boolean }): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 9.5h3l4.5-3.5v12L7 14.5H4z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      {on ? (
        <>
          <path d="M16 9c1.2 1 1.2 5 0 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M18.6 6.6c2.4 2.2 2.4 8.6 0 10.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </>
      ) : (
        <path d="M16 9.5l5 5m0-5l-5 5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      )}
    </svg>
  );
}

function NoteIcon({ on }: { on: boolean }): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 18V6.6l9-1.8V16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="7" cy="18" r="2.4" fill="currentColor" />
      <circle cx="16" cy="16" r="2.4" fill="currentColor" />
      {!on ? <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" /> : null}
    </svg>
  );
}

export function Navbar(): JSX.Element {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { settings, toggleSound, toggleMusic } = useAudioSettings();
  const { profile } = useProfile();
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname]);

  useEffect(() => {
    const onScroll = (): void => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'sticky top-0 z-40 transition-all duration-300 safe-top',
        scrolled ? 'bg-cream/85 shadow-soft backdrop-blur-xl' : 'bg-transparent',
      )}
    >
      <div className="container-page flex h-16 items-center justify-between gap-4 sm:h-[72px]">
        <Logo />

        <nav className="hidden items-center gap-1 md:flex" aria-label="Navegação principal">
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                cn(
                  'rounded-xl px-3.5 py-2 text-sm font-extrabold transition-colors',
                  isActive ? 'bg-grape-100 text-grape-700' : 'text-ink-soft hover:bg-white/70 hover:text-grape-600',
                )
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-1.5 sm:flex">
            <IconButton
              label={settings.sound ? 'Desligar efeitos' : 'Ligar efeitos'}
              variant="ghost"
              size="sm"
              aria-pressed={settings.sound}
              onClick={toggleSound}
              className={cn(settings.sound ? 'text-grape-600' : 'text-ink-mute')}
            >
              <SpeakerIcon on={settings.sound} />
            </IconButton>
            <IconButton
              label={settings.music ? 'Desligar música' : 'Ligar música'}
              variant="ghost"
              size="sm"
              aria-pressed={settings.music}
              onClick={toggleMusic}
              className={cn(settings.music ? 'text-grape-600' : 'text-ink-mute')}
            >
              <NoteIcon on={settings.music} />
            </IconButton>
          </div>

          <NavLink
            to="/perfil"
            className="hidden items-center gap-2 rounded-2xl bg-white/70 px-2 py-1.5 pr-3 ring-1 ring-grape-100 transition hover:ring-grape-300 sm:flex"
          >
            <Creature avatar={profile.avatar} slot={0} size={30} label={null} />
            <span className="max-w-[9rem] truncate text-sm font-extrabold text-ink">
              {profile.name}
            </span>
          </NavLink>

          <ButtonLink to="/criar" size="md" className="hidden sm:inline-flex">
            Criar sala
          </ButtonLink>

          <IconButton
            label={open ? 'Fechar menu' : 'Abrir menu'}
            variant="secondary"
            className="md:hidden"
            onClick={() => setOpen((value) => !value)}
          >
            <span aria-hidden className="text-lg leading-none">
              {open ? '×' : '☰'}
            </span>
          </IconButton>
        </div>
      </div>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden border-t border-grape-100 bg-cream/95 backdrop-blur-xl md:hidden"
          >
            <div className="container-page flex flex-col gap-2 py-4">
              {LINKS.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={({ isActive }) =>
                    cn(
                      'rounded-2xl px-4 py-3 font-display text-lg font-extrabold',
                      isActive ? 'bg-grape-100 text-grape-700' : 'text-ink-soft',
                    )
                  }
                >
                  {link.label}
                </NavLink>
              ))}
              <div className="flex items-center gap-2 pt-1">
                <Button variant="secondary" size="sm" onClick={toggleSound} block>
                  <SpeakerIcon on={settings.sound} />
                  {settings.sound ? 'Efeitos ligados' : 'Efeitos mudos'}
                </Button>
                <Button variant="secondary" size="sm" onClick={toggleMusic} block>
                  <NoteIcon on={settings.music} />
                  {settings.music ? 'Música ligada' : 'Música muda'}
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <ButtonLink to="/entrar" variant="secondary" block>
                  Entrar em sala
                </ButtonLink>
                <ButtonLink to="/criar" block>
                  Criar sala
                </ButtonLink>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
