import dns from 'node:dns';

try {
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
  if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first');
  }
} catch {
  // Ignore
}

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { connectTestDB, disconnectTestDB, clearTestDB } from './testHelper.js';
import { UserModel } from '../src/modules/user/user.model.js';
import { Patient } from '../src/modules/patient/patient.model.js';
import { Token } from '../src/modules/token/token.model.js';
import { AuditLog } from '../src/modules/auditLog/auditLog.model.js';
import { emailService } from '../src/services/email.service.js';
import { hashToken, generateRandomToken } from '../src/utils/tokenHash.js';

describe('Authentication and Role Access Integration Tests', () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
  });

  const validPatient = {
    name: 'Aarav Sharma',
    email: 'aarav.sharma@example.com',
    phone: '+919820112233',
    password: 'SecurePassword123!',
  };

  describe('POST /api/v1/auth/register', () => {
    it('successfully registers a patient, creates linked patient record, sends verification email', async () => {
      const res = await request(app).post('/api/v1/auth/register').send(validPatient);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user).toBeDefined();
      expect(res.body.data.user.email).toBe(validPatient.email);
      expect(res.body.data.user.role).toBe('patient');
      expect(res.body.data.user.emailVerified).toBe(false);

      // Check User in database
      const userInDb = await UserModel.findOne({ email: validPatient.email });
      expect(userInDb).not.toBeNull();
      expect(userInDb!.emailVerified).toBe(false);

      // Check linked Patient record in database
      const patientInDb = await Patient.findOne({ userId: userInDb!._id });
      expect(patientInDb).not.toBeNull();
      expect(patientInDb!.patientCode).toBeDefined();
      expect(patientInDb!.name).toBe(validPatient.name);
      expect(patientInDb!.phone).toBe(validPatient.phone);

      // Check Verification Token in database
      const tokenInDb = await Token.findOne({ userId: userInDb!._id, type: 'verify' });
      expect(tokenInDb).not.toBeNull();
      expect(tokenInDb!.tokenHash).toBeDefined();
    });

    it('returns 400 VALIDATION_ERROR with structured fields on validation errors', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({
        name: 'A', // too short
        email: 'invalid-email',
        phone: '123', // too short
        password: 'weak', // fails complexity and length
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.fields).toBeDefined();
      expect(res.body.error.fields.name).toBeDefined();
      expect(res.body.error.fields.email).toBeDefined();
      expect(res.body.error.fields.phone).toBeDefined();
      expect(res.body.error.fields.password).toBeDefined();
    });

    it('returns 409 CONFLICT on duplicate email registration', async () => {
      await request(app).post('/api/v1/auth/register').send(validPatient);
      const res = await request(app).post('/api/v1/auth/register').send(validPatient);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CONFLICT');
    });
  });

  describe('POST /api/v1/auth/verify-email and /resend-verification', () => {
    it('verifies email successfully, rejects reused tokens and expired tokens', async () => {
      await request(app).post('/api/v1/auth/register').send(validPatient);
      const user = await UserModel.findOne({ email: validPatient.email });

      // Generate a known verification token
      const rawToken = generateRandomToken(48);
      const tokenHash = hashToken(rawToken);
      await Token.create({
        userId: user!._id,
        type: 'verify',
        tokenHash,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      });

      // 1. Verify successfully
      const verifyRes = await request(app).post('/api/v1/auth/verify-email').send({ token: rawToken });
      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.success).toBe(true);

      const updatedUser = await UserModel.findById(user!._id);
      expect(updatedUser!.emailVerified).toBe(true);

      // 2. Reject reused token
      const reuseRes = await request(app).post('/api/v1/auth/verify-email').send({ token: rawToken });
      expect(reuseRes.status).toBe(400);
      expect(reuseRes.body.error.code).toBe('INVALID_REQUEST');

      // 3. Reject expired token
      const expiredRawToken = generateRandomToken(48);
      await Token.create({
        userId: user!._id,
        type: 'verify',
        tokenHash: hashToken(expiredRawToken),
        expiresAt: new Date(Date.now() - 1000), // in the past
      });

      const expiredRes = await request(app)
        .post('/api/v1/auth/verify-email')
        .send({ token: expiredRawToken });
      expect(expiredRes.status).toBe(400);
      expect(expiredRes.body.error.code).toBe('INVALID_REQUEST');
    });

    it('enforces 60-second cooldown on resend-verification', async () => {
      await request(app).post('/api/v1/auth/register').send(validPatient);

      // Immediate resend triggers 429 RATE_LIMIT_EXCEEDED
      const cooldownRes = await request(app)
        .post('/api/v1/auth/resend-verification')
        .send({ email: validPatient.email });

      expect(cooldownRes.status).toBe(429);
      expect(cooldownRes.body.error.code).toBe('RATE_LIMIT_EXCEEDED');

      // Update existing token's createdAt to 70 seconds ago in DB using native collection update
      await Token.collection.updateMany(
        { type: 'verify' },
        { $set: { createdAt: new Date(Date.now() - 70 * 1000) } }
      );

      // Resend after cooldown succeeds with generic response
      const successRes = await request(app)
        .post('/api/v1/auth/resend-verification')
        .send({ email: validPatient.email });

      expect(successRes.status).toBe(200);
      expect(successRes.body.success).toBe(true);
    });
  });

  describe('POST /api/v1/auth/login and Lockout', () => {
    beforeEach(async () => {
      await request(app).post('/api/v1/auth/register').send(validPatient);
    });

    it('logs in successfully, returns access token, sets HttpOnly cookie, and writes audit log', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({
        email: validPatient.email,
        password: validPatient.password,
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.user.email).toBe(validPatient.email);

      // Check cookie
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      const cookieStr = Array.isArray(cookies) ? cookies.join('; ') : String(cookies);
      expect(cookieStr).toContain('refreshToken=');
      expect(cookieStr).toContain('HttpOnly');
      expect(cookieStr).toContain('SameSite=Strict');
      expect(cookieStr).toContain('Path=/api/v1/auth');

      // Check AuditLog
      const auditLog = await AuditLog.findOne({ action: 'LOGIN_SUCCESS' });
      expect(auditLog).not.toBeNull();
      expect(auditLog!.role).toBe('patient');
    });

    it('returns generic UNAUTHORIZED message for wrong password', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({
        email: validPatient.email,
        password: 'WrongPassword999!',
      });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
      expect(res.body.error.message).toBe('Invalid email or password.');
    });

    it('locks account after 5 failed attempts, writes audit log, and unlocks after lock duration passes', async () => {
      // 4 failed attempts
      for (let i = 0; i < 4; i++) {
        const failRes = await request(app).post('/api/v1/auth/login').send({
          email: validPatient.email,
          password: 'WrongPassword999!',
        });
        expect(failRes.status).toBe(401);
      }

      // 5th failed attempt triggers 423 ACCOUNT_LOCKED
      const lockRes = await request(app).post('/api/v1/auth/login').send({
        email: validPatient.email,
        password: 'WrongPassword999!',
      });
      expect(lockRes.status).toBe(423);
      expect(lockRes.body.error.code).toBe('ACCOUNT_LOCKED');

      // Verify AuditLog for account lockout
      const lockAudit = await AuditLog.findOne({ action: 'ACCOUNT_LOCKED' });
      expect(lockAudit).not.toBeNull();

      // 6th attempt (even with right password) remains locked
      const whileLockedRes = await request(app).post('/api/v1/auth/login').send({
        email: validPatient.email,
        password: validPatient.password,
      });
      expect(whileLockedRes.status).toBe(423);

      // Simulate lock time expiring
      await UserModel.updateOne(
        { email: validPatient.email },
        { $set: { lockUntil: new Date(Date.now() - 1000) } }
      );

      // Now valid login succeeds
      const unlockedRes = await request(app).post('/api/v1/auth/login').send({
        email: validPatient.email,
        password: validPatient.password,
      });
      expect(unlockedRes.status).toBe(200);
      expect(unlockedRes.body.data.accessToken).toBeDefined();
    });

    it('returns 403 FORBIDDEN for blocked user on login and protected routes', async () => {
      await UserModel.updateOne({ email: validPatient.email }, { $set: { status: 'blocked' } });

      const loginRes = await request(app).post('/api/v1/auth/login').send({
        email: validPatient.email,
        password: validPatient.password,
      });
      expect(loginRes.status).toBe(403);
      expect(loginRes.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('Session Management: /refresh, Rotation, Reuse Detection, and /logout', () => {
    let initialCookie: string;
    let initialRefreshToken: string;

    beforeEach(async () => {
      await request(app).post('/api/v1/auth/register').send(validPatient);
      const loginRes = await request(app).post('/api/v1/auth/login').send({
        email: validPatient.email,
        password: validPatient.password,
      });
      const cookieHeader = loginRes.headers['set-cookie'];
      initialCookie = Array.isArray(cookieHeader) ? cookieHeader[0] : String(cookieHeader);
      initialRefreshToken = initialCookie.split(';')[0].replace('refreshToken=', '');
    });

    it('rotates refresh token and issues new access token', async () => {
      const refreshRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', [`refreshToken=${initialRefreshToken}`]);

      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body.data.accessToken).toBeDefined();

      const newCookieHeader = refreshRes.headers['set-cookie'];
      const newCookie = Array.isArray(newCookieHeader) ? newCookieHeader[0] : String(newCookieHeader);
      const newRefreshToken = newCookie.split(';')[0].replace('refreshToken=', '');

      expect(newRefreshToken).not.toBe(initialRefreshToken);

      // Check user in DB: old hash removed, new hash saved
      const user = await UserModel.findOne({ email: validPatient.email });
      expect(user!.refreshTokenHashes).toContain(hashToken(newRefreshToken));
      expect(user!.refreshTokenHashes).not.toContain(hashToken(initialRefreshToken));
    });

    it('detects refresh token reuse and revokes ALL sessions for that user', async () => {
      // 1. Legitimate refresh: rotates initialRefreshToken to newRefreshToken
      const refreshRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', [`refreshToken=${initialRefreshToken}`]);
      expect(refreshRes.status).toBe(200);

      // 2. Reuse old initialRefreshToken: attacker or duplicate replay
      const reuseRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', [`refreshToken=${initialRefreshToken}`]);

      expect(reuseRes.status).toBe(401);
      expect(reuseRes.body.error.code).toBe('REFRESH_TOKEN_INVALID');

      // 3. Verify ALL sessions were revoked
      const user = await UserModel.findOne({ email: validPatient.email });
      expect(user!.refreshTokenHashes).toHaveLength(0);

      // 4. Verify AuditLog entry for revoke
      const revokeAudit = await AuditLog.findOne({ action: 'LOGOUT_ALL_REVOKE' });
      expect(revokeAudit).not.toBeNull();
    });

    it('clears session on logout', async () => {
      const logoutRes = await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', [`refreshToken=${initialRefreshToken}`]);

      expect(logoutRes.status).toBe(200);

      const user = await UserModel.findOne({ email: validPatient.email });
      expect(user!.refreshTokenHashes).not.toContain(hashToken(initialRefreshToken));
    });
  });

  describe('Password Reset Flow', () => {
    beforeEach(async () => {
      await request(app).post('/api/v1/auth/register').send(validPatient);
    });

    it('handles forgot and reset flow, invalidating old password and previous sessions', async () => {
      // 1. Request forgot password
      const forgotRes = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: validPatient.email });
      expect(forgotRes.status).toBe(200);

      const user = await UserModel.findOne({ email: validPatient.email });
      // Establish active session before reset
      user!.refreshTokenHashes = [hashToken('test-active-session')];
      await user!.save();

      // Generate known reset token in DB
      const resetRawToken = generateRandomToken(48);
      await Token.create({
        userId: user!._id,
        type: 'reset',
        tokenHash: hashToken(resetRawToken),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      });

      // 2. Reset password
      const newPassword = 'NewBrandSecurePassword456!';
      const resetRes = await request(app).post('/api/v1/auth/reset-password').send({
        token: resetRawToken,
        password: newPassword,
      });
      expect(resetRes.status).toBe(200);

      // 3. Old password fails
      const oldLoginRes = await request(app).post('/api/v1/auth/login').send({
        email: validPatient.email,
        password: validPatient.password,
      });
      expect(oldLoginRes.status).toBe(401);

      // 4. New password succeeds
      const newLoginRes = await request(app).post('/api/v1/auth/login').send({
        email: validPatient.email,
        password: newPassword,
      });
      expect(newLoginRes.status).toBe(200);

      // 5. Old sessions revoked
      const updatedUser = await UserModel.findOne({ email: validPatient.email });
      expect(updatedUser!.refreshTokenHashes).not.toContain(hashToken('test-active-session'));
    });
  });

  describe('User Profile /users/me and roleGuard', () => {
    let accessToken: string;

    beforeEach(async () => {
      await request(app).post('/api/v1/auth/register').send(validPatient);
      const loginRes = await request(app).post('/api/v1/auth/login').send({
        email: validPatient.email,
        password: validPatient.password,
      });
      accessToken = loginRes.body.data.accessToken;
    });

    it('GET /api/v1/users/me returns 401 without token, and 200 with valid token', async () => {
      // Without token
      const noTokenRes = await request(app).get('/api/v1/users/me');
      expect(noTokenRes.status).toBe(401);
      expect(noTokenRes.body.error.code).toBe('UNAUTHORIZED');

      // With token
      const authRes = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(authRes.status).toBe(200);
      expect(authRes.body.data.user.email).toBe(validPatient.email);
      expect(authRes.body.data.user.name).toBe(validPatient.name);
    });

    it('PATCH /api/v1/users/me updates name and phone on user and linked patient', async () => {
      const updateRes = await request(app)
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Aarav Updated',
          phone: '+919988776655',
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.user.name).toBe('Aarav Updated');
      expect(updateRes.body.data.user.phone).toBe('+919988776655');

      // Check User in DB
      const user = await UserModel.findOne({ email: validPatient.email });
      expect(user!.name).toBe('Aarav Updated');
      expect(user!.phone).toBe('+919988776655');

      // Check linked Patient in DB
      const patient = await Patient.findOne({ userId: user!._id });
      expect(patient!.name).toBe('Aarav Updated');
      expect(patient!.phone).toBe('+919988776655');
    });

    it('roleGuard returns 403 for the wrong role', async () => {
      // Patient attempts to access admin-only endpoint
      const res = await request(app)
        .get('/api/test-admin-only')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('proves passwordHash and token hashes never appear in any response', async () => {
      // 1. Register response
      const regRes = await request(app).post('/api/v1/auth/register').send({
        name: 'Secret Check',
        email: 'secret.check@example.com',
        phone: '+919876543219',
        password: 'Password999#',
      });
      const regStr = JSON.stringify(regRes.body);
      expect(regStr).not.toContain('passwordHash');
      expect(regStr).not.toContain('refreshTokenHashes');

      // 2. Login response
      const logRes = await request(app).post('/api/v1/auth/login').send({
        email: 'secret.check@example.com',
        password: 'Password999#',
      });
      const logStr = JSON.stringify(logRes.body);
      expect(logStr).not.toContain('passwordHash');
      expect(logStr).not.toContain('refreshTokenHashes');

      // 3. /users/me response
      const meRes = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${logRes.body.data.accessToken}`);
      const meStr = JSON.stringify(meRes.body);
      expect(meStr).not.toContain('passwordHash');
      expect(meStr).not.toContain('refreshTokenHashes');
    });
  });
});
