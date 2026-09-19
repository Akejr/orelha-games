/**
 * Teste de fumaça do multiplayer.
 *
 * Cria uma sala de verdade, enche de bots e acompanha um campeonato inteiro pela
 * rede: sorteio de jogo a cada rodada, snapshots, pontuação por colocação e
 * definição do campeão. Cobre o caminho servidor + Socket.IO + protocolo.
 *
 * Uso: npx tsx scripts/smoke.ts [rodadas]
 */
import { io, type Socket } from 'socket.io-client';
import { getGameMeta } from '../shared/src/catalog';
import type { MatchResults, RoomPublic, Snapshot } from '../shared/src/types';
import type { Ack, MatchStartPayload, SessionData } from '../shared/src/protocol';

const URL = process.env.SMOKE_URL ?? 'http://localhost:8787';
const ROUNDS = Number(process.argv[2] ?? 4);
const ROUND_TIMEOUT = 150_000;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function emitAck<T>(socket: Socket, event: string, payload: unknown): Promise<Ack<T>> {
  return new Promise((resolve) => {
    socket.emit(event, payload, (res: Ack<T>) => resolve(res));
  });
}

async function main(): Promise<void> {
  const socket: Socket = io(URL, { transports: ['websocket'] });
  await new Promise<void>((resolve, reject) => {
    socket.on('connect', () => resolve());
    socket.on('connect_error', (error) => reject(error));
  });
  console.log('conectado', socket.id);

  const created = await emitAck<SessionData>(socket, 'room:create', {
    name: 'Teste Bot',
    avatar: 'blob',
    roomName: 'Sala de teste',
    rounds: ROUNDS,
  });
  if (!created.ok) throw new Error(`falha ao criar sala: ${created.error}`);

  let room: RoomPublic = created.data.room;
  socket.on('room:state', (next: RoomPublic) => {
    room = next;
  });

  console.log(`sala ${room.code} · campeonato de ${room.rounds} rodadas`);

  socket.emit('room:addBot');
  socket.emit('room:addBot');
  socket.emit('room:addBot');
  await wait(400);
  console.log('jogadores na sala:', room.players.length);

  let failures = 0;
  let snapshots = 0;
  socket.on('match:snapshot', (_snapshot: Snapshot) => {
    snapshots += 1;
  });

  for (let round = 1; round <= ROUNDS; round += 1) {
    let startPayload: MatchStartPayload | null = null;
    const started = new Promise<void>((resolve) => {
      socket.once('match:start', (payload: MatchStartPayload) => {
        startPayload = payload;
        resolve();
      });
    });
    const finished = new Promise<MatchResults | null>((resolve) => {
      const timer = setTimeout(() => resolve(null), ROUND_TIMEOUT);
      socket.once('match:end', (results: MatchResults) => {
        clearTimeout(timer);
        resolve(results);
      });
    });

    // a primeira rodada precisa do comando; as seguintes começam sozinhas
    if (round === 1) socket.emit('match:start');
    else socket.emit('match:rematch');

    await started;
    const at = Date.now();
    const results = await finished;
    const seconds = ((Date.now() - at) / 1000).toFixed(1);

    if (!results || !startPayload) {
      failures += 1;
      console.log(`FALHOU rodada ${round}: sem resultado em ${seconds}s`);
      continue;
    }

    const payload = startPayload as MatchStartPayload;
    const meta = getGameMeta(payload.gameId);
    const places = results.rows.map((r) => r.place).sort((a, b) => a - b);
    const expected = Array.from({ length: results.rows.length }, (_, i) => i + 1);
    const placesOk = JSON.stringify(places) === JSON.stringify(expected);
    const earnedOk = results.rows.every((row) => typeof row.earned === 'number');
    const roundOk = payload.seriesRound === round && payload.seriesRounds === ROUNDS;

    console.log(
      `${placesOk && earnedOk && roundOk ? 'OK  ' : 'FALHOU'} rodada ${payload.seriesRound}/${
        payload.seriesRounds
      } · ${meta.name.padEnd(12)} ${seconds}s`,
    );
    for (const row of results.rows) {
      const player = room.players.find((p) => p.id === row.playerId);
      console.log(
        `      ${row.place}. ${(player?.name ?? row.playerId).padEnd(16)} ${row.scoreLabel.padEnd(
          22,
        )} +${row.earned ?? 0}`,
      );
    }
    if (!placesOk || !earnedOk || !roundOk) failures += 1;

    await wait(600);
  }

  // placar final
  const ranked = room.players.slice().sort((a, b) => b.points - a.points);
  console.log('\nplacar do campeonato');
  for (const [index, player] of ranked.entries()) {
    console.log(`  ${index + 1}. ${player.name.padEnd(16)} ${player.points} pts · ${player.wins} vitórias`);
  }
  const seriesEnded = room.seriesDone;
  const pointsGiven = ranked.some((player) => player.points > 0);
  if (!seriesEnded) {
    failures += 1;
    console.log('FALHOU: a série não foi marcada como encerrada');
  }
  if (!pointsGiven) {
    failures += 1;
    console.log('FALHOU: ninguém pontuou');
  }

  console.log(`\nsnapshots recebidos: ${snapshots}`);
  socket.emit('room:leave');
  await wait(200);
  socket.close();
  console.log(failures === 0 ? 'CAMPEONATO OK' : `${failures} PROBLEMA(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('smoke falhou', error);
  process.exit(1);
});
