import dns from 'node:dns';

try {
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
  if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first');
  }
} catch {
  // Ignore
}

import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { UserModel } from '../src/modules/user/user.model.js';
import { Doctor } from '../src/modules/doctor/doctor.model.js';
import { Patient } from '../src/modules/patient/patient.model.js';
import { hashPassword } from '../src/utils/password.js';
import { generateRandomToken } from '../src/utils/tokenHash.js';

export interface SeedOptions {
  reset?: boolean;
  confirm?: boolean;
  overrideUri?: string;
  silent?: boolean;
}

/**
 * Validates safety conditions before running database seed or reset.
 */
export function validateSeedSafety(
  connectionUri: string,
  dbName: string | undefined,
  isProduction: boolean,
  isReset: boolean,
  isConfirmed: boolean
) {
  if (isProduction || process.env.NODE_ENV === 'production') {
    throw new Error('Safety violation: Seed script cannot run in production environment.');
  }

  // Refuse if connection targets the test database
  const normalizedUri = connectionUri.toLowerCase();
  const normalizedDb = (dbName || '').toLowerCase();

  if (
    normalizedUri.includes('medconsults_crm_test') ||
    normalizedDb === 'medconsults_crm_test' ||
    (env.MONGODB_URI_TEST && connectionUri === env.MONGODB_URI_TEST)
  ) {
    throw new Error('Safety violation: Seed script cannot target the test database.');
  }

  // Refuse if database name is not development database
  if (normalizedDb && normalizedDb !== 'medconsults_crm') {
    throw new Error(`Safety violation: Database name "${dbName}" is not the development database (medconsults_crm).`);
  }

  // Reset requires explicit confirmation flag
  if (isReset && !isConfirmed) {
    throw new Error('Safety violation: db:seed:reset wipes development collections and requires the --confirm flag.');
  }
}

const standardWeeklyAvailability = [1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
  dayOfWeek,
  slots: [
    { start: '09:00', end: '13:00' },
    { start: '16:00', end: '20:00' },
  ],
}));

