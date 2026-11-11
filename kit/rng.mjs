// Deterministic hashing and seeded random numbers. No global state.

/** FNV-1a over the keys joined with '|' (numbers stringified). Returns a uint32. */
export function hash32(...keys) {
  const s = keys.map(String).join('|');
  const bytes = Buffer.from(s, 'utf8');
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32: returns a function giving floats in [0, 1). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rngFor = (...keys) => rng(hash32(...keys));

/** One stateless float in [0, 1) from the hash of the keys. */
export const rand01 = (...keys) => hash32(...keys) / 4294967296;
