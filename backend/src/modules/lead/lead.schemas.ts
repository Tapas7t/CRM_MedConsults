import { z } from 'zod';
import { Types } from 'mongoose';
import { LEAD_STAGES, LEAD_SOURCES, LeadStage, LeadSource } from '../../types/index.js';

export const leadIdParamSchema = z.object({
  id: z.string().refine((val) => Types.ObjectId.isValid(val), {
    message: 'Invalid lead ID format',
  }),
});

export const createLeadSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters long').max(100),
  phone: z
    .string()
    .trim()
    .min(10, 'Phone number must be at least 10 digits')
    .max(15, 'Phone number cannot exceed 15 digits'),
  email: z.string().trim().email('Invalid email address').toLowerCase().optional(),
  interest: z.string().trim().max(500).optional(),
  source: z.enum(LEAD_SOURCES as [LeadSource, ...LeadSource[]]).default('website'),
  ownerId: z
    .string()
    .refine((val) => Types.ObjectId.isValid(val), {
      message: 'Invalid owner user ID',
    })
    .optional(),
});

export const updateLeadSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  phone: z.string().trim().min(10).max(15).optional(),
  email: z.string().trim().email('Invalid email address').toLowerCase().optional(),
  interest: z.string().trim().max(500).optional(),
  source: z.enum(LEAD_SOURCES as [LeadSource, ...LeadSource[]]).optional(),
  ownerId: z
    .string()
    .refine((val) => Types.ObjectId.isValid(val), {
      message: 'Invalid owner user ID',
    })
    .nullable()
    .optional(),
});

export const changeLeadStageSchema = z
  .object({
    stage: z.enum(LEAD_STAGES as [LeadStage, ...LeadStage[]]),
    lostReason: z.string().trim().max(500).optional(),
  })
  .refine(
    (data) => {
      if (data.stage === 'lost') {
        return !!data.lostReason && data.lostReason.trim().length >= 2;
      }
      return true;
    },
    {
      message: 'A reason is required when moving a lead to lost status',
      path: ['lostReason'],
    }
  );

export const getLeadsQuerySchema = z.object({
  stage: z.enum(LEAD_STAGES as [LeadStage, ...LeadStage[]]).optional(),
  source: z.enum(LEAD_SOURCES as [LeadSource, ...LeadSource[]]).optional(),
  ownerId: z
    .string()
    .refine((val) => Types.ObjectId.isValid(val), {
      message: 'Invalid owner ID',
    })
    .optional(),
  q: z.string().trim().optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const publicEnquirySchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters long').max(100),
  phone: z
    .string()
    .trim()
    .min(10, 'Phone number must be at least 10 digits')
    .max(15, 'Phone number cannot exceed 15 digits'),
  concern: z.string().trim().min(2, 'Concern must be at least 2 characters long').max(500),
  email: z.string().trim().email('Invalid email address').toLowerCase().optional(),
  preferredSpecialty: z.string().trim().max(100).optional(),
  honeypot: z.string().optional(), // Hidden bot field
  websiteUrl: z.string().optional(), // Alternative honeypot field
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;
export type ChangeLeadStageInput = z.infer<typeof changeLeadStageSchema>;
export type GetLeadsQuery = z.infer<typeof getLeadsQuerySchema>;
export type PublicEnquiryInput = z.infer<typeof publicEnquirySchema>;
