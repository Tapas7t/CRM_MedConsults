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
import { AuditLog } from '../src/modules/auditLog/auditLog.model.js';
import { signAccess } from '../src/utils/jwt.js';
import { hashPassword } from '../src/utils/password.js';

describe('Audit Logs Module Integration Tests', () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
  });

  async function createTestAdmin() {
    const passwordHash = await hashPassword('AdminPass123!');
    return UserModel.create({
      name: 'System Admin',
      email: 'admin@medconsults.example',
      passwordHash,
      role: 'admin',
      status: 'active',
      emailVerified: true,
      failedLogins: 0,
      refreshTokenHashes: [],
    });
  }

  it('allows admin to query audit logs with filters, date range, and pagination', async () => {
    const admin = await createTestAdmin();
    const adminToken = signAccess({ userId: admin._id.toString(), role: 'admin' });

    // Insert test audit logs across dates and actions
    await AuditLog.create([
      {
        actorId: admin._id,
        role: 'admin',
        action: 'DOCTOR_APPROVED',
        entityType: 'Doctor',
        entityId: '507f1f77bcf86cd799439011',
        at: new Date('2026-11-10T10:00:00Z'),
        meta: {},
      },
      {
        actorId: admin._id,
        role: 'admin',
        action: 'USER_BLOCKED',
        entityType: 'User',
        entityId: '507f1f77bcf86cd799439012',
        at: new Date('2026-11-15T12:00:00Z'),
        meta: {},
      },
      {
        actorId: admin._id,
        role: 'admin',
        action: 'PATIENT_VIEWED',
        entityType: 'Patient',
        entityId: '507f1f77bcf86cd799439013',
        at: new Date('2026-11-18T14:00:00Z'),
        meta: {},
      },
    ]);

    // 1. All audit logs
    const allRes = await request(app)
      .get('/api/v1/audit-logs')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(allRes.status).toBe(200);
    expect(allRes.body.success).toBe(true);
    expect(allRes.body.data.auditLogs).toHaveLength(3);
    expect(allRes.body.data.pagination.total).toBe(3);

    // 2. Filter by action
    const actionRes = await request(app)
      .get('/api/v1/audit-logs?action=DOCTOR_APPROVED')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(actionRes.status).toBe(200);
    expect(actionRes.body.data.auditLogs).toHaveLength(1);
    expect(actionRes.body.data.auditLogs[0].action).toBe('DOCTOR_APPROVED');

    // 3. Filter by entityType
    const entityRes = await request(app)
      .get('/api/v1/audit-logs?entityType=User')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(entityRes.status).toBe(200);
    expect(entityRes.body.data.auditLogs).toHaveLength(1);
    expect(entityRes.body.data.auditLogs[0].entityType).toBe('User');

    // 4. Filter by date range
    const dateRes = await request(app)
      .get('/api/v1/audit-logs?from=2026-11-14T00:00:00Z&to=2026-11-16T00:00:00Z')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(dateRes.status).toBe(200);
    expect(dateRes.body.data.auditLogs).toHaveLength(1);
    expect(dateRes.body.data.auditLogs[0].action).toBe('USER_BLOCKED');
  });

  it('rejects unauthenticated requests (401) and non-admin requests (403)', async () => {
    const passwordHash = await hashPassword('StaffPass123!');
    const staff = await UserModel.create({
      name: 'Staff Member',
      email: 'staff@medconsults.example',
      passwordHash,
      role: 'staff',
      status: 'active',
      emailVerified: true,
      failedLogins: 0,
      refreshTokenHashes: [],
    });
    const staffToken = signAccess({ userId: staff._id.toString(), role: 'staff' });

    // 401
    const unauthRes = await request(app).get('/api/v1/audit-logs');
    expect(unauthRes.status).toBe(401);

    // 403
    const forbiddenRes = await request(app)
      .get('/api/v1/audit-logs')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(forbiddenRes.status).toBe(403);
  });
});
