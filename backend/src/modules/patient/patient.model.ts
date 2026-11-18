import { Schema, model, Document, Types } from 'mongoose';
import { Gender, GENDERS, PatientStatus, PATIENT_STATUSES } from '../../types/index.js';

export interface IPatient {
  userId?: Types.ObjectId;
  name: string;
  phone: string;
  email?: string;
  dob?: Date;
  gender?: Gender;
  source: string;
  assignedStaffId?: Types.ObjectId;
  status: PatientStatus;
  whatsappOptIn: boolean;
  whatsappOptInAt?: Date;
  patientCode: string;
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IPatientDocument extends IPatient, Document<Types.ObjectId> {}

const patientSchema = new Schema<IPatientDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    name: {
      type: String,
      required: [true, 'Patient name is required'],
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
      index: true,
    },
    dob: {
      type: Date,
    },
    gender: {
      type: String,
      enum: GENDERS,
    },
    source: {
      type: String,
      default: 'walk_in',
      trim: true,
    },
    assignedStaffId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    status: {
      type: String,
      enum: PATIENT_STATUSES,
      default: 'active',
      index: true,
    },
    whatsappOptIn: {
      type: Boolean,
      default: false,
    },
    whatsappOptInAt: {
      type: Date,
    },
    patientCode: {
      type: String,
      required: [true, 'Patient code is required'],
      unique: true,
      sparse: true,
      trim: true,
      uppercase: true,
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

patientSchema.index({ name: 'text' });
patientSchema.index({ phone: 1, isDeleted: 1 });
patientSchema.index({ email: 1, isDeleted: 1 });

export const Patient = model<IPatientDocument>('Patient', patientSchema);
