# MedConsults CRM - Product Requirements and Technical Spec

Version 2.0. Single-clinic CRM and OPD booking platform. Portfolio project: demo data only, no real patients. Save in the repo as `docs/PROJECT_SPEC.md`. This replaces the earlier short spec.

## 1. Product overview

MedConsults began as an in-clinic doctor booking app. It becomes a CRM for ONE clinic (Bandra West, Mumbai in the designs). The clinic captures enquiries as leads, turns them into patients, books them with doctors, runs a live OPD queue, tracks follow-ups, and reports on performance. Patients book online and pay at the clinic (no advance payment).

**Goals**

- G1: Four working roles (patient, doctor, staff/reception, admin) with strict permissions.
- G2: A leads pipeline, Patient 360 page, tasks and follow-ups, and an activity timeline.
- G3: Appointment booking with no double-booking and a digital OPD queue token.
- G4: Every API endpoint documented and tested (success, validation, 401, 403, 404, 409).
- G5: UI that matches the UI reference designs in `design/ui-reference/`.

**Non-goals**

Online payments, video or tele-consults, multi-clinic or multi-city, real SMS or WhatsApp sending, ABHA or other government integrations, e-prescription signing, insurance billing, native mobile apps. The app makes no compliance or certification claims.

**Done means:** the seed script builds a clean demo, all four roles complete their main flows, all tests pass on a separate test database, `npm audit` has no high or critical issues, and the app is deployed.

## 2. Roles and permissions

| Capability | Patient | Doctor | Staff | Admin |
| --- | --- | --- | --- | --- |
| Register, verify email, log in | Yes | Yes (needs admin approval) | Created by admin | Seeded |
| Browse doctors, book and cancel own appointments | Yes | - | - | - |
| See own appointments, OPD pass, shared notes | Yes | - | - | - |
| See own schedule, queue, assigned patients | - | Yes | - | - |
| Write and read clinical notes | Shared notes only | Own patients | No | No |
| Set own availability and online status | - | Yes | - | - |
| Manage leads, patients, walk-ins, appointments for all doctors | - | - | Yes | Yes |
| Tasks and follow-ups | - | Own | Yes | Yes |
| Approve or block doctors, manage users | - | - | - | Yes |
| Reports | - | Own stats | Basic | Full |
| Audit log | - | - | - | Yes |

Privacy rule: staff and admin see appointment status and contact details, never diagnosis or clinical notes. Only the treating doctor and the patient (for notes marked shared) see them.

## 3. Architecture and stack

Decision: a monorepo with a separate Express API (`backend/`) and a React SPA (`frontend/`), following the project blueprint. The API can then be tested on its own with Postman and Vitest before any screen exists.

| Layer | Choice |
| --- | --- |
| Runtime | Node.js, current Active LTS |
| API | Express 5 + TypeScript (strict) |
| Database | MongoDB Atlas (free M0), Mongoose |
| Validation | Zod (env, body, query, params) |
| Auth | Email + password. Google OAuth is optional, later. JWT access (15 min) in the Authorization header; refresh (7 days) in an HttpOnly, Secure, SameSite=Strict cookie, rotated, stored hashed |
| Security | helmet, cors (explicit origins), express-rate-limit, express-mongo-sanitize, bcryptjs |
| Real-time | Socket.io for the live OPD queue (phase 8; polling fallback first) |
| Email | Nodemailer with Resend, Brevo, or Gmail SMTP (open decision) |
| Logging | Winston (production), optional Sentry |
| Frontend | React + Vite + TypeScript, Tailwind, React Router, TanStack Query, Axios, React Hook Form + Zod |
| Tests | Vitest + Supertest on a separate test database; Postman collection committed |
| Deploy | Vercel (frontend), Render or Railway (API), Atlas (database) |

**Version safety rule:** never copy version numbers from this document or memory into `package.json`. For every dependency, search for the latest stable release and security advisories, confirm with `npm show <pkg> version`, use `^` ranges, then run `npm audit`. State what was verified. Check every package name on npmjs.com before installing.

