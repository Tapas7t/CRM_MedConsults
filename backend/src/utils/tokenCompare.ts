import crypto from 'node:crypto';

/**
 * Constant-time comparison of two strings using crypto.timingSafeEqual.
 * Prevents timing attacks when comparing token hashes or digests.
 */
export function compareTokens(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  const bufA = Buffer.from(a, 'utf-8');
  const bufB = Buffer.from(b, 'utf-8');

  if (bufA.length !== bufB.length) {
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);
}
