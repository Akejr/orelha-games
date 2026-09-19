import { EMOTES, type Emote } from '@shared/index';

export const EMOTE_ICON: Record<Emote, string> = {
  risada: '😂',
  susto: '😱',
  fogo: '🔥',
  coroa: '👑',
  bomba: '💥',
  salve: '🫡',
};

/** Reações rápidas: o mínimo de social que faz a sala parecer viva. */
export function EmoteBar({ onEmote }: { onEmote: (emote: Emote) => void }): JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {EMOTES.map((emote) => (
        <button
          key={emote}
          type="button"
          onClick={() => onEmote(emote)}
          className="grid h-10 w-10 place-items-center rounded-2xl bg-white/80 text-xl shadow-soft ring-1 ring-grape-100 transition-transform duration-150 ease-pop hover:-translate-y-1 hover:bg-white active:translate-y-0"
          aria-label={`Reagir com ${emote}`}
          title={emote}
        >
          <span aria-hidden>{EMOTE_ICON[emote]}</span>
        </button>
      ))}
    </div>
  );
}