**Design system:** `design/ui-reference/clinical_prestige/DESIGN.md` (navy `#0B1F3A`, teal `#0E7C86`, blue-to-cyan gradient buttons, porcelain `#F4F7FA`, Plus Jakarta Sans, Inter, Newsreader italic for accents).

## 4. Repository structure

```
medconsults-crm/
  backend/
    src/ server.ts app.ts
      config/ env.ts db.ts
      middleware/ requireAuth.ts validate.ts roleGuard.ts errorHandler.ts
      modules/ auth users doctors patients leads appointments
               notes tasks activities notifications reports audit
               (each: routes, controller, service, model, schema)
      services/ email.service.ts cron.service.ts
      sockets/ index.ts
      utils/ jwt.ts ownershipCheck.ts tokenCompare.ts
    scripts/ seed.ts
    tests/
    postman/ collection.json environment.json
    .env.example
  frontend/
    src/ main.tsx App.tsx lib/ auth/ components/ features/ pages/
    .env.example
  design/ui-reference/  UI reference (read only)
  docs/ PROJECT_SPEC.md
  .gitignore  README.md
```

`.gitignore` must cover `node_modules/`, `.env`, `.env.*` (except `.env.example`), keys, `dist/`, `build/`, logs and coverage. Commit lockfiles. Never paste real secrets or connection strings into third-party tools or chat systems.

## 5. Environment variables

Backend (`.env`, validated by Zod at startup; the app crashes on bad config): `NODE_ENV`, `PORT`, `MONGODB_URI`, `MONGODB_URI_TEST`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (different, 64+ chars each), `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`, `CLIENT_URL`, `CORS_ORIGINS`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, optional `SENTRY_DSN`.

Frontend (`.env`, validated by Zod): `VITE_API_BASE_URL`.

Databases on one Atlas cluster: `medconsults_crm` (development) and `medconsults_crm_test` (tests only). Tests always use the test database.

## 6. Functional requirements

**Auth**

- Patient sign-up with email verification: link valid 15 minutes, resend allowed after 60 seconds.
- Login with generic error messages; lock the account for 15 minutes after 5 failed attempts.
- Refresh with rotation; reuse of an old refresh token revokes all sessions for that user.
- Forgot and reset password (token expires, single use). Logout clears cookie and stored token.
- Doctor sign-up creates a pending doctor; admin approves or blocks.

**Public site:** home, find doctors (search by specialty, name, availability today), doctor profile with slot picker, booking confirmation with digital OPD queue pass (token number and QR), contact/enquiry form that creates a lead. Demo login menu ("Try Demo") is kept for portfolio use.

**Patient portal:** dashboard (next appointment, OPD pass, verify-email banner), appointments (book, cancel, history), OPD passes, shared consultation notes, profile.

**Doctor portal:** today view with live queue (call in, mark done), appointments calendar (day, week, month), availability and online status, patient list, consultation notes (draft and finalise), profile.

**Reception (staff) portal:** overview, leads (kanban and list, add lead with WhatsApp opt-in checkbox stored as consent only), walk-in registration (issues the next token), appointments schedule with check-in, patients, Patient 360, tasks and follow-ups, reports (basic).

**Admin portal:** overview, doctor approvals, doctors management with online/offline status, users directory, all appointments, reports and analytics, settings and audit log, approval modals and toasts.

**Cross-cutting:** notifications centre (in-app, with email for verification, booking confirmation and reminders), loading skeletons and empty states on every dashboard, 404 and error pages, responsive layouts.

## 7. Data model (MongoDB collections)

All documents have `createdAt`, `updatedAt`. Primary resources use soft delete (`isDeleted`, `deletedAt`).

