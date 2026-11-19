import crypto from 'node:crypto';

/**
 * Generates a short, random, unique appointment code containing no personal data.
 * Format: APT-XXXXXXXX (8 uppercase alphanumeric characters)
 * Used as the digital OPD queue pass QR payload.
 */
export function generateAppointmentCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Disambiguated Base32
  const bytes = crypto.randomBytes(8);
  let code = 'APT-';
  for (let i = 0; i < 8; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}
