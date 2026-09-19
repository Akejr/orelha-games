/**
 * Contrato de dominio do Orelha Games.
 *
 * Tudo aqui e compartilhado entre o servidor (autoridade da simulacao) e o
 * cliente (render + predicao local). Nunca colocar codigo de DOM ou de Node
 * neste pacote.
 */

export type GameId =
  // os cinco originais
  | 'push'
  | 'crown'
  | 'bomb'
  | 'paint'
  | 'dont-fall'
  // segunda leva
  | 'coleta'
  | 'zona'
  | 'parede'
  | 'gol'
  | 'corrida'
  | 'cores'
  | 'raio'
  | 'mina'
  | 'rastro'
  | 'meteoro'
  // terceira leva
  | 'sombra'
  | 'buraco'
  | 'peso'
  | 'ladrao'
  | 'cadeiras'
  // quarta leva
  | 'onda'
  | 'semaforo'
  | 'carimbo'
  | 'trem'
  | 'gangorra'
  // quinta leva
  | 'bolha'
  | 'ima'
  | 'espelho'
  | 'dois'
  | 'caca';

export type AvatarId =
  | 'blob'
  | 'monstro'
  | 'robo'
  | 'fantasma'
  | 'gato'
  | 'estrela'
  | 'cachorro'
  | 'sapo'
  | 'capivara'
  | 'pinguim'
  | 'polvo'
  | 'jacare'
  | 'caveira'
  | 'alien'
  | 'nuvem'
  | 'banana'
  | 'pao'
  | 'abacaxi'
  | 'cogumelo'
  | 'peixe'
  | 'coelho'
  | 'dragao'
  | 'ovo'
  | 'unicornio';

export type Expression = 'idle' | 'happy' | 'scared' | 'angry' | 'cheer' | 'dizzy' | 'sad';

export type RoomStatus = 'lobby' | 'countdown' | 'playing' | 'results';

export type MatchPhase = 'countdown' | 'playing' | 'over';

/** Mundo logico fixo. O cliente escala para o canvas mantendo proporcao. */
export const WORLD = { w: 1000, h: 700 } as const;

/** Ticks por segundo da simulacao autoritativa. */
export const TICK_RATE = 60;
/** Snapshots por segundo enviados aos clientes. */
export const SNAPSHOT_RATE = 20;
/** Frequencia de envio de input do cliente. */
export const INPUT_RATE = 30;

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 5;

// ---------------------------------------------------------------------------
// Entrada de jogador
// ---------------------------------------------------------------------------

export interface InputState {
  /** eixo horizontal, -1..1 */
  mx: number;
  /** eixo vertical, -1..1 */
  my: number;
  /** contador monotonico de dashes solicitados (evita perder um input) */
  dash: number;
}

export function emptyInput(): InputState {
  return { mx: 0, my: 0, dash: 0 };
}

// ---------------------------------------------------------------------------
// Entidade base dos jogos
// ---------------------------------------------------------------------------

export interface Fighter {
  id: string;
  /** indice do slot (0..4) usado para cor/spawn */
  slot: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  facing: number;
  alive: boolean;
  /** tempo restante de dash (s) */
  dashTimer: number;
  /** cooldown restante de dash (s) */
  dashCooldown: number;
  /** ultimo contador de dash processado */
  dashSeen: number;
  /** direcao do dash atual */
  dashDirX: number;
  dashDirY: number;
  /** acumulado de pancada: aumenta o knockback recebido (0..1) */
  stagger: number;
  /** tempo de atordoamento, ignora input (s) */
  stunTimer: number;
  /** flash visual de impacto (0..1) */
  hitFlash: number;
  /** deformacao visual squash & stretch (-1..1) */
  squash: number;
  /** pontuacao crua, o significado depende do jogo */
  score: number;
  /** colocacao final (0 = ainda jogando) */
  place: number;
  /** tempo total sobrevivido (s) */
  survived: number;
  /** vidas restantes (jogos de eliminacao direta usam 1) */
  lives: number;
  /** invulnerabilidade pos-dano (s) */
  invuln: number;
  /** bot controlado pelo servidor */
  bot: boolean;
  /** estado de conexao (desconectado entra em piloto automatico) */
  connected: boolean;
  /** memoria da IA */
  ai: AiMemory;
}

export interface AiMemory {
  targetId: string | null;
  tx: number;
  ty: number;
  think: number;
  jitterX: number;
  jitterY: number;
  aggression: number;
  reaction: number;
}

export interface FighterSeed {
  id: string;
  slot: number;
  bot: boolean;
  connected: boolean;
}

