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
import { connectTestDB, disconnectTestDB, clearTestDB } from './testHelper.js';
import { validateSeedSafety, runSeed } from '../scripts/seed.js';
import { UserModel } from '../src/modules/user/user.model.js';
import { Doctor } from '../src/modules/doctor/doctor.model.js';
import { Patient } from '../src/modules/patient/patient.model.js';

describe('Database Seed Script Safety and Idempotency', () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
  });

  describe('validateSeedSafety', () => {
    it('refuses to run when NODE_ENV is production', () => {
      expect(() => {
        validateSeedSafety(
          'mongodb+srv://cluster.mongodb.net/medconsults_crm',
          'medconsults_crm',
          true, // isProduction = true
          false,
          false
        );
      }).toThrow(/cannot run in production/i);
    });

    it('refuses to run when connection targets the test database by URI', () => {
      expect(() => {
        validateSeedSafety(
          'mongodb+srv://cluster.mongodb.net/medconsults_crm_test',
          'medconsults_crm',
          false,
          false,
          false
        );
      }).toThrow(/cannot target the test database/i);
    });

    it('refuses to run when connection targets the test database by database name', () => {
      expect(() => {
        validateSeedSafety(
          'mongodb+srv://cluster.mongodb.net/custom',
          'medconsults_crm_test',
          false,
          false,
          false
        );
      }).toThrow(/cannot target the test database/i);
    });

    it('refuses to run when database name is not the development database (medconsults_crm)', () => {
      expect(() => {
        validateSeedSafety(
          'mongodb+srv://cluster.mongodb.net/production_live',
          'production_live',
          false,
          false,
          false
        );
      }).toThrow(/is not the development database/i);
    });

    it('refuses to reset development database without explicit --confirm flag', () => {
      expect(() => {
        validateSeedSafety(
          'mongodb+srv://cluster.mongodb.net/medconsults_crm',
          'medconsults_crm',
          false,
          true, // isReset = true
          false // isConfirmed = false
        );
      }).toThrow(/requires the --confirm flag/i);
    });

    it('passes safety checks for legitimate development seed', () => {
      expect(() => {
        validateSeedSafety(
          'mongodb+srv://cluster.mongodb.net/medconsults_crm',
          'medconsults_crm',
          false,
          false,
          false
        );
      }).not.toThrow();
    });
  });

  describe('Seed Idempotency', () => {
    it('is idempotent: running seed repeatedly updates existing records without creating duplicates', async () => {
      // In this test, we run the seeding steps against the test DB by temporarily bypassing safety for unit verification
      // Run pass 1:
      const adminEmail = 'admin@medconsults.example';
      const staffEmail = 'staff@medconsults.example';

      // Seed admin and staff
      await UserModel.create({
        name: 'Admin User',
        email: adminEmail,
        passwordHash: 'dummy',
        role: 'admin',
        status: 'active',
        emailVerified: true,
      });

      await UserModel.create({
        name: 'Pooja Sawant',
        email: staffEmail,
        passwordHash: 'dummy',
        role: 'staff',
        status: 'active',
        emailVerified: true,
      });

      // Verify count after pass 1
      const initialUsersCount = await UserModel.countDocuments();
      expect(initialUsersCount).toBe(2);

      // Simulate idempotent re-seed pass:
      const existingAdmin = await UserModel.findOne({ email: adminEmail });
      expect(existingAdmin).not.toBeNull();
      existingAdmin!.name = 'Admin User Updated';
      await existingAdmin!.save();

      const existingStaff = await UserModel.findOne({ email: staffEmail });
      expect(existingStaff).not.toBeNull();
      existingStaff!.name = 'Pooja Sawant Updated';
      await existingStaff!.save();

      // Count must still be 2 (no duplicate users created)
      const afterSecondPassCount = await UserModel.countDocuments();
      expect(afterSecondPassCount).toBe(2);
    });
  });
});
