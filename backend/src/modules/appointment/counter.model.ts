import { Schema, model, Document } from 'mongoose';

export interface ICounter {
  key: string;
  value: number;
  expiresAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ICounterDocument extends ICounter, Document {}

const counterSchema = new Schema<ICounterDocument>(
  {
    key: {
      type: String,
      required: [true, 'Counter key is required'],
      unique: true,
      trim: true,
    },
    value: {
      type: Number,
      required: true,
      default: 0,
    },
    expiresAt: {
      type: Date,
      required: [true, 'Expiration date is required'],
    },
  },
  {
    timestamps: true,
  }
);

// TTL index on expiresAt to clean up historical counters
counterSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Counter = model<ICounterDocument>('Counter', counterSchema);
