import { z } from 'zod';
import { GENDERS, PATIENT_STATUSES } from '../../types/index.js';

export const getPatientsQuerySchema = z.object({
  q: z.string().trim().optional(),
  status: z.enum(PATIENT_STATUSES).optional(),
  source: z.string().trim().optional(),
  assignedStaffId: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/, 'Invalid staff ID format')
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type GetPatientsQuery = z.infer<typeof getPatientsQuerySchema>;

export const createPatientSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
    phone: z
      .string()
      .trim()
      .min(10, 'Phone must be at least 10 digits')
      .max(15, 'Phone cannot exceed 15 characters')
      .regex(/^\+?[0-9\s-]+$/, 'Invalid phone number format'),
    email: z.string().email('Invalid email address').toLowerCase().trim().optional(),
    dob: z.coerce.date().optional(),
    gender: z.enum(GENDERS).optional(),
    source: z.string().trim().min(1).default('walk_in'),
    assignedStaffId: z
      .string()
      .regex(/^[0-9a-fA-F]{24}$/, 'Invalid staff ID format')
      .optional(),
    status: z.enum(PATIENT_STATUSES).default('active'),
    whatsappOptIn: z.boolean().default(false),
  })
  .strict();

export type CreatePatientInput = z.infer<typeof createPatientSchema>;

export const updatePatientSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100).optional(),
    phone: z
      .string()
      .trim()
      .min(10, 'Phone must be at least 10 digits')
      .max(15, 'Phone cannot exceed 15 characters')
      .regex(/^\+?[0-9\s-]+$/, 'Invalid phone number format')
      .optional(),
    email: z.string().email('Invalid email address').toLowerCase().trim().optional(),
    dob: z.coerce.date().optional(),
    gender: z.enum(GENDERS).optional(),
    source: z.string().trim().min(1).optional(),
    assignedStaffId: z
      .string()
      .regex(/^[0-9a-fA-F]{24}$/, 'Invalid staff ID format')
      .optional(),
    status: z.enum(PATIENT_STATUSES).optional(),
    whatsappOptIn: z.boolean().optional(),
  })
  .strict();

export type UpdatePatientInput = z.infer<typeof updatePatientSchema>;

export const patientIdParamSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid patient ID format'),
});
