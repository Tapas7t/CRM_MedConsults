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

    it('refuses to run when runSeed is invoked against the test database without bypass', async () => {
      await expect(runSeed({ silent: true })).rejects.toThrow(/cannot target the test database/i);
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
    it('is idempotent: running seed script twice creates zero duplicates and updates existing records', async () => {
      // Pass 1: Run full seed script
      await runSeed({ skipSafetyCheckForTesting: true, silent: true });

      const usersAfterPass1 = await UserModel.countDocuments();
      const doctorsAfterPass1 = await Doctor.countDocuments();
      const patientsAfterPass1 = await Patient.countDocuments();

      expect(usersAfterPass1).toBeGreaterThan(0);
      expect(doctorsAfterPass1).toBeGreaterThan(0);
      expect(patientsAfterPass1).toBeGreaterThan(0);

      // Pass 2: Run full seed script a second time
      await runSeed({ skipSafetyCheckForTesting: true, silent: true });

      const usersAfterPass2 = await UserModel.countDocuments();
      const doctorsAfterPass2 = await Doctor.countDocuments();
      const patientsAfterPass2 = await Patient.countDocuments();

      // Counts must be identical: zero duplicate records created
      expect(usersAfterPass2).toBe(usersAfterPass1);
      expect(doctorsAfterPass2).toBe(doctorsAfterPass1);
      expect(patientsAfterPass2).toBe(patientsAfterPass1);
    });
  });
});
