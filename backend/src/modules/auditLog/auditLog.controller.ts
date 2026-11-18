import type { Request, Response, NextFunction } from 'express';
import { auditLogService } from './auditLog.service.js';

export class AuditLogController {
  async getAuditLogs(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await auditLogService.getAuditLogs(req.query as any);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const auditLogController = new AuditLogController();
