import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_REQUEST'
  | 'UNAUTHORIZED'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_INVALID'
  | 'REFRESH_TOKEN_INVALID'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'ACCOUNT_LOCKED'
  | 'RATE_LIMIT_EXCEEDED'
  | 'CANNOT_SELF_DEMOTE'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly fields?: Record<string, string>;

  constructor(
    statusCode: number,
    code: ErrorCode,
    message: string,
    fields?: Record<string, string>
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.fields = fields;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // 1. Handled AppError instances
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.fields ? { fields: err.fields } : {}),
      },
    });
    return;
  }

  // 2. Zod validation errors
  if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of err.issues) {
      const fieldPath = issue.path.join('.');
      fields[fieldPath || 'root'] = issue.message;
    }
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        fields,
      },
    });
    return;
  }

  // 3. JWT expired error
  if (err && typeof err === 'object' && 'name' in err && err.name === 'TokenExpiredError') {
    res.status(401).json({
      success: false,
      error: {
        code: 'TOKEN_EXPIRED',
        message: 'Access token has expired',
      },
    });
    return;
  }

  // 4. JWT invalid / signature error
  if (err && typeof err === 'object' && 'name' in err && err.name === 'JsonWebTokenError') {
    res.status(401).json({
      success: false,
      error: {
        code: 'TOKEN_INVALID',
        message: 'Invalid access token',
      },
    });
    return;
  }

  // 5. MongoDB Duplicate Key Error (E11000)
  if (err && typeof err === 'object' && 'code' in err && (err as { code: unknown }).code === 11000) {
    res.status(409).json({
      success: false,
      error: {
        code: 'CONFLICT',
        message: 'A resource with this identifier already exists',
      },
    });
    return;
  }

  // 6. Fallback unhandled error
  const message =
    err instanceof Error ? err.message : 'An unexpected internal server error occurred';

  if (process.env.NODE_ENV !== 'test') {
    console.error('Unhandled Server Error:', err);
  }

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'production' ? 'An unexpected internal server error occurred' : message,
    },
  });
}