| Collection | Key fields | Indexes |
| --- | --- | --- |
| users | name, email, phone, passwordHash, role, emailVerified, status (active, pending, blocked), failedLogins, lockUntil, refreshTokenHashes[] | email (unique), role |
| doctors | userId, specialty, qualifications, registrationNo, experienceYears, languages, consultationFee, clinicRoom, bio, approvalStatus, isOnline, lastSeenAt, weeklyAvailability[], blockedDates[], slotMinutes | userId (unique), specialty, approvalStatus |
| patients | userId (optional), name, phone, email, dob, gender, source, assignedStaffId, status, whatsappOptIn, patientCode | phone, email, patientCode (unique), text index on name |
| leads | name, phone, email, interest, source (website, phone, walk_in, referral), stage, ownerId, patientId, lostReason | stage, ownerId, createdAt, phone |
| appointments | patientId, doctorId, start, end, status, tokenNumber, queueDate, reason, source, createdBy, fee, paymentStatus (pay_at_clinic, paid, waived) | unique (doctorId, start) for active, (doctorId, queueDate, tokenNumber) unique, patientId, status |
| notes | patientId, appointmentId, authorId, body, visibility (internal, shared, clinical), isDraft | patientId, appointmentId |
| tasks | title, description, patientId or leadId, assignedTo, dueDate, priority, status | assignedTo, dueDate, status |
| activities | entityType, entityId, type, actorId, meta, at | entityType + entityId + at |
| notifications | userId, type, title, message, read, link | userId + read |
| auditLogs | actorId, role, action, entityType, entityId, ip, at | at, actorId (TTL optional) |
| tokens | userId, type (verify, reset), tokenHash, expiresAt, usedAt | TTL on expiresAt |

## 8. API specification

Base path `/api/v1`. JSON only. Auth via `Authorization: Bearer <accessToken>`.

Success: `{ "success": true, "data": ... }`. Lists add `pagination: { total, page, limit, totalPages }` (`?page&limit`, default 20, max 100).

Error: `{ "success": false, "error": { "code", "message", "fields"? } }`.

