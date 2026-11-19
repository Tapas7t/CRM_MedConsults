import { Schema, model, Document, Types } from 'mongoose';
import { generateAppointmentCode } from '../../utils/appointmentCode.js';
import {
  AppointmentStatus,
  PaymentStatus,
  AppointmentSource,
  APPOINTMENT_STATUSES,
  PAYMENT_STATUSES,
  APPOINTMENT_SOURCES,
  ACTIVE_APPOINTMENT_STATUSES,
} from '../../types/index.js';

export interface IAppointment {
  appointmentCode: string; // Unique, random, short, used as QR payload
  patientId: Types.ObjectId;
  doctorId: Types.ObjectId;
  start: Date;
  end: Date;
  status: AppointmentStatus;
  tokenNumber: number;
  queueDate: string; // ISO Date string 'YYYY-MM-DD' representing clinic OPD queue date
  reason?: string;
  source: AppointmentSource;
  isWalkIn: boolean;
  createdBy?: Types.ObjectId;
  fee: number;
  paymentStatus: PaymentStatus;
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IAppointmentDocument extends IAppointment, Document<Types.ObjectId> {}

const appointmentSchema = new Schema<IAppointmentDocument>(
  {
    appointmentCode: {
      type: String,
      required: [true, 'Appointment code is required'],
      default: () => generateAppointmentCode(),
      trim: true,
      uppercase: true,
    },
    patientId: {
      type: Schema.Types.ObjectId,
      ref: 'Patient',
      required: [true, 'Patient ID is required'],
      index: true,
    },
    doctorId: {
      type: Schema.Types.ObjectId,
      ref: 'Doctor',
      required: [true, 'Doctor ID is required'],
      index: true,
    },
    start: {
      type: Date,
      required: [true, 'Start time is required'],
    },
    end: {
      type: Date,
      required: [true, 'End time is required'],
    },
    status: {
      type: String,
      enum: APPOINTMENT_STATUSES,
      default: 'booked',
      index: true,
    },
    tokenNumber: {
      type: Number,
      required: [true, 'Token number is required'],
      min: [1, 'Token number must be positive'],
    },
    queueDate: {
      type: String,
      required: [true, 'Queue date is required'],
      match: [/^\d{4}-\d{2}-\d{2}$/, 'Queue date must be in YYYY-MM-DD format'],
      index: true,
    },
    reason: {
      type: String,
      trim: true,
    },
    source: {
      type: String,
      enum: APPOINTMENT_SOURCES,
      default: 'website',
    },
    isWalkIn: {
      type: Boolean,
      default: false,
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    fee: {
      type: Number,
      required: [true, 'Appointment fee is required'],
      min: [0, 'Fee cannot be negative'],
    },
    paymentStatus: {
      type: String,
      enum: PAYMENT_STATUSES,
      default: 'pay_at_clinic',
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

// 1. Partial Unique index preventing double-booking active non-walk-in slots for a doctor
appointmentSchema.index(
  { doctorId: 1, start: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ACTIVE_APPOINTMENT_STATUSES },
      isWalkIn: false,
    },
  }
);

// 2. Unique index ensuring token numbers are unique per doctor per day
appointmentSchema.index(
  { doctorId: 1, queueDate: 1, tokenNumber: 1 },
  {
    unique: true,
  }
);

// 3. Operational query indexes
appointmentSchema.index({ appointmentCode: 1 }, { unique: true });
appointmentSchema.index({ patientId: 1, status: 1 });
appointmentSchema.index({ doctorId: 1, queueDate: 1, status: 1 });
appointmentSchema.index({ isDeleted: 1, status: 1 });
appointmentSchema.index({ isWalkIn: 1, queueDate: 1 });

export const Appointment = model<IAppointmentDocument>('Appointment', appointmentSchema);
