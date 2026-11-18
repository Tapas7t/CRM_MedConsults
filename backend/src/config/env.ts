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
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z
      .string()
      .optional()
      .transform((val) => (val ? parseInt(val, 10) : undefined)),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    EMAIL_FROM: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.JWT_ACCESS_SECRET === data.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different from each other',
        path: ['JWT_REFRESH_SECRET'],
      });
    }
    if (data.NODE_ENV === 'production') {
      if (!data.SMTP_HOST) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'SMTP_HOST is required in production',
          path: ['SMTP_HOST'],
        });
      }
      if (!data.SMTP_PORT) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'SMTP_PORT is required in production',
          path: ['SMTP_PORT'],
        });
      }
      if (!data.SMTP_USER) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'SMTP_USER is required in production',
          path: ['SMTP_USER'],
        });
      }
      if (!data.SMTP_PASS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'SMTP_PASS is required in production',
          path: ['SMTP_PASS'],
        });
      }
      if (!data.EMAIL_FROM) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'EMAIL_FROM is required in production',
          path: ['EMAIL_FROM'],
        });
      }
    }
  });

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
