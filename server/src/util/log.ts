const PREFIX = '[orelha]';

function stamp(): string {
  return new Date().toISOString().slice(11, 19);
}

export const log = {
  info(message: string, ...rest: unknown[]): void {
    console.log(`${PREFIX} ${stamp()} ${message}`, ...rest);
  },
  warn(message: string, ...rest: unknown[]): void {
    console.warn(`${PREFIX} ${stamp()} ! ${message}`, ...rest);
  },
  error(message: string, ...rest: unknown[]): void {
    console.error(`${PREFIX} ${stamp()} x ${message}`, ...rest);
  },
};
