import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authController } from './auth.controller.js';
import { validate } from '../../middleware/validate.js';
import { AppError } from '../../middleware/errorHandler.js';
import {
  registerSchema,
  registerDoctorSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from './auth.schemas.js';

export const authRouter = Router();

// 1. General auth rate limiter: 10 per minute per IP, skipping successful requests
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: process.env.NODE_ENV === 'test' ? 1000 : 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(new AppError(429, 'RATE_LIMIT_EXCEEDED', 'Too many requests. Please try again later.'));
  },
});

// 2. Sensitive endpoint rate limiter for email triggering endpoints: 5 per 15 minutes per IP
const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: process.env.NODE_ENV === 'test' ? 1000 : 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(
      new AppError(
        429,
        'RATE_LIMIT_EXCEEDED',
        'Too many requests for this operation. Please try again later.'
      )
    );
  },
});

authRouter.use(authLimiter);

authRouter.post('/register', validate(registerSchema), authController.register);
authRouter.post('/register-doctor', validate(registerDoctorSchema), authController.registerDoctor);
authRouter.post('/verify-email', validate(verifyEmailSchema), authController.verifyEmail);
authRouter.post(
  '/resend-verification',
  sensitiveLimiter,
  validate(resendVerificationSchema),
  authController.resendVerification
);
authRouter.post('/login', validate(loginSchema), authController.login);
authRouter.post('/refresh', authController.refresh);
authRouter.post('/logout', authController.logout);
authRouter.post(
  '/forgot-password',
  sensitiveLimiter,
  validate(forgotPasswordSchema),
  authController.forgotPassword
);
authRouter.post('/reset-password', validate(resetPasswordSchema), authController.resetPassword);
