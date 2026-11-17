import { Schema, model, Document, Types } from 'mongoose';
import { DoctorApprovalStatus, DOCTOR_APPROVAL_STATUSES } from '../../types/index.js';

export interface IAvailabilitySlot {
  start: string; // e.g. "09:00"
  end: string;   // e.g. "13:00"
}

export interface IWeeklyAvailability {
  dayOfWeek: number; // 0 for Sunday, 1 for Monday, etc. (0-6)
  slots: IAvailabilitySlot[];
}

export interface IBlockedDate {
  date: Date;
  reason?: string;
}

export interface IDoctor {
  userId: Types.ObjectId;
  specialty: string;
  qualifications: string[];
  registrationNo: string;
  experienceYears: number;
  languages: string[];
  consultationFee: number;
  clinicRoom: string;
  bio?: string;
  approvalStatus: DoctorApprovalStatus;
  isOnline: boolean;
  lastSeenAt?: Date;
  weeklyAvailability: IWeeklyAvailability[];
  blockedDates: IBlockedDate[];
  slotMinutes: number;
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IDoctorDocument extends IDoctor, Document<Types.ObjectId> {}

const availabilitySlotSchema = new Schema<IAvailabilitySlot>(
  {
    start: {
      type: String,
      required: true,
      match: [/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format (HH:MM)'],
    },
    end: {
      type: String,
      required: true,
      match: [/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format (HH:MM)'],
    },
  },
  { _id: false }
);

const weeklyAvailabilitySchema = new Schema<IWeeklyAvailability>(
  {
    dayOfWeek: {
      type: Number,
      required: true,
      min: 0,
      max: 6,
    },
    slots: {
      type: [availabilitySlotSchema],
      default: [],
    },
  },
  { _id: false }
);

const blockedDateSchema = new Schema<IBlockedDate>(
  {
    date: {
      type: Date,
      required: true,
    },
    reason: {
      type: String,
      trim: true,
    },
  },
  { _id: false }
);

const doctorSchema = new Schema<IDoctorDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      unique: true,
    },
    specialty: {
      type: String,
      required: [true, 'Specialty is required'],
      trim: true,
      index: true,
    },
    qualifications: {
      type: [String],
      required: [true, 'Qualifications are required'],
      default: [],
    },
    registrationNo: {
      type: String,
      required: [true, 'Registration number is required'],
      trim: true,
    },
    experienceYears: {
      type: Number,
      required: [true, 'Experience years are required'],
      min: [0, 'Experience years cannot be negative'],
    },
    languages: {
      type: [String],
      default: [],
    },
    consultationFee: {
      type: Number,
      required: [true, 'Consultation fee is required'],
      min: [0, 'Consultation fee cannot be negative'],
    },
    clinicRoom: {
      type: String,
      required: [true, 'Clinic room is required'],
      trim: true,
    },
    bio: {
      type: String,
      trim: true,
    },
    approvalStatus: {
      type: String,
      enum: DOCTOR_APPROVAL_STATUSES,
      default: 'pending',
      index: true,
    },
    isOnline: {
      type: Boolean,
      default: false,
    },
    lastSeenAt: {
      type: Date,
    },
    weeklyAvailability: {
      type: [weeklyAvailabilitySchema],
      default: [],
    },
    blockedDates: {
      type: [blockedDateSchema],
      default: [],
    },
    slotMinutes: {
      type: Number,
      default: 15,
      min: [5, 'Slot duration must be at least 5 minutes'],
      max: [120, 'Slot duration cannot exceed 120 minutes'],
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

doctorSchema.index({ specialty: 1, approvalStatus: 1 });
doctorSchema.index({ approvalStatus: 1, isDeleted: 1 });

export const Doctor = model<IDoctorDocument>('Doctor', doctorSchema);
