import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { appointmentController } from './appointment.controller.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { roleGuard } from '../../middleware/roleGuard.js';
import { validate } from '../../middleware/validate.js';
import { AppError } from '../../middleware/errorHandler.js';
import {
  appointmentIdParamSchema,
  bookAppointmentSchema,
  rescheduleAppointmentSchema,
  cancelAppointmentSchema,
  walkInAppointmentSchema,
  getAppointmentsQuerySchema,
  appointmentSummaryQuerySchema,
} from './appointment.schemas.js';

export const appointmentRouter = Router();

// Rate limit: 20 per minute per user
export const appointmentCreationLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: process.env.NODE_ENV === 'test' ? 1000 : 20,
  keyGenerator: (req) => (req as any).user?._id?.toString() || req.ip || 'anonymous',
  validate: { keyGeneratorIpFallback: false },
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(
      new AppError(
        429,
        'RATE_LIMIT_EXCEEDED',
        'Too many appointment creation requests. Please try again later.'
      )
    );
  },
});

// All appointment endpoints require authentication
appointmentRouter.use(requireAuth);

// 1. Static & Collection routes (MUST be defined before /:id)
appointmentRouter.get(
  '/summary',
  roleGuard('doctor', 'staff', 'admin'),
  validate(appointmentSummaryQuerySchema, 'query'),
  appointmentController.getSummary
);

appointmentRouter.post(
  '/walk-in',
  roleGuard('staff', 'admin'),
  validate(walkInAppointmentSchema),
  appointmentController.createWalkIn
);

appointmentRouter.get(
  '/',
  validate(getAppointmentsQuerySchema, 'query'),
  appointmentController.getAppointments
);

appointmentRouter.post(
  '/',
  roleGuard('patient', 'staff', 'admin'),
  appointmentCreationLimiter,
  validate(bookAppointmentSchema),
  appointmentController.bookAppointment
);

// 2. Parameterized routes /:id
appointmentRouter.get(
  '/:id',
  validate(appointmentIdParamSchema, 'params'),
  appointmentController.getAppointmentById
);

appointmentRouter.post(
  '/:id/reschedule',
  roleGuard('patient', 'staff', 'admin'),
  validate({ params: appointmentIdParamSchema, body: rescheduleAppointmentSchema }),
  appointmentController.rescheduleAppointment
);

appointmentRouter.post(
  '/:id/cancel',
  roleGuard('patient', 'staff', 'admin'),
  validate({ params: appointmentIdParamSchema, body: cancelAppointmentSchema }),
  appointmentController.cancelAppointment
);

// State Machine transitions
appointmentRouter.post(
  '/:id/check-in',
  roleGuard('staff', 'admin'),
  validate(appointmentIdParamSchema, 'params'),
  appointmentController.checkInAppointment
);

appointmentRouter.post(
  '/:id/start',
  roleGuard('doctor', 'admin'),
  validate(appointmentIdParamSchema, 'params'),
  appointmentController.startConsultation
);

appointmentRouter.post(
  '/:id/complete',
  roleGuard('doctor'),
  validate(appointmentIdParamSchema, 'params'),
  appointmentController.completeConsultation
);

appointmentRouter.post(
  '/:id/no-show',
  roleGuard('doctor', 'staff', 'admin'),
  validate(appointmentIdParamSchema, 'params'),
  appointmentController.markNoShow
);
