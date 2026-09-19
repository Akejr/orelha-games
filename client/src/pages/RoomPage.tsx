import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { GAME_CATALOG, MAX_PLAYERS, MIN_PLAYERS } from '@shared/index';
import { useProfile } from '@/app/ProfileContext';
import { sound } from '@/audio/SoundManager';
import { useMusicMood } from '@/audio/useAudio';
import { MatchStage } from '@/components/game/MatchStage';
import { ResultModal } from '@/components/game/ResultModal';
import { GamePreview } from '@/components/games/GamePreview';
import { CharacterPicker } from '@/components/lobby/CharacterPicker';
import { EMOTE_ICON, EmoteBar } from '@/components/lobby/EmoteBar';
import { InviteModal } from '@/components/lobby/InviteModal';
import { EmptySlot, PlayerSlot } from '@/components/lobby/PlayerSlot';
import { SeriesConfig } from '@/components/lobby/SeriesConfig';
import { SeriesStandings } from '@/components/lobby/SeriesStandings';
import { LogoMark } from '@/components/layout/Logo';
import { Badge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { useRoom } from '@/multiplayer/RoomProvider';

/** Vitrine do sorteio: passeia pelos jogos do portal para dar ideia do que vem. */
function GameRoulette(): JSX.Element {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * GAME_CATALOG.length));
  const game = GAME_CATALOG[index];

  useEffect(() => {
    const timer = window.setInterval(() => {
      setIndex((value) => (value + 1) % GAME_CATALOG.length);
    }, 2600);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="relative overflow-hidden rounded-3xl">
      <AnimatePresence mode="wait">
        <motion.div
          key={game.id}
          initial={{ opacity: 0, scale: 1.03 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
        >
          <GamePreview gameId={game.id} className="aspect-[16/9]" rounded="rounded-3xl" />
        </motion.div>
      </AnimatePresence>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/55 to-transparent" />
      <div className="pointer-events-none absolute inset-x-4 bottom-3 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-white/70">
            no sorteio
          </p>
          <p className="truncate font-display text-xl font-extrabold text-white drop-shadow sm:text-2xl">
            {game.name}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-extrabold text-ink">
          {GAME_CATALOG.length} jogos
        </span>
      </div>
    </div>
  );
}

export function RoomPage(): JSX.Element {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { profile, setAvatar } = useProfile();
  const {
    room,
    self,
    selfId,
    isHost,
    connection,
    results,
    emotes,
    setReady,
    setRounds,
    updateProfile,
    addBot,
    removePlayer,
    startMatch,
    rematch,
    backToLobby,
    leaveRoom,
    sendEmote,
  } = useRoom();

  const [inviteOpen, setInviteOpen] = useState(false);
  const inMatch = room?.status === 'countdown' || room?.status === 'playing';
  useMusicMood(inMatch ? 'match' : 'lobby');

  // sem sala no contexto: manda para a tela de entrar com o código já preenchido
  useEffect(() => {
    if (room || connection !== 'online') return;
    const timer = window.setTimeout(() => {
      navigate(`/entrar${code ? `?codigo=${code}` : ''}`, { replace: true });
    }, 900);
    return () => window.clearTimeout(timer);
  }, [code, connection, navigate, room]);

  // abre o convite automaticamente quando a sala está só com o host
  useEffect(() => {
    if (!room || room.status !== 'lobby') return;
    if (room.players.length === 1 && room.round === 0) {
      const timer = window.setTimeout(() => setInviteOpen(true), 700);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [room?.players.length, room?.round, room?.status, room]);

  const latestEmotes = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of emotes) map.set(item.playerId, EMOTE_ICON[item.emote]);
    return map;
  }, [emotes]);

  const handleExit = (): void => {
    leaveRoom();
    navigate('/');
  };

  const handleAvatar = (avatar: typeof profile.avatar): void => {
    setAvatar(avatar);
    updateProfile({ avatar });
  };

  if (!room) {
    return (
      <div className="grid min-h-screen-dvh place-items-center px-6 text-center">
        <div className="max-w-sm">
          <div className="mx-auto animate-bounce-soft">
            <LogoMark size={64} />
          </div>
          <h1 className="mt-4 font-display text-2xl font-extrabold text-ink">
            {connection === 'online' ? 'Procurando a sala…' : 'Conectando ao servidor…'}
          </h1>
          <p className="mt-2 text-sm font-bold text-ink-soft">
            {code ? `Código ${code.toUpperCase()}` : 'Sem código na URL'}
          </p>
        </div>
      </div>
    );
  }

  const missing = Math.max(0, MIN_PLAYERS - room.players.length);
  const emptySlots = Math.max(0, MAX_PLAYERS - room.players.length);
  const seriesRunning = room.seriesRound > 0 && !room.seriesDone;

  const resultModal =
    results && (room.status === 'results' || room.seriesDone) ? (
      <ResultModal
        open
        results={results}
        players={room.players}
        selfId={selfId}
        isHost={isHost}
        rounds={room.rounds}
        seriesRound={room.seriesRound}
        seriesDone={room.seriesDone}
        nextGameId={room.nextGameId}
        nextRoundAt={room.nextRoundAt}
        onNext={rematch}
        onLobby={backToLobby}
        onExit={handleExit}
      />
    ) : null;

  // ---------------------------------------------------------------- partida
  if (inMatch || (room.status === 'results' && results)) {
    return (
      <div className="h-screen-dvh w-full overflow-hidden bg-ink">
        <MatchStage gameId={room.gameId} onLeave={handleExit} />
        {resultModal}
      </div>
    );
  }

  // ------------------------------------------------------------------ lobby
  return (
    <div className="min-h-screen-dvh pb-28 sm:pb-10">
      {connection !== 'online' ? (
        <div className="sticky top-0 z-40 bg-lemon-400 px-4 py-2 text-center text-sm font-extrabold text-[#6B3D00]">
          {connection === 'reconnecting' ? 'Reconectando…' : 'Sem conexão com o servidor'}
        </div>
      ) : null}

      <header className="container-page flex flex-wrap items-center gap-3 py-5 safe-top">
        <button
          type="button"
          onClick={handleExit}
          className="flex items-center gap-2 rounded-2xl bg-white/70 px-3 py-2 font-display text-sm font-extrabold text-ink-soft ring-1 ring-grape-100 transition hover:bg-white"
        >
          ← sair
        </button>

        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-xl font-extrabold text-ink sm:text-2xl">
            {room.name}
          </h1>
          <p className="text-xs font-bold text-ink-mute">
            {room.players.length}/{MAX_PLAYERS} jogadores
            {seriesRunning ? ` · rodada ${room.seriesRound} de ${room.rounds}` : ''}
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setInviteOpen(true);
            sound.play('click');
          }}
          className="group flex items-center gap-2 rounded-2xl bg-white px-3 py-2 shadow-pop-sm ring-2 ring-grape-100 transition hover:-translate-y-[2px]"
          title="Ver convite"
        >
          <span className="label-caps">sala</span>
          <span className="font-display text-lg font-extrabold tracking-[0.28em] text-grape-700">
            {room.code}
          </span>
        </button>

        <Button onClick={() => setInviteOpen(true)} className="hidden sm:inline-flex">
          Convidar amigos
        </Button>
      </header>

      <div className="container-page grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        {/* coluna esquerda: quem está na sala */}
        <section className="space-y-5">
          <div className="surface p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-extrabold text-ink">Na sala</h2>
              <Badge tone={room.players.length >= MIN_PLAYERS ? 'mint' : 'lemon'}>
                {room.players.length >= MIN_PLAYERS
                  ? 'pode começar'
                  : `faltam ${missing} para começar`}
              </Badge>
            </div>

            <ul className="space-y-2.5">
              <AnimatePresence initial={false}>
                {room.players.map((player) => (
                  <PlayerSlot
                    key={player.id}
                    player={player}
                    isSelf={player.id === selfId}
                    canRemove={isHost && player.id !== selfId}
                    onRemove={() => removePlayer(player.id)}
                    emote={latestEmotes.get(player.id) ?? null}
                  />
                ))}
              </AnimatePresence>
              {Array.from({ length: emptySlots }).map((_, index) => (
                <EmptySlot
                  key={`empty-${index}`}
                  index={room.players.length + index}
                  canAct={isHost}
                  onAddBot={addBot}
                  onInvite={() => setInviteOpen(true)}
                />
              ))}
            </ul>

            <div className="mt-5 border-t border-grape-100 pt-4">
              <p className="label-caps mb-2">reações</p>
              <EmoteBar onEmote={sendEmote} />
            </div>
          </div>

          {seriesRunning ? (
            <div className="surface p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display text-lg font-extrabold text-ink">Campeonato</h2>
                <Badge tone="grape">
                  rodada {room.seriesRound} de {room.rounds}
                </Badge>
              </div>
              <SeriesStandings players={room.players} selfId={selfId} />
            </div>
          ) : null}
        </section>

        {/* coluna direita: personagem e campeonato */}
        <section className="space-y-5">
          <div className="surface p-5">
            <h2 className="font-display text-lg font-extrabold text-ink">Seu personagem</h2>
            <p className="mt-0.5 text-sm font-bold text-ink-mute">
              Troque quando quiser, até a partida começar.
            </p>
            <CharacterPicker
              className="mt-4"
              current={self?.avatar ?? profile.avatar}
              slot={self?.slot ?? 0}
              onPick={handleAvatar}
            />
          </div>

          <div className="surface overflow-hidden">
            <GameRoulette />
            <div className="space-y-4 p-5">
              <div>
                <h2 className="font-display text-lg font-extrabold text-ink">
                  Os jogos são sorteados
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                  Ninguém escolhe. A cada rodada cai um jogo diferente dos{' '}
                  {GAME_CATALOG.length} do portal, e a colocação de cada um vira ponto no
                  campeonato. No fim, quem tiver mais pontos leva.
                </p>
              </div>
              <SeriesConfig rounds={room.rounds} onChange={setRounds} disabled={!isHost} />
            </div>
          </div>

          {/* ações desktop */}
          <div className="hidden gap-3 sm:flex">
            {isHost ? (
              <Button
                size="xl"
                block
                onClick={startMatch}
                disabled={room.players.length < MIN_PLAYERS}
              >
                {room.players.length < MIN_PLAYERS
                  ? `Faltam ${missing} jogadores`
                  : seriesRunning
                    ? 'Continuar campeonato'
                    : `Começar campeonato · ${room.rounds} ${room.rounds === 1 ? 'rodada' : 'rodadas'}`}
              </Button>
            ) : (
              <Button
                size="xl"
                block
                variant={self?.ready ? 'success' : 'primary'}
                onClick={() => setReady(!self?.ready)}
              >
                {self?.ready ? 'Pronto! ✓' : 'Estou pronto'}
              </Button>
            )}
            {isHost && room.players.length < MAX_PLAYERS ? (
              <Button size="xl" variant="secondary" onClick={addBot}>
                + bot
              </Button>
            ) : null}
          </div>
        </section>
      </div>

      {/* barra fixa mobile */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/60 bg-cream/95 p-3 backdrop-blur-xl safe-bottom sm:hidden">
        <div className="flex gap-2">
          {isHost ? (
            <>
              <Button
                size="lg"
                block
                onClick={startMatch}
                disabled={room.players.length < MIN_PLAYERS}
              >
                {room.players.length < MIN_PLAYERS ? `Faltam ${missing}` : 'Começar'}
              </Button>
              {room.players.length < MAX_PLAYERS ? (
                <IconButton label="Adicionar bot" size="lg" variant="secondary" onClick={addBot}>
                  +
                </IconButton>
              ) : null}
            </>
          ) : (
            <Button
              size="lg"
              block
              variant={self?.ready ? 'success' : 'primary'}
              onClick={() => setReady(!self?.ready)}
            >
              {self?.ready ? 'Pronto! ✓' : 'Estou pronto'}
            </Button>
          )}
          <Button size="lg" variant="secondary" onClick={() => setInviteOpen(true)}>
            Convidar
          </Button>
        </div>
      </div>

      <InviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        code={room.code}
        roomName={room.name}
      />

      {resultModal}
    </div>
  );
}
