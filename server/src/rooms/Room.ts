import {
  AVATAR_IDS,
  COUNTDOWN_TIME,
  GAME_IDS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  SNAPSHOT_RATE,
  emptyInput,
  getGameMeta,
  getGameModule,
  randomBotName,
  randomSeed,
  sanitizeName,
  type AnyGameModule,
  type AvatarId,
  type BaseMatchState,
  type GameId,
  type InputState,
  type MatchResults,
  type MatchStartPayload,
  type PlayerPublic,
  type RoomPublic,
  type RoomStatus,
  type Snapshot,
} from '../shared';
import { makeId, makeToken } from '../util/ids';

export interface RoomPlayer {
  id: string;
  token: string;
  socketId: string | null;
  name: string;
  avatar: AvatarId;
  slot: number;
  ready: boolean;
  bot: boolean;
  connected: boolean;
  wins: number;
  rounds: number;
  /** pontos do campeonato em andamento */
  points: number;
  input: InputState;
  disconnectedAt: number | null;
  joinedAt: number;
}

export interface RoomEmitter {
  snapshot(code: string, snapshot: Snapshot): void;
  state(code: string, room: RoomPublic): void;
  matchStart(code: string, payload: MatchStartPayload): void;
  matchEnd(code: string, results: MatchResults): void;
  toast(code: string, kind: 'info' | 'success' | 'warn' | 'error', message: string): void;
}

type RoomPhase = 'lobby' | 'match' | 'results';

const SNAPSHOT_INTERVAL = 1 / SNAPSHOT_RATE;
/** Beat entre o fim da simulação e a tela de resultado (deixa o confete rolar). */
const OVER_HOLD = 1.25;
/**
 * A próxima rodada começa sozinha depois desse tempo na tela de resultado.
 * Em uma sala de cinco pessoas, ninguém quer clicar "próxima" quinze vezes — mas
 * o host pode adiantar a qualquer momento.
 */
const AUTO_NEXT_MS = 12_000;
export const DEFAULT_ROUNDS = 5;

export class Room {
  readonly code: string;
  name: string;
  hostId: string | null = null;
  gameId: GameId = 'push';
  round = 0;
  results: MatchResults | null = null;
  readonly createdAt = Date.now();
  lastActivity = Date.now();

  // ----- campeonato -----
  /**
   * O jogo de cada rodada é sorteado: ninguém escolhe. Isso resolve dois
   * problemas de sala com amigos — a discussão de qual jogo jogar e o jogador
   * que só escolhe aquele em que é bom.
   */
  rounds = DEFAULT_ROUNDS;
  seriesRound = 0;
  seriesDone = false;
  nextGameId: GameId | null = null;
  nextRoundAt = 0;
  playedGames: GameId[] = [];

  players: RoomPlayer[] = [];

  private phase: RoomPhase = 'lobby';
  private module: AnyGameModule | null = null;
  private state: BaseMatchState | null = null;
  private snapshotAcc = 0;
  private seq = 0;

  constructor(code: string, name: string, private readonly emitter: RoomEmitter) {
    this.code = code;
    this.name = name;
  }

  // -------------------------------------------------------------------------
  // Estado público
  // -------------------------------------------------------------------------

  get status(): RoomStatus {
    if (this.phase === 'results') return 'results';
    if (this.phase === 'match') {
      return this.state?.phase === 'countdown' ? 'countdown' : 'playing';
    }
    return 'lobby';
  }

  get inMatch(): boolean {
    return this.phase === 'match';
  }

  get isEmpty(): boolean {
    return this.players.every((p) => p.bot || !p.connected);
  }

  get humanCount(): number {
    return this.players.filter((p) => !p.bot).length;
  }

  publicPlayer(p: RoomPlayer): PlayerPublic {
    return {
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      slot: p.slot,
      isHost: p.id === this.hostId,
      ready: p.ready,
      connected: p.connected,
      bot: p.bot,
      wins: p.wins,
      rounds: p.rounds,
      points: p.points,
    };
  }

