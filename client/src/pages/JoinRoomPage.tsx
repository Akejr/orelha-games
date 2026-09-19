import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MAX_PLAYERS, getGameMeta, type AvatarId, type GameId } from '@shared/index';
import { useProfile } from '@/app/ProfileContext';
import { useMusicMood } from '@/audio/useAudio';
import { Creature } from '@/components/avatar/Creature';
import { IdentityCard } from '@/components/avatar/IdentityCard';
import { GamePreview } from '@/components/games/GamePreview';
import { PageShell, SectionTitle } from '@/components/layout/PageShell';
import { Badge } from '@/components/ui/Badge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { useRoom } from '@/multiplayer/RoomProvider';
import { apiUrl } from '@/multiplayer/socket';
import { cn } from '@/utils/cn';

interface RoomPreview {
  ok: true;
  code: string;
  name: string;
  gameId: GameId;
  status: string;
  players: number;
  maxPlayers: number;
  full: boolean;
  roster: { name: string; avatar: AvatarId; slot: number; bot: boolean }[];
}

const CODE_LENGTH = 4;

export function JoinRoomPage(): JSX.Element {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { profile } = useProfile();
  const { joinRoom, connection } = useRoom();
  useMusicMood('menu');

  const [code, setCode] = useState((params.get('codigo') ?? '').toUpperCase().slice(0, 6));
  const [preview, setPreview] = useState<RoomPreview | null>(null);
  const [checking, setChecking] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // prévia da sala: valida o código antes de conectar
  useEffect(() => {
    if (code.length < CODE_LENGTH) {
      setPreview(null);
      setNotFound(false);
      return;
    }
    let cancelled = false;
    setChecking(true);
    const timer = window.setTimeout(() => {
      fetch(apiUrl(`/api/rooms/${code}`))
        .then((response) => (response.ok ? response.json() : null))
        .then((data: RoomPreview | null) => {
          if (cancelled) return;
          setPreview(data && data.ok ? data : null);
          setNotFound(!data);
        })
        .catch(() => {
          if (!cancelled) {
            setPreview(null);
            setNotFound(true);
          }
        })
        .finally(() => !cancelled && setChecking(false));
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.clearTimeout(timer);
    };
  }, [code]);

  const handleJoin = async (): Promise<void> => {
    if (code.length < CODE_LENGTH) {
      toast.warn('Digite o código completo da sala.');
      return;
    }
    if (connection !== 'online') {
      toast.error('Sem conexão com o servidor. Tente de novo em instantes.');
      return;
    }
    setLoading(true);
    const result = await joinRoom({ code, name: profile.name, avatar: profile.avatar });
    setLoading(false);
    if (!result.ok || !result.code) {
      toast.error(result.error ?? 'Não foi possível entrar na sala.');
      return;
    }
    navigate(`/sala/${result.code}`);
  };

  const meta = preview ? getGameMeta(preview.gameId) : null;

  return (
    <PageShell>
      <div className="container-page py-8 sm:py-12">
        <SectionTitle
          eyebrow="entrar com código"
          title="Recebeu um convite?"
          description="Digite o código que apareceu no grupo. Se o link já veio com o código, é só conferir seu personagem e entrar."
        />

        <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-5">
            <div className="surface p-6">
              <label className="label-caps" htmlFor="room-code">
                código da sala
              </label>
              <input
                ref={inputRef}
                id="room-code"
                value={code}
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                onChange={(event) =>
                  setCode(
                    event.target.value
                      .toUpperCase()
                      .replace(/[^A-Z0-9]/g, '')
                      .slice(0, 6),
                  )
                }
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void handleJoin();
                }}
                placeholder="ABCD"
                className="mt-2 w-full rounded-3xl border-2 border-grape-200 bg-white px-4 py-5 text-center font-display text-4xl font-extrabold uppercase tracking-[0.4em] text-grape-700 outline-none transition focus:border-grape-400 sm:text-5xl"
                aria-describedby="code-help"
              />
              <p id="code-help" className="mt-2 text-center text-xs font-bold text-ink-mute">
                {checking
                  ? 'procurando a sala…'
                  : notFound
                    ? 'não achamos essa sala — confere as letras?'
                    : preview
                      ? 'sala encontrada!'
                      : 'de 4 a 6 caracteres'}
              </p>

              <div className="mt-4 min-h-[112px]">
                {checking && !preview ? (
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                ) : preview && meta ? (
                  <div className="rounded-3xl border-2 border-mint-300 bg-mint-100/60 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-display text-lg font-extrabold text-ink">
                          {preview.name}
                        </p>
                        <p className="text-xs font-extrabold text-[#0A5741]">
                          {meta.name} · {preview.players}/{preview.maxPlayers} jogadores
                        </p>
                      </div>
                      <Badge tone={preview.full ? 'bubble' : 'mint'}>
                        {preview.full ? 'cheia' : preview.status === 'lobby' ? 'na sala' : 'jogando'}
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      {preview.roster.map((player, index) => (
                        <span
                          key={`${player.name}-${index}`}
                          className="flex items-center gap-1 rounded-full bg-white/80 py-1 pl-1 pr-2.5"
                          title={player.name}
                        >
                          <Creature
                            avatar={player.avatar}
                            slot={player.slot}
                            size={26}
                            animated={false}
                            shadow={false}
                            label={null}
                          />
                          <span className="max-w-[90px] truncate text-[11px] font-extrabold text-ink">
                            {player.name}
                          </span>
                        </span>
                      ))}
                      {Array.from({ length: Math.max(0, MAX_PLAYERS - preview.players) }).map(
                        (_, index) => (
                          <span
                            key={`free-${index}`}
                            className="rounded-full bg-white/50 px-2.5 py-1 text-[11px] font-extrabold text-ink-mute"
                          >
                            vaga
                          </span>
                        ),
                      )}
                    </div>
                  </div>
                ) : (
                  <div
                    className={cn(
                      'grid h-[112px] place-items-center rounded-3xl border-2 border-dashed p-4 text-center text-sm font-bold',
                      notFound
                        ? 'border-bubble-200 bg-bubble-50 text-bubble-600'
                        : 'border-grape-200 bg-white/50 text-ink-mute',
                    )}
                  >
                    {notFound
                      ? 'Sala não encontrada. O código expira quando todos saem.'
                      : 'A prévia da sala aparece aqui quando o código estiver completo.'}
                  </div>
                )}
              </div>

              <Button
                size="xl"
                block
                className="mt-4"
                loading={loading}
                disabled={code.length < CODE_LENGTH || preview?.full}
                onClick={() => void handleJoin()}
              >
                {preview?.full ? 'Sala cheia' : 'Entrar na sala'}
              </Button>
            </div>

            <div className="surface p-5 text-center">
              <p className="text-sm font-bold text-ink-soft">Ninguém te chamou ainda?</p>
              <ButtonLink to="/criar" variant="secondary" className="mt-2">
                Criar minha própria sala
              </ButtonLink>
            </div>
          </div>

          <div className="space-y-5">
            <IdentityCard title="Como você vai aparecer" />
            {preview && meta ? (
              <div className="surface overflow-hidden">
                <GamePreview gameId={preview.gameId} className="aspect-[16/9]" rounded="rounded-none" />
                <div className="p-5">
                  <p className="font-display text-lg font-extrabold text-ink">
                    Estão jogando {meta.name}
                  </p>
                  <p className="mt-1 text-sm text-ink-soft">{meta.pitch}</p>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
