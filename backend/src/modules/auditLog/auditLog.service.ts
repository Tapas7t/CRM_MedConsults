import { Types } from 'mongoose';
import { AuditLog } from './auditLog.model.js';
import { UserModel } from '../user/user.model.js';
import type { GetAuditLogsQuery } from './auditLog.schemas.js';

export class AuditLogService {
  /**
   * Admin: List system audit log entries with filters, date range, and pagination.
   */
  async getAuditLogs(query: GetAuditLogsQuery) {
    const { actor, action, entityType, from, to, page, limit } = query;
    const filter: Record<string, any> = {};

    if (action) {
      filter.action = action.trim();
    }

    if (entityType) {
      filter.entityType = entityType.trim();
    }

    if (from || to) {
      filter.at = {};
      if (from) filter.at.$gte = from;
      if (to) filter.at.$lte = to;
    }

    if (actor) {
      if (Types.ObjectId.isValid(actor)) {
        filter.actorId = new Types.ObjectId(actor);
      } else {
        const regex = new RegExp(actor.trim(), 'i');
        const matchedUsers = await UserModel.find({
          $or: [{ name: regex }, { email: regex }],
        }).select('_id');
        const userIds = matchedUsers.map((u) => u._id);
        filter.actorId = { $in: userIds };
      }
    }

    const skip = (page - 1) * limit;
    const [auditLogs, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ at: -1 })
        .skip(skip)
        .limit(limit)
        .populate('actorId', 'name email role'),
      AuditLog.countDocuments(filter),
    ]);

    return {
      auditLogs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }
}

export const auditLogService = new AuditLogService();
