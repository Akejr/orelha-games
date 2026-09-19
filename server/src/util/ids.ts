import { randomBytes } from 'node:crypto';

/** Alfabeto sem caracteres ambíguos (0/O, 1/I) — o código é ditado em voz alta. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function makeRoomCode(length = 4): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

export function makeId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString('hex')}`;
}

export function makeToken(): string {
  return randomBytes(18).toString('hex');
}

export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length < 3 || code.length > 6) return null;
  return code;
}
