import { AppError } from '../middleware/errorHandler.js';
import type { UserRole } from '../types/index.js';

interface OwnershipCheckParams {
  resourceOwnerId: string | { toString(): string };
  currentUser: { _id: unknown; role: string };
  allowedRoles?: UserRole[];
  resourceName?: string;
}

/**
 * Checks if the current user owns the resource or has an allowed privileged role.
 * If not authorized, throws a 404 NOT_FOUND error (never 403) to prevent resource ID enumeration.
 */
export function checkOwnershipOrRole({
  resourceOwnerId,
  currentUser,
  allowedRoles = [],
  resourceName = 'Resource',
}: OwnershipCheckParams): void {
  const currentUserIdStr = currentUser._id?.toString() || '';
  const ownerIdStr =
    typeof resourceOwnerId === 'string'
      ? resourceOwnerId
      : resourceOwnerId?.toString() || '';

  const isOwner = currentUserIdStr === ownerIdStr;
  const hasPrivilegedRole = allowedRoles.includes(currentUser.role as UserRole);

  if (!isOwner && !hasPrivilegedRole) {
    throw new AppError(404, 'NOT_FOUND', `${resourceName} not found`);
  }
}
