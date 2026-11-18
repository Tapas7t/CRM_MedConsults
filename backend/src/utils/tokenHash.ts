import crypto from 'node:crypto';

/**
 * Computes a SHA-256 hex digest of the given opaque token.
 * Used for refresh tokens, email verification tokens, and password reset tokens.
 * Bcrypt is deliberately not used here because bcrypt truncates at 72 bytes.
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generates an opaque cryptographically secure random token (48 bytes hex string = 96 hex characters).
 */
export function generateRandomToken(bytes = 48): string {
  return crypto.randomBytes(bytes).toString('hex');
}
