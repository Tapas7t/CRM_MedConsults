import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { leadController } from './lead.controller.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { roleGuard } from '../../middleware/roleGuard.js';
import { validate } from '../../middleware/validate.js';
import { AppError } from '../../middleware/errorHandler.js';
import {
  createLeadSchema,
  updateLeadSchema,
  changeLeadStageSchema,
  getLeadsQuerySchema,
  leadIdParamSchema,
  publicEnquirySchema,
} from './lead.schemas.js';

export const leadRouter = Router();
export const publicEnquiryRouter = Router();

// Rate limiter for public website enquiries: 5 requests per hour per IP (elevated in test mode)
export const publicEnquiryLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 50 : 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many enquiry requests from this IP. Please try again later.',
    },
  },
  handler: (_req, _res, next) => {
    next(new AppError(429, 'RATE_LIMIT_EXCEEDED', 'Too many enquiry requests from this IP. Please try again later.'));
  },
});

// -------------------------------------------------------------
// Public Enquiry Route: POST /api/v1/public/enquiries
// -------------------------------------------------------------
publicEnquiryRouter.post(
  '/',
  publicEnquiryLimiter,
  validate(publicEnquirySchema),
  leadController.handlePublicEnquiry
);

// -------------------------------------------------------------
// Protected Staff/Admin Leads Routes: /api/v1/leads
// -------------------------------------------------------------
leadRouter.use(requireAuth);
leadRouter.use(roleGuard('staff', 'admin'));

// 1. Kanban Board (MUST BE BEFORE /:id)
leadRouter.get('/board', leadController.getLeadsBoard);

// 2. Collection endpoints
leadRouter.get('/', validate(getLeadsQuerySchema, 'query'), leadController.getLeads);
leadRouter.post('/', validate(createLeadSchema), leadController.createLead);

// 3. Parameterized endpoints
leadRouter.get('/:id', validate(leadIdParamSchema, 'params'), leadController.getLeadById);
leadRouter.patch(
  '/:id',
  validate({ params: leadIdParamSchema, body: updateLeadSchema }),
  leadController.updateLead
);

leadRouter.post(
  '/:id/stage',
  validate({ params: leadIdParamSchema, body: changeLeadStageSchema }),
  leadController.changeLeadStage
);

leadRouter.post(
  '/:id/convert',
  validate(leadIdParamSchema, 'params'),
  leadController.convertLead
);

leadRouter.delete(
  '/:id',
  roleGuard('admin'),
  validate(leadIdParamSchema, 'params'),
  leadController.deleteLead
);
