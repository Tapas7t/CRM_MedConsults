import { Router } from 'express';
import { auditLogController } from './auditLog.controller.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { roleGuard } from '../../middleware/roleGuard.js';
import { validate } from '../../middleware/validate.js';
import { getAuditLogsQuerySchema } from './auditLog.schemas.js';

export const auditLogRouter = Router();

// Audit log endpoint is restricted to administrators
auditLogRouter.get(
  '/',
  requireAuth,
  roleGuard('admin'),
  validate(getAuditLogsQuerySchema, 'query'),
  auditLogController.getAuditLogs
);
