import { Schema, model, Document, Types } from 'mongoose';
import { UserRole, UserStatus, USER_ROLES, USER_STATUSES } from '../../types/index.js';

export interface IUser {
  name: string;
  email: string;
  phone?: string;
  passwordHash: string;
  role: UserRole;
  emailVerified: boolean;
  status: UserStatus;
  failedLogins: number;
  lockUntil?: Date;
  refreshTokenHashes: string[];
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IUserDocument extends IUser, Document<Types.ObjectId> {}

const userSchema = new Schema<IUserDocument>(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
    },
    role: {
      type: String,
      enum: USER_ROLES,
      default: 'patient',
      index: true,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: USER_STATUSES,
      default: 'active',
      index: true,
    },
    failedLogins: {
      type: Number,
      default: 0,
    },
    lockUntil: {
      type: Date,
    },
    refreshTokenHashes: {
      type: [String],
      default: [],
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete (ret as any).passwordHash;
        delete (ret as any).refreshTokenHashes;
        delete (ret as any).__v;
        return ret;
      },
    },
  }
);

userSchema.index({ isDeleted: 1, role: 1 });
userSchema.index({ isDeleted: 1, status: 1 });

export const User = model<IUserDocument>('User', userSchema);