// ---------------------------------------------------------------------------
// Eventos one-shot (som + particulas no cliente)
// ---------------------------------------------------------------------------

export type GameEventKind =
  | 'go'
  | 'dash'
  | 'hit'
  | 'out'
  | 'shrink'
  // eventos compartilhados pelos jogos novos
  | 'pickup'
  | 'score'
  | 'life-lost'
  | 'call'
  | 'checkpoint'
  | 'zone-move'
  | 'wall-spawn'
  | 'goal'
  | 'beam-warn'
  | 'beam-hit'
  | 'mine-safe'
  | 'mine-boom'
  | 'trail-hit'
  | 'meteor-warn'
  | 'meteor-hit'
  | 'recover'
  | 'crown-grab'
  | 'crown-steal'
  | 'crown-drop'
  | 'crown-alert'
  | 'bomb-pass'
  | 'bomb-tick'
  | 'bomb-explode'
  | 'tile-crack'
  | 'tile-fall'
  | 'paint-splash'
  | 'paint-rush'
  | 'finish';

export interface GameEvent {
  k: GameEventKind;
  /** jogador relacionado */
  id?: string;
  /** jogador secundario (ex: quem perdeu a coroa) */
  id2?: string;
  x?: number;
  y?: number;
  /** intensidade 0..1 */
  v?: number;
  /** indice generico (tile, slot...) */
  i?: number;
}

// ---------------------------------------------------------------------------
// Snapshots de rede
// ---------------------------------------------------------------------------

export interface NetFighter {
  i: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** alive */
  a: 0 | 1;
  /** dashing */
  d: 0 | 1;
  /** stun */
  s: 0 | 1;
  /** hit flash 0..1 */
  h: number;
  /** stagger 0..1 */
  g: number;
  /** score */
  c: number;
  /** place */
  p: number;
  /** facing */
  f: number;
  /** lives */
  l: number;
  /** invulnerável */
  iv: 0 | 1;
}

/**
 * Canal genérico de cenário.
 *
 * Os cinco jogos originais têm campos próprios no snapshot (`push`, `crown`…).
 * Para os jogos seguintes vale a pena um canal comum: assim adicionar um jogo
 * novo não exige tocar no protocolo de rede. Cada módulo documenta o significado
 * dos seus códigos `k`.
 */
export interface GenericItem {
  x: number;
  y: number;
  /** raio (círculos) */
  r: number;
  /** tipo/estado, definido por cada jogo */
  k: number;
  /** slot do dono (0..4) ou -1 */
  o?: number;
  /** valor auxiliar normalizado (carga, progresso, alpha) */
  v?: number;
  /** ângulo em rad */
  a?: number;
  /** largura (retângulos) */
  w?: number;
  /** altura (retângulos) */
  h?: number;
}

export interface GenericSnapshot {
  /** entidades do cenário: estrelas, bolas, zonas, paredes, meteoros… */
  items?: GenericItem[];
  /** jogadores marcados pelo jogo (caçadores, ladrões com saco cheio…) */
  ids?: string[];
  /** grid em RLE quando o jogo tem piso de células */
  grid?: number[];
  /**
   * Meta de pontuação, quando o jogo tem uma (CORRIDA!, ZONA!).
   *
   * Existe separado de `n` porque o HUD usa isso para a barra de progresso: com
   * a meta escondida em `n[0]`, jogo sem meta (LADRÃO!, SOMBRA!) ganhava uma
   * barra cheia sem sentido nenhum.
   */
  tg?: number;
  /** números auxiliares (rodada, contadores, valores por jogador) */
  n?: number[];
  /** instrução curta mostrada no HUD ("PISE NO AZUL!") */
  s?: string;
  /** jogador em destaque (dono da zona, quem tem a bola…) */
  h?: string | null;
}

export type PushModifier = 'ice' | 'spin' | 'fan' | 'holes' | 'springs' | 'walls';

export interface PushSnapshot {
  /** raio atual da arena */
  r: number;
  /** rotacao da arena (rad) */
  sp: number;
  mods: PushModifier[];
  holes: { x: number; y: number; r: number }[];
  springs: { x: number; y: number; r: number }[];
  /** ventilador: angulo, forca, ligado */
  fan: { a: number; p: number; on: 0 | 1 } | null;
  /** paredes moveis */
  walls: { x: number; y: number; w: number; h: number; a: number }[];
  alive: number;
}

export interface CrownSnapshot {
  /** portador atual */
  h: string | null;
  /** posicao da coroa */
  x: number;
  y: number;
  /** coroa no chao */
  dr: 0 | 1;
  /** meta em segundos */
  tg: number;
  /** imunidade de roubo restante (0..1) */
  im: number;
  /** multiplicador atual por segurar a coroa sem perder (1 a 1.6) */
  mu: number;
}

