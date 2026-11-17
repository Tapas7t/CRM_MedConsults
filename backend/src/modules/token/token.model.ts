import { Schema, model, Document, Types } from 'mongoose';
import { TokenType, TOKEN_TYPES } from '../../types/index.js';

export interface IToken {
  userId: Types.ObjectId;
  type: TokenType;
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ITokenDocument extends IToken, Document<Types.ObjectId> {}

const tokenSchema = new Schema<ITokenDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },
    type: {
      type: String,
      enum: TOKEN_TYPES,
      required: [true, 'Token type is required'],
      index: true,
    },
    tokenHash: {
      type: String,
      required: [true, 'Token hash is required'],
      unique: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: [true, 'Expiry date is required'],
      // MongoDB TTL index: automatically deletes the document once expiresAt is reached
      index: { expires: 0 },
    },
    usedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

tokenSchema.index({ userId: 1, type: 1 });

export const Token = model<ITokenDocument>('Token', tokenSchema);
