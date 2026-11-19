import { z } from 'zod';
import { Types } from 'mongoose';
import { APPOINTMENT_STATUSES, AppointmentStatus, GENDERS, Gender } from '../../types/index.js';

export const appointmentIdParamSchema = z.object({
  id: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: 'Invalid appointment ID format',
  }),
});

export const bookAppointmentSchema = z.object({
  doctorId: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: 'Invalid doctor ID',
  }),
  start: z.string().datetime({ offset: true }),
  reason: z.string().trim().max(120, 'Reason cannot exceed 120 characters').optional(),
  patientId: z
    .string()
    .refine((val) => Types.ObjectId.isValid(val), {
      message: 'Invalid patient ID',
    })
    .optional(),
});

export const rescheduleAppointmentSchema = z.object({
  start: z.string().datetime({ offset: true }),
  doctorId: z
    .string()
    .refine((val) => Types.ObjectId.isValid(val), {
      message: 'Invalid doctor ID',
    })
    .optional(),
});

export const cancelAppointmentSchema = z.object({
  reason: z.string().trim().max(250, 'Cancellation reason cannot exceed 250 characters').optional(),
});

export const walkInAppointmentSchema = z
  .object({
    doctorId: z.string().refine((val) => Types.ObjectId.isValid(val), {
      message: 'Invalid doctor ID',
    }),
    reason: z.string().trim().max(120, 'Reason cannot exceed 120 characters').optional(),
    patientId: z
      .string()
      .refine((val) => Types.ObjectId.isValid(val), {
        message: 'Invalid patient ID',
      })
      .optional(),
    name: z.string().trim().min(2).max(100).optional(),
    phone: z.string().trim().min(10).max(15).optional(),
    gender: z.enum(GENDERS as [Gender, ...Gender[]]).optional().default('prefer_not_to_say'),
    dob: z.string().optional(),
    age: z.coerce.number().int().min(0).max(130).optional(),
  })
  .refine(
    (data) => {
      return !!data.patientId || (!!data.name && !!data.phone);
    },
    {
      message: 'Either patientId or patient name and phone must be provided for a walk-in registration.',
      path: ['patientId'],
    }
  );

export const getAppointmentsQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  doctorId: z
    .string()
    .refine((val) => Types.ObjectId.isValid(val), {
      message: 'Invalid doctor ID',
    })
    .optional(),
  patientId: z
    .string()
    .refine((val) => Types.ObjectId.isValid(val), {
      message: 'Invalid patient ID',
    })
    .optional(),
  status: z.enum(APPOINTMENT_STATUSES as [AppointmentStatus, ...AppointmentStatus[]]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const appointmentSummaryQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
});

export const queueTodayQuerySchema = z.object({
  doctorId: z
    .string()
    .refine((val) => Types.ObjectId.isValid(val), {
      message: 'Invalid doctor ID',
    })
    .optional(),
});

export type BookAppointmentInput = z.infer<typeof bookAppointmentSchema>;
export type RescheduleAppointmentInput = z.infer<typeof rescheduleAppointmentSchema>;
export type CancelAppointmentInput = z.infer<typeof cancelAppointmentSchema>;
export type WalkInAppointmentInput = z.infer<typeof walkInAppointmentSchema>;
export type GetAppointmentsQuery = z.infer<typeof getAppointmentsQuerySchema>;
export type AppointmentSummaryQuery = z.infer<typeof appointmentSummaryQuerySchema>;
export type QueueTodayQuery = z.infer<typeof queueTodayQuerySchema>;
