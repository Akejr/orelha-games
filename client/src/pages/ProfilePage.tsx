import { AVATARS, GAME_CATALOG, PALETTES, getAvatar } from '@shared/index';
import { useProfile } from '@/app/ProfileContext';
import { useAudioSettings, useMusicMood } from '@/audio/useAudio';
import { Creature } from '@/components/avatar/Creature';
import { IdentityCard } from '@/components/avatar/IdentityCard';
import { PageShell, SectionTitle } from '@/components/layout/PageShell';
import { Badge } from '@/components/ui/Badge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { cn } from '@/utils/cn';

function Stat({ label, value, tone }: { label: string; value: string; tone: string }): JSX.Element {
  return (
    <div className={cn('rounded-3xl p-5 text-center', tone)}>
      <p className="font-display text-3xl font-extrabold text-ink">{value}</p>
      <p className="mt-1 text-[11px] font-extrabold uppercase tracking-widest text-ink-soft">
        {label}
      </p>
    </div>
  );
}

export function ProfilePage(): JSX.Element {
  const { profile } = useProfile();
  const { settings, toggleSound, toggleMusic } = useAudioSettings();
  useMusicMood('menu');

  const spec = getAvatar(profile.avatar);
  const winRate = profile.matches > 0 ? Math.round((profile.wins / profile.matches) * 100) : 0;

  return (
    <PageShell>
      <div className="container-page py-8 sm:py-12">
        <SectionTitle
          eyebrow="seu perfil"
          title="Seu personagem"
          description="Tudo fica salvo no seu navegador — nada de cadastro. Ajuste o nome e a criatura antes de entrar na próxima sala."
        />

        <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-5">
            <IdentityCard />

            <div className="surface p-5">
              <h2 className="font-display text-lg font-extrabold text-ink">Som</h2>
              <p className="mt-1 text-sm text-ink-mute">
                Todo o áudio é gerado na hora, sem download. Dá para deixar só os efeitos.
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <Button
                  variant={settings.sound ? 'success' : 'secondary'}
                  onClick={toggleSound}
                  block
                  aria-pressed={settings.sound}
                >
                  Efeitos {settings.sound ? 'ligados' : 'desligados'}
                </Button>
                <Button
                  variant={settings.music ? 'success' : 'secondary'}
                  onClick={toggleMusic}
                  block
                  aria-pressed={settings.music}
                >
                  Música {settings.music ? 'ligada' : 'desligada'}
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-5">
            <div className="surface p-6">
              <div className="flex items-center gap-4">
                <div
                  className="grid h-28 w-28 shrink-0 place-items-center rounded-3xl shadow-soft"
                  style={{
                    background: `linear-gradient(140deg, ${PALETTES[2].light}, ${PALETTES[2].base})`,
                  }}
                >
                  <Creature
                    avatar={profile.avatar}
                    slot={2}
                    size={104}
                    expression="cheer"
                    label={`Seu personagem: ${spec.name}`}
                  />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-display text-2xl font-extrabold text-ink">
                    {profile.name}
                  </p>
                  <p className="mt-0.5 text-sm font-extrabold text-grape-600">{spec.name}</p>
                  <p className="mt-1 text-sm text-ink-soft">{spec.vibe}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge tone="grape">{spec.tagline}</Badge>
                  </div>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-2">
                <Stat label="partidas" value={String(profile.matches)} tone="bg-grape-50" />
                <Stat label="vitórias" value={String(profile.wins)} tone="bg-lemon-100" />
                <Stat label="aproveitamento" value={`${winRate}%`} tone="bg-mint-100" />
              </div>
              <p className="mt-3 text-center text-[11px] font-bold text-ink-mute">
                Contadores locais deste navegador. Cada sala também guarda o placar da sessão.
              </p>
            </div>

            <div className="surface p-5">
              <h2 className="font-display text-lg font-extrabold text-ink">O elenco</h2>
              <p className="mt-1 text-sm text-ink-mute">
                Todos jogam igual — a diferença é o carisma.
              </p>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {AVATARS.map((avatar, index) => (
                  <li
                    key={avatar.id}
                    className="flex items-center gap-3 rounded-2xl bg-white/70 p-2.5"
                  >
                    <Creature avatar={avatar.id} slot={index} size={44} label={null} />
                    <div className="min-w-0">
                      <p className="truncate font-display text-sm font-extrabold text-ink">
                        {avatar.name}
                      </p>
                      <p className="truncate text-[11px] font-bold text-ink-mute">
                        {avatar.tagline}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="surface flex flex-col items-center gap-3 p-6 text-center">
              <p className="font-display text-lg font-extrabold text-ink">
                Pronto para o próximo caos?
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <ButtonLink to="/criar">Criar sala</ButtonLink>
                <ButtonLink to="/entrar" variant="secondary">
                  Entrar com código
                </ButtonLink>
              </div>
              <p className="mt-1 text-xs font-bold text-ink-mute">
                {GAME_CATALOG.length} minijogos esperando
              </p>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
