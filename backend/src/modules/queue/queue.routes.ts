import { Router } from 'express';
import { appointmentController } from '../appointment/appointment.controller.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { roleGuard } from '../../middleware/roleGuard.js';
import { validate } from '../../middleware/validate.js';
import { queueTodayQuerySchema } from '../appointment/appointment.schemas.js';

export const queueRouter = Router();

queueRouter.use(requireAuth);
queueRouter.use(roleGuard('doctor', 'staff', 'admin'));

queueRouter.get(
  '/today',
  validate(queueTodayQuerySchema, 'query'),
  appointmentController.getTodayQueue
);
