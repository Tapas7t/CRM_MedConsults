import type { Request, Response, NextFunction } from 'express';
import type { UserRole } from '../types/index.js';
import { AppError } from './errorHandler.js';

/**
 * Restricts route access to specific user roles.
 * Returns 403 FORBIDDEN if the authenticated user's role is not authorized.
 */
export function roleGuard(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(
        new AppError(401, 'UNAUTHORIZED', 'Authentication required before checking role permissions.')
      );
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new AppError(
          403,
          'FORBIDDEN',
          `Access forbidden: requires one of [${allowedRoles.join(', ')}] role(s).`
        )
      );
    }

    next();
  };
}
