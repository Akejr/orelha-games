/** Acesso tolerante a falhas ao storage (modo privado, cookies bloqueados...). */

export function readJson<T>(key: string, fallback: T, session = false): T {
  try {
    const store = session ? window.sessionStorage : window.localStorage;
    const raw = store.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...(JSON.parse(raw) as T) };
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown, session = false): void {
  try {
    const store = session ? window.sessionStorage : window.localStorage;
    store.setItem(key, JSON.stringify(value));
  } catch {
    /* silencioso de propósito */
  }
}

export function removeKey(key: string, session = false): void {
  try {
    const store = session ? window.sessionStorage : window.localStorage;
    store.removeItem(key);
  } catch {
    /* silencioso de propósito */
  }
}
