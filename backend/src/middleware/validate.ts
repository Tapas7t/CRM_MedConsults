import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from './errorHandler.js';

export interface ValidationSchemas {
  body?: z.ZodTypeAny;
  query?: z.ZodTypeAny;
  params?: z.ZodTypeAny;
}

/**
 * Validates request body, query, and/or params against Zod schemas.
 * Returns 400 VALIDATION_ERROR with structured { fields } if validation fails.
 */
export function validate(schemaOrOptions: z.ZodTypeAny | ValidationSchemas, defaultTarget: 'body' | 'query' | 'params' = 'body') {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const fields: Record<string, string> = {};

      if ('safeParseAsync' in schemaOrOptions) {
        // Single schema passed (e.g., validate(loginSchema))
        const result = await schemaOrOptions.safeParseAsync(req[defaultTarget]);
        if (!result.success) {
          for (const issue of result.error.issues) {
            const pathStr = issue.path.join('.');
            fields[pathStr || defaultTarget] = issue.message;
          }
        } else {
          (req as unknown as Record<string, unknown>)[defaultTarget] = result.data;
        }
      } else {
        // Object containing { body, query, params }
        if (schemaOrOptions.body) {
          const result = await schemaOrOptions.body.safeParseAsync(req.body);
          if (!result.success) {
            for (const issue of result.error.issues) {
              const pathStr = issue.path.join('.');
              fields[pathStr || 'body'] = issue.message;
            }
          } else {
            req.body = result.data;
          }
        }

        if (schemaOrOptions.query) {
          const result = await schemaOrOptions.query.safeParseAsync(req.query);
          if (!result.success) {
            for (const issue of result.error.issues) {
              const pathStr = issue.path.join('.');
              fields[pathStr || 'query'] = issue.message;
            }
          } else {
            req.query = result.data as any;
          }
        }

        if (schemaOrOptions.params) {
          const result = await schemaOrOptions.params.safeParseAsync(req.params);
          if (!result.success) {
            for (const issue of result.error.issues) {
              const pathStr = issue.path.join('.');
              fields[pathStr || 'params'] = issue.message;
            }
          } else {
            req.params = result.data as any;
          }
        }
      }

      if (Object.keys(fields).length > 0) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Validation failed', fields);
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
