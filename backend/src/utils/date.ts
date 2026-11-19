/**
 * Formats a given Date to 'YYYY-MM-DD' strictly in the Asia/Kolkata timezone (UTC+05:30).
 */
export function getKolkataDateString(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Returns UTC Date boundaries (start of day 00:00:00.000 and end of day 23:59:59.999)
 * for a given YYYY-MM-DD date string in the Asia/Kolkata timezone.
 */
export function getKolkataDayBoundsUtc(dateStr: string): { startUtc: Date; endUtc: Date } {
  const startUtc = new Date(`${dateStr}T00:00:00+05:30`);
  const endUtc = new Date(`${dateStr}T23:59:59.999+05:30`);
  return { startUtc, endUtc };
}
