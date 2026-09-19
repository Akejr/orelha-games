import { AVATARS, PALETTES, getAvatar } from '@shared/index';
import { useProfile } from '@/app/ProfileContext';
import { sound } from '@/audio/SoundManager';
import { Creature } from '@/components/avatar/Creature';
import { cn } from '@/utils/cn';

/**
 * Editor de identidade reutilizado em criar sala, entrar em sala e perfil.
 * A escolha da cor final é do slot na sala (evita dois jogadores iguais), então
 * aqui a cor é só uma prévia.
 */
export function IdentityCard({
  title = 'Seu personagem',
  className,
}: {
  title?: string;
  className?: string;
}): JSX.Element {
  const { profile, setName, setAvatar, randomize } = useProfile();
  const spec = getAvatar(profile.avatar);

  return (
    <div className={cn('surface p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-lg font-extrabold text-ink">{title}</h2>
        <button
          type="button"
          onClick={() => {
            randomize();
            sound.play('select');
          }}
          className="rounded-full bg-grape-100 px-3 py-1.5 text-xs font-extrabold text-grape-700 transition hover:bg-grape-200"
        >
          sortear
        </button>
      </div>

      <div className="mt-4 flex items-center gap-4">
        <div
          className="grid h-24 w-24 shrink-0 place-items-center rounded-3xl shadow-soft"
          style={{
            background: `linear-gradient(140deg, ${PALETTES[0].light}, ${PALETTES[0].base})`,
          }}
        >
          <Creature avatar={profile.avatar} slot={0} size={88} expression="happy" label={null} />
        </div>
        <div className="min-w-0 flex-1">
          <label className="label-caps" htmlFor="player-name">
            como te chamam
          </label>
          <input
            id="player-name"
            value={profile.name}
            onChange={(event) => setName(event.target.value)}
            maxLength={16}
            placeholder="Seu apelido"
            className="mt-1 w-full rounded-2xl border-2 border-grape-100 bg-white px-4 py-3 font-display text-lg font-extrabold text-ink outline-none transition focus:border-grape-400"
          />
          <p className="mt-1.5 text-xs font-bold text-ink-mute">
            {spec.name} · {spec.vibe}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <p className="label-caps mb-2">escolha a criatura</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {AVATARS.map((avatar, index) => {
            const active = avatar.id === profile.avatar;
            return (
              <button
                key={avatar.id}
                type="button"
                onClick={() => {
                  setAvatar(avatar.id);
                  sound.play('select');
                }}
                aria-pressed={active}
                title={`${avatar.name} — ${avatar.tagline}`}
                className={cn(
                  'grid place-items-center rounded-2xl border-2 p-1.5 transition-all duration-150 ease-pop',
                  active
                    ? 'border-grape-400 bg-grape-50 shadow-pop-sm'
                    : 'border-transparent bg-white/70 hover:-translate-y-1 hover:bg-white',
                )}
              >
                <Creature
                  avatar={avatar.id}
                  slot={index % PALETTES.length}
                  size={46}
                  animated={active}
                  label={null}
                />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
