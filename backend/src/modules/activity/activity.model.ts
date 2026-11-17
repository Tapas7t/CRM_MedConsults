import { Schema, model, Document, Types } from 'mongoose';

export interface IActivity {
  entityType: string;
  entityId: Types.ObjectId | string;
  type: string;
  actorId?: Types.ObjectId;
  meta: Record<string, any>;
  at: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IActivityDocument extends IActivity, Document<Types.ObjectId> {}

const activitySchema = new Schema<IActivityDocument>(
  {
    entityType: {
      type: String,
      required: [true, 'Entity type is required'],
      trim: true,
      index: true,
    },
    entityId: {
      type: Schema.Types.Mixed,
      required: [true, 'Entity ID is required'],
      index: true,
    },
    type: {
      type: String,
      required: [true, 'Activity type is required'],
      trim: true,
    },
    actorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
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

activitySchema.index({ entityType: 1, entityId: 1, at: -1 });

export const Activity = model<IActivityDocument>('Activity', activitySchema);
