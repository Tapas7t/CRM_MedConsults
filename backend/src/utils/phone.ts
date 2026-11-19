/**
 * Loosely validates and normalises Indian and standard international phone numbers.
 * Converts formats like '98201 12233', '09820112233', '919820112233' to standard '+919820112233'.
 */
export function normalizePhone(rawPhone: string): string {
  if (!rawPhone) return rawPhone;
  const cleaned = rawPhone.replace(/[\s\-\(\)]/g, '').trim();

  // Already standard +91XXXXXXXXXX
  if (/^\+91\d{10}$/.test(cleaned)) {
    return cleaned;
  }

  // 91XXXXXXXXXX without +
  if (/^91\d{10}$/.test(cleaned)) {
    return `+${cleaned}`;
  }

  // Leading 0 (e.g. 09820112233)
  if (/^0\d{10}$/.test(cleaned)) {
    return `+91${cleaned.substring(1)}`;
  }

  // Plain 10 digit Indian mobile number (e.g. 9820112233)
  if (/^\d{10}$/.test(cleaned)) {
    return `+91${cleaned}`;
  }

  // Fallback: Ensure leading +
  return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
}
