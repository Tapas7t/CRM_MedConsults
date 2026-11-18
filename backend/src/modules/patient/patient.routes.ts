import { Router } from 'express';
import { patientController } from './patient.controller.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { roleGuard } from '../../middleware/roleGuard.js';
import { validate } from '../../middleware/validate.js';
import {
  getPatientsQuerySchema,
  createPatientSchema,
  updatePatientSchema,
  patientIdParamSchema,
} from './patient.schemas.js';

export const patientRouter = Router();

// All patient endpoints require authentication
patientRouter.use(requireAuth);

// 1. Patient self-service route (/me) - MUST BE BEFORE /:id
patientRouter.get(
  '/me',
  roleGuard('patient'),
  patientController.getPatientMe
);

// 2. Staff & Admin collection routes
patientRouter.get(
  '/',
  roleGuard('staff', 'admin'),
  validate(getPatientsQuerySchema, 'query'),
  patientController.getPatients
);

patientRouter.post(
  '/',
  roleGuard('staff', 'admin'),
  validate(createPatientSchema),
  patientController.createPatient
);

// 3. Parameterized routes (/:id and /:id/timeline)
patientRouter.get(
  '/:id',
  roleGuard('staff', 'admin', 'doctor'),
  validate(patientIdParamSchema, 'params'),
  patientController.getPatientById
);

patientRouter.get(
  '/:id/timeline',
  roleGuard('staff', 'admin', 'doctor'),
  validate(patientIdParamSchema, 'params'),
  patientController.getPatientTimeline
);

patientRouter.patch(
  '/:id',
  roleGuard('staff', 'admin'),
  validate({ params: patientIdParamSchema, body: updatePatientSchema }),
  patientController.updatePatient
);

patientRouter.delete(
  '/:id',
  roleGuard('admin'),
  validate(patientIdParamSchema, 'params'),
  patientController.deletePatient
);
