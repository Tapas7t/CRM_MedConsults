import { UserModel, type IUserDocument } from '../user/user.model.js';
import { Doctor } from '../doctor/doctor.model.js';
import { Patient } from '../patient/patient.model.js';
import { Token } from '../token/token.model.js';
import { AuditLog } from '../auditLog/auditLog.model.js';
import { RotatedRefreshToken } from './rotatedToken.model.js';
import { hashPassword, comparePassword } from '../../utils/password.js';
import { hashToken, generateRandomToken } from '../../utils/tokenHash.js';
import { signAccess } from '../../utils/jwt.js';
import { emailService } from '../../services/email.service.js';
import { AppError } from '../../middleware/errorHandler.js';
import type { RegisterInput, RegisterDoctorInput, LoginInput } from './auth.schemas.js';

export class AuthService {
  /**
   * Registers a new patient, creates linked patient record, and sends verification email.
   */
  async register(input: RegisterInput, _ip?: string) {
    const existing = await UserModel.findOne({ email: input.email, isDeleted: false });
    if (existing) {
      throw new AppError(409, 'CONFLICT', 'An account with this email address already exists.');
    }

    const passwordHash = await hashPassword(input.password);
    const user = await UserModel.create({
      name: input.name,
      email: input.email,
      phone: input.phone,
      passwordHash,
      role: 'patient',
      status: 'active',
      emailVerified: false,
      failedLogins: 0,
      refreshTokenHashes: [],
    });

    // Create linked patient record with unique patientCode
    const patientCode = `P-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
    await Patient.create({
      userId: user._id,
      name: user.name,
      phone: user.phone || input.phone,
      email: user.email,
      source: 'website',
      status: 'active',
      whatsappOptIn: false,
      patientCode,
    });

    // Generate single-use verification token valid for 15 minutes
    const rawToken = generateRandomToken(48);
    const tokenHash = hashToken(rawToken);
    await Token.create({
      userId: user._id,
      type: 'verify',
      tokenHash,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });

    await emailService.sendVerificationEmail(user.email, user.name, rawToken);

    return {
      message: 'Registration successful. Please check your email to verify your account.',
      user: user.toJSON(),
    };
  }

  /**
   * Registers a doctor with pending approval status and sends verification email.
   */
  async registerDoctor(input: RegisterDoctorInput, _ip?: string) {
    const existing = await UserModel.findOne({ email: input.email, isDeleted: false });
    if (existing) {
      throw new AppError(409, 'CONFLICT', 'An account with this email address already exists.');
    }

    const passwordHash = await hashPassword(input.password);
    const user = await UserModel.create({
      name: input.name,
      email: input.email,
      phone: input.phone,
      passwordHash,
      role: 'doctor',
      status: 'pending',
      emailVerified: false,
      failedLogins: 0,
      refreshTokenHashes: [],
    });

    await Doctor.create({
      userId: user._id,
      specialty: input.specialty,
      qualifications: input.qualifications,
      registrationNo: input.registrationNo,
      experienceYears: input.experienceYears,
      languages: input.languages || ['English', 'Hindi'],
      consultationFee: input.consultationFee,
      clinicRoom: input.clinicRoom,
      bio: input.bio,
      approvalStatus: 'pending',
      isOnline: false,
      slotMinutes: 15,
      weeklyAvailability: [],
      blockedDates: [],
    });

    const rawToken = generateRandomToken(48);
    const tokenHash = hashToken(rawToken);
    await Token.create({
      userId: user._id,
      type: 'verify',
      tokenHash,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });

    await emailService.sendVerificationEmail(user.email, user.name, rawToken);

    return {
      message: 'Doctor registration submitted. Account is pending admin approval. Please verify your email.',
      user: user.toJSON(),
    };
  }

  /**
   * Consumes single-use verification token and marks user emailVerified = true.
   */
  async verifyEmail(token: string) {
    const tokenHash = hashToken(token);
    const tokenDoc = await Token.findOne({ tokenHash, type: 'verify' });

    if (!tokenDoc) {
      throw new AppError(400, 'INVALID_REQUEST', 'Verification token is invalid or has expired.');
    }

    if (tokenDoc.usedAt) {
      throw new AppError(400, 'INVALID_REQUEST', 'Verification token has already been used.');
    }

    if (tokenDoc.expiresAt < new Date()) {
      throw new AppError(400, 'INVALID_REQUEST', 'Verification token has expired.');
    }

    tokenDoc.usedAt = new Date();
    await tokenDoc.save();

    const user = await UserModel.findById(tokenDoc.userId);
    if (user) {
      user.emailVerified = true;
      await user.save();
    }

    return { message: 'Email verified successfully.' };
  }

  /**
   * Resends verification email, enforcing 60-second cooldown per user.
   */
  async resendVerification(email: string) {
    const genericResponse = {
      message: 'If that email is registered and unverified, a verification email has been sent.',
    };

    const user = await UserModel.findOne({ email, isDeleted: false });
    if (!user || user.emailVerified) {
      return genericResponse;
    }

    // Check 60-second cooldown on verification token creation
    const recentToken = await Token.findOne({ userId: user._id, type: 'verify' }).sort({
      createdAt: -1,
    });

    if (recentToken && recentToken.createdAt) {
      const elapsedMs = Date.now() - new Date(recentToken.createdAt).getTime();
      if (elapsedMs < 60 * 1000) {
        throw new AppError(
          429,
          'RATE_LIMIT_EXCEEDED',
          'Please wait 60 seconds before requesting another verification email.'
        );
      }
    }

    const rawToken = generateRandomToken(48);
    const tokenHash = hashToken(rawToken);
    await Token.create({
      userId: user._id,
      type: 'verify',
      tokenHash,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });

    await emailService.sendVerificationEmail(user.email, user.name, rawToken);

    return genericResponse;
  }

  /**
   * Authenticates user, tracks failed attempts, enforces 15-minute lockout on 5 failures,
   * returns access JWT and sets rotated refresh token.
   */
  async login(input: LoginInput, ip?: string) {
    const user = await UserModel.findOne({ email: input.email, isDeleted: false });

    // Prevent user enumeration: generic error for non-existent users
    if (!user) {
      throw new AppError(401, 'UNAUTHORIZED', 'Invalid email or password.');
    }

    // Check account lockout
    if (user.lockUntil && user.lockUntil > new Date()) {
      throw new AppError(
        423,
        'ACCOUNT_LOCKED',
        'Account is temporarily locked due to multiple failed login attempts. Please try again later.'
      );
    }

    // Check if blocked
    if (user.status === 'blocked') {
      throw new AppError(
        403,
        'FORBIDDEN',
        'User account is blocked. Please contact clinic administration.'
      );
    }

    const isMatch = await comparePassword(input.password, user.passwordHash);
    if (!isMatch) {
      user.failedLogins = (user.failedLogins || 0) + 1;

      if (user.failedLogins >= 5) {
        user.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
        user.failedLogins = 0;
        await user.save();

        await AuditLog.create({
          actorId: user._id,
          role: user.role,
          action: 'ACCOUNT_LOCKED',
          entityType: 'User',
          entityId: user._id.toString(),
          ip,
          meta: { reason: '5 failed login attempts' },
          at: new Date(),
        });

        throw new AppError(
          423,
          'ACCOUNT_LOCKED',
          'Account has been locked for 15 minutes due to 5 consecutive failed login attempts.'
        );
      }

      await user.save();
      throw new AppError(401, 'UNAUTHORIZED', 'Invalid email or password.');
    }

    // Successful login: reset failed counters
    user.failedLogins = 0;
    user.lockUntil = undefined;

    // Generate opaque 48-byte refresh token
    const rawRefreshToken = generateRandomToken(48);
    const refreshTokenHash = hashToken(rawRefreshToken);

    // Keep at most 5 active sessions per user
    user.refreshTokenHashes = [...user.refreshTokenHashes.slice(-4), refreshTokenHash];
    await user.save();

    await AuditLog.create({
      actorId: user._id,
      role: user.role,
      action: 'LOGIN_SUCCESS',
      entityType: 'User',
      entityId: user._id.toString(),
      ip,
      meta: {},
      at: new Date(),
    });

    let approvalStatus: string | undefined;
    if (user.role === 'doctor') {
      const doctor = await Doctor.findOne({ userId: user._id });
      approvalStatus = doctor?.approvalStatus;
    }

    const accessToken = signAccess({ userId: user._id.toString(), role: user.role });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      user: {
        _id: user._id.toString(),
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        emailVerified: user.emailVerified,
        status: user.status,
        ...(approvalStatus ? { approvalStatus } : {}),
      },
    };
  }

  /**
   * Rotates refresh token, invalidating the old one and returning a new access token.
   * If a previously rotated token is presented, revokes all sessions for that user.
   */
  async refresh(incomingRefreshToken: string, ip?: string) {
    if (!incomingRefreshToken) {
      throw new AppError(401, 'REFRESH_TOKEN_INVALID', 'Refresh token is required.');
    }

    const incomingHash = hashToken(incomingRefreshToken);
    const user = await UserModel.findOne({
      refreshTokenHashes: incomingHash,
      isDeleted: false,
    });

    if (!user) {
      // Check for token reuse in rotated tokens repository
      const rotatedRecord = await RotatedRefreshToken.findOne({ tokenHash: incomingHash });
      if (rotatedRecord) {
        // Token reuse detected! Revoke all sessions for the victim user
        const victimUser = await UserModel.findById(rotatedRecord.userId);
        if (victimUser) {
          victimUser.refreshTokenHashes = [];
          await victimUser.save();

          await AuditLog.create({
            actorId: victimUser._id,
            role: victimUser.role,
            action: 'LOGOUT_ALL_REVOKE',
            entityType: 'User',
            entityId: victimUser._id.toString(),
            ip,
            meta: { reason: 'Refresh token reuse detected' },
            at: new Date(),
          });
        }

        throw new AppError(
          401,
          'REFRESH_TOKEN_INVALID',
          'Refresh token was already rotated. All active sessions have been revoked for security.'
        );
      }

      throw new AppError(401, 'REFRESH_TOKEN_INVALID', 'Invalid refresh token.');
    }

    if (user.status === 'blocked') {
      throw new AppError(403, 'FORBIDDEN', 'User account is blocked.');
    }

    // Save old hash to rotated records
    await RotatedRefreshToken.create({
      userId: user._id,
      tokenHash: incomingHash,
    });

    // Invalidate old token and issue new token
    const remainingHashes = user.refreshTokenHashes.filter((h: string) => h !== incomingHash);
    const newRefreshToken = generateRandomToken(48);
    const newHash = hashToken(newRefreshToken);

    // Keep at most 5 active sessions
    user.refreshTokenHashes = [...remainingHashes.slice(-4), newHash];
    await user.save();

    const accessToken = signAccess({ userId: user._id.toString(), role: user.role });

    return {
      accessToken,
      refreshToken: newRefreshToken,
    };
  }

  /**
   * Logs out user by clearing the session's stored hash.
   */
  async logout(refreshToken?: string) {
    if (refreshToken) {
      const tokenHash = hashToken(refreshToken);
      await UserModel.updateOne(
        { refreshTokenHashes: tokenHash },
        { $pull: { refreshTokenHashes: tokenHash } }
      );
    }
    return { message: 'Logged out successfully.' };
  }

  /**
   * Requests password reset. Returns generic 200 message regardless of whether user exists.
   */
  async forgotPassword(email: string, _ip?: string) {
    const genericResponse = {
      message: 'If that email is registered, a password reset link has been sent.',
    };

    const user = await UserModel.findOne({ email, isDeleted: false });
    if (!user) {
      return genericResponse;
    }

    const rawToken = generateRandomToken(48);
    const tokenHash = hashToken(rawToken);

    await Token.create({
      userId: user._id,
      type: 'reset',
      tokenHash,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });

    await emailService.sendPasswordResetEmail(user.email, user.name, rawToken);

    return genericResponse;
  }

  /**
   * Resets password using single-use reset token and revokes all active sessions.
   */
  async resetPassword(token: string, newPassword: string, ip?: string) {
    const tokenHash = hashToken(token);
    const tokenDoc = await Token.findOne({ tokenHash, type: 'reset' });

    if (!tokenDoc) {
      throw new AppError(400, 'INVALID_REQUEST', 'Password reset token is invalid or has expired.');
    }

    if (tokenDoc.usedAt) {
      throw new AppError(400, 'INVALID_REQUEST', 'Password reset token has already been used.');
    }

    if (tokenDoc.expiresAt < new Date()) {
      throw new AppError(400, 'INVALID_REQUEST', 'Password reset token has expired.');
    }

    const user = await UserModel.findOne({ _id: tokenDoc.userId, isDeleted: false });
    if (!user) {
      throw new AppError(400, 'INVALID_REQUEST', 'Associated user account not found.');
    }

    tokenDoc.usedAt = new Date();
    await tokenDoc.save();

    user.passwordHash = await hashPassword(newPassword);
    // Revoke all sessions per spec
    user.refreshTokenHashes = [];
    user.failedLogins = 0;
    user.lockUntil = undefined;
    await user.save();

    await AuditLog.create({
      actorId: user._id,
      role: user.role,
      action: 'PASSWORD_RESET',
      entityType: 'User',
      entityId: user._id.toString(),
      ip,
      meta: {},
      at: new Date(),
    });

    return { message: 'Password reset successfully. Please log in with your new password.' };
  }
}

export const authService = new AuthService();
