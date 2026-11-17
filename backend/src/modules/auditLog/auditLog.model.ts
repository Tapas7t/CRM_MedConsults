import { Schema, model, Document, Types } from 'mongoose';

export interface IAuditLog {
  actorId?: Types.ObjectId;
  role?: string;
  action: string;
  entityType: string;
  entityId?: string;
  ip?: string;
  meta: Record<string, any>;
  at: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IAuditLogDocument extends IAuditLog, Document<Types.ObjectId> {}

const auditLogSchema = new Schema<IAuditLogDocument>(
  {
    actorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    role: {
      type: String,
      trim: true,
    },
    action: {
      type: String,
      required: [true, 'Audit action is required'],
      trim: true,
    },
    entityType: {
      type: String,
      required: [true, 'Entity type is required'],
      trim: true,
      index: true,
    },
    entityId: {
      type: String,
      trim: true,
    },
    ip: {
      type: String,
      trim: true,
    },
    meta: {
      type: Schema.Types.Mixed,
      default: {},
    },
    at: {
      type: Date,
      default: Date.now,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

auditLogSchema.index({ at: -1, actorId: 1 });
auditLogSchema.index({ entityType: 1, entityId: 1 });

export const AuditLog = model<IAuditLogDocument>('AuditLog', auditLogSchema);
