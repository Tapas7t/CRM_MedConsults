import { z } from 'zod';
import { USER_ROLES, USER_STATUSES } from '../../types/index.js';

export const updateMeSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100).optional(),
    phone: z
      .string()
      .trim()
      .min(10, 'Phone must be at least 10 digits')
      .max(15, 'Phone cannot exceed 15 characters')
      .regex(/^\+?[0-9\s-]+$/, 'Invalid phone number format')
      .optional(),
  })
  .strict();

export type UpdateMeInput = z.infer<typeof updateMeSchema>;

export const getUsersQuerySchema = z.object({
  role: z.enum(USER_ROLES).optional(),
  status: z.enum(USER_STATUSES).optional(),
  q: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type GetUsersQuery = z.infer<typeof getUsersQuerySchema>;

export const createUserSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
    email: z.string().email('Invalid email address').toLowerCase().trim(),
    phone: z
      .string()
      .trim()
      .min(10, 'Phone must be at least 10 digits')
      .max(15, 'Phone cannot exceed 15 characters')
      .regex(/^\+?[0-9\s-]+$/, 'Invalid phone number format')
      .optional(),
    role: z.enum(['staff', 'admin'] as const),
  })
  .strict();

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100).optional(),
    phone: z
      .string()
      .trim()
      .min(10, 'Phone must be at least 10 digits')
      .max(15, 'Phone cannot exceed 15 characters')
      .regex(/^\+?[0-9\s-]+$/, 'Invalid phone number format')
      .optional(),
    role: z.enum(USER_ROLES).optional(),
  })
  .strict();

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const userIdParamSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid user ID format'),
});