export interface BombSnapshot {
  /** pode haver mais de uma bomba em jogo (4+ jogadores vivos) */
  bombs: {
    h: string | null;
    /** fuse normalizado 0..1 (1 = acabou de receber) */
    fz: number;
    /** cooldown de passe */
    cd: number;
  }[];
  /** raio da arena */
  r: number;
  alive: number;
}

export interface PaintSnapshot {
  /** grid RLE com o dono de cada celula (0 = vazio, slot+1) */
  g: number[];
  /** final rush ativo */
  ru: 0 | 1;
  /** porcentagens por slot */
  pc: number[];
  /** rolos de tinta no chao */
  pu: { x: number; y: number }[];
  /** pincel grande ativo, na ordem dos jogadores do snapshot (0..1) */
  bo: number[];
}

export interface FallSnapshot {
  /** estados dos blocos em RLE: 3 solido, 2 rachado, 1 caindo, 0 vazio */
  g: number[];
  alive: number;
}

export interface Snapshot {
  seq: number;
  /** timestamp do servidor (ms) */
  t: number;
  ph: MatchPhase;
  /** countdown restante (s) */
  cd: number;
  /** tempo decorrido (s) */
  el: number;
  /** tempo restante (s) ou -1 se sem limite */
  rt: number;
  ps: NetFighter[];
  ev: GameEvent[];
  push?: PushSnapshot;
  crown?: CrownSnapshot;
  bomb?: BombSnapshot;
  paint?: PaintSnapshot;
  fall?: FallSnapshot;
  ex?: GenericSnapshot;
}

// ---------------------------------------------------------------------------
// Jogadores, salas e resultados
// ---------------------------------------------------------------------------

export interface PlayerPublic {
  id: string;
  name: string;
  avatar: AvatarId;
  slot: number;
  isHost: boolean;
  ready: boolean;
  connected: boolean;
  bot: boolean;
  /** vitorias na sessao da sala */
  wins: number;
  rounds: number;
  /** pontos acumulados no campeonato em andamento */
  points: number;
}

export interface MatchResultRow {
  playerId: string;
  place: number;
  score: number;
  scoreLabel: string;
  highlight: string | null;
  /** pontos ganhos nesta rodada do campeonato (preenchido pela sala) */
  earned?: number;
}

export interface MatchResults {
  gameId: GameId;
  rows: MatchResultRow[];
  winnerId: string | null;
  duration: number;
  round: number;
}

export interface RoomPublic {
  code: string;
  name: string;
  hostId: string;
  /** jogo da rodada atual (ou da ultima jogada) */
  gameId: GameId;
  maxPlayers: number;
  status: RoomStatus;
  players: PlayerPublic[];
  results: MatchResults | null;
  round: number;
  createdAt: number;

  // ----- campeonato -----
  /** quantas rodadas a serie tem (host configura) */
  rounds: number;
  /** rodada atual, 1..rounds */
  seriesRound: number;
  /** a serie terminou e o campeao esta definido */
  seriesDone: boolean;
  /** jogo sorteado para a proxima rodada (suspense na tela de resultado) */
  nextGameId: GameId | null;
  /** timestamp (ms) do inicio automatico da proxima rodada, 0 = sem auto */
  nextRoundAt: number;
  /** jogos ja sorteados nesta serie */
  playedGames: GameId[];
}

// ---------------------------------------------------------------------------
// Modulo de jogo
// ---------------------------------------------------------------------------

export interface MatchContext {
  seed: number;
  round: number;
  players: FighterSeed[];
}

export interface BaseMatchState {
  gameId: GameId;
  phase: MatchPhase;
  countdown: number;
  elapsed: number;
  fighters: Fighter[];
  events: GameEvent[];
  seed: number;
  round: number;
  /** contador de colocacao a distribuir (N, N-1, ...) */
  nextPlace: number;
  /** tempo desde o fim, usado para dar um beat antes de exibir resultado */
  sinceOver: number;
}

export interface GameModule<S extends BaseMatchState = BaseMatchState> {
  id: GameId;
  /** limite de tempo da partida em segundos (-1 = ate sobrar 1) */
  timeLimit: number;
  create(ctx: MatchContext): S;
  step(state: S, dt: number, inputs: Record<string, InputState>): void;
  isOver(state: S): boolean;
  results(state: S): MatchResults;
  snapshot(state: S, seq: number, now: number): Snapshot;
  /** IA usada por bots e por jogadores desconectados */
  bot(state: S, fighter: Fighter, dt: number): InputState;
}
