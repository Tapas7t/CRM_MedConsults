import { Schema, model, Document, Types } from 'mongoose';
import { LeadStage, LeadSource, LEAD_STAGES, LEAD_SOURCES } from '../../types/index.js';

export interface ILead {
  name: string;
  phone: string;
  email?: string;
  interest?: string;
  source: LeadSource;
  stage: LeadStage;
  ownerId?: Types.ObjectId;
  patientId?: Types.ObjectId;
  lostReason?: string;
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ILeadDocument extends ILead, Document<Types.ObjectId> {}

const leadSchema = new Schema<ILeadDocument>(
  {
    name: {
      type: String,
      required: [true, 'Lead name is required'],
      trim: true,
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
      index: true,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
    },
    interest: {
      type: String,
      trim: true,
    },
    source: {
      type: String,
      enum: LEAD_SOURCES,
      default: 'website',
    },
    stage: {
      type: String,
      enum: LEAD_STAGES,
      default: 'new',
      index: true,
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    patientId: {
      type: Schema.Types.ObjectId,
      ref: 'Patient',
    },
    lostReason: {
      type: String,
      trim: true,
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
  }
);

leadSchema.index({ stage: 1, isDeleted: 1 });
leadSchema.index({ createdAt: 1 });
leadSchema.index({ phone: 1, isDeleted: 1 });

export const Lead = model<ILeadDocument>('Lead', leadSchema);
