/**
 * Generates an alphanumeric patient identification code in the format: P-<BASE36_TIMESTAMP>-<4_DIGIT_RANDOM>
 * Example: P-LZ2A1B-4819
 */
export function generatePatientCode(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `P-${timestamp}-${randomSuffix}`;
}

