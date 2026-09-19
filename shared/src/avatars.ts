import type { AvatarId } from './types';

/**
 * Elenco do Orelha Games.
 *
 * São criaturas originais desenhadas por código (canvas no jogo, o mesmo canvas
 * na interface). A vibe é de meme — o cachorro de olhar desconfiado, o sapo de
 * cara vazia, a capivara de boa —, mas nenhuma delas é a cópia de um personagem
 * existente: silhueta, proporção, paleta e nome são nossos. Isso mantém a piada e
 * mantém o produto utilizável comercialmente.
 */

export interface AvatarSpec {
  id: AvatarId;
  name: string;
  tagline: string;
  /** personalidade curta, aparece na seleção */
  vibe: string;
}

export const AVATARS: AvatarSpec[] = [
  {
    id: 'blob',
    name: 'Blobinho',
    tagline: 'Gelatina com atitude',
    vibe: 'Quica em tudo e finge que foi de propósito.',
  },
  {
    id: 'monstro',
    name: 'Dentinho',
    tagline: 'Monstrinho de bolso',
    vibe: 'Pequeno, peludo e sempre com fome de vitória.',
  },
  {
    id: 'robo',
    name: 'Bipe',
    tagline: 'Robô recém-montado',
    vibe: 'Calcula tudo, acerta quase nada.',
  },
  {
    id: 'fantasma',
    name: 'Fumacinha',
    tagline: 'Fantasma tímido',
    vibe: 'Aparece do nada exatamente na hora errada.',
  },
  {
    id: 'gato',
    name: 'Tico',
    tagline: 'Gato estiloso',
    vibe: 'Empurra os amigos e sai andando de boa.',
  },
  {
    id: 'estrela',
    name: 'Faísca',
    tagline: 'Estrelinha elétrica',
    vibe: 'Brilha, corre e trombou em você de novo.',
  },
  {
    id: 'cachorro',
    name: 'Doguinho',
    tagline: 'Olhar de desconfiança',
    vibe: 'Sabe que você errou. Não vai comentar.',
  },
  {
    id: 'sapo',
    name: 'Sapão',
    tagline: 'Cara de nada',
    vibe: 'Expressão vazia, plano nenhum, vence do mesmo jeito.',
  },
  {
    id: 'capivara',
    name: 'Capi',
    tagline: 'A paz em pessoa',
    vibe: 'Não se estressa nem levando pancada.',
  },
  {
    id: 'pinguim',
    name: 'Pingo',
    tagline: 'Escorrega melhor que anda',
    vibe: 'No gelo ele é imbatível. Fora dele, coitado.',
  },
  {
    id: 'polvo',
    name: 'Tentáculo',
    tagline: 'Oito braços, zero coordenação',
    vibe: 'Agarra tudo, inclusive o que não devia.',
  },
  {
    id: 'jacare',
    name: 'Jacaroca',
    tagline: 'Sorriso de 60 dentes',
    vibe: 'Muito simpático. Suspeitamente simpático.',
  },
  {
    id: 'caveira',
    name: 'Caveirinha',
    tagline: 'Já perdeu tudo',
    vibe: 'Não tem mais nada a perder. Literalmente.',
  },
  {
    id: 'alien',
    name: 'Zapzap',
    tagline: 'Turista espacial',
    vibe: 'Veio de longe só para te empurrar.',
  },
  {
    id: 'nuvem',
    name: 'Nuvinha',
    tagline: 'Leve e vingativa',
    vibe: 'Flutua sorrindo enquanto planeja o troco.',
  },
  {
    id: 'banana',
    name: 'Bananinha',
    tagline: 'Escorregadia por natureza',
    vibe: 'Metade do problema é a casca.',
  },
  {
    id: 'pao',
    name: 'Pãozinho',
    tagline: 'Quentinho e teimoso',
    vibe: 'Sai do forno direto para a arena.',
  },
  {
    id: 'abacaxi',
    name: 'Abacaxito',
    tagline: 'Doce por fora, espinho por dentro',
    vibe: 'Encostar nele é escolha sua.',
  },
  {
    id: 'cogumelo',
    name: 'Cogu',
    tagline: 'Cresceu em lugar estranho',
    vibe: 'Ninguém sabe de onde ele veio. Nem ele.',
  },
  {
    id: 'peixe',
    name: 'Peixão',
    tagline: 'Fora d’água e nem liga',
    vibe: 'Respira vitória. E um pouco de ar.',
  },
  {
    id: 'coelho',
    name: 'Orelhudo',
    tagline: 'Mascote oficial da casa',
    vibe: 'Ouve o caos de longe e corre para o meio dele.',
  },
  {
    id: 'dragao',
    name: 'Draguinho',
    tagline: 'Cospe fogo do tamanho de uma vela',
    vibe: 'Acha que é enorme. Tem 30 centímetros.',
  },
  {
    id: 'ovo',
    name: 'Ovinho',
    tagline: 'Frito e confiante',
    vibe: 'Frágil, mas ninguém avisou pra ele.',
  },
  {
    id: 'unicornio',
    name: 'Unicórnia',
    tagline: 'Glitter e violência',
    vibe: 'Chifre não é enfeite, é ferramenta.',
  },
];

