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
import { Token } from '../src/modules/token/token.model.js';
import { AuditLog } from '../src/modules/auditLog/auditLog.model.js';
import { signAccess } from '../src/utils/jwt.js';
import { hashPassword } from '../src/utils/password.js';
import { hashToken } from '../src/utils/tokenHash.js';

describe('Users Module Integration Tests (Admin & Me)', () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
  });

  async function createTestUser(role: 'admin' | 'staff' | 'patient' | 'doctor', email: string, name = 'Test User') {
    const passwordHash = await hashPassword('SecurePassword123!');
    return UserModel.create({
      name,
      email,
      phone: '+919820000000',
      passwordHash,
      role,
      status: 'active',
      emailVerified: true,
      failedLogins: 0,
      refreshTokenHashes: [hashToken('initial-refresh-token')],
    });
  }

  describe('GET /api/v1/users', () => {
    it('allows admin to list users with filters, search, and pagination', async () => {
      const admin = await createTestUser('admin', 'admin@medconsults.example', 'Admin One');
      await createTestUser('staff', 'staff@medconsults.example', 'Pooja Sawant');
      await createTestUser('patient', 'patient@medconsults.example', 'Aarav Sharma');

      const adminToken = signAccess({ userId: admin._id.toString(), role: 'admin' });

      // 1. List all users
      const res = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.users.length).toBe(3);
      expect(res.body.data.pagination.total).toBe(3);

      // 2. Filter by role
      const staffRes = await request(app)
        .get('/api/v1/users?role=staff')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(staffRes.status).toBe(200);
      expect(staffRes.body.data.users.length).toBe(1);
      expect(staffRes.body.data.users[0].role).toBe('staff');

      // 3. Search by q
      const searchRes = await request(app)
        .get('/api/v1/users?q=Pooja')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(searchRes.status).toBe(200);
      expect(searchRes.body.data.users.length).toBe(1);
      expect(searchRes.body.data.users[0].name).toBe('Pooja Sawant');
    });

    it('returns 401 when unauthenticated and 403 for non-admin roles', async () => {
      const staff = await createTestUser('staff', 'staff@medconsults.example');
      const staffToken = signAccess({ userId: staff._id.toString(), role: 'staff' });

      // 401 without token
      const noAuthRes = await request(app).get('/api/v1/users');
      expect(noAuthRes.status).toBe(401);

      // 403 for staff
      const forbiddenRes = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(forbiddenRes.status).toBe(403);
    });
  });

  describe('POST /api/v1/users', () => {
    it('allows admin to create a staff account, generates password reset token, and writes audit log', async () => {
      const admin = await createTestUser('admin', 'admin@medconsults.example');
      const adminToken = signAccess({ userId: admin._id.toString(), role: 'admin' });

      const newStaff = {
        name: 'Sunil Gavaskar',
        email: 'sunil.g@medconsults.example',
        phone: '+919820123456',
        role: 'staff',
      };

      const res = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(newStaff);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe(newStaff.email);
      expect(res.body.data.user.role).toBe('staff');

      // Check DB
      const userInDb = await UserModel.findOne({ email: newStaff.email });
      expect(userInDb).not.toBeNull();
      expect(userInDb!.passwordHash).toBeDefined();

      // Check reset token was created for user
      const resetToken = await Token.findOne({ userId: userInDb!._id, type: 'reset' });
      expect(resetToken).not.toBeNull();

      // Check audit log
      const audit = await AuditLog.findOne({
        action: 'USER_CREATED',
        entityId: userInDb!._id.toString(),
      });
      expect(audit).not.toBeNull();
      expect(audit!.actorId?.toString()).toBe(admin._id.toString());
    });

    it('returns 400 for validation errors and 409 for duplicate email', async () => {
      const admin = await createTestUser('admin', 'admin@medconsults.example');
      const adminToken = signAccess({ userId: admin._id.toString(), role: 'admin' });

      // Disallowed role (e.g. creating patient through admin route)
      const badRoleRes = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Invalid Role User',
          email: 'invalid.role@medconsults.example',
          role: 'patient',
        });
      expect(badRoleRes.status).toBe(400);

      // Duplicate email conflict
      const dupRes = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Duplicate Admin',
          email: 'admin@medconsults.example',
          role: 'admin',
        });
      expect(dupRes.status).toBe(409);
    });
  });

  describe('PATCH /api/v1/users/:id', () => {
    it('updates name and phone, but prevents admin self-demotion (403 CANNOT_SELF_DEMOTE)', async () => {
      const admin = await createTestUser('admin', 'admin@medconsults.example');
      const staff = await createTestUser('staff', 'staff@medconsults.example');
      const adminToken = signAccess({ userId: admin._id.toString(), role: 'admin' });

      // Admin updates staff member
      const updateRes = await request(app)
        .patch(`/api/v1/users/${staff._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Pooja Sawant Updated',
          phone: '+919988776655',
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.user.name).toBe('Pooja Sawant Updated');

      // Admin attempts self-demotion
      const selfDemoteRes = await request(app)
        .patch(`/api/v1/users/${admin._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          role: 'staff',
        });

      expect(selfDemoteRes.status).toBe(403);
      expect(selfDemoteRes.body.error.code).toBe('CANNOT_SELF_DEMOTE');

      // 404 for non-existent user
      const notFoundRes = await request(app)
        .patch('/api/v1/users/507f1f77bcf86cd799439011')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Ghost' });
      expect(notFoundRes.status).toBe(404);
    });
  });

  describe('POST /api/v1/users/:id/block and /unblock', () => {
    it('blocks user, revokes all sessions, and prevents login until unblocked', async () => {
      const admin = await createTestUser('admin', 'admin@medconsults.example');
      const staff = await createTestUser('staff', 'staff@medconsults.example');
      const adminToken = signAccess({ userId: admin._id.toString(), role: 'admin' });

      // 1. Admin blocks staff
      const blockRes = await request(app)
        .post(`/api/v1/users/${staff._id}/block`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(blockRes.status).toBe(200);
      expect(blockRes.body.success).toBe(true);

      // Check DB: sessions revoked
      const updatedStaff = await UserModel.findById(staff._id);
      expect(updatedStaff!.status).toBe('blocked');
      expect(updatedStaff!.refreshTokenHashes).toHaveLength(0);

      // 2. Blocked staff cannot log in
      const loginRes = await request(app).post('/api/v1/auth/login').send({
        email: 'staff@medconsults.example',
        password: 'SecurePassword123!',
      });
      expect(loginRes.status).toBe(403);
      expect(loginRes.body.error.code).toBe('FORBIDDEN');

      // 3. Admin self-block attempt returns 403
      const selfBlockRes = await request(app)
        .post(`/api/v1/users/${admin._id}/block`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(selfBlockRes.status).toBe(403);

      // 4. Admin unblocks staff
      const unblockRes = await request(app)
        .post(`/api/v1/users/${staff._id}/unblock`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(unblockRes.status).toBe(200);

      const unblockedStaff = await UserModel.findById(staff._id);
      expect(unblockedStaff!.status).toBe('active');

      // 5. Staff can now log in
      const loginAfterUnblock = await request(app).post('/api/v1/auth/login').send({
        email: 'staff@medconsults.example',
        password: 'SecurePassword123!',
      });
      expect(loginAfterUnblock.status).toBe(200);
      expect(loginAfterUnblock.body.data.accessToken).toBeDefined();
    });
  });
});
