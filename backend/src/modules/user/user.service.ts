import { UserModel, type IUserDocument } from './user.model.js';
import { Doctor } from '../doctor/doctor.model.js';
import { Patient } from '../patient/patient.model.js';
import { Token } from '../token/token.model.js';
import { AuditLog } from '../auditLog/auditLog.model.js';
import { hashPassword } from '../../utils/password.js';
import { hashToken, generateRandomToken } from '../../utils/tokenHash.js';
import { emailService } from '../../services/email.service.js';
import { AppError } from '../../middleware/errorHandler.js';
import type {
  UpdateMeInput,
  GetUsersQuery,
  CreateUserInput,
  UpdateUserInput,
} from './user.schemas.js';

export class UserService {
  /**
   * Retrieves profile for currently authenticated user.
   */
  async getMe(user: IUserDocument) {
    let approvalStatus: string | undefined;

    if (user.role === 'doctor') {
      const doctor = await Doctor.findOne({ userId: user._id, isDeleted: false });
      approvalStatus = doctor?.approvalStatus;
    }

    return {
      _id: user._id.toString(),
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      emailVerified: user.emailVerified,
      status: user.status,
      ...(approvalStatus ? { approvalStatus } : {}),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  /**
   * Updates profile for currently authenticated user.
   */
  async updateMe(user: IUserDocument, input: UpdateMeInput) {
    const { name, phone } = input;

    if (name !== undefined) {
      user.name = name;
    }
    if (phone !== undefined) {
      user.phone = phone;
    }

    await user.save();

    // If user is patient, sync name and phone to linked Patient record
    if (user.role === 'patient') {
      await Patient.updateOne(
        { userId: user._id },
        {
          $set: {
            ...(name !== undefined ? { name } : {}),
            ...(phone !== undefined ? { phone } : {}),
          },
        }
      );
    }

    let approvalStatus: string | undefined;
    if (user.role === 'doctor') {
      const doctor = await Doctor.findOne({ userId: user._id, isDeleted: false });
      approvalStatus = doctor?.approvalStatus;
    }

    return {
      _id: user._id.toString(),
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      emailVerified: user.emailVerified,
      status: user.status,
      ...(approvalStatus ? { approvalStatus } : {}),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  /**
   * Admin: List users with filters, search, and pagination.
   */
  async getUsers(query: GetUsersQuery) {
    const { role, status, q, page, limit } = query;
    const filter: Record<string, any> = { isDeleted: false };

    if (role) {
      filter.role = role;
    }
    if (status) {
      filter.status = status;
    }
    if (q) {
      const regex = new RegExp(q, 'i');
      filter.$or = [{ name: regex }, { email: regex }, { phone: regex }];
    }

    const skip = (page - 1) * limit;
    const [users, total] = await Promise.all([
      UserModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-passwordHash -refreshTokenHashes -__v'),
      UserModel.countDocuments(filter),
    ]);

    return {
      users,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Admin: Create staff or admin account with random temporary password,
   * sends password reset email so user sets their own credentials, and logs audit entry.
   */
  async createUser(input: CreateUserInput, actor: IUserDocument, ip?: string) {
    const existing = await UserModel.findOne({ email: input.email, isDeleted: false });
    if (existing) {
      throw new AppError(409, 'CONFLICT', 'An account with this email address already exists.');
    }

    // Generate random temporary password
    const tempPassword = generateRandomToken(32);
    const passwordHash = await hashPassword(tempPassword);

    const user = await UserModel.create({
      name: input.name,
      email: input.email,
      phone: input.phone,
      passwordHash,
      role: input.role,
      status: 'active',
      emailVerified: true,
      failedLogins: 0,
      refreshTokenHashes: [],
    });

    // Create password reset token for the new user so they set their own password
    const rawResetToken = generateRandomToken(48);
    const tokenHash = hashToken(rawResetToken);
    await Token.create({
      userId: user._id,
      type: 'reset',
      tokenHash,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours for initial setup
    });

    // Send password reset email
    await emailService.sendPasswordResetEmail(user.email, user.name, rawResetToken);

    // Audit log
    await AuditLog.create({
      actorId: actor._id,
      role: actor.role,
      action: 'USER_CREATED',
      entityType: 'User',
      entityId: user._id.toString(),
      ip,
      meta: { role: user.role, email: user.email },
      at: new Date(),
    });

    return user.toJSON();
  }

  /**
   * Admin: Update name, phone, or role of a user.
   * Enforces self-demotion prevention (CANNOT_SELF_DEMOTE).
   */
  async updateUser(id: string, input: UpdateUserInput, actor: IUserDocument, ip?: string) {
    // Prevent self-demotion
    if (actor._id.toString() === id && input.role !== undefined && input.role !== actor.role) {
      throw new AppError(403, 'CANNOT_SELF_DEMOTE', 'Administrators cannot change their own role.');
    }

    const user = await UserModel.findOne({ _id: id, isDeleted: false });
    if (!user) {
      throw new AppError(404, 'NOT_FOUND', 'User not found.');
    }

    if (input.name !== undefined) user.name = input.name;
    if (input.phone !== undefined) user.phone = input.phone;
    if (input.role !== undefined) user.role = input.role;

    await user.save();

    await AuditLog.create({
      actorId: actor._id,
      role: actor.role,
      action: 'USER_UPDATED',
      entityType: 'User',
      entityId: user._id.toString(),
      ip,
      meta: { updatedFields: Object.keys(input) },
      at: new Date(),
    });

    return user.toJSON();
  }

  /**
   * Admin: Block user account and revoke all active sessions.
   * Prevents self-blocking.
   */
  async blockUser(id: string, actor: IUserDocument, ip?: string) {
    if (actor._id.toString() === id) {
      throw new AppError(403, 'FORBIDDEN', 'Administrators cannot block their own account.');
    }

    const user = await UserModel.findOne({ _id: id, isDeleted: false });
    if (!user) {
      throw new AppError(404, 'NOT_FOUND', 'User not found.');
    }

    user.status = 'blocked';
    // Revoke all active sessions
    user.refreshTokenHashes = [];
    await user.save();

    // If user is a doctor, synchronize doctor presence
    if (user.role === 'doctor') {
      await Doctor.updateOne({ userId: user._id }, { $set: { isOnline: false } });
    }

    await AuditLog.create({
      actorId: actor._id,
      role: actor.role,
      action: 'USER_BLOCKED',
      entityType: 'User',
      entityId: user._id.toString(),
      ip,
      meta: { reason: 'Admin blocked account' },
      at: new Date(),
    });

    return {
      message: 'User blocked successfully and all active sessions revoked.',
    };
  }

  /**
   * Admin: Unblock user account.
   */
  async unblockUser(id: string, actor: IUserDocument, ip?: string) {
    const user = await UserModel.findOne({ _id: id, isDeleted: false });
    if (!user) {
      throw new AppError(404, 'NOT_FOUND', 'User not found.');
    }

    user.status = 'active';
    await user.save();

    await AuditLog.create({
      actorId: actor._id,
      role: actor.role,
      action: 'USER_UNBLOCKED',
      entityType: 'User',
      entityId: user._id.toString(),
      ip,
      meta: {},
      at: new Date(),
    });

    return {
      message: 'User unblocked successfully.',
    };
  }
}

export const userService = new UserService();
