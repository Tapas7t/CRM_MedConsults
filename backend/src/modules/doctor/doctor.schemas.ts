import { z } from 'zod';
import { DOCTOR_APPROVAL_STATUSES } from '../../types/index.js';

export const getDoctorsQuerySchema = z.object({
  q: z.string().trim().optional(),
  specialty: z.string().trim().optional(),
  availableToday: z
    .preprocess((val) => {
      if (typeof val === 'string') {
        return val.toLowerCase() === 'true';
      }
      return Boolean(val);
    }, z.boolean())
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type GetDoctorsQuery = z.infer<typeof getDoctorsQuerySchema>;

export const getDoctorSlotsQuerySchema = z.object({
  date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
});

export type GetDoctorSlotsQuery = z.infer<typeof getDoctorSlotsQuerySchema>;

export const updateDoctorMeSchema = z
  .object({
    bio: z.string().trim().max(1000).optional(),
    qualifications: z.array(z.string().trim().min(1)).min(1).optional(),
    languages: z.array(z.string().trim().min(1)).optional(),
    consultationFee: z.number().min(0, 'Consultation fee cannot be negative').optional(),
    clinicRoom: z.string().trim().min(1).optional(),
  })
  .strict();

export type UpdateDoctorMeInput = z.infer<typeof updateDoctorMeSchema>;

const timeSlotSchema = z
  .object({
    start: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Start time must be HH:MM'),
    end: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'End time must be HH:MM'),
  })
  .refine(
    (slot) => slot.start < slot.end,
    { message: 'Start time must be before end time' }
  );

const weeklyDayAvailabilitySchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    slots: z.array(timeSlotSchema),
  })
  .refine(
    (day) => {
      // Check for overlapping sessions within the same day
      const sorted = [...day.slots].sort((a, b) => a.start.localeCompare(b.start));
      for (let i = 0; i < sorted.length - 1; i++) {
        if (sorted[i].end > sorted[i + 1].start) {
          return false; // overlap found
        }
      }
      return true;
    },
    { message: 'Availability sessions on the same day cannot overlap' }
  );

export const updateDoctorAvailabilitySchema = z
  .object({
    slotMinutes: z.union([
      z.literal(10),
      z.literal(15),
      z.literal(20),
      z.literal(30),
    ]),
    weeklyAvailability: z.array(weeklyDayAvailabilitySchema),
    blockedDates: z
      .array(
        z.object({
          date: z.coerce.date(),
          reason: z.string().trim().optional(),
        })
      )
      .default([]),
  })
  .strict();

export type UpdateDoctorAvailabilityInput = z.infer<typeof updateDoctorAvailabilitySchema>;

export const updateDoctorOnlineSchema = z
  .object({
    isOnline: z.boolean(),
  })
  .strict();

export const getDoctorsAdminQuerySchema = z.object({
  approvalStatus: z.enum(DOCTOR_APPROVAL_STATUSES).optional(),
  specialty: z.string().trim().optional(),
  q: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type GetDoctorsAdminQuery = z.infer<typeof getDoctorsAdminQuerySchema>;

export const doctorIdParamSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid doctor ID format'),
});

