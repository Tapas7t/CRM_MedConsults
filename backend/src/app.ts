import express, { Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { isDBConnected } from './config/db.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requireAuth } from './middleware/requireAuth.js';
import { roleGuard } from './middleware/roleGuard.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { userRouter } from './modules/user/user.routes.js';
import { doctorRouter } from './modules/doctor/doctor.routes.js';
import { patientRouter } from './modules/patient/patient.routes.js';
import { auditLogRouter } from './modules/auditLog/auditLog.routes.js';

export const app = express();

// 1. Security headers
app.use(helmet());

// 2. CORS with explicit origin list from CORS_ORIGINS
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || env.CORS_ORIGINS.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    credentials: true,
  })
);

// 3. Body parser with 10kb limit
app.use(express.json({ limit: '10kb' }));

// 4. Cookie parser for HttpOnly session refresh tokens
app.use(cookieParser());

// 5. Express 5 compatibility fix & Mongo sanitize
app.use((req, _res, next) => {
  if (req.query) {
    Object.defineProperty(req, 'query', {
      value: { ...req.query },
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }
  next();
});
app.use(mongoSanitize());

// Public health & readiness endpoints (excluded from strict /api rate limits)
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

app.get('/ready', (_req: Request, res: Response) => {
  const connected = isDBConnected();
  if (connected) {
    res.status(200).json({
      status: 'ready',
      database: 'connected',
    });
  } else {
    res.status(503).json({
      status: 'not ready',
      database: 'disconnected',
    });
  }
});

// 6. Global rate limiter on /api
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later.',
    },
  },
});
app.use('/api', apiLimiter);

// 7. Base API v1 endpoint
app.get('/api/v1', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: {
      name: 'MedConsults CRM API',
      version: '1.0.0',
    },
  });
});

// 8. Module routers
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/users', userRouter);
app.use('/api/v1/doctors', doctorRouter);
app.use('/api/v1/patients', patientRouter);
app.use('/api/v1/audit-logs', auditLogRouter);

// Test route for roleGuard verification during tests
if (process.env.NODE_ENV === 'test') {
  app.get('/api/test-admin-only', requireAuth, roleGuard('admin'), (_req, res) => {
    res.status(200).json({ success: true, message: 'Admin access granted' });
  });
}

// 9. 404 handler for unknown routes
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Resource not found',
    },
  });
});

// 10. Central error handler
app.use(errorHandler);
