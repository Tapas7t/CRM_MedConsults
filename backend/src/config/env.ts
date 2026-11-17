import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config();

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z
      .string()
      .default('5000')
      .transform((val) => parseInt(val, 10))
      .pipe(z.number().min(1).max(65535)),
    MONGODB_URI: z
      .string()
      .min(1, 'MONGODB_URI is required')
      .refine(
        (val) => val !== 'PASTE_MY_URI_HERE',
        'MONGODB_URI cannot be placeholder text "PASTE_MY_URI_HERE". Please fill in your MongoDB connection string in backend/.env.'
      ),
    MONGODB_URI_TEST: z
      .string()
      .min(1, 'MONGODB_URI_TEST is required')
      .refine(
        (val) => val !== 'PASTE_MY_URI_HERE',
        'MONGODB_URI_TEST cannot be placeholder text "PASTE_MY_URI_HERE". Please fill in your test MongoDB connection string in backend/.env.'
      ),
    JWT_ACCESS_SECRET: z
      .string()
      .min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    JWT_REFRESH_SECRET: z
      .string()
      .min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
    JWT_ACCESS_EXPIRES_IN: z
      .string()
      .min(1, 'JWT_ACCESS_EXPIRES_IN is required')
      .default('15m'),
    JWT_REFRESH_EXPIRES_IN: z
      .string()
      .min(1, 'JWT_REFRESH_EXPIRES_IN is required')
      .default('7d'),
    CLIENT_URL: z.string().url('CLIENT_URL must be a valid URL'),
    CORS_ORIGINS: z
      .string()
      .min(1, 'CORS_ORIGINS is required')
      .transform((val) =>
        val
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean)
      ),
  })
  .refine(
    (data) => data.JWT_ACCESS_SECRET !== data.JWT_REFRESH_SECRET,
    {
      message: 'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different from each other',
      path: ['JWT_REFRESH_SECRET'],
    }
  );

export type Env = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  parsed.error.issues.forEach((issue) => {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  });
  process.exit(1);
}

export const env = parsed.data;