export async function runSeed(options: SeedOptions = {}) {
  const uri = options.overrideUri || env.MONGODB_URI;
  const isReset = options.reset ?? process.argv.includes('--reset');
  const isConfirmed = options.confirm ?? process.argv.includes('--confirm');

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(uri);
  }

  const dbName = mongoose.connection.db?.databaseName;
  validateSeedSafety(
    uri,
    dbName,
    env.NODE_ENV === 'production',
    isReset,
    isConfirmed
  );

  if (!options.silent) {
    console.log(`Connected to database: ${dbName}`);
  }

  // If reset requested and confirmed, wipe development collections
  if (isReset) {
    if (!options.silent) {
      console.log('Wiping development collections...');
    }
    await UserModel.deleteMany({});
    await Doctor.deleteMany({});
    await Patient.deleteMany({});
  }

  // Determine demo password
  let demoPassword = env.SEED_DEMO_PASSWORD;
  let isGeneratedPassword = false;

  if (!demoPassword) {
    demoPassword = `Demo#${generateRandomToken(6)}!`;
    isGeneratedPassword = true;
  }

  const passwordHash = await hashPassword(demoPassword);

  // 1. Seed Admin
  const adminEmail = 'admin@medconsults.example';
  let admin = await UserModel.findOne({ email: adminEmail });
  if (!admin) {
    admin = await UserModel.create({
      name: 'Admin User',
      email: adminEmail,
      passwordHash,
      role: 'admin',
      status: 'active',
      emailVerified: true,
      failedLogins: 0,
      refreshTokenHashes: [],
    });
  } else {
    admin.name = 'Admin User';
    admin.passwordHash = passwordHash;
    admin.status = 'active';
    admin.emailVerified = true;
    await admin.save();
  }

  // 2. Seed Staff (Pooja Sawant)
  const staffEmail = 'staff@medconsults.example';
  let staff = await UserModel.findOne({ email: staffEmail });
  if (!staff) {
    staff = await UserModel.create({
      name: 'Pooja Sawant',
      email: staffEmail,
      phone: '+919820011001',
      passwordHash,
      role: 'staff',
      status: 'active',
      emailVerified: true,
      failedLogins: 0,
      refreshTokenHashes: [],
    });
  } else {
    staff.name = 'Pooja Sawant';
    staff.phone = '+919820011001';
    staff.passwordHash = passwordHash;
    staff.status = 'active';
    staff.emailVerified = true;
    await staff.save();
  }

  // 3. Seed 7 Approved Doctors
  const approvedDoctorsData = [
    {
      loginId: 'dr1',
      name: 'Dr. Rajesh Kulkarni',
      email: 'dr1@medconsults.example',
      phone: '+919820100001',
      specialty: 'Cardiology',
      qualifications: ['MBBS', 'MD (Medicine)', 'DM (Cardiology)'],
      registrationNo: 'MMC-DEMO-2010-001',
      experienceYears: 15,
      languages: ['English', 'Hindi', 'Marathi'],
      consultationFee: 1200,
      clinicRoom: 'Room 101',
      bio: 'Senior Cardiologist specializing in preventive cardiac interventions and hypertension.',
      slotMinutes: 15,
      isOnline: true,
    },
    {
      loginId: 'dr2',
      name: 'Dr. Priya Nair',
      email: 'dr2@medconsults.example',
      phone: '+919820100002',
      specialty: 'Dermatology',
      qualifications: ['MBBS', 'MD (Dermatology)'],
      registrationNo: 'MMC-DEMO-2014-002',
      experienceYears: 10,
      languages: ['English', 'Hindi', 'Malayalam'],
      consultationFee: 900,
      clinicRoom: 'Room 102',
      bio: 'Consultant Dermatologist with deep focus on clinical dermatology and pediatric skin care.',
      slotMinutes: 20,
      isOnline: false,
    },
    {
      loginId: 'dr3',
      name: 'Dr. Vikram Joshi',
      email: 'dr3@medconsults.example',
      phone: '+919820100003',
      specialty: 'Orthopedics',
      qualifications: ['MBBS', 'MS (Orthopedics)'],
      registrationNo: 'MMC-DEMO-2012-003',
      experienceYears: 12,
      languages: ['English', 'Hindi', 'Marathi'],
      consultationFee: 1100,
      clinicRoom: 'Room 103',
      bio: 'Specialist in joint preservation, sports injuries, and conservative arthritis care.',
      slotMinutes: 15,
      isOnline: true,
    },
    {
      loginId: 'dr4',
      name: 'Dr. Sunita Deshmukh',
      email: 'dr4@medconsults.example',
      phone: '+919820100004',
      specialty: 'Pediatrics',
      qualifications: ['MBBS', 'DCH', 'MD (Pediatrics)'],
      registrationNo: 'MMC-DEMO-2016-004',
      experienceYears: 8,
      languages: ['English', 'Hindi', 'Marathi'],
      consultationFee: 800,
      clinicRoom: 'Room 104',
      bio: 'Pediatrician dedicated to newborn wellness, immunizations, and developmental monitoring.',
      slotMinutes: 15,
      isOnline: false,
    },
    {
      loginId: 'dr5',
      name: 'Dr. Amit Patil',
      email: 'dr5@medconsults.example',
      phone: '+919820100005',
      specialty: 'General Medicine',
      qualifications: ['MBBS', 'MD (Internal Medicine)'],
      registrationNo: 'MMC-DEMO-2011-005',
      experienceYears: 14,
      languages: ['English', 'Hindi', 'Marathi', 'Gujarati'],
      consultationFee: 700,
      clinicRoom: 'Room 105',
      bio: 'Physician managing chronic metabolic diseases, diabetes, and infectious fever panels.',
      slotMinutes: 15,
      isOnline: true,
    },
    {
      loginId: 'dr6',
      name: 'Dr. Neha Kapoor',
      email: 'dr6@medconsults.example',
      phone: '+919820100006',
      specialty: 'Gynecology',
      qualifications: ['MBBS', 'MS (OBGYN)'],
      registrationNo: 'MMC-DEMO-2015-006',
      experienceYears: 9,
      languages: ['English', 'Hindi', 'Punjabi'],
      consultationFee: 1000,
      clinicRoom: 'Room 106',
      bio: 'Obstetrician and gynecologist providing adolescent health care and preventive maternal checks.',
      slotMinutes: 20,
      isOnline: false,
    },
    {
      loginId: 'dr7',
      name: 'Dr. Rohan Mehta',
      email: 'dr7@medconsults.example',
      phone: '+919820100007',
      specialty: 'ENT',
      qualifications: ['MBBS', 'MS (ENT)'],
      registrationNo: 'MMC-DEMO-2018-007',
      experienceYears: 6,
      languages: ['English', 'Hindi', 'Gujarati'],
      consultationFee: 750,
      clinicRoom: 'Room 107',
      bio: 'ENT surgeon with special clinical interest in sinus disorders and vertigo rehabilitation.',
      slotMinutes: 15,
      isOnline: true,
    },
  ];

  for (const docData of approvedDoctorsData) {
    let user = await UserModel.findOne({ email: docData.email });
    if (!user) {
      user = await UserModel.create({
        name: docData.name,
        email: docData.email,
        phone: docData.phone,
        passwordHash,
        role: 'doctor',
        status: 'active',
        emailVerified: true,
        failedLogins: 0,
        refreshTokenHashes: [],
      });
    } else {
      user.name = docData.name;
      user.phone = docData.phone;
      user.passwordHash = passwordHash;
      user.status = 'active';
      user.emailVerified = true;
      await user.save();
    }

    let doctor = await Doctor.findOne({ userId: user._id });
    if (!doctor) {
      await Doctor.create({
        userId: user._id,
        specialty: docData.specialty,
        qualifications: docData.qualifications,
        registrationNo: docData.registrationNo,
        experienceYears: docData.experienceYears,
        languages: docData.languages,
        consultationFee: docData.consultationFee,
        clinicRoom: docData.clinicRoom,
        bio: docData.bio,
        approvalStatus: 'approved',
        isOnline: docData.isOnline,
        lastSeenAt: docData.isOnline ? new Date() : undefined,
        slotMinutes: docData.slotMinutes,
        weeklyAvailability: standardWeeklyAvailability,
        blockedDates: [],
      });
    } else {
      doctor.specialty = docData.specialty;
      doctor.qualifications = docData.qualifications;
      doctor.registrationNo = docData.registrationNo;
      doctor.experienceYears = docData.experienceYears;
      doctor.languages = docData.languages;
      doctor.consultationFee = docData.consultationFee;
      doctor.clinicRoom = docData.clinicRoom;
      doctor.bio = docData.bio;
      doctor.approvalStatus = 'approved';
      doctor.isOnline = docData.isOnline;
      if (docData.isOnline) doctor.lastSeenAt = new Date();
      doctor.slotMinutes = docData.slotMinutes;
      doctor.weeklyAvailability = standardWeeklyAvailability;
      await doctor.save();
    }
  }

  // 4. Seed 1 Pending Doctor (to demo approvals)
  const pendingDocEmail = 'pending.dr@medconsults.example';
  let pendingUser = await UserModel.findOne({ email: pendingDocEmail });
  if (!pendingUser) {
    pendingUser = await UserModel.create({
      name: 'Dr. Aniket Shinde',
      email: pendingDocEmail,
      phone: '+919820100008',
      passwordHash,
      role: 'doctor',
      status: 'pending',
      emailVerified: true,
      failedLogins: 0,
      refreshTokenHashes: [],
    });
  } else {
    pendingUser.name = 'Dr. Aniket Shinde';
    pendingUser.status = 'pending';
    pendingUser.passwordHash = passwordHash;
    await pendingUser.save();
  }

  let pendingDoctor = await Doctor.findOne({ userId: pendingUser._id });
  if (!pendingDoctor) {
    await Doctor.create({
      userId: pendingUser._id,
      specialty: 'Neurology',
      qualifications: ['MBBS', 'DM (Neurology)'],
      registrationNo: 'MMC-DEMO-2020-008',
      experienceYears: 4,
      languages: ['English', 'Hindi', 'Marathi'],
      consultationFee: 1300,
      clinicRoom: 'Room 108',
      bio: 'Neurologist with training in migraine management and neuromuscular disorders.',
      approvalStatus: 'pending',
      isOnline: false,
      slotMinutes: 20,
      weeklyAvailability: standardWeeklyAvailability,
      blockedDates: [],
    });
  } else {
    pendingDoctor.approvalStatus = 'pending';
    await pendingDoctor.save();
  }

  // 5. Seed Patients
  // 5a. Demo Patient (verified email)
  const demoPatientEmail = 'patient@medconsults.example';
  let demoPatientUser = await UserModel.findOne({ email: demoPatientEmail });
  if (!demoPatientUser) {
    demoPatientUser = await UserModel.create({
      name: 'Aarav Sharma',
      email: demoPatientEmail,
      phone: '+919820112233',
      passwordHash,
      role: 'patient',
      status: 'active',
      emailVerified: true,
      failedLogins: 0,
      refreshTokenHashes: [],
    });
  } else {
    demoPatientUser.name = 'Aarav Sharma';
    demoPatientUser.phone = '+919820112233';
    demoPatientUser.passwordHash = passwordHash;
    demoPatientUser.emailVerified = true;
    await demoPatientUser.save();
  }

  let demoPatientDoc = await Patient.findOne({ patientCode: 'P-DEMO-0001' });
  if (!demoPatientDoc) {
    await Patient.create({
      userId: demoPatientUser._id,
      name: 'Aarav Sharma',
      phone: '+919820112233',
      email: demoPatientEmail,
      dob: new Date('1988-06-15'),
      gender: 'male',
      source: 'website',
      assignedStaffId: staff._id,
      status: 'active',
      whatsappOptIn: true,
      whatsappOptInAt: new Date(),
      patientCode: 'P-DEMO-0001',
    });
  } else {
    demoPatientDoc.userId = demoPatientUser._id;
    demoPatientDoc.phone = '+919820112233';
    demoPatientDoc.email = demoPatientEmail;
    await demoPatientDoc.save();
  }

  // 5b. Demo Patient (unverified email)
  const unverifiedPatientEmail = 'patient.unverified@medconsults.example';
  let unverifiedPatientUser = await UserModel.findOne({ email: unverifiedPatientEmail });
  if (!unverifiedPatientUser) {
    unverifiedPatientUser = await UserModel.create({
      name: 'Sneha Verma',
      email: unverifiedPatientEmail,
      phone: '+919820223344',
      passwordHash,
      role: 'patient',
      status: 'active',
      emailVerified: false,
      failedLogins: 0,
      refreshTokenHashes: [],
    });
  } else {
    unverifiedPatientUser.name = 'Sneha Verma';
    unverifiedPatientUser.phone = '+919820223344';
    unverifiedPatientUser.passwordHash = passwordHash;
    unverifiedPatientUser.emailVerified = false;
    await unverifiedPatientUser.save();
  }

  let unverifiedPatientDoc = await Patient.findOne({ patientCode: 'P-DEMO-0002' });
  if (!unverifiedPatientDoc) {
    await Patient.create({
      userId: unverifiedPatientUser._id,
      name: 'Sneha Verma',
      phone: '+919820223344',
      email: unverifiedPatientEmail,
      dob: new Date('1994-09-22'),
      gender: 'female',
      source: 'website',
      assignedStaffId: staff._id,
      status: 'active',
      whatsappOptIn: false,
      patientCode: 'P-DEMO-0002',
    });
  } else {
    unverifiedPatientDoc.userId = unverifiedPatientUser._id;
    await unverifiedPatientDoc.save();
  }

  // 5c. 10 CRM Patient Records (Without user logins)
  const crmPatients = [
    { code: 'P-DEMO-0003', name: 'Ramesh Gupta', phone: '+919820334455', email: 'ramesh.gupta@medconsults.example', gender: 'male', dob: '1975-03-12', source: 'walk_in', optIn: true },
    { code: 'P-DEMO-0004', name: 'Meera Iyer', phone: '+919820445566', email: 'meera.iyer@medconsults.example', gender: 'female', dob: '1982-11-04', source: 'referral', optIn: false },
    { code: 'P-DEMO-0005', name: 'Suresh Bhatt', phone: '+919820556677', email: 'suresh.bhatt@medconsults.example', gender: 'male', dob: '1968-07-29', source: 'phone', optIn: true },
    { code: 'P-DEMO-0006', name: 'Kavita Shah', phone: '+919820667788', email: 'kavita.shah@medconsults.example', gender: 'female', dob: '1990-01-18', source: 'website', optIn: true },
    { code: 'P-DEMO-0007', name: 'Sanjay More', phone: '+919820778899', email: 'sanjay.more@medconsults.example', gender: 'male', dob: '1985-05-25', source: 'walk_in', optIn: false },
    { code: 'P-DEMO-0008', name: 'Deepa Choudhury', phone: '+919820889900', email: 'deepa.c@medconsults.example', gender: 'female', dob: '1992-08-30', source: 'referral', optIn: true },
    { code: 'P-DEMO-0009', name: 'Ananya Sen', phone: '+919820990011', email: 'ananya.sen@medconsults.example', gender: 'female', dob: '1980-12-14', source: 'website', optIn: true },
    { code: 'P-DEMO-0010', name: 'Manoj Kamat', phone: '+919820001122', email: 'manoj.k@medconsults.example', gender: 'male', dob: '1972-04-05', source: 'walk_in', optIn: false },
    { code: 'P-DEMO-0011', name: 'Ritu Pillai', phone: '+919820112244', email: 'ritu.p@medconsults.example', gender: 'female', dob: '1995-10-10', source: 'phone', optIn: true },
    { code: 'P-DEMO-0012', name: 'Arjun Chavan', phone: '+919820223355', email: 'arjun.c@medconsults.example', gender: 'male', dob: '1987-02-19', source: 'walk_in', optIn: false },
  ];

  for (const cp of crmPatients) {
    let p = await Patient.findOne({ patientCode: cp.code });
    if (!p) {
      await Patient.create({
        name: cp.name,
        phone: cp.phone,
        email: cp.email,
        gender: cp.gender,
        dob: new Date(cp.dob),
        source: cp.source,
        assignedStaffId: staff._id,
        status: 'active',
        whatsappOptIn: cp.optIn,
        whatsappOptInAt: cp.optIn ? new Date() : undefined,
        patientCode: cp.code,
      });
    } else {
      p.name = cp.name;
      p.phone = cp.phone;
      p.email = cp.email;
      p.whatsappOptIn = cp.optIn;
      await p.save();
    }
  }

  if (!options.silent) {
    console.log('\n--- Seed Execution Completed Successfully ---');
    console.log('Seeded Accounts:');
    console.log(`  Admin:        ${adminEmail}`);
    console.log(`  Staff:        ${staffEmail} (Pooja Sawant)`);
    console.log(`  Doctors:      7 approved (dr1..dr7@medconsults.example), 1 pending (pending.dr@medconsults.example)`);
    console.log(`  Patients:     12 total (1 verified, 1 unverified, 10 CRM walk-in/referrals)`);

    if (isGeneratedPassword) {
      console.log('\n======================================================');
      console.log('Demo accounts seeded with generated password:');
      console.log(`  ${demoPassword}`);
      console.log('======================================================\n');
    } else {
      console.log('\nDemo accounts seeded using SEED_DEMO_PASSWORD from environment.');
    }
  }

  return {
    adminEmail,
    staffEmail,
    demoPassword,
  };
}

// Standalone execution entrypoint
if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  runSeed()
    .then(async () => {
      await mongoose.disconnect();
      process.exit(0);
    })
    .catch((err) => {
      console.error('\nSeed script error:', err.message);
      process.exit(1);
    });
}
