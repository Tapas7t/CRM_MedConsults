import { z } from 'zod';

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
