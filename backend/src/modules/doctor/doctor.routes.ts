import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { doctorController } from './doctor.controller.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { roleGuard } from '../../middleware/roleGuard.js';
import { validate } from '../../middleware/validate.js';
import {
  getDoctorsQuerySchema,
  getDoctorSlotsQuerySchema,
  updateDoctorMeSchema,
  updateDoctorAvailabilitySchema,
  updateDoctorOnlineSchema,
  getDoctorsAdminQuerySchema,
  doctorIdParamSchema,
} from './doctor.schemas.js';

export const doctorRouter = Router();

// Dedicated rate limiter for public doctor search and profile routes
export const doctorPublicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 25 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many doctor requests, please try again later.',
    },
  },
});

// -------------------------------------------------------------
// 1. Doctor Self-Management Routes (/me) - MUST BE BEFORE /:id
// -------------------------------------------------------------
doctorRouter.get(
  '/me',
  requireAuth,
  roleGuard('doctor'),
  doctorController.getDoctorMe
);

doctorRouter.patch(
  '/me',
  requireAuth,
  roleGuard('doctor'),
  validate(updateDoctorMeSchema),
  doctorController.updateDoctorMe
);

doctorRouter.put(
  '/me/availability',
  requireAuth,
  roleGuard('doctor'),
  validate(updateDoctorAvailabilitySchema),
  doctorController.updateDoctorAvailability
);

doctorRouter.patch(
  '/me/online',
  requireAuth,
  roleGuard('doctor'),
  validate(updateDoctorOnlineSchema),
  doctorController.updateDoctorOnline
);

doctorRouter.post(
  '/me/heartbeat',
  requireAuth,
  roleGuard('doctor'),
  doctorController.recordHeartbeat
);

// -------------------------------------------------------------
// 2. Admin Doctor Management Routes (/admin) - MUST BE BEFORE /:id
// -------------------------------------------------------------
doctorRouter.get(
  '/admin/list',
  requireAuth,
  roleGuard('admin'),
  validate(getDoctorsAdminQuerySchema, 'query'),
  doctorController.getDoctorsAdmin
);

doctorRouter.get(
  '/admin/pending',
  requireAuth,
  roleGuard('admin'),
  doctorController.getPendingDoctors
);

// -------------------------------------------------------------
// 3. Public Listing Route (GET /)
// -------------------------------------------------------------
doctorRouter.get(
  '/',
  doctorPublicLimiter,
  validate(getDoctorsQuerySchema, 'query'),
  doctorController.getPublicDoctors
);

// -------------------------------------------------------------
// 4. Parameterized Routes (/:id)
// -------------------------------------------------------------
doctorRouter.get(
  '/:id/slots',
  doctorPublicLimiter,
  validate({ params: doctorIdParamSchema, query: getDoctorSlotsQuerySchema }),
  doctorController.getDoctorSlots
);

doctorRouter.get(
  '/:id',
  doctorPublicLimiter,
  validate(doctorIdParamSchema, 'params'),
  doctorController.getPublicDoctorById
);

doctorRouter.post(
  '/:id/approve',
  requireAuth,
  roleGuard('admin'),
  validate(doctorIdParamSchema, 'params'),
  doctorController.approveDoctor
);

doctorRouter.post(
  '/:id/block',
  requireAuth,
  roleGuard('admin'),
  validate(doctorIdParamSchema, 'params'),
  doctorController.blockDoctor
);