  publicState(): RoomPublic {
    return {
      code: this.code,
      name: this.name,
      hostId: this.hostId ?? '',
      gameId: this.gameId,
      maxPlayers: MAX_PLAYERS,
      status: this.status,
      players: this.players
        .slice()
        .sort((a, b) => a.slot - b.slot)
        .map((p) => this.publicPlayer(p)),
      results: this.results,
      round: this.round,
      createdAt: this.createdAt,
      rounds: this.rounds,
      seriesRound: this.seriesRound,
      seriesDone: this.seriesDone,
      nextGameId: this.nextGameId,
      nextRoundAt: this.nextRoundAt,
      playedGames: this.playedGames,
    };
  }

  broadcastState(): void {
    this.emitter.state(this.code, this.publicState());
  }

  // -------------------------------------------------------------------------
  // Jogadores
  // -------------------------------------------------------------------------

  private nextSlot(): number {
    const used = new Set(this.players.map((p) => p.slot));
    for (let i = 0; i < MAX_PLAYERS; i += 1) {
      if (!used.has(i)) return i;
    }
    return -1;
  }

  get isFull(): boolean {
    return this.players.length >= MAX_PLAYERS;
  }

  addPlayer(options: {
    name: string;
    avatar: AvatarId;
    socketId: string | null;
    bot?: boolean;
  }): RoomPlayer | null {
    const slot = this.nextSlot();
    if (slot < 0) return null;
    const player: RoomPlayer = {
      id: makeId(options.bot ? 'bot' : 'p'),
      token: makeToken(),
      socketId: options.socketId,
      name: options.name,
      avatar: options.avatar,
      slot,
      ready: Boolean(options.bot),
      bot: Boolean(options.bot),
      connected: true,
      wins: 0,
      rounds: 0,
      points: 0,
      input: emptyInput(),
      disconnectedAt: null,
      joinedAt: Date.now(),
    };
    this.players.push(player);
    if (!this.hostId && !player.bot) this.hostId = player.id;
    this.lastActivity = Date.now();
    return player;
  }

  addBot(): RoomPlayer | null {
    const taken = this.players.map((p) => p.name);
    return this.addPlayer({ name: randomBotName(taken), avatar: randomAvatarForRoom(this), socketId: null, bot: true });
  }

  find(playerId: string): RoomPlayer | undefined {
    return this.players.find((p) => p.id === playerId);
  }

  findBySocket(socketId: string): RoomPlayer | undefined {
    return this.players.find((p) => p.socketId === socketId);
  }

  removePlayer(playerId: string): RoomPlayer | null {
    const index = this.players.findIndex((p) => p.id === playerId);
    if (index < 0) return null;
    const [removed] = this.players.splice(index, 1);
    if (this.hostId === removed.id) this.promoteHost();
    this.lastActivity = Date.now();
    return removed;
  }

  promoteHost(): void {
    const candidate =
      this.players.find((p) => !p.bot && p.connected) ?? this.players.find((p) => !p.bot) ?? null;
    this.hostId = candidate?.id ?? null;
  }

  attachSocket(playerId: string, socketId: string): void {
    const player = this.find(playerId);
    if (!player) return;
    player.socketId = socketId;
    player.connected = true;
    player.disconnectedAt = null;
    if (!this.hostId) this.hostId = player.id;
    this.lastActivity = Date.now();
  }

  detachSocket(socketId: string): RoomPlayer | null {
    const player = this.findBySocket(socketId);
    if (!player) return null;
    player.socketId = null;
    player.connected = false;
    player.ready = false;
    player.disconnectedAt = Date.now();
    player.input = emptyInput();
    if (this.hostId === player.id) this.promoteHost();
    this.lastActivity = Date.now();
    return player;
  }

  setReady(playerId: string, ready: boolean): void {
    const player = this.find(playerId);
    if (!player) return;
    player.ready = ready;
    this.lastActivity = Date.now();
  }