Codes: VALIDATION_ERROR 400, INVALID_REQUEST 400, UNAUTHORIZED 401, TOKEN_EXPIRED 401, TOKEN_INVALID 401, REFRESH_TOKEN_INVALID 401, FORBIDDEN 403, NOT_FOUND 404 (also for another user's resource), CONFLICT 409, ACCOUNT_LOCKED 423, RATE_LIMIT_EXCEEDED 429, INTERNAL_ERROR 500.

Every controller checks ownership or role. Wrong-owner access returns 404, not 403. Roles: P patient, D doctor, S staff, A admin, Pub public.

| Endpoint | Who | Purpose |
| --- | --- | --- |
| GET /health, GET /ready | Pub | Liveness; readiness checks the DB |
| POST /auth/register | Pub | Patient sign-up, sends verification email |
| POST /auth/register-doctor | Pub | Pending doctor account |
| POST /auth/verify-email, /resend-verification | Pub | Verify, resend (60 s limit) |
| POST /auth/login, /refresh, /logout | Pub / any | Session handling |
| POST /auth/forgot-password, /reset-password | Pub | Password reset |
| GET /users/me, PATCH /users/me | any | Own profile |
| GET/POST /users, PATCH /users/:id, POST /users/:id/block | A | Directory and access control; staff accounts created here |
| GET /doctors, GET /doctors/:id | Pub | Search by specialty, name, availability |
| GET /doctors/:id/slots?date= | Pub | Free slots |
| PATCH /doctors/me, PUT /doctors/me/availability, PATCH /doctors/me/online | D | Own profile and availability |
| GET /doctors/admin/pending, POST /doctors/:id/approve, /block | A | Approvals |
| GET /patients, POST /patients, GET /patients/:id, PATCH /patients/:id | S, A | CRM patient records |
| GET /patients/:id/timeline | S, A, D (own) | Activity timeline |
| GET /patients/me | P | Own record |
| GET /leads, POST /leads, GET/PATCH /leads/:id | S, A | Lead CRUD |
| POST /leads/:id/stage, POST /leads/:id/convert | S, A | Move stage, convert to patient |
| POST /public/enquiries | Pub | Website form creates a lead (own rate limit) |
| POST /appointments | P, S, A | Book (checks slot) |
| GET /appointments | role-scoped | List with filters (date, doctor, status) |
| GET /appointments/:id | owner or role | Detail and OPD pass |
| PATCH /appointments/:id/reschedule, /cancel | P (own), S, A | Change or cancel |
| POST /appointments/:id/check-in, /start, /complete, /no-show | S, D | Queue status changes |
| POST /appointments/walk-in | S, A | Register patient and issue token |
| GET /queue/today?doctorId= | D, S, A | Live queue |
| GET/POST /notes, GET/PATCH /notes/:id | D (own patients), P (shared only) | Consultation notes |
| GET/POST /tasks, PATCH /tasks/:id, POST /tasks/:id/complete | S, A, D (own) | Tasks and follow-ups |
| GET /notifications, PATCH /notifications/:id/read, POST /notifications/read-all | any | In-app notifications |
| GET /reports/summary, /leads-by-source, /doctor-workload, /funnel, /no-shows | S (basic), A | Reports with date range |
| GET /reports/export.csv | A | CSV export |
| GET /audit-logs | A | Who viewed or changed what |

Each endpoint is documented with: purpose, auth, role, request, responses (200, 201, 400, 401, 403, 404, 409), Postman example, use case and business rules.

## 9. Business rules

- **Slots:** a doctor's slots come from weekly availability minus blocked dates minus booked slots. A unique index prevents double-booking; a conflict returns 409.
- **Token:** the OPD token is sequential per doctor per day, assigned at booking or walk-in, never reused.
- **Appointment status:** booked -> checked_in -> in_consultation -> completed. Also cancelled and no_show. Illegal jumps return 400. Every change writes an activity.
- **Cancellation:** patients cancel up to 2 hours before the slot (configurable).
- **Lead stages:** new, contacted, consultation_booked, consulted, follow_up, closed, lost. Each move writes an activity with the actor. Convert creates a patient and links it.
- **Doctor visibility:** only approved doctors appear in search. Online status shows when the last heartbeat is under 2 minutes old.
- **Notes:** `clinical` notes are visible only to the author doctor; `shared` also to the patient; `internal` to staff, admin and doctor.
- **Tasks:** an overdue task is one past its due date and not completed. Completing it writes an activity.
- **Consent:** WhatsApp opt-in is a stored boolean with timestamp. The system sends no WhatsApp or SMS messages.
- **Time:** store UTC; display in Asia/Kolkata.

## 10. Screens and routes

Reference folders are under `design/ui-reference/`. Recreate them as React components; do not copy the HTML.

| Area | Screens | Source folders |
| --- | --- | --- |
| Public | Home, find doctors, doctor profile, booking confirmed | one chosen home variant, find_doctors, dr._user_dr1_profile, booking_confirmed |
| Auth | Sign in, sign up, check email, verified | patient_sign_in, patient_sign_up, check_your_email, account_verified |
| Patient | Dashboard (normal, empty, loading, mobile) | patient_dashboard_* |
| Doctor | Dashboard (4 states, mobile), calendar | doctor_dashboard_*, doctor_appointments_calendar |
| Reception | Overview, leads kanban, leads list, add lead, walk-in modal, appointments, tasks, Patient 360 | medconsults_reception_*, add_new_lead_*, patient_360_* |
| Admin | Overview, doctors, users, approvals and toasts, reports, settings and audit log, loading and empty, mobile | medconsults_admin_* |

**Not designed yet (build from the design system):** doctor patients list, consultation notes, availability, notifications centre, forgot and reset password, 404 and error pages, public enquiry form, admin appointments (reuse the reception schedule with admin permissions).

Choose one home page variant and one patient dashboard variant before building the frontend.

## 11. Security and privacy requirements

- Secrets only in `.env`; never committed. Env validated with Zod at startup.
- Middleware order: request logging, helmet, cors (explicit list), body limit (10 kb), mongo-sanitize, global rate limit, stricter auth limit, routes, central error handler.
- bcrypt for passwords; SHA-256 for random tokens (refresh, verification, reset); `timingSafeEqual` for token comparison; access token kept in memory on the client, never localStorage.
- Zod on every route. Ownership or role check in every controller. Generic auth messages to prevent account enumeration.
- Soft delete on primary resources; TTL indexes on tokens and login attempts.
- Audit log for patient record views and changes, role changes, approvals and exports.
- No passwords, tokens or personal data in logs. Demo data is fictional.
- `npm audit` and lockfile installs (`npm ci`) in CI; typecheck and tests on every pull request.
- UI wording: no certification or compliance claims (HIPAA, DISHA, ABHA, MMC-certified). "Secure, role-based access" is the honest description.

## 12. Testing strategy

- Unit and API tests with Vitest + Supertest, always against `medconsults_crm_test`, cleaned between tests.
- For each endpoint test: success, validation error (400), no token (401), wrong role (403), not found or other user's resource (404), conflict (409) where relevant, rate limit (429) on auth routes.
- Critical flows: register -> verify -> login -> refresh -> logout; booking race for the same slot; lead -> patient -> appointment -> complete; doctor approval; note privacy per role.
- Postman collection mirrors the endpoint table with environment variables and test scripts.
- End-to-end pass with the demo accounts on every role before deploy.

## 13. Seed and demo data

`scripts/seed.ts` resets the development database and creates: admin, one staff (Pooja Sawant), 6 to 8 fictional doctors with different specialties, demo patient accounts, sample leads in each stage, appointments across statuses, tasks, notes and notifications. Demo logins (user, dr1, dr2, admin, staff) are documented in the README as development-only; passwords come from the seed script, never from production.

## 14. Build phases

| Phase | Scope | Exit check |
| --- | --- | --- |
| 0 | Repo, git, env, Atlas ready (done) | Both databases visible in Compass |
| 1 | Backend skeleton: config, db, app, health, tests | /health returns ok; test passes |
| 2 | Models and indexes | Models load; indexes created |
| 3 | Auth, roles, email verification, lockout | Auth tests pass |
| 4 | Doctors, patients, leads, appointments, queue | Module tests pass |
| 5 | Notes, tasks, activities, notifications, reports, audit | Tests pass; Postman collection runs |
| 6 | Frontend foundation: design tokens, layouts, auth, routing | Login works for all roles |
| 7 | Screens per role, wired to the API | Role flows work end to end |
| 8 | Live OPD queue (Socket.io), reminders (cron) | Queue updates without refresh |
| 9 | Cleanup pass, accessibility, SEO, privacy and terms pages | Cleanup list cleared |
| 10 | Deploy and final end-to-end test | Live demo works |

## 15. UI cleanup list (do in phase 9)

1. Remove sandbox and state-tester bars on sign-in, sign-up and check-email.
2. Remove false claims: MMC Compliant, DISHA, HIPAA, Tier-4 Encrypted, cryptographic tamper-evident, ABHA Linked.
3. Remove multi-city and regional text (Bangalore, Delhi, Pune, regional hubs, US-East).
4. Replace hardcoded numbers with database values.
5. Replace fake infrastructure metrics (latency, telemetry) with CRM numbers.
6. Remove tele-consultation mentions; the app is in-clinic only.
7. Hide clinical details from admin and staff views.
8. Replace placeholders: "Dr. user_dr1", inconsistent emails, fixed 24 Oct 2024 dates, mismatched doctors on mobile.
9. Remove unbuilt promises: SMS reminders, 2FA, "PRO" badges, global search, print roster, unless built.
10. Fix broken logo, clipped tabs and table columns, dead `#` links; replace external stock images with local files.

## 16. Assumptions and open decisions

- Open: final home page and patient dashboard variant. Email provider. Whether Google OAuth is added.
- Assumed: one clinic, in-clinic care only, pay at clinic, fake data only, India time zone and rupee amounts.
- Optional later: patient reviews, document uploads, printable OPD pass, dark mode.
