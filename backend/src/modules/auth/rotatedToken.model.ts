import { Schema, model, Document, Types } from 'mongoose';

export interface IRotatedRefreshToken {
  userId: Types.ObjectId;
  tokenHash: string;
  createdAt: Date;
}

export interface IRotatedRefreshTokenDocument extends IRotatedRefreshToken, Document<Types.ObjectId> {}

const rotatedRefreshTokenSchema = new Schema<IRotatedRefreshTokenDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      // Auto-expire after 7 days (matches 7-day refresh token lifespan)
      expires: 7 * 24 * 60 * 60,
    },
  },
  {
    timestamps: false,
  }
);

export const RotatedRefreshToken = model<IRotatedRefreshTokenDocument>(
  'RotatedRefreshToken',
  rotatedRefreshTokenSchema
);