  setProfile(playerId: string, patch: { name?: string; avatar?: AvatarId }): void {
    const player = this.find(playerId);
    if (!player) return;
    if (patch.name) player.name = sanitizeName(patch.name);
    if (patch.avatar) player.avatar = patch.avatar;
    this.lastActivity = Date.now();
  }

  /** Host define o tamanho do campeonato (1 até o total de jogos do portal). */
  setRounds(rounds: number): void {
    if (this.phase === 'match') return;
    const next = Math.round(rounds);
    if (!Number.isFinite(next)) return;
    this.rounds = Math.max(1, Math.min(GAME_IDS.length, next));
    this.lastActivity = Date.now();
  }

  /** Jogos que funcionam com a quantidade de gente que está na sala. */
  private eligibleGames(): GameId[] {
    const count = this.players.length;
    const fits = GAME_IDS.filter((id) => getGameMeta(id).minPlayers <= count);
    return fits.length > 0 ? fits : GAME_IDS;
  }

  /**
   * Sorteia o próximo jogo evitando repetir os que já saíram nesta série. Se a
   * série for maior que o catálogo, o sorteio recomeça sem repetir o último.
   *
   * O sorteio respeita o `minPlayers` do catálogo: DOIS!, por exemplo, precisa de
   * três pessoas para existir grupo certo e grupo errado ao mesmo tempo.
   */
  private pickGame(): GameId {
    const eligible = this.eligibleGames();
    const pool = eligible.filter((id) => !this.playedGames.includes(id));
    const available = pool.length > 0 ? pool : eligible.filter((id) => id !== this.gameId);
    const list = available.length > 0 ? available : eligible;
    return list[Math.floor(Math.random() * list.length)];
  }

  private resetSeries(): void {
    this.seriesRound = 0;
    this.seriesDone = false;
    this.playedGames = [];
    this.nextGameId = null;
    this.nextRoundAt = 0;
    this.results = null;
    for (const player of this.players) player.points = 0;
  }

  backToLobby(): void {
    if (this.phase === 'match') return;
    this.phase = 'lobby';
    this.resetSeries();
    for (const p of this.players) if (!p.bot) p.ready = false;
    this.lastActivity = Date.now();
  }

  setInput(playerId: string, input: InputState): void {
    const player = this.find(playerId);
    if (!player || player.bot) return;
    player.input = input;
  }

  // -------------------------------------------------------------------------
  // Partida
  // -------------------------------------------------------------------------

  canStart(): { ok: true } | { ok: false; error: string } {
    if (this.phase === 'match') return { ok: false, error: 'A partida já começou.' };
    if (this.players.length < MIN_PLAYERS) {
      return { ok: false, error: `Precisa de pelo menos ${MIN_PLAYERS} jogadores. Adicione um bot!` };
    }
    return { ok: true };
  }

  startMatch(): { ok: true } | { ok: false; error: string } {
    const check = this.canStart();
    if (!check.ok) return check;

    // começar do lobby (ou depois de uma série encerrada) zera o campeonato
    if (this.phase === 'lobby' || this.seriesDone) this.resetSeries();

    this.gameId = this.nextGameId ?? this.pickGame();
    this.nextGameId = null;
    this.nextRoundAt = 0;
    this.playedGames.push(this.gameId);
    this.seriesRound += 1;

    const module = getGameModule(this.gameId);
    const seed = randomSeed();
    this.round += 1;
    const roster = this.players.slice().sort((a, b) => a.slot - b.slot);

    this.module = module;
    this.state = module.create({
      seed,
      round: this.round,
      players: roster.map((p) => ({
        id: p.id,
        slot: p.slot,
        bot: p.bot,
        connected: p.connected,
      })),
    });
    this.phase = 'match';
    this.results = null;
    this.snapshotAcc = 0;
    this.seq = 0;
    for (const p of this.players) {
      p.input = emptyInput();
      if (!p.bot) p.ready = false;
    }

    this.emitter.matchStart(this.code, {
      gameId: this.gameId,
      round: this.round,
      seed,
      slots: roster.map((p) => ({ playerId: p.id, slot: p.slot })),
      startsAt: Date.now() + COUNTDOWN_TIME * 1000,
      seriesRound: this.seriesRound,
      seriesRounds: this.rounds,
    });
    this.broadcastState();
    this.lastActivity = Date.now();
    return { ok: true };
  }

