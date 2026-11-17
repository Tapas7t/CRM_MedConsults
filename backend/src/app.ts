import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import mongoSanitize from 'express-mongo-sanitize';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { isDBConnected } from './config/db.js';

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

// 4. Express 5 compatibility fix & Mongo sanitize
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

// 5. Global rate limiter on /api
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

// 6. Routes placeholder (v1)
app.get('/api/v1', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: {
      name: 'MedConsults CRM API',
      version: '1.0.0',
    },
  });
});

// 7. 404 handler for unknown routes
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Resource not found',
    },
  });
});

// 8. Central error handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status =
    typeof err.status === 'number'
      ? err.status
      : typeof err.statusCode === 'number'
        ? err.statusCode
        : 500;

  const code =
    err.code ||
    (status === 400
      ? 'INVALID_REQUEST'
      : status === 401
        ? 'UNAUTHORIZED'
        : status === 403
          ? 'FORBIDDEN'
          : status === 404
            ? 'NOT_FOUND'
            : status === 409
              ? 'CONFLICT'
              : status === 429
                ? 'RATE_LIMIT_EXCEEDED'
                : 'INTERNAL_ERROR');

  const message = err.message || 'An unexpected error occurred';

  res.status(status).json({
    success: false,
    error: {
      code,
      message,
      ...(err.fields ? { fields: err.fields } : {}),
    },
  });
});
