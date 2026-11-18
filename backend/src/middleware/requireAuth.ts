import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { verifyAccess } from '../utils/jwt.js';
import { UserModel } from '../modules/user/user.model.js';
import { AppError } from './errorHandler.js';

/**
 * Middleware that verifies the Bearer access token from Authorization header.
 * Attaches the resolved user to req.user, rejects deleted/non-existent users with 401,
 * and rejects blocked users with 403 FORBIDDEN.
 */
export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError(
        401,
        'UNAUTHORIZED',
        'Authentication required. Missing or malformed Bearer token.'
      );
    }

    const token = authHeader.substring(7).trim();
    if (!token) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication token is empty.');
    }

    let payload;
    try {
      payload = verifyAccess(token);
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        throw new AppError(401, 'TOKEN_EXPIRED', 'Access token has expired.');
      }
      throw new AppError(401, 'TOKEN_INVALID', 'Invalid or tampered access token.');
    }

    const user = await UserModel.findOne({ _id: payload.userId, isDeleted: false });
    if (!user) {
      throw new AppError(401, 'UNAUTHORIZED', 'User session is invalid or user no longer exists.');
    }

    if (user.status === 'blocked') {
      throw new AppError(403, 'FORBIDDEN', 'Your account has been blocked. Please contact clinic administration.');
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}