export const AVATAR_IDS: AvatarId[] = AVATARS.map((a) => a.id);

export function getAvatar(id: AvatarId | string | undefined): AvatarSpec {
  return AVATARS.find((a) => a.id === id) ?? AVATARS[0];
}

// ---------------------------------------------------------------------------
// Paletas por slot (até 5 jogadores por sala)
// ---------------------------------------------------------------------------

export interface Palette {
  id: string;
  name: string;
  base: string;
  light: string;
  shade: string;
  accent: string;
  trail: string;
  ink: string;
}

export const PALETTES: Palette[] = [
  {
    id: 'roxo',
    name: 'Uva',
    base: '#8F66FF',
    light: '#B79BFF',
    shade: '#5A2FD8',
    accent: '#FFD3F0',
    trail: 'rgba(143,102,255,0.42)',
    ink: '#2B1466',
  },
  {
    id: 'rosa',
    name: 'Chiclete',
    base: '#FF5CA3',
    light: '#FF9BC6',
    shade: '#D71D71',
    accent: '#FFE7B8',
    trail: 'rgba(255,92,163,0.42)',
    ink: '#7A0E42',
  },
  {
    id: 'verde',
    name: 'Menta',
    base: '#2BD9A8',
    light: '#7FF0CF',
    shade: '#12996F',
    accent: '#FFF2A8',
    trail: 'rgba(43,217,168,0.42)',
    ink: '#0A5741',
  },
  {
    id: 'amarelo',
    name: 'Limão',
    base: '#FFC93C',
    light: '#FFE38C',
    shade: '#E08A00',
    accent: '#FFD9E8',
    trail: 'rgba(255,201,60,0.45)',
    ink: '#6B3D00',
  },
  {
    id: 'azul',
    name: 'Céu',
    base: '#3FC6FF',
    light: '#93E2FF',
    shade: '#0E86C4',
    accent: '#E4FFD6',
    trail: 'rgba(63,198,255,0.42)',
    ink: '#0A4767',
  },
];

export function paletteForSlot(slot: number): Palette {
  return PALETTES[((slot % PALETTES.length) + PALETTES.length) % PALETTES.length];
}

// ---------------------------------------------------------------------------
// Nomes automáticos
// ---------------------------------------------------------------------------

const NAME_HEADS = [
  'Blob',
  'Tuti',
  'Nino',
  'Pipo',
  'Lulu',
  'Bibo',
  'Dodô',
  'Kiki',
  'Momo',
  'Zeca',
  'Fofis',
  'Tico',
  'Juju',
  'Pancho',
  'Bilu',
];

const NAME_TAILS = [
  'Caótico',
  'Turbo',
  'Fofo',
  'Bravo',
  'Voador',
  'Trapaça',
  'Rolinho',
  'Foguete',
  'Pancada',
  'Sortudo',
  'Danado',
  'Elétrico',
  'Saltitante',
];

const BOT_NAMES = [
  'Bot Pancada',
  'Bot Trombada',
  'Bot Fofinho',
  'Bot Turbinho',
  'Bot Xereta',
  'Bot Caótico',
  'Bot Rolinho',
];

export function randomPlayerName(): string {
  const head = NAME_HEADS[Math.floor(Math.random() * NAME_HEADS.length)];
  const tail = NAME_TAILS[Math.floor(Math.random() * NAME_TAILS.length)];
  return `${head} ${tail}`;
}

export function randomBotName(taken: string[] = []): string {
  const free = BOT_NAMES.filter((n) => !taken.includes(n));
  const pool = free.length > 0 ? free : BOT_NAMES;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function randomAvatar(): AvatarId {
  return AVATAR_IDS[Math.floor(Math.random() * AVATAR_IDS.length)];
}

/** Sanitiza o nome digitado pelo jogador (limite e caracteres de controle). */
export function sanitizeName(raw: string): string {
  const cleaned = raw
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 16);
  return cleaned.length >= 2 ? cleaned : randomPlayerName();
}