  /** Chamado pelo loop global a 60 Hz. */
  tick(dt: number): void {
    if (this.phase !== 'match' || !this.module || !this.state) return;

    const module = this.module;
    const state = this.state;
    const inputs: Record<string, InputState> = {};

    for (const fighter of state.fighters) {
      const player = this.find(fighter.id);
      if (!fighter.alive) continue;
      if (!player) {
        // jogador saiu no meio: o personagem entra no piloto automático
        inputs[fighter.id] = module.bot(state, fighter, dt);
        continue;
      }
      if (player.bot || !player.connected) {
        inputs[fighter.id] = module.bot(state, fighter, dt);
      } else {
        inputs[fighter.id] = player.input;
      }
    }

    module.step(state, dt, inputs);

    this.snapshotAcc += dt;
    if (this.snapshotAcc >= SNAPSHOT_INTERVAL) {
      this.snapshotAcc = 0;
      this.seq += 1;
      const snapshot = module.snapshot(state, this.seq, Date.now());
      this.emitter.snapshot(this.code, snapshot);
      state.events.length = 0;
    }

    if (module.isOver(state) && state.sinceOver >= OVER_HOLD) {
      this.finishMatch();
    }
  }

  private finishMatch(): void {
    if (!this.module || !this.state) return;
    const results = this.module.results(this.state);

    /**
     * Pontuação do campeonato por colocação: com 4 jogadores o primeiro leva 4,
     * o último leva 1. Todo mundo pontua em toda rodada — quem está perdendo
     * continua com motivo para jogar a próxima.
     */
    const participants = results.rows.length;
    for (const row of results.rows) {
      const player = this.find(row.playerId);
      if (!player) continue;
      const earned = Math.max(0, participants - row.place + 1);
      row.earned = earned;
      player.points += earned;
      player.rounds += 1;
      if (row.place === 1) player.wins += 1;
    }

    this.results = results;
    this.module = null;
    this.state = null;
    this.phase = 'results';

    this.seriesDone = this.seriesRound >= this.rounds;
    this.nextGameId = this.seriesDone ? null : this.pickGame();
    this.nextRoundAt = this.seriesDone ? 0 : Date.now() + AUTO_NEXT_MS;
    this.lastActivity = Date.now();

    this.emitter.matchEnd(this.code, results);
    this.broadcastState();
  }

  /**
   * Chamado pelo loop global para as salas que NÃO estão em partida: cuida do
   * início automático da próxima rodada.
   */
  tickIdle(): void {
    if (this.phase !== 'results' || this.seriesDone || this.nextRoundAt === 0) return;
    if (Date.now() < this.nextRoundAt) return;
    this.nextRoundAt = 0;
    if (this.players.length >= MIN_PLAYERS) {
      const started = this.startMatch();
      if (!started.ok) this.broadcastState();
    } else {
      this.broadcastState();
    }
  }

  /** Interrompe a partida (jogadores insuficientes, sala esvaziou etc). */
  abortMatch(reason: string): void {
    if (this.phase !== 'match') return;
    this.module = null;
    this.state = null;
    this.phase = 'lobby';
    this.results = null;
    this.emitter.toast(this.code, 'warn', reason);
    this.broadcastState();
  }

  /** Sobrou gente suficiente para a partida continuar? */
  hasEnoughForMatch(): boolean {
    return this.players.length >= MIN_PLAYERS;
  }
}

function randomAvatarForRoom(room: Room): AvatarId {
  const used = new Set(room.players.map((p) => p.avatar));
  const free = AVATAR_IDS.filter((a) => !used.has(a));
  const list = free.length > 0 ? free : AVATAR_IDS;
  return list[Math.floor(Math.random() * list.length)];
}
