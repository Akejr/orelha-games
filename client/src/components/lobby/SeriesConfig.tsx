import { GAME_CATALOG } from '@shared/index';
import { cn } from '@/utils/cn';

/**
 * Tamanho do campeonato. O jogo de cada rodada é sorteado — o host só decide
 * quantas rodadas a série tem, de 1 até o total de jogos do portal.
 */
export function SeriesConfig({
  rounds,
  onChange,
  disabled,
}: {
  rounds: number;
  onChange: (rounds: number) => void;
  disabled: boolean;
}): JSX.Element {
  const total = GAME_CATALOG.length;
  const presets = [3, 5, 8, 12, total].filter(
    (value, index, list) => value <= total && list.indexOf(value) === index,
  );

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="label-caps">tamanho do campeonato</p>
        <p className="font-display text-sm font-extrabold text-grape-600">
          {rounds} {rounds === 1 ? 'rodada' : 'rodadas'}
        </p>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Número de rodadas">
        {presets.map((value) => {
          const active = value === rounds;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChange(value)}
              className={cn(
                'min-w-[3.25rem] rounded-2xl px-3 py-2 font-display text-sm font-extrabold transition-all duration-150 ease-pop',
                active
                  ? 'bg-grape-500 text-white shadow-pop-sm'
                  : 'bg-white/70 text-ink-soft ring-1 ring-grape-100 hover:bg-white',
                disabled && !active && 'cursor-not-allowed opacity-50',
              )}
            >
              {value === total ? `todos (${total})` : value}
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-xs font-bold text-ink-mute">
        {disabled
          ? 'só o host configura'
          : `${total} jogos no sorteio · cada rodada vale pontos por colocação`}
      </p>
    </div>
  );
}
