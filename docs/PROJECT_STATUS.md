# MedConsults CRM Project Status

This document tracks implementation progress, build phases, operational procedures, technical decisions, and open items for MedConsults CRM.

## 1. Build Phases

| Phase | Scope | Exit Check | Status |
| --- | --- | --- | --- |
| 0 | Repo, git, env, Atlas ready | Both databases visible in Compass | Done |
| 1 | Backend skeleton: config, db, app, health, tests | /health returns ok; test passes | Done |
| 2 | Models and indexes | Models load; indexes created | Done |
| 3 | Auth, roles, email verification, lockout | Auth tests pass | Done |
| 4 | Doctors, patients, leads, appointments, queue | Module tests pass | In progress (users, doctors, patients done; leads, appointments, queue next) |
| 5 | Notes, tasks, activities, notifications, reports, audit | Tests pass; Postman collection runs | Not started |
| 6 | Frontend foundation: design tokens, layouts, auth, routing | Login works for all roles | Not started |
| 7 | Screens per role, wired to the API | Role flows work end to end | Not started |
| 8 | Live OPD queue (Socket.io), reminders (cron) | Queue updates without refresh | Not started |
| 9 | Cleanup pass, accessibility, SEO, privacy and terms pages | Cleanup list cleared | Not started |
| 10 | Deploy and final end-to-end test | Live demo works | Not started |

## 2. How to Run

All commands must be executed from the repository root:

- Start backend development server:
  npm --prefix backend run dev

- Start frontend development server:
  npm --prefix frontend run dev

- Run backend test suite (against test database):
  npm --prefix backend test

- Run TypeScript typecheck:
  npm --prefix backend run typecheck

- Synchronize MongoDB indexes:
  npm --prefix backend run db:indexes

- Seed development database with fictional demo accounts:
  npm --prefix backend run db:seed

- Reset and reseed development database (requires --confirm):
  npm --prefix backend run db:seed:reset -- --confirm

## 3. Architecture & Technical Decisions Log

- 2026-11-17: Database Isolation
  Two separate databases on a single MongoDB Atlas cluster: medconsults_crm for development and medconsults_crm_test for automated tests. Test suites connect exclusively to the test database and clean up collections between runs.

- 2026-11-17: Soft Delete Strategy
  Primary data models (User, Doctor, Patient, Lead, Appointment, Note, Task) implement isDeleted and deletedAt flags. Compound indexes pair isDeleted with frequent query attributes to optimize soft-deleted filtering.

- 2026-11-18: Opaque Random Token Architecture
  Refresh tokens, email verification tokens, and password reset tokens are 48-byte cryptographically secure random values (hex-encoded, 96 characters). Only their SHA-256 hash is persisted in the database. Bcrypt is avoided for tokens to prevent input truncation beyond 72 bytes.

- 2026-11-18: Refresh Token Rotation and Reuse Invalidation
  A dedicated RotatedRefreshToken collection tracks rotated refresh token hashes with a 7-day TTL index. If an already-rotated token is submitted to /api/v1/auth/refresh, all active sessions for that user are immediately revoked and an audit log entry is recorded.

- 2026-11-18: Development Email Fallback
  When SMTP settings are omitted in development or test environments, Nodemailer transmission is bypassed and email details (recipient, subject, body, token link) are output directly to the server console.

- 2026-11-18: Removal of JWT_REFRESH_SECRET
  Because refresh tokens are opaque random values rather than JSON Web Tokens, JWT_REFRESH_SECRET is obsolete and was removed from the environment schema, configuration examples, and documentation.

- 2026-11-18: Native Dependency Type Bundling
  Removed redundant @types/bcryptjs and @types/nodemailer packages after verifying that bcryptjs (version 3.0.3) and nodemailer (version 10.6.0) ship native TypeScript type definitions.

- 2026-11-18: Seed Script Safety and Idempotency Guardrails
  The database seed script strictly prohibits running in production or against the automated test database, and requires an explicit --confirm flag to wipe collections during reset. To avoid hardcoded secrets, it reads SEED_DEMO_PASSWORD from environment or generates a random demo password and prints it once. Seeding is idempotent and can run repeatedly without creating duplicates.

- 2026-11-18: Doctor Slot Computation in Asia/Kolkata
  Slot computation operates strictly within the Asia/Kolkata timezone (UTC+05:30) while persisting UTC timestamps. Free slots are derived from weekly availability minus blocked dates, minus active appointments (booked, checked_in, in_consultation, completed), minus times that have already elapsed today.

- 2026-11-18: Doctor Confidentiality and Patient Ownership Isolation
  A doctor may only read patient details and timeline if that doctor has an active or historical appointment with the patient; access attempts by other doctors return 404 NOT_FOUND rather than 403 to prevent record existence enumeration. Clinical notes and diagnoses are excluded from administrative and staff views.

## 4. Open Items & Decisions

- Production Email Provider: Final selection between Resend, Brevo, and standard Gmail SMTP when moving toward deployment.
- Home Page Variant: Selection of final landing page variant from design/ui-reference/ prior to frontend build.
- Patient Dashboard Variant: Selection of primary patient portal layout from design/ui-reference/.
- Real-time Architecture: Decision on Socket.io scaling and fallback strategy for phase 8.
