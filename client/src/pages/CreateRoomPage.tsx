import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GAME_CATALOG, MAX_PLAYERS } from '@shared/index';
import { useProfile } from '@/app/ProfileContext';
import { useMusicMood } from '@/audio/useAudio';
import { IdentityCard } from '@/components/avatar/IdentityCard';
import { GamePreview } from '@/components/games/GamePreview';
import { SeriesConfig } from '@/components/lobby/SeriesConfig';
import { PageShell, SectionTitle } from '@/components/layout/PageShell';
import { Badge } from '@/components/ui/Badge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useRoom } from '@/multiplayer/RoomProvider';

const DEFAULT_ROUNDS = 5;

export function CreateRoomPage(): JSX.Element {
  const navigate = useNavigate();
  const toast = useToast();
  const { profile } = useProfile();
  const { createRoom, connection } = useRoom();
  useMusicMood('menu');

  const [rounds, setRounds] = useState(DEFAULT_ROUNDS);
  const [roomName, setRoomName] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const first = profile.name.split(' ')[0];
    setRoomName(`Sala do ${first}`);
  }, [profile.name]);

  const handleCreate = async (): Promise<void> => {
    if (connection !== 'online') {
      toast.error('Sem conexão com o servidor. Tente de novo em instantes.');
      return;
    }
    setLoading(true);
    const result = await createRoom({
      name: profile.name,
      avatar: profile.avatar,
      roomName,
      rounds,
    });
    setLoading(false);
    if (!result.ok || !result.code) {
      toast.error(result.error ?? 'Não foi possível criar a sala.');
      return;
    }
    navigate(`/sala/${result.code}`);
  };

  // três previews só para dar gosto do que vem por sorteio
  const teasers = GAME_CATALOG.slice(0, 3);

  return (
    <PageShell>
      <div className="container-page py-8 sm:py-12">
        <SectionTitle
          eyebrow="passo 1 de 1"
          title="Criar uma sala"
          description="Defina o tamanho do campeonato, pegue o código e chame a galera. Os jogos de cada rodada são sorteados na hora."
        />

        <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
          <div className="space-y-5">
            <div className="surface p-5">
              <h2 className="font-display text-lg font-extrabold text-ink">Campeonato</h2>
              <p className="mt-1 text-sm font-bold text-ink-mute">
                {GAME_CATALOG.length} jogos no sorteio · 2 a {MAX_PLAYERS} jogadores
              </p>
              <div className="mt-4">
                <SeriesConfig rounds={rounds} onChange={setRounds} disabled={false} />
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {teasers.map((game) => (
                  <div key={game.id} className="overflow-hidden rounded-2xl">
                    <GamePreview gameId={game.id} className="aspect-[16/11]" rounded="rounded-2xl" />
                  </div>
                ))}
              </div>
              <p className="mt-2 text-center text-[11px] font-bold text-ink-mute">
                dá para mudar o tamanho depois, dentro da sala
              </p>
            </div>

            <div className="surface p-5">
              <label className="label-caps" htmlFor="room-name">
                nome da sala
              </label>
              <input
                id="room-name"
                value={roomName}
                onChange={(event) => setRoomName(event.target.value)}
                maxLength={24}
                className="mt-1 w-full rounded-2xl border-2 border-grape-100 bg-white px-4 py-3 font-display text-lg font-extrabold text-ink outline-none transition focus:border-grape-400"
              />
              <p className="mt-2 text-xs font-bold text-ink-mute">
                Só para a galera reconhecer. O que importa é o código.
              </p>
            </div>

            <IdentityCard />
          </div>

          <div className="space-y-5">
            <div className="surface p-6">
              <h2 className="font-display text-xl font-extrabold text-ink">Como a sessão funciona</h2>
              <ol className="mt-4 space-y-3">
                {[
                  'Você cria a sala e recebe um código de 4 letras.',
                  'A galera entra pelo código ou pelo link.',
                  'Cada rodada sorteia um jogo diferente — ninguém escolhe.',
                  'A colocação de cada rodada vira ponto no placar.',
                  'No fim das rodadas, quem tem mais pontos é campeão.',
                ].map((step, index) => (
                  <li key={step} className="flex gap-3 text-sm font-bold text-ink-soft">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-grape-200 text-[11px] font-extrabold text-grape-800">
                      {index + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
              <div className="mt-5 flex flex-wrap gap-2">
                <Badge tone="grape">sem cadastro</Badge>
                <Badge tone="mint">bots completam a sala</Badge>
                <Badge tone="bubble">roda no celular</Badge>
              </div>
            </div>

            <div className="surface p-5">
              <Button size="xl" block loading={loading} onClick={() => void handleCreate()}>
                Criar sala e pegar o código
              </Button>
              <p className="mt-3 text-center text-xs font-bold text-ink-mute">
                Precisa de 2 jogadores para começar. Sozinho? Adicione bots na sala.
              </p>
              <div className="mt-4 border-t border-grape-100 pt-4 text-center">
                <p className="text-sm font-bold text-ink-soft">Já tem um código?</p>
                <ButtonLink to="/entrar" variant="ghost" size="sm" className="mt-1">
                  Entrar em uma sala →
                </ButtonLink>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
