/**
 * Run-length encoding para grids (chao do PAINT! e blocos do DON'T FALL!).
 * Os grids sao muito repetitivos, entao o RLE reduz o payload de rede em ~10x
 * mantendo o formato JSON simples de serializar.
 *
 * Formato: [valor, repeticoes, valor, repeticoes, ...]
 */
export function rleEncode(cells: ArrayLike<number>): number[] {
  const out: number[] = [];
  if (cells.length === 0) return out;
  let current = cells[0];
  let count = 1;
  for (let i = 1; i < cells.length; i += 1) {
    const value = cells[i];
    if (value === current && count < 65535) {
      count += 1;
    } else {
      out.push(current, count);
      current = value;
      count = 1;
    }
  }
  out.push(current, count);
  return out;
}

export function rleDecode(encoded: readonly number[], length: number): Uint8Array {
  const out = new Uint8Array(length);
  let cursor = 0;
  for (let i = 0; i < encoded.length; i += 2) {
    const value = encoded[i];
    const count = encoded[i + 1];
    for (let n = 0; n < count && cursor < length; n += 1) {
      out[cursor] = value;
      cursor += 1;
    }
  }
  return out;
}
