import { AVATARS, getAvatar, type AvatarId } from '@shared/index';
import { Creature } from '@/components/avatar/Creature';
import { cn } from '@/utils/cn';

/**
 * Troca de personagem dentro da sala. São 24 criaturas e a cor vem do slot, então
 * duas pessoas podem escolher a mesma sem confundir ninguém em partida.
 */
export function CharacterPicker({
  current,
  slot,
  onPick,
  className,
}: {
  current: AvatarId;
  slot: number;
  onPick: (avatar: AvatarId) => void;
  className?: string;
}): JSX.Element {
  const spec = getAvatar(current);

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-center gap-3 rounded-2xl bg-white/70 p-3 ring-1 ring-grape-100">
        <Creature avatar={current} slot={slot} size={56} expression="happy" label={null} />
        <div className="min-w-0">
          <p className="truncate font-display text-base font-extrabold text-ink">{spec.name}</p>
          <p className="truncate text-xs font-bold text-grape-600">{spec.tagline}</p>
          <p className="mt-0.5 line-clamp-2 text-[11px] font-bold leading-tight text-ink-mute">
            {spec.vibe}
          </p>
        </div>
      </div>

      <div
        className="grid max-h-[13.5rem] grid-cols-5 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-6"
        role="radiogroup"
        aria-label="Escolher personagem"
      >
        {AVATARS.map((avatar) => {
          const active = avatar.id === current;
          return (
            <button
              key={avatar.id}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={avatar.name}
              title={`${avatar.name} — ${avatar.tagline}`}
              onClick={() => onPick(avatar.id)}
              className={cn(
                'grid aspect-square place-items-center rounded-2xl border-2 transition-all duration-150 ease-pop',
                active
                  ? 'border-grape-400 bg-grape-50 shadow-pop-sm'
                  : 'border-transparent bg-white/60 hover:-translate-y-0.5 hover:bg-white',
              )}
            >
              <Creature
                avatar={avatar.id}
                slot={slot}
                size={40}
                animated={active}
                shadow={false}
                label={null}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
