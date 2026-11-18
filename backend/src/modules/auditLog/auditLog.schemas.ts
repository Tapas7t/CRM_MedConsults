import { z } from 'zod';

export const getAuditLogsQuerySchema = z.object({
  actor: z.string().trim().optional(),
  action: z.string().trim().optional(),
  entityType: z.string().trim().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type GetAuditLogsQuery = z.infer<typeof getAuditLogsQuerySchema>;
